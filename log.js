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
 *               result, failReason, description, cls, visual,
 *               earthBond, insulation,
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

// ⚠ V7 — AND IT MUST BELONG TO THE CURRENT SESSION. switchToSession() clears
// the sticky id, but a restore or an adoption pass can seat an id from another
// batch, and a location resolved out of the wrong session would stamp the next
// scan with a location the export is never going to write a row for.
function currentLocation() {
  const loc = locationRecordById(state.currentLocationId);
  return (loc && inCurrentSession(loc)) ? loc : null;
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

// Where an ITEM was tested, as one readable line. V2 — the log could show you
// what was scanned but never where, which made a correction a guess.
//
// ⚠ THE TWO FIELDS DEGRADE SEPARATELY AND THAT IS DELIBERATE (rule 12). The id
// is a pointer and can go dangling: deleting a location clears it off every
// item under it. The CODE is a copy, is never cleared, and is what the client
// reads. So an item whose location was deleted still knows it was L-204 even
// though nothing can tell you which room that was any more — and showing the
// bare code is far better than showing nothing, because the client's own
// register can still resolve it.
function itemLocationLabel(rec) {
  if (!rec) return '';
  return locationLineFor(rec.locationId, rec.locationCode);
}

// V4. The same one-liner, but built from an id that is NOT yet on any record.
// The edit sheet has to show the location you have just PICKED, before Save
// writes it — reading it back off the record would show the old one right up
// until the moment it changed, which is the one moment it matters.
function locationLineFor(locId, fallbackCode) {
  const loc = locationRecordById(locId);
  if (loc) {
    const label = locationLabel(loc);
    // locationLabel() falls back to the code when a location has no room,
    // floor or client on it — an audit-mode location knows only its barcode.
    // Appending the code to itself there would read "L-204 (L-204)".
    return label === loc.code ? loc.code : label + ' (' + loc.code + ')';
  }
  if (isNonEmptyString(fallbackCode)) return fallbackCode;
  return '';
}

// The same thing, trimmed for a list row. The full label plus the code is
// three or four segments, and the log's sub-line already carries description,
// class, result and time — one more long string and the row wraps to three
// lines and stops being scannable. The room alone is what identifies a place
// to the engineer standing in it; the code is on the sheet if they need it.
function itemLocationShort(rec) {
  if (!rec) return '';
  const loc = locationRecordById(rec.locationId);
  if (loc && isNonEmptyString(loc.room)) return loc.room;
  if (loc) return locationLabel(loc);
  return isNonEmptyString(rec.locationCode) ? rec.locationCode : '';
}

// ⚠ V7: SCOPED TO THE CURRENT SESSION, and so is nearly everything below it.
// Once another engineer's session can sit in the same record list, "the log"
// stops meaning "every record on the phone" — showing Dave's items mixed into
// today's counts, today's totals and today's export is wrong in every one of
// those places. The ONE deliberate exception is unexportedCount(), which stays
// global because clearing is global; see the note on it.
function itemRecords() {
  return state.records.filter(r => r.type === 'item' && inCurrentSession(r));
}

// ---------------------------------------------------------------------------
// V4 — what the move picker needs to know about each location
//
// ⚠ A LIST OF BARE BARCODES IS A LIST OF NOTHING. An audit location has no
// client, floor or room on it — locationLabel() falls back to the code — so a
// picker showing labels alone offers the engineer thirty rows reading L-201,
// L-202, L-203 and no way to tell which is the kitchen. Three things already on
// the phone identify a place without anybody typing anything:
//
//   ts       — when you were there. You may not know L-204 from L-207, but you
//              know the kitchen was before the brew and the corridor after.
//   count    — the room where you did twenty things is not the cupboard where
//              you did one.
//   samples  — WHAT you tested there. Far and away the strongest of the three.
//
// ⚠ `samples` IS EMPTY ON A PURE AUDIT JOB and that is honest, not a bug: audit
// items are result-only by design, so there are no descriptions to show. The
// row falls back to time and count, which is genuinely all the phone knows.
//
// One pass over the records, not one pass per location — this runs while a
// sheet is open on a phone that may hold a long day's work.
//
// ⚠ V10 — THE SESSION IS AN ARGUMENT NOW, AND THAT IS THE WHOLE FIX. Until V10
// this was hard-wired to the CURRENT session, which was only ever right by
// accident: the log lists EVERY session, so the edit sheet — and therefore this
// picker — opens on items belonging to batches that are not the one being
// scanned into. Offering today's locations for yesterday's item files it under
// a location its own export file does not contain, which is the same hole V9
// closed from the scanning side and left open from the tapping side.
//
// Scoping to the RECORD'S session rather than refusing outright is the choice
// taken (1B): an item can still be put right, and every row on offer is one
// that will actually be in the file that item ships in. Called with nothing,
// the behaviour is exactly what it always was.
function locationChoices(sampleMax, sessionId) {
  const max = clampInt(sampleMax, 1, 6, 3);
  const want = isNonEmptyString(sessionId) ? sessionId : state.currentSessionId;
  const locs = [];
  const byId = {};
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.type !== 'location' || r.sessionId !== want) continue;
    const row = { rec: r, count: 0, samples: [] };
    byId[r.id] = row;
    locs.push(row);
  }
  // Newest item first, so `samples` holds the most recently tested things —
  // what the engineer did last in that room is what they remember about it.
  const items = state.records.filter(r => r.type === 'item' && r.sessionId === want).sort(byNewest);
  for (let i = 0; i < items.length; i++) {
    const row = byId[items[i].locationId];
    if (!row) continue;
    row.count++;
    const d = cleanText(items[i].description, 80);
    if (d && row.samples.length < max && row.samples.indexOf(d) === -1) row.samples.push(d);
  }
  return locs.sort((a, b) => byNewest(a.rec, b.rec));
}

