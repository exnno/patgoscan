/*
 * PATGo Scan — sessions.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * V7. A SESSION IS A NAMED BOUNDARY AROUND A BATCH OF WORK. Every record belongs
 * to exactly one, the current session is the one being scanned into, and the
 * session is the unit of export (decision 3B).
 *
 * This file owns four things that are really one thing:
 *   the spine     — create, switch, name, close, reopen, the open invariant
 *   the exchange  — writing a session to a file and reading one back
 *   the merge     — folding one session into another
 *   the review    — answering duplicates before either lands
 *
 * ⚠ THE GRAMMAR OF WHOSE RECORD WINS IS SETTLED IN ONE PLACE — _applyChoice()
 * below. Import and merge are the same operation wearing different labels, and
 * writing the resolution twice is how the two would drift apart.
 *
 * ⚠ TWO JSON FILES LEAVE THIS APP AND THEY DO OPPOSITE THINGS. A backup
 * REPLACES the phone; a session file MERGES into it. Each path refuses the
 * other by name — see _describeWrongKind() here and the guard in backup.js.
 * They are deliberately worded to say which file you handed over and what you
 * probably meant, because the two are one tap apart in the Files app and the
 * cost of guessing wrong is a day's work.
 */

// ---------------------------------------------------------------------------
// Naming
//
// A session nobody names still has to be identifiable in a list six deep, so
// the default is the thing an engineer actually remembers: the day.
// ---------------------------------------------------------------------------
const SESSION_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SESSION_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function defaultSessionName(ms) {
  const d = new Date((typeof ms === 'number' && isFinite(ms)) ? ms : Date.now());
  return SESSION_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + SESSION_MONTHS[d.getMonth()];
}

// The name given to the records adopted by the V7 migration (decision 4A). It
// describes the range they actually cover rather than the day of the upgrade,
// because "Thu 20 Aug" on a batch that started the previous Tuesday is a lie
// the engineer would have to un-learn.
function sessionRangeName(lo, hi) {
  const a = new Date((typeof lo === 'number' && isFinite(lo)) ? lo : Date.now());
  const b = new Date((typeof hi === 'number' && isFinite(hi)) ? hi : Date.now());
  const sameDay = a.getFullYear() === b.getFullYear() &&
                  a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay) return defaultSessionName(lo);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return a.getDate() + '–' + b.getDate() + ' ' + SESSION_MONTHS[b.getMonth()];
  }
  return a.getDate() + ' ' + SESSION_MONTHS[a.getMonth()] + ' – ' +
         b.getDate() + ' ' + SESSION_MONTHS[b.getMonth()];
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
function sessionById(id) {
  const want = cleanText(id, 60);
  if (!want) return null;
  for (let i = 0; i < state.sessions.length; i++) {
    if (state.sessions[i].id === want) return state.sessions[i];
  }
  return null;
}

function currentSession() {
  return sessionById(state.currentSessionId);
}

function currentSessionName() {
  const s = currentSession();
  return s ? s.name : '';
}

// ⚠ THE INVARIANT: THERE IS ALWAYS EXACTLY ONE OPEN SESSION AND IT IS CURRENT.
// Restoring it here rather than defending against its absence in twenty places
// is what keeps every write path simple — nothing in the app has to cope with
// "there is nowhere to put this scan". Called from load(), and again from every
// record write, because a session can be closed between the two.
function ensureOpenSession() {
  const cur = currentSession();
  if (cur && !cur.closedAt) return cur;

  // Prefer an existing open session over inventing one: closing session B when
  // A is still open should land the engineer back in A, not in a third empty
  // session beside two perfectly good ones.
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    if (!state.sessions[i].closedAt) {
      state.currentSessionId = state.sessions[i].id;
      return state.sessions[i];
    }
  }
  const ses = {
    id: uid('ses'),
    name: defaultSessionName(Date.now()),
    ts: Date.now(),
    closedAt: 0,
    engineer: state.engineer || '',
  };
  state.sessions.push(ses);
  state.currentSessionId = ses.id;
  return ses;
}

// The id every newly written record is stamped with. ⚠ GOES THROUGH
// ensureOpenSession(), NEVER STRAIGHT TO state.currentSessionId — a record
// stamped with a closed session's id is invisible on the scan screen and, with
// export scoped to the session, missing from the file.
function sessionIdForNewRecord() {
  return ensureOpenSession().id;
}

