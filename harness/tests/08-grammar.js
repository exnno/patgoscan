/*
 * 08-grammar — what a barcode MEANS, and the dispatch crash net.
 * (c) 2026 Peter Birchley. All rights reserved.
 */

const A = require('../assert');
const F = require('../fixture');
const L = require('../load');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');

  A.group('08a an armed bar makes the next scan a location', () => {
    F.resetApp(app);
    st.view = 'scan';
    app.register('scan-input');
    st.locationArmed = true;
    st.mode = AUDIT;
    app.fn('routeScan')('LOC-42');
    A.eq('a location record was created', st.records.filter(r => r.type === 'location').length, 1);
    A.eq('it is now current', app.fn('currentLocationCode')(), 'LOC-42');
    A.eq('the bar disarmed itself', st.locationArmed, false);
    A.eq('no item was created', st.records.filter(r => r.type === 'item').length, 0);
  });

  A.group('08b with the bar not armed, the same barcode is an asset', () => {
    // ⚠ Decision 1D. The app cannot tell a location label from an asset label
    // by looking at it. The engineer arms it; the app obeys.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.mode = AUDIT;
    app.fn('routeScan')('LOC-42');
    A.eq('waiting for a result', st.pending && st.pending.code, 'LOC-42');
    A.eq('still only one location', st.records.filter(r => r.type === 'location').length, 1);
  });

  A.group('08c an asset scan with no location is refused', () => {
    // ⚠ An item with no location is a row the client cannot place, and across
    // six engineers and several thousand rows there is no reconstructing it.
    F.resetApp(app);
    st.view = 'scan';
    app.register('scan-input');
    st.currentLocationId = '';
    st.mode = AUDIT;
    app.fn('routeScan')('AST-1');
    A.eq('nothing pending', st.pending, null);
    A.eq('nothing written', st.records.length, 0);
  });

  A.group('08d nothing is written until a result is given', () => {
    // A scanned-but-unjudged item is not data. Writing it early would mean a
    // mis-scan had to be found and deleted rather than simply re-scanned over.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('routeScan')('AST-1');
    A.eq('no item record yet', st.records.filter(r => r.type === 'item').length, 0);
    app.fn('commitResult')('pass', '');
    A.eq('now there is one', st.records.filter(r => r.type === 'item').length, 1);
    A.eq('pending cleared', st.pending, null);
  });

  A.group('08d2 a duplicate asset is intercepted, not silently re-armed', () => {
    // ⚠ M33 SURVIVED without this. Group 04g tested findItemByCode() directly,
    // which proves the LOOKUP works and says nothing about whether routeScan
    // actually calls it — the classic "right mechanism, never invoked" hole.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('routeScan')('AST-1');
    app.fn('commitResult')('pass', '');
    A.eq('one item so far', st.records.filter(r => r.type === 'item').length, 1);

    app.fn('routeScan')('AST-1');            // the same label again
    A.eq('NOT armed straight through to PASS/FAIL', st.pending, null);
    const sheets = app.doc.body.children.map(c => c.children.map(x => x.innerHTML).join('')).join('');
    A.includes('a confirm sheet asked about it', sheets, 'Already scanned');
    app.fn('closeSheet')();
  });

  A.group('08e a fail carries its reason through', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('routeScan')('AST-1');
    app.fn('commitResult')('fail', 'Insulation Resistance');
    const rec = st.records.filter(r => r.type === 'item')[0];
    A.eq('result', rec.result, 'fail');
    A.eq('reason', rec.failReason, 'Insulation Resistance');
  });

  A.group('08f initial mode opens the sheet instead of arming PASS/FAIL', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.mode = INITIAL;
    app.fn('routeScan')('AST-NEW');
    A.eq('no pending item yet — the sheet has to gather the detail first', st.pending, null);
    A.eq('nothing written', st.records.filter(r => r.type === 'item').length, 0);
    st.mode = AUDIT;
  });

  A.group('08g the default fail reasons are Peter\'s standing list', () => {
    const list = app.fn('makeDefaultFailReasons')();
    ['Damaged Plug', 'Damaged Lead', 'Damaged Casing', 'Earth Continuity',
     'Insulation Resistance', 'Does Not Conform To BS 1363'].forEach((r) => {
      A.ok('includes ' + r, list.indexOf(r) !== -1);
    });
    A.eq('six of them', list.length, 6);
  });

  A.group('08h a throw inside an action recovers to the scan screen', () => {
    // ⚠ The post-boot half of the crash net. Assert through
    // handleDelegatedClick, never through render() directly.
    F.resetApp(app);
    st.view = 'settings';
    const actions = app.val('ACTIONS');
    actions.__explode = () => { throw new Error('boom'); };
    const btn = app.doc.createElement('button');
    btn.setAttribute('data-action', '__explode');
    let threw = false;
    try {
      app.fn('handleDelegatedClick')({ target: btn });
    } catch (e) { threw = true; }
    A.eq('the throw did not escape', threw, false);
    A.eq('recovered to the scan screen', st.view, 'scan');
    delete actions.__explode;
  });

  A.group('08i an unknown action is ignored quietly', () => {
    const btn = app.doc.createElement('button');
    btn.setAttribute('data-action', 'notARealAction');
    let threw = false;
    try { app.fn('handleDelegatedClick')({ target: btn }); } catch (e) { threw = true; }
    A.eq('no throw', threw, false);
  });

  A.group('08j setView clears every transient', () => {
    // ⚠ A transient that survives navigation reopens a sheet on a screen that
    // knows nothing about it.
    F.resetApp(app);
    st.locationArmed = true;
    app.fn('setView')('log');
    A.eq('location disarmed', st.locationArmed, false);
    A.eq('view changed', st.view, 'log');
  });

  A.group('08k the search field never triggers a full render', () => {
    // A full render would rebuild the search box and take the cursor with it on
    // every character typed.
    const src = L.stripComments(L.readFile('dispatch.js'));
    const block = src.slice(src.indexOf('const INPUT_ACTIONS'), src.indexOf('const CHANGE_ACTIONS'));
    A.ok('no render() in INPUT_ACTIONS', block.indexOf('render()') === -1);
    A.includes('repaints the list only', block, 'refreshLogListOnly');
  });

  A.group('08l the file input clears itself immediately', () => {
    // Otherwise choosing the SAME file twice fires nothing the second time.
    const src = L.stripComments(L.readFile('dispatch.js'));
    const block = src.slice(src.indexOf('restoreFile:'), src.indexOf('};', src.indexOf('restoreFile:')));
    const clearIdx = block.indexOf("el.value = ''");
    const useIdx = block.indexOf('importBackupFile');
    A.ok('cleared before use', clearIdx !== -1 && clearIdx < useIdx);
  });

  A.group('08m export actions are synchronous from the tap', () => {
    // ⚠ iOS revokes the user gesture across an await, and without the gesture
    // navigator.share() silently does nothing at all.
    const src = L.stripComments(L.readFile('dispatch.js'));
    const block = src.slice(src.indexOf('exportNew:'), src.indexOf('reportProblem:'));
    A.ok('no await before the share', block.indexOf('await') === -1);
    A.ok('no async handler', block.indexOf('async') === -1);
  });

  A.group('08n diagnostics carry counts and flags only', () => {
    // ⚠⚠ THE PRIVACY RULE. This report is emailed, and the asset register is
    // the client's commercial data.
    F.resetApp(app);
    st.engineer = 'Pete';
    app.fn('addLocationRecord')('LOC-SECRET-1', INITIAL, { client: 'Acme Hospitals', floor: '3', room: 'Ward 4' });
    app.fn('addItemRecord')({ code: 'AST-SECRET-9', mode: INITIAL, description: 'Ventilator', cls: 'I' }, 'fail', 'Damaged Plug');
    const diag = app.fn('_diagnostics')();
    ['LOC-SECRET-1', 'AST-SECRET-9', 'Acme Hospitals', 'Ward 4', 'Ventilator'].forEach((term) => {
      A.excludes('diagnostics omit ' + term, diag, term);
    });
    A.includes('but do carry the counts', diag, 'Records: 2');
  });

  A.group('08o the scrubber fails CLOSED on anything barcode-shaped', () => {
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', AUDIT, null);
    const scrubbed = app.fn('_scrubCustomerData')('Error near asset QQ-778812-XX in room');
    A.ok('the message was withheld rather than passed through',
      scrubbed.indexOf('QQ-778812-XX') === -1);
    A.includes('and says so', scrubbed, 'withheld');
  });
};
