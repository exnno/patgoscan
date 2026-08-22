/*
 * PATGo Scan — harness/tests/14-sessions.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * V7 — SESSIONS, THE EXCHANGE, THE MERGE AND THE DUPLICATE REVIEW.
 *
 * THREE THINGS THIS GROUP EXISTS TO CATCH, none of which a single happy-path
 * assertion can see:
 *
 *   1. SCOPING FAILURES ARE INVISIBLE UNTIL A SECOND SESSION EXISTS. Every
 *      helper in log.js was global before V7 and every one of them stayed green
 *      when it was made session-aware, because one session behaves exactly like
 *      no sessions. The scoping groups below all build TWO sessions on purpose
 *      and assert that the second one cannot see the first.
 *
 *   2. THE MIGRATION IS INVISIBLE WHEN IT WORKS. A record adopted into a
 *      session looks identical to one written into it. 14b builds the PRE-V7
 *      shape — records with no sessionId at all — and pushes it through the
 *      real validators, the same technique 13 uses for the class migration.
 *
 *   3. A WRONG-FILE GUARD THAT DOES NOTHING LOOKS EXACTLY LIKE ONE THAT WORKS
 *      until somebody hands it the wrong file. 14k feeds a real backup, built
 *      by the real buildBackup(), into the session importer and vice versa.
 */

