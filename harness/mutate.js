/*
 * PATGo Scan — harness/mutate.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 *   node harness/mutate.js   → must end "N caught, 0 survived, 0 aborted"
 *
 * WHY THIS EXISTS. An assertion count proves nothing. A suite can be entirely
 * green and entirely hollow — the three shapes that have got through before are
 * the right result reached by the wrong mechanism, a path that cannot execute
 * headlessly, and test data that never reaches the branch. The only way to know
 * an assertion works is to break the thing it guards and watch it go red.
 *
 * HOW TO READ THE RESULT:
 *   caught   — the suite went red. The assertion works.
 *   SURVIVED — the code was broken and the suite stayed green. That assertion
 *              is not testing what it claims to. Fix the test, not the app.
 *   aborted  — the suite crashed instead of reporting. Wrap the group; a crash
 *              tells you nothing about coverage.
 *
 * EVERY RELEASE ADDS A MUTATION for the invariant it introduced. A new
 * assertion nobody has tried to break is a new assertion nobody knows works.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// [id, file, find, replace, what it should break]
const MUTATIONS = [
  // --- structure ---------------------------------------------------------
  ['M01', 'index.html', '<script src="boot.js"></script>',
    '<script src="boot.js"></script>\n  <script src="config.js"></script>',
    'boot.js no longer last'],
  ['M02', 'sw.js', "'./scanner.js',", '',
    'a script file missing from the SW precache'],
  ['M03', 'sw.js', "const CACHE_VERSION = 'scan-v1-1'", "const CACHE_VERSION = 'pat-v71'",
    'cache key using the parent app prefix'],
  ['M04', 'utils.js', '(c) 2026 Peter Birchley. All rights reserved.', '(c) 2026',
    'copyright header stripped'],
  ['M05', 'log.js', 'function recordById(id) {',
    'function recordById(id) { if (false) confirm("x");',
    'a banned dialog reintroduced'],
  ['M06', 'config.js', "const RECORDS_KEY        = 'scan:records';",
    "const RECORDS_KEY        = 'pat:records';",
    'a storage key on the parent app prefix'],

  // --- boot --------------------------------------------------------------
  ['M07', 'boot.js', "  'initScanner',              // scanner.js\n", '',
    'a script file with no integrity probe'],
  ['M08', 'boot.js', 'typeof APP_VERSION !== ', 'typeof window.APP_VERSION !== ',
    'constants read off window, where a const never appears'],
  ['M09', 'boot.js', 'did not load completely', 'went wrong somehow',
    'the two crash screens no longer distinguishable'],
  ['M10', 'boot.js', 'if (typeof initScanner === \'function\') initScanner();',
    'initScanner();',
    'an optional init no longer typeof-guarded'],

  // --- storage -----------------------------------------------------------
  ['M11', 'storage.js', "state.scannerEnabled = _lsGet(SCANNER_KEY) !== '0';",
    "state.scannerEnabled = _lsGet(SCANNER_KEY) === '1';",
    'default-ON flag flipped to opt-in — off for every engineer'],
  ['M12', 'storage.js', "state.scannerPaired = _lsGet(SCANNER_PAIRED_KEY) === '1';",
    "state.scannerPaired = _lsGet(SCANNER_PAIRED_KEY) !== '0';",
    'default-OFF flag flipped to on for everybody'],
  ['M13', 'storage.js', "out.result = (r.result === 'pass' || r.result === 'fail') ? r.result : '';",
    'out.result = r.result || \'\';',
    'validator letting an invalid result through'],
  ['M14', 'storage.js', 'state.currentLocationId = locationRecordById(locId) ? locId : \'\';',
    'state.currentLocationId = locId;',
    'a dangling location id surviving load'],
  ['M15', 'storage.js', 'if (seen[r.id]) r.id = uid(', 'if (false) r.id = uid(',
    'duplicate record ids no longer re-issued'],

  // --- the record model --------------------------------------------------
  ['M16', 'log.js', 'if (existing && mode === MODE_AUDIT) {', 'if (false) {',
    'a re-scanned location duplicating instead of reusing'],
  ['M17', 'log.js', 'locationCode: loc ? loc.code : \'\',', 'locationCode: \'\',',
    'items no longer stamped with the location barcode'],
  ['M18', 'log.js', 'if (state.records[i].locationId === id) state.records[i].locationId = \'\';',
    '',
    'deleting a location orphaning its items'],
  ['M19', 'log.js', 'rec.exported = false;    // changed since export', 'rec.exported = rec.exported;',
    'an edited record not going out again'],
  ['M20', 'log.js', 'existing.unshift(s);', 'existing.push(s);',
    'learned descriptions no longer most-recent-first'],

  // --- the scanner -------------------------------------------------------
  ['M21', 'scanner.js', 'document.addEventListener(\'keydown\', handleScannerKeydown, true);',
    '/* listener not attached */',
    'the scanner never actually wired to the document'],
  ['M22', 'scanner.js', 'if (e.repeat) return;', '',
    'auto-repeat from a held key accepted as a scan'],
  ['M23', 'scanner.js', 'if (SCAN_MODIFIER_KEYS[key]) return;', '',
    'a Shift mid-burst destroying a barcode with capitals'],
  ['M24', 'scanner.js', '_scanPoisonUntil = now + SCAN_END_MS;\n    return;\n  }\n\n  // Still inside',
    '_scanPoisonUntil = 0;\n    return;\n  }\n\n  // Still inside',
    'the tail of an interrupted burst arriving as a short, plausible scan'],
  ['M25', 'scanner.js', 'if (gap > limit) {', 'if (false) {',
    'the speed test disabled — a human typing accepted as a scan'],
  ['M26', 'scanner.js', 'if (n < SCAN_MIN_LENGTH) {', 'if (false) {',
    'a two-character burst accepted as a barcode'],
  ['M27', 'scanner.js', 'const preset = SCAN_GAP_PRESETS[state.scanSpeed];\n  return typeof preset === \'number\' ? preset : SCAN_GAP_PRESETS[SCAN_SPEED_DEFAULT];',
    'return SCAN_GAP_PRESETS[state.scanSpeed];',
    'an unknown speed preset resolving to undefined and rejecting every scan'],
  ['M28', 'scanner.js', 'if (!state.scannerEnabled || !state.scannerPaired) return;',
    'if (!state.scannerEnabled) return;',
    'paired-mode focus stealing on phones with no scanner'],
  ['M29', 'scanner.js', "if (!ctx || ctx.kind !== 'test' || !verdict) return;", 'if (!ctx || !verdict) return;',
    'the diagnostic log filling with the engineer\'s own typing'],
  ['M30', 'scanner.js', 'if (tag === \'INPUT\' || tag === \'TEXTAREA\' || tag === \'SELECT\' || ae.isContentEditable) {\n      return null;\n    }',
    'if (false) { return null; }',
    'a scan hijacking a field the engineer deliberately focused'],

  // --- the grammar -------------------------------------------------------
  ['M31', 'dispatch.js', 'if (!currentLocation()) {', 'if (false) {',
    'an item logged with no location — an unplaceable row'],
  ['M32', 'dispatch.js', 'state.locationArmed = false;\n    if (state.mode === MODE_INITIAL) {',
    'state.locationArmed = true;\n    if (state.mode === MODE_INITIAL) {',
    'the location bar not disarming after use'],
  ['M33', 'dispatch.js', 'const dup = findItemByCode(code, null);', 'const dup = null;',
    'duplicate asset scans no longer caught at scan time'],
  ['M34', 'log.js', '    mode: pending.mode === MODE_INITIAL ? MODE_INITIAL : MODE_AUDIT,',
    '    mode: state.mode,',
    'the mode re-derived at save rather than frozen at scan time'],
  ['M35', 'dispatch.js', "showToast('Something went wrong — back to the scan screen');\n      setView('scan');",
    'throw err;',
    'an action throw escaping instead of recovering'],
  ['M36', 'dispatch.js', 'refreshLogListOnly();', 'render();',
    'the search box losing its cursor on every keystroke'],
  ['M37', 'dispatch.js', "el.value = '';\n    if (f) importBackupFile(f);",
    'if (f) importBackupFile(f);',
    'choosing the same file twice firing nothing'],

  // --- the deliverable ---------------------------------------------------
  ['M38', 'utils.js', "return '\"' + s.replace(/\"/g, '\"\"') + '\"';", 'return s;',
    'CSV cells unquoted — one comma shifts every column'],
  ['M39', 'config.js', "  'record_type',\n  'mode',", "  'mode',\n  'record_type',",
    'the client\'s column order changed'],
  ['M40', 'csv.js', 'const list = state.records.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));',
    'const list = state.records.slice().sort(byNewest);',
    'export order reversed — locations after the items under them'],
  ['M41', 'csv.js', 'return onlyUnexported ? list.filter(r => !r.exported) : list;', 'return list;',
    '"export new only" exporting everything'],
  ['M42', 'csv.js', 'for (let i = 0; i < records.length; i++) records[i].exported = true;',
    'state.records = state.records.filter(r => !r.exported);',
    'export deleting records instead of flagging them'],
  ['M43', 'utils.js', "return d.getFullYear() + '-' + pad2(d.getMonth() + 1)",
    "return new Date(ms || Date.now()).toISOString().slice(0,10) + '-' + pad2(d.getMonth() + 1)",
    'timestamps exported in UTC rather than local time'],

  // --- backup ------------------------------------------------------------
  ['M44', 'backup.js', "if (obj.app && obj.app !== 'patgoscan') {", 'if (false) {',
    'another app\'s backup accepted'],
  ['M45', 'backup.js', "if (typeof p.scannerEnabled === 'boolean') state.scannerEnabled = p.scannerEnabled;",
    'state.scannerEnabled = !!p.scannerEnabled;',
    'an absent flag reading as "off" on restore'],
  ['M46', 'backup.js', 'state.records = normaliseRecords(obj.records);', 'state.records = obj.records;',
    'restore bypassing the shared validators'],
  ['M47', 'backup.js', 'if (pending > 0) {', 'if (false) {',
    'clearing allowed while records are unexported'],
  ['M48', 'backup.js', 'state.currentLocationId = locationRecordById(locId) ? locId : \'\';',
    'state.currentLocationId = locId;',
    'a dangling location id surviving a restore'],

  // --- privacy -----------------------------------------------------------
  ['M49', 'bugreport.js', "'Records: ' + state.records.length + ' (' + unexportedCount() + ' unexported)',",
    "'Records: ' + state.records.map(r => r.code).join(','),",
    'client asset numbers leaking into an emailed diagnostic'],
  ['M50', 'bugreport.js', "return '(message withheld — it may contain client data)';",
    'return s.slice(0, 300);',
    'the scrubber failing open instead of closed'],

  // --- V1.1: quick-pick presets ------------------------------------------
  // The fusion bug itself, re-introduced: learning a description also pushes it
  // into the grid. This is what V1 effectively did, and it is why a removed item
  // came back and why the grid moved under the engineer.
  ['M51', 'log.js', 'state.descriptions = existing.slice(0, DESCRIPTIONS_STORED_MAX);',
    'state.descriptions = existing.slice(0, DESCRIPTIONS_STORED_MAX);\n  ' +
    'if (activePreset()) activePreset().items.unshift(s);',
    'learned descriptions leaking back into the curated grid'],
  ['M52', 'storage.js', 'return out.length ? out : makeDefaultPresets();',
    'return out;',
    'a garbage preset list leaving the grid permanently empty'],
  ['M53', 'storage.js', '  return presets.length ? presets[0].id : \'\';',
    '  return want;',
    'a deleted preset id staying active, so the grid resolves to nothing'],
  ['M54', 'log.js', 'if ((state.itemPresets || []).length < 2) return false;', '',
    'the last preset being deletable, leaving no lists at all'],
  ['M55', 'backup.js', 'state.itemPresets = normalisePresets(obj.itemPresets);',
    'state.itemPresets = obj.itemPresets || [];',
    'restore bypassing the validator — a V1 backup lands on an empty grid'],
  ['M56', 'render.js', "    desc.value = btn.getAttribute('data-d') || '';\n    hideSuggest();",
    "    desc.value = btn.getAttribute('data-d') || '';\n    paintSuggest();",
    'the suggestion list re-filtering under the finger instead of closing'],
  ['M57', 'styles.css', '  position: absolute; top: 100%; left: 0; right: 0; z-index: 20;',
    '  position: static;',
    'the dropdown back in the flow, shoving the form down as you type'],
  ['M58', 'render.js', "      if (res === 'fail') {\n        // V1.1: tapping FAIL raises the reason picker straight away, exactly as\n        // it does on the scan screen. In V1 this was a text box with a dropdown\n        // that nobody found, so corrections to FAIL went out with no reason.\n        askReason();\n        return;\n      }",
    "      if (res === 'fail') { return; }",
    'correcting to FAIL in the log no longer offering the reasons'],
  ['M59', 'render.js', "      if (res === 'fail' && !cleanText(reason, 120)) {",
    '      if (false) {',
    'a fail saved out of the log with no reason on it'],
  ['M60', 'render.js', '        (picked) => {\n          draftNow.failReason = picked;\n          openEditSheet(id, draftNow);\n        },',
    '        (picked) => {\n          openEditSheet(id, { failReason: picked, result: \'fail\' });\n        },',
    'the unsaved description and class thrown away on the way to the reasons'],
];

