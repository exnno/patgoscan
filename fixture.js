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
  const st = app.state();
  st.records = [];
  st.currentLocationId = '';
  st.pending = null;
  st.locationArmed = false;
  st.mode = app.val('MODE_AUDIT');
  st.engineer = '';
  st.view = 'scan';
  st.welcomeSeen = true;
  st.logSearch = '';
  st.scannerTestLog = [];
  st.failReasons = app.fn('makeDefaultFailReasons')();
  st.descriptions = app.fn('makeSeedDescriptions')();
}

module.exports = { burst, burstWithModifier, mkKey, nextWindow, onScanScreenWithLocation, resetApp };
