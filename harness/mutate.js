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
  // ⚠ THIS ONE GOES STALE EVERY RELEASE — it names the current cache key, so
  // the version bump breaks the find string and the mutation reports SKIPPED.
  // Update it as part of the bump; a skip here means the cache-key invariant
  // is unguarded for that release, which is how a build ships without one.
  ['M03', 'sw.js', "const CACHE_VERSION = 'scan-v12'", "const CACHE_VERSION = 'pat-v71'",
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
  ['M24', 'scanner.js', '_scanPoisonUntil = now + scanEndMs();\n    return;\n  }\n\n  // Still inside',
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
  // ⚠ RE-POINTED IN V5, NOT DELETED. M39 used to swap two entries in the header
  // list to prove the header and the body agreed about order. Under V5 that
  // swap is SAFE by construction — the header and the body are built from one
  // list, which is the entire point of the change — so the old mutation would
  // have reported a survivor for a property that is now structurally
  // guaranteed. The invariant worth guarding moved with it: a column's key and
  // its cell must belong to each other, because a value under the wrong header
  // is the one failure a reorder-safe design does not prevent.
  // ⚠ RE-POINTED IN V6 (third release running). The column is now DESCRIPTION
  // and it is gated on mode rather than on record type.
  ['M39', 'config.js', "  { key: 'DESCRIPTION', cell: (r) => (r.mode === MODE_INITIAL ? (r.description || '') : '') },",
    "  { key: 'DESCRIPTION', cell: (r) => (r.mode === MODE_INITIAL ? (r.code || '') : '') },",
    'a column carrying the wrong value under the right header'],
  // ⚠ V7: RETARGETED. The sort moved into the session-scoped recordsForExport().
  ['M40', 'csv.js', '    .sort((a, b) => (a.ts || 0) - (b.ts || 0));\n}',
    '    .sort(byNewest);\n}',
    'export order reversed — locations after the items under them'],
  // ⚠ V7: REPLACED, NOT DELETED. M41 guarded "export new only exports only the
  // new ones" — an invariant decision 3B deliberately retired. The opposite
  // property is now the one worth defending: a file is the WHOLE session, and
  // quietly reintroducing a delta filter is the regression to catch.
  ['M41', 'csv.js', '  return state.records\n    .filter(r => inCurrentSession(r))',
    '  return state.records\n    .filter(r => inCurrentSession(r) && !r.exported)',
    'a delta filter creeping back into a whole-session export (3B)'],
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
  ['M49', 'bugreport.js', "'Records: ' + state.records.length + ' (' + unexportedCountAllSessions() + ' unexported)',",
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

  // --- V2: the two-ceiling scanner bug ------------------------------------
  // The release's headline invariant, attacked from both sides: the presets
  // being reverted, and the derived window being flattened back to a constant
  // that looks harmless and silently re-caps every preset above it.
  ['M61', 'config.js', "const SCAN_GAP_PRESETS = { strict: 60, normal: 90, relaxed: 150 };",
    "const SCAN_GAP_PRESETS = { strict: 40, normal: 60, relaxed: 90 };",
    'the V1 presets back, rejecting the scanner measured in the field'],
  ['M62', 'scanner.js', 'return Math.max(SCAN_END_FLOOR_MS, scanMaxGapMs() + SCAN_END_PAD_MS);',
    'return SCAN_END_FLOOR_MS;',
    'the end-of-burst window flattened back to a constant below the gap limit'],
  ['M63', 'config.js', 'const SCAN_END_PAD_MS = 70;', 'const SCAN_END_PAD_MS = 0;',
    'the window sitting exactly ON the gap limit instead of above it'],

  // --- V2: the location on the log ---------------------------------------
  // ⚠ RE-POINTED IN V4, NOT REWRITTEN. The fallback moved into the shared
  // locationLineFor() when the edit sheet needed to label a location that is
  // picked but not yet saved. The invariant is V2's and is still V2's: a swept
  // item keeps the barcode it was genuinely scanned under. Deleting a stale
  // mutation instead of re-aiming it is how prior coverage quietly goes unpaid.
  ['M64', 'log.js', '  if (isNonEmptyString(fallbackCode)) return fallbackCode;',
    '  if (false) return fallbackCode;',
    'a swept item losing its location entirely instead of falling back to the code'],
  ['M65', 'render.js', "'', itemLocationShort(r)]", "'', r.locationCode]",
    'the log row back to the bare barcode instead of the room'],
  // ⚠ ALSO RE-POINTED. V4 retired .metarow — the location row became tappable,
  // so it took the .reasonrow shape. Same assertion, same invariant, new class.
  ['M66', 'render.js', '<span class="reasonrow-label">Location</span>', '',
    'the location label gone from the item edit sheet'],

  // --- V2: spacing and palette -------------------------------------------
  ['M67', 'render.js', '<h2 class="sec">Help</h2>', '',
    'About colliding with the sound toggle again'],
  ['M68', 'styles.css', '.main--nonav { padding-bottom: calc(24px + env(safe-area-inset-bottom)); }',
    '',
    'the phantom nav gutter rule deleted'],
  ['M69', 'render.js', '<main class="main main--nonav">', '<main class="main">',
    'a nav-less page reclaiming the 96px gutter it has no nav for'],
  ['M70', 'styles.css', '  --mode-tint: #dcfce7;', '  --mode-tint: #eff6ff;',
    'the mode tint collapsed back onto the accent wash, killing the mode signal'],

  // --- V3: the sheet / keyboard fix --------------------------------------
  //
  // Attacked at each of the four places it can quietly stop working. M71 and
  // M72 are the interesting pair: both leave a sheet that opens, positions
  // itself once and looks entirely correct on a desk, and both put the buttons
  // back under the keyboard on a phone.
  ['M71', 'feedback.js', "  wrap.style.bottom = 'auto';", '',
    'bottom left pinned by inset:0, so the height is ignored and the sheet stays full-screen'],
  ['M72', 'feedback.js', '  vv.addEventListener(\'resize\', _sheetViewportHandler);', '',
    'the sheet positioned once on open and then abandoned when the keyboard arrives'],
  ['M73', 'feedback.js', '  _unbindSheetViewport();\n  const old = document.getElementById',
    '  const old = document.getElementById',
    'a viewport listener leaked on every sheet close'],
  ['M74', 'feedback.js', 'el.focus({ preventScroll: true });', 'el.focus();',
    'the document scrolling to reveal a focused field again — the original jerk'],
  ['M75', 'render.js', 'setTimeout(() => focusSheetField(sheet.querySelector(\'#nl-room\')), 60);',
    "setTimeout(() => { try { sheet.querySelector('#nl-room').focus(); } catch (e) {} }, 60);",
    'the new location sheet going back to a bare focus, bypassing the shared path'],
  ['M76', 'styles.css', 'max-height: calc(100% - 44px)', 'max-height: 88vh',
    'the sheet measured against the screen again, overflowing off its own top'],
  ['M77', 'styles.css', 'overscroll-behavior: contain;', '',
    'a drag that runs out of sheet handing itself to the page underneath'],
  // ⚠ Not a sheet mutation — it guards the STUB fix that made the rest of this
  // block observable. Registering appended ids is what let getElementById see
  // the backdrop; without it sheetIsOpen() reads false with a sheet open and
  // half of 10k–10n go hollow rather than red.
  ['M78', 'harness/stubs.js', '      if (c.id) DOC._byId[c.id] = c;', '',
    'the harness blind to appended nodes again, exactly as it was before V3'],

  // --- V4: moving an item, and the edit sheet's description tools ---------
  //
  // ⚠ M79 IS THE ONE THAT MATTERS. The id and the code moving together is the
  // whole feature; an id-only move reads perfectly on screen and exports the
  // item under the location it just left, which is a wrong row in the client's
  // system that nobody on site can see.
  ['M79', 'log.js', '        rec.locationCode = loc.code;', '',
    'a move that changes the id but not the code — right on screen, wrong in the export'],
  ['M80', 'log.js', '      const loc = locationRecordById(fields.locationId);',
    '      const loc = { id: fields.locationId, code: fields.locationId };',
    'a dangling location id accepted, overwriting the barcode actually scanned'],
  // ⚠ RE-POINTED IN V6 — the snapshot gained the two readings after locationId.
  ['M81', 'render.js',
    '      locationId: locId,\n      earthBond:',
    '      earthBond:',
    'the draft dropping the picked location on the way to another sheet'],
  ['M82', 'render.js',
    '        locationId: locId,\n        earthBond:',
    '        earthBond:',
    'Save writing every field except the location'],
  ['M83', 'render.js',
    "  const curLocId = (typeof d.locationId === 'string') ? d.locationId : rec.locationId;",
    '  const curLocId = rec.locationId;',
    'the sheet showing the stored location instead of the one just picked'],
  ['M84', 'render.js', "  sheet.querySelector('#lp-cancel').onclick = () => { closeSheet(); back(); };",
    "  sheet.querySelector('#lp-cancel').onclick = () => { closeSheet(); };",
    'backing out of the picker dropping the half-finished edit on the floor'],
  ['M85', 'log.js', '    row.count++;', '',
    'picker rows that cannot say how much was done in a room'],
  ['M86', 'log.js',
    "  const items = state.records.filter(r => r.type === 'item' && r.sessionId === want).sort(byNewest);",
    "  const items = state.records.filter(r => r.type === 'item' && r.sessionId === want);",
    'samples in storage order rather than what was tested there last'],
  ['M87', 'render.js', '          const named = label !== loc.code;', '          const named = true;',
    'an unnamed location printing its barcode twice in one row'],
  ['M88', 'render.js', "      sheet.querySelector('#ed-quick').addEventListener('click'",
    "      sheet.querySelector('#ni-quick').addEventListener('click'",
    'the edit sheet Quick Pick grid wired to the other sheet, so it does nothing'],
  ['M89', 'render.js', "    edSuggest.addEventListener('pointerdown'",
    "    edSuggest.addEventListener('click'",
    'the suggestion tap racing the blur teardown again — the parent app hotfix'],
  ['M90', 'feedback.js', "  wrap.classList.toggle('is-keyboard', short);",
    "  if (short) wrap.classList.add('is-keyboard');",
    'the keyboard flag latching on and never coming back off'],
  ['M91', 'styles.css', '.sheet-backdrop.is-keyboard .bulk-sheet { padding-bottom: 20px; }', '',
    'the flag set with no rule acting on it'],

  // --- V5: the toggles and the column spec --------------------------------
  //
  // ⚠ THE SHAPE TO WATCH IN THIS RELEASE is a boolean that defaults to false.
  // Deleting the code that writes `visual` leaves every record reading
  // `visual: false`, which is what a tested item looks like — so any assertion
  // that only ever checks the OFF state passes on an app that lost the feature
  // entirely. M92, M95 and M99 all break it in the direction that survives a
  // careless test.

  // ⚠ RE-POINTED IN V6 — the flag is settled into a local before the record
  // literal so the key order matches normaliseRecord().
  ['M92', 'log.js', '  const visual = pending.visual === true;', '  const visual = false;',
    'the visual flag never reaching a new record'],
  ['M93', 'log.js', '  rec.visual = pending.visual === true;',
    '  if (pending.visual) rec.visual = true;',
    'the flag going one-way on a re-scan — settable, never clearable'],
  ['M94', 'log.js', "    if (typeof fields.visual === 'boolean') rec.visual = fields.visual;",
    '    if (fields.visual) rec.visual = fields.visual;',
    'the edit sheet unable to turn Visual back OFF'],
  ['M95', 'storage.js', '    out.visual = r.visual === true;', '    out.visual = !!r.visual;',
    'a truthy string in a hand-edited backup marking work as visual-only'],
  ['M96', 'storage.js', "  state.visualMode = _lsGet(VISUAL_KEY) === '1';",
    "  state.visualMode = _lsGet(VISUAL_KEY) !== '0';",
    'Visual defaulting ON for a phone that has never set it'],
  ['M97', 'storage.js', "  _lsSet(VISUAL_KEY, state.visualMode ? '1' : '0');", '',
    'the toggle not surviving a restart'],
  // ⚠ RE-POINTED IN V6 — the toggle validator now runs through the migration
  // first and falls back afterwards.
  ['M98', 'storage.js', '  return migrated || ITEM_CLASS_DEFAULT;',
    '  return migrated;',
    'a stored class falling back to blank, painting neither segment as on'],
  ['M99', 'dispatch.js', '    visual: state.visualMode === true,', '    visual: false,',
    'the toggle not reaching an audit scan'],
  ['M100', 'dispatch.js', '    cls: state.itemClass,', "    cls: existing ? existing.cls : '',",
    'the pre-V5 behaviour restored — an audit re-scan ignoring the toggle'],
  ['M101', 'dispatch.js', '    if (state.pending) state.pending.visual = state.visualMode;', '',
    'a toggle change not reaching the item already waiting for a result'],
  ['M102', 'dispatch.js', '    if (state.pending) state.pending.cls = state.itemClass;', '',
    'the same, for class'],

  // The column spec. These are the deliverable, and the reorder-safety of the
  // whole V5 arrangement rests on them.
  // ⚠ M103–M107 RE-POINTED IN V6, NOT DELETED. The class_1 / class_2 / visual
  // columns they were written against are retired, but the invariants behind
  // them are not: a column that silently empties, and a column that lets one
  // field suppress another. They now aim at the V6 equivalents.
  ['M103', 'config.js', "  { key: 'CLASS',    cell: (r) => r.cls || '' },",
    "  { key: 'CLASS',    cell: (r) => '' },",
    'the class column silently emptying'],
  ['M104', 'config.js', "  { key: 'INSULATION', cell: (r) => r.insulation || '' },",
    "  { key: 'INSULATION', cell: (r) => '' },",
    'the insulation column emptying — every tested item reading as visual-only'],
  ['M105', 'config.js', "  { key: 'ASSET ID', cell: (r) => r.code || '' },",
    "  { key: 'ASSET ID', cell: (r) => '' },",
    'the asset id no longer reaching the file'],
  ['M106', 'config.js', "  { key: 'EARTH BOND', cell: (r) => (r.cls === CLASS_NO_EARTH_BOND ? '' : (r.earthBond || '')) },",
    "  { key: 'EARTH BOND', cell: (r) => r.earthBond || '' },",
    'the class 2 earth bond guard removed from the export boundary'],
  ['M107', 'csv.js', '      try { v = cols[c].cell(r, ctx); } catch (e) { v = \'\'; }',
    '      v = cols[c].cell(r, ctx);',
    'one bad column taking the whole export with it'],
  ['M108', 'csv.js', '  const rows = [csvRow(cols.map(c => c.key))];',
    '  const rows = [csvRow(cols.map(c => c.key).slice(1))];',
    'the header and the body disagreeing about width'],
  ['M109', 'boot.js', '           _csvColumnsWellFormed() &&', '',
    'a hand-edited column list booting with no shape check'],
  ['M110', 'boot.js', "    if (typeof c.cell !== 'function') return false;", '',
    'a column with no cell function passing the integrity guard'],

  // The screen. A toggle that records correctly and shows nothing is a toggle
  // nobody can tell is in the wrong position.
  ['M111', 'render.js', "      ${renderScanToggles()}", '',
    'the toggles missing from the scan screen entirely'],
  ['M112', 'render.js', "  <div class=\"togrow${vis ? ' is-visual' : ''}\">",
    '  <div class="togrow">',
    'Visual no longer flagging itself on the scan screen'],
  ['M113', 'render.js', "        ? '<span class=\"pending-flag\">VISUAL INSPECTION ONLY</span>'", "        ? ''",
    'the pending panel not calling out a visual inspection before the verdict'],
  ['M114', 'render.js', "      r.visual === true ? 'Visual' : '', itemLocationShort(r)]",
    '      itemLocationShort(r)]',
    'a visual item indistinguishable from a tested one in the log'],
  ['M115', 'render.js', '      visual: vis,', '',
    'the edit sheet dropping Visual on a round trip to another sheet'],
  ['M116', 'render.js', "      visual: state.visualMode === true,",
    '      visual: false,',
    'an initial-mode item never recorded as visual'],
  ['M117', 'styles.css', '.tog-opt.is-warn.is-on {', '.tog-opt.is-warn.is-NOT-on {',
    'the Visual toggle losing the colour that makes it noticeable'],

  // --- V6: the client's real layout --------------------------------------

  // ⚠ THE ONE THAT MATTERS MOST. A Class II appliance has no earth to bond, so
  // a value in that column claims a test that cannot physically be performed.
  ['M118', 'log.js', "    earthBond: (cls === CLASS_NO_EARTH_BOND) ? '' : cleanText(state.earthBondValue, READING_MAX),",
    '    earthBond: cleanText(state.earthBondValue, READING_MAX),',
    'a class 2 item written with an earth bond reading'],

  // ⚠ THE BROKEN READING OF 7A, and the reason 13f exists. Hoisting the Set out
  // of the function makes "first in this file" mean "first ever" — which is
  // invisible in any single export and loses the floor and room from every file
  // after the first.
  // ⚠ IT MUST BREAK THE BEHAVIOUR, NOT THE SYNTAX. An undefined identifier here
  // would throw, and the suite going red on a ReferenceError proves nothing
  // about whether 13f's assertions work. This parks the Set on the function
  // object so it genuinely persists between exports — which is exactly the
  // "first ever" reading, and it is silent in any single file.
  ['M119', 'csv.js', '  const seenLocation = {};',
    '  const seenLocation = (csvRowsForRecords._ever = csvRowsForRecords._ever || {});',
    'first-in-file becoming first-ever — descriptors missing from every later file'],

  ['M120', 'config.js', "  { key: 'DESCRIPTION', cell: (r) => (r.mode === MODE_INITIAL ? (r.description || '') : '') },",
    "  { key: 'DESCRIPTION', cell: (r) => r.description || '' },",
    'a description going out on audit rows the client already holds'],

  ['M121', 'utils.js', "  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();",
    "  return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '/' + d.getFullYear();",
    'the date emitted month-first — an American reading of the client\'s file'],

  ['M122', 'csv.js', "  const items = recs.filter(r => r.type === 'item');", '  const items = recs;',
    'location records emitted as rows the client\'s importer never asked for'],

  ['M123', 'storage.js', "  if (v === 'II') return '2';", "  if (v === 'II') return '1';",
    'the class migration mapping II onto Class 1'],

  // ⚠ THE 3B TRAP. Under decision 3B the readings are the ONLY thing separating
  // a visual inspection from a full test, so blanking one for tidiness silently
  // reclassifies tested items as inspections — understating work that was done.
  ['M124', 'log.js', '    insulation: cleanText(state.insulationValue, READING_MAX),',
    "    insulation: '',",
    'a tested item exporting as a visual inspection'],

  ['M125', 'log.js', "  if (visual === true || result !== 'pass') return { earthBond: '', insulation: '' };",
    "  if (visual === true) return { earthBond: '', insulation: '' };",
    'readings written onto a failed item'],

  // ⚠ THE DANGEROUS CORRECTION. Turning Visual off must bring the readings back
  // or the fix appears to work on screen and changes nothing in the file.
  ['M126', 'log.js', "    if (rec.visual !== true && rec.result === 'pass' && !rec.earthBond && !rec.insulation) {",
    '    if (false) {',
    'an item corrected from visual to tested still exporting as visual'],

  ['M127', 'config.js', '  if (!ctx || ctx.firstForLocationInFile !== true) return \'\';',
    '  if (!ctx) return \'\';',
    'floor and room landing on every row — 7A quietly becoming 7C'],

  ['M128', 'csv.js', 'text: csvRowsForRecords(items).join', 'text: csvRowsForRecords(recs).join',
    'the rows and the marked records drifting apart'],

  ['M129', 'backup.js', '  if (typeof obj.backupVersion === \'number\' && obj.backupVersion > BACKUP_VERSION) {',
    '  if (false) {',
    'a backup from a newer build imported optimistically and silently degraded'],

  ['M130', 'render.js', '      ${renderLastItem()}', '',
    'the last item quick view missing from the scan screen'],

  ['M131', 'log.js', "    if (r.type !== 'item' || !inCurrentSession(r)) continue;\n    if (!best || byNewest(r, best) < 0) best = r;",
    "    if (!best || byNewest(r, best) < 0) best = r;",
    'the quick view offering a location as the last thing recorded'],

  // --- V7: sessions ------------------------------------------------------
  //
  // ⚠ THE SCOPING MUTATIONS ARE THE ONES THAT MATTER. Every helper below was
  // global before V7 and every one of them stayed green when it was scoped,
  // because one session behaves exactly like no sessions. If any of these
  // survives, the group that claims to cover it is only ever building one
  // session and is not testing scoping at all.

  ['M132', 'sessions.js', 'function inCurrentSession(r) {\n  return !!r && r.sessionId === state.currentSessionId;',
    'function inCurrentSession(r) {\n  return true;',
    'every scoped helper seeing every session on the phone'],

  ['M133', 'log.js', "  return state.records.filter(r => r.type === 'item' && inCurrentSession(r));",
    "  return state.records.filter(r => r.type === 'item');",
    'the log showing another engineer\'s items mixed into your own'],

  ['M134', 'csv.js', '  return state.records\n    .filter(r => inCurrentSession(r))',
    '  return state.records\n    .filter(r => true)',
    'the export sending every session on the phone to the client'],

  ['M135', 'csv.js', '    .sort((a, b) => (a.ts || 0) - (b.ts || 0));',
    '    .sort((a, b) => (b.ts || 0) - (a.ts || 0));',
    'the export in reverse scan order, moving floor and room to the last row'],

  ['M136', 'log.js', '    sessionId: sessionIdForNewRecord(),\n    result: outcome,',
    "    sessionId: '',\n    result: outcome,",
    'an item written with no session — invisible to the log and to the export'],

  ['M137', 'log.js', '    sessionId: sessionIdForNewRecord(),\n    client: cleanText(fields && fields.client, 80),',
    "    sessionId: '',\n    client: cleanText(fields && fields.client, 80),",
    'a location written with no session'],

  ['M138', 'sessions.js', 'function sessionIdForNewRecord() {\n  return ensureOpenSession().id;',
    'function sessionIdForNewRecord() {\n  return state.currentSessionId;',
    'a scan landing in a session that has been closed'],

  // THE BUG V7 WOULD OTHERWISE HAVE SHIPPED. Reverting the scope here restores
  // the pre-V7 global search, which silently offers to replace another
  // engineer's finished record in a session you are not looking at.
  ['M139', 'log.js', "    if (r.type !== 'item' || !inCurrentSession(r)) continue;\n    if (exceptId && r.id === exceptId) continue;",
    "    if (r.type !== 'item') continue;\n    if (exceptId && r.id === exceptId) continue;",
    'the duplicate check reaching into another engineer\'s session'],

  ['M140', 'log.js', "    if (r.type === 'location' && inCurrentSession(r) &&",
    "    if (r.type === 'location' && (true) &&",
    'a location reused across a session boundary'],

  ['M141', 'sessions.js', '  const cur = currentSession();\n  if (cur && !cur.closedAt) return cur;',
    '  const cur = currentSession();\n  if (cur) return cur;',
    'the open-session invariant accepting a closed session'],

  ['M142', 'storage.js', "    if (!r.sessionId || !sessionById(r.sessionId)) orphans.push(r);",
    "    if (!r.sessionId) orphans.push(r);",
    'a dangling sessionId left unrepaired — records invisible everywhere'],

  ['M143', 'storage.js', '  if (!state.currentSessionId) state.currentSessionId = ses.id;',
    '  state.currentSessionId = ses.id;',
    'an adoption pass yanking the engineer out of the session they are in'],

  ['M144', 'log.js', '  for (let i = 0; i < state.records.length; i++) {\n    if (!state.records[i].exported) n++;',
    '  for (let i = 0; i < state.records.length; i++) {\n    if (!state.records[i].exported && inCurrentSession(state.records[i])) n++;',
    'the clear guard blind to unexported work in other sessions'],

  ['M145', 'sessions.js', '  state.currentLocationId = \'\';\n  saveSessions();\n  savePrefs();\n  return ses;',
    '  saveSessions();\n  savePrefs();\n  return ses;',
    'a stale location carried across a session switch'],

  ['M146', 'sessions.js', "    if (r.type === 'item' && r.locationId && remap[r.locationId]) {",
    "    if (false) {",
    'a re-issued location id leaving every item that pointed at it dangling'],

  ['M147', 'sessions.js', "    if (choices[c.key] === 'mine') dropIncoming[c.theirs.id] = 1;\n    else dropLocal[c.mine.id] = 1;",
    "    if (choices[c.key] === 'mine') dropLocal[c.mine.id] = 1;\n    else dropIncoming[c.theirs.id] = 1;",
    'the review keeping the opposite record from the one chosen'],

  ['M148', 'styles.css', 'grid-template-columns: max-content 1fr;',
    'grid-template-columns: 74px 1fr;',
    'the toggle label column pinned back to a fixed width'],

  ['M149', 'backup.js', '  if (obj.kind === SESSION_FILE_KIND) {',
    '  if (false) {',
    'a session file restored through the path that REPLACES the phone'],

  ['M150', 'render.js', "  if (v !== 'review') state.review = null;", '',
    'a half-answered review surviving a walk away from the screen'],

  ['M151', 'sessions.js', '  if (obj.kind !== SESSION_FILE_KIND) {',
    '  if (false) {',
    'a full backup accepted by the session importer'],

  ['M152', 'sessions.js', "    closedAt: Date.now(),\n    engineer: cleanText(meta.engineer, 60),",
    "    closedAt: 0,\n    engineer: cleanText(meta.engineer, 60),",
    'an imported session arriving open and catching the next scan'],

  ['M153', 'backup.js', '  state.sessions = normaliseSessions(obj.sessions);',
    '  state.sessions = [];',
    'a restore losing every session name the engineer chose'],

  ['M154', 'storage.js', "    sessionId: isNonEmptyString(r.sessionId) ? r.sessionId : '',",
    "    sessionId: uid('ses'),",
    'the validator inventing one session per record'],

  // --- V8 layout ----------------------------------------------------------
  // ⚠ FIVE MUTATIONS FOR A RELEASE THAT ONLY MOVED PIXELS, AND THEY ARE THE
  // POINT OF IT. Layout regressions are the single easiest kind to ship: they
  // never throw, they never fail a test written about behaviour, and on the
  // phone they present as "it feels a bit long" rather than as anything a
  // person would file. Each of these is a change somebody could plausibly make
  // in a later release believing it to be a tidy-up.
  ['M155', 'styles.css', '.screen { min-height: 100vh;',
    '.screen { padding-bottom: env(safe-area-inset-bottom); min-height: 100vh;',
    'the home indicator inset counted twice again — the V8 bug, restored'],
  ['M156', 'render.js',
    "      ${initial\n        ? '<span class=\"prompt-small\">Initial — you will be asked for a description</span>'\n        : ''}",
    "      <span class=\"prompt-small\">${initial ? 'Initial — you will be asked for a description' : 'Audit — pass or fail only'}</span>",
    'the Audit sub-line restored for symmetry (3C undone)'],
  ['M157', 'render.js',
    '      <div class="lastitem-acts">\n        <button type="button" class="linkbtn" data-action="editLastItem">Edit</button>',
    '    </div>\n    <div class="lastitem-acts">\n      <button type="button" class="linkbtn" data-action="editLastItem">Edit</button>',
    'Edit and Undo back on a row of their own — margin-left:auto silently doing nothing'],
  ['M158', 'render.js',
    "    ${bits ? `<span class=\"lastitem-sub\">${escapeHTML(bits)}</span>` : ''}",
    '    <span class="lastitem-sub">${escapeHTML(bits)}</span>',
    'the description line emitted unconditionally — 20px back on every audit scan'],
  ['M159', 'styles.css', '.prompt { text-align: center; padding: 12px 8px; }',
    '.prompt { text-align: center; padding: 26px 8px; }',
    'the prompt padding crept back up past its ceiling'],

  // --- V9: scan-to-move --------------------------------------------------
  //
  // ⚠ SIX OF THESE EIGHT BREAK THE ARM RATHER THAN THE MOVE, and that is the
  // shape of this release. "The item did not move" is a loud failure the
  // engineer sees immediately. An arm that outlives its scan, survives a walk
  // to another screen, or never disarms after refusing is silent — the log
  // screen consumed barcodes before V9 too, so nothing looks wrong until the
  // NEXT barcode is quietly read as a destination.
  ['M160', 'dispatch.js',
    "    const id = state.moveArmed;\n    state.moveArmed = '';",
    "    const id = state.moveArmed;",
    'the arm left set after its scan — every later barcode a destination'],
  // ⚠ THIS ONE SURVIVED ON ITS FIRST RUN AND THE MUTATION WAS THE FAULT, not
  // the test. It inserted `if (false) state.moveArmed = '';` above the comment
  // block and left the real assignment sitting below it — dead code added to a
  // working function, which breaks nothing and proves nothing. A mutation must
  // REMOVE OR CHANGE the line that carries the invariant. Anchoring on the
  // statement plus its neighbour is what makes that unambiguous here, because
  // the same assignment appears twice in this file.
  ['M161', 'render.js', "  state.moveArmed = '';\n  // V12.", '  // V12.',
    'an arm surviving navigation, armed invisibly on another screen'],
  ['M162', 'scanner.js', "    kind = state.moveArmed ? 'move' : 'search';",
    "    kind = 'search';",
    'the log screen never routing to the move grammar — the scan becomes a search'],
  ['M163', 'render.js',
    "      locScan.onclick = () => {\n        if (!saveAll()) return;\n        armMove(id);",
    "      locScan.onclick = () => {\n        armMove(id);",
    'arming without saving first (3A undone) — the draft lost silently'],
  ['M164', 'dispatch.js', '  const loc = findLocationByCode(code);',
    '  const loc = findLocationByCode(code) || addLocationRecord(code, MODE_AUDIT, null);',
    'an unknown destination created rather than refused (4A turned into 4C)'],
  ['M165', 'dispatch.js', '  if (!inCurrentSession(rec)) {',
    '  if (false) {',
    'an item moved across sessions, into a location its own export lacks'],
  ['M166', 'render.js', '  <div class="movebar" data-action="cancelMove">',
    '  <div class="movebar">',
    'the armed banner with no way out of it'],
  ['M167', 'dispatch.js',
    "function armMove(id) {\n  setView('log');\n  state.moveArmed = id;",
    "function armMove(id) {\n  state.moveArmed = id;\n  setView('log');",
    'armMove ordering reversed — setView clears the arm it just set'],
  ['M168', 'README.md', 'cache `scan-v12`', 'cache `scan-v11`',
    'the README front page left on the previous release'],

  // --- V10: the picker's cross-session hole -------------------------------
  //
  // ⚠ EVERY ONE OF THESE REMOVES OR CHANGES THE LINE CARRYING THE INVARIANT,
  // which is the lesson M161 taught in V9: a mutation that ADDS dead code to a
  // working function breaks nothing and therefore proves nothing. Where a
  // statement appears more than once it is anchored on a neighbour.
  ['M169', 'log.js',
    "const want = isNonEmptyString(sessionId) ? sessionId : state.currentSessionId;",
    "const want = state.currentSessionId;",
    'the picker back to the current session whatever item it was opened on'],
  ['M170', 'render.js',
    "  const rows = locationChoices(3, sessionId);",
    "  const rows = locationChoices(3);",
    'the session id accepted and then not used — the V9 bug exactly'],
  ['M171', 'render.js',
    "        () => openEditSheet(id, draftNow),\n        // V10 — THE RECORD'S session, read fresh rather than captured, because\n        // this closure outlives the sheet that made it.\n        rec.sessionId",
    "        () => openEditSheet(id, draftNow)",
    'the call site omitting the session, leaving the fix wired to nothing'],
  ['M172', 'log.js',
    "    if (r.type !== 'location' || r.sessionId !== want) continue;",
    "    if (r.type !== 'location') continue;",
    'every session\u2019s rooms offered at once, in one undivided list'],
  ['M173', 'render.js',
    "        ${inCurrentSession(rec)\n          ? '<button type=\"button\" class=\"linkbtn\" id=\"ed-locscan\">Save &amp; scan</button>'\n          : ''}",
    "        <button type=\"button\" class=\"linkbtn\" id=\"ed-locscan\">Save &amp; scan</button>",
    'Save & scan offered where it can only ever refuse (2A undone)'],
  ['M174', 'render.js',
    "    const locScan = sheet.querySelector('#ed-locscan');\n    if (locScan) {\n      locScan.onclick",
    "    const locScan = sheet.querySelector('#ed-locscan');\n    {\n      locScan.onclick",
    'the unguarded wiring — a half-built edit sheet with no Save and no Cancel'],
  ['M175', 'render.js',
    "    : otherSession\n      ? `<p class=\"muted\">That item belongs to another session, and nothing was scanned as a location in it. There is nowhere to move it to.</p>`\n      : `<p class=\"muted\">No locations scanned yet. Scan a location barcode first, then come back.</p>`;",
    "    : `<p class=\"muted\">No locations scanned yet. Scan a location barcode first, then come back.</p>`;",
    'an empty other-session list telling the engineer to go and scan a label that cannot help'],
  ['M176', 'render.js',
    "      <p class=\"muted small\">Share sends a copy of one session to another engineer. <b>It is not a backup</b>",
    "      <p class=\"muted small\">Share sends a copy of one session to another engineer. <b>Handy</b>",
    'the session-file-is-not-a-backup warning lost a second time (3A)'],

  // --- V11: batch initials, and the mode badge ----------------------------
  //
  // ⚠ THESE GUARD A DIFFERENT KIND OF INVARIANT FROM EVERY MUTATION ABOVE
  // THEM. Until V11 the worst a broken write path could do was record the wrong
  // thing about a scan that happened. A run writes codes NOBODY SCANNED, so
  // M177–M181 each break a rule whose failure mode is invented data reaching
  // the client's system looking exactly like real data.
  ['M177', 'utils.js',
    "  const m = s.match(/^(.*?)(\\d+)$/);",
    "  const m = s.match(/^(.*)(\\d+)$/);",
    'a greedy prefix — PAT-0998 counting up as PAT-09910'],
  ['M178', 'utils.js',
    "    out.push(parts.prefix + (v.length >= width ? v : '0'.repeat(width - v.length) + v));",
    "    out.push(parts.prefix + v);",
    'the zero padding dropped — 0008 filed alongside 9 and 10'],
  ['M179', 'utils.js',
    "  if (parts.digits.length > 15) return [];",
    "  if (parts.digits.length > 99) return [];",
    'a tail past the safe integer range counted anyway, plausibly and wrongly'],
  ['M180', 'log.js',
    "  if (firstClashInRun(codes)) return null;",
    "",
    '⚠ THE GAP RULE (3A) — a run written straight over an id already on file'],
  ['M181', 'log.js',
    "      code: codes[i],\n      mode: pending.mode,",
    "      code: pending.code,\n      mode: pending.mode,",
    'every item in the run filed under the ONE scanned id'],
  ['M182', 'render.js',
    "    if (canRun && runCount > 1) {\n      const clash = firstClashInRun(runCodesFrom(code, runCount));\n      if (clash) { showToast(clash + ' is already logged'); return; }\n    }",
    "",
    'the sheet letting a clashing run through to the verdict panel'],
  ['M183', 'render.js',
    "  const canRun = runCodesFrom(code, 2).length === 2 && !state._pendingReplaceId;",
    "  const canRun = runCodesFrom(code, 2).length === 2;",
    'a run offered on a re-scan — one record replaced and the rest invented'],
  ['M184', 'dispatch.js',
    "    if (!n) { commitResult('fail', reason); return; }",
    "    commitResult('fail', reason); if (n) return;",
    '⚠ DECISION 5 — a run failing on one tap with no confirmation at all'],
  ['M185', 'dispatch.js',
    "  if (!rec && pending.count > 1) {",
    "  if (false) {",
    'a refused run throwing away the scan and the typed description'],
  ['M190', 'dispatch.js',
    "  if (rec && pending.count > 1) showToast(pending.count + ' items recorded');",
    "  if (rec) showToast(pending.count + ' items recorded');",
    'the run receipt fired on every single scan, which is how it stops being read'],
  ['M186', 'render.js',
    "      <button type=\"button\" class=\"btn-pass\" data-action=\"pass\">${runCount ? 'PASS ALL ' + runCount : 'PASS'}</button>",
    "      <button type=\"button\" class=\"btn-pass\" data-action=\"pass\">PASS</button>",
    'the one-tap button no longer saying how many it writes'],
  ['M187', 'render.js',
    "      <span class=\"row-mode ${isInitial ? 'is-initial' : 'is-audit'}\">${isInitial ? 'INITIAL' : 'AUDIT'}</span>",
    "      ${isInitial ? '<span class=\"row-mode is-initial\">INITIAL</span>' : ''}",
    '7A half-done — only the initial rows labelled, audit inferred from silence'],
  ['M188', 'render.js',
    "    const isInitial = r.mode === MODE_INITIAL;",
    "    const isInitial = state.mode === MODE_INITIAL;",
    '⚠ RULE 11 — the badge read off the live toggle, re-labelling finished work'],
  ['M189', 'styles.css',
    ".row-item { padding-right: 76px; }",
    "",
    'the badge with no gutter — a long asset code running underneath it'],

  // --- V12: the scoped log, the selection, the receipt, the sort ----------
  //
  // ⚠ THE RULE FROM M161 STILL HOLDS: every one of these REMOVES or CHANGES the
  // line carrying the invariant. A mutation that adds dead code to a working
  // function breaks nothing and proves nothing.
  //
  // ⚠ AND FIVE MUTATIONS IN THIS FILE WENT STALE DURING V12 — M03, M49, M157,
  // M161, M168 — every one of them reporting SKIPPED while the run still ended
  // "0 survived". Skipped is not caught. The runner exits non-zero on a skip for
  // that reason; do not relax it.
  ['M190', 'render.js',
    'let rows = state.records.filter(inCurrentSession).sort(byNewest);',
    'let rows = state.records.slice().sort(byNewest);',
    'the log listing every session again — a batch delete across other engineers\' work'],
  ['M191', 'log.js',
    '  let n = 0;\n  for (let i = 0; i < ids.length; i++) {\n    if (deleteRecord(ids[i])) n++;\n  }\n  return n;',
    '  const n = state.records.filter(r => ids.indexOf(r.id) !== -1).length;\n  state.records = state.records.filter(r => ids.indexOf(r.id) === -1);\n  saveRecords();\n  return n;',
    'a batch delete bypassing deleteRecord — the location sweep skipped, items stranded'],
  ['M192', 'dispatch.js',
    '      if (state.logSelect.indexOf(ids[i]) === -1) state.logSelect.push(ids[i]);',
    '      state.logSelect = ids.slice();',
    'Select all REPLACING the picks — rows ticked before a search silently dropped'],
  ['M193', 'render.js',
    "  state.logSelect = null;\n  closeSheet();",
    '  closeSheet();',
    'select mode surviving navigation — a log where tapping a row opens nothing'],
  ['M194', 'render.js',
    "  state.moveArmed = '';\n  // V12.",
    "  state.moveArmed = '';\n  state.lastRun = null;\n  // V12.",
    'the receipt cleared by navigation — the batch undo gone on the trip that finds the mistake'],
  ['M195', 'log.js',
    '    if (!recordById(run.ids[i])) { state.lastRun = null; return null; }',
    '    if (!recordById(run.ids[i])) continue;',
    'a part-deleted run still offered as whole — delete five, report six, name neither'],
  ['M196', 'log.js',
    '    const r = state.records[i];\n    if (!inCurrentSession(r)) continue;\n    if (!r.exported) n++;',
    '    const r = state.records[i];\n    if (!r.exported) n++;',
    'the two unexported counts merged again — the nudge counting what export cannot send'],
  ['M197', 'utils.js',
    '    const na = parseInt(pa.digits, 10);\n    const nb = parseInt(pb.digits, 10);\n    if (nb !== na) return nb - na;',
    '',
    'the sort tiebreak back on the random id — a run shuffled afresh on every commit'],
  ['M198', 'utils.js',
    '  if (pa && pb && pa.prefix === pb.prefix &&\n      pa.digits.length <= 15 && pb.digits.length <= 15) {',
    '  if (false) {',
    'a textual compare — a run that grows its padding reading 999 above 1002'],
  ['M199', 'render.js',
    '      <button type="button" class="row row-loc" data-action="editRecord" data-arg="${escapeHTML(r.id)}">',
    '      <button type="button" class="row row-loc" data-action="${sel ? \'toggleSelect\' : \'editRecord\'}" data-arg="${escapeHTML(r.id)}">',
    'locations made selectable (3A undone) — the sweep running invisibly at batch scale'],
  ['M200', 'dispatch.js',
    '  } else {\n    state.lastRun = null;\n  }\n  if (rec) feedback(result);',
    '  }\n  if (rec) feedback(result);',
    'the receipt outliving the run — Undo all 6 offered over an unrelated single scan'],
  ['M201', 'log.js',
    '    if (r.type === \'location\') locs++;\n    else if (r.result === \'fail\') fail++;',
    '    if (!inCurrentSession(r)) continue;\n    if (r.type === \'location\') locs++;\n    else if (r.result === \'fail\') fail++;',
    'the phone totals scoped to a session — the clear guard refusing on an invisible number'],
  ['M202', 'dispatch.js',
    '        state.logSelect = null;\n        showToast(\'Removed \' + n',
    '        showToast(\'Removed \' + n',
    'select mode left open over rows that have gone — a Select all whose number moved'],
  ['M203', 'render.js',
    '  if (q &&\n        String(r.code).toLowerCase().indexOf(q) === -1 &&',
    '  if (false &&\n        String(r.code).toLowerCase().indexOf(q) === -1 &&',
    'Select all ignoring the search — a labelled count that ticks rows off screen'],
  ['M204', 'render.js',
    "    <span class=\"counts-note\">${escapeHTML(currentSessionName())}</span>",
    '    <span class="counts-note">all time</span>',
    'the four-release-old lie restored — one session\'s totals called all time'],
  ['M205', 'render.js',
    "      ? 'Nothing in this session matches. Other sessions are not shown here — switch to one in Sessions.'",
    "      ? 'Nothing matches that.'",
    'the no-match copy hiding the scope — yesterday\'s asset reading as never logged'],
  ['M206', 'render.js',
    '  const sel = state.logSelect || [];\n  if (!sel.length) return \'\';\n  return `\n  <div class="selacts">',
    '  const sel = state.logSelect || [];\n  return `\n  <div class="selacts">',
    'a Delete 0 button standing over an empty selection'],
  ['M207', 'log.js',
    '  let n = 0;\n  for (let i = 0; i < ids.length; i++) {\n    if (deleteRecord(ids[i])) n++;\n  }\n  return n;\n}',
    '  for (let i = 0; i < ids.length; i++) {\n    deleteRecord(ids[i]);\n  }\n  return ids.length;\n}',
    'the count reporting what was asked rather than what was removed'],
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