// ---------------------------------------------------------------------------
// V12 — TWO COUNTS, AND WHICH ONE YOU WANT DEPENDS ON WHAT YOU ARE ABOUT TO DO.
//
// V7 had one, global, on the reasoning that it answered both the clear guard
// and the export nudge and both were about the whole phone. Half of that was
// wrong and V12's hard-scoped log is what made it visible:
//
//   unexportedCount()            — THIS SESSION. Everything that means "what
//                                  will exporting send" or "how much unsent
//                                  work is in front of me". Export has been
//                                  session-scoped since V7 (recordsForExport),
//                                  so a nudge counting Dave's imported session
//                                  sent the engineer to a button that would not
//                                  clear it — it would still say 12 afterwards.
//
//   unexportedCountAllSessions() — THE WHOLE PHONE. The clear guard, and only
//                                  the clear guard, plus the diagnostics dump.
//                                  Clearing destroys every session, so refusing
//                                  while ANY session holds unsent work is the
//                                  only safe reading. Scope this one and an
//                                  engineer can clear away a session they never
//                                  exported.
//
// ⚠ DO NOT COLLAPSE THEM BACK INTO ONE. They agree on a phone holding a single
// session, which is most phones most days — so a merge would look correct right
// up until the day it silently is not, which is the day two engineers' work is
// on the same handset.
//
// ⚠ AND THE ALL-SESSIONS NUMBER MUST BE VISIBLE SOMEWHERE, because the clear
// guard refuses using it. Being blocked by a number that appears on no screen
// is being blocked by nothing you can act on — that is what the phone totals
// line under the sessions list is for (renderSessions).
// ---------------------------------------------------------------------------
function unexportedCount() {
  let n = 0;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (!inCurrentSession(r)) continue;
    if (!r.exported) n++;
  }
  return n;
}

function unexportedCountAllSessions() {
  let n = 0;
  for (let i = 0; i < state.records.length; i++) {
    if (!state.records[i].exported) n++;
  }
  return n;
}

