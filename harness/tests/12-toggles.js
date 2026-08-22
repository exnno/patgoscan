/*
 * 12-toggles — V5. The two persistent switches, and the column spec that
 * turned CSV_COLUMNS from a list of names into the whole specification.
 *
 * ⚠ V6 RE-POINTED THIS FILE RATHER THAN REPLACING IT. Nine of the fifteen
 * columns it was written against are retired, and several groups now guard the
 * OPPOSITE of what they originally claimed — 12d (the id no longer repeats),
 * 12g (a class 2 row carries no earth bond where it used to carry an id). The
 * group names and numbers are kept so the mutation ids that point at them stay
 * meaningful. The rule is the same as for mutations: re-point, never delete.
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * ⚠ THE QUESTION TO ASK OF EVERY ASSERTION HERE: could this pass on broken
 * code? Two shapes are specific to this release and both are easy to get wrong:
 *
 *   1. A boolean that defaults to false is INDISTINGUISHABLE from a boolean
 *      that is never written at all. "visual is false" passes on an app that
 *      dropped the field entirely. Every negative assertion below is paired
 *      with a positive one that had to travel the same path.
 *
 *   2. Reading state directly proves nothing about the ACTION that sets it.
 *      Setting st.visualMode by hand and then checking a record is a test of
 *      the record writer, not of the toggle. The groups that matter go through
 *      ACTIONS, which is the surface a tap actually reaches.
 */

