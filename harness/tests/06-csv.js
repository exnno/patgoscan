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
    const r = rows(build().text);
    A.eq('header matches CSV_COLUMNS exactly', cells(r[0]), COLS);
    // Order-independent: these columns must EXIST and be unique. Where they sit
    // is the client's business and may change without this file changing.
    // ⚠ V6 RE-POINTED THIS LIST WHOLESALE. Nine of the fifteen V5 columns are
    // gone; keeping the old names here would have pinned a file the client no
    // longer accepts. Re-point, never delete — the group still guards the same
    // property.
    ['ASSET ID', 'CLASS', 'VISUAL', 'OPERATIONAL', 'EARTH BOND', 'INSULATION',
     'DESCRIPTION', 'LOCATION ID', 'FLOOR', 'ROOM', 'DATE', 'NOTES',
     'ENGINEER'].forEach((k) => {
      A.ok(k + ' is a column', COLS.indexOf(k) !== -1);
    });
    A.eq('thirteen columns and no more', COLS.length, 13);
    A.ok('no duplicate headers', new Set(COLS).size === COLS.length);
    // ⚠ THE RETIRED COLUMNS MUST BE GONE, not merely unused. A leftover
    // `record_type` would sit in the client's file as an unexplained extra
    // column their importer either rejects or silently maps onto something.
    ['record_type', 'mode', 'class', 'class_1', 'class_2', 'result',
     'fail_reason', 'client', 'scanned_at', 'asset_id'].forEach((k) => {
      A.ok('the retired ' + k + ' column is gone', COLS.indexOf(k) === -1);
    });
  });

  A.group('06b every cell is quoted, including safe-looking ones', () => {
    // ⚠ A fail reason is an editable list and an engineer will eventually type
    // "Damaged Lead, replaced". Quoting only the risky fields is how a CSV
    // silently shifts every column right on one row in a thousand.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'fail', 'Damaged Lead, replaced on site');
    const r = rows(build().text);
    A.ok('the comma did not split the row', cells(r[1]).length === COLS.length);
    A.eq('reason intact in NOTES', at(cells(r[1]), 'NOTES'), 'Damaged Lead, replaced on site');
  });

  A.group('06c an embedded double quote is escaped, not lost', () => {
    // ⚠ V6: INITIAL, not AUDIT. Description is now written on initial rows only
    // (decision 9A), so an audit row would have carried an empty cell and this
    // group would have proven nothing about quoting.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Monitor 24"' }, 'pass', '');
    const r = rows(build().text);
    A.eq('quote survives', at(cells(r[1]), 'DESCRIPTION'), 'Monitor 24"');
  });

  A.group('06d rows come out in scan order, not newest first', () => {
    // ⚠ V6: THE ORDER STILL MATTERS THOUGH LOCATIONS NO LONGER EMIT A ROW. It
    // is what decides which item row carries a location's floor and room — the
    // first one scanned there.
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
    const r = rows(build().text);
    A.eq('two item rows and a header', r.length, 3);
    A.eq('A1 first', at(cells(r[1]), 'ASSET ID'), 'A1');
    A.eq('then A2', at(cells(r[2]), 'ASSET ID'), 'A2');
  });

  A.group('06e an audit item row leaves the initial-only columns empty', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', AUDIT, null);
    st.engineer = 'Pete';
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, description: 'Kettle' }, 'pass', '');
    const c = cells(rows(build().text)[1]);
    A.eq('asset', at(c, 'ASSET ID'), 'A1');
    A.eq('visual outcome', at(c, 'VISUAL'), 'PASS');
    A.eq('operational outcome', at(c, 'OPERATIONAL'), 'PASS');
    A.eq('location carried from the sticky location', at(c, 'LOCATION ID'), 'LOC-9');
    A.eq('engineer stamped', at(c, 'ENGINEER'), 'Pete');
    // ⚠ THE RECORD HAS A DESCRIPTION AND THE COLUMN IS STILL EMPTY. That is
    // decision 9A and it is the point of the group: an audit row must not carry
    // one even when the app knows it, because the client's register already
    // holds it. Testing a record with no description would have proven nothing.
    A.eq('description withheld on an audit', at(c, 'DESCRIPTION'), '');
    A.eq('floor empty — the location was audited, not initialised', at(c, 'FLOOR'), '');
    A.eq('room likewise', at(c, 'ROOM'), '');
    A.eq('no fail reason on a pass', at(c, 'NOTES'), '');
  });

  A.group('06f an initial item row carries description and class', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A2', mode: INITIAL, description: 'Kettle', cls: '2' }, 'pass', '');
    const c = cells(rows(build().text)[1]);
    A.eq('description', at(c, 'DESCRIPTION'), 'Kettle');
    A.eq('class as the client writes it', at(c, 'CLASS'), '2');
    A.eq('asset id in its own column and nowhere else', at(c, 'ASSET ID'), 'A2');
  });

  A.group('06g a location emits no row of its own', () => {
    // ⚠ V6 REVERSED THIS GROUP (decision 8A). It used to assert that a location
    // row carried client, floor and room. The client's own sample has no
    // location rows at all, so the same group now guards the opposite claim —
    // and the floor and room it used to check now ride on an item row instead,
    // which 13-columns proves.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-3', INITIAL, { client: 'Acme', floor: '2', room: 'Kitchen' });
    const built = build();
    A.eq('nothing to export from a location alone', built.count, 0);
    A.eq('header only', rows(built.text).length, 1);
    // ⚠ AND THE LOCATION IS STILL IN THE LOG. Emitting no row is not the same
    // as not being recorded — the room is what the first item scanned there
    // will carry.
    A.eq('the location record exists', st.records.length, 1);
  });

  A.group('06h ⚠ V7 — EXPORT DOES NOT EXCLUDE WHAT HAS ALREADY GONE OUT (3B)', () => {
    // ⚠ THIS GROUP ASSERTED THE OPPOSITE UNTIL V7 AND THE REVERSAL IS THE
    // DECISION, not a regression. Export used to send unexported records only,
    // which made a re-export a handful of loose corrections; it now sends the
    // whole of the current session every time, so the client receives a
    // complete batch they can drop straight in. Their importer treats a
    // repeated asset id as an update, so a row that has not changed costs
    // nothing and a row that has is the entire point.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    st.records.forEach(r => { r.exported = true; });
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'pass', '');
    // ⚠ V6: `count` IS ITEM ROWS, NOT RECORDS. A location contributes nothing
    // to the file, so counting it would make the toast promise the client a row
    // that is not in there.
    A.eq('⚠ the exported one comes out again', build().count, 2);
    A.eq('the location still counts for nothing', build().records.length, 3);
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

  A.group('06k2 the DATE column is dd/MM/yyyy and local', () => {
    // ⚠ NOT stampLocal() TRUNCATED. That is ISO order and this is not — slicing
    // one to make the other silently produces an American reading on any day
    // where day and month could swap. Pinned on a date where they CANNOT be
    // confused either way would prove nothing, so 03/04 is used deliberately.
    const d = app.fn('dateOnlyLocal')(new Date(2026, 3, 3, 14, 0, 0).getTime());
    A.eq('day first, zero padded', d, '03/04/2026');
    A.ok('no time component', d.indexOf(':') === -1);
    // Midnight-adjacent in BST is where a UTC date rolls back a day.
    A.eq('date does not roll back at 00:30',
      app.fn('dateOnlyLocal')(new Date(2026, 6, 2, 0, 30, 0).getTime()), '02/07/2026');
    A.eq('nor forward at 23:30',
      app.fn('dateOnlyLocal')(new Date(2026, 6, 2, 23, 30, 0).getTime()), '02/07/2026');
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