function run(cmd) {
  try {
    execFileSync('node', [path.join(__dirname, 'run.js')], { cwd: ROOT, stdio: 'pipe' });
    return 0;
  } catch (err) {
    return err.status === null ? -1 : err.status;
  }
}

let caught = 0, survived = 0, aborted = 0, skipped = 0;
const problems = [];

console.log('Baseline…');
if (run() !== 0) {
  console.error('The suite is not green before mutating. Fix that first.');
  process.exit(1);
}

MUTATIONS.forEach(([id, file, find, replace, what]) => {
  const p = path.join(ROOT, file);
  const original = fs.readFileSync(p, 'utf8');
  if (original.indexOf(find) === -1) {
    skipped++;
    problems.push(id + ' SKIPPED — the target text is not in ' + file +
      '. The mutation is stale; update it or the invariant is unguarded.');
    return;
  }
  fs.writeFileSync(p, original.replace(find, replace));
  let status;
  try { status = run(); } finally { fs.writeFileSync(p, original); }

  if (status === 1) { caught++; console.log('  ✓ ' + id + ' caught — ' + what); }
  else if (status === 0) {
    survived++;
    problems.push(id + ' SURVIVED — ' + what + ' (' + file + '). Nothing tests this.');
    console.log('  ✗ ' + id + ' SURVIVED — ' + what);
  } else {
    aborted++;
    problems.push(id + ' ABORTED — the suite crashed rather than reporting (' + file + ').');
    console.log('  ! ' + id + ' aborted — ' + what);
  }
});

console.log('');
if (problems.length) { problems.forEach(p => console.log('  ' + p)); console.log(''); }
console.log(caught + ' caught, ' + survived + ' survived, ' + aborted + ' aborted' +
  (skipped ? ', ' + skipped + ' skipped' : ''));
process.exit(survived === 0 && aborted === 0 && skipped === 0 ? 0 : 1);
