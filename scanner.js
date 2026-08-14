/*
 * PATGo Scan — scanner.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Carried across from PATGo v67 essentially unchanged. Four releases of field
 * fixes live in this file and the reasoning below is the reason it works. Read
 * it before changing anything here.
 *
 * THE WHOLE IDEA, in one paragraph. A HID barcode scanner is not a camera and
 * not an API — it pairs with the phone as a Bluetooth KEYBOARD, and when you
 * pull the trigger it TYPES the barcode, usually followed by Enter. So there is
 * no "scan" button to press and no permission to grant. All this file does is
 * listen to the keyboard at document level, notice when a burst of keystrokes
 * arrives far too fast to have come from a human thumb, and put the result in
 * the right box.
 *
 * WHY THE TIMING TEST IS THE WHOLE SAFETY MECHANISM. We cannot ask the browser
 * "was that a scanner?" — a wedge scanner is indistinguishable from a keyboard
 * by design. What we CAN measure is speed: a scanner emits characters roughly
 * 5–20ms apart, while even a very fast typist sits around 80–150ms. So the rule
 * is: every gap in the burst must be under the chosen threshold, and the burst
 * must be at least SCAN_MIN_LENGTH characters. One slow gap means a human
 * paused, and the buffer is discarded rather than treated as a scan.
 *
 * ⚠ WE DO NOT preventDefault THE CHARACTER KEYS — ONLY THE TERMINATOR.
 * That is deliberate, and it is the reason this can't break normal typing. At
 * the moment each character arrives we do not yet know whether the burst will
 * turn out to be a scan, so swallowing it would be a guess. Instead the
 * characters are allowed to land wherever they were going AND copied into our
 * buffer in parallel. Only once the terminator arrives (or the burst falls
 * silent) do we judge it — and if it was a scan we overwrite the target field
 * with the buffered text WHOLESALE, which cleans up whatever the characters did
 * on their way past. If it wasn't a scan we have done precisely nothing.
 *
 * ⚠ OVERWRITE, NEVER APPEND.
 *
 * ⚠ A REJECTED BURST MUST NOT BE SILENT. A failing scanner and an unpaired
 * scanner used to look identical from the outside — both are "nothing happens".
 * The settings test page logs rejections too, with the character count, the
 * slowest gap measured and the reason.
 *
 * ⚠ TRUE MODIFIERS SKIP, EVERYTHING ELSE RESETS. A scanner sending an uppercase
 * character emits a Shift keydown first, and treating that as "burst over"
 * destroyed any barcode containing capitals. True modifiers now pass through
 * without ending the burst. Any OTHER unreadable key must still drop the whole
 * burst — skipping a key that DID produce a character delivers a plausible
 * SHORT asset number, which is worse than no scan at all. Asymmetric on purpose.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NEW IN THIS APP
 * ---------------------------------------------------------------------------
 * PATGo had three scan targets and the target decided what the scan MEANT. Here
 * there is one target on the scan screen and the MODE decides: if the engineer
 * has armed the location bar the next scan is a location, otherwise it is an
 * asset. This file does not care which — it hands the text to routeScan() and
 * that owns the decision. Keeping the grammar out of here is deliberate: this
 * file's job is "was that a scanner, and what did it say", nothing more.
 */

// ---------------------------------------------------------------------------
// Burst buffer. Module-level `let` rather than state, because none of it is
// data — it is the last ~100ms of keyboard, and it must never be persisted,
// backed up, or survive a render.
// ---------------------------------------------------------------------------
let _scanChars = [];
let _scanGapMax = 0;
let _scanLastTs = 0;
let _scanTimer = null;
let _scanSwallowEnterUntil = 0;
let _scannerBound = false;

