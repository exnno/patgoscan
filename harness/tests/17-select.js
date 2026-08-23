/*
 * 17-select — V12. THE HARD-SCOPED LOG, THE SELECTION, AND THE RUN RECEIPT.
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * ⚠⚠ WHAT MAKES THIS FILE EASY TO WRITE BADLY. Every feature here deletes
 * records in bulk or hides them from view, and both failure modes are silent:
 * a delete that takes one row too many looks identical to one that took the
 * right number unless the survivors are named, and a filter that hides too much
 * looks identical to an empty session unless something is deliberately put
 * outside it. So:
 *
 *   1. EVERY DELETE ASSERTION NAMES THE SURVIVORS, not just the count. "Three
 *      left" is green when the wrong three are left, and the wrong three is the
 *      only outcome that matters — the engineer re-scans what is missing and
 *      never notices what is not.
 *
 *   2. EVERY SCOPE ASSERTION PUTS SOMETHING IN A SECOND SESSION FIRST. A test
 *      running on a phone with one session cannot tell a session filter from no
 *      filter at all, which is precisely how unexportedCount() carried the
 *      wrong scope from V7 to V12 with a green suite over it.
 *
 *   3. THE RECEIPT IS ASSERTED THROUGH THE LABEL AND THE RECORDS, never through
 *      state.lastRun alone. The field being set proves nothing about whether
 *      the button offers the batch or whether confirming it removes the batch,
 *      and those are the two things an engineer meets.
 */