const A = require('../assert');
const F = require('../fixture');
const L = require('../load');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');
  const SPEC = app.val('CSV_COLUMNS');
  const COLS = SPEC.map(c => c.key);

  function act(name, arg) { return app.val('ACTIONS')[name](arg); }
  function rows(text) { return text.split('\r\n'); }
  function cells(row) { return row.slice(1, -1).split('","').map(s => s.replace(/""/g, '"')); }
  function at(cellArr, key) { return cellArr[COLS.indexOf(key)]; }
  function exportCells(n) { return cells(rows(app.fn('buildCSV')().text)[n]); }

  // -------------------------------------------------------------------------
  // The column spec itself
  // -------------------------------------------------------------------------

  A.group('12a every column is a { key, cell } pair with a callable cell', () => {
    // ⚠ This is the guard on a HAND EDIT. The list is expected to be rearranged
    // in config.js between releases, and a reorder that drops a comma produces
    // a column with no cell function — which does not stop the app booting, it
    // stops the export, at the end of a day's work.
    A.ok('it is a non-empty array', Array.isArray(SPEC) && SPEC.length > 0);
    let bad = 0;
    SPEC.forEach((c) => {
      if (!c || typeof c.key !== 'string' || !c.key) bad++;
      else if (typeof c.cell !== 'function') bad++;
    });
    A.eq('no malformed columns', bad, 0);
    A.ok('boot agrees', app.fn('_csvColumnsWellFormed')() === true);
  });

  A.group('12a2 the boot guard REJECTS a broken column list', () => {
    // ⚠ M110 SURVIVED THE FIRST RUN because 12a only ever showed the guard a
    // GOOD list — and a guard that returns true unconditionally passes that
    // perfectly. A validator has to be shown something invalid or it is not
    // being tested at all. This mutates the real CSV_COLUMNS and puts it back,
    // because a locally-built array would test a copy of the guard's input and
    // not the constant the app actually exports.
    const good = SPEC.slice();
    const victim = SPEC[SPEC.length - 1];
    const original = victim.cell;

    victim.cell = 'not a function';
    A.ok('a column with no cell function is rejected',
      app.fn('_csvColumnsWellFormed')() === false);
    A.ok('and the whole boot check fails with it',
      app.fn('_constantsPresent')() === false);
    victim.cell = original;

    const dupKey = SPEC[0].key;
    SPEC.push({ key: dupKey, cell: () => '' });
    A.ok('a duplicate header is rejected', app.fn('_csvColumnsWellFormed')() === false);
    SPEC.pop();

    SPEC.length = 0;
    A.ok('an empty list is rejected', app.fn('_csvColumnsWellFormed')() === false);
    good.forEach(c => SPEC.push(c));

    A.ok('and it is healthy again afterwards',
      app.fn('_csvColumnsWellFormed')() === true);
    A.eq('with every column restored', SPEC.length, good.length);
  });

  A.group('12b a cell that throws does not take the export with it', () => {
    // The export is the only thing the client ever sees. One bad column must
    // cost one empty cell, not the whole day's file.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT }, 'pass', '');
    const victim = SPEC[SPEC.length - 1];
    const original = victim.cell;
    victim.cell = () => { throw new Error('boom'); };
    let built = null;
    try { built = app.fn('buildCSV')(); } catch (e) { built = null; }
    victim.cell = original;
    A.ok('the file was still produced', built !== null);
    A.eq('with every row present', built.count, 1);
    A.eq('the failed cell is empty', at(cells(rows(built.text)[1]), victim.key), '');
  });

  A.group('12c the header and the body cannot disagree about width', () => {
    // The V4 arrangement held the order three times over. This asserts the
    // property that made that dangerous: every row is exactly as wide as the
    // header, on both record types.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', INITIAL, { client: 'Acme', floor: '1', room: 'Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle', cls: '1' }, 'pass', '');
    const r = rows(app.fn('buildCSV')().text);
    // ⚠ V6: TWO, NOT THREE. The location contributes no row of its own — its
    // floor and room ride on the item below it instead (decision 8A).
    A.eq('a header and one item row', r.length, 2);
    r.forEach((line, i) => {
      A.eq('row ' + i + ' is the full width', cells(line).length, COLS.length);
    });
  });

  // -------------------------------------------------------------------------
  // Where the id lands
  // -------------------------------------------------------------------------

  A.group('12d the asset id lands in ASSET ID and nowhere else', () => {
    // ⚠ V6 RE-POINTED THIS GROUP. Under V5 the id was REPEATED into a class
    // column (decision 1A) and this group proved the repeat. V6 stores the
    // class as its own value (decision 1B), so the same group now guards the
    // opposite: the id appears once, and the class column holds a class.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1' }, 'pass', '');
    const c = exportCells(1);
    A.eq('ASSET ID carries it', at(c, 'ASSET ID'), 'A1');
    A.eq('CLASS carries a class, not an id', at(c, 'CLASS'), '1');
    let repeats = 0;
    COLS.forEach((k) => { if (at(c, k) === 'A1') repeats++; });
    A.eq('the id appears in exactly one column', repeats, 1);
  });

  A.group('12e decision 3B — a visual inspection passes BOTH outcome columns', () => {
    // ⚠ THE CENTRAL DECISION OF THIS RELEASE, and the one most likely to be
    // "tidied up" by someone who reads the export and assumes the duplication
    // is a bug. A visual-only item writes PASS into VISUAL *and* OPERATIONAL.
    // What separates it from a full test is that the READINGS are empty — and
    // nothing else in the file says so.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: true }, 'pass', '');
    const c = exportCells(1);
    A.eq('VISUAL passes', at(c, 'VISUAL'), 'PASS');
    A.eq('OPERATIONAL passes too', at(c, 'OPERATIONAL'), 'PASS');
    A.eq('no earth bond reading', at(c, 'EARTH BOND'), '');
    A.eq('no insulation reading', at(c, 'INSULATION'), '');
    A.eq('and the class is still stated', at(c, 'CLASS'), '1');
  });

  A.group('12f a TESTED item is told apart only by its readings', () => {
    // Paired with 12e on purpose — see the note at the top of this file. On its
    // own, "the readings are filled" would pass on a build that had lost the
    // visual flag entirely and was filling them for everything. The two groups
    // travel the same path and differ in one input.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    const c = exportCells(1);
    A.eq('VISUAL passes, same as a visual-only item', at(c, 'VISUAL'), 'PASS');
    A.eq('OPERATIONAL passes, same again', at(c, 'OPERATIONAL'), 'PASS');
    A.eq('but the earth bond reading is there', at(c, 'EARTH BOND'), app.val('EARTH_BOND_DEFAULT'));
    A.eq('and the insulation reading with it', at(c, 'INSULATION'), app.val('INSULATION_DEFAULT'));
  });

  A.group('12g ⚠ a CLASS 2 item never carries an earth bond reading', () => {
    // A Class II appliance has no earth to bond. A value here claims a test
    // that cannot physically be performed — the single most consequential rule
    // in the export, and the client's own sample is empty in every Class 2 row.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '2', visual: false }, 'pass', '');
    const c = exportCells(1);
    A.eq('earth bond empty', at(c, 'EARTH BOND'), '');
    // ⚠ PAIRED. Without this, the group would pass on a build that had stopped
    // writing readings altogether.
    A.eq('but insulation IS recorded', at(c, 'INSULATION'), app.val('INSULATION_DEFAULT'));
    A.eq('and it is genuinely a class 2 row', at(c, 'CLASS'), '2');
  });

  // -------------------------------------------------------------------------
  // The toggles, through ACTIONS
  // -------------------------------------------------------------------------

  A.group('12h setVisual and setClass write through to a scanned item', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    act('setClass', '2');
    act('setVisual', 'visual');
    A.eq('class toggle moved', st.itemClass, '2');
    A.eq('visual toggle moved', st.visualMode, true);
    app.fn('routeScan')('A1');
    A.ok('an item is pending', !!st.pending);
    A.eq('pending took the class', st.pending.cls, '2');
    A.eq('pending took visual', st.pending.visual, true);
    app.fn('commitResult')('pass', '');
    const rec = app.fn('findItemByCode')('A1', null);
    A.eq('the record carries the class', rec.cls, '2');
    A.eq('the record carries visual', rec.visual, true);
  });

  A.group('12i ⚠ a phone that has never set a toggle boots as TESTED, Class 1', () => {
    // ⚠ M96 SURVIVED THE FIRST RUN, and the reason is worth keeping. This group
    // used to read st.visualMode straight after resetApp — but the FIXTURE sets
    // that field to false itself, so the assertion was reading the fixture's
    // own handiwork and would have passed on any default the app chose. The
    // claim is about an EMPTY localStorage, so the storage has to be empty and
    // load() has to be the thing that runs.
    F.resetApp(app);
    app.storage.clear();
    app.fn('load')();
    A.eq('class defaults to 1', st.itemClass, app.val('ITEM_CLASS_DEFAULT'));
    A.eq('visual defaults OFF', st.visualMode, false);
    // And the opposite direction, so this cannot pass by the flag being absent:
    // a stored '1' must come back as true through the same path.
    app.storage.setItem(app.val('VISUAL_KEY'), '1');
    app.fn('load')();
    A.eq('an explicit 1 turns it on', st.visualMode, true);
    app.storage.clear();
    app.fn('load')();
    A.eq('and clearing puts it back off', st.visualMode, false);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('routeScan')('A1');
    app.fn('commitResult')('pass', '');
    const rec = app.fn('findItemByCode')('A1', null);
    A.eq('class 1', rec.cls, '1');
    A.eq('not visual', rec.visual, false);
  });

  A.group('12j ⚠ changing a toggle while an item is PENDING updates it', () => {
    // Without this the only way to fix a wrong switch is to discard the scan,
    // and the realistic alternative mid-corridor is pressing PASS anyway.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('routeScan')('A1');
    A.eq('starts not visual', st.pending.visual, false);
    act('setVisual', 'visual');
    A.eq('the pending item followed', st.pending.visual, true);
    act('setClass', '2');
    A.eq('and the class followed', st.pending.cls, '2');
    app.fn('commitResult')('pass', '');
    const c = exportCells(1);
    A.eq('the export got the corrected class', at(c, 'CLASS'), '2');
    // The corrected Visual shows as the ABSENCE of readings — under decision 3B
    // that is the only place in the file it appears.
    A.eq('and the corrected visual, as an empty insulation cell', at(c, 'INSULATION'), '');
  });

  A.group('12k the toggles survive a reload', () => {
    // Decision 7A. Goes through save + load rather than reading state, because
    // sticky-across-restarts is a claim about storage, not about a variable.
    F.resetApp(app);
    act('setClass', '2');
    act('setVisual', 'visual');
    app.fn('load')();
    A.eq('class came back', st.itemClass, '2');
    A.eq('visual came back', st.visualMode, true);
    act('setVisual', 'test');
    app.fn('load')();
    A.eq('and back off again', st.visualMode, false);
  });

  A.group('12l an unrecognised stored class falls back, never blank', () => {
    // A two-position switch has no third position to show. A blank would paint
    // neither segment as on, and the engineer would have no idea what is set.
    F.resetApp(app);
    A.eq('garbage', app.fn('normaliseItemClass')('III'), app.val('ITEM_CLASS_DEFAULT'));
    A.eq('empty', app.fn('normaliseItemClass')(''), app.val('ITEM_CLASS_DEFAULT'));
    A.eq('undefined', app.fn('normaliseItemClass')(undefined), app.val('ITEM_CLASS_DEFAULT'));
    A.eq('a good one survives', app.fn('normaliseItemClass')('2'), '2');
  });

  // -------------------------------------------------------------------------
  // Decision 6 — audit items now carry a class
  // -------------------------------------------------------------------------

  A.group('12m ⚠ the toggle beats an earlier record on an audit re-scan', () => {
    // Before V5 an audit re-scan inherited cls from the earlier initial, since
    // that was the only way an audit item could have one. Now the toggle is the
    // engineer's live statement and it wins — otherwise the switch is silently
    // inert on exactly the items most likely to need correcting.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    act('setClass', '1');
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle', cls: '2' }, 'pass', '');
    st.mode = AUDIT;
    act('setClass', '1');
    app.fn('routeScan')('A1');
    // ⚠ THROUGH THE SHEET THE APP BUILT, not through a state field. `state`
    // declares a `confirmSheet` slot but openConfirmSheet() never assigns it —
    // the sheets are held in the DOM, not in state — so reading it here would
    // have been a test of nothing. Confirm is reached the way a thumb reaches
    // it: find the button in the open sheet and click it.
    const dupSheet = F.openSheetEl(app);
    A.ok('a confirm sheet was raised', !!dupSheet);
    A.ok('and it names the asset', dupSheet.innerHTML.indexOf('A1') !== -1);
    dupSheet.querySelector('#sheet-ok').onclick();
    A.eq('the pending item took the TOGGLE, not the old record', st.pending.cls, '1');
    A.eq('but kept the description already captured', st.pending.description, 'Kettle');
  });

  A.group('12n an audit item exports into a class column', () => {
    // Decision 6. Before V5 an audit row left the class column empty unless it
    // had inherited one, which is the mistake this release corrects.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    act('setClass', '2');
    app.fn('routeScan')('A1');
    app.fn('commitResult')('pass', '');
    const c = exportCells(1);
    // ⚠ V6: `mode` IS NO LONGER A COLUMN. It is expressed by what the row
    // carries instead — an audit row withholds its description (decision 9A) —
    // so the claim is checked through that rather than dropped.
    A.eq('an audit row states no description', at(c, 'DESCRIPTION'), '');
    A.eq('and the class is still stated', at(c, 'CLASS'), '2');
  });

  // -------------------------------------------------------------------------
  // Correction
  // -------------------------------------------------------------------------

  A.group('12o ⚠ the edit sheet can turn visual OFF as well as on', () => {
    // The dangerous direction. `if (fields.visual)` would make the flag one-way
    // and leave a full test recorded as visual-only for good.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: true }, 'pass', '');
    A.eq('starts visual', rec.visual, true);
    app.fn('updateRecordFields')(rec.id, { visual: false, result: 'pass' });
    A.eq('turned off', app.fn('recordById')(rec.id).visual, false);
    // Un-ticking Visual means the item WAS tested, so the readings appear.
    A.eq('and the readings arrived', at(exportCells(1), 'INSULATION'), app.val('INSULATION_DEFAULT'));
    app.fn('updateRecordFields')(rec.id, { visual: true, result: 'pass' });
    A.eq('and on again', app.fn('recordById')(rec.id).visual, true);
  });

  A.group('12p a field the caller never mentions is left alone', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: true }, 'pass', '');
    app.fn('updateRecordFields')(rec.id, { description: 'Kettle', result: 'pass' });
    A.eq('visual untouched', app.fn('recordById')(rec.id).visual, true);
    A.eq('description applied', app.fn('recordById')(rec.id).description, 'Kettle');
  });

  A.group('12q a correction un-exports its record, as ever', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1' }, 'pass', '');
    app.fn('markExported')(st.records.slice());
    A.eq('exported', app.fn('recordById')(rec.id).exported, true);
    app.fn('updateRecordFields')(rec.id, { visual: true, result: 'pass' });
    A.eq('goes out again', app.fn('recordById')(rec.id).exported, false);
  });

  // -------------------------------------------------------------------------
  // Restore
  // -------------------------------------------------------------------------

  A.group('12r ⚠ a pre-V5 record restores as TESTED, never as visual', () => {
    // Every record written before this release was a full test. Absent must
    // mean false — a visual recorded as a test understates the work, but a test
    // recorded as visual-only claims work that was never done.
    F.resetApp(app);
    const cleaned = app.fn('normaliseRecords')([
      { id: 'itm_old', type: 'item', mode: AUDIT, code: 'A1', ts: 1700000000000,
        result: 'pass', description: 'Kettle', cls: '1' },
    ]);
    A.eq('one record survived', cleaned.length, 1);
    A.eq('visual present and false', cleaned[0].visual, false);
    A.ok('the key exists rather than being absent', 'visual' in cleaned[0]);
  });

  A.group('12s a hand-edited backup cannot smuggle in a truthy visual', () => {
    const cleaned = app.fn('normaliseRecords')([
      { id: 'i1', type: 'item', mode: AUDIT, code: 'A1', ts: 1, result: 'pass', visual: 'yes' },
      { id: 'i2', type: 'item', mode: AUDIT, code: 'A2', ts: 2, result: 'pass', visual: 1 },
      { id: 'i3', type: 'item', mode: AUDIT, code: 'A3', ts: 3, result: 'pass', visual: true },
    ]);
    A.eq('a string is not true', cleaned[0].visual, false);
    A.eq('a number is not true', cleaned[1].visual, false);
    A.eq('but a real true survives', cleaned[2].visual, true);
  });

  // -------------------------------------------------------------------------
  // The screen
  // -------------------------------------------------------------------------

  A.group('12t both toggles paint, and only the set position is on', () => {
    F.resetApp(app);
    act('setClass', '2');
    act('setVisual', 'test');
    // ⚠ M111 SURVIVED THE FIRST RUN. This called renderScanToggles() directly,
    // which proves the builder works and says NOTHING about whether renderScan
    // ever calls it — the exact defect the harness README records against
    // PATGo, which shipped three releases with initScanner() never called. The
    // toggles are now read off the scan screen itself.
    const html = app.fn('renderScan')();
    A.ok('a class row', html.indexOf('setClass') !== -1);
    A.ok('an inspection row', html.indexOf('setVisual') !== -1);
    A.ok('and they are on the screen, not just buildable',
      html.indexOf('togswitch') !== -1);
    A.ok('Class 2 is pressed', /data-arg="2"[^>]*aria-pressed="true"/.test(html));
    A.ok('Class 1 is not', /data-arg="1"[^>]*aria-pressed="false"/.test(html));
    A.ok('Test is pressed', /data-arg="test"[^>]*aria-pressed="true"/.test(html));
    A.ok('Visual is not', /data-arg="visual"[^>]*aria-pressed="false"/.test(html));
  });

  A.group('12u ⚠ visual colours in; test does not — the asymmetry is the point', () => {
    F.resetApp(app);
    act('setVisual', 'test');
    const off = app.fn('renderScan')();
    A.ok('no warning state while testing', off.indexOf('is-visual') === -1);
    act('setVisual', 'visual');
    const on = app.fn('renderScan')();
    A.ok('the row flags itself', on.indexOf('is-visual') !== -1);
    A.ok('and the segment carries the warn class', on.indexOf('is-warn') !== -1);
  });

  A.group('12v the pending panel calls out visual before the verdict', () => {
    // The top of the screen is set once and then stops being looked at. This
    // panel is under the engineer's eyes at the moment they commit a result.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    act('setVisual', 'visual');
    app.fn('routeScan')('A1');
    const html = app.fn('renderScan')();
    A.ok('called out', html.indexOf('VISUAL INSPECTION ONLY') !== -1);
    A.ok('and PASS is still on the same screen', html.indexOf('>PASS<') !== -1);
    act('setVisual', 'test');
    const quiet = app.fn('renderScan')();
    A.ok('nothing shouted while testing', quiet.indexOf('VISUAL INSPECTION ONLY') === -1);
  });

  A.group('12w the log marks a visual item and stays quiet on a tested one', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: true }, 'pass', '');
    A.ok('marked', app.fn('renderLogListHTML')().indexOf('Visual') !== -1);
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    A.ok('not marked', app.fn('renderLogListHTML')().indexOf('Visual') === -1);
  });

  A.group('12x the new item sheet no longer asks for a class', () => {
    // Decision 5. ⚠ Asserted as ABSENCE PLUS PRESENCE: the class control is
    // gone, and the standing line that replaced it is there. Absence alone
    // would pass on a sheet that failed to render at all.
    F.resetApp(app);
    act('setClass', '2');
    act('setVisual', 'visual');
    app.fn('openNewItemSheet')('A1');
    const sheet = F.openSheetEl(app);
    const html = sheet ? sheet.innerHTML : '';
    A.ok('the sheet element exists', !!sheet);
    A.ok('the sheet rendered', html.indexOf('A1') !== -1);
    A.ok('no class picker', html.indexOf('ni-class') === -1);
    A.ok('but it states the class', html.indexOf('Class 2') !== -1);
    A.ok('and states visual', html.indexOf('visual inspection only') !== -1);
    A.ok('description still asked for', html.indexOf('ni-desc') !== -1);
  });

  // -------------------------------------------------------------------------
  // Gaps found by the first mutation run. Each of these exists because a
  // mutation SURVIVED — the assertion above it looked reasonable and tested
  // nothing. See the note on each.
  // -------------------------------------------------------------------------

  A.group('12y ⚠ a re-scan can clear Visual as well as set it', () => {
    // ⚠ M93 SURVIVED. 12o covers updateRecordFields (the edit sheet) but
    // nothing covered replaceItemRecord (the duplicate re-scan), and the two
    // write the flag by different routes. A guard like `if (pending.visual)`
    // there makes the flag one-way: an item marked visual by mistake could
    // never be corrected by simply testing it properly and scanning it again —
    // which is the obvious thing an engineer would do.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const rec = app.fn('addItemRecord')(
      { code: 'A1', mode: AUDIT, cls: '1', visual: true }, 'pass', '');
    A.eq('starts visual', rec.visual, true);
    const back = app.fn('replaceItemRecord')(
      rec.id, { code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    A.eq('a proper test clears it', back.visual, false);
    A.eq('and the readings arrive with it', at(exportCells(1), 'INSULATION'), app.val('INSULATION_DEFAULT'));
    const again = app.fn('replaceItemRecord')(
      rec.id, { code: 'A1', mode: AUDIT, cls: '1', visual: true }, 'pass', '');
    A.eq('and it can go back on', again.visual, true);
    A.eq('same record throughout', again.id, rec.id);
  });

  A.group('12z ⚠ the edit sheet keeps Visual across a trip to another sheet', () => {
    // ⚠ M115 SURVIVED TWICE, and the second time is the instructive one. The
    // first attempt handed openEditSheet a draft built BY THE TEST — which
    // proves the sheet can read a draft and says nothing about whether
    // snapshot() ever puts `visual` into one. Only the real round trip touches
    // snapshot(): tick Visual, tap Change next to Location, back out of the
    // picker, and see whether the tick is still there.
    //
    // This is the V4 lesson repeated. Opening the picker DESTROYS the edit
    // sheet, so the draft is the only thing carrying an unsaved edit across —
    // and Visual sits one row from Location, so the two get touched together.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', INITIAL, { client: 'Acme', floor: '1', room: 'Corridor' });
    const rec = app.fn('addItemRecord')(
      { code: 'A1', mode: INITIAL, description: 'Site Kettle', cls: '1', visual: false }, 'pass', '');

    app.fn('openEditSheet')(rec.id, null);
    let sheet = F.openSheetEl(app);
    A.ok('the edit sheet opened', !!sheet);
    A.ok('with an inspection row', sheet.innerHTML.indexOf('ed-visual') !== -1);

    // The description box is a stub input; its value is set the way typing sets
    // it, so snapshot() has something real to carry.
    sheet.querySelector('#ed-desc').value = 'Site Kettle';

    // Tick Visual through the delegated handler the sheet actually built.
    const visRow = sheet.querySelector('#ed-visual');
    const visBtn = F.tapTarget(app, 'class-opt', { 'data-vis': '1' });
    visBtn.parentNode = visRow;
    visRow.dispatch('click', { target: visBtn });

    // Now leave for the location picker and come straight back out of it.
    sheet.querySelector('#ed-locchange').onclick();
    const picker = F.openSheetEl(app);
    A.ok('the picker opened over it', !!picker);
    picker.querySelector('#lp-cancel').onclick();

    sheet = F.openSheetEl(app);
    A.ok('we are back on the edit sheet', !!sheet && sheet.innerHTML.indexOf('ed-visual') !== -1);
    const seg = sheet.innerHTML.slice(sheet.innerHTML.indexOf('ed-visual'));
    A.ok('Visual survived the round trip',
      /class="class-opt is-on" data-vis="1"/.test(seg));
    A.ok('and so did the description', sheet.innerHTML.indexOf('Site Kettle') !== -1);

    // ⚠ THE PAIRED HALF. Without it this passes on a sheet that paints every
    // segment as on. Untick, round trip again, and the tick must stay off.
    const visRow2 = sheet.querySelector('#ed-visual');
    const testBtn = F.tapTarget(app, 'class-opt', { 'data-vis': '0' });
    testBtn.parentNode = visRow2;
    visRow2.dispatch('click', { target: testBtn });
    sheet.querySelector('#ed-locchange').onclick();
    F.openSheetEl(app).querySelector('#lp-cancel').onclick();
    const back = F.openSheetEl(app).innerHTML;
    const seg2 = back.slice(back.indexOf('ed-visual'));
    A.ok('and unticking survives it too',
      !/class="class-opt is-on" data-vis="1"/.test(seg2));

    // And Save writes what the round trips preserved.
    F.openSheetEl(app).querySelector('#ed-visual');
    const on = F.tapTarget(app, 'class-opt', { 'data-vis': '1' });
    on.parentNode = F.openSheetEl(app).querySelector('#ed-visual');
    F.openSheetEl(app).querySelector('#ed-visual').dispatch('click', { target: on });
    F.openSheetEl(app).querySelector('#ed-ok').onclick();
    A.eq('saved as visual', app.fn('recordById')(rec.id).visual, true);
  });

  A.group('12aa ⚠ Continue on the new item sheet records the toggles', () => {
    // ⚠ M116 SURVIVED. 12x proved the class PICKER is gone and that the sheet
    // states the class — neither of which says the value is actually written
    // when Continue is pressed. Absence of a control is not presence of a
    // behaviour.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    st.mode = INITIAL;
    act('setClass', '2');
    act('setVisual', 'visual');
    app.fn('openNewItemSheet')('A1');
    const sheet = F.openSheetEl(app);
    sheet.querySelector('#ni-desc').value = 'Kettle';
    sheet.querySelector('#ni-ok').onclick();
    A.ok('an item is pending', !!st.pending);
    A.eq('description taken from the box', st.pending.description, 'Kettle');
    A.eq('class taken from the toggle', st.pending.cls, '2');
    A.eq('visual taken from the toggle', st.pending.visual, true);
    app.fn('commitResult')('pass', '');
    const c = exportCells(1);
    A.eq('and it reached the file as an empty insulation cell', at(c, 'INSULATION'), '');
    A.eq('with the class the toggle was set to', at(c, 'CLASS'), '2');
  });

  A.group('12ab the stylesheet still makes Visual look different', () => {
    // ⚠ M117 SURVIVED. A source guard, and it says so: there is no box model
    // here, so the most that can be proven is that the rule which colours the
    // Visual segment has not been deleted or renamed out from under the markup.
    // Without it the toggle records correctly and looks identical to Test,
    // which is the state nobody can spot across a corridor.
    const css = L.readFile('styles.css');
    A.ok('the toggle rows are styled', css.indexOf('.togswitch') !== -1);
    A.ok('the Visual segment has its own on-state',
      css.indexOf('.tog-opt.is-warn.is-on') !== -1);
    A.ok('the warn colour is a variable, set in both themes',
      (css.match(/--warn:/g) || []).length >= 2);
    A.ok('and the pending call-out is styled', css.indexOf('.pending-flag') !== -1);
    // ⚠ NOT --fail. The Visual toggle sits directly above the FAIL button and
    // two red controls a thumb's width apart is a mis-tap waiting to happen.
    A.ok('the Visual on-state does not borrow the fail colour',
      css.indexOf('.tog-opt.is-warn.is-on {\n  background: var(--fail)') === -1);
  });

  A.group('12ac ⚠ REORDERING THE CLIENT FILE IS SAFE — the V5 claim, proven', () => {
    // The headline of V5, and V6 is the release that cashed it in: nine of the
    // fifteen columns moved and csv.js was not touched for the reorder. The
    // column order lives in ONE place, so a reorder in config.js cannot
    // desynchronise the header from the body. This reverses the whole spec at
    // runtime, rebuilds, and checks every column still carries its own value
    // under its own header.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', INITIAL, { client: 'Acme', floor: '2', room: 'Kitchen' });
    app.fn('addItemRecord')(
      { code: 'A1', mode: INITIAL, description: 'Kettle', cls: '2', visual: true }, 'fail', 'Damaged Lead');

    const original = SPEC.slice();
    SPEC.reverse();
    const r = rows(app.fn('buildCSV')().text);
    const keys = SPEC.map(c => c.key);
    const pick = (line, k) => cells(line)[keys.indexOf(k)];

    A.eq('the header followed the reorder', cells(r[0]), keys);
    A.eq('ASSET ID still right', pick(r[1], 'ASSET ID'), 'A1');
    A.eq('CLASS still right', pick(r[1], 'CLASS'), '2');
    A.eq('VISUAL still right', pick(r[1], 'VISUAL'), 'FAIL');
    A.eq('OPERATIONAL still right', pick(r[1], 'OPERATIONAL'), 'FAIL');
    A.eq('NOTES still right', pick(r[1], 'NOTES'), 'Damaged Lead');
    A.eq('DESCRIPTION still right', pick(r[1], 'DESCRIPTION'), 'Kettle');
    // ⚠ V6: THE ROOM IS ON THE ITEM ROW NOW, not on a location row of its own.
    // A reorder must carry the two context-dependent columns as safely as the
    // rest — they are the only ones that read a second argument, so they are
    // the ones a reorder could plausibly break.
    A.eq('ROOM rode across on the item row', pick(r[1], 'ROOM'), 'Kitchen');
    A.eq('FLOOR with it', pick(r[1], 'FLOOR'), '2');
    A.eq('and the width is unchanged', cells(r[1]).length, original.length);

    SPEC.length = 0;
    original.forEach(c => SPEC.push(c));
    A.eq('spec restored for everything after this', SPEC[0].key, original[0].key);
  });
};