// ⚠ THE POISON WINDOW. When a burst is dropped because an unreadable key
// arrived part-way through, dropping the BUFFER is not enough — the scanner is
// still mid-transmission, and the characters that follow form a fresh burst of
// their own. 'AST2001' interrupted after 'AST' delivered '2001': four
// characters, machine-fast, indistinguishable from a real scan, and a
// plausible-looking asset number that is WRONG. That is exactly the failure the
// reset was written to prevent, and resetting the buffer alone did not prevent
// it. Found by harness group 05g; the same hole exists in PATGo v70 and should
// be ported back there.
//
// So a drop also refuses to collect anything further until the keyboard has
// been genuinely silent for SCAN_END_MS. A scanner never pauses that long
// mid-burst; a human always has by the time they type the next character.
let _scanPoisonUntil = 0;

// Keys a keyboard emits WITHOUT producing a character. Deliberately closed and
// short — see the ⚠ note at the reset in handleScannerKeydown.
const SCAN_MODIFIER_KEYS = {
  Shift: 1, Control: 1, Alt: 1, Meta: 1, AltGraph: 1,
  CapsLock: 1, NumLock: 1, ScrollLock: 1, Symbol: 1, SymbolLock: 1,
};

function _scanReset() {
  _scanChars = [];
  _scanGapMax = 0;
  _scanLastTs = 0;
  if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null; }
}

// Resolved at judgement time rather than read once, so changing the preset on
// the settings page takes effect on the very next scan. Anything unrecognised
// falls back to the default — an undefined threshold here would make every
// comparison false and reject every burst forever, which is precisely the
// silent failure this design exists to remove.
function scanMaxGapMs() {
  const preset = SCAN_GAP_PRESETS[state.scanSpeed];
  return typeof preset === 'number' ? preset : SCAN_GAP_PRESETS[SCAN_SPEED_DEFAULT];
}

// Judge the buffer AND say why. Returns null when there is nothing to judge at
// all, which is different from a rejection and must not be logged as one.
function _scanVerdict() {
  const n = _scanChars.length;
  const gap = _scanGapMax;
  const limit = scanMaxGapMs();
  if (n === 0) return null;
  if (n < SCAN_MIN_LENGTH) {
    return { ok: false, n: n, gap: gap, limit: limit,
             why: 'too short — ' + n + ' character' + (n === 1 ? '' : 's') + ', minimum ' + SCAN_MIN_LENGTH };
  }
  if (n > SCAN_MAX_LENGTH) {
    return { ok: false, n: n, gap: gap, limit: limit,
             why: 'too long — ' + n + ' characters, maximum ' + SCAN_MAX_LENGTH };
  }
  if (gap > limit) {
    return { ok: false, n: n, gap: gap, limit: limit,
             why: 'too slow — ' + gap + 'ms between characters, limit ' + limit + 'ms' };
  }
  return { ok: true, n: n, gap: gap, limit: limit, why: '' };
}

function _scanLooksLikeScan() {
  const v = _scanVerdict();
  return !!(v && v.ok);
}

// ---------------------------------------------------------------------------
// Where would a scan go right now? Returns {kind, el} or null. Null means "not
// interested" — the buffer is dropped and the keystroke is left completely
// alone.
// ---------------------------------------------------------------------------
function _scanTarget() {
  if (!state.scannerEnabled) return null;

  // Any full-screen interruption wins. A scan while the welcome panel is up
  // would write into a field the engineer cannot even see.
  if (!state.welcomeSeen) return null;

  // ⚠ ANY open sheet blocks. In initial mode a scan OPENS a sheet to collect
  // the description — so the next trigger pull, before that sheet is finished,
  // must do nothing at all rather than start a second item behind the first.
  if (sheetIsOpen()) return null;

  let el = null;
  let kind = '';

  if (state.view === 'scan') {
    el = document.getElementById('scan-input');
    kind = 'scan';
  } else if (state.view === 'log') {
    el = document.getElementById('log-search');
    kind = 'search';
  } else if (state.view === 'settingsScanner') {
    el = document.getElementById('scanner-test');
    kind = 'test';
  }
  if (!el) return null;

  // THE FOCUS RULE. If the cursor is sitting in some OTHER text field we bail
  // out entirely and let the characters type into it as they normally would.
  // Hijacking a field the engineer deliberately focused would be worse than the
  // occasional barcode landing in the wrong box, which is visible and one
  // clear-and-retype to fix. Focus in our OWN target is fine — we still take
  // over, so behaviour is identical whether or not they tapped the box first.
  const ae = document.activeElement;
  if (ae && ae !== el) {
    const tag = ae.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) {
      return null;
    }
  }
  return { kind: kind, el: el };
}

