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
    // V7 — the session this record belongs to. ⚠ AN EMPTY ONE IS NOT AN ERROR
    // AND MUST NOT BE INVENTED HERE. Every record written before V7 has no
    // sessionId at all, and so does every record in a V6 backup restored next
    // year. They are adopted in one pass by adoptOrphanRecords() below, which
    // can see the whole log at once and name a session after the range it
    // covers; a per-record default here would make one session per record.
    sessionId: isNonEmptyString(r.sessionId) ? r.sessionId : '',
  };

  if (type === 'item') {
    out.result = (r.result === 'pass' || r.result === 'fail') ? r.result : '';
    out.failReason = out.result === 'fail' ? cleanText(r.failReason, 120) : '';
    out.description = cleanText(r.description, 80);
    out.cls = normaliseRecordClass(r.cls);
    // V5. ⚠ STRICTLY `=== true`, not truthy. A record restored from an older
    // backup has no `visual` key at all, and every pre-V5 record was a full
    // test — so absent must mean false. Anything looser would let a stray
    // string from a hand-edited backup mark work as visual-only that was not.
    out.visual = r.visual === true;
    // V6 — the readings. Plain strings; '<0.2' and '>19.99' do not parse and
    // were never meant to. An absent one is an empty string, which is a
    // legitimate value meaning no reading was taken.
    out.earthBond = cleanText(r.earthBond, READING_MAX);
    out.insulation = cleanText(r.insulation, READING_MAX);
    // ⚠ THE CLASS 2 RULE APPLIES ON THE WAY IN TOO. A hand-edited backup, or
    // one written by a version that got this wrong, must not be able to seat a
    // Class II earth bond reading in state where the export would trust it.
    if (out.cls === CLASS_NO_EARTH_BOND) out.earthBond = '';
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

// ---------------------------------------------------------------------------
// V7 — sessions
//
// ⚠ A SESSION IS NEVER DROPPED FOR BEING MALFORMED, only repaired. Dropping one
// orphans every record pointing at it, and the adoption pass below would then
// sweep those records into a NEW session with a machine-generated name — so a
// missing name would cost the engineer the name they actually chose. The
// validator rule applies as everywhere else: garbage collapses to a safe
// default and never throws.
function normaliseSession(s) {
  if (!s || typeof s !== 'object') return null;
  const ts = (typeof s.ts === 'number' && isFinite(s.ts)) ? s.ts : Date.now();
  const closed = (typeof s.closedAt === 'number' && isFinite(s.closedAt) && s.closedAt > 0)
    ? s.closedAt : 0;
  return {
    id: isNonEmptyString(s.id) ? s.id : uid('ses'),
    name: cleanText(s.name, SESSION_NAME_MAX) || defaultSessionName(ts),
    ts: ts,
    closedAt: closed,
    // Whose work this is. Carried on the session as well as on every record so
    // an imported session says who it came from before you open it.
    engineer: cleanText(s.engineer, 60),
  };
}

function normaliseSessions(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = {};
  for (let i = 0; i < arr.length; i++) {
    const ses = normaliseSession(arr[i]);
    if (!ses) continue;
    // Duplicate ids would make "which session is this record in" ambiguous and
    // send the wrong batch to the client. Re-id rather than drop.
    if (seen[ses.id]) ses.id = uid('ses');
    seen[ses.id] = 1;
    out.push(ses);
  }
  return out;
}

// ---------------------------------------------------------------------------
// V7 — THE SESSION MIGRATION (decision 4A)
//
// Every record written before V7 has no `sessionId`. They are adopted in ONE
// pass into a single session named after the range they cover, which is the
// honest description of what they are: the work that was on the phone before
// sessions existed.
//
// ⚠ IT ALSO CATCHES DANGLING POINTERS, not just absent ones. A record naming a
// session that is not in the list is in exactly the same position as a record
// naming none — invisible on the sessions screen and, with export scoped to the
// session (3B), MISSING FROM EVERY FILE THE APP WOULD EVER WRITE. That is the
// failure this pass exists to make impossible, and it is why it runs on every
// load rather than once behind an "upgraded" flag.
//
// ⚠ DO NOT DELETE IT ONCE "EVERYBODY HAS UPGRADED", for the same reason the V6
// class migration is still here. Backups are files: a V6 backup restored in
// 2028 arrives with no sessions in it at all.
function adoptOrphanRecords() {
  const orphans = [];
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (!r.sessionId || !sessionById(r.sessionId)) orphans.push(r);
  }
  if (!orphans.length) return false;

  let lo = orphans[0].ts || Date.now();
  let hi = lo;
  for (let i = 1; i < orphans.length; i++) {
    const t = orphans[i].ts || lo;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }

  const ses = normaliseSession({
    id: uid('ses'),
    name: sessionRangeName(lo, hi),
    ts: lo,
    closedAt: 0,
    engineer: state.engineer || '',
  });
  state.sessions.push(ses);
  for (let i = 0; i < orphans.length; i++) orphans[i].sessionId = ses.id;

  // ⚠ IT ONLY TAKES OVER AS CURRENT WHEN THERE IS NO CURRENT SESSION. On the
  // V6 → V7 upgrade there is none, so this is the work the engineer is already
  // in the middle of and they land back in it. If a session IS open, a handful
  // of orphans arriving from a restore must not yank them out of it mid-job.
  if (!state.currentSessionId) state.currentSessionId = ses.id;
  return true;
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

// ---------------------------------------------------------------------------
// V6 — THE CLASS MIGRATION (decision 1B)
//
// Every record written before V6 holds 'I' or 'II'. V6 stores '1' and '2',
// which is what the client's own file contains, so the old form is translated
// on the way in — on LOAD and on RESTORE alike, because both go through
// normaliseRecord().
//
// ⚠ DO NOT DELETE THIS ONCE "EVERYBODY HAS UPGRADED". Backups are files. One
// taken in May 2026 and restored in 2028 arrives holding Roman numerals, and
// without this every record in it exports a blank class — on screen as well as
// in the file, so there is nothing to notice until the client asks.
//
// ⚠ AN UNRECOGNISED VALUE ON A RECORD BECOMES EMPTY, not the default. A record
// whose class was never captured must stay uncaptured; inventing Class 1 for it
// would claim an earth bond test that nobody performed.
function normaliseRecordClass(v) {
  if (v === 'I') return '1';
  if (v === 'II') return '2';
  return (CLASS_OPTIONS.indexOf(v) !== -1) ? v : '';
}

// The TOGGLE's stored position, which is a different question. ⚠ HERE an
// unrecognised value falls back to the DEFAULT rather than to empty: the toggle
// is a two-position switch with no third position, and a blank would paint
// neither segment as on.
function normaliseItemClass(v) {
  const migrated = normaliseRecordClass(v);
  return migrated || ITEM_CLASS_DEFAULT;
}

// V6 — a reading is free text. Trimmed and capped, never parsed.
function normaliseReading(v, fallback) {
  const t = cleanText(v, READING_MAX);
  return t || fallback;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
function load() {
  state.records = normaliseRecords(_parseJSON(_lsGet(RECORDS_KEY), []));

  // V7 — sessions, then the adoption pass, then the open-session invariant.
  // ⚠ THE ORDER IS LOAD-BEARING. Adoption has to see the session list to tell a
  // dangling pointer from a good one, and ensureOpenSession() has to run after
  // adoption or it would open an empty session beside the one just built and
  // leave the engineer looking at the wrong batch.
  state.sessions = normaliseSessions(_parseJSON(_lsGet(SESSIONS_KEY), []));
  const wantSession = cleanText(_lsGet(CURRENT_SESSION_KEY), 60);
  state.currentSessionId = sessionById(wantSession) ? wantSession : '';
  adoptOrphanRecords();
  ensureOpenSession();
  state.engineer = cleanText(_lsGet(ENGINEER_KEY), 60);
  state.mode = normaliseMode(_lsGet(MODE_KEY));

  // V5. ⚠ DEFAULT OFF, via `=== '1'` rather than `!== '0'`. An upgrading phone
  // has no key at all, and absent must mean Test — see the note on VISUAL_KEY.
  state.visualMode = _lsGet(VISUAL_KEY) === '1';
  state.itemClass = normaliseItemClass(_lsGet(ITEM_CLASS_KEY));
  state.earthBondValue = normaliseReading(_lsGet(EARTH_BOND_KEY), EARTH_BOND_DEFAULT);
  state.insulationValue = normaliseReading(_lsGet(INSULATION_KEY), INSULATION_DEFAULT);
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

// V7. ⚠ SEPARATE FROM saveRecords() BUT ALMOST ALWAYS WRITTEN WITH IT. A record
// list naming sessions that were never written is the dangling-pointer case
// adoptOrphanRecords() has to repair on the next load, and the repair costs the
// engineer their session names. Anything that moves records between sessions
// calls both.
function saveSessions() {
  _lsSet(SESSIONS_KEY, JSON.stringify(state.sessions));
  _lsSet(CURRENT_SESSION_KEY, state.currentSessionId || '');
}

function savePrefs() {
  _lsSet(ENGINEER_KEY, state.engineer || '');
  _lsSet(MODE_KEY, state.mode);
  _lsSet(VISUAL_KEY, state.visualMode ? '1' : '0');
  _lsSet(ITEM_CLASS_KEY, state.itemClass);
  _lsSet(EARTH_BOND_KEY, state.earthBondValue || '');
  _lsSet(INSULATION_KEY, state.insulationValue || '');
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
  saveSessions();
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
