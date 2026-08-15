/*
 * 05-scanner — burst detection. The most load-bearing file in the app.
 * (c) 2026 Peter Birchley. All rights reserved.
 */

const A = require('../assert');
const F = require('../fixture');
const L = require('../load');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');

  A.group('05a the listener is actually wired to document', () => {
    // ⚠ THE HOLE THIS EXISTS TO CLOSE. The parent app went three releases with
    // initScanner() never called, because two dozen test groups all invoked the
    // handler directly and passed. Every other group in this file goes through
    // document.dispatch for the same reason.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    F.burst(app, 'AST-2001');
    A.eq('a scan through document reached the app', !!st.pending, true);
    A.eq('the right code arrived', st.pending && st.pending.code, 'AST-2001');
  });

  A.group('05b a human typing is not a scan', () => {
    // The whole safety mechanism. One slow gap and the buffer is discarded.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    // ⚠ THIS GAP HAS TO SIT BETWEEN TWO MOVING NUMBERS, and getting it wrong
    // makes the test pass for the wrong reason rather than fail. It must be
    // ABOVE the normal preset (V2: 90) so the burst is rejected on SPEED, and
    // BELOW scanEndMs() (V2: 90 + 70 = 160) so the characters still accumulate
    // into one burst — above that the buffer restarts every character and the
    // rejection is "too short", which tests nothing about the speed rule.
    // 130 sits mid-window. It was 100 in V1, which V2's rise to a 90 preset
    // left with 10ms of headroom; it still passed, which is exactly why this
    // needed catching by reading it rather than by running it.
    F.burst(app, 'AST-2001', { gap: 130 });
    A.eq('nothing pending', st.pending, null);
    A.eq('and it was the speed rule that rejected it',
      (app.fn('_scanVerdict')() || {}).ok, undefined);
  });

  A.group('05c one slow gap in the middle kills the whole burst', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    let t = F.nextWindow();
    const realNow = Date.now;
    Date.now = () => t;
    try {
      const text = 'AST-2001';
      for (let i = 0; i < text.length; i++) {
        app.doc.dispatch('keydown', F.mkKey(text.charAt(i)));
        // One human-length pause. Same window as 05b: above the preset, below
        // scanEndMs(). Was 95 in V1 and had 5ms of margin left after V2.
        t += (i === 4) ? 130 : 8;
      }
      app.doc.dispatch('keydown', F.mkKey('Enter'));
    } finally { Date.now = realNow; }
    A.eq('rejected', st.pending, null);
  });

  A.group('05d too short is rejected', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    F.burst(app, 'AB');
    A.eq('two characters is not a barcode', st.pending, null);
  });

  A.group('05e a Shift mid-burst does not destroy the barcode', () => {
    // ⚠ A scanner sending an uppercase character emits Shift first. Treating
    // that as "burst over" broke every barcode containing capitals.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    F.burstWithModifier(app, 'AST2001', 3, 'Shift');
    A.eq('survived intact', st.pending && st.pending.code, 'AST2001');
  });

  A.group('05f every true modifier passes through', () => {
    const mods = ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock'];
    mods.forEach((m) => {
      F.resetApp(app);
      F.onScanScreenWithLocation(app, 'LOC-1');
      F.burstWithModifier(app, 'AST2001', 3, m);
      A.eq(m + ' does not end the burst', st.pending && st.pending.code, 'AST2001');
    });
  });

  A.group('05g a non-modifier unreadable key DROPS the burst', () => {
    // ⚠ ASYMMETRIC ON PURPOSE. Skipping a key that DID produce a character
    // would deliver a SHORT asset number — plausible-looking and wrong, into
    // the client's system. Dropping the whole burst is visible and harmless.
    ['F5', 'Escape', 'ArrowLeft', 'Backspace'].forEach((k) => {
      F.resetApp(app);
      F.onScanScreenWithLocation(app, 'LOC-1');
      F.burstWithModifier(app, 'AST2001', 3, k);
      // ⚠ null, and specifically NOT '2001'. Dropping the buffer alone left the
      // tail of the transmission to arrive as its own short, fast, entirely
      // plausible scan. This assertion is the poison window.
      A.eq(k + ' drops the whole burst', st.pending, null);
    });
  });

  A.group('05h auto-repeat is excluded', () => {
    // A held key repeats at machine speed and would sail through the speed test.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    let t = F.nextWindow();
    const realNow = Date.now;
    Date.now = () => t;
    try {
      'AAAAAAAA'.split('').forEach(() => {
        app.doc.dispatch('keydown', F.mkKey('A', { repeat: true }));
        t += 6;
      });
      app.doc.dispatch('keydown', F.mkKey('Enter'));
    } finally { Date.now = realNow; }
    A.eq('a held key is not a scan', st.pending, null);
  });

  A.group('05i the terminator is swallowed, characters never are', () => {
    // ⚠ This is what stops the scanner breaking normal typing. At the moment a
    // character arrives we do not yet know if the burst is a scan.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    let t = F.nextWindow();
    const realNow = Date.now;
    Date.now = () => t;
    let charEv = null, endEv = null;
    try {
      const text = 'AST2001';
      for (let i = 0; i < text.length; i++) {
        charEv = F.mkKey(text.charAt(i));
        app.doc.dispatch('keydown', charEv);
        t += 8;
      }
      endEv = F.mkKey('Enter');
      app.doc.dispatch('keydown', endEv);
    } finally { Date.now = realNow; }
    A.eq('last character was NOT preventDefaulted', charEv._prevented, false);
    A.eq('terminator WAS preventDefaulted', endEv._prevented, true);
  });

  A.group('05j Tab works as a terminator too', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    F.burst(app, 'AST2001', { terminator: 'Tab' });
    A.eq('Tab-terminated scan accepted', st.pending && st.pending.code, 'AST2001');
  });

  A.group('05k the speed preset is resolved fresh each burst', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.scanSpeed = 'strict';
    F.burst(app, 'AST2001', { gap: 75 });
    A.eq('75ms rejected under strict (40ms)', st.pending, null);

    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.scanSpeed = 'relaxed';
    F.burst(app, 'AST2001', { gap: 75 });
    A.eq('75ms accepted under relaxed (90ms)', st.pending && st.pending.code, 'AST2001');
  });

  A.group('05l an unknown speed preset falls back, never to undefined', () => {
    // ⚠ An undefined threshold makes every comparison false and rejects every
    // burst forever — the silent failure this design exists to remove.
    st.scanSpeed = 'ludicrous';
    const gap = app.fn('scanMaxGapMs')();
    A.eq('falls back to the default', gap, app.val('SCAN_GAP_PRESETS')[app.val('SCAN_SPEED_DEFAULT')]);
    st.scanSpeed = app.val('SCAN_SPEED_DEFAULT');
  });

  A.group('05m scans are refused where they do not belong', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');

    st.scannerEnabled = false;
    A.eq('off means no target', app.fn('_scanTarget')(), null);
    st.scannerEnabled = true;

    st.welcomeSeen = false;
    A.eq('welcome modal blocks', app.fn('_scanTarget')(), null);
    st.welcomeSeen = true;

    st.view = 'settings';
    A.eq('settings hub has no target', app.fn('_scanTarget')(), null);
    st.view = 'scan';

    A.ok('scan screen does have a target', !!app.fn('_scanTarget')());
  });

  A.group('05n a focused OTHER field is left alone', () => {
    // Hijacking a field the engineer deliberately tapped into would be worse
    // than a barcode landing visibly in the wrong box.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    const other = app.register('some-other-field');
    other.tagName = 'INPUT';
    app.doc.activeElement = other;
    A.eq('bails out', app.fn('_scanTarget')(), null);
    app.doc.activeElement = null;
  });

  A.group('05o the diagnostic log records rejections, and only on the test page', () => {
    F.resetApp(app);
    st.view = 'settingsScanner';
    app.register('scanner-test');
    st.scannerTestLog = [];
    F.burst(app, 'AST2001', { gap: 100 });   // accumulates, but too slow to be a scan
    A.eq('a rejection was logged', st.scannerTestLog.length, 1);
    A.eq('logged as rejected', st.scannerTestLog[0].ok, false);
    A.includes('and says why', st.scannerTestLog[0].why, 'too slow');

    // On the scan screen a human typing produces a rejection on every pause —
    // logging globally would bury the one entry that matters.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.scannerTestLog = [];
    F.burst(app, 'AST2001', { gap: 100 });
    A.eq('nothing logged from the scan screen', st.scannerTestLog.length, 0);
  });

  A.group('05p paired mode is gated on scannerPaired, not scannerEnabled', () => {
    // ⚠ Scanning is on for everybody; focusing a field by itself is only right
    // when a hardware keyboard is attached.
    F.resetApp(app);
    const el = F.onScanScreenWithLocation(app, 'LOC-1') && app.el('scan-input');
    app.doc.activeElement = null;
    st.scannerEnabled = true;
    st.scannerPaired = false;
    app.fn('focusScanInput')();
    A.eq('does nothing when not paired', app.doc.activeElement, null);
    st.scannerPaired = true;
    app.fn('focusScanInput')();
    A.eq('focuses when paired', app.doc.activeElement, el);
    A.eq('and selects, so a typed character replaces', el._selected, true);
    st.scannerPaired = false;
  });

  // -------------------------------------------------------------------------
  // V2 — the two-ceiling bug. Reported from the field: a scanner sending
  // characters 100–115ms apart had every scan silently rejected.
  // -------------------------------------------------------------------------

  A.group('05r the end-of-burst window always exceeds the gap limit', () => {
    // THE INVARIANT, and the reason V1 could not simply have its relaxed
    // preset raised. scanEndMs() is the boundary between "same burst" and "new
    // burst"; if it ever drops to or below the gap limit, a burst the limit
    // was widened to accept gets chopped into single characters and rejected
    // as too short. V1 shipped a flat 120 against a 90 preset — 30ms of margin
    // that nobody had written down. Asserted across EVERY preset, not just the
    // current one, so raising any of them re-runs this check.
    const presets = app.val('SCAN_GAP_PRESETS');
    const names = Object.keys(presets);
    A.eq('three presets', names.length, 3);
    names.forEach((name) => {
      st.scanSpeed = name;
      const limit = app.fn('scanMaxGapMs')();
      const end = app.fn('scanEndMs')();
      A.eq(name + ': the limit is the preset', limit, presets[name]);
      A.ok(name + ': the window is strictly above the limit', end > limit);
    });
    st.scanSpeed = app.val('SCAN_SPEED_DEFAULT');
  });

  A.group('05s an unknown preset still leaves the window above the limit', () => {
    // The fallback path. A garbage stored value falls back to the default gap
    // limit — and the derived window has to follow it there, not sit at a
    // floor computed from something else.
    st.scanSpeed = 'nonsense-value';
    A.eq('gap falls back to the default',
      app.fn('scanMaxGapMs')(), app.val('SCAN_GAP_PRESETS')[app.val('SCAN_SPEED_DEFAULT')]);
    A.ok('and the window is still above it',
      app.fn('scanEndMs')() > app.fn('scanMaxGapMs')());
    st.scanSpeed = app.val('SCAN_SPEED_DEFAULT');
  });

  A.group('05t the field scanner is accepted on relaxed', () => {
    // THE ACTUAL BUG, as a test. 115ms is the top of the range measured in the
    // field. On V1's relaxed preset of 90 this was rejected as too slow; on
    // relaxed-150 it must land as a real scan, and it must reach `pending` —
    // not merely pass _scanVerdict, which would prove the judgement and not
    // the delivery.
    F.resetApp(app);
    st.scanSpeed = 'relaxed';
    F.onScanScreenWithLocation(app, 'LOC-1');
    F.burst(app, 'AST-2001', { gap: 115 });
    A.eq('the slow scan arrived', st.pending && st.pending.code, 'AST-2001');
    st.scanSpeed = app.val('SCAN_SPEED_DEFAULT');
  });

  A.group('05u relaxed still is not a free pass', () => {
    // Relaxing must not turn the speed rule off. 400ms between characters is
    // unambiguously a thumb, and has to stay rejected even at the loosest
    // setting — otherwise V2 has fixed a scanner by breaking the mechanism
    // that stops typing being logged as a scan.
    F.resetApp(app);
    st.scanSpeed = 'relaxed';
    F.onScanScreenWithLocation(app, 'LOC-1');
    F.burst(app, 'AST-2001', { gap: 400 });
    A.eq('nothing pending', st.pending, null);
    st.scanSpeed = app.val('SCAN_SPEED_DEFAULT');
  });

  A.group('05v the presets still discriminate', () => {
    // Three settings that behave identically are one setting with a confusing
    // UI. The same 115ms burst that relaxed accepts must be refused by strict.
    F.resetApp(app);
    st.scanSpeed = 'strict';
    F.onScanScreenWithLocation(app, 'LOC-1');
    F.burst(app, 'AST-2001', { gap: 115 });
    A.eq('strict refuses what relaxed took', st.pending, null);
    st.scanSpeed = app.val('SCAN_SPEED_DEFAULT');
  });

  A.group('05w no fixed end-of-burst constant survives — source guard', () => {
    // The behavioural tests above would all still pass if someone reintroduced
    // a flat constant that happened to be large enough today. The point of V2
    // is that the window is DERIVED, so assert the shape too.
    const src = L.stripComments(L.readFile('scanner.js'));
    A.ok('scanner.js no longer references a flat SCAN_END_MS',
      src.indexOf('SCAN_END_MS') === -1);
    A.ok('and the timer is scheduled from the derived value',
      src.indexOf('setTimeout(_scanTimeoutCommit, scanEndMs())') !== -1);
  });

  A.group('05q character keys are never preventDefaulted — source guard', () => {
    // Belt and braces alongside 05i: assert the SHAPE of the code, so an
    // optimisation that swallows keys early cannot slip through on a day when
    // the behavioural test happens to be passing for another reason.
    const src = L.readFile('scanner.js');
    const handler = src.slice(src.indexOf('function handleScannerKeydown'),
                              src.indexOf('function _scanTimeoutCommit'));
    const terminatorBlock = handler.slice(handler.indexOf("key === 'Enter'"),
                                          handler.indexOf('SCAN_MODIFIER_KEYS[key]'));
    const afterModifiers = handler.slice(handler.indexOf('SCAN_MODIFIER_KEYS[key]'));
    A.ok('preventDefault appears in the terminator branch', terminatorBlock.indexOf('preventDefault') !== -1);
    A.ok('and nowhere in the character path', afterModifiers.indexOf('preventDefault') === -1);
  });
};