// V12 (12A/13A) — everything on the phone, in one pass, no session filter.
//
// ⚠ ONE PASS OVER THE RECORDS, NOT A SUM OF sessionCounts() ACROSS
// sessionList(), and the difference is not academic. sessionCounts() matches on
// `sessionId`, so a record whose session has gone — a delete that left records
// behind, an import that half-landed — is counted here and invisible to the
// sum. The clear guard counts the same way this does, so summing the parts
// would put a number on screen that the guard then contradicts: "nothing left
// to export" over a button that refuses to clear. This IS the phone.
function phoneTotals() {
  let pass = 0, fail = 0, locs = 0, unsent = 0;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.type === 'location') locs++;
    else if (r.result === 'fail') fail++;
    else if (r.result === 'pass') pass++;
    if (!r.exported) unsent++;
  }
  return { pass: pass, fail: fail, locations: locs, unsent: unsent,
           sessions: (state.sessions || []).length };
}

// ---------------------------------------------------------------------------
// Duplicate detection (decision 4 — warn and offer overwrite)
//
// Scoped to items only, and to the whole of the CURRENT SESSION rather than to
// the current location: the engineer walking back through a corridor they have
// already done is exactly the case worth catching, and that is a different
// location by definition.
//
// ⚠ V7 — AND SCOPED TO THE CURRENT SESSION, WHICH IS NEW AND LOAD-BEARING.
// Before sessions this searched every record on the phone, which was the same
// thing. It is not the same thing once another engineer's session can be sat
// beside yours: scanning an asset Dave already tested would offer to REPLACE
// DAVE'S RECORD, silently editing another engineer's finished work in a session
// you are not even looking at. The cross-engineer case is the review screen's
// job (decisions 9A/10A) and it is a different question asked at a different
// time. Mutation M139.
// ---------------------------------------------------------------------------
function findItemByCode(code, exceptId) {
  const want = cleanText(code, SCAN_MAX_LENGTH).toLowerCase();
  if (!want) return null;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.type !== 'item' || !inCurrentSession(r)) continue;
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
    // ⚠ V7 — CURRENT SESSION ONLY, for the same reason findItemByCode() is.
    // Reusing a location record out of Dave's session would file today's items
    // under a location that belongs to a batch this export will never write.
    if (r.type === 'location' && inCurrentSession(r) &&
        String(r.code).toLowerCase() === want) return r;
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
    sessionId: sessionIdForNewRecord(),
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

// ---------------------------------------------------------------------------
// V6 — the auto-filled readings (decision 4B)
//
// ⚠ THE READING IS COPIED ONTO THE RECORD, NOT DERIVED AT EXPORT. That is the
// whole of 4B: the file has to report what was recorded at the time, so
// changing the figure in Settings in May must not rewrite April's work. It also
// makes the reading editable per record in the log, which a derived value could
// never be.
//
// ⚠ CLASS 2 GETS NO EARTH BOND. Enforced here AND again in the EARTH BOND cell
// in config.js, because a class corrected from 1 to 2 in the log would leave a
// reading behind that was perfectly legitimate when it was written.
//
// ⚠ NO READINGS ON A VISUAL OR ON A FAIL (decisions 3B and 6A). For a visual
// this is the ONLY thing that marks the row as an inspection rather than a
// test — VISUAL and OPERATIONAL say PASS either way.
function readingsFor(cls, visual, result) {
  if (visual === true || result !== 'pass') return { earthBond: '', insulation: '' };
  return {
    earthBond: (cls === CLASS_NO_EARTH_BOND) ? '' : cleanText(state.earthBondValue, READING_MAX),
    insulation: cleanText(state.insulationValue, READING_MAX),
  };
}

