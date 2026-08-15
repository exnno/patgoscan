/*
 * PATGo Scan — log.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * THE RECORD MODEL. This app is a scan LOG, not a database — it records what
 * the engineer did and the client's own software reconciles it later. Nothing
 * here looks anything up, cross-references anything, or decides whether a scan
 * is "valid" against a register. There is no register.
 *
 * TWO RECORD TYPES, ONE ARRAY, in scan order:
 *
 *   location  { id, type:'location', mode, code, ts, engineer, exported,
 *               client, floor, room }          ← client/floor/room: initials only
 *
 *   item      { id, type:'item', mode, code, ts, engineer, exported,
 *               result, failReason, description, cls,
 *               locationId, locationCode }
 *
 * THE STICKY LOCATION. Scanning a location sets `state.currentLocationId` and it
 * stays in force until the engineer arms the bar and scans another one. Every
 * item logged in between is stamped with BOTH the id and the raw barcode.
 *
 * ⚠ WHY BOTH. The id is how the app finds the location record to display; the
 * CODE is what the client's system actually reads. If the engineer later
 * corrects or deletes a location record, items already stamped keep the barcode
 * they were genuinely scanned under. Storing only the id would let a later edit
 * silently rewrite history for items logged an hour earlier.
 *
 * AUDIT vs INITIAL is the engineer's call, taken from the sticky toggle at scan
 * time and FROZEN ONTO THE RECORD. It is never re-derived from the current mode
 * afterwards — otherwise flipping the toggle would retro-relabel the morning's
 * work.
 */

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function recordById(id) {
  if (!id) return null;
  for (let i = 0; i < state.records.length; i++) {
    if (state.records[i].id === id) return state.records[i];
  }
  return null;
}

function locationRecordById(id) {
  const r = recordById(id);
  return (r && r.type === 'location') ? r : null;
}

function currentLocation() {
  return locationRecordById(state.currentLocationId);
}

function currentLocationCode() {
  const loc = currentLocation();
  return loc ? loc.code : '';
}

// A readable one-liner for the location bar. Initials know the room; audits
// know only the barcode, and that is correct — the client already holds the
// description for anywhere they have audited.
function locationLabel(loc) {
  if (!loc) return '';
  const bits = [loc.room, loc.floor, loc.client].filter(isNonEmptyString);
  return bits.length ? bits.join(' · ') : loc.code;
}

function itemRecords() {
  return state.records.filter(r => r.type === 'item');
}

function unexportedCount() {
  let n = 0;
  for (let i = 0; i < state.records.length; i++) {
    if (!state.records[i].exported) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Duplicate detection (decision 4 — warn and offer overwrite)
//
// Scoped to items only, and to the WHOLE log rather than to the current
// location: the engineer walking back through a corridor they have already done
// is exactly the case worth catching, and that is a different location by
// definition.
// ---------------------------------------------------------------------------
function findItemByCode(code, exceptId) {
  const want = cleanText(code, SCAN_MAX_LENGTH).toLowerCase();
  if (!want) return null;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.type !== 'item') continue;
    if (exceptId && r.id === exceptId) continue;
    if (String(r.code).toLowerCase() === want) return r;
  }
  return null;
}

function findLocationByCode(code) {
  const want = cleanText(code, SCAN_MAX_LENGTH).toLowerCase();
  if (!want) return null;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.type === 'location' && String(r.code).toLowerCase() === want) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

// Locations. An audit location that has been scanned before is REUSED rather
// than duplicated — walking back into the kitchen twice is one place, not two,
// and duplicating it would put two identical rows in the client's export.
function addLocationRecord(code, mode, fields) {
  const clean = cleanText(code, SCAN_MAX_LENGTH);
  if (!clean) return null;

  const existing = findLocationByCode(clean);
  if (existing && mode === MODE_AUDIT) {
    state.currentLocationId = existing.id;
    savePrefs();
    return existing;
  }
  // An initial for a location already on file is a correction: fill in the
  // detail on the record that exists rather than adding a second one.
  if (existing && mode === MODE_INITIAL) {
    existing.mode = MODE_INITIAL;
    existing.client = cleanText(fields && fields.client, 80);
    existing.floor = cleanText(fields && fields.floor, 60);
    existing.room = cleanText(fields && fields.room, 60);
    existing.exported = false;   // it has changed; it needs exporting again
    state.currentLocationId = existing.id;
    saveRecords();
    savePrefs();
    return existing;
  }

  const rec = {
    id: uid('loc'),
    type: 'location',
    mode: mode === MODE_INITIAL ? MODE_INITIAL : MODE_AUDIT,
    code: clean,
    ts: Date.now(),
    engineer: state.engineer || '',
    exported: false,
    client: cleanText(fields && fields.client, 80),
    floor: cleanText(fields && fields.floor, 60),
    room: cleanText(fields && fields.room, 60),
  };
  state.records.push(rec);
  state.currentLocationId = rec.id;
  saveRecords();
  savePrefs();
  return rec;
}

