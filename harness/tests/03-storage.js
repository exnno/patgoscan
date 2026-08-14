/*
 * 03-storage — the persistence boundary and its validators.
 * (c) 2026 Peter Birchley. All rights reserved.
 */

const A = require('../assert');
const F = require('../fixture');

module.exports = function (app) {
  const st = app.state();

  A.group('03a records survive a save/load round trip', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-9', app.val('MODE_AUDIT'), null);
    app.fn('addItemRecord')({ code: 'AST-100', mode: app.val('MODE_AUDIT'), description: 'Kettle', cls: 'I' }, 'pass', '');
    const before = JSON.stringify(st.records);
    app.fn('save')();
    st.records = [];
    app.fn('load')();
    A.eq('records identical after reload', JSON.stringify(st.records), before);
  });

  A.group('03b garbage collapses to a safe default, it never throws', () => {
    A.eq('non-array records → []', app.fn('normaliseRecords')('nonsense'), []);
    A.eq('null record dropped', app.fn('normaliseRecord')(null), null);
    A.eq('record with no barcode dropped', app.fn('normaliseRecord')({ type: 'item', code: '  ' }), null);
    A.eq('unknown theme → auto', app.fn('normaliseTheme')('chartreuse'), 'auto');
    A.eq('unknown speed → default', app.fn('normaliseScanSpeed')('instant'), app.val('SCAN_SPEED_DEFAULT'));
    A.eq('unknown mode → audit', app.fn('normaliseMode')('sideways'), app.val('MODE_AUDIT'));
    A.eq('empty list falls back', app.fn('normaliseStringList')([], app.fn('makeDefaultFailReasons'), 40).length,
      app.fn('makeDefaultFailReasons')().length);
  });

  A.group('03c a bad result value cannot get into a record', () => {
    const r = app.fn('normaliseRecord')({ type: 'item', code: 'A1', result: 'maybe' });
    A.eq('result blanked', r.result, '');
    const r2 = app.fn('normaliseRecord')({ type: 'item', code: 'A1', result: 'fail', failReason: 'Damaged Plug' });
    A.eq('fail reason kept on a fail', r2.failReason, 'Damaged Plug');
    const r3 = app.fn('normaliseRecord')({ type: 'item', code: 'A1', result: 'pass', failReason: 'Damaged Plug' });
    A.eq('fail reason dropped on a pass', r3.failReason, '');
  });

  A.group('03d duplicate ids are re-issued, not dropped', () => {
    // Two records sharing an id would make edit-by-id ambiguous and delete the
    // wrong row — but the DATA is still good, so re-id rather than discard.
    const out = app.fn('normaliseRecords')([
      { id: 'x', type: 'item', code: 'A1' },
      { id: 'x', type: 'item', code: 'A2' },
    ]);
    A.eq('both kept', out.length, 2);
    A.ok('ids now differ', out[0].id !== out[1].id);
  });

  A.group('03e a dangling current location is cleared on load', () => {
    F.resetApp(app);
    app.fn('save')();
    app.storage.setItem(app.val('LOCATION_KEY'), 'loc_that_never_existed');
    app.fn('load')();
    A.eq('cleared', st.currentLocationId, '');
  });

  A.group('03f flag polarity — the silent-switch class', () => {
    // ⚠ Default-ON flags read !== '0'; default-OFF read === '1'. Copying the
    // wrong neighbour turns a feature on for every engineer at once.
    F.resetApp(app);
    app.storage.removeItem(app.val('SCANNER_KEY'));
    app.storage.removeItem(app.val('SCANNER_PAIRED_KEY'));
    app.storage.removeItem(app.val('HAPTIC_KEY'));
    app.storage.removeItem(app.val('SOUND_KEY'));
    app.fn('load')();
    A.eq('scanner defaults ON when absent', st.scannerEnabled, true);
    A.eq('paired defaults OFF when absent', st.scannerPaired, false);
    A.eq('haptic defaults ON when absent', st.haptic, true);
    A.eq('sound defaults OFF when absent', st.sound, false);

    app.storage.setItem(app.val('SCANNER_KEY'), '0');
    app.fn('load')();
    A.eq('scanner off when explicitly 0', st.scannerEnabled, false);
  });

  A.group('03g descriptions and reasons persist separately from records', () => {
    F.resetApp(app);
    st.failReasons = ['Damaged Plug'];
    app.fn('saveLists')();
    st.failReasons = [];
    app.fn('load')();
    A.eq('reasons came back', st.failReasons, ['Damaged Plug']);
  });
};