// Items. Called only once a result exists — see the note on `state.pending` in
// state.js for why a scanned-but-unjudged item is not written.
function addItemRecord(pending, result, failReason) {
  if (!pending || !pending.code) return null;
  const loc = currentLocation();
  // ⚠ V6: SETTLED BEFORE THE LITERAL, not patched on afterwards. The readings
  // depend on the class, the inspection type and the result that are about to
  // be written, and the record's key order has to match normaliseRecord()'s or
  // a save/load round trip stops being byte-identical — which is the cheapest
  // check there is that persistence is lossless.
  const cls = (CLASS_OPTIONS.indexOf(pending.cls) !== -1) ? pending.cls : '';
  const visual = pending.visual === true;
  const outcome = result === 'fail' ? 'fail' : 'pass';
  const readings = readingsFor(cls, visual, outcome);
  const rec = {
    id: uid('itm'),
    type: 'item',
    mode: pending.mode === MODE_INITIAL ? MODE_INITIAL : MODE_AUDIT,
    code: cleanText(pending.code, SCAN_MAX_LENGTH),
    ts: Date.now(),
    engineer: state.engineer || '',
    exported: false,
    sessionId: sessionIdForNewRecord(),
    result: outcome,
    failReason: outcome === 'fail' ? cleanText(failReason, 120) : '',
    description: cleanText(pending.description, 80),
    cls: cls,
    // V5. ⚠ TAKEN FROM THE PENDING ITEM, NOT FROM state.visualMode. The pending
    // item captured the toggle at scan time, and the toggle can be changed
    // while an item waits for a result. Reading the live toggle here would
    // record the position it ended up in rather than the one that was showing
    // on screen when PASS was pressed.
    visual: visual,
    earthBond: readings.earthBond,
    insulation: readings.insulation,
    locationId: loc ? loc.id : '',
    locationCode: loc ? loc.code : '',
  };
  state.records.push(rec);
  saveRecords();
  learnDescription(rec.description);
  return rec;
}

// ---------------------------------------------------------------------------
// V11 — BATCH INITIALS. A run of identical appliances filed in one go.
//
// ⚠⚠ THIS IS THE FIRST TIME THIS APP WRITES A CODE NOBODY SCANNED, and every
// rule below exists because of that one fact. The premise of the whole app has
// been that each code on file came off a label; a run keeps that true for the
// FIRST id and takes the engineer's word for the rest. So the engineer has to
// be shown exactly what they are agreeing to before it is written, and the app
// must never quietly decide something on their behalf.
// ---------------------------------------------------------------------------

// The first code in the list that is already an item in this session, or ''.
//
// ⚠ ONE DEFINITION, TWO CALLERS, ON PURPOSE. The New item sheet calls it early
// so the engineer finds out while they are still stood at the shelf, and
// addItemRun() calls it again immediately before writing. They are not two
// tests that must agree — they are the same test asked twice, which is the only
// shape of belt-and-braces that cannot drift.
function firstClashInRun(codes) {
  for (let i = 0; i < (codes || []).length; i++) {
    if (findItemByCode(codes[i], null)) return codes[i];
  }
  return '';
}