const A = require('../assert');
const F = require('../fixture');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');

  function ids() { return st.sessions.map(s => s.id); }
  function cur() { return app.fn('currentSession')(); }

  // Build a second session and return to the first. ⚠ RETURNS TO THE FIRST on
  // purpose — a scoping test that ends up standing in the session it just made
  // is asserting from the wrong side of the boundary.
  function withSecondSession(fn) {
    const first = st.currentSessionId;
    const second = app.fn('createSession')('Second');
    fn(second);
    app.fn('switchToSession')(first);
    return second;
  }

  // ---------------------------------------------------------------------------
  // The spine
  // ---------------------------------------------------------------------------

  A.group('14a there is always exactly one open session and it is current', () => {
    F.resetApp(app);
    A.eq('one session exists', st.sessions.length, 1);
    A.ok('it is open', !cur().closedAt);
    A.eq('and it is the current one', cur().id, st.currentSessionId);

    // ⚠ THE INVARIANT HAS TO SURVIVE THE ONE THING THAT BREAKS IT: closing the
    // session being worked in. Leaving the engineer with nowhere to scan is the
    // failure this exists to prevent, and it would show up as a lost record.
    const firstId = st.currentSessionId;
    app.fn('closeSession')(firstId);
    A.ok('closing the current one opens another', !!cur());
    A.ok('the new one is open', !cur().closedAt);
    A.notEq('and it is a different session', cur().id, firstId);
    A.eq('the closed one is still on the list', st.sessions.length, 2);
  });

  A.group('14a2 closing prefers an existing open session over inventing one', () => {
    // ⚠ THE ORDER MATTERS AND IT IS EASY TO GET WRONG. Closing B when A is open
    // should land the engineer back in A — not in a third, empty C sitting
    // beside two perfectly good sessions.
    F.resetApp(app);
    const a = st.currentSessionId;
    st.sessions.push({ id: 'ses_other', name: 'Other', ts: 1, closedAt: 0, engineer: '' });
    app.fn('closeSession')(a);
    A.eq('no third session was made', st.sessions.length, 2);
    A.eq('and it landed in the open one', st.currentSessionId, 'ses_other');
  });

  A.group('14a3 a record is stamped with the session it was written into', () => {
    F.resetApp(app);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    A.eq('the item carries the current session', rec.sessionId, st.currentSessionId);
    const loc = app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    A.eq('and so does a location', loc.sessionId, st.currentSessionId);
  });

  A.group('14a4 ⚠ A CLOSED SESSION NEVER RECEIVES A SCAN', () => {
    // The subtle one. state.currentSessionId can name a CLOSED session — close
    // it from the sessions screen and the id is briefly still there — and a
    // record stamped with it would be written, saved, and invisible to every
    // scoped helper and to the export. sessionIdForNewRecord() goes through
    // ensureOpenSession() for exactly this. Mutation M141.
    F.resetApp(app);
    const closed = st.currentSessionId;
    cur().closedAt = 12345;                 // closed, but still named as current
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    A.notEq('the record did NOT go into the closed session', rec.sessionId, closed);
    A.ok('it went into an open one', !app.fn('sessionById')(rec.sessionId).closedAt);
    A.eq('and the log can see it', app.fn('itemRecords')().length, 1);
  });

  // ---------------------------------------------------------------------------
  // The migration (decision 4A)
  // ---------------------------------------------------------------------------

  A.group('14b ⚠ PRE-V7 RECORDS ARE ADOPTED INTO ONE NAMED SESSION', () => {
    F.resetApp(app);
    // The V6 shape: no sessionId anywhere. ⚠ PUSHED THROUGH THE REAL
    // VALIDATORS, not hand-placed into state — a fixture that seated its own
    // record shape would go green against a normaliseRecord() that had stopped
    // agreeing with the app.
    st.sessions = [];
    st.currentSessionId = '';
    st.records = app.fn('normaliseRecords')([
      { id: 'itm_a', type: 'item', mode: AUDIT, code: 'A1', ts: 1700000000000, result: 'pass' },
      { id: 'itm_b', type: 'item', mode: AUDIT, code: 'A2', ts: 1700200000000, result: 'pass' },
    ]);
    A.eq('they arrive with no session', st.records[0].sessionId, '');

    app.fn('adoptOrphanRecords')();
    A.eq('one session was made', st.sessions.length, 1);
    A.eq('both records went into it', st.records[0].sessionId, st.records[1].sessionId);
    A.eq('and it is the current one', st.currentSessionId, st.sessions[0].id);
    A.ok('it is open, because this is work in progress', !st.sessions[0].closedAt);
    // ⚠ NAMED AFTER THE RANGE IT COVERS, not the day of the upgrade. The two
    // timestamps above are deliberately days apart.
    A.ok('named after the range', /–/.test(st.sessions[0].name));
  });

  A.group('14b2 ⚠ A DANGLING sessionId IS ADOPTED TOO', () => {
    // The failure this catches is total and silent: a record naming a session
    // that is not in the list is invisible to every scoped helper AND missing
    // from every file the app would ever write, because export is scoped to the
    // session. It is the same position as having no session at all.
    // Mutation M143.
    F.resetApp(app);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    rec.sessionId = 'ses_that_never_existed';
    A.eq('it has vanished from the log', app.fn('itemRecords')().length, 0);

    app.fn('adoptOrphanRecords')();
    A.ok('adoption gave it a real session', !!app.fn('sessionById')(rec.sessionId));
    A.eq('but it did NOT steal the current one', st.currentSessionId, st.sessions[0].id);
  });

  A.group('14b3 adoption leaves an in-progress session alone', () => {
    // ⚠ ORPHANS ARRIVING FROM A RESTORE MUST NOT YANK THE ENGINEER OUT OF THE
    // SESSION THEY ARE STOOD IN. The adopting session only takes over as
    // current when there is no current session at all.
    F.resetApp(app);
    const working = st.currentSessionId;
    st.records.push(app.fn('normaliseRecords')([
      { id: 'itm_old', type: 'item', mode: AUDIT, code: 'OLD', ts: 1, result: 'pass' },
    ])[0]);
    app.fn('adoptOrphanRecords')();
    A.eq('still working where they were', st.currentSessionId, working);
    A.eq('two sessions now exist', st.sessions.length, 2);
  });

  A.group('14b4 nothing to adopt changes nothing', () => {
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const before = st.sessions.length;
    A.eq('adoption reports no work done', app.fn('adoptOrphanRecords')(), false);
    A.eq('and made no session', st.sessions.length, before);
  });

  // ---------------------------------------------------------------------------
  // Scoping — the groups that need two sessions to mean anything
  // ---------------------------------------------------------------------------

  A.group('14c ⚠ THE LOG SHOWS THE CURRENT SESSION ONLY', () => {
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'MINE', mode: AUDIT }, 'pass', '');
    withSecondSession(() => {
      app.fn('addItemRecord')({ code: 'THEIRS', mode: AUDIT }, 'pass', '');
      A.eq('the second session sees only its own', app.fn('itemRecords')().length, 1);
      A.eq('and it is the right one', app.fn('itemRecords')()[0].code, 'THEIRS');
    });
    A.eq('back in the first, only its own again', app.fn('itemRecords')().length, 1);
    A.eq('and it is the right one', app.fn('itemRecords')()[0].code, 'MINE');
    A.eq('both records are still on the phone', st.records.length, 2);
  });

  A.group('14c2 ⚠ THE SCAN-TIME DUPLICATE CHECK CANNOT REACH ANOTHER SESSION', () => {
    // THE BUG THIS RELEASE WOULD OTHERWISE HAVE SHIPPED. findItemByCode() was
    // global before V7, which was the same thing as session-scoped while a
    // phone only ever held one engineer's work. Once an imported session sits
    // alongside, scanning an asset Dave already tested would offer to REPLACE
    // DAVE'S RECORD — silently editing another engineer's finished work in a
    // session the engineer is not even looking at, and removing a row from a
    // file that has already gone to the client. Mutation M139.
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'SHARED', mode: AUDIT }, 'pass', '');
    withSecondSession(() => {
      A.eq('the other session\'s record is not found', app.fn('findItemByCode')('SHARED', null), null);
      // ⚠ PAIRED: the check still works INSIDE the session, or this group would
      // pass just as well against a findItemByCode() that always returned null.
      app.fn('addItemRecord')({ code: 'SHARED', mode: AUDIT }, 'fail', 'Damaged casing');
      const found = app.fn('findItemByCode')('SHARED', null);
      A.ok('but its own is', !!found);
      A.eq('and it is the local one', found.result, 'fail');
    });
  });

  A.group('14c3 ⚠ A LOCATION IS NOT REUSED ACROSS A SESSION BOUNDARY', () => {
    // Same shape as 14c2 and the same cost: filing today's items under a
    // location record belonging to a batch this export will never write.
    F.resetApp(app);
    const mine = app.fn('addLocationRecord')('LOC-9', AUDIT, null);
    withSecondSession(() => {
      A.eq('the other session\'s location is invisible', app.fn('findLocationByCode')('LOC-9'), null);
      const fresh = app.fn('addLocationRecord')('LOC-9', AUDIT, null);
      A.notEq('so a new record is made for it', fresh.id, mine.id);
      A.eq('in this session', fresh.sessionId, st.currentSessionId);
    });
  });

  A.group('14c4 totals, today and the last item are all scoped', () => {
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'MINE', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'MINE2', mode: AUDIT }, 'fail', 'Damaged casing');
    withSecondSession(() => {
      A.eq('totals see nothing yet', app.fn('logTotals')().total, 0);
      A.eq('today sees nothing yet', app.fn('todayCounts')().total, 0);
      A.eq('and there is no last item', app.fn('lastItemRecord')(), null);
      app.fn('addItemRecord')({ code: 'THEIRS', mode: AUDIT }, 'pass', '');
      A.eq('now one', app.fn('logTotals')().total, 1);
      A.eq('and the last item is the local one', app.fn('lastItemRecord')().code, 'THEIRS');
    });
    A.eq('the first session still has two', app.fn('logTotals')().total, 2);
    A.eq('one pass', app.fn('logTotals')().pass, 1);
    A.eq('one fail', app.fn('logTotals')().fail, 1);
  });

  A.group('14c5 ⚠ unexportedCount IS DELIBERATELY GLOBAL', () => {
    // The one exception, and it is load-bearing in the other direction: it
    // guards the CLEAR path, which destroys every session. Scoping it would let
    // an engineer clear away a session they had never exported. Mutation M144.
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'MINE', mode: AUDIT }, 'pass', '');
    withSecondSession(() => {
      app.fn('addItemRecord')({ code: 'THEIRS', mode: AUDIT }, 'pass', '');
    });
    A.eq('it counts every session on the phone', app.fn('unexportedCount')(), 2);
  });

  A.group('14c6 switching sessions clears the sticky location', () => {
    // ⚠ THE LOCATION ID BELONGS TO A RECORD IN THE SESSION BEING LEFT. Carrying
    // it across would stamp the next scan with a location that is not in the
    // file the export is about to write.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    A.ok('a location is set', !!app.fn('currentLocation')());
    const second = app.fn('createSession')('Second');
    A.eq('switching cleared it', st.currentLocationId, '');
    A.eq('and currentLocation resolves to nothing', app.fn('currentLocation')(), null);
    A.eq('the new session is current', st.currentSessionId, second.id);
  });

  A.group('14c7 ⚠ currentLocation REFUSES A LOCATION FROM ANOTHER SESSION', () => {
    // Belt and braces over 14c6: a restore or an adoption pass can seat an id
    // from another batch without going through switchToSession() at all.
    F.resetApp(app);
    const loc = app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    withSecondSession(() => {
      st.currentLocationId = loc.id;        // as a restore could leave it
      A.eq('it does not resolve', app.fn('currentLocation')(), null);
    });
  });

  // ---------------------------------------------------------------------------
  // Export scoping (decision 3B)
  // ---------------------------------------------------------------------------

  A.group('14d ⚠ THE EXPORT IS THE CURRENT SESSION AND NOTHING ELSE', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'MINE', mode: AUDIT }, 'pass', '');
    withSecondSession(() => {
      app.fn('addItemRecord')({ code: 'THEIRS', mode: AUDIT }, 'pass', '');
      const built = app.fn('buildCSV')();
      A.eq('one row', built.count, 1);
      A.ok('and it is the local asset', built.text.indexOf('THEIRS') !== -1);
      A.eq('the other session is not in the file', built.text.indexOf('MINE'), -1);
    });
  });

  A.group('14d2 the filename carries the session', () => {
    // ⚠ WITH EXPORT SCOPED TO A SESSION, ONE PHONE CAN WRITE SEVERAL FILES IN
    // ONE DAY. 'patgoscan-2026-08-20-Pete.csv' twice over is how the wrong one
    // gets sent.
    F.resetApp(app);
    st.engineer = 'Pete';
    app.fn('renameSession')(st.currentSessionId, 'Bay Two');
    const name = app.fn('exportFilename')();
    A.ok('the session name is in it', name.indexOf('Bay-Two') !== -1);
    A.ok('and the engineer still is', name.indexOf('Pete') !== -1);
  });

  // ---------------------------------------------------------------------------
  // The exchange
  // ---------------------------------------------------------------------------

  A.group('14e a session file round-trips losslessly', () => {
    // ⚠ THE WHOLE ARGUMENT FOR JSON OVER CSV IS THAT THIS PASSES. The CSV
    // carries no record id, no time of day, no mode column and no visual
    // column — an initial visual-only fail and an audit full-test fail come out
    // of it byte for byte identical. Every one of those fields is asserted here.
    F.resetApp(app);
    st.engineer = 'Pete';
    app.fn('addLocationRecord')('LOC-1', INITIAL, { client: 'Acme', floor: '2', room: 'Kitchen' });
    const src = app.fn('addItemRecord')(
      { code: 'A1', mode: INITIAL, description: 'Kettle', cls: '1', visual: true }, 'fail', 'Damaged casing');

    const file = app.fn('buildSessionFile')(st.currentSessionId);
    A.eq('it announces its kind', file.kind, app.val('SESSION_FILE_KIND'));
    A.eq('it carries both records', file.records.length, 2);

    const back = app.fn('normaliseRecords')(JSON.parse(JSON.stringify(file.records)));
    const item = back.filter(r => r.type === 'item')[0];
    A.eq('the id survives', item.id, src.id);
    A.eq('the timestamp survives', item.ts, src.ts);
    A.eq('⚠ the mode survives', item.mode, INITIAL);
    A.eq('⚠ the visual flag survives', item.visual, true);
    A.eq('the class survives', item.cls, '1');
    A.eq('the fail reason survives', item.failReason, 'Damaged casing');
    A.eq('the description survives', item.description, 'Kettle');
    A.eq('and the location it points at', item.locationId, src.locationId);
  });

  A.group('14e2 an imported session arrives closed and alongside', () => {
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'MINE', mode: AUDIT }, 'pass', '');
    const mineSession = st.currentSessionId;

    A.eq('import succeeds', app.fn('importSessionObject')({
      app: 'patgoscan', kind: 'session', sessionFileVersion: 1,
      session: { id: 'ses_dave', name: 'Dave Tuesday', ts: 1700000000000, engineer: 'Dave' },
      records: [{ id: 'itm_d1', type: 'item', mode: AUDIT, code: 'THEIRS', ts: 1700000001000,
                  result: 'pass', engineer: 'Dave' }],
    }), true);

    A.eq('two sessions now', st.sessions.length, 2);
    A.eq('⚠ it did NOT replace my work', app.fn('recordsInSession')(mineSession).length, 1);
    A.eq('still working where I was', st.currentSessionId, mineSession);
    const dave = st.sessions.filter(s => s.name === 'Dave Tuesday')[0];
    A.ok('the imported session exists', !!dave);
    // ⚠ CLOSED ON ARRIVAL. It is somebody else's finished work, and an open one
    // could be picked by the invariant as the session the next scan lands in.
    A.ok('and it arrived closed', !!dave.closedAt);
    A.eq('its engineer came with it', dave.engineer, 'Dave');
  });

  A.group('14e3 ⚠ COLLIDING IDS ARE RE-ISSUED AND locationId FOLLOWS', () => {
    // Two phones generate ids independently. A collision would make edit-by-id
    // ambiguous and delete the wrong row — but re-issuing the id alone is
    // WORSE than the collision, because every item pointing at a re-issued
    // LOCATION is left dangling: no room on screen, and a location whose floor
    // and room never appear in the file. Mutation M146.
    F.resetApp(app);
    const mine = app.fn('addLocationRecord')('LOC-1', AUDIT, null);

    app.fn('importSessionObject')({
      app: 'patgoscan', kind: 'session', sessionFileVersion: 1,
      session: { name: 'Dave', ts: 1700000000000, engineer: 'Dave' },
      records: [
        { id: mine.id, type: 'location', mode: AUDIT, code: 'LOC-D', ts: 1700000001000 },
        { id: 'itm_d1', type: 'item', mode: AUDIT, code: 'THEIRS', ts: 1700000002000,
          result: 'pass', locationId: mine.id, locationCode: 'LOC-D' },
      ],
    });

    const dave = st.sessions.filter(s => s.name === 'Dave')[0];
    const theirs = app.fn('recordsInSession')(dave.id);
    const loc = theirs.filter(r => r.type === 'location')[0];
    const item = theirs.filter(r => r.type === 'item')[0];
    A.notEq('the clashing id was re-issued', loc.id, mine.id);
    A.eq('⚠ and the item followed it', item.locationId, loc.id);
    A.eq('my own record is untouched', app.fn('recordById')(mine.id).code, 'LOC-1');
  });

  A.group('14k ⚠ THE WRONG-FILE GUARDS, BOTH DIRECTIONS', () => {
    // A backup REPLACES the phone; a session MERGES into it. They are both
    // .json, they sit next to each other in the Files app, and picking the
    // wrong one costs a day. ⚠ BUILT BY THE REAL buildBackup() AND
    // buildSessionFile(), not hand-written — a guard tested against a
    // hand-made object would go green after the real files stopped matching it.
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const realBackup = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    const realSession = JSON.parse(JSON.stringify(app.fn('buildSessionFile')(st.currentSessionId)));

    const sessionsBefore = st.sessions.length;
    A.eq('a backup is refused by the session importer',
         app.fn('importSessionObject')(realBackup), false);
    A.eq('and nothing was added', st.sessions.length, sessionsBefore);

    const recordsBefore = st.records.length;
    A.eq('a session file is refused by the restore path',
         app.fn('restoreBackupObject')(realSession), false);
    A.eq('⚠ and the phone was NOT replaced', st.records.length, recordsBefore);

    // ⚠ PAIRED. Without these the group would pass against a guard that refused
    // absolutely everything.
    A.eq('the real session file still imports', app.fn('importSessionObject')(realSession), true);
    A.eq('and the real backup still restores', app.fn('restoreBackupObject')(realBackup), true);
  });

  A.group('14k2 a session file from the future is refused', () => {
    F.resetApp(app);
    const before = st.sessions.length;
    A.eq('refused', app.fn('importSessionObject')({
      app: 'patgoscan', kind: 'session',
      sessionFileVersion: app.val('SESSION_FILE_VERSION') + 1,
      session: { name: 'Future' },
      records: [{ id: 'x', type: 'item', mode: AUDIT, code: 'A1', ts: 1, result: 'pass' }],
    }), false);
    A.eq('nothing landed', st.sessions.length, before);
  });

  // ---------------------------------------------------------------------------
  // The duplicate review (decisions 9A, 10A, 13A)
  // ---------------------------------------------------------------------------

  function importWithCollision() {
    F.resetApp(app);
    st.engineer = 'Pete';
    app.fn('addItemRecord')({ code: 'SHARED', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'ONLYMINE', mode: AUDIT }, 'pass', '');
    app.fn('importSessionObject')({
      app: 'patgoscan', kind: 'session', sessionFileVersion: 1,
      session: { name: 'Dave', ts: 1700000000000, engineer: 'Dave' },
      records: [
        { id: 'itm_d1', type: 'item', mode: AUDIT, code: 'SHARED', ts: 1700000001000,
          result: 'fail', failReason: 'Damaged casing', engineer: 'Dave' },
        { id: 'itm_d2', type: 'item', mode: AUDIT, code: 'ONLYTHEIRS', ts: 1700000002000,
          result: 'pass', engineer: 'Dave' },
      ],
    });
  }

  A.group('14f a collision opens the review instead of landing', () => {
    importWithCollision();
    A.ok('a review is open', !!st.review);
    A.eq('on the review screen', st.view, 'review');
    A.eq('one collision', st.review.collisions.length, 1);
    A.eq('and it is the shared asset', st.review.collisions[0].code, 'SHARED');
    // ⚠ NOTHING HAS BEEN WRITTEN YET. The incoming records are in memory only,
    // which is what makes walking away from the review safe.
    A.eq('nothing was imported', st.sessions.length, 1);
    A.eq('and no record was added', st.records.length, 2);
  });

  A.group('14f2 no collision lands straight away', () => {
    // ⚠ PAIRED WITH 14f, or 14f would pass against an importer that opened a
    // review for every file it was ever given.
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'MINE', mode: AUDIT }, 'pass', '');
    app.fn('importSessionObject')({
      app: 'patgoscan', kind: 'session', sessionFileVersion: 1,
      session: { name: 'Dave', ts: 1700000000000, engineer: 'Dave' },
      records: [{ id: 'itm_d1', type: 'item', mode: AUDIT, code: 'THEIRS', ts: 1, result: 'pass' }],
    });
    A.eq('no review', st.review, null);
    A.eq('it landed', st.sessions.length, 2);
  });

  A.group('14g ⚠ KEEPING THEIRS TAKES THE WHOLE RECORD, ENGINEER INCLUDED (13A)', () => {
    importWithCollision();
    A.eq('theirs is the default', st.review.choices[st.review.collisions[0].key], 'theirs');
    app.fn('commitReview')();

    const shared = st.records.filter(r => r.code === 'SHARED');
    A.eq('exactly one copy survives', shared.length, 1);
    A.eq('it is theirs', shared[0].result, 'fail');
    A.eq('carrying their fail reason', shared[0].failReason, 'Damaged casing');
    // ⚠ THE ENGINEER NAME IS THE POINT OF THE DECISION. The column exists to
    // answer "who did this" once six files are in one spreadsheet; relabelling
    // it with whoever pressed the button would put a lie in it.
    A.eq('⚠ and THEIR name', shared[0].engineer, 'Dave');
    A.eq('my other record is untouched', st.records.filter(r => r.code === 'ONLYMINE').length, 1);
    A.eq('their other record came too', st.records.filter(r => r.code === 'ONLYTHEIRS').length, 1);
    A.eq('the review closed', st.review, null);
  });

  A.group('14g2 keeping mine drops their copy and leaves mine alone', () => {
    importWithCollision();
    app.fn('reviewChooseAll')('mine');
    app.fn('commitReview')();

    const shared = st.records.filter(r => r.code === 'SHARED');
    A.eq('exactly one copy survives', shared.length, 1);
    A.eq('it is mine', shared[0].result, 'pass');
    A.eq('with my name', shared[0].engineer, 'Pete');
    // ⚠ THE REST OF THEIR SESSION STILL ARRIVES. Choosing mine on one asset is
    // not rejecting the file.
    A.eq('their non-colliding record still came', st.records.filter(r => r.code === 'ONLYTHEIRS').length, 1);
  });

  A.group('14g3 choices are per asset, not all-or-nothing', () => {
    F.resetApp(app);
    st.engineer = 'Pete';
    app.fn('addItemRecord')({ code: 'ONE', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'TWO', mode: AUDIT }, 'pass', '');
    app.fn('importSessionObject')({
      app: 'patgoscan', kind: 'session', sessionFileVersion: 1,
      session: { name: 'Dave', ts: 1700000000000, engineer: 'Dave' },
      records: [
        { id: 'd1', type: 'item', mode: AUDIT, code: 'ONE', ts: 1, result: 'fail',
          failReason: 'Damaged casing', engineer: 'Dave' },
        { id: 'd2', type: 'item', mode: AUDIT, code: 'TWO', ts: 2, result: 'fail',
          failReason: 'Damaged casing', engineer: 'Dave' },
      ],
    });
    A.eq('two collisions', st.review.collisions.length, 2);
    const keyOne = st.review.collisions.filter(c => c.code === 'ONE')[0].key;
    app.fn('reviewChoose')(keyOne, 'mine');
    app.fn('commitReview')();

    A.eq('ONE stayed mine', st.records.filter(r => r.code === 'ONE')[0].engineer, 'Pete');
    A.eq('TWO went to theirs', st.records.filter(r => r.code === 'TWO')[0].engineer, 'Dave');
  });

  A.group('14g4 cancelling a review changes nothing at all', () => {
    importWithCollision();
    const records = st.records.length;
    const sessions = st.sessions.length;
    app.fn('cancelReview')();
    A.eq('the review is gone', st.review, null);
    A.eq('no records changed', st.records.length, records);
    A.eq('no sessions were made', st.sessions.length, sessions);
    A.eq('my copy of the shared asset is still mine',
         st.records.filter(r => r.code === 'SHARED')[0].result, 'pass');
  });

  A.group('14g5 ⚠ NAVIGATING AWAY ABANDONS A HALF-ANSWERED REVIEW', () => {
    // Nothing in state.review has been written anywhere, so dropping it loses
    // no data — whereas carrying a half-answered set of choices onto another
    // screen and committing it later would apply decisions the engineer had
    // walked away from. Mutation M150.
    importWithCollision();
    app.fn('setView')('scan');
    A.eq('the review was dropped', st.review, null);
    A.eq('and nothing landed', st.sessions.length, 1);
  });

  A.group('14h duplicates are matched on the asset id anywhere (9A)', () => {
    // ⚠ NOT "the same asset at the same location". The client's register is
    // keyed on the asset id alone, so the same asset in two different rooms is
    // precisely the thing worth putting in front of somebody.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'SHARED', mode: AUDIT }, 'pass', '');
    const found = app.fn('findCollisions')([
      { id: 'x', type: 'item', code: 'SHARED', locationId: 'somewhere_else', result: 'fail' },
    ], null);
    A.eq('a different room is still a collision', found.length, 1);
    // ⚠ AND CASE DOES NOT SAVE IT. A scanner reading the same label on two
    // phones can differ in case; treating those as two assets would send the
    // client two rows for one thing.
    const mixed = app.fn('findCollisions')([
      { id: 'y', type: 'item', code: 'shared', result: 'fail' },
    ], null);
    A.eq('nor does case', mixed.length, 1);
  });

  // ---------------------------------------------------------------------------
  // Merge (decision 12A)
  // ---------------------------------------------------------------------------

  A.group('14i merging moves records and leaves a closed empty shell', () => {
    F.resetApp(app);
    const into = st.currentSessionId;
    app.fn('addItemRecord')({ code: 'MINE', mode: AUDIT }, 'pass', '');
    const from = app.fn('createSession')('Dave');
    app.fn('addItemRecord')({ code: 'THEIRS', mode: AUDIT }, 'pass', '');
    app.fn('switchToSession')(into);

    app.fn('beginMerge')(from.id, into);
    A.eq('no review was needed', st.review, null);
    A.eq('both records are in the target', app.fn('recordsInSession')(into).length, 2);
    A.eq('the source is empty', app.fn('recordsInSession')(from.id).length, 0);
    // ⚠ 12A — THE SHELL SURVIVES. Deleting another engineer's session on a
    // phone is unrecoverable, and the empty row costs nothing but keeps "there
    // was a file from Dave" on the screen.
    A.ok('but it still exists', !!app.fn('sessionById')(from.id));
    A.ok('and it is closed', !!app.fn('sessionById')(from.id).closedAt);
    A.eq('named as it was', app.fn('sessionById')(from.id).name, 'Dave');
  });

  A.group('14i2 a merge collision goes through the same review', () => {
    F.resetApp(app);
    st.engineer = 'Pete';
    const into = st.currentSessionId;
    app.fn('addItemRecord')({ code: 'SHARED', mode: AUDIT }, 'pass', '');
    const from = app.fn('createSession')('Dave');
    st.engineer = 'Dave';
    app.fn('addItemRecord')({ code: 'SHARED', mode: AUDIT }, 'fail', 'Damaged casing');
    app.fn('switchToSession')(into);
    st.engineer = 'Pete';

    app.fn('beginMerge')(from.id, into);
    A.ok('a review opened', !!st.review);
    A.eq('in merge mode', st.review.mode, 'merge');
    A.eq('nothing has moved yet', app.fn('recordsInSession')(into).length, 1);

    app.fn('commitReview')();
    const shared = app.fn('recordsInSession')(into).filter(r => r.code === 'SHARED');
    A.eq('one survivor', shared.length, 1);
    A.eq('theirs won by default', shared[0].result, 'fail');
    A.eq('with their name', shared[0].engineer, 'Dave');
    A.ok('and the source closed', !!app.fn('sessionById')(from.id).closedAt);
  });

  A.group('14i3 a session cannot be merged into itself', () => {
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const id = st.currentSessionId;
    app.fn('beginMerge')(id, id);
    A.eq('no review opened', st.review, null);
    A.eq('and the record is still there', app.fn('recordsInSession')(id).length, 1);
  });

  // ---------------------------------------------------------------------------
  // Housekeeping
  // ---------------------------------------------------------------------------

  A.group('14j only an empty session can be deleted', () => {
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const full = st.currentSessionId;
    A.eq('a session with work in it refuses', app.fn('deleteEmptySession')(full), false);
    A.ok('and is still there', !!app.fn('sessionById')(full));

    const empty = app.fn('createSession')('Empty');
    A.eq('an empty one goes', app.fn('deleteEmptySession')(empty.id), true);
    A.eq('the session is gone', app.fn('sessionById')(empty.id), null);
    A.ok('and the invariant survived', !!cur() && !cur().closedAt);
  });

  A.group('14j2 renaming keeps the records where they are', () => {
    F.resetApp(app);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    app.fn('renameSession')(st.currentSessionId, 'Bay Two');
    A.eq('the name changed', cur().name, 'Bay Two');
    A.eq('the record did not move', rec.sessionId, st.currentSessionId);
    A.eq('an empty name is refused', app.fn('renameSession')(st.currentSessionId, '   '), null);
    A.eq('and the old name stands', cur().name, 'Bay Two');
  });

  A.group('14j3 a malformed session is repaired, never dropped', () => {
    // ⚠ DROPPING ONE ORPHANS EVERY RECORD POINTING AT IT, and the adoption pass
    // would then sweep those records into a machine-named session — so a
    // missing name would cost the engineer the name they actually chose.
    const fixed = app.fn('normaliseSession')({ id: 'ses_x', name: '   ', ts: 'nonsense', closedAt: -5 });
    A.eq('the id survived', fixed.id, 'ses_x');
    A.ok('a name was supplied', fixed.name.length > 0);
    A.eq('the bad closedAt collapsed to open', fixed.closedAt, 0);
    A.ok('and the bad ts became a number', typeof fixed.ts === 'number');
  });

  A.group('14j4 duplicate session ids are re-issued, not dropped', () => {
    const list = app.fn('normaliseSessions')([
      { id: 'same', name: 'One', ts: 1, closedAt: 0 },
      { id: 'same', name: 'Two', ts: 2, closedAt: 0 },
    ]);
    A.eq('both survive', list.length, 2);
    A.notEq('with different ids', list[0].id, list[1].id);
  });

  // ---------------------------------------------------------------------------
  // Backup carries sessions
  // ---------------------------------------------------------------------------

  A.group('14l a backup carries the sessions and restores them', () => {
    F.resetApp(app);
    app.fn('renameSession')(st.currentSessionId, 'Bay Two');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const backup = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    A.eq('the file holds the session', backup.sessions.length, 1);
    A.eq('and names which was current', backup.currentSessionId, st.currentSessionId);

    F.resetApp(app);
    app.fn('restoreBackupObject')(backup);
    A.eq('the session came back', st.sessions.length, 1);
    A.eq('⚠ with the name the engineer chose', st.sessions[0].name, 'Bay Two');
    A.eq('and the record can be seen', app.fn('itemRecords')().length, 1);
  });

  A.group('14l2 ⚠ A V6 BACKUP RESTORES INTO AN ADOPTED SESSION', () => {
    // The upgrade path in file form, and the reason the migration must never be
    // deleted "once everybody has upgraded": backups are files, and one taken
    // in May 2026 and restored in 2028 arrives with no sessions in it at all.
    // Without adoption on the restore path every record in it would be an
    // orphan — invisible to the log and missing from every export.
    F.resetApp(app);
    app.fn('restoreBackupObject')({
      app: 'patgoscan', backupVersion: 2, engineer: 'Pete', mode: AUDIT,
      records: [
        { id: 'itm_a', type: 'item', mode: AUDIT, code: 'A1', ts: 1700000000000, result: 'pass' },
        { id: 'itm_b', type: 'item', mode: AUDIT, code: 'A2', ts: 1700000001000, result: 'pass' },
      ],
    });
    A.eq('a session was made for them', st.sessions.length, 1);
    A.eq('⚠ and the log can see both', app.fn('itemRecords')().length, 2);
    A.eq('⚠ and so can the export', app.fn('buildCSV')().count, 2);
  });

  A.group('14l3 clearing takes the sessions with the records', () => {
    // ⚠ LEAVING THEM WOULD LEAVE A SCREEN FULL OF NAMED, EMPTY BATCHES that
    // look like work and are not.
    F.resetApp(app);
    app.fn('renameSession')(st.currentSessionId, 'Bay Two');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    st.records.forEach(r => { r.exported = true; });
    st.sessions = [];
    st.currentSessionId = '';
    st.records = [];
    app.fn('ensureOpenSession')();
    A.eq('one fresh session', st.sessions.length, 1);
    A.notEq('and it is not the old name', st.sessions[0].name, 'Bay Two');
  });

  // ---------------------------------------------------------------------------
  // The toggle row fix
  // ---------------------------------------------------------------------------

  A.group('14n ⚠ THE TWO TOGGLE ROWS SHARE ONE GRID', () => {
    // The rows used to be independent flex containers with the label column
    // pinned at 74px. "INSPECTION" is wider than that at 13px uppercase, and a
    // flex item will not shrink below its own unbroken word — so that row's
    // label stole about twelve pixels and its switch came out narrower than the
    // one above it. A shared grid makes them identical BY CONSTRUCTION.
    //
    // ⚠ ASSERTED AGAINST THE MARKUP AND THE STYLESHEET TOGETHER. Either half
    // alone is silently useless: the wrapper without the grid rules does
    // nothing, and the rules without the wrapper have nothing to apply to.
    F.resetApp(app);
    const html = app.fn('renderScanToggles')();
    A.ok('the wrapper is there', html.indexOf('toggrid') !== -1);
    A.eq('and it wraps BOTH rows', (html.match(/class="togrow/g) || []).length, 2);

    const css = app.sources['styles.css'] || require('../load').readFile('styles.css');
    A.ok('the grid column rule is present', /\.toggrid\s*\{[^}]*grid-template-columns:\s*max-content\s+1fr/.test(css));
    A.ok('⚠ and the rows are display:contents', /\.togrow\s*\{\s*display:\s*contents/.test(css));
    // ⚠ THE FIXED LABEL WIDTH MUST BE GONE. Leaving `flex: 0 0 74px` on
    // .tog-label would reintroduce the mismatch the moment anything reset the
    // grid, and it would look like a working fix in review.
    A.ok('and the old fixed label width is gone', !/\.tog-label\s*\{[^}]*flex:\s*0\s+0\s+74px/.test(css));
  });
};