// ---------------------------------------------------------------------------
// The listener. Capture phase on document, bound ONCE at boot, so it survives
// every innerHTML rewrite and never needs rebinding after a render.
// ---------------------------------------------------------------------------
function handleScannerKeydown(e) {
  if (!e) return;
  // Auto-repeat from a held key produces machine-speed timings and would sail
  // through the speed test. It is the one non-scanner source of a fast burst,
  // so it is excluded explicitly.
  if (e.repeat) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const ctx = _scanTarget();
  if (!ctx) { _scanReset(); return; }

  const key = e.key;
  const now = Date.now();

  // --- Terminator. Most scanners send Enter; some are configured for Tab. ---
  if (key === 'Enter' || key === 'Tab') {
    const verdict = _scanVerdict();
    const text = _scanChars.join('');
    _scanReset();
    _scanLogBurst(ctx, text, verdict);
    if (verdict && verdict.ok) {
      // preventDefault only — NOT stopPropagation. Other Enter handlers (the
      // name sheet in feedback.js) live in contexts we have already declined
      // above, and blocking them here would be a bug waiting to happen.
      e.preventDefault();
      // A scanner set to CR+LF sends two Enters; without this window the second
      // escapes and acts on whatever is underneath.
      _scanSwallowEnterUntil = now + SCAN_DOUBLE_TERMINATOR_MS;
      applyScan(ctx, text);
    } else if (now < _scanSwallowEnterUntil) {
      e.preventDefault();
      _scanSwallowEnterUntil = 0;
    } else {
      _scanSwallowEnterUntil = 0;
    }
    return;
  }

  // --- Modifiers: skipped WITHOUT touching the buffer or the timing. They are
  // not part of the burst and they do not end it. ---
  if (SCAN_MODIFIER_KEYS[key]) return;

  // --- Anything that isn't a single printable character ends the burst.
  //
  // ⚠ THIS STAYS A RESET, NOT A SKIP. It is tempting to ignore unreadable keys
  // the way we ignore modifiers, but the failure modes are not symmetrical.
  // Skipping a key that DID produce a character would leave that character out
  // of the buffer, and we would then deliver a SHORT asset number —
  // plausible-looking and wrong, into the client's system. Dropping the whole
  // burst is visible and harmless by comparison. ---
  if (typeof key !== 'string' || key.length !== 1) {
    // Log it before dropping it. A suffix that is neither Enter nor Tab
    // (F-keys, Escape, a keypad Enter reported under another name) discards a
    // perfectly good burst, and it is the failure a misconfigured scanner is
    // most likely to hit. Named separately from the speed and length reasons
    // because it sends the engineer somewhere different — to the scanner's
    // suffix setting, not to the app's.
    const v = _scanVerdict();
    if (v) {
      v.ok = false;
      v.why = 'ended by an unexpected key (' + key + ') — check the scanner\'s prefix/suffix setting';
      _scanLogBurst(ctx, _scanChars.join(''), v);
    }
    _scanReset();
    // Refuse the REST of this transmission too — see the poison window note at
    // the top of the file. Without this, the tail of the barcode arrives as a
    // short, fast, entirely plausible scan of its own.
    _scanPoisonUntil = now + SCAN_END_MS;
    return;
  }

  // Still inside a poisoned window: this character belongs to a transmission we
  // have already decided to discard. Push the window forward and drop it. The
  // window only clears once the keyboard has actually fallen silent.
  if (now < _scanPoisonUntil) {
    _scanPoisonUntil = now + SCAN_END_MS;
    return;
  }

  if (_scanChars.length) {
    const gap = now - _scanLastTs;
    if (gap > SCAN_END_MS) {
      // Long enough that this is the start of something new, not a continuation.
      _scanChars = [];
      _scanGapMax = 0;
    } else if (gap > _scanGapMax) {
      _scanGapMax = gap;
    }
  }
  _scanChars.push(key);
  _scanLastTs = now;

  if (_scanTimer) clearTimeout(_scanTimer);
  _scanTimer = setTimeout(_scanTimeoutCommit, SCAN_END_MS);
}