// Items. Called only once a result exists — see the note on `state.pending` in
// state.js for why a scanned-but-unjudged item is not written.
function addItemRecord(pending, result, failReason) {
  if (!pending || !pending.code) return null;
  const loc = currentLocation();
  const rec = {
    id: uid('itm'),
    type: 'item',
    mode: pending.mode === MODE_INITIAL ? MODE_INITIAL : MODE_AUDIT,
    code: cleanText(pending.code, SCAN_MAX_LENGTH),
    ts: Date.now(),
    engineer: state.engineer || '',
    exported: false,
    result: result === 'fail' ? 'fail' : 'pass',
    failReason: result === 'fail' ? cleanText(failReason, 120) : '',
    description: cleanText(pending.description, 80),
    cls: (CLASS_OPTIONS.indexOf(pending.cls) !== -1) ? pending.cls : '',
    locationId: loc ? loc.id : '',
    locationCode: loc ? loc.code : '',
  };
  state.records.push(rec);
  saveRecords();
  learnDescription(rec.description);
  return rec;
}

// Overwrite an earlier scan of the same asset (the duplicate flow). The ORIGINAL
// id and timestamp are kept deliberately: this is a correction of one event, not
// a second event, and re-stamping it would move it to the end of the day's work.
function replaceItemRecord(id, pending, result, failReason) {
  const rec = recordById(id);
  if (!rec || rec.type !== 'item') return null;
  const loc = currentLocation();
  rec.mode = pending.mode === MODE_INITIAL ? MODE_INITIAL : MODE_AUDIT;
  rec.result = result === 'fail' ? 'fail' : 'pass';
  rec.failReason = result === 'fail' ? cleanText(failReason, 120) : '';
  if (isNonEmptyString(pending.description)) rec.description = cleanText(pending.description, 80);
  if (CLASS_OPTIONS.indexOf(pending.cls) !== -1) rec.cls = pending.cls;
  rec.locationId = loc ? loc.id : rec.locationId;
  rec.locationCode = loc ? loc.code : rec.locationCode;
  rec.exported = false;    // changed since export — must go out again
  saveRecords();
  learnDescription(rec.description);
  return rec;
}

// Editing from the log (decision 5 — the correction path).
function updateRecordFields(id, fields) {
  const rec = recordById(id);
  if (!rec) return null;
  if (rec.type === 'item') {
    if (fields.result === 'pass' || fields.result === 'fail') rec.result = fields.result;
    rec.failReason = rec.result === 'fail' ? cleanText(fields.failReason, 120) : '';
    if (typeof fields.description === 'string') rec.description = cleanText(fields.description, 80);
    if (CLASS_OPTIONS.indexOf(fields.cls) !== -1) rec.cls = fields.cls;
  } else {
    if (typeof fields.client === 'string') rec.client = cleanText(fields.client, 80);
    if (typeof fields.floor === 'string') rec.floor = cleanText(fields.floor, 60);
    if (typeof fields.room === 'string') rec.room = cleanText(fields.room, 60);
  }
  rec.exported = false;
  saveRecords();
  return rec;
}

// ⚠ SWEEP BEFORE YOU REMOVE. Deleting a location that items were stamped with
// must not orphan them — they keep `locationCode` (the barcode they were
// genuinely scanned under), and the dangling id is cleared. If the location
// being deleted is the current one, the bar goes back to empty rather than
// pointing at nothing.
function deleteRecord(id) {
  const rec = recordById(id);
  if (!rec) return false;
  if (rec.type === 'location') {
    for (let i = 0; i < state.records.length; i++) {
      if (state.records[i].locationId === id) state.records[i].locationId = '';
    }
    if (state.currentLocationId === id) {
      state.currentLocationId = '';
      savePrefs();
    }
  }
  state.records = state.records.filter(r => r.id !== id);
  saveRecords();
  return true;
}

