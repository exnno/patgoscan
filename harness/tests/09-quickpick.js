/*
 * 09-quickpick — V1.1. The curated Quick Pick presets, their separation from the
 * learned descriptions, and the two sheet behaviours that came with them.
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * The three bugs this release fixes, and the assertion that guards each:
 *   the form rebuilding as you type      → 09h, 09i (and the CSS guard 09j)
 *   no way to edit the quick pick        → 09c, 09d, 09e
 *   no fail reasons when editing to FAIL → 09k, 09l, 09m
 */

const A = require('../assert');
const F = require('../fixture');
const path = require('path');
const fs = require('fs');

module.exports = function (app) {
  const st = app.state();
  const INITIAL = app.val('MODE_INITIAL');
  const AUDIT = app.val('MODE_AUDIT');

  // -------------------------------------------------------------------------
  // The separation. This is the release's headline invariant: two lists, two
  // jobs. Every "I deleted it and it came back" report traces to this being
  // untrue.
  // -------------------------------------------------------------------------
  A.group('09a logging an item learns a description WITHOUT touching the grid', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    const gridBefore = JSON.stringify(app.fn('quickPickItems')());
    app.fn('addItemRecord')(
      { code: 'AST-1', mode: INITIAL, description: 'Angle Grinder', cls: 'I' }, 'pass', '');
    A.ok('learned into the typed list',
      st.descriptions.indexOf('Angle Grinder') !== -1);
    A.eq('the grid is byte-identical', JSON.stringify(app.fn('quickPickItems')()), gridBefore);
  });

  A.group('09b a removed quick pick STAYS removed after it is typed again', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    const p = app.fn('activePreset')();
    const keep = p.items.filter(x => x !== 'Kettle');
    app.fn('setPresetItemsFromText')(p.id, keep.join('\n'));
    A.eq('gone from the grid', app.fn('quickPickItems')().indexOf('Kettle'), -1);

    // The exact sequence that made V1 resurrect it: type it, log it, look again.
    app.fn('addItemRecord')(
      { code: 'AST-2', mode: INITIAL, description: 'Kettle', cls: 'I' }, 'pass', '');
    A.eq('still gone after being typed and logged',
      app.fn('quickPickItems')().indexOf('Kettle'), -1);
    A.ok('but it is remembered for the dropdown',
      st.descriptions.indexOf('Kettle') !== -1);
  });

  // -------------------------------------------------------------------------
  // The model
  // -------------------------------------------------------------------------
  A.group('09c garbage presets collapse to a usable default, never to an empty grid', () => {
    A.eq('nonsense → default', app.fn('normalisePresets')('nonsense').length,
      app.fn('makeDefaultPresets')().length);
    A.eq('empty array → default', app.fn('normalisePresets')([]).length,
      app.fn('makeDefaultPresets')().length);
    A.eq('a nameless preset is dropped', app.fn('normalisePresets')([{ id: 'a', items: ['X'] }]).length,
      app.fn('makeDefaultPresets')().length);

    const twoSameId = app.fn('normalisePresets')([
      { id: 'dup', name: 'One', items: ['A'] },
      { id: 'dup', name: 'Two', items: ['B'] },
    ]);
    A.eq('both kept', twoSameId.length, 2);
    A.ok('ids re-issued so the switcher cannot pick the wrong one',
      twoSameId[0].id !== twoSameId[1].id);

    const capped = app.fn('normalisePresets')([{
      id: 'c', name: 'Capped',
      items: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
    }]);
    A.eq('items capped at the grid limit', capped[0].items.length, app.val('QUICK_PICK_MAX'));

    // A preset mid-build is not corruption.
    A.eq('an empty preset is legal',
      app.fn('normalisePresets')([{ id: 'e', name: 'Empty', items: [] }])[0].items.length, 0);
  });

  A.group('09c2 a stale active id resolves to a real preset, not to nothing', () => {
    const presets = app.fn('makeDefaultPresets')();
    A.eq('unknown id falls back to the first',
      app.fn('resolveActivePreset')('preset_that_went_away', presets), presets[0].id);
    A.eq('a real id is kept', app.fn('resolveActivePreset')(presets[0].id, presets), presets[0].id);
  });

  A.group('09d the items textarea is parsed as one per line, in order', () => {
    F.resetApp(app);
    const p = app.fn('activePreset')();
    app.fn('setPresetItemsFromText')(p.id,
      'Kettle\n\n  Toaster  \nkettle\nMicrowave\n');
    A.eq('blank lines dropped, whitespace trimmed, duplicate ignored',
      app.fn('quickPickItems')(), ['Kettle', 'Toaster', 'Microwave']);

    app.fn('setPresetItemsFromText')(p.id,
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].join('\n'));
    A.eq('capped at the grid limit', app.fn('quickPickItems')().length, app.val('QUICK_PICK_MAX'));
  });

  A.group('09e the last preset cannot be deleted, and deleting the active one moves it', () => {
    F.resetApp(app);
    const first = app.fn('activePreset')();
    A.eq('refused while it is the only one', app.fn('deletePreset')(first.id), false);
    A.eq('still there', st.itemPresets.length, 1);

    const added = app.fn('addPreset')('Workshop');
    A.eq('a new preset becomes the active one', st.activePresetId, added.id);
    A.eq('and starts empty rather than copying', added.items.length, 0);
    A.eq('now deletable', app.fn('deletePreset')(added.id), true);
    A.eq('the active id moved to a preset that exists', st.activePresetId, st.itemPresets[0].id);
    A.ok('and that preset is real', !!app.fn('activePreset')());
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------
  A.group('09f presets survive save/load and a backup round trip', () => {
    F.resetApp(app);
    const p = app.fn('activePreset')();
    app.fn('setPresetItemsFromText')(p.id, 'Kettle\nToaster');
    app.fn('renamePreset')(p.id, 'Kitchens');
    app.fn('save')();
    st.itemPresets = [];
    st.activePresetId = '';
    app.fn('load')();
    A.eq('name back', app.fn('activePreset')().name, 'Kitchens');
    A.eq('items back', app.fn('quickPickItems')(), ['Kettle', 'Toaster']);

    const backup = app.fn('buildBackup')();
    st.itemPresets = [];
    st.activePresetId = '';
    app.fn('restoreBackupObject')(JSON.parse(JSON.stringify(backup)));
    A.eq('and back again through the backup', app.fn('quickPickItems')(), ['Kettle', 'Toaster']);
    A.eq('with the active list still selected', app.fn('activePreset')().name, 'Kitchens');
  });

  A.group('09g a V1 backup — no presets in it at all — restores to a usable grid', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-OLD', AUDIT, null);
    const v1Backup = {
      app: 'patgoscan', appVersion: 'V1', backupVersion: 1,
      records: st.records,
      failReasons: app.fn('makeDefaultFailReasons')(),
      descriptions: app.fn('makeSeedDescriptions')(),
      // deliberately NO itemPresets / activePresetId
    };
    st.itemPresets = [];
    st.activePresetId = '';
    A.eq('restore accepted', app.fn('restoreBackupObject')(v1Backup), true);
    A.ok('the grid is not empty', app.fn('quickPickItems')().length > 0);
    A.ok('and the active preset resolves', !!app.fn('activePreset')());
  });

  // -------------------------------------------------------------------------
  // The new item sheet — bug 1
  // -------------------------------------------------------------------------
  A.group('09h the sheet opens with the grid showing and the dropdown hidden', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.mode = INITIAL;
    app.fn('openNewItemSheet')('AST-SHEET');
    const sheet = F.openSheetEl(app);
    A.ok('a sheet opened', !!sheet);
    A.includes('the grid is in it', sheet.innerHTML, 'quick-grid');
    A.includes('built from the active preset', sheet.innerHTML, 'Kettle');
    A.includes('the dropdown starts hidden', sheet.innerHTML, 'suggest is-hidden');
    // ⚠ The V1 bug was the list being PAINTED at open and then repainted on
    // every keystroke. If it is painted at open, it is not hidden.
    A.excludes('nothing is painted into it yet', sheet.innerHTML, 'suggestion-item');
    st.mode = AUDIT;
    app.fn('closeSheet')();
  });

  A.group('09i tapping a suggestion fills the box and CLOSES the list', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.mode = INITIAL;
    // ⚠ THE DATA IS THE TEST HERE. With a description that nothing else
    // contains, re-filtering returns an empty list and hides itself anyway — so
    // the assertion goes green whether the code closes the list or re-runs it,
    // and the mutation walks straight through (M56 SURVIVED exactly this way on
    // the first attempt). These three entries overlap on purpose: re-filtering
    // on "Desk Lamp" would find the other two and leave the list ON SCREEN,
    // re-ordered, which is the bug.
    st.descriptions = ['Desk Lamp', 'Desk Lamp Large', 'Desk Lamp Small'];
    app.fn('openNewItemSheet')('AST-SUG');
    const sheet = F.openSheetEl(app);
    const desc = sheet.querySelector('#ni-desc');
    const suggest = sheet.querySelector('#ni-suggest');

    const target = F.tapTarget(app, 'suggestion-item', { 'data-d': 'Desk Lamp' });
    target.parentNode = suggest;
    suggest.dispatch('pointerdown', { target: target, preventDefault() {} });

    A.eq('the description is filled', desc.value, 'Desk Lamp');
    // ⚠ THE ACTUAL V1 BUG. It re-ran the filter here, so the list re-ordered and
    // dropped the very word being tapped, under the finger, mid-tap.
    A.ok('the list is hidden, not re-filtered', suggest.classList.contains('is-hidden'));
    A.eq('and emptied', suggest.innerHTML, '');
    st.mode = AUDIT;
    app.fn('closeSheet')();
  });

  A.group('09j source guard — the dropdown is an overlay, so it cannot move the form', () => {
    // This one cannot be proved in a headless DOM: nothing here has layout. The
    // invariant lives in CSS, so the CSS is what gets asserted. Without
    // position:absolute the list is back in the flow and the form jumps again.
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles.css'), 'utf8');
    const block = css.slice(css.indexOf('.suggest {'), css.indexOf('.suggest.is-hidden'));
    A.includes('.suggest is absolutely positioned', block, 'position: absolute');
    A.includes('anchored under the field', block, 'top: 100%');
    A.includes('.desc-wrap is its containing block', css, '.desc-wrap { position: relative; }');
  });

  // -------------------------------------------------------------------------
  // The edit sheet — bug 3
  // -------------------------------------------------------------------------
  function openItemForEdit() {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    const rec = app.fn('addItemRecord')(
      { code: 'AST-ED', mode: INITIAL, description: 'Kettle', cls: 'I' }, 'pass', '');
    app.fn('openEditSheet')(rec.id);
    return rec;
  }

  function tapResult(sheet, value) {
    const row = sheet.querySelector('#ed-result');
    const target = F.tapTarget(app, 'class-opt', { 'data-res': value });
    target.parentNode = row;
    row.dispatch('click', { target: target });
  }

  A.group('09k correcting an item to FAIL raises the reason picker', () => {
    openItemForEdit();
    const sheet = F.openSheetEl(app);
    tapResult(sheet, 'fail');
    const now = F.openSheetEl(app);
    A.ok('a different sheet is open', now !== sheet);
    A.includes('and it is the reason picker', now.innerHTML, 'Why did it fail?');
    // The SAME list the scan screen offers, not a second copy of it.
    A.includes('carrying the standing reasons', now.innerHTML, 'Damaged Plug');
    app.fn('closeSheet')();
  });

  A.group('09l the reason comes back and the unsaved edits survive the trip', () => {
    const rec = openItemForEdit();
    let sheet = F.openSheetEl(app);
    // An edit made in this visit, not yet saved.
    sheet.querySelector('#ed-desc').value = 'Site Kettle';
    tapResult(sheet, 'fail');

    const failSheet = F.openSheetEl(app);
    const list = failSheet.querySelector('.reasonlist');
    const pick = F.tapTarget(app, 'reason', { 'data-r': 'Damaged Lead' });
    pick.parentNode = list;
    list.dispatch('click', { target: pick });

    sheet = F.openSheetEl(app);
    A.includes('the reason is shown', sheet.innerHTML, 'Damaged Lead');
    A.includes('the description edit survived', sheet.innerHTML, 'Site Kettle');
    A.includes('the fail is still selected', sheet.innerHTML, 'data-res="fail"');
    A.eq('and nothing has been written to the record yet', app.fn('recordById')(rec.id).result, 'pass');
    app.fn('closeSheet')();
  });

  A.group('09m a fail cannot be saved without a reason, and a pass clears one', () => {
    const rec = openItemForEdit();
    const sheet = F.openSheetEl(app);

    // Straight to Save with a fail and no reason: refused, and the picker opens
    // rather than leaving the engineer to work out what is wrong.
    tapResult(sheet, 'fail');
    const failSheet = F.openSheetEl(app);
    A.includes('picker opened on the FAIL tap', failSheet.innerHTML, 'Why did it fail?');
    failSheet.querySelector('#fs-cancel').onclick();

    const back = F.openSheetEl(app);
    back.querySelector('#ed-ok').onclick();
    A.eq('the record is untouched', app.fn('recordById')(rec.id).result, 'pass');
    A.eq('the reason is still empty', app.fn('recordById')(rec.id).failReason, '');

    // And the other direction: a real fail, then corrected back to a pass.
    app.fn('updateRecordFields')(rec.id, { result: 'fail', failReason: 'Damaged Casing' });
    A.eq('set up as a fail', app.fn('recordById')(rec.id).failReason, 'Damaged Casing');
    app.fn('openEditSheet')(rec.id);
    const s2 = F.openSheetEl(app);
    tapResult(s2, 'pass');
    s2.querySelector('#ed-ok').onclick();
    A.eq('now a pass', app.fn('recordById')(rec.id).result, 'pass');
    A.eq('with no reason left behind', app.fn('recordById')(rec.id).failReason, '');
  });
};
