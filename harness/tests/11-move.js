/*
 * 11-move — moving an item to another location, and the edit sheet's
 * description tools (V4).
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * TWO FEATURES, ONE SHEET. They are in one file because they share the sheet
 * they changed and the round trip that sheet has to survive.
 *
 * ⚠ THE FAILURE MODE THIS FILE EXISTS FOR is not "the location did not change".
 * It is the SILENT half of a move: the id changing without the code, so the
 * item reads correctly on screen and exports under the location it used to be
 * in. Every assertion about a move checks both fields, always.
 *
 * ⚠ AND THE OTHER ONE: an unsaved edit lost on the way to the picker. Opening
 * any sheet destroys the edit sheet, so the description typed thirty seconds
 * ago goes with it unless the draft carries it home. Green tests that only ever
 * open the picker on an untouched sheet would never see it.
 */

const A = require('../assert');
const F = require('../fixture');
const L = require('../load');

module.exports = function (app) {
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');

  // Two named locations and one item sitting in the first. Built by the APP's
  // own writers, never by hand — a hand-built record is immune to the bug that
  // a change in record shape would introduce.
  function twoLocationsAndAnItem() {
    F.resetApp(app);
    const kitchen = app.fn('addLocationRecord')('LOC-K', INITIAL,
      { client: 'Acme Ltd', floor: 'Ground', room: 'Staff Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle', cls: '1' }, 'pass', '');
    const corridor = app.fn('addLocationRecord')('LOC-C', INITIAL,
      { client: 'Acme Ltd', floor: 'First', room: 'Corridor' });
    const item = app.fn('itemRecords')()[0];
    return { kitchen, corridor, item };
  }

  // Tap a row in the open picker the way a finger does: through the delegated
  // listener on the list, not by calling anything the app exposes.
  function tapLocation(app_, locId) {
    const sheet = F.openSheetEl(app_);
    const list = sheet.querySelector('.reasonlist');
    const btn = F.tapTarget(app_, 'locpick', { 'data-loc': locId });
    btn.parentNode = list;
    list.dispatch('click', { target: btn });
  }

  A.group('11a the Change control opens the picker', () => {
    // ⚠ THROUGH THE BUTTON THE SHEET BUILT. Calling openLocationPickerSheet()
    // directly would pass on a build where the edit sheet never wires it up —
    // the exact hole the parent app shipped three releases with.
    const { item } = twoLocationsAndAnItem();
    app.fn('openEditSheet')(item.id);
    const sheet = F.openSheetEl(app);
    A.includes('the edit sheet has a location row', sheet.innerHTML, 'ed-locrow');
    sheet.querySelector('#ed-locchange').onclick();
    const picker = F.openSheetEl(app);
    A.includes('the picker opened', picker.innerHTML, 'Which location?');
    A.includes('and lists the other location', picker.innerHTML, 'Corridor');
    app.fn('closeSheet')();
  });

  A.group('11b a move rewrites the id AND the code', () => {
    // The silent half. An id-only move looks perfectly right on screen and
    // exports the item under the location it just left.
    const { kitchen, corridor, item } = twoLocationsAndAnItem();
    A.eq('starts in the kitchen', item.locationId, kitchen.id);
    A.eq('with the kitchen barcode', item.locationCode, 'LOC-K');

    app.fn('openEditSheet')(item.id);
    F.openSheetEl(app).querySelector('#ed-locchange').onclick();
    tapLocation(app, corridor.id);
    F.openSheetEl(app).querySelector('#ed-ok').onclick();

    const saved = app.fn('recordById')(item.id);
    A.eq('the id moved', saved.locationId, corridor.id);
    A.eq('and the code moved with it', saved.locationCode, 'LOC-C');
    A.eq('and it goes out again next export', saved.exported, false);
  });

  A.group('11c the export row follows the item to its new location', () => {
    // ⚠ NOT A RESTATEMENT OF 11b. That group reads the record; this one reads
    // the file the client receives, which is the only place the move actually
    // matters. A code written to the record but not read by the exporter would
    // pass 11b and ship the wrong file.
    const { corridor, item } = twoLocationsAndAnItem();
    app.fn('updateRecordFields')(item.id, { locationId: corridor.id });
    const csv = app.fn('buildCSV')().text;
    // ⚠ EVERY CELL IS QUOTED (csvCell). A filter for `item,` matches nothing and
    // leaves an empty string that fails the assertion for a reason that has
    // nothing to do with the move — this cost a few minutes on the first run.
    //
    // ⚠ V6 RE-POINTED THE FILTER. It used to find the row by its `record_type`
    // cell reading "item"; that column is retired and every row in the file is
    // now an item. The row is found by its asset id instead — which is a
    // stronger anchor anyway, since it names the record the move was applied to
    // rather than merely its kind.
    const itemLine = csv.split('\r\n').filter(l => l.indexOf('"' + item.code + '"') === 0)[0] || '';
    A.ok('there is an item row at all', itemLine !== '');
    A.includes('the item row carries the new location code', itemLine, 'LOC-C');
    A.excludes('and not the old one', itemLine, 'LOC-K');
  });

  A.group('11d the timestamp is left alone by a move', () => {
    // Decision 2A. A correction is one event, not a second one — re-stamping
    // would move the morning's work to the end of the day's file. The row can
    // therefore sit above its new location's row in the export, and the
    // location_id column is what resolves it.
    const { corridor, item } = twoLocationsAndAnItem();
    const before = app.fn('recordById')(item.id).ts;
    app.fn('updateRecordFields')(item.id, { locationId: corridor.id });
    A.eq('the time did not move', app.fn('recordById')(item.id).ts, before);
  });

  A.group('11e an unresolvable location id is ignored, not written', () => {
    // ⚠ THE CODE MUST SURVIVE. Accepting a dangling id and clearing the code to
    // match would throw away the barcode the item was genuinely scanned under —
    // the one thing that deliberately outlives a deleted location.
    const { kitchen, item } = twoLocationsAndAnItem();
    app.fn('updateRecordFields')(item.id, { locationId: 'loc_does_not_exist' });
    const after = app.fn('recordById')(item.id);
    A.eq('the id is untouched', after.locationId, kitchen.id);
    A.eq('and the code with it', after.locationCode, 'LOC-K');
  });

  A.group('11f an unsaved description survives the trip to the picker', () => {
    // THE REASON `draft` GREW A FIELD. Without it, correcting the location
    // silently discards the description fixed in the same visit — a data loss
    // on the screen whose whole job is putting data right.
    const { corridor, item } = twoLocationsAndAnItem();
    app.fn('openEditSheet')(item.id);
    let sheet = F.openSheetEl(app);
    sheet.querySelector('#ed-desc').value = 'Site Kettle';
    sheet.querySelector('#ed-locchange').onclick();

    tapLocation(app, corridor.id);
    sheet = F.openSheetEl(app);
    A.includes('the typed description came home', sheet.innerHTML, 'Site Kettle');
    A.includes('showing the location just picked', sheet.innerHTML, 'Corridor');
    A.eq('and nothing is written to the record yet',
      app.fn('recordById')(item.id).locationCode, 'LOC-K');
    app.fn('closeSheet')();
  });

  A.group('11g cancelling the picker keeps the edits and the old location', () => {
    const { kitchen, corridor, item } = twoLocationsAndAnItem();
    app.fn('openEditSheet')(item.id);
    let sheet = F.openSheetEl(app);
    sheet.querySelector('#ed-desc').value = 'Site Kettle';
    sheet.querySelector('#ed-locchange').onclick();
    F.openSheetEl(app).querySelector('#lp-cancel').onclick();

    sheet = F.openSheetEl(app);
    A.includes('back on the edit sheet with the edit intact', sheet.innerHTML, 'Site Kettle');
    A.includes('still showing the original location', sheet.innerHTML, 'Staff Kitchen');
    A.excludes('and not the one backed out of', sheet.innerHTML, 'Corridor');
    sheet.querySelector('#ed-ok').onclick();
    A.eq('saving after a cancel leaves the location alone',
      app.fn('recordById')(item.id).locationId, kitchen.id);
  });

  A.group('11h the two round trips compose', () => {
    // ⚠ THE ONE NEITHER FEATURE TESTS ON ITS OWN. A location picked, then a
    // FAIL tapped, sends the draft out through a SECOND sheet. If either round
    // trip drops what the other put in the draft, the item saves with the
    // location it started in and nobody sees it happen.
    const { corridor, item } = twoLocationsAndAnItem();
    app.fn('openEditSheet')(item.id);
    F.openSheetEl(app).querySelector('#ed-locchange').onclick();
    tapLocation(app, corridor.id);

    let sheet = F.openSheetEl(app);
    sheet.querySelector('#ed-desc').value = 'Site Kettle';
    const resRow = sheet.querySelector('#ed-result');
    const failBtn = F.tapTarget(app, 'class-opt', { 'data-res': 'fail' });
    failBtn.parentNode = resRow;
    resRow.dispatch('click', { target: failBtn });

    const reasons = F.openSheetEl(app).querySelector('.reasonlist');
    const pick = F.tapTarget(app, 'reason', { 'data-r': 'Damaged Lead' });
    pick.parentNode = reasons;
    reasons.dispatch('click', { target: pick });

    sheet = F.openSheetEl(app);
    A.includes('the location survived the reason picker too', sheet.innerHTML, 'Corridor');
    A.includes('and so did the description', sheet.innerHTML, 'Site Kettle');
    sheet.querySelector('#ed-ok').onclick();

    const saved = app.fn('recordById')(item.id);
    A.eq('saved in the new location', saved.locationCode, 'LOC-C');
    A.eq('as a fail', saved.result, 'fail');
    A.eq('with its reason', saved.failReason, 'Damaged Lead');
  });

  A.group('11i the picker rows carry time, count and what was tested', () => {
    // ⚠ THE POINT OF THE WHOLE PICKER. An audit location has no room name, so a
    // list of labels alone is a list of barcodes and identifies nothing. These
    // three are what make a bare code recognisable, and all three come from
    // records already on the phone.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-K', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle', cls: '1' }, 'pass', '');
    // ⚠ THE CLOCK HAS TO MOVE BETWEEN THEM. Both records are written inside the
    // same millisecond otherwise, and "newest first" then has nothing to sort
    // on — the assertion would be reading insertion order and calling it
    // recency, which is true of no real day's work.
    const realNow = Date.now;
    Date.now = () => realNow() + 5000;
    try {
      app.fn('addItemRecord')({ code: 'A2', mode: INITIAL, description: 'Toaster', cls: 'I' }, 'pass', '');
    } finally { Date.now = realNow; }
    const rows = app.fn('locationChoices')(3);
    A.eq('one location', rows.length, 1);
    A.eq('with both items counted', rows[0].count, 2);
    A.eq('and both named, newest first', rows[0].samples, ['Toaster', 'Kettle']);

    app.fn('openLocationPickerSheet')('', () => {}, () => {});
    const html = F.openSheetEl(app).innerHTML;
    A.includes('the row names what was tested there', html, 'Toaster, Kettle');
    A.includes('and how many', html, '2 items');
    A.ok('and when', /\d\d:\d\d/.test(html));
    app.fn('closeSheet')();
  });

  A.group('11j an unnamed location does not print its barcode twice', () => {
    // locationLabel() falls back to the code when there is no room, floor or
    // client — so a sub-line that always printed the code would read
    // "LOC-K / LOC-K · 09:42 · 2 items" on every audit location in the list.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-K', AUDIT, null);
    app.fn('openLocationPickerSheet')('', () => {}, () => {});
    const html = F.openSheetEl(app).innerHTML;
    A.eq('the code appears once', html.split('LOC-K').length - 1, 1);
    app.fn('closeSheet')();
  });

  A.group('11k a pure audit job still gets a usable row', () => {
    // Audit items are result-only by design, so there are no descriptions to
    // sample. The row must fall back to time and count rather than rendering an
    // empty line — this is the honest limit of the feature, asserted so a
    // future change cannot quietly turn it into a gap on screen.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-K', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const rows = app.fn('locationChoices')(3);
    A.eq('the item is counted', rows[0].count, 1);
    A.eq('with nothing to sample', rows[0].samples, []);
    app.fn('openLocationPickerSheet')('', () => {}, () => {});
    const html = F.openSheetEl(app).innerHTML;
    A.includes('the row still says how many', html, '1 item');
    A.excludes('and renders no empty sample line', html, 'locpick-items');
    app.fn('closeSheet')();
  });

  A.group('11l the picker offers only locations that exist', () => {
    // ⚠ THIS IS THE ANSWER TO THE BACKLOG'S QUESTION, not an incidental limit.
    // An item cannot be moved somewhere unscanned, so the export can never
    // carry an item row pointing at a location row that is not in the file.
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const item = app.fn('itemRecords')()[0];
    app.fn('openEditSheet')(item.id);
    F.openSheetEl(app).querySelector('#ed-locchange').onclick();
    const html = F.openSheetEl(app).innerHTML;
    A.excludes('no rows to pick', html, 'locpick');
    A.includes('and it says why', html, 'No locations scanned yet');
    app.fn('closeSheet')();
  });

  A.group('11m the current location is marked in the picker', () => {
    const { kitchen, item } = twoLocationsAndAnItem();
    app.fn('openEditSheet')(item.id);
    F.openSheetEl(app).querySelector('#ed-locchange').onclick();
    const html = F.openSheetEl(app).innerHTML;
    const start = html.indexOf(kitchen.id);
    A.ok('the row for the location it is in is present', start !== -1);
    A.ok('and is the marked one',
      html.slice(0, start).lastIndexOf('is-on') > html.slice(0, start).lastIndexOf('<button'));
    app.fn('closeSheet')();
  });

  A.group('11n Quick Pick fills the description on the edit sheet', () => {
    // Through the grid's own delegated listener, and reading the value back off
    // the field the sheet holds — not off a copy the test made.
    const { item } = twoLocationsAndAnItem();
    app.fn('openEditSheet')(item.id);
    const sheet = F.openSheetEl(app);
    A.includes('the grid is on the sheet', sheet.innerHTML, 'ed-quick');
    const grid = sheet.querySelector('#ed-quick');
    const btn = F.tapTarget(app, 'quick-btn', { 'data-q': 'Microwave' });
    btn.parentNode = grid;
    grid.dispatch('click', { target: btn });
    A.eq('tapping one fills the box', sheet.querySelector('#ed-desc').value, 'Microwave');
    sheet.querySelector('#ed-ok').onclick();
    A.eq('and Save writes it', app.fn('recordById')(item.id).description, 'Microwave');
  });

  A.group('11o the suggestion dropdown works on the edit sheet', () => {
    const { item } = twoLocationsAndAnItem();
    app.fn('openEditSheet')(item.id);
    const sheet = F.openSheetEl(app);
    const desc = sheet.querySelector('#ed-desc');
    const sug = sheet.querySelector('#ed-suggest');
    // ⚠ THE STUB'S classList STARTS EMPTY — innerHTML is a string here and no
    // class in it reaches the node. So "it is not hidden" is the stub's default
    // and asserting it after typing would pass on a build that never showed the
    // list at all. The markup is asserted as SOURCE, and the node is only ever
    // asserted across a transition the app itself performed.
    A.includes('the markup declares it hidden', sheet.innerHTML, 'suggest is-hidden');

    desc.value = '';
    desc.dispatch('input', { target: desc });
    A.ok('an empty box hides it', sug.classList.contains('is-hidden'));
    A.eq('and empties it', sug.innerHTML, '');

    desc.value = 'Ket';
    desc.dispatch('input', { target: desc });
    A.ok('typing shows it again', !sug.classList.contains('is-hidden'));
    A.includes('with a match in it', sug.innerHTML, 'Kettle');

    // ⚠ pointerdown, NOT click. A click races the blur teardown and iOS drops
    // the tap entirely — dispatching click here would pass on a build that had
    // regressed to the broken binding.
    const pick = F.tapTarget(app, 'suggestion-item', { 'data-d': 'Kettle' });
    pick.parentNode = sug;
    sug.dispatch('pointerdown', { target: pick, preventDefault() {} });
    A.eq('tapping one fills the box', desc.value, 'Kettle');
    A.ok('and closes the list', sug.classList.contains('is-hidden'));
    app.fn('closeSheet')();
  });

  A.group('11p the edit sheet still does not focus its description box', () => {
    // ⚠ SOURCE GUARD, and the rule it guards is V1.1's: focusing the field
    // raises the keyboard, which on a phone covers the very grid the engineer
    // is meant to tap. The edit sheet grew a grid this release, so it inherits
    // the rule — and the count is exact, because "no more than before" would
    // stay green on a sheet that had swapped one focus for another.
    const rn = L.stripComments(L.readFile('render.js'));
    A.ok('render.js focuses nothing directly', rn.indexOf('.focus(') === -1);
    A.eq('and still only two sheets focus a field at all',
      rn.split('focusSheetField(').length - 1, 2);
  });

  A.group('11q the sheet drops its safe-area padding when the keyboard is up', () => {
    // V4's small one. The inset exists to clear the home indicator; with a
    // keyboard on screen there is no home indicator to clear and it becomes a
    // dead strip between the buttons and the keys.
    F.resetApp(app);
    const vv = app.ctx.visualViewport;
    vv.reset();
    app.fn('openConfirmSheet')({ title: 'Anything' });
    const wrap = app.doc.getElementById('sheet-backdrop');
    A.ok('no keyboard, no flag', !wrap.classList.contains('is-keyboard'));

    vv.keyboard(300);
    A.ok('the keyboard sets it', wrap.classList.contains('is-keyboard'));
    // ⚠ AND IT MUST COME BACK OFF. A flag that only ever goes on leaves the
    // padding missing for the rest of the sheet's life, which is a different
    // cosmetic bug in the other direction.
    vv.keyboard(0);
    A.ok('and putting it away clears it', !wrap.classList.contains('is-keyboard'));

    const css = L.stripComments(L.readFile('styles.css'));
    A.includes('with a rule that acts on the flag', css,
      '.sheet-backdrop.is-keyboard .bulk-sheet');
    app.fn('closeSheet')();
    vv.reset();
  });

  // -------------------------------------------------------------------------
  // V9 — SCAN-TO-MOVE
  //
  // ⚠ THE FAILURE MODE THESE EXIST FOR is not "the item did not move". It is an
  // ARM THAT OUTLIVES ITS SCAN. The log screen already consumed barcodes before
  // V9 — they went into the search box — so a move arm left set after use, or
  // carried onto another screen, does not fail loudly: it silently takes the
  // NEXT barcode the engineer scans and files an item somewhere they never
  // asked for. Every group below ends by asserting the app is disarmed,
  // including the ones where the move was refused.
  //
  // ⚠ AND THEY GO THROUGH document. F.burst dispatches keydowns the way the
  // browser does, so a build where initScanner() never ran, or where the log
  // screen never routes to the move grammar, fails here. Calling routeScan()
  // directly would pass on both.
  // -------------------------------------------------------------------------

  // The state a real move starts from: two locations, an item in the first, the
  // app on the log with the scanner live and its search box in the DOM.
  function onLogReadyToMove() {
    const built = twoLocationsAndAnItem();
    const st = app.state();
    st.view = 'log';
    st.scannerEnabled = true;
    st.welcomeSeen = true;
    app.register('log-search');
    return Object.assign({ st: st }, built);
  }

  function toastText() {
    const el = app.doc.getElementById('toast');
    return el ? String(el.textContent || '') : '';
  }

  A.group('11r the edit sheet offers Save & scan beside Change', () => {
    // ⚠ THROUGH THE SHEET THE APP BUILT, not against the source. Both controls
    // asserted together: the point of 3A is that scanning is an ADDITION to the
    // picker, and a release that replaced Change with it would still be green
    // on an assertion that only looked for the new button.
    const { item } = onLogReadyToMove();
    app.fn('openEditSheet')(item.id);
    const sheet = F.openSheetEl(app);
    A.includes('the picker is still there', sheet.innerHTML, 'ed-locchange');
    A.includes('and scanning is offered beside it', sheet.innerHTML, 'ed-locscan');
    A.includes('the label says the save out loud', sheet.innerHTML, 'Save &amp; scan');
    app.fn('closeSheet')();
  });

  A.group('11s Save & scan commits the draft before it arms (3A)', () => {
    // ⚠ THIS IS THE WHOLE OF DECISION 3A AND IT IS THE EASIEST THING HERE TO
    // GET WRONG. Arming closes the sheet, and closing the sheet destroys the
    // draft — so an implementation that armed WITHOUT saving would lose the
    // description typed seconds earlier and lose it silently, which is the
    // exact bug V4 and V5 kept extending snapshot() to prevent.
    const { item } = onLogReadyToMove();
    app.fn('openEditSheet')(item.id);
    const sheet = F.openSheetEl(app);
    sheet.querySelector('#ed-desc').value = 'Toaster';
    sheet.querySelector('#ed-locscan').onclick();

    const after = app.fn('recordById')(item.id);
    A.eq('the typed description was saved', after.description, 'Toaster');
    A.eq('and the app is armed with that item', app.state().moveArmed, item.id);
    A.eq('on the log, where the banner is', app.state().view, 'log');
    A.ok('with the sheet closed', !app.fn('sheetIsOpen')());
  });

  A.group('11t the banner names the item and cancels the arm', () => {
    const { item } = onLogReadyToMove();
    app.fn('armMove')(item.id);
    const html = app.fn('renderMoveBar')();
    A.includes('it names the asset being moved', html, item.code);
    A.includes('the whole banner is the cancel target', html, 'data-action="cancelMove"');

    // Through the registry the delegated listener reads, not by hand.
    // ⚠ app.val(), NOT app.fn() — ACTIONS is a top-level const, so it reaches
    // the harness through the loader's bridge rather than off the vm global.
    app.val('ACTIONS').cancelMove();
    A.eq('cancelling disarms', app.state().moveArmed, '');
    A.eq('and the banner goes', app.fn('renderMoveBar')(), '');
  });

  A.group('11u a scan on the log moves the item — id AND code', () => {
    const { item, corridor } = onLogReadyToMove();
    app.fn('armMove')(item.id);
    app.register('log-search');
    F.burst(app, corridor.code);

    const after = app.fn('recordById')(item.id);
    A.eq('the pointer moved', after.locationId, corridor.id);
    // ⚠ BOTH FIELDS, ALWAYS — the silent half of a move is the id changing
    // without the code, which reads correctly on screen and exports wrong.
    A.eq('and so did the copy the client reads', after.locationCode, corridor.code);
    A.eq('the arm is spent', app.state().moveArmed, '');
    A.includes('and it says where it went', toastText(), 'Corridor');
  });

  A.group('11v the arm is one-shot — the next scan is a search again', () => {
    // ⚠ THE GROUP THIS FILE'S V9 SECTION EXISTS FOR. Two bursts, one arm. If
    // the second is still read as a destination the item moves twice, and on a
    // real phone the second barcode is whatever the engineer scans next.
    const { item, kitchen, corridor } = onLogReadyToMove();
    app.fn('armMove')(item.id);
    app.register('log-search');
    F.burst(app, corridor.code);
    F.burst(app, kitchen.code);

    const after = app.fn('recordById')(item.id);
    A.eq('it stayed where the first scan put it', after.locationId, corridor.id);
    A.notEq('it did not follow the second barcode', after.locationId, kitchen.id);
    // The second burst went where an unarmed log burst has always gone.
    A.eq('the second scan reached the search box', app.state().logSearch, kitchen.code);
  });

  A.group('11w a destination that is not a location is refused (4A)', () => {
    // The accident this protects against is an ASSET barcode scanned at the
    // move prompt. Refusing means it cannot quietly become a location record.
    const { item, kitchen } = onLogReadyToMove();
    const before = app.fn('recordById')(item.id).locationId;
    app.fn('armMove')(item.id);
    app.register('log-search');
    const locsBefore = app.state().records.filter(r => r.type === 'location').length;
    F.burst(app, 'NOT-A-ROOM');

    const after = app.fn('recordById')(item.id);
    A.eq('the item did not move', after.locationId, before);
    A.eq('it is still where it was', after.locationId, kitchen.id);
    A.eq('⚠ and nothing was created to receive it',
      app.state().records.filter(r => r.type === 'location').length, locsBefore);
    A.eq('the arm is spent even though it refused', app.state().moveArmed, '');
    A.includes('and it says why', toastText(), 'not a location in this session');
  });

  A.group('11x a scan cannot move an item across sessions', () => {
    // ⚠ THE RULE THAT PROTECTS THE CLIENT'S FILE RATHER THAN THE ENGINEER'S
    // PATIENCE. The log shows every session, so the edit sheet opens on records
    // from batches that are not the one being scanned into. Pointing one at
    // today's location would export an item under a location its own file does
    // not contain.
    const { item } = onLogReadyToMove();
    const before = app.fn('recordById')(item.id).locationId;
    app.fn('armMove')(item.id);

    // A fresh session, and a location inside it — the app's own writers.
    const other = app.fn('createSession')('Another job');
    app.fn('switchToSession')(other.id);
    const elsewhere = app.fn('addLocationRecord')('LOC-NEW', app.val('MODE_AUDIT'), null);
    app.state().view = 'log';
    app.state().moveArmed = item.id;
    app.register('log-search');
    F.burst(app, elsewhere.code);

    const after = app.fn('recordById')(item.id);
    A.eq('it did not move', after.locationId, before);
    A.notEq('and certainly not into the new session', after.locationId, elsewhere.id);
    A.eq('the arm is spent', app.state().moveArmed, '');
    A.includes('and it says which rule stopped it', toastText(), 'another session');
  });

  A.group('11y navigating away disarms', () => {
    // ⚠ AN ARM THAT SURVIVES NAVIGATION IS AN INVISIBLE ARM. The banner only
    // exists on the log; anywhere else the engineer has nothing telling them
    // the next barcode means something unusual.
    const { item } = onLogReadyToMove();
    app.fn('armMove')(item.id);
    A.eq('armed', app.state().moveArmed, item.id);
    app.fn('setView')('scan');
    A.eq('and disarmed by the walk to another screen', app.state().moveArmed, '');
  });

  A.group('11z the same barcode twice is a no-op, not a rewrite', () => {
    const { item, kitchen } = onLogReadyToMove();
    const stampBefore = app.fn('recordById')(item.id).ts;
    app.fn('armMove')(item.id);
    app.register('log-search');
    F.burst(app, kitchen.code);

    const after = app.fn('recordById')(item.id);
    A.eq('still in the kitchen', after.locationId, kitchen.id);
    A.eq('⚠ and the timestamp was left alone', after.ts, stampBefore);
    A.includes('it says so rather than claiming a move', toastText(), 'already at');
    A.eq('the arm is spent', app.state().moveArmed, '');
  });

  A.group('11aa the banner disappears with the record it names', () => {
    // A banner naming a deleted item would invite a walk to a room to scan a
    // label for something that is not there any more.
    const { item } = onLogReadyToMove();
    app.fn('armMove')(item.id);
    app.fn('deleteRecord')(item.id);
    A.eq('nothing to show', app.fn('renderMoveBar')(), '');
    A.eq('and the arm went with it', app.state().moveArmed, '');
  });
};
