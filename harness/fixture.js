/*
 * PATGo Scan — harness/fixture.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Builders for test data, and the burst simulator.
 *
 * ⚠ THE FIXTURE MUST TEST THE OBJECT THE APP ACTUALLY USES. Building a
 * plausible-looking record by hand and asserting against THAT tests the
 * fixture, not the app — it is immune to the bug it was written for. Where a
 * test cares about a record's shape, make the app create it.
 *
 * ⚠ WHERE INPUT COMES FROM A DEVICE, USE THE BYTES THE DEVICE SENDS. A scanner
 * emits whatever is on the label, including characters that are awkward in
 * ASCII source. Do not quietly substitute convenient ones.
 */

// Feed a burst through the REAL document keydown listener, one character at a
// time, with a stated gap between them.
//
// ⚠ THIS GOES THROUGH document.dispatch, NOT through handleScannerKeydown
// directly. Calling the handler by hand passes even when initScanner() was
// never called — the parent app shipped exactly that hole for three releases
// because two dozen test groups all called the handler directly.
// ⚠ THE MOCK CLOCK MUST ONLY EVER GO FORWARDS. Each group used to pick its own
// start time, so time jumped backwards between groups — and any mechanism that
// remembers "ignore input until timestamp X" (the scanner's poison and
// terminator-swallow windows) then reads as still-armed in a group that mocked
// an earlier moment. That is a harness artefact with no real-world counterpart:
// a phone's clock does not rewind between scans. One shared, always-advancing
// counter removes the whole class.
let _clock = 1000000;

function nextWindow(gapFromPrevious) {
  _clock += (gapFromPrevious || 5000);
  return _clock;
}

function burst(app, text, opts) {
  const o = opts || {};
  const gap = typeof o.gap === 'number' ? o.gap : 8;
  let t = nextWindow();
  const realNow = Date.now;
  Date.now = () => t;
  try {
    for (let i = 0; i < text.length; i++) {
      app.doc.dispatch('keydown', mkKey(text.charAt(i)));
      t += gap;
    }
    if (o.terminator !== null) {
      app.doc.dispatch('keydown', mkKey(o.terminator || 'Enter'));
    }
    _clock = t;
  } finally {
    Date.now = realNow;
  }
}

function mkKey(key, extra) {
  const ev = Object.assign({
    key: key,
    repeat: false,
    ctrlKey: false, metaKey: false, altKey: false,
    _prevented: false,
    preventDefault() { this._prevented = true; },
  }, extra || {});
  return ev;
}

// A burst with a modifier keydown injected part-way, the way a scanner sending
// an uppercase character genuinely behaves.
function burstWithModifier(app, text, modifierAt, modifierKey) {
  let t = nextWindow();
  const realNow = Date.now;
  Date.now = () => t;
  try {
    for (let i = 0; i < text.length; i++) {
      if (i === modifierAt) app.doc.dispatch('keydown', mkKey(modifierKey || 'Shift'));
      app.doc.dispatch('keydown', mkKey(text.charAt(i)));
      t += 8;
    }
    app.doc.dispatch('keydown', mkKey('Enter'));
    _clock = t;
  } finally {
    Date.now = realNow;
  }
}

// Put the app on the scan screen with a location already in force, which is the
// state nearly every scan test needs.
function onScanScreenWithLocation(app, locCode) {
  const st = app.state();
  st.welcomeSeen = true;
  st.view = 'scan';
  st.scannerEnabled = true;
  st.pending = null;
  st.locationArmed = false;
  app.register('scan-input');
  app.fn('addLocationRecord')(locCode || 'LOC-001', app.val('MODE_AUDIT'), null);
  return st;
}

