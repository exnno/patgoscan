/*
 * 13-columns — V6. The client's real layout, the readings that live on the
 * record, and the class migration.
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * ⚠ THE QUESTION TO ASK OF EVERY ASSERTION HERE: could this pass on broken
 * code? Three shapes are specific to this release:
 *
 *   1. AN EMPTY CELL IS THE SIGNAL, not the absence of one. Under decision 3B
 *      an empty reading is what marks a row as a visual inspection — so "the
 *      cell is empty" passes perfectly on a build that has stopped writing
 *      readings at all. Every empty-cell assertion below is PAIRED with one
 *      that had to travel the same path and come back full.
 *
 *   2. FLOOR AND ROOM ARE SCOPED TO THE FILE, not to all history, and a single
 *      export can never tell the two apart. The claim only becomes testable
 *      across TWO successive exports — 13f is the group that matters and the
 *      rest of the floor/room coverage would stay green without it.
 *
 *   3. THE CLASS MIGRATION IS INVISIBLE WHEN IT WORKS. A record holding 'I'
 *      that exports '1' looks identical to a record that always held '1'. The
 *      migration groups build the OLD shape deliberately and push it through
 *      the real validators.
 */

const A = require('../assert');
const F = require('../fixture');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');
  const SPEC = app.val('CSV_COLUMNS');
  const COLS = SPEC.map(c => c.key);
  const EARTH = app.val('EARTH_BOND_DEFAULT');
  const INS = app.val('INSULATION_DEFAULT');

  function rows(text) { return text.split('\r\n'); }
  function cells(row) { return row.slice(1, -1).split('","').map(s => s.replace(/""/g, '"')); }
  function at(cellArr, key) { return cellArr[COLS.indexOf(key)]; }
  function build(onlyNew) { return app.fn('buildCSV')(onlyNew); }
  function exportRow(n, onlyNew) { return cells(rows(build(onlyNew === true).text)[n]); }

  // Spaced timestamps. ⚠ Records created inside one millisecond all carry the
  // same ts, and any comparator that ties on ts falls through to a random id
  // suffix — which orders them differently on every run and makes a group pass
  // or fail by coin-toss under mutation.
  function space() {
    st.records.forEach((rec, i) => { rec.ts = 1700000000000 + i * 1000; });
  }

  // -------------------------------------------------------------------------
  // The header
  // -------------------------------------------------------------------------

  A.group('13a the header is the client\'s twelve, plus engineer', () => {
    F.resetApp(app);
    const r = rows(build(false).text);
    A.eq('header matches CSV_COLUMNS exactly', cells(r[0]), COLS);
    // ⚠ THE CLIENT'S TWELVE COME FIRST, IN THEIR ORDER. Engineer is APPENDED
    // (decision 12B) precisely so their layout is untouched — inserting it
    // anywhere inside would shift every column after it in their importer.
    A.eq('the client\'s twelve, in their order', COLS.slice(0, 12), [
      'ASSET ID', 'CLASS', 'VISUAL', 'OPERATIONAL', 'EARTH BOND', 'INSULATION',
      'DESCRIPTION', 'LOCATION ID', 'FLOOR', 'ROOM', 'DATE', 'NOTES',
    ]);
    A.eq('engineer appended, not inserted', COLS[12], 'ENGINEER');
    A.ok('headers are ALL CAPS as specified',
      COLS.every(k => k === k.toUpperCase()));
  });

  // -------------------------------------------------------------------------
  // The four outcome columns, case by case
  // -------------------------------------------------------------------------

  A.group('13b a class 1 full-test pass fills all four', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    const c = exportRow(1);
    A.eq('VISUAL', at(c, 'VISUAL'), 'PASS');
    A.eq('OPERATIONAL', at(c, 'OPERATIONAL'), 'PASS');
    A.eq('EARTH BOND', at(c, 'EARTH BOND'), EARTH);
    A.eq('INSULATION', at(c, 'INSULATION'), INS);
  });

  A.group('13c ⚠ a class 2 item carries NO earth bond, ever', () => {
    // A Class II appliance has no earth to bond. A value here claims a test
    // that cannot physically be performed. The client's own sample is empty in
    // every Class 2 row — this rule came from their file, not from us.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '2', visual: false }, 'pass', '');
    const c = exportRow(1);
    A.eq('earth bond empty', at(c, 'EARTH BOND'), '');
    // ⚠ PAIRED — without this the group passes on a build writing no readings.
    A.eq('but insulation IS there', at(c, 'INSULATION'), INS);
    A.eq('and the row is genuinely class 2', at(c, 'CLASS'), '2');

    // ⚠ AND THE RECORD ITSELF, NOT ONLY THE FILE. M118 SURVIVED THE FIRST RUN
    // on exactly this gap: the rule is enforced TWICE — once in readingsFor()
    // when the record is written and again in the EARTH BOND cell on the way
    // out — so breaking the writer is completely invisible to an assertion that
    // only ever reads the export. Two independent guards need two independent
    // assertions, or one of them is unguarded and nobody finds out until the
    // other is refactored away.
    const rec = app.fn('findItemByCode')('A1', null);
    A.eq('the record was never given one', rec.earthBond, '');
    A.eq('and it did get an insulation reading', rec.insulation, INS);
  });

  A.group('13c2 the class rule survives a class corrected in the log', () => {
    // ⚠ THE REASON THE RULE IS ENFORCED TWICE. The reading was legitimate when
    // it was written; correcting the class to 2 afterwards must not leave it
    // behind. Guarded in readingsFor() AND in the EARTH BOND cell, because a
    // record can reach the exporter without going through either writer.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    A.eq('it started with a reading', rec.earthBond, EARTH);
    app.fn('updateRecordFields')(rec.id, { cls: '2', result: 'pass' });
    A.eq('the record dropped it', app.fn('recordById')(rec.id).earthBond, '');
    A.eq('and so did the file', at(exportRow(1), 'EARTH BOND'), '');

    // And the belt-and-braces path: a record that reached the exporter with a
    // reading still on it, however it got there.
    app.fn('recordById')(rec.id).earthBond = EARTH;
    A.eq('the cell refuses it anyway', at(exportRow(1), 'EARTH BOND'), '');
  });

  A.group('13d ⚠ a visual inspection passes both, with no readings', () => {
    // Decision 3B. The readings are the ONLY thing in the file separating an
    // inspection from a full test.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: true }, 'pass', '');
    const c = exportRow(1);
    A.eq('VISUAL passes', at(c, 'VISUAL'), 'PASS');
    A.eq('OPERATIONAL passes too', at(c, 'OPERATIONAL'), 'PASS');
    A.eq('no earth bond', at(c, 'EARTH BOND'), '');
    A.eq('no insulation', at(c, 'INSULATION'), '');
  });

  A.group('13d2 ⚠ correcting visual OFF brings the readings back', () => {
    // THE DANGEROUS DIRECTION, and the one this release nearly shipped wrong.
    // With VISUAL and OPERATIONAL identical either way, an item corrected from
    // inspection to full test and left with empty readings still exports as an
    // inspection — the correction appears to work on screen and changes nothing
    // in the file, understating work that was actually done.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: true }, 'pass', '');
    A.eq('starts with none', rec.insulation, '');
    app.fn('updateRecordFields')(rec.id, { visual: false, result: 'pass' });
    A.eq('insulation seeded', app.fn('recordById')(rec.id).insulation, INS);
    A.eq('earth bond seeded', app.fn('recordById')(rec.id).earthBond, EARTH);
    A.eq('and it reached the file', at(exportRow(1), 'INSULATION'), INS);
    // And back the other way, so this cannot pass by the readings simply
    // always being present.
    app.fn('updateRecordFields')(rec.id, { visual: true, result: 'pass' });
    A.eq('turning it on clears them again', app.fn('recordById')(rec.id).insulation, '');
  });

  A.group('13d3 a typed reading is never overwritten by the seed', () => {
    // ⚠ THE SEED FILLS A GAP, IT DOES NOT CORRECT A VALUE. An engineer who
    // typed 0.08 must not have it replaced with the Settings default the next
    // time anything else on the record is edited.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    app.fn('updateRecordFields')(rec.id, { earthBond: '0.08', insulation: '150', result: 'pass' });
    A.eq('typed earth bond kept', app.fn('recordById')(rec.id).earthBond, '0.08');
    app.fn('updateRecordFields')(rec.id, { description: 'Kettle', result: 'pass' });
    A.eq('and still kept after an unrelated edit', app.fn('recordById')(rec.id).earthBond, '0.08');
    A.eq('insulation likewise', app.fn('recordById')(rec.id).insulation, '150');
  });

  A.group('13d4 an empty reading is a real answer', () => {
    // It is how a reading recorded by mistake is removed. Guarding on
    // truthiness would make the field one-way.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    A.eq('starts full', rec.insulation, INS);
    app.fn('updateRecordFields')(rec.id, { earthBond: '', insulation: '', result: 'pass' });
    // ⚠ The seed does NOT undo this, because both being empty on a tested item
    // is exactly the gap the seed fills. This is the one genuine tension in the
    // design and it resolves in favour of the safe direction: an item that
    // reads as an inspection understates work; one that reads as a test claims
    // work that was not done.
    A.eq('the seed reinstates them rather than leaving a test looking visual',
      app.fn('recordById')(rec.id).insulation, INS);
    // Clearing ONE of them is honoured, because the gap is not total.
    app.fn('updateRecordFields')(rec.id, { insulation: '', result: 'pass' });
    A.eq('one cleared reading stays cleared', app.fn('recordById')(rec.id).insulation, '');
    A.eq('and the other is untouched', app.fn('recordById')(rec.id).earthBond, EARTH);
  });

  A.group('13e ⚠ a fail writes FAIL to both and no readings', () => {
    // Decisions 5B and 6A. No attempt is made to guess which stage failed from
    // the reason text — the list is editable and an engineer will eventually
    // add one that maps to neither stage. The reason goes out intact in NOTES.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'fail', 'Damaged Casing');
    const c = exportRow(1);
    A.eq('VISUAL', at(c, 'VISUAL'), 'FAIL');
    A.eq('OPERATIONAL', at(c, 'OPERATIONAL'), 'FAIL');
    A.eq('no earth bond on a fail', at(c, 'EARTH BOND'), '');
    A.eq('no insulation on a fail', at(c, 'INSULATION'), '');
    A.eq('the reason is in NOTES', at(c, 'NOTES'), 'Damaged Casing');
    // ⚠ PAIRED. Without this the empties above pass on a build writing no
    // readings for anything.
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    space();
    A.eq('a passing sibling still gets its readings', at(exportRow(2), 'INSULATION'), INS);
  });

  // -------------------------------------------------------------------------
  // Floor and room — the part that is only testable across two exports
  // -------------------------------------------------------------------------

  A.group('13f ⚠ THE MONDAY/TUESDAY CASE — descriptors in EVERY file', () => {
    // THE GROUP THIS RELEASE TURNS ON. Decision 7A puts floor and room on the
    // first item row of a newly initialised location, and the naive reading of
    // "first" is "first ever". That reading is broken, because export sends
    // UNEXPORTED RECORDS ONLY: a location initialised Monday and added to on
    // Tuesday would put its descriptors in Monday's file and leave Tuesday's
    // with no location detail anywhere in it.
    //
    // ⚠ A SINGLE EXPORT CANNOT TELL THE TWO READINGS APART. Every other
    // floor/room group here would stay green on the broken version.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', INITIAL, { client: 'Acme', floor: 'Ground', room: 'Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'pass', '');
    space();

    const monday = build(true);
    A.eq('Monday has two rows', monday.count, 2);
    A.eq('Monday\'s first row carries the floor', at(cells(rows(monday.text)[1]), 'FLOOR'), 'Ground');
    A.eq('and the room', at(cells(rows(monday.text)[1]), 'ROOM'), 'Kitchen');
    A.eq('Monday\'s second row does not repeat them', at(cells(rows(monday.text)[2]), 'FLOOR'), '');
    app.fn('markExported')(monday.records);

    // Tuesday: same location, more items, nothing else changed.
    app.fn('addItemRecord')({ code: 'A3', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A4', mode: AUDIT }, 'pass', '');
    space();
    const tuesday = build(true);
    A.eq('Tuesday has two rows', tuesday.count, 2);
    A.eq('⚠ Tuesday carries the floor TOO', at(cells(rows(tuesday.text)[1]), 'FLOOR'), 'Ground');
    A.eq('⚠ and the room', at(cells(rows(tuesday.text)[1]), 'ROOM'), 'Kitchen');
    A.eq('and still only on its first row', at(cells(rows(tuesday.text)[2]), 'FLOOR'), '');
    A.eq('the right asset leads Tuesday', at(cells(rows(tuesday.text)[1]), 'ASSET ID'), 'A3');
  });

  A.group('13f2 a re-exported correction carries its own floor and room', () => {
    // An edit un-exports its record, so a single corrected row goes out alone
    // in a later file. It is the first of its location IN THAT FILE and must
    // therefore describe itself.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', INITIAL, { client: 'Acme', floor: 'Ground', room: 'Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const rec = app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'pass', '');
    space();
    app.fn('markExported')(build(true).records);
    A.eq('nothing outstanding', build(true).count, 0);

    app.fn('updateRecordFields')(rec.id, { description: 'Kettle', result: 'pass' });
    const later = build(true);
    A.eq('one row goes out', later.count, 1);
    A.eq('it is the corrected one', at(cells(rows(later.text)[1]), 'ASSET ID'), 'A2');
    A.eq('⚠ and it describes its own location', at(cells(rows(later.text)[1]), 'ROOM'), 'Kitchen');
  });

  A.group('13g an AUDITED location contributes no floor or room', () => {
    // Decision 9A's other half. An audited location is one the client already
    // holds — repeating their own detail back at them is noise.
    F.resetApp(app);
    const loc = app.fn('addLocationRecord')('LOC-4', AUDIT, null);
    // ⚠ GIVE IT A FLOOR AND ROOM ANYWAY. Testing a location that has none would
    // prove nothing — the cell would come back empty for want of data rather
    // than because the rule fired.
    loc.floor = 'First';
    loc.room = 'Store';
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    space();
    const c = exportRow(1);
    A.eq('floor withheld', at(c, 'FLOOR'), '');
    A.eq('room withheld', at(c, 'ROOM'), '');
    // ⚠ PAIRED — the same fields DO come out when the location is initialised.
    loc.mode = INITIAL;
    A.eq('and released when it is an initial', at(exportRow(1), 'ROOM'), 'Store');
  });

  A.group('13g2 two locations in one file each describe themselves once', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-A', INITIAL, { floor: '1', room: 'Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'pass', '');
    app.fn('addLocationRecord')('LOC-B', INITIAL, { floor: '2', room: 'Office' });
    app.fn('addItemRecord')({ code: 'B1', mode: AUDIT }, 'pass', '');
    space();
    const r = rows(build(false).text);
    A.eq('A1 leads the kitchen', at(cells(r[1]), 'ROOM'), 'Kitchen');
    A.eq('A2 stays quiet', at(cells(r[2]), 'ROOM'), '');
    A.eq('B1 leads the office', at(cells(r[3]), 'ROOM'), 'Office');
    A.eq('and its floor', at(cells(r[3]), 'FLOOR'), '2');
  });

  // -------------------------------------------------------------------------
  // Rows, and what is no longer one
  // -------------------------------------------------------------------------

  A.group('13h ⚠ locations emit no rows but are still marked exported', () => {
    // Decision 8A. Leaving them unmarked piles them up forever and drifts the
    // "not exported" count on the Backup page away from what is outstanding.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', INITIAL, { floor: '1', room: 'Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    space();
    const built = build(true);
    A.eq('one row in the file', built.count, 1);
    A.eq('two records to mark', built.records.length, 2);
    app.fn('markExported')(built.records);
    A.eq('⚠ nothing left outstanding', app.fn('unexportedCount')(), 0);
    A.ok('and the location is still in the log',
      st.records.filter(r => r.type === 'location').length === 1);
  });

  A.group('13h2 a location alone exports nothing and stays pending', () => {
    // ⚠ AND THAT IS CORRECT. There is genuinely nothing to report yet. Marking
    // it exported here would mean the room never described itself to the client
    // at all, because the items scanned there tomorrow would find it already
    // stamped.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', INITIAL, { floor: '1', room: 'Kitchen' });
    A.eq('no rows', build(true).count, 0);
    A.eq('and it is still outstanding', app.fn('unexportedCount')(), 1);
  });

  A.group('13i description rides on initial rows only', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle' }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT, description: 'Toaster' }, 'pass', '');
    space();
    A.eq('the initial states it', at(exportRow(1), 'DESCRIPTION'), 'Kettle');
    // ⚠ THE AUDIT RECORD HAS ONE AND THE COLUMN IS STILL EMPTY. That is the
    // claim — testing a record with no description would prove nothing.
    A.eq('the audit withholds it', at(exportRow(2), 'DESCRIPTION'), '');
    A.eq('though the record holds it',
      app.fn('findItemByCode')('A2', null).description, 'Toaster');
  });

  A.group('13j the location id is the barcode the item was scanned under', () => {
    F.resetApp(app);
    const loc = app.fn('addLocationRecord')('LOC-7', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    space();
    A.eq('carried', at(exportRow(1), 'LOCATION ID'), 'LOC-7');
    // ⚠ IT SURVIVES THE LOCATION BEING DELETED. The id is a pointer and can go
    // dangling; the code is a copy and is what the client reads.
    app.fn('deleteRecord')(loc.id);
    A.eq('and it survives the location being deleted',
      at(exportRow(1), 'LOCATION ID'), 'LOC-7');
  });

  // -------------------------------------------------------------------------
  // The date
  // -------------------------------------------------------------------------

  A.group('13k DATE is dd/MM/yyyy with no time', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    rec.ts = new Date(2026, 3, 3, 14, 22, 0).getTime();
    const d = at(exportRow(1), 'DATE');
    // ⚠ 03/04 ON PURPOSE. A date where day and month cannot be confused would
    // stay green on an ISO or American ordering.
    A.eq('day first, zero padded', d, '03/04/2026');
    A.ok('no time component', d.indexOf(':') === -1);
  });

  // -------------------------------------------------------------------------
  // The class migration
  // -------------------------------------------------------------------------

  A.group('13l ⚠ a pre-V6 record migrates from I/II to 1/2', () => {
    // ⚠ INVISIBLE WHEN IT WORKS. A record holding 'I' that exports '1' looks
    // exactly like one that always held '1', so the OLD shape has to be built
    // deliberately and pushed through the real validator.
    F.resetApp(app);
    const cleaned = app.fn('normaliseRecords')([
      { id: 'i1', type: 'item', mode: AUDIT, code: 'A1', ts: 1700000000000, result: 'pass', cls: 'I' },
      { id: 'i2', type: 'item', mode: AUDIT, code: 'A2', ts: 1700000001000, result: 'pass', cls: 'II' },
    ]);
    A.eq('Roman I became 1', cleaned[0].cls, '1');
    A.eq('Roman II became 2', cleaned[1].cls, '2');
    // ⚠ AND THE CLASS 2 EARTH BOND RULE APPLIES ON THE WAY IN TOO. A
    // hand-edited backup must not be able to seat a reading the export trusts.
    A.eq('a migrated class 2 carries no earth bond', cleaned[1].earthBond, '');
  });

  A.group('13l2 the migration runs on load, not just on paper', () => {
    F.resetApp(app);
    app.storage.setItem(app.val('RECORDS_KEY'), JSON.stringify([
      { id: 'i1', type: 'item', mode: AUDIT, code: 'A1', ts: 1700000000000, result: 'pass', cls: 'II' },
    ]));
    app.fn('load')();
    A.eq('the loaded record is migrated', st.records[0].cls, '2');
    A.eq('and it exports as the client writes it', at(exportRow(1), 'CLASS'), '2');
  });

  A.group('13l3 the stored TOGGLE migrates too, and defaults', () => {
    // A different question from the record's class: the toggle is a
    // two-position switch with no third position, so garbage lands on the
    // DEFAULT rather than on empty.
    F.resetApp(app);
    A.eq('Roman on the toggle migrates', app.fn('normaliseItemClass')('II'), '2');
    A.eq('a good one survives', app.fn('normaliseItemClass')('1'), '1');
    A.eq('garbage falls to the default',
      app.fn('normaliseItemClass')('banana'), app.val('ITEM_CLASS_DEFAULT'));
    A.eq('and the default is 1', app.val('ITEM_CLASS_DEFAULT'), '1');
  });

  A.group('13l4 ⚠ an uncaptured class stays uncaptured', () => {
    // On a RECORD, garbage becomes EMPTY rather than the default. Inventing
    // Class 1 for a record whose class was never captured would claim an earth
    // bond test that nobody performed.
    F.resetApp(app);
    const cleaned = app.fn('normaliseRecords')([
      { id: 'i1', type: 'item', mode: AUDIT, code: 'A1', ts: 1700000000000, result: 'pass', cls: 'banana' },
      { id: 'i2', type: 'item', mode: AUDIT, code: 'A2', ts: 1700000001000, result: 'pass' },
    ]);
    A.eq('garbage becomes empty', cleaned[0].cls, '');
    A.eq('absent becomes empty', cleaned[1].cls, '');
    A.ok('and NOT the default', cleaned[0].cls !== app.val('ITEM_CLASS_DEFAULT'));
  });

  A.group('13m the backup refuses a file from the future', () => {
    // The direction the version number exists for. A newer file may hold field
    // VALUES this build does not understand, and the validators would collapse
    // each one to a default — which looks like a successful restore and is a
    // silent partial data loss.
    F.resetApp(app);
    A.eq('backupVersion moved to 2', app.val('BACKUP_VERSION'), 2);
    const ok = app.fn('restoreBackupObject')({
      app: 'patgoscan', backupVersion: 99, records: [],
    });
    A.eq('refused', ok, false);
    const fine = app.fn('restoreBackupObject')({
      app: 'patgoscan', backupVersion: 2, records: [],
    });
    A.eq('but the current one is accepted', fine, true);
  });

  A.group('13m2 the readings survive a backup round trip', () => {
    F.resetApp(app);
    st.earthBondValue = '0.11';
    st.insulationValue = '42';
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    const blob = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    st.earthBondValue = 'wiped';
    st.insulationValue = 'wiped';
    st.records = [];
    app.fn('restoreBackupObject')(blob);
    A.eq('the settings came back', st.earthBondValue, '0.11');
    A.eq('and the insulation setting', st.insulationValue, '42');
    A.eq('the record kept what it was written with',
      app.fn('findItemByCode')('A1', null).earthBond, '0.11');
  });

  // -------------------------------------------------------------------------
  // The cell contract
  // -------------------------------------------------------------------------

  A.group('13n ⚠ every cell tolerates a missing ctx', () => {
    // The harness calls cells directly in places, and a cell that throws is a
    // column that comes out empty for every row of the export — the guard in
    // csv.js keeps the file going but says nothing about it.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1' }, 'pass', '');
    let threw = 0;
    SPEC.forEach((c) => {
      try { c.cell(rec); } catch (e) { threw++; }
    });
    A.eq('no column threw without a ctx', threw, 0);
    // ⚠ PAIRED: and they still work WITH one, so this cannot pass on a set of
    // cells that all return '' unconditionally.
    A.eq('and they still produce values with one',
      at(exportRow(1), 'ASSET ID'), 'A1');
  });

  A.group('13n2 an empty ctx is not the same as a first row', () => {
    // ⚠ THE DEFAULT MUST BE "NOT FIRST". A descriptor cell that treated a
    // missing flag as first would put floor and room on EVERY row, silently
    // turning decision 7A into 7C.
    const loc = { mode: INITIAL, floor: 'Ground', room: 'Kitchen' };
    const f = app.fn('csvLocationDescriptor');
    A.eq('no ctx at all', f(undefined, 'room'), '');
    A.eq('ctx with no flag', f({ location: loc }, 'room'), '');
    A.eq('flag false', f({ location: loc, firstForLocationInFile: false }, 'room'), '');
    // ⚠ PAIRED — it does fire when it should.
    A.eq('flag true', f({ location: loc, firstForLocationInFile: true }, 'room'), 'Kitchen');
    // ⚠ AND ONLY STRICTLY TRUE. A truthy test would let a stray string through.
    A.eq('a truthy non-true does not count',
      f({ location: loc, firstForLocationInFile: 'yes' }, 'room'), '');
  });

  // -------------------------------------------------------------------------
  // V6 (13D) — the two loose ends
  // -------------------------------------------------------------------------

  A.group('13o the last item quick view finds the newest ITEM', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'pass', '');
    space();
    A.eq('the newest item', app.fn('lastItemRecord')().code, 'A2');
    // ⚠ A LOCATION SCANNED AFTERWARDS IS NOT "THE LAST THING YOU RECORDED" in
    // the sense the engineer means when they glance down to check what went in.
    app.fn('addLocationRecord')('LOC-2', AUDIT, null);
    st.records[st.records.length - 1].ts = 1700000009000;
    A.eq('still the item, not the location', app.fn('lastItemRecord')().code, 'A2');
  });

  A.group('13o2 the quick view paints, and says nothing when empty', () => {
    F.resetApp(app);
    A.eq('nothing before anything is scanned', app.fn('renderLastItem')(), '');
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1' }, 'pass', '');
    const html = app.fn('renderLastItem')();
    A.includes('the code shows', html, 'A1');
    A.includes('the result shows', html, 'PASS');
    A.includes('edit is reachable', html, 'editLastItem');
    A.includes('undo is reachable', html, 'undoLastItem');
    // ⚠ IT IS ON THE SCAN SCREEN, BELOW THE VERDICT BUTTONS. A destructive
    // control beside FAIL is a different proposition from one a screen away.
    const scan = app.fn('renderScan')();
    A.includes('it is on the scan screen', scan, 'lastitem');
    A.ok('and below the discard button',
      scan.indexOf('cancelPending') === -1 ||
      scan.indexOf('lastitem') > scan.indexOf('cancelPending'));
  });

  A.group('13o3 ⚠ Discard this scan is untouched', () => {
    // The quick view is a TRIAL and must come out in one piece. Folding the
    // discard path into it would make removing it destructive.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('routeScan')('A1');
    const scan = app.fn('renderScan')();
    A.includes('discard is still there', scan, 'cancelPending');
    A.includes('with its own wording', scan, 'Discard this scan');
  });

  A.group('13p log totals count everything, and say so', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'fail', 'Damaged Lead');
    // ⚠ BACKDATED PAST MIDNIGHT. Totals that only ever saw today's records
    // would be indistinguishable from todayCounts() — which is the exact
    // confusion the "all time" label exists to prevent.
    st.records.forEach((r) => { r.ts = 1600000000000; });
    const t = app.fn('logTotals')();
    A.eq('pass', t.pass, 1);
    A.eq('fail', t.fail, 1);
    A.eq('locations', t.locations, 1);
    A.eq('and today sees none of it', app.fn('todayCounts')().total, 0);
    A.includes('the label distinguishes it', app.fn('renderLogTotals')(), 'all time');
  });
};
