/*
 * PATGo Scan — storage.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * The persistence boundary. Everything that reaches localStorage goes through
 * here, and every value that comes BACK goes through a validator before it is
 * allowed near `state`.
 *
 * ⚠ DATA-INTEGRITY ZONE. Run a backup round-trip after every edit to this file.
 *
 * WHY PLAIN JSON AND NO KEY-SHORTENING CODEC. PATGo shortens its keys because a
 * session is a deeply nested object repeated hundreds of times and the quota is
 * real. A scan record here is flat and tiny — a thousand of them is well under
 * 200KB. The codec would buy nothing and cost a whole class of encode/decode
 * bug. Decision 9A.
 *
 * THE VALIDATOR RULE: garbage collapses to a safe default, it never throws and
 * it never propagates. A corrupted preference must not be able to stop the app
 * loading — losing a setting is an inconvenience, losing the day's scans is a
 * disaster.
 */

function _lsGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function _lsSet(key, val) {
  try { localStorage.setItem(key, val); return true; } catch (e) {
    console.error('Storage write failed for ' + key, e);
    return false;
  }
}

function _lsRemove(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

function _parseJSON(raw, fallback) {
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Validators — shared by load() AND by backup restore.
//
// ⚠ NEVER write a second validator for the restore path. A backup that restores
// through different rules than a load is a backup that can produce a state the
// app has never seen. Both call these.
// ---------------------------------------------------------------------------

function normaliseRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const type = (r.type === 'location') ? 'location' : 'item';
  const mode = (r.mode === MODE_INITIAL) ? MODE_INITIAL : MODE_AUDIT;
  const code = cleanText(r.code, SCAN_MAX_LENGTH);
  if (!code) return null;   // a record with no barcode is not a record

  const out = {
    id: isNonEmptyString(r.id) ? r.id : uid(type === 'location' ? 'loc' : 'itm'),
    type: type,
    mode: mode,
    code: code,
    ts: (typeof r.ts === 'number' && isFinite(r.ts)) ? r.ts : Date.now(),
    engineer: cleanText(r.engineer, 60),
    exported: r.exported === true,
  };

  if (type === 'item') {
    out.result = (r.result === 'pass' || r.result === 'fail') ? r.result : '';
    out.failReason = out.result === 'fail' ? cleanText(r.failReason, 120) : '';
    out.description = cleanText(r.description, 80);
    out.cls = (CLASS_OPTIONS.indexOf(r.cls) !== -1) ? r.cls : '';
    // V5. ⚠ STRICTLY `=== true`, not truthy. A record restored from an older
    // backup has no `visual` key at all, and every pre-V5 record was a full
    // test — so absent must mean false. Anything looser would let a stray
    // string from a hand-edited backup mark work as visual-only that was not.
    out.visual = r.visual === true;
    out.locationId = isNonEmptyString(r.locationId) ? r.locationId : '';
    out.locationCode = cleanText(r.locationCode, SCAN_MAX_LENGTH);
  } else {
    out.client = cleanText(r.client, 80);
    out.floor = cleanText(r.floor, 60);
    out.room = cleanText(r.room, 60);
  }
  return out;
}

function normaliseRecords(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = {};
  for (let i = 0; i < arr.length; i++) {
    const r = normaliseRecord(arr[i]);
    if (!r) continue;
    // Duplicate ids would make edit-by-id ambiguous and delete the wrong row.
    // Re-id rather than drop — the record itself is still good data.
    if (seen[r.id]) r.id = uid(r.type === 'location' ? 'loc' : 'itm');
    seen[r.id] = 1;
    out.push(r);
  }
  return out;
}

function normaliseStringList(arr, fallbackFn, max) {
  if (!Array.isArray(arr)) return fallbackFn();
  const out = [];
  const seen = {};
  for (let i = 0; i < arr.length; i++) {
    const s = cleanText(arr[i], 80);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen[k]) continue;
    seen[k] = 1;
    out.push(s);
    if (out.length >= (max || 100)) break;
  }
  return out.length ? out : fallbackFn();
}

// V1.1: the quick-pick presets. Same contract as every validator here — garbage
// collapses to a safe default and NEVER throws, because this runs on load and on
// restore, and a throw either way is a blank app holding a day's work.
//
// ⚠ IT ALWAYS RETURNS AT LEAST ONE PRESET. An empty list would render an empty
// grid with no route back to a full one except the Settings reset, which is a
// dead end an engineer would meet mid-job.
function normalisePresets(arr) {
  if (!Array.isArray(arr)) return makeDefaultPresets();
  const out = [];
  const seenId = {};
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (!p || typeof p !== 'object') continue;
    const name = cleanText(p.name, PRESET_NAME_MAX);
    if (!name) continue;
    // A preset with no items is legal — a half-built one on the way to being
    // filled in is not corruption, and refusing it would delete the engineer's
    // work in front of them.
    const items = Array.isArray(p.items)
      ? normaliseStringList(p.items, () => [], QUICK_PICK_MAX)
      : [];
    let id = cleanText(p.id, 60);
    if (!id || seenId[id]) id = uid('preset');
    seenId[id] = 1;
    out.push({ id: id, name: name, items: items });
    if (out.length >= 20) break;
  }
  return out.length ? out : makeDefaultPresets();
}

// The active id is only ever meaningful against a preset that exists. A stale id
// — from a deleted preset, or an older backup — resolves to the first preset
// rather than to nothing, so the grid is never mysteriously empty.
function resolveActivePreset(id, presets) {
  const want = cleanText(id, 60);
  for (let i = 0; i < presets.length; i++) {
    if (presets[i].id === want) return want;
  }
  return presets.length ? presets[0].id : '';
}