function resetApp(app) {
  // ⚠ TEARDOWN FIRST, AND THIS LINE IS LOAD-BEARING. A sheet left open by an
  // earlier group blocks the scanner completely — _scanTarget() bails on
  // sheetIsOpen() before it looks at anything else — so the next group's burst
  // silently collects nothing and its assertion fails pointing at the scanner,
  // which is nowhere near the actual fault. V2 lost real time to exactly that:
  // a group near the end of 05 opened a sheet and never closed it, and nothing
  // after it happened to scan until V2 added groups that did.
  //
  // It belongs here rather than in the offending group because the next one to
  // forget is the one nobody has written yet.
  if (app.fn('sheetIsOpen')()) app.fn('closeSheet')();

  // ⚠ AND THE FOCUS, FOR THE SAME REASON. render() replaces the elements in
  // #app wholesale, so a doc.activeElement set in an earlier group points at a
  // DETACHED node with the same id as the live one. The scanner's focus rule
  // then sees "the cursor is in some other INPUT" — because the node identity
  // differs even though the id matches — and bails without collecting. Null
  // means "nothing focused", which is the honest starting state for a group
  // that has not focused anything.
  app.doc.activeElement = null;

  const st = app.state();
  st.records = [];
  st.currentLocationId = '';
  st.pending = null;
  st.locationArmed = false;
  st.mode = app.val('MODE_AUDIT');
  // V5. ⚠ HARNESS DEFECT FOUND DURING THIS RELEASE, and it is the classic
  // shape: these two are STICKY BY DESIGN, so without resetting them here the
  // first group to flip a toggle silently sets it for every group that runs
  // after it. The failure surfaces in an unrelated group, pointing at code that
  // is working perfectly, and it moves about as tests are added or reordered.
  // Anything the app deliberately persists has to be reset here.
  st.visualMode = false;
  st.itemClass = app.val('ITEM_CLASS_DEFAULT');
  st.engineer = '';
  st.view = 'scan';
  st.welcomeSeen = true;
  st.logSearch = '';
  st.scannerTestLog = [];
  st.failReasons = app.fn('makeDefaultFailReasons')();
  st.descriptions = app.fn('makeSeedDescriptions')();
  // V1.1. Presets are reset from the same factory the app ships with, not from
  // a hand-built object — a fixture that invents its own preset shape would go
  // green against a validator that had stopped agreeing with the app.
  st.itemPresets = app.fn('makeDefaultPresets')();
  st.activePresetId = st.itemPresets[0].id;

  // V7. ⚠ SESSIONS ARE PERSISTENT STATE AND SO THEY GET RESET HERE, by exactly
  // the argument in the V5 note above. Worse than the toggles, though: a
  // session left behind by an earlier group means the next group's records are
  // stamped with ITS id, and every log helper is now scoped to the current
  // session — so the records would be written, saved, and INVISIBLE to
  // itemRecords(), logTotals() and the export. The failure would read as "the
  // export dropped everything" in a group that never touched sessions.
  //
  // ⚠ THE OPEN SESSION IS MADE BY THE APP, not built here. A hand-rolled
  // session object would go green against a validator that had stopped
  // agreeing with the app — the same trap the presets note above describes.
  st.sessions = [];
  st.currentSessionId = '';
  st.review = null;
  app.fn('ensureOpenSession')();
}

// --- V1.1 sheet helpers ----------------------------------------------------
//
// ⚠ THESE REACH THE SHEET THE WAY THE APP BUILT IT, through document.body. A
// test that inspected a sheet object it had constructed itself would pass even
// if the app never opened one.
function openSheetEl(app) {
  const body = app.doc.body;
  const backdrop = body.children[body.children.length - 1];
  return backdrop ? backdrop.children[0] : null;
}

// A stand-in for the button under the finger. `closest` on the real stub walks
// classList, so giving it the class and the data attribute is enough for the
// delegated handlers inside a sheet to treat it as a genuine tap target.
function tapTarget(app, className, attrs) {
  const { makeEl } = require('./stubs');
  const el = makeEl('button');
  el.classList.add(className);
  Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
  return el;
}

module.exports = { burst, burstWithModifier, mkKey, nextWindow, onScanScreenWithLocation, resetApp, openSheetEl, tapTarget };
