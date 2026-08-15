/*
 * 04-log — the record model.
 * (c) 2026 Peter Birchley. All rights reserved.
 */

const A = require('../assert');
const F = require('../fixture');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');

  A.group('04a a scanned location becomes the current one', () => {
    F.resetApp(app);
    const rec = app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    A.eq('current location set', st.currentLocationId, rec.id);
    A.eq('code stored', app.fn('currentLocationCode')(), 'LOC-1');
  });

  A.group('04b re-scanning a location reuses it rather than duplicating', () => {
    // Walking back into the kitchen twice is one place, not two — duplicating
    // it would put two identical rows in the client's export.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addLocationRecord')('LOC-2', AUDIT, null);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    A.eq('three scans, two records', st.records.filter(r => r.type === 'location').length, 2);
    A.eq('back at LOC-1', app.fn('currentLocationCode')(), 'LOC-1');
  });

  A.group('04c an initial over an existing location fills it in', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addLocationRecord')('LOC-1', INITIAL, { client: 'Acme', floor: '2', room: 'Kitchen' });
    const locs = st.records.filter(r => r.type === 'location');
    A.eq('still one record', locs.length, 1);
    A.eq('promoted to initial', locs[0].mode, INITIAL);
    A.eq('room captured', locs[0].room, 'Kitchen');
    A.eq('needs exporting again', locs[0].exported, false);
  });

  A.group('04d items are stamped with BOTH the location id and its barcode', () => {
    // ⚠ The id is how the app finds the record; the CODE is what the client
    // reads. Keeping only the id would let a later edit rewrite history for
    // items logged an hour earlier.
    F.resetApp(app);
    const loc = app.fn('addLocationRecord')('LOC-7', AUDIT, null);
    const item = app.fn('addItemRecord')({ code: 'AST-1', mode: AUDIT }, 'pass', '');
    A.eq('id stamped', item.locationId, loc.id);
    A.eq('code stamped', item.locationCode, 'LOC-7');
  });

  A.group('04e deleting a location does not orphan its items', () => {
    F.resetApp(app);
    const loc = app.fn('addLocationRecord')('LOC-7', AUDIT, null);
    const item = app.fn('addItemRecord')({ code: 'AST-1', mode: AUDIT }, 'pass', '');
    app.fn('deleteRecord')(loc.id);
    const kept = app.fn('recordById')(item.id);
    A.eq('item survives', !!kept, true);
    A.eq('dangling id cleared', kept.locationId, '');
    A.eq('barcode retained — this is what the client reads', kept.locationCode, 'LOC-7');
    A.eq('current location cleared', st.currentLocationId, '');
  });

  A.group('04f the mode is frozen onto the record at scan time', () => {
    // Flipping the toggle must never retro-relabel the morning's work.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const item = app.fn('addItemRecord')({ code: 'AST-1', mode: AUDIT }, 'pass', '');
    st.mode = INITIAL;
    A.eq('record still says audit', app.fn('recordById')(item.id).mode, AUDIT);
  });

  A.group('04g duplicate detection spans the whole log, not one location', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'AST-1', mode: AUDIT }, 'pass', '');
    app.fn('addLocationRecord')('LOC-2', AUDIT, null);
    A.ok('found from another location', !!app.fn('findItemByCode')('AST-1', null));
    A.ok('case insensitive', !!app.fn('findItemByCode')('ast-1', null));
    A.eq('unknown code is not found', app.fn('findItemByCode')('NOPE', null), null);
  });

  A.group('04h replacing a result keeps the original id and timestamp', () => {
    // A correction is one event, not a second event — re-stamping would move it
    // to the end of the day's work in the export.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const first = app.fn('addItemRecord')({ code: 'AST-1', mode: AUDIT, description: 'Kettle', cls: 'I' }, 'pass', '');
    const ts = first.ts;
    app.fn('replaceItemRecord')(first.id, { code: 'AST-1', mode: AUDIT }, 'fail', 'Damaged Lead');
    const after = app.fn('recordById')(first.id);
    A.eq('one record only', st.records.filter(r => r.type === 'item').length, 1);
    A.eq('id unchanged', after.id, first.id);
    A.eq('timestamp unchanged', after.ts, ts);
    A.eq('result updated', after.result, 'fail');
    A.eq('reason updated', after.failReason, 'Damaged Lead');
    A.eq('description carried through', after.description, 'Kettle');
    A.eq('un-exported by the edit', after.exported, false);
  });

  A.group('04i an edit un-exports its record', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const item = app.fn('addItemRecord')({ code: 'AST-1', mode: AUDIT }, 'pass', '');
    item.exported = true;
    app.fn('updateRecordFields')(item.id, { result: 'fail', failReason: 'Damaged Casing' });
    A.eq('goes out again next time', app.fn('recordById')(item.id).exported, false);
  });

  A.group('04j descriptions are learned most-recent-first', () => {
    F.resetApp(app);
    app.fn('learnDescription')('Toaster');
    app.fn('learnDescription')('Kettle');
    A.eq('newest first', st.descriptions[0], 'Kettle');
    app.fn('learnDescription')('Toaster');
    A.eq('re-used rises to the top', st.descriptions[0], 'Toaster');
    A.eq('no duplicate', st.descriptions.filter(d => d === 'Toaster').length, 1);
  });

  A.group('04k description suggestions prefer a prefix match', () => {
    F.resetApp(app);
    st.descriptions = ['Water Cooler', 'Kettle', 'Kitchen Radio'];
    const out = app.fn('suggestDescriptions')('kit');
    A.eq('prefix match first', out[0], 'Kitchen Radio');
  });

  A.group('04l unexported count drives the export nudge', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    A.eq('two unexported', app.fn('unexportedCount')(), 2);
    st.records.forEach(r => { r.exported = true; });
    A.eq('none unexported', app.fn('unexportedCount')(), 0);
  });
  A.group('04m an item knows where it was tested', () => {
    // V2. The log could tell you what was scanned but never where, which made
    // a correction a guess.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', INITIAL,
      { client: 'Acme Ltd', floor: 'Ground', room: 'Staff Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL }, 'pass', '');
    const item = app.fn('itemRecords')()[0];
    A.eq('the full label carries the room and the code',
      app.fn('itemLocationLabel')(item), 'Staff Kitchen · Ground · Acme Ltd (LOC-1)');
    A.eq('the short label is the room alone',
      app.fn('itemLocationShort')(item), 'Staff Kitchen');
  });

  A.group('04n an audit location shows its code once, not twice', () => {
    // An audit-mode location knows only its barcode, so locationLabel() falls
    // back to the code. Appending the code to that would read "LOC-9 (LOC-9)".
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const item = app.fn('itemRecords')()[0];
    A.eq('code appears once', app.fn('itemLocationLabel')(item), 'LOC-9');
  });

  A.group('04o a deleted location leaves the code behind, not a blank', () => {
    // ⚠ RULE 12, AS A TEST. Deleting a location clears locationId off every
    // item under it (the sweep), but never locationCode — the code is a COPY
    // and it is what the client's own register can still resolve. So the label
    // has to degrade to the code rather than to nothing: an item that says
    // "LOC-1" is still placeable, an item that says "" is lost.
    F.resetApp(app);
    const loc = app.fn('addLocationRecord')('LOC-1', INITIAL,
      { client: 'Acme Ltd', floor: 'Ground', room: 'Staff Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL }, 'pass', '');
    app.fn('deleteRecord')(loc.id);
    const item = app.fn('itemRecords')()[0];
    A.eq('the id was swept', item.locationId, '');
    A.eq('but the code survived', item.locationCode, 'LOC-1');
    A.eq('and the label falls back to it',
      app.fn('itemLocationLabel')(item), 'LOC-1');
    A.eq('as does the short form',
      app.fn('itemLocationShort')(item), 'LOC-1');
  });
};