// Fallback for a scanner configured with NO suffix at all: the burst simply
// stops. If what we have passes the same speed test, treat the silence as the
// terminator. The swallow window then eats a late Enter, so a scanner that is
// merely slow to send its suffix can't double-fire.
function _scanTimeoutCommit() {
  _scanTimer = null;
  const verdict = _scanVerdict();
  const text = _scanChars.join('');
  _scanChars = [];
  _scanGapMax = 0;
  _scanLastTs = 0;
  // The target is resolved BEFORE the accept/reject branch, because a rejected
  // burst still has to be logged on the test page.
  const ctx = _scanTarget();
  if (!ctx) return;
  _scanLogBurst(ctx, text, verdict);
  if (!verdict || !verdict.ok) return;
  _scanSwallowEnterUntil = Date.now() + SCAN_DOUBLE_TERMINATOR_MS;
  applyScan(ctx, text);
}

// ---------------------------------------------------------------------------
// The diagnostic log. ONLY on the settings test page (ctx.kind 'test').
//
// Why not everywhere: on the scan screen a human typing an asset number by hand
// produces a rejected burst on every pause, so logging globally would fill the
// list with the engineer's own thumbs and bury the one entry that matters.
// ---------------------------------------------------------------------------
function _scanLogBurst(ctx, text, verdict) {
  if (!ctx || ctx.kind !== 'test' || !verdict) return;
  if (!Array.isArray(state.scannerTestLog)) state.scannerTestLog = [];
  state.scannerTestLog.unshift({
    text: String(text == null ? '' : text),
    len: verdict.n,
    gap: verdict.gap,
    ok: !!verdict.ok,
    why: verdict.why,
    at: _scanClock(),
  });
  state.scannerTestLog = state.scannerTestLog.slice(0, SCANNER_TEST_LOG_MAX);
  const log = document.getElementById('scanner-test-log');
  if (log) log.innerHTML = renderScannerTestLogHTML();
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
function applyScan(ctx, raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text || !ctx || !ctx.el) return;
  try {
    if (ctx.kind === 'scan') _scanIntoScanScreen(ctx.el, text);
    else if (ctx.kind === 'search') _scanIntoSearch(ctx.el, text);
    else if (ctx.kind === 'test') _scanIntoTest(ctx.el, text);
  } catch (err) {
    // A scan must never be able to take the app down. Worst case the number
    // doesn't appear and the engineer types it.
    console.error('Scan handling failed (non-fatal).', err);
  }
}

// The scan screen. The box is shown so the engineer can see what arrived and
// correct it by hand if the label is damaged; the grammar (location or asset,
// audit or initial) belongs to routeScan() in dispatch.js.
function _scanIntoScanScreen(el, text) {
  el.value = text;
  _scanFlash(el);
  if (typeof routeScan === 'function') routeScan(text);
}

function _scanIntoSearch(el, text) {
  state.logSearch = text;
  el.value = text;
  _scanFlash(el);
  if (typeof refreshLogListOnly === 'function') refreshLogListOnly();
}

