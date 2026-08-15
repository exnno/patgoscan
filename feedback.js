/*
 * PATGo Scan — feedback.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Toasts, the shared bottom-sheet dialogs, and the three feedback channels
 * (vibrate, colour flash, sound).
 *
 * ⚠ prompt(), confirm() and alert() ARE BANNED. They are unreliable inside an
 * iOS PWA — they can be suppressed entirely by the OS, and when they are, the
 * app appears to do nothing. Every yes/no in this app routes through
 * openConfirmSheet() below.
 *
 * These sheets build their own DOM and tear it down again. They do NOT go
 * through render(), and they hold no state — which is what makes them safe to
 * call from anywhere, including from inside an error handler.
 */

let _toastTimer = null;

function showToast(message) {
  const msg = String(message == null ? '' : message);
  if (!msg) return;
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('is-visible');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    try { el.classList.remove('is-visible'); } catch (e) {}
  }, 2600);
}

// ---------------------------------------------------------------------------
// Bottom sheets
//
// One builder, three wrappers. The sheet is appended to <body>, not to #app, so
// a render() cannot tear it out from under the engineer's finger.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// V3 — THE KEYBOARD FIX. Read this before touching anything below.
//
// THE BUG. A sheet is position:fixed against the LAYOUT viewport, and iOS does
// not shrink the layout viewport when the on-screen keyboard appears — it only
// shrinks the VISUAL one. So the moment a sheet focused a field, the bottom of
// that sheet (its buttons included) sat underneath the keyboard. iOS then tried
// to rescue the focused field by scrolling the document, which dragged the
// fixed overlay across the screen, and the sheet's own overflow scrolled at the
// same time. Two scrollers and an offset overlay is what "it jumps around"
// actually was. It hit exactly the two sheets that raise the keyboard
// themselves — new location and type-a-barcode — and spared the new item sheet
// only because that one deliberately does not focus when a Quick Pick grid is
// present. Same bug, untriggered.
//
// THE FIX, in three parts, and all three are needed:
//   1. The backdrop is sized to `window.visualViewport` — the area actually
//      visible above the keyboard — and re-synced whenever that changes. The
//      sheet then sits ON the keyboard rather than behind it.
//   2. Every field the sheets focus goes through focusSheetField(), which
//      passes `preventScroll`. See the note there.
//   3. `overscroll-behavior: contain` on the sheet (styles.css) so a drag that
//      runs out of sheet does not hand itself to the page underneath.
//
// ⚠ NO BODY SCROLL LOCK, DELIBERATELY. The obvious fourth part — freezing the
// page while a sheet is open — is the same family of trick as the 100dvh +
// overflow:hidden layout this app banned after it trapped content behind the
// keyboard. Parts 1–3 solve it without touching the page.
//
// ⚠ FAILS SOFT. No visualViewport (old engine, or the harness) means the styles
// are never written and CSS `inset: 0` stands, which is exactly the V2
// behaviour. Nothing here may become load-bearing for a sheet OPENING.
// ---------------------------------------------------------------------------

let _sheetViewportHandler = null;

function _visualViewport() {
  try {
    return (typeof window !== 'undefined' && window.visualViewport) ? window.visualViewport : null;
  } catch (e) { return null; }
}

// Pins the backdrop to the visible rectangle. Called on open and on every
// viewport change, because the keyboard can appear, resize (predictive text
// bar, autocomplete strip) and disappear while one sheet stays open.
function _syncSheetViewport() {
  const wrap = document.getElementById('sheet-backdrop');
  const vv = _visualViewport();
  if (!wrap || !vv) return;
  wrap.style.top = vv.offsetTop + 'px';
  wrap.style.left = vv.offsetLeft + 'px';
  wrap.style.width = vv.width + 'px';
  wrap.style.height = vv.height + 'px';
  // ⚠ `bottom` MUST be released. It is set by `inset: 0` in the stylesheet, and
  // a fixed box with both top and bottom pinned ignores the height set here —
  // the sheet would stay full-screen and the whole fix would silently do
  // nothing while looking correct in the source.
  wrap.style.bottom = 'auto';
  wrap.style.right = 'auto';

  // V4. iOS never tells you the keyboard is up; the only evidence is the visual
  // viewport being much shorter than the layout one, which is the same
  // discrepancy the whole fix above is built on. The threshold is deliberately
  // well clear of the 60–100px a collapsing URL bar accounts for — a false
  // positive here only removes a strip of padding, but a threshold small enough
  // to trip on a scroll would have it flickering on and off under the finger.
  let short = false;
  try {
    short = (typeof window.innerHeight === 'number') && (window.innerHeight - vv.height > 120);
  } catch (e) { short = false; }
  wrap.classList.toggle('is-keyboard', short);
}