// ---------------------------------------------------------------------------
// Quick-pick presets (V1.1)
//
// ⚠ CURATED, NEVER LEARNED INTO. Nothing in this section is called from the
// scan path — logging an item does not touch a preset. That is the invariant
// that makes a removed item stay removed, and it is the whole reason presets
// and learned descriptions are two lists rather than one.
//
// ⚠ SWITCHING A PRESET CHANGES WHICH BUTTONS SHOW AND NOTHING ELSE. It never
// alters a record, never re-labels history, and is not stamped onto anything —
// so an engineer can switch mid-job with no consequence to the day's work.
// ---------------------------------------------------------------------------
function activePreset() {
  const list = state.itemPresets || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === state.activePresetId) return list[i];
  }
  return list.length ? list[0] : null;
}

function quickPickItems() {
  const p = activePreset();
  return (p && Array.isArray(p.items)) ? p.items : [];
}

function setActivePreset(id) {
  const p = (state.itemPresets || []).filter(x => x.id === id)[0];
  if (!p) return false;
  state.activePresetId = id;
  saveLists();
  return true;
}

function addPreset(name) {
  const n = cleanText(name, PRESET_NAME_MAX);
  if (!n) return null;
  // A new preset starts EMPTY rather than copying the current one. Copying
  // would be a silent duplicate that looks identical in the switcher, and the
  // engineer would have to work out which of two identical lists they are on.
  const p = { id: uid('preset'), name: n, items: [] };
  state.itemPresets.push(p);
  state.activePresetId = p.id;
  saveLists();
  return p;
}

function renamePreset(id, name) {
  const n = cleanText(name, PRESET_NAME_MAX);
  const p = (state.itemPresets || []).filter(x => x.id === id)[0];
  if (!p || !n) return false;
  p.name = n;
  saveLists();
  return true;
}

// ⚠ THE LAST PRESET CANNOT BE DELETED. See normalisePresets() — the app is
// never in a state with no presets, so the grid can never be permanently empty.
function deletePreset(id) {
  if ((state.itemPresets || []).length < 2) return false;
  const before = state.itemPresets.length;
  state.itemPresets = state.itemPresets.filter(p => p.id !== id);
  if (state.itemPresets.length === before) return false;
  if (state.activePresetId === id) state.activePresetId = state.itemPresets[0].id;
  saveLists();
  return true;
}

// Takes the raw textarea text — one item per line, as typed. Blank lines and
// duplicates fall out; the order is the order they were typed in, because that
// order is muscle memory once the grid has been used for a week.
function setPresetItemsFromText(id, text) {
  const p = (state.itemPresets || []).filter(x => x.id === id)[0];
  if (!p) return false;
  const lines = String(text == null ? '' : text).split('\n');
  p.items = normaliseStringList(lines, () => [], QUICK_PICK_MAX);
  saveLists();
  return true;
}

// ---------------------------------------------------------------------------
// Learned descriptions (decision 5A)
//
// Separate from the presets above, and deliberately so: this list is built from
// what the engineer actually types and is only ever shown as the dropdown under
// the description box.
// ---------------------------------------------------------------------------
function learnDescription(desc) {
  const s = cleanText(desc, 80);
  if (!s) return;
  const k = s.toLowerCase();
  const existing = state.descriptions.filter(d => d.toLowerCase() !== k);
  // Most recent first — the appliance you are working through today rises to
  // the top of the suggestions by itself, which is the whole benefit.
  existing.unshift(s);
  state.descriptions = existing.slice(0, DESCRIPTIONS_STORED_MAX);
  saveLists();
}

function suggestDescriptions(query) {
  const q = cleanText(query, 80).toLowerCase();
  const list = state.descriptions || [];
  if (!q) return list.slice(0, DESCRIPTION_SUGGEST_MAX);
  const starts = [];
  const contains = [];
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const l = d.toLowerCase();
    if (l === q) continue;
    if (l.indexOf(q) === 0) starts.push(d);
    else if (l.indexOf(q) !== -1) contains.push(d);
  }
  return starts.concat(contains).slice(0, DESCRIPTION_SUGGEST_MAX);
}

// ---------------------------------------------------------------------------
// Counts for the scan screen
// ---------------------------------------------------------------------------
function todayCounts() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  let pass = 0, fail = 0, locs = 0;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if ((r.ts || 0) < from) continue;
    if (r.type === 'location') { locs++; continue; }
    if (r.result === 'fail') fail++;
    else if (r.result === 'pass') pass++;
  }
  return { pass: pass, fail: fail, locations: locs, total: pass + fail };
}