// The settings test box — the answer to "is my scanner actually working?".
// This no longer writes the log; _scanLogBurst() owns it and has already run,
// because it also records the bursts that never reach this function at all.
function _scanIntoTest(el, text) {
  el.value = text;
  _scanFlash(el);
}

function _scanClock() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

// The test log markup lives here rather than in render.js because the data is
// this file's, and _scanLogBurst repaints it directly without a render.
function renderScannerTestLogHTML() {
  const rows = Array.isArray(state.scannerTestLog) ? state.scannerTestLog : [];
  if (!rows.length) {
    return '<p class="muted">Nothing scanned yet. Pull the trigger on your scanner with this page open — what it sends will appear here, whether or not the app accepted it.</p>';
  }
  return rows.map(r => {
    const ok = r.ok !== false;
    const gap = (typeof r.gap === 'number' && r.gap > 0) ? ' · slowest gap ' + r.gap + 'ms' : '';
    const reason = ok ? '' :
      `<span class="scanner-log-reason">Not treated as a scan: ${escapeHTML(r.why || 'burst rejected')}</span>`;
    return `
    <div class="scanner-log-row${ok ? '' : ' is-rejected'}">
      <span class="scanner-log-text">${escapeHTML(r.text)}</span>
      <span class="scanner-log-meta">${ok ? 'Accepted' : 'Rejected'} · ${r.len} char${r.len === 1 ? '' : 's'}${gap} · ${escapeHTML(r.at)}</span>
      ${reason}
    </div>`;
  }).join('');
}

// A brief glow so a scan is visibly acknowledged. Deliberately not a toast:
// several hundred toasts on a day's work would be noise, and the scanner has
// its own beeper anyway. Toasts are reserved for things that need reading.
function _scanFlash(el) {
  if (!el || !el.classList) return;
  el.classList.remove('scan-flash');
  void el.offsetWidth;   // forced reflow — restarts the animation on a re-scan
  el.classList.add('scan-flash');
  setTimeout(() => { try { el.classList.remove('scan-flash'); } catch (e) {} }, 700);
}

// ---------------------------------------------------------------------------
// Bound ONCE from boot.js, typeof-guarded and wrapped there, so a missing or
// broken scanner.js can never stop the app starting.
// ---------------------------------------------------------------------------
function initScanner() {
  if (_scannerBound) return;
  _scannerBound = true;
  document.addEventListener('keydown', handleScannerKeydown, true);
}

// ---------------------------------------------------------------------------
// PAIRED MODE: put the cursor in the scan box so a scan needs no tap.
//
// ⚠ GATED ON state.scannerPaired, NOT state.scannerEnabled. Scanning is on by
// default for everybody. Focusing a field by itself is only ever right when a
// hardware keyboard is attached; for a phone with no scanner it would mean a
// focused box, and on some devices an on-screen keyboard, on every screen.
//
// ⚠ select() AND NOT JUST focus(). Belt and braces. If a burst is somehow not
// recognised as a scan, the characters type in by hand — and with the existing
// value selected the first one REPLACES it instead of appending. That is the
// difference between a wrong asset number in the client's system and a right
// one, on the exact failure this guards against.
//
// The on-screen keyboard is kept down by inputmode="none" on the field itself
// (render.js) — iOS decides that at focus time from the attribute, so it must
// already be on the element.
// ---------------------------------------------------------------------------
function focusScanInput() {
  if (!state.scannerEnabled || !state.scannerPaired) return;
  if (state.view !== 'scan') return;
  let ctx = null;
  try { ctx = _scanTarget(); } catch (e) { return; }
  if (!ctx || ctx.kind !== 'scan' || !ctx.el) return;
  const el = ctx.el;
  try {
    // preventScroll matters: without it, focusing a field jerks the page.
    // Older engines ignore the option object entirely, hence the fallback.
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    el.select();
  } catch (err) {
    try { el.focus(); el.select(); } catch (e2) {}
  }
}
