/*
 * 06-csv — the only thing the client ever sees.
 * (c) 2026 Peter Birchley. All rights reserved.
 */

const A = require('../assert');
const F = require('../fixture');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');
  // ⚠ V5: CSV_COLUMNS IS NOW A LIST OF { key, cell }, NOT A LIST OF STRINGS.
  // Everything below asks for a column BY NAME and never by position, because
  // the whole point of the V5 rewrite is that the client's column order is
  // expected to be rearranged in config.js between releases. A suite that
  // pinned positions would turn red on a reorder that broke nothing, and the
  // reflex fix for a red suite you believe is wrong is to loosen the assertion.
  const SPEC = app.val('CSV_COLUMNS');
  const COLS = SPEC.map(c => c.key);
  function at(cellArr, key) { return cellArr[COLS.indexOf(key)]; }

  function build(onlyNew) { return app.fn('buildCSV')(onlyNew); }
  function rows(text) { return text.split('\r\n'); }
  function cells(row) {
    // Split on '","' after stripping the outer quotes — every cell is quoted.
    return row.slice(1, -1).split('","').map(s => s.replace(/""/g, '"'));
  }

  A.group('06a the header is the client spec, in order', () => {
    F.resetApp(app);
    const r = rows(build(false).text);
    A.eq('header matches CSV_COLUMNS exactly', cells(r[0]), COLS);
    // Order-independent: these columns must EXIST and be unique. Where they sit
    // is the client's business and may change without this file changing.
    ['record_type', 'mode', 'asset_id', 'class_1', 'class_2', 'visual',
     'result', 'location_id', 'scanned_at'].forEach((k) => {
      A.ok(k + ' is a column', COLS.indexOf(k) !== -1);
    });
    A.ok('no duplicate headers', new Set(COLS).size === COLS.length);
    A.ok('the retired single class column is gone', COLS.indexOf('class') === -1);
  });

  A.group('06b every cell is quoted, including safe-looking ones', () => {
    // ⚠ A fail reason is an editable list and an engineer will eventually type
    // "Damaged Lead, replaced". Quoting only the risky fields is how a CSV
    // silently shifts every column right on one row in a thousand.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'fail', 'Damaged Lead, replaced on site');
    const r = rows(build(false).text);
    A.ok('the comma did not split the row', cells(r[2]).length === COLS.length);
    A.eq('reason intact', at(cells(r[2]), 'fail_reason'), 'Damaged Lead, replaced on site');
  });

  A.group('06c an embedded double quote is escaped, not lost', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, description: 'Monitor 24"' }, 'pass', '');
    const r = rows(build(false).text);
    A.eq('quote survives', cells(r[2])[COLS.indexOf('description')], 'Monitor 24"');
  });

  A.group('06d rows come out in scan order, not newest first', () => {
    // ⚠ The client reads this as a walk through the building. A location row
    // must precede the items scanned under it or the file cannot be read
    // sequentially at all.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'pass', '');
    // ⚠ SPACE THE TIMESTAMPS BY HAND. Three records created inside one
    // millisecond all carry the same ts, so any comparator that ties on ts
    // falls through to a random-suffix id and orders them differently on every
    // run. That made this group pass or fail by coin-toss under mutation —
    // flakiness, which is worse than a plain failure because it hides.
    st.records.forEach((rec, i) => { rec.ts = 1700000000000 + i * 1000; });
    const r = rows(build(false).text);
    A.eq('location first', at(cells(r[1]), 'record_type'), 'location');
    A.eq('then A1', at(cells(r[2]), 'asset_id'), 'A1');
    A.eq('then A2', at(cells(r[3]), 'asset_id'), 'A2');
  });

  A.group('06e an audit item row leaves the initial-only columns empty', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', AUDIT, null);
    st.engineer = 'Pete';
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const c = cells(rows(build(false).text)[2]);
    A.eq('type', at(c, 'record_type'), 'item');
    A.eq('mode', at(c, 'mode'), AUDIT);
    A.eq('asset', at(c, 'asset_id'), 'A1');
    A.eq('result', at(c, 'result'), 'pass');
    A.eq('location carried from the sticky location', at(c, 'location_id'), 'LOC-9');
    A.eq('engineer stamped', at(c, 'engineer'), 'Pete');
    A.eq('description empty on an audit', at(c, 'description'), '');
    A.eq('client empty on an item row', at(c, 'client'), '');
  });

  A.group('06f an initial item row carries description and class', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A2', mode: INITIAL, description: 'Kettle', cls: 'II' }, 'pass', '');
    const c = cells(rows(build(false).text)[2]);
    A.eq('mode', at(c, 'mode'), INITIAL);
    A.eq('description', at(c, 'description'), 'Kettle');
    A.eq('the id lands in the class_2 column', at(c, 'class_2'), 'A2');
    A.eq('and not in class_1', at(c, 'class_1'), '');
  });

  A.group('06g an initial location row carries client, floor and room', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-3', INITIAL, { client: 'Acme', floor: '2', room: 'Kitchen' });
    const c = cells(rows(build(false).text)[1]);
    A.eq('type', at(c, 'record_type'), 'location');
    A.eq('location id is the barcode', at(c, 'location_id'), 'LOC-3');
    A.eq('client', at(c, 'client'), 'Acme');
    A.eq('floor', at(c, 'floor'), '2');
    A.eq('room', at(c, 'room'), 'Kitchen');
    A.eq('no asset id on a location row', at(c, 'asset_id'), '');
  });

  A.group('06h "new only" excludes what has already gone out', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    st.records.forEach(r => { r.exported = true; });
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'pass', '');
    A.eq('only the new one', build(true).count, 1);
    A.eq('everything for a full export', build(false).count, 3);
  });

  A.group('06i marking exported does not delete anything', () => {
    // ⚠ Decision 8A. Six engineers exporting daily will at some point export to
    // a folder that has not finished syncing, and the only recovery is that the
    // data is still on the phone.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const before = st.records.length;
    app.fn('markExported')(st.records.slice());
    A.eq('nothing removed', st.records.length, before);
    A.eq('all flagged', app.fn('unexportedCount')(), 0);
  });

  A.group('06j the filename carries the date and the engineer', () => {
    F.resetApp(app);
    st.engineer = 'Pete Birchley';
    const name = app.fn('exportFilename')();
    A.ok('starts patgoscan-', name.indexOf('patgoscan-') === 0);
    A.ok('engineer folded in safely', name.indexOf('Pete-Birchley') !== -1);
    A.ok('no spaces', name.indexOf(' ') === -1);
    A.ok('csv extension', /\.csv$/.test(name));
  });

  A.group('06k a timestamp is local, not UTC', () => {
    // toISOString() would export an 08:15 scan as 07:15 in British summer time —
    // wrong on a timesheet and unexplainable to the client.
    // ⚠ M43 SURVIVED on the time alone — a mutation that swapped only the DATE
    // half for a UTC one left '08:15:00' intact and the assertion green. Pin
    // the WHOLE string: a date that rolls back a day at 00:30 BST is the same
    // bug as an hour that shifts.
    const s = app.fn('stampLocal')(new Date(2026, 6, 1, 8, 15, 0).getTime());
    A.eq('exact local stamp', s, '2026-07-01 08:15:00');
    A.ok('no Z suffix', s.indexOf('Z') === -1);
    // Midnight-adjacent in BST is where a UTC date silently rolls back a day.
    const midnight = app.fn('stampLocal')(new Date(2026, 6, 2, 0, 30, 0).getTime());
    A.eq('date does not roll back', midnight, '2026-07-02 00:30:00');
  });
};