// Write a run. Returns the records written, or null if it wrote nothing.
//
// ⚠ 3A — THE APP NEVER GUESSES ACROSS A GAP. If any id in the range is already
// on file in this session the WHOLE run is refused and the clash is named. The
// tempting alternative — skip the taken ones and carry on until N new records
// exist — silently moves the end of the range, so the last id in the run is one
// nobody ever held a label up against. Refusing costs the engineer two runs
// (1000-1003, then 1005-) and costs the client nothing.
//
// ⚠ IT GOES THROUGH addItemRecord() FOR EVERY ITEM, DELIBERATELY. A second
// record builder here would be a second place for the class rules, the reading
// rules, the visual rule, the session stamp and the key order to be got right,
// and the first release to change one of them would change it in one place
// only. The cost is one save per item, which is real and is the right price.
function addItemRun(pending, result, failReason) {
  if (!pending || !pending.code) return null;
  const codes = runCodesFrom(pending.code, pending.count);
  if (codes.length < 2) return null;
  if (firstClashInRun(codes)) return null;
  const out = [];
  for (let i = 0; i < codes.length; i++) {
    // ⚠ THE PENDING ITEM IS COPIED PER ID, NOT MUTATED. Handing the same object
    // round the loop with its code overwritten leaves the caller's pending item
    // holding the LAST id in the run, which is what the screen would then be
    // discarding, undoing or re-rendering.
    const rec = addItemRecord({
      code: codes[i],
      mode: pending.mode,
      description: pending.description,
      cls: pending.cls,
      visual: pending.visual,
    }, result, failReason);
    if (rec) out.push(rec);
  }
  return out.length ? out : null;
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
  // V5. ⚠ ALWAYS WRITTEN, never conditional. `cls` above is guarded because an
  // empty class means "not captured" and must not wipe a good one — but visual
  // is a boolean with no such third state, so a guard like `if (pending.visual)`
  // would make the flag one-way: you could mark an item visual by re-scanning
  // it and never unmark it. Re-testing an item you had logged as visual-only is
  // exactly the correction this path exists for.
  rec.visual = pending.visual === true;
  rec.locationId = loc ? loc.id : rec.locationId;
  rec.locationCode = loc ? loc.code : rec.locationCode;
  // V6. ⚠ RE-DERIVED, NOT PRESERVED. This path is a re-scan of the same asset —
  // a correction of one event — and the class or the inspection type may have
  // changed with it. Keeping the old readings here would leave an earth bond
  // figure on an item just corrected to Class 2.
  const readings = readingsFor(rec.cls, rec.visual, rec.result);
  rec.earthBond = readings.earthBond;
  rec.insulation = readings.insulation;
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
    // V5. ⚠ `typeof === 'boolean'`, not truthiness. Testing the value itself
    // would make `false` indistinguishable from "the caller did not mention
    // it", and unticking Visual on the edit sheet would silently do nothing —
    // the correction that matters most, since a full test wrongly recorded as
    // visual-only understates work that was actually done.
    if (typeof fields.visual === 'boolean') rec.visual = fields.visual;
    // V4 — the move. ⚠ BOTH FIELDS OR NEITHER (rule 12). The id is the pointer
    // and the code is the copy the client reads; writing one without the other
    // leaves an item filed under one location on screen and exported under
    // another. They are only ever set together, from a location record that
    // actually exists.
    //
    // ⚠ AN UNRESOLVABLE ID IS IGNORED, NOT WRITTEN. Clearing the code to match
    // would throw away the barcode the item was genuinely scanned under, which
    // is the one thing that survives a deleted location on purpose.
    // V6 — the readings are editable from the log (decision 4B). ⚠ TYPED, NOT
    // RE-DERIVED. Unlike the re-scan path above, an edit here is the engineer
    // stating the figure, so an EMPTY STRING IS A REAL ANSWER — it is how a
    // reading recorded by mistake is removed. Guarding on truthiness would make
    // the field one-way.
    if (typeof fields.earthBond === 'string') rec.earthBond = cleanText(fields.earthBond, READING_MAX);
    if (typeof fields.insulation === 'string') rec.insulation = cleanText(fields.insulation, READING_MAX);

    // ⚠ TURNING VISUAL OFF MUST BRING THE READINGS BACK, and this is the whole
    // reason the rule lives in the model and not only in the edit sheet.
    //
    // Under decision 3B, VISUAL and OPERATIONAL say PASS for an inspection and
    // for a full test alike — an EMPTY READING is the only thing in the
    // client's file that tells the two apart. So an item corrected from
    // visual-only to tested, and left with the empty readings it had as a
    // visual, still exports as an inspection. The correction would appear to
    // have worked on screen and changed nothing in the file, which understates
    // work that was actually done.
    //
    // ⚠ ONLY WHEN THERE IS NOTHING THERE. A figure the engineer typed is an
    // answer and is never overwritten — this seeds a gap, it does not correct a
    // value.
    if (rec.visual !== true && rec.result === 'pass' && !rec.earthBond && !rec.insulation) {
      const seeded = readingsFor(rec.cls, false, 'pass');
      rec.earthBond = seeded.earthBond;
      rec.insulation = seeded.insulation;
    }
    // ⚠ AND THE VISUAL RULE THE OTHER WAY. A record marked visual carries no
    // readings however they got onto it — the safe direction, but it still has
    // to be true or the file contradicts itself.
    if (rec.visual === true) { rec.earthBond = ''; rec.insulation = ''; }
    // ⚠ AND THEN THE CLASS RULE WINS OVER BOTH. A Class 2 item cannot carry an
    // earth bond reading however it got there, including by being typed in.
    if (rec.cls === CLASS_NO_EARTH_BOND) rec.earthBond = '';

    if (isNonEmptyString(fields.locationId) && fields.locationId !== rec.locationId) {
      const loc = locationRecordById(fields.locationId);
      if (loc) {
        rec.locationId = loc.id;
        rec.locationCode = loc.code;
      }
    }
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

// V12 — a batch delete, for the log's selection and for undoing a whole run.
//
// ⚠ IT GOES THROUGH deleteRecord() PER ID RATHER THAN FILTERING THE LIST ONCE,
// and that is the same rule addItemRun() follows on the way in: one place knows
// how to remove a record, and everything else asks it to. A filter over a set
// of ids would look identical and quietly skip the location sweep above — the
// pass that clears `locationId` from items pointing at a location being
// removed, and the one that drops the current location if it was the one
// deleted. Items stranded against a location id that no longer exists is a bug
// that does not show up until an export three hours later.
//
// ⚠ THE COUNT RETURNED IS WHAT WAS ACTUALLY REMOVED, not what was asked for. An
// id can go between the tick and the tap — another tab, a restore — and the
// caller says "removed 5" because five is what happened.
function deleteRecords(ids) {
  if (!ids || !ids.length) return 0;
  let n = 0;
  for (let i = 0; i < ids.length; i++) {
    if (deleteRecord(ids[i])) n++;
  }
  return n;
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
// V6 (13D) — the last item recorded, for the quick view at the foot of the scan
// screen. Newest by timestamp rather than last in the array: an edited record
// keeps its original position, and the array order is insertion order.
//
// ⚠ ITEMS ONLY. A location scanned between two assets is not "the last thing
// you recorded" in the sense the engineer means when they glance down to check
// what just went in.
function lastItemRecord() {
  let best = null;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.type !== 'item' || !inCurrentSession(r)) continue;
    if (!best || byNewest(r, best) < 0) best = r;
  }
  return best;
}

