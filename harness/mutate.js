#!/usr/bin/env node
/* PATGo test harness — mutation runner
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Usage: node harness/mutate.js [substring-filter]

   Breaks the app one deliberate way at a time and confirms the suite goes RED.
   A green suite proves nothing on its own — V65 shipped two assertions that
   tested nothing and V66 shipped four, every one of them looking green.

   TWO RUNNER DEFECTS FOUND IN V66, both fixed here permanently. Do not
   reintroduce either:

   1. The old runner matched the SUBSTRING "0 failed", so a run reporting
      "10 failed" scored as a PASS. This one anchors on the full phrase.
   2. A mutation that silently failed to apply also scored as a PASS. Every
      mutation below asserts its anchor exists in the source before running, and
      aborts loudly if it does not. */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '..');

/* Each mutation: a named, minimal break, and the reason it must be caught.
   Add one whenever a release adds an assertion — that is the whole discipline. */
const MUTATIONS = [
  {
    name: 'M01 boot guard stops checking for missing functions',
    file: 'boot.js',
    from: "if (typeof window[name] !== 'function') {",
    to:   'if (false) {',
    why:  'the partial-deploy guard is the thing standing between a bad deploy and data loss',
  },
  {
    name: 'M02 boot guard stops probing config.js',
    file: 'boot.js',
    from: "if (typeof WELCOME_KEY === 'undefined') {",
    to:   'if (false) {',
    why:  'this probe is what catches config.js failing to parse (the V61 white screen)',
  },
  {
    name: 'M03 the session codec drops unknown keys',
    file: 'storage.js',
    from: 'function encodeWithMap(obj, map, isSession) {',
    to:   'function encodeWithMap(obj, map, isSession) { obj = JSON.parse(JSON.stringify(obj)); for (const k of Object.keys(obj)) if (!map[k]) delete obj[k];',
    why:  'additive fields ride through the codec — that is why backupVersion stays 5',
  },
  {
    name: 'M04 buildBackup emits short codec keys',
    file: 'backup.js',
    from: '    clients: state.clients,',
    to:   '    clients: (state.clients || []).map(c => ({ i: c.id, n: c.name })),',
    why:  'backups must stay human-readable long-key JSON',
  },
  {
    name: 'M05 restore skips the readings validator',
    file: 'backup.js',
    from: 'const clean = normaliseItemReadings(it.readings);',
    to:   'const clean = it.readings;',
    why:  'a corrupt or hand-edited backup must not poison structured fields',
  },
  {
    name: 'M06 restore ignores the archived stats bucket',
    file: 'backup.js',
    from: 'state.archivedStats = normaliseArchivedStats(data.archivedStats);',
    to:   'state.archivedStats = data.archivedStats;',
    why:  'garbage must collapse to a safe default, and a pre-v59 backup has no key at all',
  },
  {
    name: 'M07 instrument resolution falls back to the global mirror',
    file: 'instruments.js',
    from: '    const stamped = findInstrument(sess.instrumentId);\n    if (stamped) return stamped;',
    to:   '    const stamped = findInstrument(sess.instrumentId);\n    if (false) return stamped;',
    why:  'THIS IS THE V66 DEFECT — old jobs printing today\u2019s instrument',
  },
  {
    name: 'M08 deleting an instrument stops snapshotting it onto jobs',
    file: 'instruments.js',
    from: '        if (s && s.instrumentId === id && !s.instrumentSnapshot) {',
    to:   '        if (false) {',
    why:  'without the snapshot those certificates silently fall back to today\u2019s instrument',
  },
  {
    name: 'M09 loadInstruments resurrects a deliberately emptied list',
    file: 'instruments.js',
    from: 'function loadInstruments() {',
    to:   'function loadInstruments() { localStorage.removeItem(INSTRUMENTS_KEY);',
    why:  'absence vs empty array — an emptied list must not re-seed from the legacy flat keys',
  },
  {
    name: 'M10 report.js reads the global mirror again',
    file: 'report.js',
    from: 'function buildReportDoc',
    to:   'function _reintroducedDefect() { return state.testerMake; }\nfunction buildReportDoc',
    why:  'the source guard is the ONLY cover for a path that cannot run headlessly',
  },
  {
    name: 'M11 csv.js reads the global mirror again',
    file: 'csv.js',
    from: 'function buildCSV(session) {',
    to:   'function buildCSV(session) { const _leak = state.calCertNo;',
    why:  'same defect at the export boundary, where it reaches the customer',
  },
  {
    name: 'M12 diagnostics start including site names',
    file: 'bugreport.js',
    from: "    ['JOBS', `${sessions.length} (${open} open, ${locked} locked)`],",
    to:   "    ['JOBS', `${sessions.length} (${open} open, ${locked} locked) ${sessions.map(s => s.site).join(',')}`],",
    why:  'THE PRIVACY RULE — a support email must never carry a customer\u2019s data',
  },
  {
    name: 'M13 captured errors get persisted to storage',
    file: 'bugreport.js',
    from: 'function recordBugError(kind, message, source, line) {',
    to:   "function recordBugError(kind, message, source, line) { try { localStorage.setItem('pat:lasterror', String(message)); } catch (e) {}",
    why:  'the error path must never touch the storage path or reach a backup',
  },
  {
    name: 'M14 a default-OFF flag flips to default-ON',
    file: 'storage.js',
    from: "  state.scannerEnabled = localStorage.getItem(SCANNER_KEY) !== '0';",
    to:   "  state.scannerEnabled = localStorage.getItem(SCANNER_KEY) === '1';",
    why:  'flag polarity — the wrong shape silently changes behaviour for every existing user',
  },
  {
    name: 'M15 showDuration adopts its neighbours\u2019 polarity',
    file: 'storage.js',
    from: '  out.showDuration    = stored.showDuration === true;',
    to:   '  out.showDuration    = stored.showDuration !== false;',
    why:  'this exact copy-the-neighbour mistake would add testing time to every existing user\u2019s certificates',
  },
  {
    name: 'M16 a job can be created with neither client nor site',
    file: 'session.js',
    from: '  if (!clientName && !siteName) {',
    to:   '  if (false) {',
    why:  'a nameless job is unusable and cannot produce a valid certificate',
  },
  {
    name: 'M17 CSV stops escaping cell values',
    file: 'csv.js',
    from: '    cols.map(c => csvEscape(csvCellValue(c.id, session, it))).join(\',\')',
    to:   '    cols.map(c => csvCellValue(c.id, session, it)).join(\',\')',
    why:  'unescaped commas and quotes silently corrupt the customer\u2019s spreadsheet',
  },
  {
    name: 'M18 parseStoredSessions rethrows instead of collapsing safely',
    file: 'storage.js',
    from: 'function parseStoredSessions(raw) {',
    to:   'function parseStoredSessions(raw) { if (!raw || raw[0] !== "[") throw new Error("boom");',
    why:  'a throw here is a white screen on a phone with no way back in',
  },
  {
    name: 'M19 duplicate asset numbers stop being detected',
    file: 'session.js',
    from: 'function findDuplicateAssetIndex(sess, assetNo, excludeCursor) {',
    to:   'function findDuplicateAssetIndex(sess, assetNo, excludeCursor) { return -1;',
    why:  'two items sharing an asset number corrupts the certificate',
  },
  {
    name: 'M20 deleting a job stops archiving its stats',
    file: 'session.js',
    from: 'function archiveSessionStats(sessions) {',
    to:   'function archiveSessionStats(sessions) { return;',
    why:  'the lifetime counter would go backwards every time Peter prunes',
  },

  /* ---- V67: barcode scanner. Every one of these is a break that SHIPPED in
     v65 and went undetected, or the same class of break arriving by a new
     door. The suite had no keydown coverage at all before this release. ---- */
  {
    name: 'M21 a modifier keydown wipes the burst again (the v65 bug)',
    file: 'scanner.js',
    from: '  if (SCAN_MODIFIER_KEYS[key]) return;',
    to:   '  if (false) return;',
    why:  'this is the exact break that made a barcode with capitals destroy its own scan',
  },
  {
    name: 'M22 unreadable keys are skipped instead of ending the burst',
    file: 'scanner.js',
    from: "      _scanLogBurst(ctx, _scanChars.join(''), v);\n    }\n    _scanReset();\n    return;",
    to:   "      _scanLogBurst(ctx, _scanChars.join(''), v);\n    }\n    return;",
    why:  'the tempting over-fix: it silently drops a character and delivers a SHORT asset number',
  },
  {
    name: 'M23 the speed preset is ignored and the old 40ms is hard-coded',
    file: 'scanner.js',
    from: '  return typeof preset === \'number\' ? preset : SCAN_GAP_PRESETS[SCAN_SPEED_DEFAULT];',
    to:   '  return 40;',
    why:  'the setting would look like it worked and change nothing — invisible from the UI',
  },
  {
    name: 'M24 an unknown speed preset resolves to undefined',
    file: 'scanner.js',
    from: '  const preset = SCAN_GAP_PRESETS[state.scanSpeed];',
    to:   '  const preset = SCAN_GAP_PRESETS[state.scanSpeed] || undefined; if (true) return preset;',
    why:  'every comparison against undefined is false, so scanning dies permanently and silently',
  },
  {
    name: 'M25 the double-terminator window is not armed on the terminator path',
    file: 'scanner.js',
    from: '      _scanSwallowEnterUntil = now + SCAN_DOUBLE_TERMINATOR_MS;',
    to:   '      _scanSwallowEnterUntil = 0;',
    why:  'a CR+LF scanner sends two Enters and the second used to escape (the v65 gap)',
  },
  {
    name: 'M26 rejected bursts stop being logged',
    file: 'scanner.js',
    from: "  if (!ctx || ctx.kind !== 'test' || !verdict) return;",
    to:   '  if (!ctx || true) return;',
    why:  'a failing scanner becomes indistinguishable from an absent one — the whole v67 diagnosis problem',
  },
  {
    name: 'M27 paired mode reads the default-ON polarity (rule 9)',
    file: 'storage.js',
    from: "  state.scannerPaired = localStorage.getItem(SCANNER_PAIRED_KEY) === '1';",
    to:   "  state.scannerPaired = localStorage.getItem(SCANNER_PAIRED_KEY) !== '0';",
    why:  'it sits one line below a !== \'0\' read; copying the neighbour focuses a field for every user',
  },
  {
    name: 'M28 paired mode focuses but does not select',
    file: 'scanner.js',
    from: '    if (document.activeElement !== el) el.focus({ preventScroll: true });\n    el.select();',
    to:   '    if (document.activeElement !== el) el.focus({ preventScroll: true });',
    why:  'without the selection an unrecognised scan APPENDS to the pre-filled number',
  },
  {
    name: 'M29 focus is not restored after a log',
    file: 'render-core.js',
    from: "  if (typeof focusAssetForScan === 'function') { try { focusAssetForScan(); } catch (e) {} }\n}\n// v20: New Session Client / Site autocomplete.",
    to:   '}\n// v20: New Session Client / Site autocomplete.',
    why:  '"the scan after a PASS goes nowhere" — the exact reported symptom',
  },
  {
    // v68: M30 used to mutate the ⌨ escape hatch, which no longer exists. It is
    // reused here for the removal itself — reintroducing the button must go red.
    name: 'M30 the removed keyboard button comes back',
    file: 'render-core.js',
    from: "    `${paired ? ' inputmode=\"none\"' : ''}>`;",
    to:   "    `${paired ? ' inputmode=\"none\"' : ''}>` + (paired ? '<button data-action=\"scan-keyboard\">K</button>' : '');",
    why:  'a control that cannot work in its main case teaches the engineer the app is broken',
  },
  {
    name: 'M31 a garbage speed preset in a backup is adopted',
    file: 'backup.js',
    from: '    if (Object.prototype.hasOwnProperty.call(SCAN_GAP_PRESETS, data.scanSpeed)) {',
    to:   "    if (typeof data.scanSpeed === 'string') {",
    why:  'a backup is untrusted input; an unrecognised preset kills scanning on the restored device',
  },

  /* ---- V67.1: the wiring. M32 is the single most important mutation in this
     file — it reproduces a bug that shipped in three consecutive releases and
     that 24 green assertions failed to notice, because they all called the
     handler instead of dispatching to it. ---- */
  {
    name: 'M32 the scanner listener is never bound (the V65–V67 bug)',
    file: 'boot.js',
    from: "if (typeof initScanner === 'function') initScanner();",
    to:   "if (false) initScanner();",
    why:  'exactly what shipped for three releases: scanner.js loaded, cached, and attached to nothing',
  },
  {
    name: 'M33 a burst ended by an unexpected key is dropped silently',
    file: 'scanner.js',
    from: '    const v = _scanVerdict();\n    if (v) {',
    to:   '    const v = null;\n    if (v) {',
    why:  'the last silent rejection path — a wrong scanner suffix would give no clue at all',
  },
  {
    name: 'M34 (D1) the boot integrity guard is called bare again',
    file: 'boot.js',
    from: 'let _bootIntegrity = false;\ntry {\n  _bootIntegrity = bootIntegrityOK();\n} catch (e) {\n  console.error(\'Boot integrity check threw — treating as failed.\', e);\n  _bootIntegrity = false;\n}\n\nif (!_bootIntegrity) {',
    to:   'if (!bootIntegrityOK()) {',
    why:  'the throw escapes and the user gets a blank white screen instead of the recovery prompt',
  },
  {
    name: 'M35 (D1) a throw is treated as a PASSED integrity check',
    file: 'boot.js',
    from: "  console.error('Boot integrity check threw — treating as failed.', e);\n  _bootIntegrity = false;",
    to:   "  console.error('Boot integrity check threw.', e);\n  _bootIntegrity = true;",
    why:  'boot falls through to load() instead of stopping at the guard; the v61.2 net happens to paint a near-identical screen, so ONLY the guard-specific wording distinguishes them',
  },
  {
    // ⚠ THE v68 BUG ITSELF. This is the mutation that would have caught the
    // release if it had existed. Reverting to an ASCII-only character class
    // leaves the app broken on every iPhone while reading as a correct fix.
    name: 'M40 (v68.1) titleCase only recognises the ASCII apostrophe',
    file: 'utils.js',
    from: "  return String(s || '').replace(/(['\\u2019\\u02BC]?)(\\w+)/g, (m, apo, word) =>",
    to:   "  return String(s || '').replace(/('?)(\\w+)/g, (m, apo, word) =>",
    why:  'iOS smart punctuation types U+2019, so the possessive breaks on the actual device while every ASCII test still passes',
  },
  {
    name: 'M41 (v68.1) the typed apostrophe is normalised to ASCII',
    file: 'utils.js',
    from: "      : apo + word.charAt(0).toUpperCase() + word.slice(1)",
    to:   "      : '\\u0027' + word.charAt(0).toUpperCase() + word.slice(1)",
    why:  'the certificate would show a character the engineer never typed',
  },
  {
    name: 'M36 (D2) titleCase goes back to capitalising after any apostrophe',
    file: 'utils.js',
    from: "  return String(s || '').replace(/(['\\u2019\\u02BC]?)(\\w+)/g, (m, apo, word) =>\n    (apo && word.length === 1)\n      ? m\n      : apo + word.charAt(0).toUpperCase() + word.slice(1)\n  );",
    to:   "  return String(s || '').replace(/\\b\\w/g, c => c.toUpperCase());",
    why:  "\"Bob's Office\" reaches certificates and CSV exports as \"Bob'S Office\"",
  },
  {
    name: 'M37 (D2) titleCase ignores apostrophes entirely',
    file: 'utils.js',
    from: '    (apo && word.length === 1)',
    to:   '    (apo)',
    why:  "over-correcting breaks real names — O'Brien would come out as O'brien",
  },
  {
    name: 'M38 (D3) the error scrub falls back to the raw message',
    file: 'bugreport.js',
    from: '    if (!complete) return _BUG_SCRUB_WITHHELD;',
    to:   '    if (!complete) return s;',
    why:  'the scrub becomes a passthrough on exactly the failure it was written for',
  },
  {
    name: 'M39 (D3) the error text bypasses the scrub on the way into the email',
    file: 'bugreport.js',
    from: '.map(e => `${e.kind}: ${_scrubCustomerData(e.message)}${e.where',
    to:   '.map(e => `${e.kind}: ${e.message}${e.where',
    why:  'a client or site name interpolated into an error reaches the support inbox verbatim',
  },

  // ---- v69 (D5): the one-time apostrophe data repair ----
  {
    name: 'M42 (D5) the repair lowercases after an apostrophe unconditionally',
    file: 'utils.js',
    from: "      word === word.toUpperCase()\n        ? m                                    // BOB'S — deliberate caps, untouched",
    to:   "      false\n        ? m",
    why:  "BOB'S OFFICE becomes BOB's OFFICE — the repair introduces a worse defect than the one it fixes, on a string the user typed deliberately",
  },
  {
    name: 'M43 (D5) the repair only recognises the ASCII apostrophe',
    file: 'utils.js',
    from: "    /([A-Za-z]+)(['\\u2019\\u02BC])([A-Z])(?![A-Za-z])/g,",
    to:   "    /([A-Za-z]+)(['])([A-Z])(?![A-Za-z])/g,",
    why:  'exactly the V68 failure repeated — iOS types U+2019, so the repair would do nothing on any real phone while the ASCII assertions stayed green',
  },
  {
    name: 'M44 (D5) the repair also rewrites multi-letter suffixes',
    file: 'utils.js',
    from: "([A-Z])(?![A-Za-z])/g,",
    to:   "([A-Z])/g,",
    why:  "O'Brien and D'Angelo would be rewritten to O'brien and D'angelo — real names damaged by a repair pass",
  },
  {
    name: 'M45 (D5) the run-once latch is never set',
    file: 'storage.js',
    from: '  localStorage.setItem(REPAIR_DONE_KEY, APP_VERSION);',
    to:   '  /* latch removed */',
    why:  'the repair re-runs on every boot, so it can be applied to data a user has since deliberately edited back',
  },
  {
    name: 'M46 (D5) no undo snapshot is recorded',
    file: 'storage.js',
    from: '      localStorage.setItem(REPAIR_UNDO_KEY, JSON.stringify(undo));',
    to:   '      /* snapshot removed */',
    why:  'the only way back from a data rewrite disappears, and the Settings button silently never appears',
  },
  {
    name: 'M47 (D5) the stale session encoding is written back over the repair',
    file: 'storage.js',
    from: '    if (touched) _invalidateSessionEncoding(sess);',
    to:   '    if (false) _invalidateSessionEncoding(sess);',
    why:  'THE TRAP THIS RELEASE ALMOST SHIPPED — serialiseSessions reuses a cached encoding when the items array reference and item COUNT are unchanged, which is exactly the case here, so the whole repair silently un-happens on the next reload',
  },
  {
    name: 'M48 (D5) presets are left out of the repair',
    file: 'storage.js',
    from: '  (state.itemPresets || []).forEach(p => {',
    to:   '  ([]).forEach(p => {',
    why:  'the quick-pick buttons keep the mangled labels, and every item logged from one writes the bad string back into fresh data',
  },
  {
    name: 'M49 (D5) the backup reminder is not tripped after a rewrite',
    file: 'storage.js',
    from: '    state.lastBackupAt = null;\n    localStorage.removeItem(LAST_BACKUP_KEY);',
    to:   '    /* nudge removed */',
    why:  'the on-device undo is the ONLY safety net left, and it dies with the browser data it lives in',
  },
  {
    name: 'M50 (D4) the delegated click handler stops catching action throws',
    file: 'dispatch.js',
    from: '  try {\n    fn(arg, el, e);\n  } catch (err) {',
    to:   '  if (true) {\n    fn(arg, el, e);\n  } else if (err) {',
    why:  'a throwing view renderer leaves state pointing at one screen while the previous screen is still on display, so the next tap runs the wrong actions',
  },
  {
    name: 'M51 (D4) the recovery leaves the view where the failed action put it',
    file: 'dispatch.js',
    from: "      state.view = 'sessions';\n      render();\n      if (typeof showToast === 'function') showToast('Something went wrong — back to your jobs');",
    to:   '      render();',
    why:  'recovering by re-rendering the very view that just threw either throws again or repaints the broken screen — state and screen still disagree',
  },
  {
    name: 'M52 (V70) an extracted function is lost on the way out of session.js',
    file: 'settings-actions.js',
    from: 'function saveReportSettingsForm(',
    to:   'function saveReportSettingsForm_LOST(',
    why:  'THE failure mode of a split: every file still parses, the load order is intact, nothing is duplicated — and the Save button on Report Settings throws on tap. Nothing before V70 caught this',
  },
  {
    name: 'M53 (V70) the wizard constant is left behind in the old file',
    file: 'onboarding.js',
    from: 'const WIZARD_LAST_STEP = 6;',
    to:   'const WIZARD_LAST_STEP = 5;',
    why:  'a top-level const does not attach to window, so a mis-moved constant is invisible to the boot guard — the exact shape of the V61 white screen',
  },
  {
    name: 'M54 (V70) a new file is referenced but never uploaded',
    file: 'boot.js',
    from: "    'saveReportSettingsForm', 'wizardNextStep'",
    to:   "    'saveReportSettingsForm'",
    why:  'one probe per script file is what turns a partial deploy into the designed recovery screen instead of a silent failure a user finds by tapping',
  },
  {
    name: 'M55 (V70) a split file drops out of the service-worker precache',
    file: 'sw.js',
    from: "  './onboarding.js',        // v70",
    to:   '  // dropped',
    why:  'a file in index.html but not in ASSETS loads online and 404s offline — the app would work in the office and break in the field, which is the worst possible failure shape for this app',
  },

  {
    name: 'M56 (V70.1) the click swallow stops disarming on a new pointerdown',
    file: 'events.js',
    from: "  document.addEventListener('pointerdown', () => { disarmClickSwallow(); }, true);",
    to:   '  // disarm removed',
    why:  'this is the V70.1 repair itself — without it a pick that produces no ghost click leaves the guard armed and eats the engineer\'s next PASS tap, which is the two-taps-of-Pass field report',
  },
  {
    name: 'M57 (V70.1) the swallow is disarmed by the tap that arms it',
    file: 'events.js',
    from: '    armClickSwallow();      // eat the trailing ghost click before it hits PASS/Notes',
    to:   '    armClickSwallow(); disarmClickSwallow();',
    why:  'inverting the disarm/arm order makes the guard cancel itself, so the ghost click reaches PASS again — the exact V57.1 bug, reintroduced silently',
  },
  {
    name: 'M58 (V70.1) the painter repaints an unchanged list',
    file: 'events.js',
    from: '  if (existing && currentHTML === html) return;          // unchanged — do not touch the DOM',
    to:   '  // identity skip removed',
    why:  'rebuilding the list on every keystroke destroys the row the finger is travelling towards, which is half of "I tapped it and it did not select"',
  },
  {
    name: 'M59 (V70.1) the shrink lands immediately again',
    file: 'events.js',
    from: '  if (onDefer && newRows < oldRows) {',
    to:   '  if (false) {',
    why:  'without hysteresis a narrowing list pulls the aimed-at row out from under the finger, and the tap falls through to the PASS button the dropdown was covering',
  },
  {
    name: 'M60 (V70.1) the location blur full-renders unconditionally',
    file: 'events.js',
    from: '        if (state.sqpEnabled && locationChanged) { invalidateSqpRow(); render(); }',
    to:   '        if (state.sqpEnabled) { invalidateSqpRow(); render(); }',
    why:  'a render() 150ms after blur rebuilds #app.innerHTML and destroys whatever is mid-tap — the second route to PASS needing two presses',
  },

  /* ---- V71: the config.js -> data.js split ---- */
  {
    name: 'M61 (V71) data.js loads after state.js instead of before it',
    file: 'index.html',
    from: '  <script src="data.js"></script>\n  <script src="state.js"></script>',
    to:   '  <script src="state.js"></script>\n  <script src="data.js"></script>',
    why:  'state.js seeds itemTypes/failReasons from DEFAULT_ITEM_TYPES in a TOP-LEVEL initialiser, so one line of load order is the difference between a working app and one that never starts. This is the single most likely way to break V71, and the least visible in review',
  },
  {
    name: 'M62 (V71) a moved table arrives empty',
    file: 'data.js',
    from: 'const DEFAULT_ITEM_TYPES = [',
    to:   'const DEFAULT_ITEM_TYPES = [].concat([]) || [',
    why:  'the binding still exists and the app still boots — an extraction that loses the CONTENTS passes every "is it defined" check. The length floors and sample members in 09g are the only things that see it',
  },
  {
    name: 'M63 (V71) the footer logo is truncated on the way across',
    file: 'data.js',
    from: "const PATGO_FOOTER_LOGO = 'data:image/png;base64,",
    to:   "const PATGO_FOOTER_LOGO = 'data:image/png;base64,TRUNCATED'; const _PATGO_FOOTER_LOGO_REST = 'x",
    why:  'a clipped 5 KB single-line base64 value is still a non-empty string that starts with the right prefix, and renders nothing in the PDF footer. Copy-paste truncation is exactly how this would happen',
  },
  {
    name: 'M64 (V71) the boot guard stops probing for data.js',
    file: 'boot.js',
    from: "  if (typeof DEFAULT_ITEM_TYPES === 'undefined') {",
    to:   '  if (false) {',
    why:  'without it a partial deploy that omits data.js falls through to the state check, which throws on a TDZ binding instead of returning false — the D1 mechanism, reached through a new door',
  },
  {
    name: 'M65 (V71) the data.js probe is moved below the state check',
    file: 'boot.js',
    from: "  if (typeof DEFAULT_ITEM_TYPES === 'undefined') {\n    console.error('Boot integrity check failed: DEFAULT_ITEM_TYPES missing",
    to:   "  if (typeof state === 'undefined' || !state) { return false; }\n  if (typeof DEFAULT_ITEM_TYPES === 'undefined') {\n    console.error('Boot integrity check failed: DEFAULT_ITEM_TYPES missing",
    why:  'ordering, not presence. The probe still exists and still reads correctly, but state.js is already dead by the time it runs, so the guard throws and the console names the wrong file',
  },
  {
    name: 'M66 (V71) config.js grows a top-level read of a data.js name',
    file: 'config.js',
    // ⚠ ANCHORED ON A VALUE THAT ROLLS EVERY RELEASE. Re-point it at the current
    // APP_VERSION each version, or the mutation ABORTS (defence 2) rather than
    // failing loudly. V72 is the first release that had to do this.
    from: "const APP_VERSION = 'V73';",
    to:   "const APP_VERSION = 'V73';\nconst _FIRST_TYPE = DEFAULT_ITEM_TYPES[0];",
    why:  'the dependency has to stay one way — config.js runs first, so a top-level read of anything in data.js is a ReferenceError at boot for every user. Reading the source cannot tell this from the same read inside a function body; running config.js alone can',
  },
  {
    name: 'M67 (V71) data.js drops out of the service-worker precache',
    file: 'sw.js',
    from: "  './data.js',",
    to:   '',
    why:  'the app would work for whoever deployed it and fail for every installed PWA on the next cold start, offline — the worst-shaped bug this project can ship',
  },
  {
    name: 'M68 (V71) a moved table is left behind in config.js as well',
    file: 'config.js',
    from: "const RETEST_UPCOMING_DAYS = 90;",
    to:   "const RETEST_UPCOMING_DAYS = 90;\nconst READING_CLASSES = ['I', 'II', 'III'];",
    why:  'a copy-not-move leaves a duplicate top-level const across two loaded files, which is a fatal SyntaxError that kills a whole file. This proves the existing duplicate-declaration scan actually covers the new file',
  },

  /* ---------- V72: the render-core.js -> render-review.js split ---------- */

  {
    name: 'M69 (V72) a moved screen is lost on the way out',
    file: 'render-review.js',
    from: 'function renderOverview() {',
    to:   'function renderOverview_LOST() {',
    why:  'the failure the whole 09 file exists for, in its V72 shape. Every file still parses, no const is duplicated, the load order is intact, every delegated action still resolves — and opening a session Overview throws ReferenceError on a phone. 09d cannot see it: the moved screens are reached through render(), not through the ACTIONS table',
  },
  {
    name: 'M70 (V72) render() loses its branch to a moved screen',
    file: 'render-core.js',
    from: "  else if (v === 'overview') html = renderOverview();",
    to:   '',
    why:  'presence, not reachability. renderOverview() still exists and still passes a lookup — the dispatcher just stopped calling it, so the screen paints the previous view or an empty shell with no error. This is what forces 09n to drive render() per view and to check a marker string rather than a length',
  },
  {
    name: 'M71 (V72) a moved screen bounces to the sessions list instead',
    file: 'render-review.js',
    from: "  if (!state.retestRemindersEnabled) { state.view = 'sessions'; return renderSessions(); }",
    to:   "  if (true) { state.view = 'sessions'; return renderSessions(); }",
    why:  "proves 09n's no-bounce assertion is not hollow. A bounced render still paints ~4 KB of perfectly valid sessions-list markup, so every length-based smoke check goes green on it — this is exactly how the first draft of 09n passed on a view it never reached",
  },
  {
    name: 'M72 (V72) the shared photo markup is copied, not moved',
    file: 'render-core.js',
    from: 'function refreshEntryAfterLog() {',
    to:   "function renderPhotoStripSheet() { return ''; }\n\nfunction refreshEntryAfterLog() {",
    why:  'the sneakier half of MAP rule 1. A duplicate top-level FUNCTION is legal and silent — last loaded wins — so render-core.js loading first means the real one in render-review.js quietly replaces this stub and nothing looks wrong. Reverse the load order and the photo strip silently empties',
  },
  {
    name: 'M73 (V72) the boot guard stops probing for render-review.js',
    file: 'boot.js',
    from: "    'renderOverview',",
    to:   '',
    why:  'one probe per script file is the rule. Without it, a deploy that commits index.html but never uploads render-review.js boots looking completely healthy and dies the first time anyone opens an Overview — the exact partial-deploy shape V70 made possible',
  },
  {
    name: 'M74 (V72) render-review.js drops out of the service-worker precache',
    file: 'sw.js',
    from: "  './render-review.js',",
    to:   '',
    why:  'works for whoever deployed it, fails for every installed PWA on the next cold start with no signal. Same shape as M67 — the new file has to be covered by the same check',
  },
  {
    name: 'M75 (V72) render() is made async in the file it stayed in',
    file: 'render-core.js',
    from: 'function render() {',
    to:   'async function render() {',
    why:  'MAP rule 2 had to survive a release that rewrote the file around render(). An async render() returns a promise instead of painting, so every caller that renders and then reads the DOM sees the old screen',
  },

  /* ---------- V73: the render-settings.js -> render-help.js split ---------- */

  {
    name: 'M76 (V73) a moved help screen is lost on the way out',
    file: 'render-help.js',
    from: 'function renderSettingsGlossary() {',
    to:   'function renderSettingsGlossary_LOST() {',
    why:  'the V73 shape of the standing failure. Everything parses, no const is duplicated, every delegated action resolves — and tapping Glossary throws ReferenceError on a phone. 09d is blind to it because these screens are reached through render(), not the ACTIONS table',
  },
  {
    name: 'M77 (V73) render() loses its branch to a moved help screen',
    file: 'render-core.js',
    from: "  else if (v === 'settingsContact') html = renderSettingsContact();",
    to:   '',
    why:  'presence, not reachability. renderSettingsContact() still exists and still passes a lookup — the dispatcher just stopped calling it, so the Contact page paints whatever the previous view left behind with no error anywhere. This is what forces 09s to drive render() per view and check a marker string',
  },
  {
    name: 'M78 (V73) a help screen paints an empty shell',
    file: 'render-help.js',
    from: 'function renderSettingsGlossary() {',
    to:   "function renderSettingsGlossary() {\n  return '<div class=\"screen\"><div class=\"info-card\"><h2>Glossary</h2></div></div>';",
    why:  "proves 09s's marker assertions are not hollow. The function exists, render() does not throw, state.view does not bounce, and the screen paints perfectly valid markup — it is just not the glossary. Presence, reachability and length checks all go green; only a string taken from inside the moved function's own output can see it",
  },
  {
    name: 'M79 (V73) the sub-header is copied across the seam, not called',
    file: 'render-help.js',
    from: 'function renderSettingsAbout() {',
    to:   "function renderSettingsSubHeader(title) { return ''; }\n\nfunction renderSettingsAbout() {",
    why:  'the same silent hazard as M72, in the direction V73 created. A duplicate top-level FUNCTION is legal and silent (MAP rule 1) — render-help.js loads last, so this stub quietly wins and every settings sub-header in the app empties at once, with nothing thrown',
  },
  {
    name: 'M80 (V73) the boot guard stops probing for render-help.js',
    file: 'boot.js',
    from: "    'renderSettingsAbout'\n  ];",
    to:   "  ];",
    why:  'one probe per script file. Without it a deploy that commits index.html but never uploads render-help.js boots looking healthy and dies the first time anyone opens About — which is also the page users are told to open to check the version',
  },
  {
    name: 'M81 (V73) render-help.js drops out of the service-worker precache',
    file: 'sw.js',
    from: "  './render-help.js',",
    to:   '',
    why:  'works for whoever deployed it, fails for every installed PWA on the next cold start with no signal. Same shape as M67 and M74',
  },
  {
    name: 'M82 (V73) the About changelog is appended to rather than rolled',
    file: 'render-help.js',
    from: '        <p><strong>V71</strong> &middot; August 2026</p>',
    to:   '        <p><strong>V70</strong> &middot; August 2026</p>\n        <p class="muted">Housekeeping only.</p>\n\n        <p><strong>V71</strong> &middot; August 2026</p>',
    why:  'the rolling 3-version changelog is a standing release rule that nothing enforced before V73. Appending rather than rolling grows the About page unboundedly and is the kind of thing that is only ever noticed months later',
  },

];