function _bindSheetViewport() {
  const vv = _visualViewport();
  if (!vv || _sheetViewportHandler) return;
  _sheetViewportHandler = () => { try { _syncSheetViewport(); } catch (e) {} };
  vv.addEventListener('resize', _sheetViewportHandler);
  vv.addEventListener('scroll', _sheetViewportHandler);
}

function _unbindSheetViewport() {
  const vv = _visualViewport();
  if (vv && _sheetViewportHandler) {
    try {
      vv.removeEventListener('resize', _sheetViewportHandler);
      vv.removeEventListener('scroll', _sheetViewportHandler);
    } catch (e) {}
  }
  _sheetViewportHandler = null;
}

// ⚠ THE ONLY WAY A SHEET MAY FOCUS A FIELD. `preventScroll` is what stops the
// browser scrolling the document to reveal the field — the jerk that
// focusScanInput() in scanner.js has guarded against since V1, which the sheets
// never inherited. The fallback matters: an engine that does not understand the
// options object ignores it silently in some versions and throws in others.
function focusSheetField(el, andSelect) {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
    if (andSelect && typeof el.select === 'function') el.select();
  } catch (err) {
    try {
      el.focus();
      if (andSelect && typeof el.select === 'function') el.select();
    } catch (e2) {}
  }
}

function _openSheet(ariaLabel) {
  _closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.id = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'bulk-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', ariaLabel || 'Dialog');
  wrap.appendChild(sheet);
  document.body.appendChild(wrap);
  _syncSheetViewport();
  _bindSheetViewport();
  return sheet;
}

function _closeSheet() {
  // ⚠ Unbind FIRST and unconditionally. _openSheet() closes any previous sheet
  // before opening, so a listener left bound here would be re-bound on the next
  // open and accumulate one per sheet for the life of the page.
  _unbindSheetViewport();
  const old = document.getElementById('sheet-backdrop');
  if (old && old.parentNode) old.parentNode.removeChild(old);
}

function closeSheet() { _closeSheet(); }

function sheetIsOpen() {
  return !!document.getElementById('sheet-backdrop');
}

function openConfirmSheet(opts) {
  const o = opts || {};
  const sheet = _openSheet(o.title || 'Confirm');
  sheet.innerHTML = `
    <h3 class="sheet-title">${escapeHTML(o.title || 'Are you sure?')}</h3>
    ${o.body ? `<p class="sheet-body">${escapeHTML(o.body)}</p>` : ''}
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="sheet-cancel">${escapeHTML(o.cancelLabel || 'Cancel')}</button>
      <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" id="sheet-ok">${escapeHTML(o.confirmLabel || 'Confirm')}</button>
    </div>`;
  sheet.querySelector('#sheet-cancel').onclick = () => {
    _closeSheet();
    if (typeof o.onCancel === 'function') o.onCancel();
  };
  sheet.querySelector('#sheet-ok').onclick = () => {
    _closeSheet();
    if (typeof o.onConfirm === 'function') o.onConfirm();
  };
}

function openInfoSheet(opts) {
  const o = opts || {};
  const sheet = _openSheet(o.title || 'Information');
  sheet.innerHTML = `
    <h3 class="sheet-title">${escapeHTML(o.title || '')}</h3>
    <div class="sheet-body">${o.html || escapeHTML(o.body || '')}</div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary" id="sheet-ok">${escapeHTML(o.okLabel || 'Close')}</button>
    </div>`;
  sheet.querySelector('#sheet-ok').onclick = () => {
    _closeSheet();
    if (typeof o.onClose === 'function') o.onClose();
  };
}

