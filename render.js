/*
 * PATGo Scan — render.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Every screen in the app, plus the sheets and the welcome modal.
 *
 * ⚠ render() IS SYNCHRONOUS AND REBUILDS #app.innerHTML WHOLESALE. Never make
 * it async. Anything it needs must already be in `state` by the time it runs.
 *
 * ⚠ THE NO-RENDER RULE. A sheet CONTAINING INPUTS must never call render()
 * while it is open — a rebuild tears down the focused field and drops the
 * keyboard mid-word. That is why the sheets in this file build their own DOM
 * into <body> (via _openSheet in feedback.js) and are NOT part of render()'s
 * output at all. They mutate themselves in place and only render() on close.
 *
 * ⚠ ALL CLICKS ARE DELEGATED (dispatch.js). Markup here carries data-action /
 * data-arg attributes and NOTHING here attaches an onclick — a listener bound
 * to a node that innerHTML is about to replace is a leak and a dead button.
 * The sheets are the deliberate exception: they live outside #app, so their
 * handlers are safe and are bound directly.
 */

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Navigation
//
// ⚠ EVERY TRANSIENT IS CLEARED HERE. A sheet flag that survives navigation
// reopens a sheet on a screen that knows nothing about it. If you add a
// transient to state.js, add it here too.
// ---------------------------------------------------------------------------
function setView(v) {
  // V7. ⚠ NAVIGATING AWAY FROM THE REVIEW ABANDONS IT, and that is the safe
  // direction. Nothing in `state.review` has been written anywhere yet — the
  // incoming records are still only in memory — so dropping it loses no data,
  // whereas carrying a half-answered set of choices onto another screen and
  // committing it later would apply decisions the engineer had walked away
  // from. They still have the file; they can import it again.
  if (v !== 'review') state.review = null;
  state.view = v;
  state.locationArmed = false;
  // V9. ⚠ A MOVE ARM MUST NOT SURVIVE NAVIGATION. It only has a meaning on the
  // log screen, where the banner says what it is waiting for; carried anywhere
  // else it is an invisible arm that changes what the NEXT barcode does. That
  // is the worst shape a bug can take in this app — a scan that goes somewhere
  // the engineer did not ask for, with nothing on screen to have warned them.
  state.moveArmed = '';
  // V12. ⚠ SELECT MODE DIES WITH THE SCREEN, for the same reason the move arm
  // does: while it is on, tapping a row TICKS it rather than opening it, and a
  // mode that changes what a tap means must not outlive the bar that explains
  // it. Carried away and back, an engineer would return to a log where the
  // correction path silently no longer opens anything.
  //
  // ⚠ state.lastRun IS NOT CLEARED HERE, AND THAT IS DELIBERATE — see the note
  // on it in state.js. Commit a run, tap Log to check it landed, come back: on
  // that trip the receipt is the whole point, and clearing here would take it
  // away on exactly the journey that finds the mistake.
  state.logSelect = null;
  closeSheet();
  render();
}