function recordsInSession(id) {
  const want = cleanText(id, 60);
  if (!want) return [];
  return state.records.filter(r => r.sessionId === want);
}

// ⚠ THE PREDICATE THE WHOLE OF log.js SCOPES ITSELF WITH. Kept as one function
// so that "what counts as my current work" has exactly one definition.
function inCurrentSession(r) {
  return !!r && r.sessionId === state.currentSessionId;
}

// Counts for one row of the sessions list. One pass, because this runs once per
// session on a screen that may hold a dozen of them.
function sessionCounts(id) {
  const out = { items: 0, locations: 0, unexported: 0, pass: 0, fail: 0 };
  const want = cleanText(id, 60);
  if (!want) return out;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.sessionId !== want) continue;
    if (r.type === 'location') out.locations++;
    else {
      out.items++;
      if (r.result === 'pass') out.pass++;
      else if (r.result === 'fail') out.fail++;
    }
    if (!r.exported) out.unexported++;
  }
  return out;
}

// Newest first, but the OPEN session always leads regardless of age — it is the
// one being worked in and the one every action on this screen is relative to.
function sessionList() {
  return state.sessions.slice().sort((a, b) => {
    const ao = a.closedAt ? 0 : 1;
    const bo = b.closedAt ? 0 : 1;
    if (ao !== bo) return bo - ao;
    return (b.ts || 0) - (a.ts || 0);
  });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
function createSession(name) {
  const ses = {
    id: uid('ses'),
    name: cleanText(name, SESSION_NAME_MAX) || defaultSessionName(Date.now()),
    ts: Date.now(),
    closedAt: 0,
    engineer: state.engineer || '',
  };
  state.sessions.push(ses);
  switchToSession(ses.id);
  return ses;
}

// ⚠ SWITCHING CLEARS THE CURRENT LOCATION. The sticky location is an id, and
// that id belongs to a record in the session being left behind — carrying it
// across would stamp the next scan with a location that is not in the file the
// export is about to write. The engineer arms the bar again, which costs one
// tap and is the same thing they do every time they walk into a new room.
function switchToSession(id) {
  const ses = sessionById(id);
  if (!ses) return null;
  state.currentSessionId = ses.id;
  state.currentLocationId = '';
  saveSessions();
  savePrefs();
  return ses;
}

function renameSession(id, name) {
  const ses = sessionById(id);
  if (!ses) return null;
  const clean = cleanText(name, SESSION_NAME_MAX);
  if (!clean) return null;
  ses.name = clean;
  saveSessions();
  return ses;
}

function closeSession(id) {
  const ses = sessionById(id);
  if (!ses || ses.closedAt) return null;
  ses.closedAt = Date.now();
  saveSessions();
  // Closing the one being worked in has to leave the engineer somewhere they
  // can work — the invariant, restored immediately rather than at the next
  // scan, so the screen they are looking at is already correct.
  if (state.currentSessionId === ses.id) {
    state.currentSessionId = '';
    state.currentLocationId = '';
    ensureOpenSession();
    savePrefs();
    saveSessions();
  }
  return ses;
}

// Decision 5B. The confirm lives in dispatch.js where the tap is; this is the
// mechanism only.
function reopenSession(id) {
  const ses = sessionById(id);
  if (!ses || !ses.closedAt) return null;
  ses.closedAt = 0;
  switchToSession(ses.id);
  return ses;
}

// Only ever offered for a session holding nothing. ⚠ DELETING A SESSION WITH
// RECORDS IN IT IS NOT A FEATURE THIS APP HAS — the records would be orphaned
// and swept into a machine-named session by the next load, which looks exactly
// like data loss and is impossible to explain on a site.
function deleteEmptySession(id) {
  const ses = sessionById(id);
  if (!ses) return false;
  if (recordsInSession(id).length) return false;
  state.sessions = state.sessions.filter(s => s.id !== ses.id);
  if (state.currentSessionId === ses.id) {
    state.currentSessionId = '';
    ensureOpenSession();
  }
  saveSessions();
  savePrefs();
  return true;
}

// ---------------------------------------------------------------------------
// The exchange — writing a session to a file
//
// ⚠ THIS IS THE LOSSLESS PATH AND IT IS THE ONLY ONE. The CSV is a report
// written to the client's specification: it carries no record id, no time of
// day, no `mode` column and no `visual` column, and it emits no rows at all for
// locations. Two genuinely different records — an initial visual-only failure
// and an audit full-test failure — come out of it byte for byte identical. That
// is not a defect in the CSV, it is what a report is; reading one back would
// mean guessing at fields the file never carried and writing the guesses into
// the client's system. Hence JSON, and hence records that round-trip exactly.
// ---------------------------------------------------------------------------
function buildSessionFile(id) {
  const ses = sessionById(id);
  if (!ses) return null;
  return {
    app: 'patgoscan',
    kind: SESSION_FILE_KIND,
    sessionFileVersion: SESSION_FILE_VERSION,
    appVersion: APP_VERSION,
    exportedAt: stampLocal(),
    session: {
      id: ses.id,
      name: ses.name,
      ts: ses.ts,
      closedAt: ses.closedAt,
      engineer: ses.engineer || state.engineer || '',
    },
    records: recordsInSession(id),
  };
}

function sessionFilename(ses) {
  const who = cleanText(ses && ses.engineer ? ses.engineer : state.engineer, 40)
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const what = cleanText(ses && ses.name, 40)
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // ⚠ 'session' IN THE NAME, NOT 'backup'. The filename is the only thing
  // visible in the Files app before the file is opened, and it is what stops
  // the wrong one being handed to the wrong import.
  return 'patgoscan-session-' + dateStampForFilename() +
         (what ? '-' + what : '') + (who ? '-' + who : '') + '.json';
}

// Share-first, exactly as the CSV and the backup do, and for the same iOS
// reason. ⚠ NOTHING ASYNCHRONOUS BEFORE navigator.share() — iOS revokes the
// user gesture across an await and the sheet never appears.
function exportSessionFile(id) {
  const ses = sessionById(id);
  const data = buildSessionFile(id);
  if (!data) { showToast('That session is gone'); return; }
  if (!data.records.length) { showToast('Nothing in that session yet'); return; }

  const name = sessionFilename(ses);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name })
        .then(() => showToast('Session shared'))
        .catch((err) => {
          if (err && err.name === 'AbortError') return;
          _downloadBlob(blob, name);
          showToast('Session saved');
        });
      return;
    }
  } catch (e) { /* fall through */ }
  _downloadBlob(blob, name);
  showToast('Session saved');
}