module.exports = function (app) {
  const A = require('../assert');
  const F = require('../fixture');
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');

  const act = (name, arg) => app.val('ACTIONS')[name](arg);
  const codes = () => st.records.filter(r => r.type === 'item').map(r => r.code).sort();

  function withSecondSession(fn) {
    const first = st.currentSessionId;
    const second = app.fn('createSession')('Second');
    fn(second);
    app.fn('switchToSession')(first);
    return second;
  }

  // A run committed the way the scan screen commits one, so the receipt is
  // written by commitResult() rather than by the test.
  function commitRun(code, n, desc) {
    st.mode = INITIAL;
    st._pendingReplaceId = '';
    st.pending = { code: code, mode: INITIAL, description: desc || 'Kettle',
                   cls: '1', visual: false, count: n };
    act('pass');
  }

  // ---------------------------------------------------------------------------
  // 5B — the log is the current session and nothing else
  // ---------------------------------------------------------------------------

  A.group('17a ⚠ THE LOG LISTS THE CURRENT SESSION ONLY', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'MINE-1', mode: AUDIT }, 'pass', '');
    withSecondSession(() => {
      app.fn('addItemRecord')({ code: 'THEIRS-1', mode: AUDIT }, 'pass', '');
    });
    // ⚠ BOTH DIRECTIONS. "Mine is present" is green on a list that shows
    // everything, which is exactly the state V12 is correcting.
    const html = app.fn('renderLogListHTML')();
    A.includes('this session\'s item is listed', html, 'MINE-1');
    A.excludes('⚠ and the other session\'s is not', html, 'THEIRS-1');
    A.eq('both are still on the phone', st.records.filter(r => r.type === 'item').length, 2);
  });

  A.group('17b the search cannot reach out of the session either', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'MINE-1', mode: INITIAL, description: 'Kettle' }, 'pass', '');
    withSecondSession(() => {
      app.fn('addItemRecord')({ code: 'THEIRS-1', mode: INITIAL, description: 'Kettle' }, 'pass', '');
    });
    // ⚠ SEARCHING ON A TERM BOTH RECORDS MATCH. A search for "THEIRS" would
    // pass on a broken filter simply by finding nothing worth showing.
    st.logSearch = 'kettle';
    const html = app.fn('renderLogListHTML')();
    A.includes('the match in this session shows', html, 'MINE-1');
    A.excludes('⚠ the identical match in the other does not', html, 'THEIRS-1');
    st.logSearch = '';
  });

  A.group('17c 8A — the copy says what is not here', () => {
    F.resetApp(app);
    // Empty session, nothing typed.
    A.includes('the empty state is about the session',
      app.fn('renderLogListHTML')(), 'in this session');
    // ⚠ AND THE NO-MATCH STATE NAMES THE WAY OUT. An engineer searching for
    // yesterday's asset is looking at a screen that is telling the truth and
    // reads as "it does not exist" unless it says where to go.
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'MINE-1', mode: AUDIT }, 'pass', '');
    st.logSearch = 'nothinglikethis';
    const html = app.fn('renderLogListHTML')();
    A.includes('the no-match state points at Sessions', html, 'Sessions');
    A.includes('and says other sessions are hidden', html, 'Other sessions');
    st.logSearch = '';
  });

  A.group('17d ⚠ V10 IS STILL REACHABLE AND STILL CORRECT', () => {
    // The out-of-session edit path is no longer reachable BY TAP, and the code
    // stays. This asserts it still behaves — if a later release does tidy it
    // away, this fails and the decision gets made deliberately rather than by
    // a mutation quietly reporting SKIPPED.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    let theirItem = null;
    withSecondSession(() => {
      app.fn('addLocationRecord')('LOC-OLD', AUDIT, null);
      theirItem = app.fn('addItemRecord')({ code: 'THEIRS-1', mode: AUDIT }, 'pass', '');
    });
    const choices = app.fn('locationChoices')(3, theirItem.sessionId);
    A.eq('the picker still offers that session\'s locations', choices.length, 1);
    A.eq('and it is theirs, not today\'s', choices[0].rec.code, 'LOC-OLD');
  });

  // ---------------------------------------------------------------------------
  // 2A / 3A / 4A — the selection
  // ---------------------------------------------------------------------------

  A.group('17e select mode swaps what a row DOES, and only for items', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    A.includes('off, an item row opens the edit sheet',
      app.fn('renderLogListHTML')(), 'data-action="editRecord" data-arg="' +
      st.records.filter(r => r.type === 'item')[0].id + '"');
    act('startSelect');
    const html = app.fn('renderLogListHTML')();
    A.includes('on, an item row ticks instead', html, 'data-action="toggleSelect"');
    // ⚠ 3A — THE LOCATION ROW IS UNCHANGED. deleteRecord() sweeps locationId off
    // every item pointing at a location, and at batch scale that sweep is
    // invisible. The row must keep opening its own sheet.
    A.includes('⚠ the location row still opens its sheet', html,
      'row row-loc" data-action="editRecord"');
    A.excludes('and cannot be ticked', html, 'row-loc" data-action="toggleSelect"');
    act('cancelSelect');
  });

  A.group('17f selectableShownIds — items, this session, what the search shows', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle' }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: INITIAL, description: 'Toaster' }, 'pass', '');
    withSecondSession(() => {
      app.fn('addItemRecord')({ code: 'A3', mode: INITIAL, description: 'Kettle' }, 'pass', '');
    });
    const byId = (id) => app.fn('recordById')(id).code;
    A.eq('two items, and the location is not one of them',
      app.fn('selectableShownIds')().length, 2);
    A.excludes('⚠ nor is the other session\'s kettle',
      app.fn('selectableShownIds')().map(byId).join(','), 'A3');
    st.logSearch = 'kettle';
    const shown = app.fn('selectableShownIds')();
    A.eq('the search narrows it', shown.length, 1);
    A.eq('to the right one', byId(shown[0]), 'A1');
    st.logSearch = '';
  });

  A.group('17g ⚠ SELECT ALL ADDS, IT DOES NOT REPLACE', () => {
    // Tick something, search elsewhere, tap Select all: the first pick must
    // survive. Replacing would silently discard work still counted in the
    // header, which is the one number the engineer is reading.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle' }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: INITIAL, description: 'Toaster' }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A3', mode: INITIAL, description: 'Toaster' }, 'pass', '');
    const idOf = (code) => st.records.filter(r => r.code === code)[0].id;
    act('startSelect');
    act('toggleSelect', idOf('A1'));
    st.logSearch = 'toaster';
    act('selectAllShown');
    st.logSearch = '';
    A.eq('three are ticked', st.logSelect.length, 3);
    A.ok('⚠ including the one picked before the search',
      st.logSelect.indexOf(idOf('A1')) !== -1);
    // And a second tap adds nothing twice.
    act('selectAllShown');
    A.eq('select all is idempotent', st.logSelect.length, 3);
    act('cancelSelect');
  });

  A.group('17h toggling is a toggle', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    act('startSelect');
    A.eq('starts empty', st.logSelect.length, 0);
    act('toggleSelect', rec.id);
    A.eq('one tap ticks', st.logSelect.length, 1);
    act('toggleSelect', rec.id);
    A.eq('a second tap unticks', st.logSelect.length, 0);
    // ⚠ AND IT IS INERT WITH THE MODE OFF. A stray toggleSelect outside select
    // mode must not create a selection nothing on screen is showing.
    act('cancelSelect');
    act('toggleSelect', rec.id);
    A.eq('⚠ toggling with the mode off does nothing', st.logSelect, null);
  });

  A.group('17i deleting the selection removes exactly those, and closes the mode', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    ['A1', 'A2', 'A3', 'A4'].forEach(c =>
      app.fn('addItemRecord')({ code: c, mode: AUDIT }, 'pass', ''));
    const idOf = (code) => st.records.filter(r => r.code === code)[0].id;
    act('startSelect');
    act('toggleSelect', idOf('A2'));
    act('toggleSelect', idOf('A3'));
    act('deleteSelected');
    const sheet = F.openSheetEl(app);
    A.ok('a confirm sheet was raised', !!sheet);
    A.includes('and it names the count', sheet.innerHTML, '2');
    // ⚠ NOTHING IS GONE WHILE THE SHEET IS UP. A delete that had already
    // happened would make the confirm a decoration, and this group would be
    // green either way without this line.
    A.eq('⚠ nothing removed before it is answered', codes().length, 4);
    sheet.querySelector('#sheet-ok').onclick();
    // ⚠ THE SURVIVORS ARE NAMED. "Two left" passes on the wrong two.
    A.eq('the survivors are the untouched ones', codes().join(','), 'A1,A4');
    A.eq('the mode closed with the delete', st.logSelect, null);
  });

  A.group('17j cancelling the confirm deletes nothing', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    ['A1', 'A2'].forEach(c => app.fn('addItemRecord')({ code: c, mode: AUDIT }, 'pass', ''));
    act('startSelect');
    act('toggleSelect', st.records.filter(r => r.code === 'A1')[0].id);
    act('deleteSelected');
    const sheet = F.openSheetEl(app);
    sheet.querySelector('#sheet-cancel').onclick();
    A.eq('both survive', codes().join(','), 'A1,A2');
    // ⚠ AND THE TICK SURVIVES TOO. Cancelling the delete is not cancelling the
    // selection — an engineer who changes their mind about the delete has not
    // changed their mind about the twenty rows they just ticked.
    A.eq('and the selection is still there', (st.logSelect || []).length, 1);
    act('cancelSelect');
  });

  A.group('17k deleteRecords goes through deleteRecord — the sweep survives', () => {
    // ⚠ THE POINT OF THE GROUP. A batch delete written as a single filter over
    // a set of ids would pass every count assertion above and skip the location
    // sweep entirely, stranding items against a location id that no longer
    // exists — invisible until the export three hours later.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    const loc = app.fn('currentLocation')();
    const item = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    A.eq('the item is filed there', item.locationId, loc.id);
    const n = app.fn('deleteRecords')([loc.id]);
    A.eq('one record removed', n, 1);
    A.eq('⚠ and the item was swept', app.fn('recordById')(item.id).locationId, '');
    A.eq('and the sticky location was dropped', st.currentLocationId, '');
  });

  A.group('17l the count reported is what was removed, not what was asked', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    A.eq('a live id and a dead one removes one',
      app.fn('deleteRecords')([rec.id, 'itm_gone']), 1);
    A.eq('an empty list removes nothing', app.fn('deleteRecords')([]), 0);
  });

  A.group('17m the bars appear and disappear with something to act on', () => {
    F.resetApp(app);
    A.eq('⚠ no Select offered over an empty session', app.fn('renderSelectBar')(), '');
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    A.includes('with an item, Select is offered', app.fn('renderSelectBar')(), 'startSelect');
    act('startSelect');
    A.eq('⚠ nothing ticked, no action bar', app.fn('renderSelectActions')(), '');
    act('toggleSelect', st.records.filter(r => r.type === 'item')[0].id);
    A.includes('one ticked, the bar says how many',
      app.fn('renderSelectActions')(), 'Delete 1');
    A.includes('and the header counts too', app.fn('renderSelectBar')(), '1 selected');
    act('cancelSelect');
  });

  // ---------------------------------------------------------------------------
  // 6A — the run receipt
  // ---------------------------------------------------------------------------

  A.group('17n a run writes a receipt, anything else takes it away', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    commitRun('PAT-0998', 6);
    A.ok('a run left a receipt', !!st.lastRun);
    A.eq('holding every id it wrote', st.lastRun.ids.length, 6);
    A.eq('and the code it started from', st.lastRun.code, 'PAT-0998');
    // ⚠ A SINGLE SCAN AFTER A RUN CLEARS IT. Otherwise the block would offer to
    // undo six with a seventh, unrelated item sitting above the button.
    st.mode = AUDIT;
    app.fn('routeScan')('A-9');
    app.fn('commitResult')('pass', '');
    A.eq('⚠ a later single scan clears the receipt', st.lastRun, null);
  });

  A.group('17o the offer verifies before it is made', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    commitRun('PAT-0998', 4);
    A.ok('the run is offered', !!app.fn('activeRun')());
    A.includes('and the button says how many',
      app.fn('renderLastItem')(), 'Undo all 4');
    // ⚠ ONE ID GONE AND THE WHOLE OFFER GOES. Undoing "all 4" over three
    // records would delete three and report four, and nothing would say which
    // one it missed. All or nothing — the ordinary single Undo is never wrong.
    app.fn('deleteRecord')(st.lastRun.ids[1]);
    A.eq('⚠ a broken run is not offered', app.fn('activeRun')(), null);
    A.eq('and the stale receipt cleared itself', st.lastRun, null);
    A.includes('the button is back to a single undo',
      app.fn('renderLastItem')(), '>Undo<');
  });

  A.group('17p ⚠ THE RECEIPT SURVIVES NAVIGATION, THE SELECTION DOES NOT', () => {
    // The two new transients are deliberately on opposite sides of setView(),
    // and getting either backwards is silent. Select mode carried across would
    // leave a log where tapping a row no longer opens it. The receipt cleared
    // would take the offer away on the exact trip that finds the mistake:
    // commit the run, tap Log to check it, come back.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    commitRun('PAT-0998', 3);
    act('startSelect');
    app.fn('setView')('log');
    A.eq('⚠ select mode died with the screen', st.logSelect, null);
    app.fn('setView')('scan');
    A.ok('⚠ the receipt came back with the engineer', !!app.fn('activeRun')());
    A.includes('and the offer is still on the button',
      app.fn('renderLastItem')(), 'Undo all 3');
  });

  A.group('17q undoing a run removes the run and nothing else', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'KEEP-1', mode: AUDIT }, 'pass', '');
    commitRun('PAT-0998', 3);
    A.eq('four items on file', codes().length, 4);
    act('undoLastItem');
    const sheet = F.openSheetEl(app);
    A.ok('a confirm sheet was raised', !!sheet);
    A.includes('naming the run it will take', sheet.innerHTML, 'PAT-0998');
    A.eq('⚠ nothing removed before it is answered', codes().length, 4);
    sheet.querySelector('#sheet-ok').onclick();
    // ⚠ THE SURVIVOR IS NAMED, not counted. "One left" is green if the wrong
    // one is left.
    A.eq('the earlier item survives alone', codes().join(','), 'KEEP-1');
    A.eq('and the receipt is spent', st.lastRun, null);
  });

  A.group('17r a single undo is untouched by all of that', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'pass', '');
    act('undoLastItem');
    const sheet = F.openSheetEl(app);
    A.includes('it names the one item', sheet.innerHTML, 'A2');
    sheet.querySelector('#sheet-ok').onclick();
    A.eq('and takes only that one', codes().join(','), 'A1');
  });

  // ---------------------------------------------------------------------------
  // 7A — a run reads back in the order it was written
  // ---------------------------------------------------------------------------

  A.group('17s ⚠ A RUN IS NOT SHUFFLED IN THE LOG', () => {
    // Six records written in one synchronous loop share a millisecond, so
    // byNewest's tiebreak decides their order. It used to fall to the id, whose
    // tail is six random base-36 characters — so a run came back in a different
    // order on every commit. The export was never affected (csv.js sorts by ts
    // ascending and the sort is stable); this is what the engineer READS when
    // checking a run before undoing it.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    commitRun('PAT-0998', 6);
    // ⚠ THE TIMESTAMPS ARE FORCED EQUAL, AND WITHOUT THIS LINE THE GROUP TESTS
    // NOTHING. A run usually lands inside one millisecond, but not always — a
    // six-item run was observed straddling two — and where the stamps differ the
    // tiebreak never runs and any comparator passes. Found by mutation M198,
    // which survived: the numeric compare was disabled and this group stayed
    // green because that particular run had split across two milliseconds. A
    // test whose coverage depends on how fast the machine was is not a test.
    st.records.forEach((r) => { r.ts = 1700000000000; });
    const shown = st.records.slice().sort(app.fn('byNewest'))
      .filter(r => r.type === 'item').map(r => r.code);
    A.eq('newest first, in one unbroken descending run',
      shown.join(' '), 'PAT-1003 PAT-1002 PAT-1001 PAT-1000 PAT-0999 PAT-0998');
  });

  A.group('17t and the compare is numeric, not textual', () => {
    // ⚠ THE CASE THAT FORCES IT: a run that grows its padding. PAT-998 ×5
    // writes codes of two different widths, and a string compare puts '999'
    // above '1002' on the strength of the first character.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    commitRun('PAT-998', 5);
    st.records.forEach((r) => { r.ts = 1700000000000; });   // see 17s
    const shown = st.records.slice().sort(app.fn('byNewest'))
      .filter(r => r.type === 'item').map(r => r.code);
    A.eq('the widths do not break the order',
      shown.join(' '), 'PAT-1002 PAT-1001 PAT-1000 PAT-999 PAT-998');
  });

  A.group('17u the export order is what it always was', () => {
    // ⚠ ASSERTED BECAUSE THE FIX IS NEXT DOOR TO IT. byNewest() is a screen
    // sort; the client's file is built by a separate ascending sort in csv.js,
    // and this is the line that fails if somebody ever "tidies" the two into
    // one comparator.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    commitRun('PAT-0998', 4);
    const order = app.fn('recordsForExport')()
      .filter(r => r.type === 'item').map(r => r.code);
    A.eq('oldest first, in the order they were written',
      order.join(' '), 'PAT-0998 PAT-0999 PAT-1000 PAT-1001');
  });

  // ---------------------------------------------------------------------------
  // 12A / 13A — the phone-wide totals
  // ---------------------------------------------------------------------------

  A.group('17v ⚠ THE PHONE TOTAL SPANS SESSIONS AND THE LOG STRIP DOES NOT', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'MINE-1', mode: AUDIT }, 'pass', '');
    withSecondSession(() => {
      app.fn('addItemRecord')({ code: 'THEIRS-1', mode: AUDIT }, 'fail', 'Damaged Lead');
    });
    const phone = app.fn('phoneTotals')();
    const log = app.fn('logTotals')();
    A.eq('the phone sees both passes and fails', phone.pass + phone.fail, 2);
    A.eq('the log sees only this session', log.pass + log.fail, 1);
    A.eq('and the phone knows how many sessions', phone.sessions, 2);
    // ⚠ IT MUST AGREE WITH THE NUMBER THE CLEAR GUARD REFUSES ON. This line is
    // the whole reason the total is one pass over the records rather than a sum
    // of sessionCounts() — the two disagree the moment a record outlives its
    // session, and the guard counts the way this does.
    A.eq('⚠ unsent matches the clear guard exactly',
      phone.unsent, app.fn('unexportedCountAllSessions')());
  });

  A.group('17w the totals line says what it is counting, and hides a zero', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const line = app.fn('renderPhoneTotals')();
    A.includes('it names the phone, not the session', line, 'Everything on this phone');
    A.includes('and counts what is unsent', line, '2 not sent');
    // ⚠ A STANDING ZERO IS A NUMBER THAT STOPS BEING READ, and this line exists
    // to be noticed on the day it is not zero.
    st.records.forEach((r) => { r.exported = true; });
    A.excludes('with everything sent, the clause goes',
      app.fn('renderPhoneTotals')(), 'not sent');
  });
};