function applyTheme() {
  const t = state.theme;
  const dark = t === 'dark' ||
    (t === 'auto' && window.matchMedia &&
     window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------
function render() {
  if (!app) return;

  if (!state.welcomeSeen) {
    app.innerHTML = renderWelcome();
    state._lastRenderedView = 'welcome';
    return;
  }

  let html = '';
  switch (state.view) {
    case 'log':             html = renderLog(); break;
    case 'settings':        html = renderSettings(); break;
    case 'settingsScanner': html = renderSettingsScanner(); break;
    case 'settingsLists':   html = renderSettingsLists(); break;
    case 'settingsBackup':  html = renderSettingsBackup(); break;
    case 'sessions':        html = renderSessions(); break;
    case 'review':          html = renderReview(); break;
    case 'about':           html = renderAbout(); break;
    default:                html = renderScan(); break;
  }
  app.innerHTML = html;

  // Scroll to the top only when the SCREEN changed, not on every repaint — a
  // repaint after logging an item must leave the engineer where they were.
  if (state._lastRenderedView !== state.view) {
    try { window.scrollTo(0, 0); } catch (e) {}
    state._lastRenderedView = state.view;
  }

  // Paired mode. Called after every paint of the scan screen, because dropping
  // focus is what "the scan after a PASS goes nowhere" actually was.
  if (typeof focusScanInput === 'function') {
    try { focusScanInput(); } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------
function renderHeader(title, backAction) {
  return `
  <header class="hdr">
    ${backAction
      ? `<button type="button" class="hdr-btn" data-action="${backAction}" aria-label="Back">‹</button>`
      : `<span class="hdr-mark" aria-hidden="true"></span>`}
    <h1 class="hdr-title">${escapeHTML(title)}</h1>
    ${backAction ? '<span class="hdr-btn is-spacer"></span>' : ''}
  </header>`;
}

function renderNav(active) {
  const tab = (id, label, view) => `
    <button type="button" class="nav-tab${active === view ? ' is-active' : ''}"
            data-action="go" data-arg="${view}">${escapeHTML(label)}</button>`;
  const pending = unexportedCount();
  return `
  <nav class="nav">
    ${tab('scan', 'Scan', 'scan')}
    ${tab('log', 'Log' + (pending ? ' (' + pending + ')' : ''), 'log')}
    ${tab('settings', 'Settings', 'settings')}
  </nav>`;
}

// V5 — the two persistent toggles, on their own rows beneath the location bar
// (decision 8). They apply in BOTH modes, which is why they sit below the
// location bar rather than inside the mode switch: they are not a property of
// audit or of initial, they are a property of the next scan either way.
//
// ⚠ THEY MUST NOT OUT-SHOUT THE MODE SWITCH. The mode switch is the single most
// important control on this screen and Initial tints the whole background for
// that reason — a second full-strength control beside it gives two "which one
// am I in?" questions and an instant answer to neither. So these are smaller,
// carry their own label, and only the non-default position colours in.
//
// ⚠ VISUAL COLOURS IN, TEST DOES NOT — and not for symmetry's sake. Test is the
// default and the safe position; Visual is the one that changes what the client
// receives and the one an engineer can leave switched on by accident after a
// single item. The asymmetry IS the safety feature. Do not "tidy" it by giving
// Test a colour of its own.
function renderScanToggles() {
  const cls = state.itemClass;
  const vis = state.visualMode === true;
  const opt = (action, arg, on, label, extra) =>
    `<button type="button" class="tog-opt${on ? ' is-on' : ''}${extra || ''}"
             data-action="${action}" data-arg="${arg}"
             aria-pressed="${on ? 'true' : 'false'}">${escapeHTML(label)}</button>`;

  // ⚠ V7 — THE TWO ROWS SHARE ONE GRID. They used to be independent flex rows
  // with a fixed 74px label column, and "INSPECTION" is wider than 74px at this
  // size — a flex item will not shrink below its own unbroken word, so that row
  // quietly stole about twelve pixels and its switch came out narrower than the
  // one above it. Sharing a grid makes the label column exactly as wide as the
  // longest label and both switches identical BY CONSTRUCTION, which is the
  // reason to do it this way rather than by widening the fixed value: it stays
  // true if a label is ever reworded. Do not put these rows back in their own
  // containers. Test 14n, mutation M148.
  return `
  <div class="toggrid">
  <div class="togrow">
    <span class="tog-label">Class</span>
    <div class="togswitch" role="group" aria-label="Item class">
      ${CLASS_OPTIONS.map(c => opt('setClass', c, cls === c, 'Class ' + c, '')).join('')}
    </div>
  </div>
  <div class="togrow${vis ? ' is-visual' : ''}">
    <span class="tog-label">Inspection</span>
    <div class="togswitch" role="group" aria-label="Inspection type">
      ${opt('setVisual', 'test', !vis, 'Test', '')}
      ${opt('setVisual', 'visual', vis, 'Visual', ' is-warn')}
    </div>
  </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// THE SCAN SCREEN — the only screen that matters on a working day
// ---------------------------------------------------------------------------
function renderScan() {
  const initial = state.mode === MODE_INITIAL;
  const loc = currentLocation();
  const counts = todayCounts();
  const pending = state.pending;

  // The location bar. Three states: armed and waiting, set, or not yet set.
  let locBar;
  if (state.locationArmed) {
    locBar = `
    <div class="locbar is-armed" data-action="cancelLocation">
      <span class="locbar-label">Scan a location barcode now</span>
      <span class="locbar-hint">Tap to cancel</span>
    </div>`;
  } else if (loc) {
    locBar = `
    <div class="locbar is-set" data-action="armLocation">
      <span class="locbar-label">${escapeHTML(locationLabel(loc))}</span>
      <span class="locbar-hint">${escapeHTML(loc.code)} · tap to change</span>
    </div>`;
  } else {
    locBar = `
    <div class="locbar is-empty" data-action="armLocation">
      <span class="locbar-label">No location set</span>
      <span class="locbar-hint">Tap, then scan a location barcode</span>
    </div>`;
  }

  // The result panel. Either an asset waiting to be judged, or the prompt.
  let panel;
  if (pending) {
    // V11 — a run. ⚠ NO NEW LINE ON THIS PANEL, AND THAT IS DELIBERATE. The
    // pending screen is the one V8 measured as still overflowing by ~163px
    // (decision 2A, the held lever), so the run says itself in the three
    // elements already here: the code line becomes the range, the description
    // line gains the count, and the buttons say how many they are about to
    // write. A fourth line would buy clarity on a screen that has none to spend.
    const runCount = (pending.count > 1) ? pending.count : 0;
    const runCodes = runCount ? runCodesFrom(pending.code, runCount) : [];
    const headline = runCount ? runRangeLabel(runCodes) : pending.code;
    const desc = [runCount ? runCount + ' items' : '',
      pending.description, pending.cls ? 'Class ' + pending.cls : '']
      .filter(isNonEmptyString).join(' · ');
    // V5. ⚠ THE TOGGLE STATE IS REPEATED HERE ON PURPOSE. It is already at the
    // top of the screen, and that is not enough: the top of the screen is set
    // once and then stops being looked at, while this panel is under the
    // engineer's eyes at the exact moment they commit a result. A switch left
    // in the wrong position misfiles every scan silently until somebody
    // notices, and this is the place it gets noticed. Only the state that
    // costs something is called out — Test is the default and stays quiet.
    panel = `
    <div class="pending">
      <span class="pending-label">Waiting for a result</span>
      <span class="pending-code">${escapeHTML(headline)}</span>
      ${desc ? `<span class="pending-desc">${escapeHTML(desc)}</span>` : ''}
      ${pending.visual
        ? '<span class="pending-flag">VISUAL INSPECTION ONLY</span>'
        : ''}
    </div>
    <div class="verdict">
      <button type="button" class="btn-pass" data-action="pass">${runCount ? 'PASS ALL ' + runCount : 'PASS'}</button>
      <button type="button" class="btn-fail" data-action="fail">${runCount ? 'FAIL ALL ' + runCount : 'FAIL'}</button>
    </div>
    <button type="button" class="btn btn-ghost btn-wide" data-action="cancelPending">${runCount ? 'Discard this run' : 'Discard this scan'}</button>`;
  } else {
    // ⚠ V8 (3C) — THE SUB-LINE APPEARS IN INITIAL ONLY. "Audit — pass or fail
    // only" restated the mode switch two blocks above it and cost a line on
    // every idle screen for it. The Initial line does not restate anything: it
    // warns that a sheet is about to open and ask for a description, which is
    // the one thing about to happen that the switch does not say.
    //
    // Same asymmetry as the Visual toggle, and for the same reason — the costly
    // mode is the one that gets told about itself. ⚠ Do not add an Audit line
    // back for symmetry. The screen changes height by ~22px when you flip
    // modes; that is deliberate and it is a second, peripheral signal that the
    // mode changed at all.
    panel = `
    <div class="prompt">
      <span class="prompt-big">Scan an asset</span>
      ${initial
        ? '<span class="prompt-small">Initial — you will be asked for a description</span>'
        : ''}
    </div>`;
  }

  return `
  <div class="screen${initial ? ' mode-initial' : ''}">
    ${renderHeader('PATGo Scan')}
    <main class="main">

      <div class="modeswitch" role="group" aria-label="Scan mode">
        <button type="button" class="mode-opt${!initial ? ' is-on' : ''}"
                data-action="setMode" data-arg="${MODE_AUDIT}">Audit</button>
        <button type="button" class="mode-opt${initial ? ' is-on' : ''}"
                data-action="setMode" data-arg="${MODE_INITIAL}">Initial</button>
      </div>

      ${locBar}

      ${renderScanToggles()}

      <input type="text" id="scan-input" class="scanbox"
             placeholder="Barcode appears here"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
             ${state.scannerPaired ? 'inputmode="none"' : ''}
             value="">
      <button type="button" class="linkbtn" data-action="manualEntry">Type a number instead</button>

      ${panel}

      <div class="counts">
        <span><b>${counts.pass}</b> pass</span>
        <span><b>${counts.fail}</b> fail</span>
        <span><b>${counts.locations}</b> locations</span>
        <span class="counts-note">today</span>
      </div>

      <!-- V7. ⚠ QUIET, BUT IT HAS TO BE HERE. Export is scoped to the session
           (3B) and the counts above are too, so a phone left in yesterday's
           batch reports plausible-looking numbers for the wrong work and writes
           a file to match. One line naming the session is the cheapest thing
           that makes that visible before it costs anything. -->
      <button type="button" class="sessionstrip" data-action="goSessions">
        <span class="sessionstrip-label">Session</span>
        <span class="sessionstrip-name">${escapeHTML(currentSessionName())}</span>
      </button>

      ${exportNudgeDue() ? `
      <div class="nudge" data-action="go" data-arg="settingsBackup">
        ${unexportedCount()} records not exported yet — tap to export
      </div>` : ''}

      ${renderLastItem()}

    </main>
    ${renderNav('scan')}
  </div>`;
}

// ---------------------------------------------------------------------------
// V6 (13D) — THE LAST ITEM QUICK VIEW
//
// ⚠ ONE SELF-CONTAINED BLOCK, ON PURPOSE. This function, the two actions in
// dispatch.js, and the .lastitem rules in styles.css are the whole of it, and
// nothing else calls into them. It is shipped as a TRIAL — if it does not earn
// its place it comes out in three edits and nothing else on the screen moves.
// That is why it does not share a helper with the discard path and why
// "Discard this scan" is untouched.
//
// ⚠ IT SITS AT THE FOOT OF THE SCREEN AND THAT IS THE SAFETY ARGUMENT. A
// destructive control a full screen away from FAIL is not the mis-tap risk that
// the same control beside FAIL would be. Moving this block up is not a layout
// preference; it changes what a fumbled thumb can do.
//
// ⚠ TWO CONTROLS, NOT THREE. Delete and undo are the same action when the
// record in question is the last one, and shipping both would be two buttons
// that do one thing — the engineer would have to work out which. Undo removes
// it; Edit opens the same sheet the log uses.
// ⚠ V12 (6A) — UNDO BECOMES "Undo all 6" WHILE A RUN IS THE LAST THING WRITTEN.
// A run is the one commit in this app whose size is not visible afterwards: the
// block shows the LAST id of six and the counts have moved by an amount nobody
// watched. Undoing it one at a time was twenty rows × three taps, which is not
// a correction path, it is a punishment.
//
// ⚠ NO NEW ROW, AND THAT IS THE POINT. V8 cut this block from ~141px to ~58px
// to get it above the fold on a 17 Pro; the batch undo is a LABEL on a button
// that already exists. Do not give the run its own line here — the scan screen
// has a measured height budget and this block spends none of it.
//
// ⚠ IT IS NOT ON THE TOAST. The toast that says "6 items recorded" fades, and a
// destructive control that has to be caught is one an engineer will reach for
// as it disappears. Nothing else in this app is operated by tapping a toast.
function renderLastItem() {
  const rec = lastItemRecord();
  if (!rec) return '';
  const run = activeRun();
  const bits = [rec.description, rec.cls ? 'Class ' + rec.cls : '',
    rec.visual === true ? 'Visual' : '']
    .filter(isNonEmptyString).join(' · ');
  // ⚠ V8 (4B) — ONE ROW. The standing "Last recorded" label and the actions'
  // own row are both gone; Edit and Undo now sit at the right-hand end of the
  // same baseline as the code, pushed there by .lastitem-acts. This took the
  // block from ~141px to ~58px, which is the whole reason it is now above the
  // fold on a 17 Pro rather than a scroll below it.
  //
  // ⚠ THE DESCRIPTION LINE IS CONDITIONAL AND STAYS THAT WAY. `bits` is only
  // non-empty on initial items (description, class, visual), so an audit item —
  // which is most of them — renders as a single row. Do not give it a permanent
  // empty line to keep the block a constant height: a constant height is worth
  // nothing here and 20px on this screen is worth a lot.
  return `
  <div class="lastitem">
    <div class="lastitem-main">
      <span class="lastitem-code">${escapeHTML(rec.code)}</span>
      <span class="lastitem-result is-${escapeHTML(rec.result || 'none')}">${escapeHTML((rec.result || '').toUpperCase())}</span>
      <div class="lastitem-acts">
        <button type="button" class="linkbtn" data-action="editLastItem">Edit</button>
        <button type="button" class="linkbtn is-danger" data-action="undoLastItem">${
          run ? 'Undo all ' + run.ids.length : 'Undo'}</button>
      </div>
    </div>
    ${bits ? `<span class="lastitem-sub">${escapeHTML(bits)}</span>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// THE LOG — the correction path (decision 5)
// ---------------------------------------------------------------------------
function renderLog() {
  const sel = state.logSelect;
  return `
  <div class="screen">
    ${renderHeader('Log')}
    <main class="main">
      ${renderMoveBar()}
      ${renderSelectBar()}
      <input type="text" id="log-search" class="field" placeholder="Search asset or location"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
             data-input-action="logSearch" value="${escapeHTML(state.logSearch)}">
      ${renderLogTotals()}
      <div id="log-list">${renderLogListHTML()}</div>
    </main>
    ${sel ? renderSelectActions() : ''}
    ${renderNav('log')}
  </div>`;
}

// V12 (2A) — entering and leaving select mode.
//
// ⚠ A STANDING BUTTON, NOT A LONG-PRESS. A long-press is invisible — there is
// nothing on the screen that could teach it — and on iOS it fights the
// browser's own press-and-hold behaviour on a <button>, which needs
// -webkit-touch-callout suppressing and still varies by version. A control that
// says "Select" cannot be undiscoverable and cannot be triggered by a thumb
// resting on a row while reading.
//
// ⚠ IT SITS ABOVE THE SEARCH BOX FOR THE SAME REASON THE MOVE BAR DOES: while
// select mode is on, tapping a row TICKS it instead of opening it, and the
// notice saying so belongs above the list whose behaviour has changed.
//
// ⚠ NOTHING TO SELECT, NO CONTROL. On an empty session the button would open a
// mode over nothing and offer a Select all of none.
function renderSelectBar() {
  const sel = state.logSelect;
  const shown = selectableShownIds();
  if (!sel) {
    if (!shown.length) return '';
    return `
    <div class="selbar">
      <span class="selbar-label">${escapeHTML(currentSessionName())}</span>
      <button type="button" class="linkbtn" data-action="startSelect">Select</button>
    </div>`;
  }
  // ⚠ THE SELECT ALL LABEL CARRIES THE NUMBER AND THE WORD "shown", because the
  // number IS the safety feature (4A). It ticks what the search has filtered
  // to, never the session — and a bare "Select all" over a filtered list is a
  // button whose meaning depends on a box the thumb is covering.
  const all = shown.length && shown.every(id => sel.indexOf(id) !== -1);
  return `
  <div class="selbar is-on">
    <span class="selbar-label">${sel.length} selected</span>
    <button type="button" class="linkbtn" data-action="${all ? 'selectNone' : 'selectAllShown'}">${
      all ? 'Clear' : 'Select all ' + shown.length + ' shown'}</button>
    <button type="button" class="linkbtn" data-action="cancelSelect">Done</button>
  </div>`;
}

// ⚠ THE ACTION BAR SITS ABOVE .nav AND CARRIES NO SAFE-AREA INSET. The inset
// belongs to whatever is actually at the bottom edge, and that is still the nav
// — see the note at the top of styles.css about V8's double-counted inset. A
// second element claiming it here is exactly how that bug came back.
//
// ⚠ NOTHING TICKED, NO BAR. A greyed-out "Delete 0" is a control that looks
// broken; the header already says "0 selected", which is the honest version of
// the same fact.
function renderSelectActions() {
  const sel = state.logSelect || [];
  if (!sel.length) return '';
  return `
  <div class="selacts">
    <button type="button" class="btn btn-danger btn-wide" data-action="deleteSelected">Delete ${sel.length}</button>
  </div>`;
}

// V9 — the move arm, shown only on the log and only while armed.
//
// ⚠ IT SITS ABOVE THE SEARCH BOX FOR A REASON. While it is up, a scan is a
// destination rather than a search, and the control whose behaviour has changed
// is the one directly beneath the notice saying so.
//
// ⚠ IF THE RECORD HAS GONE, SO HAS THE ARM. A banner naming an item that is no
// longer there would leave the engineer scanning a room for something deleted
// in another tab or by a restore, and _routeMoveScan() would then refuse a scan
// the screen had invited.
function renderMoveBar() {
  if (!state.moveArmed) return '';
  const rec = recordById(state.moveArmed);
  if (!rec || rec.type !== 'item') { state.moveArmed = ''; return ''; }
  return `
  <div class="movebar" data-action="cancelMove">
    <span class="movebar-label">Scan where <b>${escapeHTML(rec.code)}</b> belongs</span>
    <span class="movebar-hint">Stand in the room and scan its location barcode · Tap to cancel</span>
  </div>`;
}

// V6 (13D). ⚠ THE NOTE AT THE END OF THE STRIP IS NOT DECORATION. The scan
// screen carries a strip of the same shape holding TODAY's figures, and two
// identical-looking strips that disagree is worse than having neither. The word
// is what makes the difference readable.
//
// ⚠ V12 (9A) — IT NAMES THE SESSION, BECAUSE "all time" WAS A LIE AND HAD BEEN
// SINCE V7. logTotals() was scoped to the current session when sessions
// arrived; the label it was written for in V6 was not touched, so for four
// releases this strip counted one session and called it all time. The log
// screen was disagreeing with itself in three places at once — a list of every
// session, a totals strip of one, and a tab badge of the whole phone. V12's
// hard scope makes all three mean the same thing, and this is the label that
// says which thing that is.
//
// ⚠ THE NAME, NOT THE WORDS "this session". The engineer has more than one, and
// which one they are in is the fact worth a line here — it is the same
// reasoning as the session strip on the scan screen.
function renderLogTotals() {
  const t = logTotals();
  if (!t.total && !t.locations) return '';
  return `
  <div class="counts counts--log">
    <span><b>${t.pass}</b> pass</span>
    <span><b>${t.fail}</b> fail</span>
    <span><b>${t.locations}</b> locations</span>
    <span class="counts-note">${escapeHTML(currentSessionName())}</span>
  </div>`;
}

// V12 (5B) — THE ROWS THIS SCREEN SHOWS: THE CURRENT SESSION, AND NOTHING ELSE.
//
// ⚠ THIS IS THE CHANGE THE REST OF V12 HANGS OFF. Until now the list showed
// every record on the phone while the totals strip counted one session and the
// tab badge counted the phone — three scopes on one screen, which is how a
// search for "kettle" returned Dave's kettle from a session this handset will
// never export. A batch delete over that list would have been a batch delete
// across sessions with nothing on any row saying so.
//
// ⚠ WHAT IT COSTS, SAID PLAINLY: another session's records can no longer be
// reached by tapping. The route is Sessions → Work in this (Reopen first if it
// is closed) → fix it → switch back. That is a real cost and it is why the
// empty and no-match copy below names it — a log that looks complete and is not
// is worse than one that says what it is holding.
//
// ⚠ V10 IS DELIBERATELY LEFT WHOLE. openEditSheet()'s out-of-session branch and
// locationChoices()' session argument are now unreachable BY TAP, and they stay
// exactly as they are: they are correct code, not dead code, and a hard-scoped
// log makes a "look at a past session" screen more likely to be wanted, not
// less. The harness reaches them directly and keeps guarding them. Do not tidy
// them away — rebuilding V10 having forgotten why it existed is the expensive
// version of this.
//
// Split out so a search keystroke repaints the list ALONE. Re-rendering the
// whole screen would take the search box's focus with it on every character.
function renderLogListHTML() {
  const q = cleanText(state.logSearch, 60).toLowerCase();
  const sel = state.logSelect;
  let rows = state.records.filter(inCurrentSession).sort(byNewest);
  if (q) {
    rows = rows.filter(r =>
      String(r.code).toLowerCase().indexOf(q) !== -1 ||
      String(r.description || '').toLowerCase().indexOf(q) !== -1 ||
      String(r.room || '').toLowerCase().indexOf(q) !== -1 ||
      String(r.locationCode || '').toLowerCase().indexOf(q) !== -1);
  }
  if (!rows.length) {
    // V12 (8A) — the copy names what is NOT here. Both states now describe one
    // session rather than the phone, and an engineer searching for yesterday's
    // asset needs to be told where it went, not told it does not exist.
    return `<p class="muted">${q
      ? 'Nothing in this session matches. Other sessions are not shown here — switch to one in Sessions.'
      : 'Nothing scanned in this session yet. Everything you log appears here and can be corrected by tapping it.'}</p>`;
  }
  return rows.map(r => {
    if (r.type === 'location') {
      // V12 (3A) — ⚠ A LOCATION ROW IS NEVER SELECTABLE, AND IT STAYS TAPPABLE
      // IN SELECT MODE. Deleting a location is the one delete in this app with
      // a sweep behind it: deleteRecord() clears `locationId` off every item
      // pointing at it, and those items need not be in the selection or even on
      // screen. One at a time that consequence is visible — you deleted the
      // kitchen, the kitchen's items lose their room. Twenty at a time it is
      // invisible, and the engineer finds out at export. The row keeps opening
      // its edit sheet so nothing that worked before stops working.
      return `
      <button type="button" class="row row-loc" data-action="editRecord" data-arg="${escapeHTML(r.id)}">
        <span class="row-main">${escapeHTML(locationLabel(r))}</span>
        <span class="row-sub">Location · ${escapeHTML(r.mode)} · ${escapeHTML(r.code)} · ${escapeHTML(timeOfDay(r.ts))}</span>
      </button>`;
    }
    // V2: the room, not the bare barcode. "Kitchen" tells an engineer holding
    // the phone where they were; "L-204" makes them go and look it up.
    // V5 — Visual joins the meta line (decision 9: enough to spot a mistake,
    // and no more). ⚠ ONLY THE NON-DEFAULT STATE IS PRINTED. Writing "Test" on
    // every one of a few hundred rows would push the description and the room
    // off the end of the line to say what is true of almost all of them, and a
    // word that appears on every row is a word that stops being read. The one
    // that costs something is the one that shows.
    const bits = [r.description, r.cls ? 'Class ' + r.cls : '',
      r.visual === true ? 'Visual' : '', itemLocationShort(r)]
      .filter(isNonEmptyString).join(' · ');
    // V11 (7A) — THE MODE, ON EVERY ITEM ROW, IN BOTH DIRECTIONS.
    //
    // ⚠ THIS IS THE ONE PLACE THE "ONLY THE NON-DEFAULT STATE IS PRINTED" RULE
    // ABOVE DOES NOT APPLY, and the reason is the shape of the thing, not a
    // change of heart. That rule is about the META LINE, where every word
    // pushes the description and the room off the end — Visual earns its place
    // there and Test does not. A badge sits in its own column at the right and
    // costs the line nothing, so both labels are affordable, and the question
    // being answered here is "which of the two is this", which silence cannot
    // answer without the reader already knowing the convention.
    //
    // ⚠ GREEN IS NOT DECORATION EITHER. Initial tints the whole scan screen
    // with --mode-tint; the badge uses the same token, so green means Initial
    // in both places an engineer sees it. Do not give Audit a colour of its
    // own — one signal, one meaning.
    //
    // ⚠ V11 (8A) — THE UNEXPORTED DOT IS GONE FROM BOTH ROW TYPES. It marked
    // "not exported", which since V7 has been true of nearly every row until
    // the moment the session goes out — and a marker on nearly every row is not
    // a marker. Export is scoped to the session now, so the question it
    // answered is one the log is the wrong place to ask. The count still lives
    // on the Log tab, in Settings and in the export nudge.
    const isInitial = r.mode === MODE_INITIAL;
    // V12 — IN SELECT MODE THE SAME ROW DOES A DIFFERENT THING, and the element
    // does not change to say so.
    //
    // ⚠ IT STAYS A <button> WITH A data-action, swapped from editRecord to
    // toggleSelect. Putting a real <input type="checkbox"> inside would be
    // invalid HTML — a form control nested in a button — and iOS then decides
    // for itself which of the two a thumb landed on. The tick is drawn, and the
    // whole row remains one 44px target either way.
    const on = sel ? sel.indexOf(r.id) !== -1 : false;
    return `
    <button type="button" class="row row-item is-${escapeHTML(r.result || 'none')}${
      sel ? ' is-selectable' : ''}${on ? ' is-picked' : ''}"
            data-action="${sel ? 'toggleSelect' : 'editRecord'}" data-arg="${escapeHTML(r.id)}"
            ${sel ? `aria-pressed="${on ? 'true' : 'false'}"` : ''}>
      ${sel ? `<span class="row-tick" aria-hidden="true">${on ? '✓' : ''}</span>` : ''}
      <span class="row-mode ${isInitial ? 'is-initial' : 'is-audit'}">${isInitial ? 'INITIAL' : 'AUDIT'}</span>
      <span class="row-main">${escapeHTML(r.code)}
        <span class="row-result">${escapeHTML((r.result || '').toUpperCase())}</span></span>
      <span class="row-sub">${escapeHTML(bits || r.mode)}${r.failReason ? ' · ' + escapeHTML(r.failReason) : ''} · ${escapeHTML(timeOfDay(r.ts))}</span>
    </button>`;
  }).join('');
}

// V12 — the ids select mode is allowed to tick RIGHT NOW: items only (3A), this
// session only (5B), and only what the search is currently showing (4A).
//
// ⚠ ONE FUNCTION, USED BY BOTH THE LABEL AND THE ACTION. "Select all 12 shown"
// and the tick that follows it must be counting the same twelve — computing the
// number in the header and the list in the handler is how a button comes to
// promise one thing and do another the moment the filter changes underneath it.
function selectableShownIds() {
  const q = cleanText(state.logSearch, 60).toLowerCase();
  const out = [];
  const rows = state.records.filter(inCurrentSession).sort(byNewest);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.type !== 'item') continue;
    if (q &&
        String(r.code).toLowerCase().indexOf(q) === -1 &&
        String(r.description || '').toLowerCase().indexOf(q) === -1 &&
        String(r.room || '').toLowerCase().indexOf(q) === -1 &&
        String(r.locationCode || '').toLowerCase().indexOf(q) === -1) continue;
    out.push(r.id);
  }
  return out;
}

function refreshLogListOnly() {
  const el = document.getElementById('log-list');
  if (el) el.innerHTML = renderLogListHTML();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function renderSettings() {
  const link = (label, view, sub) => `
    <button type="button" class="row" data-action="go" data-arg="${view}">
      <span class="row-main">${escapeHTML(label)}</span>
      ${sub ? `<span class="row-sub">${escapeHTML(sub)}</span>` : ''}
    </button>`;
  return `
  <div class="screen">
    ${renderHeader('Settings')}
    <main class="main">
      <button type="button" class="row" data-action="editEngineer">
        <span class="row-main">Engineer</span>
        <span class="row-sub">${escapeHTML(state.engineer || 'Not set — tap to add your name')}</span>
      </button>
      ${link('Barcode scanner', 'settingsScanner', state.scannerEnabled ? 'On' : 'Off')}
      ${link('Fail reasons and descriptions', 'settingsLists', state.failReasons.length + ' fail reasons')}
      ${link('Sessions', 'sessions', currentSessionName())}
      ${link('Export and backup', 'settingsBackup', unexportedCount() + ' not exported')}

      <h2 class="sec">Readings</h2>
      <button type="button" class="row" data-action="editEarthBond">
        <span class="row-main">Earth bond</span>
        <span class="row-sub">${escapeHTML(state.earthBondValue || 'Not set')} · Class 1 only</span>
      </button>
      <button type="button" class="row" data-action="editInsulation">
        <span class="row-main">Insulation</span>
        <span class="row-sub">${escapeHTML(state.insulationValue || 'Not set')}</span>
      </button>
      <p class="muted small">Written onto each item as you log it. Changing them here does not alter anything already recorded — correct those in the log.</p>

      <h2 class="sec">Appearance</h2>
      <div class="rowline">
        <span>Theme</span>
        <select class="field field-inline" data-change-action="setTheme">
          <option value="auto"${state.theme === 'auto' ? ' selected' : ''}>Match phone</option>
          <option value="light"${state.theme === 'light' ? ' selected' : ''}>Light</option>
          <option value="dark"${state.theme === 'dark' ? ' selected' : ''}>Dark</option>
        </select>
      </div>
      ${renderToggle('Vibrate on a result', 'toggleHaptic', state.haptic)}
      ${renderToggle('Sound on a result', 'toggleSound', state.sound)}

      <h2 class="sec">Help</h2>
      ${link('About', 'about', 'Version ' + APP_VERSION)}
      <button type="button" class="row" data-action="reportProblem">
        <span class="row-main">Report a problem</span>
        <span class="row-sub">Sends the details Peter needs to fix it</span>
      </button>
    </main>
    ${renderNav('settings')}
  </div>`;
}

function renderToggle(label, action, on) {
  return `
  <div class="rowline">
    <span>${escapeHTML(label)}</span>
    <button type="button" class="toggle${on ? ' is-on' : ''}" data-action="${action}"
            role="switch" aria-checked="${on ? 'true' : 'false'}"
            aria-label="${escapeHTML(label)}"><span class="knob"></span></button>
  </div>`;
}

function renderSettingsScanner() {
  const speeds = ['strict', 'normal', 'relaxed'];
  return `
  <div class="screen">
    ${renderHeader('Barcode scanner', 'goSettings')}
    <main class="main main--nonav">
      ${renderToggle('Accept scans', 'toggleScanner', state.scannerEnabled)}
      ${renderToggle('Scanner always connected', 'togglePaired', state.scannerPaired)}
      <p class="muted small">Turn the second one on only when a scanner is paired to this phone. It puts the cursor in the scan box by itself so you never have to tap first — but with no scanner attached it will keep opening the on-screen keyboard.</p>

      <h2 class="sec">Speed</h2>
      <p class="muted small">The app tells a scanner from a thumb by how fast the characters arrive. If good scans are being rejected, move this looser.</p>
      <div class="rowline">
        <span>Threshold</span>
        <select class="field field-inline" data-change-action="setScanSpeed">
          ${speeds.map(s => `<option value="${s}"${state.scanSpeed === s ? ' selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)} (${SCAN_GAP_PRESETS[s]}ms)</option>`).join('')}
        </select>
      </div>

      <h2 class="sec">Test it</h2>
      <p class="muted small">Pull the trigger with this page open. Everything the scanner sends appears below — accepted or not, and why not.</p>
      <input type="text" id="scanner-test" class="field" placeholder="Scan here"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      <div id="scanner-test-log" class="scanner-log">${renderScannerTestLogHTML()}</div>
      <button type="button" class="btn btn-ghost btn-wide" data-action="clearScanLog">Clear the test log</button>
    </main>
  </div>`;
}

// ⚠ THE ITEMS TEXTAREA IS UNCOMMITTED UNTIL SAVE, AND render() REBUILDS #app.
// So anything that re-renders — switching list, adding one, renaming one —
// discards whatever was typed into it. That is why the Save button is explicit
// and why the line under the box says so in plain words: the alternative,
// committing on every keystroke, would mean a half-typed line briefly becoming
// a real button, and it breaks the no-render-on-a-keystroke rule.
function renderSettingsLists() {
  const presets = state.itemPresets || [];
  const active = activePreset();
  const activeId = active ? active.id : '';
  const items = active ? active.items : [];

  const reasons = state.failReasons.map((r, i) => `
    <div class="rowline">
      <span>${escapeHTML(r)}</span>
      <span class="rowline-actions">
        <button type="button" class="linkbtn" data-action="renameReason" data-arg="${i}">Edit</button>
        <button type="button" class="linkbtn is-danger" data-action="deleteReason" data-arg="${i}">Remove</button>
      </span>
    </div>`).join('');
  return `
  <div class="screen">
    ${renderHeader('Lists', 'goSettings')}
    <main class="main main--nonav">
      <h2 class="sec">Fail reasons</h2>
      ${reasons || '<p class="muted">No fail reasons. Add one below.</p>'}
      <button type="button" class="btn btn-ghost btn-wide" data-action="addReason">Add a fail reason</button>

      <h2 class="sec">Quick Pick</h2>
      <p class="muted small">The buttons on the new item sheet. Tap one instead of typing. Up to ${QUICK_PICK_MAX}, one per line, in the order you want them on screen.</p>
      <select class="field" id="qp-preset" data-change-action="switchPreset" aria-label="Quick Pick list">
        ${presets.map(p => `<option value="${escapeHTML(p.id)}"${p.id === activeId ? ' selected' : ''}>${escapeHTML(p.name)}</option>`).join('')}
      </select>
      <div class="rowline-actions">
        <button type="button" class="linkbtn" data-action="addPreset">New list</button>
        <button type="button" class="linkbtn" data-action="renamePreset">Rename</button>
        ${presets.length > 1
          ? '<button type="button" class="linkbtn is-danger" data-action="deletePreset">Delete</button>'
          : ''}
      </div>
      <textarea class="field qp-items" id="qp-items" rows="9"
                autocapitalize="words" spellcheck="false">${escapeHTML(items.join('\n'))}</textarea>
      <p class="muted small">Changes here are not kept until you tap Save.</p>
      <div class="rowline-actions">
        <button type="button" class="btn btn-ghost" data-action="resetQuickPicks">Reset to defaults</button>
        <button type="button" class="btn btn-primary" data-action="saveQuickPicks">Save</button>
      </div>

      <h2 class="sec">Typed descriptions</h2>
      <p class="muted small">Separate from Quick Pick. Anything you type into the description box is remembered and offered back in the dropdown as you type it again. Nothing to set up, and it never changes your Quick Pick buttons.</p>
      <p class="muted small">${state.descriptions.length} remembered.</p>
      <button type="button" class="btn btn-ghost btn-wide" data-action="resetDescriptions">Forget them and start again</button>
    </main>
  </div>`;
}

// ⚠ V7 — ONE EXPORT BUTTON, NOT TWO (decision 3B). "Export new" and "export
// everything" were the same question asked twice and they no longer have
// different answers: a file is the whole of the current session. Leaving a
// second button that produced the same file would teach the engineer that one
// of them does something else.
function renderSettingsBackup() {
  const counts = sessionCounts(state.currentSessionId);
  const inSession = counts.items + counts.locations;
  return `
  <div class="screen">
    ${renderHeader('Export and backup', 'goSettings')}
    <main class="main main--nonav">
      <h2 class="sec">Send to the client</h2>
      <p class="muted small">One CSV holding the whole of <b>${escapeHTML(currentSessionName())}</b>, in scan order — everything in it, whether it has been sent before or not. Exporting marks it as sent but deletes nothing.</p>
      <button type="button" class="btn btn-primary btn-wide" data-action="exportNew">
        Export ${counts.items} item${counts.items === 1 ? '' : 's'}</button>
      <button type="button" class="btn btn-ghost btn-wide" data-action="copyCsv">Copy the CSV to the clipboard</button>
      <p class="muted small">${inSession ? '' : 'Nothing in this session yet. '}Working in a different batch? Switch session first.</p>
      <button type="button" class="btn btn-ghost btn-wide" data-action="goSessions">Sessions</button>

      <h2 class="sec">Backup</h2>
      <p class="muted small">A full copy of everything on this phone, including your settings. This is what saves you if the phone is lost — do it at the end of every day.</p>
      <button type="button" class="btn btn-primary btn-wide" data-action="exportBackup">Save a backup file</button>
      <label class="btn btn-ghost btn-wide" for="restore-file">Restore from a backup file</label>
      <input type="file" id="restore-file" accept=".json,application/json" class="hidden-file"
             data-change-action="restoreFile">

      <h2 class="sec">Clear</h2>
      <p class="muted small">Only possible once everything has been exported.</p>
      <button type="button" class="btn btn-danger btn-wide" data-action="clearExported">Clear exported records</button>

      <p class="muted small">Storage used: ${escapeHTML(formatBytes(storageBytes()))}</p>
    </main>
  </div>`;
}


// ---------------------------------------------------------------------------
// V7 — THE SESSIONS SCREEN
//
// ⚠ THE CURRENT SESSION IS SHOWN SEPARATELY AND FIRST, not as a highlighted row
// in the list. Every action on this screen is relative to "which one am I in",
// and a list where the answer is a shade of background is a list where the
// answer gets missed. The same reasoning as the mode switch on the scan screen.
//
// ⚠ NO ACTION HERE DELETES A RECORD. Closing keeps everything, merging moves
// everything, and delete is offered only for a session holding nothing at all.
// The one path that destroys records is still the Clear button on the backup
// page, behind its own two guards.
// ---------------------------------------------------------------------------
function renderSessions() {
  const cur = currentSession();
  const rows = sessionList();

  const row = (ses) => {
    const c = sessionCounts(ses.id);
    const isCur = cur && ses.id === cur.id;
    const bits = [
      c.items + ' item' + (c.items === 1 ? '' : 's'),
      c.locations + ' location' + (c.locations === 1 ? '' : 's'),
      c.unexported ? c.unexported + ' not sent' : '',
      ses.engineer ? escapeHTML(ses.engineer) : '',
    ].filter(isNonEmptyString).join(' · ');

    // ⚠ THE ACTIONS DIFFER BY STATE AND THAT IS DELIBERATE. Offering "close" on
    // a closed session, or "switch to" on the one you are already in, is how a
    // row stops being readable at a glance.
    const acts = [];
    if (!isCur && !ses.closedAt) acts.push(`<button type="button" class="linkbtn" data-action="switchSession" data-arg="${escapeHTML(ses.id)}">Work in this</button>`);
    if (ses.closedAt) acts.push(`<button type="button" class="linkbtn" data-action="reopenSession" data-arg="${escapeHTML(ses.id)}">Reopen</button>`);
    if (!ses.closedAt) acts.push(`<button type="button" class="linkbtn" data-action="closeSession" data-arg="${escapeHTML(ses.id)}">Close</button>`);
    acts.push(`<button type="button" class="linkbtn" data-action="renameSession" data-arg="${escapeHTML(ses.id)}">Rename</button>`);
    if (c.items + c.locations) {
      acts.push(`<button type="button" class="linkbtn" data-action="shareSession" data-arg="${escapeHTML(ses.id)}">Share</button>`);
      acts.push(`<button type="button" class="linkbtn" data-action="mergeSession" data-arg="${escapeHTML(ses.id)}">Merge into…</button>`);
    } else {
      acts.push(`<button type="button" class="linkbtn is-danger" data-action="deleteSession" data-arg="${escapeHTML(ses.id)}">Delete</button>`);
    }

    return `
    <div class="seslist-row${isCur ? ' is-current' : ''}">
      <div class="seslist-main">
        <span class="seslist-name">${escapeHTML(ses.name)}</span>
        ${isCur ? '<span class="seslist-tag">working in</span>'
                : (ses.closedAt ? '<span class="seslist-tag is-closed">closed</span>' : '')}
      </div>
      <span class="seslist-sub">${bits}</span>
      <div class="seslist-acts">${acts.join('')}</div>
    </div>`;
  };

  return `
  <div class="screen">
    ${renderHeader('Sessions', 'goSettings')}
    <main class="main main--nonav">
      <p class="muted small">A session is a batch of work. Everything you scan goes into the one you are working in, and exporting sends the whole of that session — nothing else.</p>

      <h2 class="sec">Working in</h2>
      <div class="sescur">
        <span class="sescur-name">${escapeHTML(cur ? cur.name : '')}</span>
        <span class="sescur-sub">${(() => {
          const c = sessionCounts(state.currentSessionId);
          return c.items + ' item' + (c.items === 1 ? '' : 's') + ' · ' +
                 c.locations + ' location' + (c.locations === 1 ? '' : 's');
        })()}</span>
      </div>
      <button type="button" class="btn btn-primary btn-wide" data-action="newSession">Start a new session</button>

      <h2 class="sec">All sessions</h2>
      ${rows.length ? `<div class="seslist">${rows.map(row).join('')}</div>`
                    : '<p class="muted small">Nothing here yet.</p>'}
      ${renderPhoneTotals()}
      <p class="muted small">Share sends a copy of one session to another engineer. <b>It is not a backup</b> — it holds that batch and nothing else, not your settings and not your other sessions. Settings → Export and backup is what protects the phone.</p>

      <h2 class="sec">From another engineer</h2>
      <p class="muted small">Import a session file another engineer shared from this app. Anything scanned twice is flagged for you to look at before it lands.</p>
      <label class="btn btn-ghost btn-wide" for="session-file">Import a session file</label>
      <input type="file" id="session-file" accept=".json,application/json" class="hidden-file"
             data-change-action="importSession">
      <p class="muted small">This is not the same as restoring a backup. A backup replaces everything on this phone; a session is added alongside what you already have.</p>
    </main>
  </div>`;
}

// V12 (12A/13A) — the phone-wide total, under the list of its parts.
//
// ⚠ THIS IS WHERE "all time" WENT. The log's totals strip named a session in
// V12 because that is all it ever counted; the number that really does span
// everything needs somewhere to live, and under a list of sessions is where a
// total belongs.
//
// ⚠ IT IS ALSO THE ONLY PLACE THE CLEAR GUARD'S NUMBER IS VISIBLE. "3 records
// have not been exported yet" refuses the clear using
// unexportedCountAllSessions(), and once the Log tab badge went session-scoped
// (10A) that number appeared on no screen at all. Being blocked by a fact you
// cannot see anywhere is being blocked by nothing you can act on.
//
// ⚠ "not sent" DISAPPEARS AT ZERO rather than reading "0 not sent", the same
// way the session rows above it drop the clause. A standing zero is a number
// that stops being read, and this line exists to be noticed on the day it is
// not zero.
function renderPhoneTotals() {
  const t = phoneTotals();
  if (!t.pass && !t.fail && !t.locations) return '';
  const bits = [
    t.pass + ' pass',
    t.fail + ' fail',
    t.locations + ' location' + (t.locations === 1 ? '' : 's'),
    t.sessions + ' session' + (t.sessions === 1 ? '' : 's'),
    t.unsent ? t.unsent + ' not sent' : '',
  ].filter(isNonEmptyString).join(' · ');
  return `
  <p class="phonetotals"><b>Everything on this phone:</b> ${escapeHTML(bits)}</p>`;
}

// ---------------------------------------------------------------------------
// V7 — THE DUPLICATE REVIEW (decisions 9A, 10A, 13A)
//
// ⚠ A SCREEN, NOT A SHEET, and the reason is length: a merge of two days can
// collide on dozens of assets, and a sheet sized from the visual viewport would
// put that list behind a scroll inside a scroll. No text inputs here, so rule 3
// does not apply and a full render() per tap is safe.
//
// ⚠ IT COMMITS ALL AT ONCE OR NOT AT ALL. Applying each choice as it is tapped
// would leave a half-merged pair of sessions behind if the engineer walked away
// — and "walked away" on a phone means a phone call.
//
// ⚠ 13A — KEEPING THEIRS TAKES THEIR ENGINEER NAME WITH IT. Said plainly on
// screen, because it is the one consequence that is invisible until six files
// are in one spreadsheet and the ENGINEER column is answering the question
// "who did this".
// ---------------------------------------------------------------------------
function renderReview() {
  const rv = state.review;
  if (!rv) return renderSessions();

  const theirName = rv.mode === 'merge'
    ? (sessionById(rv.fromId) ? sessionById(rv.fromId).name : 'the other session')
    : (rv.sessionMeta ? rv.sessionMeta.name : 'the new session');
  const mineName = rv.mode === 'merge'
    ? (sessionById(rv.intoId) ? sessionById(rv.intoId).name : 'this session')
    : 'what is already here';

  const line = (rec) => {
    const bits = [
      (rec.result || '').toUpperCase(),
      rec.description || '',
      rec.failReason || '',
      itemLocationShort(rec),
      rec.engineer || '',
      timeOfDay(rec.ts),
    ].filter(isNonEmptyString).join(' · ');
    return escapeHTML(bits);
  };

  const rows = rv.collisions.map((c) => {
    const pick = rv.choices[c.key] === 'mine' ? 'mine' : 'theirs';
    return `
    <div class="revrow">
      <span class="revrow-code">${escapeHTML(c.code)}</span>
      <button type="button" class="revopt${pick === 'mine' ? ' is-on' : ''}"
              data-action="reviewPick" data-arg="${escapeHTML(c.key)}|mine">
        <span class="revopt-who">Keep ${escapeHTML(mineName)}</span>
        <span class="revopt-detail">${line(c.mine)}</span>
      </button>
      <button type="button" class="revopt${pick === 'theirs' ? ' is-on' : ''}"
              data-action="reviewPick" data-arg="${escapeHTML(c.key)}|theirs">
        <span class="revopt-who">Keep ${escapeHTML(theirName)}</span>
        <span class="revopt-detail">${line(c.theirs)}</span>
      </button>
    </div>`;
  }).join('');

  const n = rv.collisions.length;
  return `
  <div class="screen">
    ${renderHeader('Scanned twice', 'cancelReview')}
    <main class="main main--nonav">
      <p class="muted small">${n} asset${n === 1 ? ' was' : 's were'} recorded in both <b>${escapeHTML(mineName)}</b> and <b>${escapeHTML(theirName)}</b>. Pick which result goes to the client. The one you keep replaces the other completely, including who is named as the engineer.</p>

      <div class="revall">
        <button type="button" class="linkbtn" data-action="reviewAll" data-arg="mine">Keep all mine</button>
        <button type="button" class="linkbtn" data-action="reviewAll" data-arg="theirs">Keep all theirs</button>
      </div>

      ${rows}

      <div class="revcommit">
        <button type="button" class="btn btn-primary btn-wide" data-action="reviewCommit">
          ${rv.mode === 'merge' ? 'Merge' : 'Import'} ${rv.incoming.length} record${rv.incoming.length === 1 ? '' : 's'}</button>
        <button type="button" class="btn btn-ghost btn-wide" data-action="cancelReview">Cancel — change nothing</button>
      </div>
    </main>
  </div>`;
}

// The merge target picker. Built the way the V4 location picker is, and with the
// same rule: ⚠ THE LIST IS BUILT ONCE AND NEVER REBUILT while the sheet lives.
function openMergePickerSheet(fromId) {
  const from = sessionById(fromId);
  if (!from) return;
  const sheet = _openSheet('Merge into');
  const others = sessionList().filter(s => s.id !== fromId);

  const body = others.length
    ? `<div class="reasonlist">
        ${others.map(s => {
          const c = sessionCounts(s.id);
          return `<button type="button" class="reasonrow" data-merge-into="${escapeHTML(s.id)}">
            <span class="reasonrow-main">${escapeHTML(s.name)}</span>
            <span class="reasonrow-sub">${c.items} item${c.items === 1 ? '' : 's'}${s.closedAt ? ' · closed' : ''}</span>
          </button>`;
        }).join('')}
      </div>`
    : '<p class="sheet-body">There is nothing else to merge into yet.</p>';

  sheet.innerHTML = `
    <h3 class="sheet-title">Merge ${escapeHTML(from.name)} into…</h3>
    <p class="sheet-body">Its records move across. ${escapeHTML(from.name)} stays on the list, closed and empty, so you can still see it was here.</p>
    ${body}
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="sheet-cancel">Cancel</button>
    </div>`;

  sheet.querySelector('#sheet-cancel').onclick = () => { _closeSheet(); render(); };
  const btns = sheet.querySelectorAll('[data-merge-into]');
  for (let i = 0; i < btns.length; i++) {
    btns[i].onclick = (e) => {
      const into = e.currentTarget.getAttribute('data-merge-into');
      _closeSheet();
      beginMerge(fromId, into);
    };
  }
}

function renderAbout() {
  return `
  <div class="screen">
    ${renderHeader('About', 'goSettings')}
    <main class="main main--nonav">
      <p><b>PATGo Scan</b> — version ${escapeHTML(APP_VERSION)}</p>
      <p class="muted small">A barcode-first testing log built for a single client's audit and initial workflow. It records what you scanned and what you found; their system does the rest.</p>

      <h2 class="sec">What's new</h2>
      <p class="muted small"><b>V12</b> — the log now shows the session you are working in and nothing else, so a search finds today's work rather than every job on the phone. Tap <b>Select</b> to tick several items and remove them in one go. A run you have just logged can be taken back whole: while it is the last thing you recorded, Undo on the scan screen reads <b>Undo all 6</b>. The totals under the search box now name the session they are counting — the phone-wide figures live under the list on the Sessions screen. To correct something in another session, switch to it in Sessions first.</p>
      <p class="muted small"><b>V11</b> — a run of identical appliances can be logged in one go. In Initial mode, scan the first one, fill in the description, then set <b>How many</b> before you tap Continue. The app numbers the rest up from the one you scanned and shows you the exact range before it writes anything. If any of those numbers is already logged it stops and tells you which — it will never skip over one and carry on. Failing a run asks you to confirm, because only the first item was ever scanned. The log now shows <b>AUDIT</b> or <b>INITIAL</b> on every item, and the blue dot has gone.</p>
      <p class="muted small"><b>V10</b> — Change on the Location row now lists the locations from the session the item is actually in, rather than the one you happen to be working in. Before, an item from another engineer's batch — or from a job you finished last week — could be filed under a room that batch never contained, which the client's file would have shown as an item in a place that was not in it. Save &amp; scan is not offered on those items, because the room you are stood in belongs to today's session. The Sessions screen now says plainly that sharing a session is not the same as taking a backup.</p>
      <p class="muted small"><b>V9</b> — an item filed in the wrong room can now be moved by scanning. Tap it in the log, tap <b>Save &amp; scan</b> on the Location row, then stand in the right room and scan its location barcode. Anything else you had corrected on that item is saved first. Picking from the list still works exactly as before, and is still the way to do it when you are not stood in the room.</p>
      
      <p class="muted small">© 2026 Peter Birchley. All rights reserved.</p>
    </main>
  </div>`;
}

function renderWelcome() {
  return `
  <div class="screen">
    <main class="main welcome">
      <h1>PATGo Scan</h1>

      <h2 class="sec">New in V12</h2>
      <ul>
        <li><b>The log is the session you are working in.</b> Other sessions are no longer mixed into it, so the list, the totals and the tab all count the same work. To correct something in an older batch, switch to it on the Sessions screen first.</li>
        <li><b>Tap Select to tick several items at once</b> and remove them together. It ticks items, not locations, and <b>Select all</b> only takes what your search is currently showing — the number is on the button.</li>
        <li><b>A run can be taken back whole.</b> While the run you just logged is the last thing you recorded, Undo on the scan screen reads <b>Undo all 6</b>. Log the run, check it in the log, come back — the offer is still there.</li>
        <li><b>The totals under the search box now name the session</b> they are counting. They always did count just the one; they used to say "all time".</li>
        <li><b>The figures for the whole phone</b> — every session, and anything not yet sent — sit under the list on the Sessions screen.</li>
      </ul>

      <h2 class="sec">The whole app in four lines</h2>
      <ul>
        <li>Tap the location bar, scan a location barcode. Everything you scan after that is recorded there.</li>
        <li><b>Audit</b> mode: scan an asset, tap PASS or FAIL. That's it.</li>
        <li><b>Initial</b> mode: the screen turns green, and each new asset asks for a description.</li>
        <li>Check the two switches under the location bar — Class, and Test or Visual — before you start.</li>
        <li>At the end of the day, Settings → Export and backup. Send the CSV, save a backup.</li>
      </ul>
      <p class="muted small">Put your name in Settings first — it goes on every record and into the filename, which is what lets several engineers' files be merged.</p>
      <button type="button" class="btn btn-primary btn-wide" data-action="dismissWelcome">Start</button>
    </main>
  </div>`;
}

// ---------------------------------------------------------------------------
// SHEETS
//
// These build their own DOM into <body> and are NOT part of render(). See the
// no-render rule at the top of this file.
// ---------------------------------------------------------------------------

// Initial mode, asset scanned: gather description and class before the result.
// ⚠ NOTHING IN THIS SHEET MAY CHANGE THE HEIGHT OF ANYTHING ABOVE OR BELOW IT
// WHILE IT IS BEING USED. That is the V1.1 fix. In V1 the suggestion list was
// an in-flow row of chips that repainted on every keystroke AND again when one
// was tapped — so the Class buttons and Continue jumped down the screen as you
// typed, and the list reshuffled out from under the finger at the moment of the
// tap. Two rules keep it still:
//   1. The GRID IS STATIC. Tapping a button toggles a class on it. The grid is
//      never rebuilt, never reordered, never re-filtered while the sheet lives.
//   2. The DROPDOWN IS AN OVERLAY — position:absolute inside .desc-wrap, so it
//      floats over the Class row instead of pushing it down. Showing and hiding
//      it moves nothing. This is the pattern PATGo uses on its entry screen.
//
// ⚠ V11 — THE RUN CONTROL LIVES HERE AND NOWHERE ELSE (decision 1A). It is not
// on the scan screen, and that is a height decision as much as a design one:
// V8 spent a whole release buying ~150px back on that screen and 15e ratchets
// every value it bought. Putting the count on the sheet costs the scan screen
// nothing, reuses the description and quick-pick machinery already here, and —
// the part that matters — guarantees the FIRST id of every run came off a real
// label, because you cannot reach this sheet without scanning one.
//
// ⚠ IT IS NOT OFFERED ON A RE-SCAN. state._pendingReplaceId set means this
// asset is already on file and the engineer chose to replace that result. A run
// from there would replace one record and invent N-1 more, which is two
// different operations wearing one button.
//
// ⚠ NOR ON A CODE WITH NO TRAILING DIGITS. There is nothing to count from, and
// a control that appears for some barcodes and not others is honest — a control
// that appears always and refuses on tap is not.
function openNewItemSheet(code) {
  const sheet = _openSheet('New item');
  const picks = quickPickItems();
  // V11. A run needs a countable code AND a fresh one — see the two notes above.
  const canRun = runCodesFrom(code, 2).length === 2 && !state._pendingReplaceId;
  let runCount = 1;
  sheet.innerHTML = `
    <h3 class="sheet-title">New item</h3>
    <p class="sheet-code">${escapeHTML(code)}</p>
    <label class="lbl">Description</label>
    ${picks.length ? `<div class="quick-grid" id="ni-quick">
      ${picks.map(p => `<button type="button" class="quick-btn" data-q="${escapeHTML(p)}">${escapeHTML(p)}</button>`).join('')}
    </div>` : ''}
    <div class="desc-wrap">
      <input type="text" id="ni-desc" class="field" autocomplete="off"
             autocapitalize="words" spellcheck="false"
             placeholder="${picks.length ? '…or type it' : 'e.g. Kettle'}">
      <div id="ni-suggest" class="suggest is-hidden"></div>
    </div>
    <p class="sheet-note">Class ${escapeHTML(state.itemClass)}${state.visualMode
      ? ' · <span class="sheet-note-warn">visual inspection only</span>'
      : ''} — set on the scan screen</p>
    ${canRun ? `
    <label class="lbl">How many</label>
    <div class="runrow" role="group" aria-label="How many items">
      <button type="button" class="run-step" data-run="-5">−5</button>
      <button type="button" class="run-step" data-run="-1">−</button>
      <span class="run-count" id="ni-count" aria-live="polite">1</span>
      <button type="button" class="run-step" data-run="1">+</button>
      <button type="button" class="run-step" data-run="5">+5</button>
    </div>
    <p class="sheet-note run-note" id="ni-runnote">Just this one</p>` : ''}
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="ni-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="ni-ok">Continue</button>
    </div>`;

  const desc = sheet.querySelector('#ni-desc');
  const suggest = sheet.querySelector('#ni-suggest');

  // Marks whichever grid button matches what is in the box. Cosmetic only, and
  // it does not rebuild the grid — it toggles a class on buttons already there.
  const markGrid = () => {
    const v = cleanText(desc.value, 80).toLowerCase();
    sheet.querySelectorAll('.quick-btn').forEach(b =>
      b.classList.toggle('is-on', (b.getAttribute('data-q') || '').toLowerCase() === v));
  };

  const hideSuggest = () => {
    suggest.innerHTML = '';
    suggest.classList.add('is-hidden');
  };

  // Only ever called from typing. A tap on a suggestion HIDES the list rather
  // than re-running it: re-running was what made the list re-order and drop the
  // word just picked, right as the finger came down on it.
  const paintSuggest = () => {
    const typed = cleanText(desc.value, 80);
    if (!typed) { hideSuggest(); markGrid(); return; }
    const list = suggestDescriptions(typed);
    if (!list.length) { hideSuggest(); markGrid(); return; }
    suggest.innerHTML = list.map(d =>
      `<button type="button" class="suggestion-item" data-d="${escapeHTML(d)}">${escapeHTML(d)}</button>`).join('');
    suggest.classList.remove('is-hidden');
    markGrid();
  };

  // ⚠ pointerdown, NOT click. A click races the blur teardown and iOS loses the
  // tap entirely — this cost the parent app a hotfix.
  suggest.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.suggestion-item');
    if (!btn) return;
    e.preventDefault();
    desc.value = btn.getAttribute('data-d') || '';
    hideSuggest();
    markGrid();
  });
  desc.addEventListener('input', paintSuggest);

  if (picks.length) {
    sheet.querySelector('#ni-quick').addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-btn');
      if (!btn) return;
      desc.value = btn.getAttribute('data-q') || '';
      hideSuggest();
      markGrid();
    });
  }

  // V11 — the run stepper.
  //
  // ⚠ THE NOTE LINE NEVER WRAPS, AND THAT IS A LAYOUT RULE, NOT A STYLE. This
  // sheet's oldest rule (V1.1) is that nothing in it may change the height of
  // anything else in it while it is being used. "10 items: PAT-0998 to PAT-1007"
  // is long enough to wrap on a phone at a count the engineer reaches by
  // tapping, which would push Cancel and Continue down under the thumb already
  // travelling towards them. `.run-note` is nowrap + ellipsis for that reason.
  if (canRun) {
    const countEl = sheet.querySelector('#ni-count');
    const noteEl = sheet.querySelector('#ni-runnote');
    const paintRun = () => {
      countEl.textContent = String(runCount);
      if (runCount < 2) { noteEl.textContent = 'Just this one'; return; }
      const codes = runCodesFrom(code, runCount);
      const clash = firstClashInRun(codes);
      // ⚠ THE CLASH IS SHOWN HERE, WHILE THEY ARE STILL AT THE SHELF (3A). By
      // the time Continue is pressed the engineer has stopped reading labels;
      // by the time PASS is pressed they have moved on. This is the last moment
      // the message "1004 is already logged" can be acted on cheaply.
      noteEl.textContent = clash
        ? clash + ' is already logged — shorten the run'
        : runCount + ' items: ' + runRangeLabel(codes);
      noteEl.classList.toggle('is-warn', !!clash);
    };
    sheet.querySelector('.runrow').addEventListener('click', (e) => {
      const btn = e.target.closest('.run-step');
      if (!btn) return;
      runCount = clampInt(runCount + parseInt(btn.getAttribute('data-run'), 10), 1, RUN_MAX, 1);
      paintRun();
    });
    paintRun();
  }

  sheet.querySelector('#ni-cancel').onclick = () => { closeSheet(); render(); };
  sheet.querySelector('#ni-ok').onclick = () => {
    const d = titleCaseWords(cleanText(desc.value, 80));
    if (!d) { showToast('Give it a description'); return; }
    // V5 — CLASS COMES FROM THE TOGGLE, NOT FROM THIS SHEET (decision 5). The
    // sheet used to ask, and refused to continue until it was answered: two
    // taps per item, on the one question whose answer is the same for a whole
    // run of appliances. The line above it says what will be recorded, so it is
    // stated rather than silent, and the "Pick a class" guard is gone because
    // there is no longer an unanswered state for it to catch — the toggle
    // always holds one of the two.
    // V11 — the run is refused HERE rather than at PASS. Everything after this
    // point is one tap away from the client's file, and an engineer who has
    // walked to the next room cannot do anything useful with "1004 is taken".
    if (canRun && runCount > 1) {
      const clash = firstClashInRun(runCodesFrom(code, runCount));
      if (clash) { showToast(clash + ' is already logged'); return; }
    }
    closeSheet();
    state.pending = {
      code: code,
      mode: MODE_INITIAL,
      description: d,
      cls: state.itemClass,
      visual: state.visualMode === true,
      count: canRun ? runCount : 1,
    };
    render();
  };

  // ⚠ V1.1: THE BOX IS ONLY FOCUSED WHEN THERE IS NO GRID TO COVER. Focusing it
  // raises the keyboard, which on a phone hides the very grid the engineer is
  // meant to tap — so the one-tap path would be buried behind the slow path.
  // With no preset items there is nothing to hide, and the keyboard up front is
  // then the fastest thing we can do.
  if (!picks.length) {
    setTimeout(() => focusSheetField(desc), 60);
  }
}

// Initial mode, location scanned: gather client, floor, room.
function openNewLocationSheet(code) {
  const sheet = _openSheet('New location');
  const existing = findLocationByCode(code);
  sheet.innerHTML = `
    <h3 class="sheet-title">New location</h3>
    <p class="sheet-code">${escapeHTML(code)}</p>
    <label class="lbl" for="nl-client">Client</label>
    <input type="text" id="nl-client" class="field" autocomplete="off" autocapitalize="words"
           value="${escapeHTML(existing ? existing.client : _lastLocationField('client'))}">
    <label class="lbl" for="nl-floor">Floor</label>
    <input type="text" id="nl-floor" class="field" autocomplete="off" autocapitalize="words"
           value="${escapeHTML(existing ? existing.floor : _lastLocationField('floor'))}">
    <label class="lbl" for="nl-room">Room</label>
    <input type="text" id="nl-room" class="field" autocomplete="off" autocapitalize="words"
           value="${escapeHTML(existing ? existing.room : '')}">
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="nl-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="nl-ok">Save location</button>
    </div>`;

  sheet.querySelector('#nl-cancel').onclick = () => { closeSheet(); render(); };
  sheet.querySelector('#nl-ok').onclick = () => {
    const fields = {
      client: cleanText(sheet.querySelector('#nl-client').value, 80),
      floor: cleanText(sheet.querySelector('#nl-floor').value, 60),
      room: cleanText(sheet.querySelector('#nl-room').value, 60),
    };
    if (!fields.room) { showToast('Give the room a name'); return; }
    closeSheet();
    addLocationRecord(code, MODE_INITIAL, fields);
    showToast('Location set');
    render();
  };
  // ⚠ V3: focusSheetField, NOT a bare .focus(). Room is the third field and the
  // furthest down the sheet, so it was the worst possible one to raise the
  // keyboard on — see the keyboard-fix note at the top of the sheets block in
  // feedback.js. Room stays the focused field; it is the one that is always
  // different, and a pre-filled or unfocused room is how twenty items end up
  // labelled with the wrong one.
  setTimeout(() => focusSheetField(sheet.querySelector('#nl-room')), 60);
}

// Client and floor barely change through a building, so the last ones used are
// offered again. Room never is — that is the one field that is always different
// and a pre-filled room is how the wrong room ends up on twenty items.
function _lastLocationField(field) {
  const locs = state.records.filter(r => r.type === 'location' && isNonEmptyString(r[field]));
  if (!locs.length) return '';
  locs.sort(byNewest);
  return locs[0][field];
}

// ⚠ onCancel IS NOT OPTIONAL DECORATION. Opening this sheet destroys whatever
// sheet was open (one sheet at a time, by construction), so a caller that had
// its own half-finished form — the edit sheet — has to be handed a way back.
// Without it, tapping FAIL and then changing your mind drops you on the log with
// your other edits silently thrown away. Default stays render() for the scan
// path, where there is nothing to go back to.
function openFailSheet(onPick, onCancel) {
  const back = (typeof onCancel === 'function') ? onCancel : () => render();
  const sheet = _openSheet('Fail reason');
  sheet.innerHTML = `
    <h3 class="sheet-title">Why did it fail?</h3>
    <div class="reasonlist">
      ${state.failReasons.map(r =>
        `<button type="button" class="reason" data-r="${escapeHTML(r)}">${escapeHTML(r)}</button>`).join('')}
      <button type="button" class="reason is-other" data-r="__other">Other…</button>
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="fs-cancel">Cancel</button>
    </div>`;

  sheet.querySelector('#fs-cancel').onclick = () => { closeSheet(); back(); };
  sheet.querySelector('.reasonlist').addEventListener('click', (e) => {
    const btn = e.target.closest('.reason');
    if (!btn) return;
    const r = btn.getAttribute('data-r');
    closeSheet();
    if (r === '__other') {
      openNameSheet({
        title: 'Fail reason',
        placeholder: 'Describe the fault',
        confirmLabel: 'Use this',
        onConfirm: (v) => {
          const t = cleanText(v, 120);
          if (!t) { back(); return; }
          onPick(t);
        },
        onCancel: back,
      });
      return;
    }
    onPick(r);
  });
}

// V4 — the move picker. Which location an item belongs to, chosen from the
// ones already in the log.
//
// ⚠ IT CAN ONLY OFFER LOCATIONS THAT EXIST. That is not a limitation to work
// around, it is the answer to the question the backlog raised: an item cannot
// be moved to a location that has never been scanned, so there is never an item
// row in the export pointing at a location row that is not in the file.
//
// ⚠ NO SCANNING FROM HERE, DELIBERATELY. The obvious gesture — stand in the
// room and scan its label — cannot work: the scanner refuses to collect while
// a sheet is open, by construction since V1, and mutation M24 and M78 both
// exist to keep it that way. Doing it properly means a new armed mode in the
// dispatch grammar. It is in the backlog, not smuggled in here.
//
// ⚠ THE LIST IS BUILT ONCE AND NEVER REBUILT while the sheet lives — the same
// rule the Quick Pick grid follows. Nothing here re-sorts or re-filters under
// the finger.
//
// ⚠ V10 — `sessionId` IS THE ITEM'S SESSION, NOT THE CURRENT ONE, and passing
// it is not optional at the call site. The log lists every session, so this
// sheet opens on items from other batches; before V10 it offered them today's
// locations, which would file an item under a location its own export lacks.
// See the note on locationChoices() for the full reasoning.
function openLocationPickerSheet(currentId, onPick, onCancel, sessionId) {
  const back = (typeof onCancel === 'function') ? onCancel : () => render();
  const sheet = _openSheet('Location');
  const otherSession = isNonEmptyString(sessionId) && sessionId !== state.currentSessionId;
  const rows = locationChoices(3, sessionId);

  const body = rows.length
    ? `<div class="reasonlist">
        ${rows.map(row => {
          const loc = row.rec;
          const label = locationLabel(loc);
          // locationLabel() returns the bare code for an unnamed location, so
          // the sub-line must not print it a second time — "L-204 · L-204 ·
          // 09:42" is how a row stops being readable at a glance.
          const named = label !== loc.code;
          const sub = [named ? loc.code : '', timeOfDay(loc.ts),
            row.count + (row.count === 1 ? ' item' : ' items')]
            .filter(isNonEmptyString).join(' · ');
          return `
          <button type="button" class="locpick${loc.id === currentId ? ' is-on' : ''}" data-loc="${escapeHTML(loc.id)}">
            <span class="locpick-main">${escapeHTML(label)}</span>
            <span class="locpick-sub">${escapeHTML(sub)}</span>
            ${row.samples.length
              ? `<span class="locpick-items">${escapeHTML(row.samples.join(', '))}</span>`
              : ''}
          </button>`;
        }).join('')}
      </div>`
    // ⚠ V10 — TWO DIFFERENT EMPTINESSES AND ONLY ONE OF THEM IS FIXABLE HERE.
    // "Go and scan one" is good advice for the batch you are working in and
    // useless for somebody else's: scanning a location now puts it in TODAY's
    // session, which is exactly the list this item may not be offered.
    : otherSession
      ? `<p class="muted">That item belongs to another session, and nothing was scanned as a location in it. There is nowhere to move it to.</p>`
      : `<p class="muted">No locations scanned yet. Scan a location barcode first, then come back.</p>`;

  sheet.innerHTML = `
    <h3 class="sheet-title">Which location?</h3>
    <p class="sheet-body">Moving this item files it under a different location in the export. Nothing else about it changes.${otherSession
      ? ' This item is in another session, so the list is that session\'s locations.'
      : ''}</p>
    ${body}
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="lp-cancel">Cancel</button>
    </div>`;

  sheet.querySelector('#lp-cancel').onclick = () => { closeSheet(); back(); };
  if (rows.length) {
    sheet.querySelector('.reasonlist').addEventListener('click', (e) => {
      const btn = e.target.closest('.locpick');
      if (!btn) return;
      const locId = btn.getAttribute('data-loc');
      closeSheet();
      onPick(locId);
    });
  }
}

// The correction path. One sheet for both record types.
//
// ⚠ V1.1: `draft` IS HOW THE SHEET SURVIVES A TRIP TO THE REASON PICKER. Opening
// any other sheet destroys this one, so before leaving we snapshot the fields as
// they stand and pass them back in on the way home. Without it, correcting an
// item to FAIL would discard the description or class you had just fixed in the
// same visit — a silent data loss on the screen whose entire job is putting data
// right. `draft` is a plain object, not state, so it cannot outlive the round
// trip or survive navigation (rule 4 has nothing to clear).
function openEditSheet(id, draft) {
  const rec = recordById(id);
  if (!rec) return;
  const sheet = _openSheet('Edit record');

  if (rec.type === 'location') {
    sheet.innerHTML = `
      <h3 class="sheet-title">Location</h3>
      <p class="sheet-code">${escapeHTML(rec.code)}</p>
      <label class="lbl" for="ed-client">Client</label>
      <input type="text" id="ed-client" class="field" value="${escapeHTML(rec.client)}" autocapitalize="words">
      <label class="lbl" for="ed-floor">Floor</label>
      <input type="text" id="ed-floor" class="field" value="${escapeHTML(rec.floor)}" autocapitalize="words">
      <label class="lbl" for="ed-room">Room</label>
      <input type="text" id="ed-room" class="field" value="${escapeHTML(rec.room)}" autocapitalize="words">
      <div class="sheet-actions">
        <button type="button" class="btn btn-danger" id="ed-del">Delete</button>
        <button type="button" class="btn btn-ghost" id="ed-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="ed-ok">Save</button>
      </div>`;
    sheet.querySelector('#ed-ok').onclick = () => {
      updateRecordFields(id, {
        client: sheet.querySelector('#ed-client').value,
        floor: sheet.querySelector('#ed-floor').value,
        room: sheet.querySelector('#ed-room').value,
      });
      closeSheet(); showToast('Saved'); render();
    };
  } else {
    // The draft wins over the record where it exists — it is the newer truth,
    // holding edits made in this visit that have not been saved yet.
    const d = draft || {};
    const curDesc = (typeof d.description === 'string') ? d.description : rec.description;
    const curCls = (typeof d.cls === 'string') ? d.cls : rec.cls;
    // V5. ⚠ `typeof === 'boolean'` again — a draft holding `false` is a real
    // answer ("I just unticked Visual"), and testing truthiness would throw it
    // away and fall back to the record on every round trip out to another sheet.
    const curVis = (typeof d.visual === 'boolean') ? d.visual : (rec.visual === true);
    const curRes = (typeof d.result === 'string') ? d.result : rec.result;
    const curReason = (typeof d.failReason === 'string') ? d.failReason : rec.failReason;
    // V6 — the readings join the draft for the same reason everything else did:
    // this sheet has two round trips out to other sheets and opening either
    // destroys it. A field left out of the snapshot is a field silently
    // reverted the moment the engineer taps Change.
    const curEarth = (typeof d.earthBond === 'string') ? d.earthBond : (rec.earthBond || '');
    const curIns = (typeof d.insulation === 'string') ? d.insulation : (rec.insulation || '');

    // V4: the location is now changeable, and the draft carries the PICKED one
    // — see the note on locationLineFor() in log.js. It became a .reasonrow
    // rather than the old read-only .metarow because it is now the same shape
    // of thing as the fail reason: a value, and a way to change it. The
    // deliberate visual difference between the two rows was the whole point of
    // .metarow, and it stops being true the moment the row is tappable.
    const curLocId = (typeof d.locationId === 'string') ? d.locationId : rec.locationId;
    const locLine = locationLineFor(curLocId, rec.locationCode);
    const picks = quickPickItems();

    sheet.innerHTML = `
      <h3 class="sheet-title">Item</h3>
      <p class="sheet-code">${escapeHTML(rec.code)}</p>
      <div class="reasonrow" id="ed-locrow">
        <span class="reasonrow-label">Location</span>
        <span class="reasonrow-value" id="ed-loctext">${locLine
          ? escapeHTML(locLine)
          : 'Not recorded'}</span>
        <button type="button" class="linkbtn" id="ed-locchange">Change</button>
        ${inCurrentSession(rec)
          ? '<button type="button" class="linkbtn" id="ed-locscan">Save &amp; scan</button>'
          : ''}
      </div>
      ${inCurrentSession(rec) ? '' :
        '<p class="sheet-note">This item is in another session. Change lists that session\'s locations; scanning one is not offered, because the room you are stood in belongs to this session.</p>'}
      <label class="lbl" for="ed-desc">Description</label>
      ${picks.length ? `<div class="quick-grid" id="ed-quick">
        ${picks.map(p => `<button type="button" class="quick-btn" data-q="${escapeHTML(p)}">${escapeHTML(p)}</button>`).join('')}
      </div>` : ''}
      <div class="desc-wrap">
        <input type="text" id="ed-desc" class="field" value="${escapeHTML(curDesc)}"
               autocomplete="off" autocapitalize="words" spellcheck="false">
        <div id="ed-suggest" class="suggest is-hidden"></div>
      </div>
      <label class="lbl">Class</label>
      <div class="classpick" id="ed-class">
        ${CLASS_OPTIONS.map(c => `<button type="button" class="class-opt${curCls === c ? ' is-on' : ''}" data-cls="${c}">Class ${c}</button>`).join('')}
      </div>
      <label class="lbl">Inspection</label>
      <div class="classpick" id="ed-visual">
        <button type="button" class="class-opt${curVis ? '' : ' is-on'}" data-vis="0">Test</button>
        <button type="button" class="class-opt${curVis ? ' is-on' : ''}" data-vis="1">Visual</button>
      </div>
      <label class="lbl">Result</label>
      <div class="classpick" id="ed-result">
        <button type="button" class="class-opt${curRes === 'pass' ? ' is-on' : ''}" data-res="pass">PASS</button>
        <button type="button" class="class-opt${curRes === 'fail' ? ' is-on' : ''}" data-res="fail">FAIL</button>
      </div>
      <label class="lbl">Readings</label>
      <div class="readrow">
        <div class="readcell">
          <span class="readcell-label">Earth bond</span>
          <input type="text" id="ed-earth" class="field" value="${escapeHTML(curEarth)}"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 ${(curVis || curCls === CLASS_NO_EARTH_BOND) ? 'disabled' : ''}>
        </div>
        <div class="readcell">
          <span class="readcell-label">Insulation</span>
          <input type="text" id="ed-ins" class="field" value="${escapeHTML(curIns)}"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 ${curVis ? 'disabled' : ''}>
        </div>
      </div>
      <p class="muted small">Blank means no reading was taken — that is what marks a row as a visual inspection rather than a full test.</p>
      <div class="reasonrow${curRes === 'fail' ? '' : ' is-hidden'}" id="ed-reasonrow">
        <span class="reasonrow-label">Fail reason</span>
        <span class="reasonrow-value" id="ed-reasontext">${escapeHTML(curReason || 'Not set')}</span>
        <button type="button" class="linkbtn" id="ed-reasonchange">Change</button>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn btn-danger" id="ed-del">Delete</button>
        <button type="button" class="btn btn-ghost" id="ed-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="ed-ok">Save</button>
      </div>`;

    let cls = curCls;
    let vis = curVis;
    let res = curRes;
    let reason = curReason;
    let locId = curLocId;

    // Everything typed or tapped so far, in the shape openEditSheet takes back.
    // ⚠ V4: `locationId` JOINS THE DRAFT AND IT IS NOT DECORATION. The picker
    // is a sheet, and opening any sheet destroys this one — so without it,
    // changing the location would silently discard the description you had just
    // fixed in the same visit. That is the exact loss `draft` was invented for
    // in V1.1 on the reason picker; a second round trip needs the same care.
    const snapshot = () => ({
      description: sheet.querySelector('#ed-desc').value,
      cls: cls,
      // ⚠ V5 JOINS THE DRAFT for the same reason locationId did in V4. This
      // sheet has two round trips out to other sheets (the location picker and
      // the fail reason picker) and opening either destroys this one. A field
      // left out of the snapshot is a field silently reverted the moment the
      // engineer taps Change — and Visual is one tap next to Class, so the two
      // most likely edits sit next to each other.
      visual: vis,
      result: res,
      failReason: reason,
      locationId: locId,
      earthBond: sheet.querySelector('#ed-earth').value,
      insulation: sheet.querySelector('#ed-ins').value,
    });

    // V4. Same shape as askReason() below: snapshot, leave, come home.
    const askLocation = () => {
      const draftNow = snapshot();
      closeSheet();
      openLocationPickerSheet(
        locId,
        (picked) => {
          draftNow.locationId = picked;
          openEditSheet(id, draftNow);
        },
        () => openEditSheet(id, draftNow),
        // V10 — THE RECORD'S session, read fresh rather than captured, because
        // this closure outlives the sheet that made it.
        rec.sessionId
      );
    };

    sheet.querySelector('#ed-locchange').onclick = askLocation;

    // V4 — the description field now behaves as the new item sheet's does: a
    // static Quick Pick grid and an overlaid suggestion list. Both rules from
    // that sheet carry over intact: the grid is never rebuilt, and the dropdown
    // is absolutely positioned so showing it moves nothing below it.
    //
    // ⚠ NOTHING HERE FOCUSES THE FIELD. The V1.1 rule holds: raising the
    // keyboard would bury the very grid the engineer is meant to tap.
    const edDesc = sheet.querySelector('#ed-desc');
    const edSuggest = sheet.querySelector('#ed-suggest');

    const edMarkGrid = () => {
      const v = cleanText(edDesc.value, 80).toLowerCase();
      sheet.querySelectorAll('.quick-btn').forEach(b =>
        b.classList.toggle('is-on', (b.getAttribute('data-q') || '').toLowerCase() === v));
    };

    const edHideSuggest = () => {
      edSuggest.innerHTML = '';
      edSuggest.classList.add('is-hidden');
    };

    const edPaintSuggest = () => {
      const typed = cleanText(edDesc.value, 80);
      if (!typed) { edHideSuggest(); edMarkGrid(); return; }
      const list = suggestDescriptions(typed);
      if (!list.length) { edHideSuggest(); edMarkGrid(); return; }
      edSuggest.innerHTML = list.map(x =>
        `<button type="button" class="suggestion-item" data-d="${escapeHTML(x)}">${escapeHTML(x)}</button>`).join('');
      edSuggest.classList.remove('is-hidden');
      edMarkGrid();
    };

    // ⚠ pointerdown, NOT click — a click races the blur teardown and iOS loses
    // the tap. This cost the parent app a hotfix and it is no different here.
    edSuggest.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.suggestion-item');
      if (!b) return;
      e.preventDefault();
      edDesc.value = b.getAttribute('data-d') || '';
      edHideSuggest();
      edMarkGrid();
    });
    edDesc.addEventListener('input', edPaintSuggest);

    if (picks.length) {
      sheet.querySelector('#ed-quick').addEventListener('click', (e) => {
        const b = e.target.closest('.quick-btn');
        if (!b) return;
        edDesc.value = b.getAttribute('data-q') || '';
        edHideSuggest();
        edMarkGrid();
      });
    }

    // ⚠ THE SAME PICKER THE SCAN SCREEN USES, not a second copy of the list. One
    // list, one behaviour: a reason edited in Settings changes both at once, and
    // the Other… path is already handled there.
    const askReason = () => {
      const draftNow = snapshot();
      draftNow.result = 'fail';
      closeSheet();
      openFailSheet(
        (picked) => {
          draftNow.failReason = picked;
          openEditSheet(id, draftNow);
        },
        // Backing out keeps the fail selected but leaves the reason as it was —
        // the engineer said FAIL and meant it; they just did not choose a reason
        // this second. Save still refuses without one.
        () => openEditSheet(id, draftNow)
      );
    };

    sheet.querySelector('#ed-class').addEventListener('click', (e) => {
      const b = e.target.closest('.class-opt'); if (!b) return;
      cls = b.getAttribute('data-cls');
      sheet.querySelectorAll('#ed-class .class-opt').forEach(x => x.classList.toggle('is-on', x === b));
      // ⚠ V6: THE EARTH BOND FIELD FOLLOWS THE CLASS, LIVE. Class II has no
      // earth to bond, so switching to it here empties and disables the field
      // rather than leaving a figure on screen that Save would silently drop.
      // Seeing the value disappear is the point — it is the moment the engineer
      // learns the rule.
      const earthEl = sheet.querySelector('#ed-earth');
      if (cls === CLASS_NO_EARTH_BOND) { earthEl.value = ''; earthEl.disabled = true; }
      else { earthEl.disabled = false; }
    });

    sheet.querySelector('#ed-visual').addEventListener('click', (e) => {
      const b = e.target.closest('.class-opt'); if (!b) return;
      vis = b.getAttribute('data-vis') === '1';
      sheet.querySelectorAll('#ed-visual .class-opt').forEach(x => x.classList.toggle('is-on', x === b));
      // ⚠ V6: THE READINGS FOLLOW THE INSPECTION TYPE, LIVE, and the engineer
      // has to SEE it happen. Under decision 3B an empty reading is the only
      // thing that marks a row as an inspection rather than a test, so a switch
      // to Visual that left figures on screen would be showing a row the file
      // will not contain. updateRecordFields() enforces the same rule on save —
      // this is so the sheet does not lie in the meantime.
      const earthEl = sheet.querySelector('#ed-earth');
      const insEl = sheet.querySelector('#ed-ins');
      if (vis) {
        earthEl.value = ''; insEl.value = '';
      } else if (!earthEl.value && !insEl.value) {
        // Seeds a gap, never overwrites a figure the engineer typed.
        insEl.value = state.insulationValue || '';
        if (cls !== CLASS_NO_EARTH_BOND) earthEl.value = state.earthBondValue || '';
      }
      earthEl.disabled = vis || cls === CLASS_NO_EARTH_BOND;
      insEl.disabled = vis;
    });

    sheet.querySelector('#ed-result').addEventListener('click', (e) => {
      const b = e.target.closest('.class-opt'); if (!b) return;
      res = b.getAttribute('data-res');
      sheet.querySelectorAll('#ed-result .class-opt').forEach(x => x.classList.toggle('is-on', x === b));
      if (res === 'fail') {
        // V1.1: tapping FAIL raises the reason picker straight away, exactly as
        // it does on the scan screen. In V1 this was a text box with a dropdown
        // that nobody found, so corrections to FAIL went out with no reason.
        askReason();
        return;
      }
      // A pass has no reason. Leaving one behind would export a passed item
      // carrying "Damaged Lead" — the validator drops it on the way in, but the
      // engineer would have seen it on screen and believed it.
      reason = '';
      sheet.querySelector('#ed-reasontext').textContent = 'Not set';
      sheet.querySelector('#ed-reasonrow').classList.add('is-hidden');
    });

    sheet.querySelector('#ed-reasonchange').onclick = askReason;

    // V9. ⚠ EXTRACTED SO THE MOVE CAN COMMIT IT FIRST (decision 3A). Arming a
    // move closes this sheet, and closing this sheet destroys the draft — the
    // exact loss V4 and V5 kept adding fields to snapshot() to prevent. There
    // is no snapshot to come home to here, because the whole point is that the
    // engineer walks away from the phone and scans a room, so the draft is
    // SAVED rather than carried. The button says so: "Save & scan".
    //
    // Returns false if it refused, so the caller knows not to carry on.
    const saveAll = () => {
      if (res === 'fail' && !cleanText(reason, 120)) {
        showToast('Pick a fail reason');
        askReason();
        return false;
      }
      updateRecordFields(id, {
        description: titleCaseWords(sheet.querySelector('#ed-desc').value),
        cls: cls,
        visual: vis,
        result: res,
        failReason: reason,
        locationId: locId,
        earthBond: sheet.querySelector('#ed-earth').value,
        insulation: sheet.querySelector('#ed-ins').value,
      });
      return true;
    };

    sheet.querySelector('#ed-ok').onclick = () => {
      if (!saveAll()) return;
      closeSheet(); showToast('Saved'); render();
    };

    // V9 — scan-to-move. Save, close, land on the log armed and waiting.
    //
    // ⚠ V10 — THE BUTTON IS CONDITIONAL NOW, SO THIS MUST BE GUARDED. An
    // out-of-session item does not get one (2A); querySelector returns null and
    // an unguarded .onclick here would throw INSIDE THE SHEET BUILDER, leaving
    // a half-wired edit sheet on screen with no Save and no Cancel.
    const locScan = sheet.querySelector('#ed-locscan');
    if (locScan) {
      locScan.onclick = () => {
        if (!saveAll()) return;
        armMove(id);
      };
    }
  }

  sheet.querySelector('#ed-cancel').onclick = () => { closeSheet(); render(); };
  sheet.querySelector('#ed-del').onclick = () => {
    closeSheet();
    openConfirmSheet({
      title: 'Delete this record?',
      body: 'It will be removed from the log and from any future export.',
      confirmLabel: 'Delete', danger: true,
      onConfirm: () => { deleteRecord(id); showToast('Deleted'); render(); },
      onCancel: () => render(),
    });
  };
}