function main() {
  const filter = process.argv[2];
  const list = MUTATIONS.filter(m => !filter || m.name.includes(filter) || m.file.includes(filter));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'patgo-mutate-'));
  copyTree(APP_DIR, tmp);

  console.log(`Mutation run — ${list.length} mutation${list.length === 1 ? '' : 's'}\n`);

  const survived = [];
  const aborted  = [];
  let caught = 0;

  for (const m of list) {
    const target = path.join(tmp, m.file);
    const original = fs.readFileSync(target, 'utf8');

    // DEFENCE 2: a mutation that does not apply proves nothing and must never
    // be scored as a pass.
    if (!original.includes(m.from)) {
      aborted.push(m);
      console.log(`  ⛔ ${m.name}\n       ANCHOR NOT FOUND in ${m.file} — the code moved. Update the mutation.`);
      continue;
    }

    fs.writeFileSync(target, original.replace(m.from, m.to));
    const failed = runSuiteExpectingFailure(tmp);
    fs.writeFileSync(target, original);

    if (failed) {
      caught++;
      console.log(`  ✓ ${m.name}`);
    } else {
      survived.push(m);
      console.log(`  ✗ ${m.name}\n       SURVIVED — no assertion catches this. ${m.why}`);
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('');
  console.log(`${caught} caught, ${survived.length} survived, ${aborted.length} aborted`);
  if (survived.length) {
    console.log('\nA surviving mutation means an assertion is hollow, or the behaviour is untested.');
    console.log('Fix the TEST, not the mutation — unless the mutation itself is wrong.');
  }
  process.exit(survived.length || aborted.length ? 1 : 0);
}

function runSuiteExpectingFailure(dir) {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(dir, 'harness', 'run.js')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // Non-zero exit is the normal "caught it" path.
    out = String(e.stdout || '') + String(e.stderr || '');
    return !/\d+ passed, 0 failed/.test(out) || /HARNESS CRASHED/.test(out);
  }
  // DEFENCE 1: anchor on the whole phrase. Matching the substring "0 failed"
  // scores "10 failed" as a pass — the V66 runner did exactly this.
  return !/\d+ passed, 0 failed\s*$/.test(out.trim());
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

main();