// ---------------------------------------------------------------------------
// The exchange — reading one back
// ---------------------------------------------------------------------------

// ⚠ THE WRONG-FILE GUARD, AND IT NAMES THE FILE IT WAS GIVEN. "That file is not
// a session" sends the engineer back to the Files app no wiser. Telling them
// they have handed over a backup, and what a backup does instead, is the
// difference between a second attempt and a support call.
function _describeWrongKind(obj) {
  if (!obj || typeof obj !== 'object') return 'That file could not be read';
  if (obj.app && obj.app !== 'patgoscan') return 'That file is from a different app';
  // A backup announces itself by carrying prefs and a backupVersion and no kind.
  if (obj.kind !== SESSION_FILE_KIND) {
    if (typeof obj.backupVersion === 'number' || obj.prefs) {
      return 'That is a full backup, not a session. Restoring a backup replaces ' +
             'everything on this phone — do that from Export and backup if you meant to.';
    }
    return 'That file is not a PATGo Scan session';
  }
  if (typeof obj.sessionFileVersion === 'number' &&
      obj.sessionFileVersion > SESSION_FILE_VERSION) {
    return 'That session file is from a newer version of the app';
  }
  if (!Array.isArray(obj.records) || !obj.records.length) {
    return 'That session file has no records in it';
  }
  return '';
}

