/*
 * 07-backup — the engineer's safety net.
 * (c) 2026 Peter Birchley. All rights reserved.
 */

const A = require('../assert');
const F = require('../fixture');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');

  function seed() {
    F.resetApp(app);
    st.engineer = 'Pete';
    app.fn('addLocationRecord')('LOC-1', INITIAL, { client: 'Acme', floor: '1', room: 'Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle', cls: 'I' }, 'pass', '');
    app.fn('addItemRecord')({ code: 'A2', mode: AUDIT }, 'fail', 'Damaged Plug');
  }

  A.group('07a a full round trip loses nothing', () => {
    seed();
    const backup = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    const before = JSON.stringify(st.records);
    const engineerBefore = st.engineer;
    const locBefore = st.currentLocationId;

    F.resetApp(app);
    A.eq('cleared first', st.records.length, 0);

    A.eq('restore reports success', app.fn('restoreBackupObject')(backup), true);
    A.eq('records identical', JSON.stringify(st.records), before);
    A.eq('engineer restored', st.engineer, engineerBefore);
    A.eq('current location restored', st.currentLocationId, locBefore);
  });

  A.group('07b restore goes through the SAME validators as load', () => {
    // ⚠ Never write a second validator. A backup restoring under different
    // rules than a load produces a state the app has never been tested against.
    seed();
    const backup = app.fn('buildBackup')();
    backup.records = backup.records.concat([{ type: 'item', code: 'A3', result: 'maybe' }]);
    app.fn('restoreBackupObject')(JSON.parse(JSON.stringify(backup)));
    const bad = st.records.filter(r => r.code === 'A3')[0];
    A.eq('the invalid result was normalised away', bad.result, '');
  });

  A.group('07c the file-kind guard refuses another app\'s backup', () => {
    seed();
    const before = st.records.length;
    A.eq('PATGo backup refused', app.fn('restoreBackupObject')({ app: 'patgo', records: [] }), false);
    A.eq('nothing was touched', st.records.length, before);
    A.eq('an object with no records refused', app.fn('restoreBackupObject')({ app: 'patgoscan' }), false);
    A.eq('null refused', app.fn('restoreBackupObject')(null), false);
  });

  A.group('07d a boolean restores only when the backup holds one', () => {
    // ⚠ ABSENCE IS NOT "OFF". An older backup predating a flag must leave it at
    // its default, not switch it off for everyone who restores.
    seed();
    st.scannerEnabled = true;
    const backup = app.fn('buildBackup')();
    delete backup.prefs.scannerEnabled;
    app.fn('restoreBackupObject')(JSON.parse(JSON.stringify(backup)));
    A.eq('flag untouched by an absent field', st.scannerEnabled, true);

    const backup2 = app.fn('buildBackup')();
    backup2.prefs.scannerEnabled = false;
    app.fn('restoreBackupObject')(JSON.parse(JSON.stringify(backup2)));
    A.eq('an explicit false does apply', st.scannerEnabled, false);
    st.scannerEnabled = true;
  });

  A.group('07e a dangling location id does not survive a restore', () => {
    seed();
    const backup = app.fn('buildBackup')();
    backup.currentLocationId = 'loc_never_existed';
    app.fn('restoreBackupObject')(JSON.parse(JSON.stringify(backup)));
    A.eq('cleared', st.currentLocationId, '');
  });

  A.group('07f the backup announces what produced it', () => {
    seed();
    const b = app.fn('buildBackup')();
    A.eq('app tag', b.app, 'patgoscan');
    A.eq('backupVersion', b.backupVersion, app.val('BACKUP_VERSION'));
    A.eq('appVersion', b.appVersion, app.val('APP_VERSION'));
  });

  A.group('07g additive fields ride through without a version bump', () => {
    // ⚠ Unknown fields are ignored and known-but-absent fall back to defaults,
    // so adding a field is always backwards compatible. Bump only for a
    // genuinely incompatible change of shape.
    seed();
    const backup = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    backup.somethingFromTheFuture = { nested: true };
    backup.records[0].futureField = 'x';
    A.eq('restores cleanly', app.fn('restoreBackupObject')(backup), true);
    A.eq('records still good', st.records.length, 3);
  });

  A.group('07h clearing refuses while anything is unexported', () => {
    // ⚠ M47 SURVIVED on "nothing was cleared" alone. With the guard removed the
    // code falls through to a CONFIRM sheet, which nobody confirms in a
    // headless run — so the records survive either way and the assertion is
    // hollow. What distinguishes the two paths is WHICH sheet appears.
    seed();
    const before = st.records.length;
    app.fn('closeSheet')();
    app.fn('clearExportedRecords')();
    A.eq('nothing was cleared', st.records.length, before);
    const sheets = app.doc.body.children.map(c => c.children.map(x => x.innerHTML).join('')).join('');
    A.includes('the refusal sheet appeared', sheets, 'Export first');
    A.excludes('and NOT the confirm-to-delete sheet', sheets, 'Clear ' + before);
    app.fn('closeSheet')();
  });

  A.group('07i clearing proceeds once everything has gone out', () => {
    seed();
    st.records.forEach(r => { r.exported = true; });
    app.fn('closeSheet')();
    app.fn('clearExportedRecords')();
    const sheets = app.doc.body.children.map(c => c.children.map(x => x.innerHTML).join('')).join('');
    A.includes('now it asks to confirm', sheets, 'Clear 3 exported records?');
    app.fn('closeSheet')();
  });
};