// A single free-text field. Used for renaming a fail reason and for the
// engineer name — not for anything on the scan path, which has its own sheets.
function openNameSheet(opts) {
  const o = opts || {};
  const sheet = _openSheet(o.title || 'Enter a value');
  sheet.innerHTML = `
    <h3 class="sheet-title">${escapeHTML(o.title || '')}</h3>
    ${o.body ? `<p class="sheet-body">${escapeHTML(o.body)}</p>` : ''}
    <input type="text" id="sheet-input" class="field" value="${escapeHTML(o.value || '')}"
           placeholder="${escapeHTML(o.placeholder || '')}" autocomplete="off"
           autocapitalize="words" spellcheck="false">
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="sheet-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="sheet-ok">${escapeHTML(o.confirmLabel || 'Save')}</button>
    </div>`;
  const input = sheet.querySelector('#sheet-input');
  const commit = () => {
    const v = input ? input.value : '';
    _closeSheet();
    if (typeof o.onConfirm === 'function') o.onConfirm(v);
  };
  sheet.querySelector('#sheet-cancel').onclick = () => {
    _closeSheet();
    if (typeof o.onCancel === 'function') o.onCancel();
  };
  sheet.querySelector('#sheet-ok').onclick = commit;
  if (input) {
    // Enter commits. ⚠ The scanner swallows its own terminator before this ever
    // sees it (scanner.js preventDefaults on a confirmed scan), so a barcode
    // arriving in this box cannot fire the button by accident.
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } };
    setTimeout(() => focusSheetField(input, true), 60);
  }
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

// ⚠ iOS gives a PWA NO programmatic haptics. navigator.vibrate does not exist
// there and no workaround remains — the last one closed in iOS 26.5. This is
// permanent, it is not a bug, and it must not be "fixed" in a later release.
// Android honours it, so the code stays.
function haptic(count) {
  if (!state.haptic) return;
  if (!navigator || typeof navigator.vibrate !== 'function') return;
  const n = clampInt(count, 1, 3, 1);
  const pattern = [];
  for (let i = 0; i < n; i++) {
    if (i) pattern.push(70);
    pattern.push(35);
  }
  try { navigator.vibrate(pattern); } catch (e) {}
}

let _audioCtx = null;
function _getAudioCtx() {
  if (_audioCtx) return _audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _audioCtx = new AC();
  } catch (e) { return null; }
  return _audioCtx;
}

function playSound(kind) {
  if (!state.sound) return;
  const ctx = _getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const freqs = kind === 'fail' ? [420, 300] : [780];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.13 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.13 + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.13);
      osc.stop(now + i * 0.13 + 0.13);
    });
  } catch (e) {}
}

const FLASH_MS = 340;

// ⚠ INLINE STYLES AND A FORCED REFLOW, NOT A CSS CLASS WITH VARIABLE COLOURS.
// CSS-variable @keyframes on a freshly inserted position:fixed node silently do
// nothing on iOS. This shape — literal colour, forced reflow, next-frame RAF —
// is the one that works, and it was arrived at the hard way.
function flashScreen(kind) {
  let el = document.getElementById('flash-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash-overlay';
    document.body.appendChild(el);
  }
  const colour = kind === 'fail' ? 'rgba(220,38,38,0.55)' : 'rgba(22,163,74,0.5)';
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;' +
    'background:' + colour + ';opacity:0;transition:opacity ' + FLASH_MS + 'ms ease;';
  void el.offsetWidth;   // forced reflow — restarts it on a rapid second flash
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    setTimeout(() => { try { el.style.opacity = '0'; } catch (e) {} }, 90);
  });
  setTimeout(() => { try { el.style.opacity = '0'; } catch (e) {} }, FLASH_MS + 120);
}

// The one call site the scan loop uses. Pass or fail, all three channels.
function feedback(kind) {
  try { flashScreen(kind); } catch (e) {}
  try { haptic(kind === 'fail' ? 3 : 1); } catch (e) {}
  try { playSound(kind); } catch (e) {}
}