// ⚠ INCOMING IDS ARE RE-ISSUED WHERE THEY CLASH, AND locationId IS REWRITTEN
// WITH THEM. Two phones generate ids independently and a collision is rare but
// not impossible — and an id collision would make edit-by-id ambiguous and
// delete the wrong row. Re-issuing the id alone would be worse than the
// collision: every item pointing at a re-issued LOCATION would be left dangling,
// which shows on screen as items with no room and in the file as a location
// whose floor and room never appear.
function _reidAgainstLocal(records) {
  const localIds = {};
  for (let i = 0; i < state.records.length; i++) localIds[state.records[i].id] = 1;
  const remap = {};
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (localIds[r.id]) {
      const fresh = uid(r.type === 'location' ? 'loc' : 'itm');
      remap[r.id] = fresh;
      r.id = fresh;
    }
    localIds[r.id] = 1;
  }
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.type === 'item' && r.locationId && remap[r.locationId]) {
      r.locationId = remap[r.locationId];
    }
  }
  return records;
}

// Decision 9A — the same asset id ANYWHERE is a collision. Not "the same asset
// at the same location": the client's register is keyed on the asset id alone,
// so the same asset turning up under two different rooms is precisely the thing
// worth putting in front of somebody.
function findCollisions(incoming, againstIds) {
  const scope = {};
  if (Array.isArray(againstIds)) {
    for (let i = 0; i < againstIds.length; i++) scope[againstIds[i]] = 1;
  }
  const mineByCode = {};
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.type !== 'item') continue;
    if (againstIds && !scope[r.sessionId]) continue;
    const k = String(r.code).toLowerCase();
    if (!mineByCode[k]) mineByCode[k] = r;
  }
  const out = [];
  const seen = {};
  for (let i = 0; i < incoming.length; i++) {
    const r = incoming[i];
    if (r.type !== 'item') continue;
    const k = String(r.code).toLowerCase();
    if (seen[k] || !mineByCode[k]) continue;
    seen[k] = 1;
    out.push({ code: r.code, key: k, mine: mineByCode[k], theirs: r });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The review (decisions 10A and 13A)
//
// ⚠ IMPORT AND MERGE RESOLVE THROUGH THIS ONE FUNCTION. They differ only in
// where the surviving records end up, which is settled by the caller.
//
// ⚠ 13A — "KEEP THEIRS" TAKES THE WHOLE RECORD, ENGINEER NAME INCLUDED. The
// ENGINEER column exists so that when six files land in one spreadsheet
// something still says who did what. If their result is the one going to the
// client, it is their work, and relabelling it with the name of whoever
// happened to press the button would put a lie in the only column that answers
// that question.
// ---------------------------------------------------------------------------
function _applyChoice(collisions, choices) {
  const dropIncoming = {};
  const dropLocal = {};
  for (let i = 0; i < collisions.length; i++) {
    const c = collisions[i];
    if (choices[c.key] === 'mine') dropIncoming[c.theirs.id] = 1;
    else dropLocal[c.mine.id] = 1;   // 'theirs' is the default and wins wholesale
  }
  return { dropIncoming: dropIncoming, dropLocal: dropLocal };
}

function beginReview(payload) {
  state.review = payload;
  setView('review');
}

function reviewChoose(key, which) {
  if (!state.review) return;
  state.review.choices[key] = (which === 'mine') ? 'mine' : 'theirs';
  render();
}

function reviewChooseAll(which) {
  if (!state.review) return;
  const cs = state.review.collisions;
  for (let i = 0; i < cs.length; i++) {
    state.review.choices[cs[i].key] = (which === 'mine') ? 'mine' : 'theirs';
  }
  render();
}

function cancelReview() {
  state.review = null;
  render();
}

// The commit. Everything the review was holding lands here, or nothing does.
function commitReview() {
  const rv = state.review;
  if (!rv) return;
  const plan = _applyChoice(rv.collisions, rv.choices);

  const survivors = rv.incoming.filter(r => !plan.dropIncoming[r.id]);
  // ⚠ THE LOCAL LOSERS GO BEFORE THE SURVIVORS ARRIVE. Doing it the other way
  // round means both copies are briefly present, and anything that resolves an
  // asset code while they are — a duplicate check, a location lookup — can
  // legitimately find either one.
  if (Object.keys(plan.dropLocal).length) {
    state.records = state.records.filter(r => !plan.dropLocal[r.id]);
  }

  if (rv.mode === 'merge') {
    for (let i = 0; i < survivors.length; i++) survivors[i].sessionId = rv.intoId;
    // Decision 12A — the source session survives as a named, closed, empty
    // shell so that "there was a file from Dave" is still on the screen.
    const from = sessionById(rv.fromId);
    if (from && !from.closedAt) from.closedAt = Date.now();
  } else {
    const ses = normaliseSession(rv.sessionMeta);
    if (sessionById(ses.id)) ses.id = uid('ses');
    state.sessions.push(ses);
    for (let i = 0; i < survivors.length; i++) survivors[i].sessionId = ses.id;
    state.records = state.records.concat(survivors);
  }

  state.review = null;
  saveRecords();
  saveSessions();
  savePrefs();

  const kept = survivors.length;
  const replaced = Object.keys(plan.dropLocal).length;
  showToast(kept + ' record' + (kept === 1 ? '' : 's') +
            (replaced ? ', ' + replaced + ' replaced' : '') +
            (rv.mode === 'merge' ? ' merged' : ' imported'));
  setView('sessions');
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
function importSessionObject(obj) {
  const problem = _describeWrongKind(obj);
  if (problem) { openInfoSheet({ title: 'Wrong file', body: problem }); return false; }

  // ⚠ THE SAME VALIDATORS load() AND RESTORE USE. A third path into `records`
  // with its own rules is a state the app has never been tested against.
  const incoming = _reidAgainstLocal(normaliseRecords(obj.records));
  if (!incoming.length) {
    openInfoSheet({ title: 'Wrong file', body: 'That session file has no usable records in it' });
    return false;
  }

  const meta = obj.session && typeof obj.session === 'object' ? obj.session : {};
  const sessionMeta = {
    id: uid('ses'),
    name: cleanText(meta.name, SESSION_NAME_MAX) || defaultSessionName(meta.ts),
    ts: (typeof meta.ts === 'number' && isFinite(meta.ts)) ? meta.ts : Date.now(),
    // ⚠ AN IMPORTED SESSION ARRIVES CLOSED. It is somebody else's finished work,
    // not somewhere to scan into — and leaving it open would let the invariant
    // pick it as the session the next scan lands in.
    closedAt: Date.now(),
    engineer: cleanText(meta.engineer, 60),
  };

  const collisions = findCollisions(incoming, null);
  if (!collisions.length) {
    const ses = normaliseSession(sessionMeta);
    state.sessions.push(ses);
    for (let i = 0; i < incoming.length; i++) incoming[i].sessionId = ses.id;
    state.records = state.records.concat(incoming);
    saveRecords();
    saveSessions();
    showToast('Imported ' + incoming.length + ' record' + (incoming.length === 1 ? '' : 's'));
    setView('sessions');
    return true;
  }

  const choices = {};
  for (let i = 0; i < collisions.length; i++) choices[collisions[i].key] = 'theirs';
  beginReview({
    mode: 'import',
    incoming: incoming,
    sessionMeta: sessionMeta,
    collisions: collisions,
    choices: choices,
    intoId: '',
    fromId: '',
  });
  return true;
}

function importSessionFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let obj = null;
    try { obj = JSON.parse(String(reader.result || '')); }
    catch (e) { showToast('That file could not be read'); return; }
    importSessionObject(obj);
  };
  reader.onerror = () => showToast('That file could not be read');
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Merge (decision 12A)
// ---------------------------------------------------------------------------
function beginMerge(fromId, intoId) {
  const from = sessionById(fromId);
  const into = sessionById(intoId);
  if (!from || !into || from.id === into.id) { showToast('Pick two different sessions'); return; }

  const moving = recordsInSession(from.id);
  if (!moving.length) { showToast('Nothing in that session to merge'); return; }

  const collisions = findCollisions(moving, [into.id]);
  if (!collisions.length) {
    for (let i = 0; i < moving.length; i++) moving[i].sessionId = into.id;
    if (!from.closedAt) from.closedAt = Date.now();
    saveRecords();
    saveSessions();
    showToast('Merged ' + moving.length + ' record' + (moving.length === 1 ? '' : 's'));
    setView('sessions');
    return;
  }

  const choices = {};
  for (let i = 0; i < collisions.length; i++) choices[collisions[i].key] = 'theirs';
  beginReview({
    mode: 'merge',
    incoming: moving,
    sessionMeta: null,
    collisions: collisions,
    choices: choices,
    intoId: into.id,
    fromId: from.id,
  });
}