// V12 (6A) — the run receipt, or nothing.
//
// ⚠ IT VERIFIES BEFORE IT OFFERS, exactly as renderMoveBar() does with a move
// arm. The receipt is held in memory across navigation, so between committing a
// run and looking back at the scan screen an id can have gone: undone one at a
// time, deleted from the log, or swept away by a restore in another tab.
// Offering "Undo all 6" over five records would delete five and report six, and
// the engineer would never know which one it missed.
//
// ⚠ ALL OR NOTHING, NOT "the ones that are left". A partly-deleted run is no
// longer the thing the receipt describes, and quietly shrinking the offer to
// fit would mean the number on the button changed meaning without the engineer
// doing anything. It clears itself instead and the ordinary single Undo — which
// is never wrong — takes over.
//
// ⚠ IT CLEARS THE STALE RECEIPT AS IT GOES. Leaving it set would make every
// later render walk a list of ids that will never verify again.
function activeRun() {
  const run = state.lastRun;
  if (!run || !run.ids || run.ids.length < 2) return null;
  for (let i = 0; i < run.ids.length; i++) {
    if (!recordById(run.ids[i])) { state.lastRun = null; return null; }
  }
  return run;
}

// V6 (13D) — totals across the whole log, not the day. ⚠ V7: "the whole log"
// now means the whole of the CURRENT SESSION. The label on screen says which
// session it is counting, because a number that silently changed meaning when
// sessions arrived would be worse than no number.
//
// ⚠ THIS IS A DIFFERENT NUMBER FROM todayCounts() BELOW AND THE LABEL MUST SAY
// SO. Two count strips that look identical and disagree is worse than one, and
// the day's figures are already on the scan screen.
function logTotals() {
  let pass = 0, fail = 0, locs = 0;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (!inCurrentSession(r)) continue;
    if (r.type === 'location') { locs++; continue; }
    if (r.result === 'fail') fail++;
    else if (r.result === 'pass') pass++;
  }
  return { pass: pass, fail: fail, locations: locs, total: pass + fail };
}

function todayCounts() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  let pass = 0, fail = 0, locs = 0;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if ((r.ts || 0) < from || !inCurrentSession(r)) continue;
    if (r.type === 'location') { locs++; continue; }
    if (r.result === 'fail') fail++;
    else if (r.result === 'pass') pass++;
  }
  return { pass: pass, fail: fail, locations: locs, total: pass + fail };
}