function normaliseTheme(v) {
  return (v === 'light' || v === 'dark' || v === 'auto') ? v : 'auto';
}

function normaliseScanSpeed(v) {
  return SCAN_GAP_PRESETS[v] ? v : SCAN_SPEED_DEFAULT;
}

function normaliseMode(v) {
  return (v === MODE_INITIAL) ? MODE_INITIAL : MODE_AUDIT;
}

// V5. An unrecognised value falls back to the default rather than to empty:
// the toggle is a two-position switch and there is no third position for it to
// show. A blank here would paint neither segment as on.
function normaliseItemClass(v) {
  return (CLASS_OPTIONS.indexOf(v) !== -1) ? v : ITEM_CLASS_DEFAULT;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
function load() {
  state.records = normaliseRecords(_parseJSON(_lsGet(RECORDS_KEY), []));
  state.engineer = cleanText(_lsGet(ENGINEER_KEY), 60);
  state.mode = normaliseMode(_lsGet(MODE_KEY));

  // V5. ⚠ DEFAULT OFF, via `=== '1'` rather than `!== '0'`. An upgrading phone
  // has no key at all, and absent must mean Test — see the note on VISUAL_KEY.
  state.visualMode = _lsGet(VISUAL_KEY) === '1';
  state.itemClass = normaliseItemClass(_lsGet(ITEM_CLASS_KEY));
  state.failReasons = normaliseStringList(
    _parseJSON(_lsGet(FAIL_REASONS_KEY), null), makeDefaultFailReasons, 40);
  state.descriptions = normaliseStringList(
    _parseJSON(_lsGet(DESCRIPTIONS_KEY), null), makeSeedDescriptions, DESCRIPTIONS_STORED_MAX);

  // V1.1. An upgrading phone has no presets key at all, so it gets the default
  // preset — NOT its learned descriptions promoted into the grid. Promoting them
  // would hand the engineer a nine-button grid built out of whatever they had
  // typed most recently, which is exactly the reshuffling mess V1.1 removes.
  state.itemPresets = normalisePresets(_parseJSON(_lsGet(QUICK_PICKS_KEY), null));
  state.activePresetId = resolveActivePreset(_lsGet(ACTIVE_PRESET_KEY), state.itemPresets);

  state.theme = normaliseTheme(_lsGet(THEME_KEY));
  state.haptic = _lsGet(HAPTIC_KEY) !== '0';          // DEFAULT ON
  state.sound = _lsGet(SOUND_KEY) === '1';            // DEFAULT OFF
  state.scannerEnabled = _lsGet(SCANNER_KEY) !== '0'; // DEFAULT ON
  state.scannerPaired = _lsGet(SCANNER_PAIRED_KEY) === '1';  // DEFAULT OFF
  state.scanSpeed = normaliseScanSpeed(_lsGet(SCAN_SPEED_KEY));

  // The current location has to survive a restart — an engineer whose phone
  // goes flat mid-corridor should come back to the same room, not to nothing.
  // It is validated against the records that actually exist, because a location
  // id pointing at a deleted record would stamp every later item with a
  // dangling reference.
  const locId = cleanText(_lsGet(LOCATION_KEY), 60);
  state.currentLocationId = locationRecordById(locId) ? locId : '';

  state.welcomeSeen = _lsGet(WELCOME_KEY) === WELCOME_VERSION;
}

// ---------------------------------------------------------------------------
// Save — split per area so a preference change does not rewrite the whole log.
// ---------------------------------------------------------------------------
function saveRecords() {
  return _lsSet(RECORDS_KEY, JSON.stringify(state.records));
}

function savePrefs() {
  _lsSet(ENGINEER_KEY, state.engineer || '');
  _lsSet(MODE_KEY, state.mode);
  _lsSet(VISUAL_KEY, state.visualMode ? '1' : '0');
  _lsSet(ITEM_CLASS_KEY, state.itemClass);
  _lsSet(THEME_KEY, state.theme);
  _lsSet(HAPTIC_KEY, state.haptic ? '1' : '0');
  _lsSet(SOUND_KEY, state.sound ? '1' : '0');
  _lsSet(SCANNER_KEY, state.scannerEnabled ? '1' : '0');
  _lsSet(SCANNER_PAIRED_KEY, state.scannerPaired ? '1' : '0');
  _lsSet(SCAN_SPEED_KEY, state.scanSpeed);
  _lsSet(LOCATION_KEY, state.currentLocationId || '');
}

function saveLists() {
  _lsSet(FAIL_REASONS_KEY, JSON.stringify(state.failReasons));
  _lsSet(DESCRIPTIONS_KEY, JSON.stringify(state.descriptions));
  _lsSet(QUICK_PICKS_KEY, JSON.stringify(state.itemPresets));
  _lsSet(ACTIVE_PRESET_KEY, state.activePresetId || '');
}

// The whole-state write. Used by restore and by anything that has touched more
// than one area.
function save() {
  saveRecords();
  savePrefs();
  saveLists();
}

function markWelcomeSeen() {
  state.welcomeSeen = true;
  _lsSet(WELCOME_KEY, WELCOME_VERSION);
}

// ---------------------------------------------------------------------------
// Storage stats — shown on the Backup page so a full phone is visible before it
// is a problem rather than after.
// ---------------------------------------------------------------------------
function storageBytes() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('scan:') === 0) {
        const v = localStorage.getItem(k) || '';
        total += k.length + v.length;
      }
    }
  } catch (e) { return 0; }
  return total * 2;   // UTF-16 code units
}

function formatBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
