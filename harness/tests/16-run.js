/*
 * 16-run — V11. BATCH INITIALS, and the mode badge on the log.
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * ⚠⚠ WHY THIS FILE IS DIFFERENT FROM EVERY OTHER ONE HERE. Until V11 the app
 * could not write an asset code that had not come off a label — every record
 * traced back to a scan. A run breaks that on purpose for items 2..N, so the
 * failures available in this file are of a kind the suite has never had to
 * guard before: not "the app recorded the wrong thing about what happened", but
 * "the app made something up and it went to the client".
 *
 * THE QUESTION ASKED OF EVERY ASSERTION BELOW, in the three shapes that have
 * got through in this project before:
 *
 *   1. Could it pass with the WRONG NUMBER of records written? Anything that
 *      checks "a record exists with code 1000" passes on a run that wrote one
 *      item, fifty, or the same item fifty times. Every group here counts, and
 *      counts the CODES, not the records.
 *
 *   2. Could it pass without the CONFIRMATION being real? "Fail wrote ten
 *      records" is green whether the confirm sheet was shown and answered or
 *      never existed. So the fail groups assert the negative FIRST — nothing is
 *      written while the sheet is up — which is the only state that can tell a
 *      confirmation apart from a decoration.
 *
 *   3. Could it pass on data that never reaches the branch? A clash test needs
 *      the taken id to be INSIDE the range and in the CURRENT session, because
 *      findItemByCode() is session-scoped. A clash placed at 1009 for a run of
 *      three from 1000 tests nothing at all.
 */

const A = require('../assert');
const F = require('../fixture');
const L = require('../load');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');

  function act(name, arg) { return app.val('ACTIONS')[name](arg); }
  function itemCodes() {
    return st.records.filter(r => r.type === 'item').map(r => r.code);
  }
  // ⚠ THROUGH THE DOM, the way 11-move does it. `state.toast` exists but is not
  // what showToast() writes — asserting it would go green on an app that had
  // stopped showing toasts entirely.
  function toastText() {
    const el = app.doc.getElementById('toast');
    return el ? String(el.textContent || '') : '';
  }

  // Put the app where a run starts from: Initial mode, a location in force,
  // and the New item sheet open on a countable code.
  function openRunSheet(code) {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.mode = INITIAL;
    st._pendingReplaceId = '';
    app.fn('openNewItemSheet')(code);
    return F.openSheetEl(app);
  }

  // Tap the stepper. ⚠ THROUGH THE DELEGATED LISTENER THE SHEET ATTACHED, not
  // by setting a variable — the count lives in a closure, so there is nothing
  // to set, and that is deliberate: a test that could reach it would not be
  // testing the control.
  function step(sheet, delta) {
    const row = sheet.querySelector('.runrow');
    const btn = F.tapTarget(app, 'run-step', { 'data-run': String(delta) });
    btn.parentNode = row;
    row.dispatch('click', { target: btn });
  }

  function continueSheet(sheet, description) {
    sheet.querySelector('#ni-desc').value = description || 'Kettle';
    sheet.querySelector('#ni-ok').onclick();
  }

  // -------------------------------------------------------------------------
  // The pure part: what an id becomes
  // -------------------------------------------------------------------------

  A.group('16a the run counts up from the scanned code, keeping prefix and padding', () => {
    const f = app.fn('runCodesFrom');
    A.eq('a plain number', f('1000', 3).join(','), '1000,1001,1002');
    A.eq('a prefix is kept', f('PAT-0998', 3).join(','), 'PAT-0999,PAT-1000'.length
      ? 'PAT-0998,PAT-0999,PAT-1000' : '');
    // ⚠ THE PADDING CASE IS THE ONE WORTH HAVING. 0998 → 0999 → 1000 crosses
    // the width of its own padding. Truncating back to four would file 1000 as
    // 000; refusing to grow would stop the run at the end of the padding.
    A.eq('padding is restored while it fits', f('0008', 3).join(','), '0008,0009,0010');
    A.eq('and allowed to grow when it cannot', f('0098', 4).join(','), '0098,0099,0100,0101');
    // ⚠ A LAZY PREFIX. Greedy would split PAT-0998 as 'PAT-099' + '8' and count
    // PAT-0999, PAT-09910, PAT-09911 — plausible enough to reach the client.
    A.eq('the split takes ALL the trailing digits', f('PAT-0998', 2)[1], 'PAT-0999');
  });

  A.group('16b ⚠ a code it cannot count from yields NO run, rather than a guess', () => {
    const f = app.fn('runCodesFrom');
    A.eq('no trailing digits at all', f('KETTLE', 5).length, 0);
    A.eq('trailing digits are required, not merely present', f('12AB', 5).length, 0);
    // ⚠ PAST THE SAFE INTEGER RANGE parseInt returns a number that is CLOSE to
    // the label rather than equal to it. The first id would be right and the
    // tenth quietly wrong — the worst available failure, because it looks fine.
    A.eq('a 16-digit tail is a serial number, not a run',
      f('9007199254740993000', 3).length, 0);
    A.eq('a count of zero writes nothing', f('1000', 0).length, 0);
    A.eq('and neither does a negative one', f('1000', -4).length, 0);
  });

  // -------------------------------------------------------------------------
  // The sheet: where a run is offered, and where it is not
  // -------------------------------------------------------------------------

  A.group('16c the New item sheet offers a count on a countable code', () => {
    const sheet = openRunSheet('PAT-0998');
    const html = sheet ? sheet.innerHTML : '';
    A.ok('a sheet opened', !!sheet);
    A.includes('the stepper is there', html, 'runrow');
    A.includes('with the count showing', html, 'ni-count');
    A.includes('and a line describing the run', html, 'ni-runnote');
    // ⚠ PRESENCE PLUS THE STARTING VALUE. A stepper that rendered at 10 would
    // pass an existence check and file nine items nobody asked for.
    A.eq('it starts at one', sheet.querySelector('#ni-count').textContent, '1');
    A.includes('and says so in words', html, 'Just this one');
    app.fn('closeSheet')();
  });

  A.group('16d ⚠ and does NOT offer one where a run is impossible or wrong', () => {
    // ⚠ ABSENCE PLUS PRESENCE, both times. "No stepper" is also true of a sheet
    // that failed to render at all, which would pass every assertion here if
    // the description field were not checked alongside it.
    const s1 = openRunSheet('KETTLE-A');
    A.excludes('nothing to count from — no stepper', s1.innerHTML, 'runrow');
    A.includes('but the sheet is otherwise intact', s1.innerHTML, 'ni-desc');
    app.fn('closeSheet')();

    // A re-scan of an asset already on file. A run from here would replace one
    // record and invent the rest — two operations wearing one button.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.mode = INITIAL;
    st._pendingReplaceId = 'itm_whatever';
    app.fn('openNewItemSheet')('PAT-0998');
    const s2 = F.openSheetEl(app);
    A.excludes('a re-scan gets no stepper either', s2.innerHTML, 'runrow');
    A.includes('and is otherwise intact', s2.innerHTML, 'ni-desc');
    st._pendingReplaceId = '';
    app.fn('closeSheet')();
  });

  A.group('16e the stepper moves, states the range, and is clamped at both ends', () => {
    const sheet = openRunSheet('PAT-0998');
    const countEl = sheet.querySelector('#ni-count');
    const noteEl = sheet.querySelector('#ni-runnote');
    step(sheet, 5);
    A.eq('+5 moves five', countEl.textContent, '6');
    step(sheet, -1);
    A.eq('− moves one', countEl.textContent, '5');
    // ⚠ THE RANGE IS SHOWN BEFORE ANYTHING IS WRITTEN. This line is the whole
    // of the answer to "the app is inventing ids": the engineer reads it off
    // against the labels in front of them while still stood at the shelf.
    A.includes('the note names the count', noteEl.textContent, '5 items');
    A.includes('and both ends of the range', noteEl.textContent, 'PAT-0998 to PAT-1002');
    for (let i = 0; i < 4; i++) step(sheet, -5);
    A.eq('it cannot go below one', countEl.textContent, '1');
    for (let i = 0; i < 20; i++) step(sheet, 5);
    A.eq('nor above RUN_MAX', countEl.textContent, String(app.val('RUN_MAX')));
    app.fn('closeSheet')();
  });

  // -------------------------------------------------------------------------
  // Writing a run
  // -------------------------------------------------------------------------

  A.group('16f a run of three writes three items, numbered up, sharing everything else', () => {
    const sheet = openRunSheet('1000');
    step(sheet, 1);
    step(sheet, 1);
    continueSheet(sheet, 'Desk Lamp');
    A.eq('the pending item carries the count', st.pending.count, 3);
    A.eq('and nothing is written yet', itemCodes().length, 0);
    // ⚠ THROUGH ACTIONS, which is the surface a tap reaches. Calling
    // addItemRun() directly would prove the writer works and nothing about
    // whether PASS is wired to it.
    act('pass');
    A.eq('⚠ three records, not one and not thirty', itemCodes().length, 3);
    A.eq('numbered up from the scanned one', itemCodes().join(','), '1000,1001,1002');
    const items = st.records.filter(r => r.type === 'item');
    A.eq('one description across the run', items.filter(r => r.description === 'Desk Lamp').length, 3);
    A.eq('one result', items.filter(r => r.result === 'pass').length, 3);
    A.eq('all in Initial', items.filter(r => r.mode === INITIAL).length, 3);
    A.eq('all under the same location', items.filter(r => r.locationCode === 'LOC-1').length, 3);
    // ⚠ AND THE SESSION, because every log helper is scoped to it — a run
    // stamped wrong would be written, saved, and invisible to the export.
    A.eq('all in the current session',
      items.filter(r => r.sessionId === st.currentSessionId).length, 3);
    A.eq('the pending item is cleared', st.pending, null);
    // ⚠ THE RECEIPT. A run is the one commit whose SIZE is not visible on the
    // screen afterwards: the last-item block shows the last id only, and the
    // counts have moved by an amount nobody was watching.
    A.includes('and the run says how many it wrote', toastText(), '3 items recorded');
  });

  A.group('16g a count of one is an ordinary single item, by the ordinary path', () => {
    // ⚠ THE REGRESSION THAT MATTERS MOST. Every scan in this app that is not a
    // run goes through this line, so a branch that treated 1 as a run would be
    // the whole app's write path changing on the quietest release note.
    const sheet = openRunSheet('2000');
    continueSheet(sheet, 'Kettle');
    A.eq('count is one', st.pending.count, 1);
    act('pass');
    A.eq('exactly one record', itemCodes().length, 1);
    A.eq('and it is the code that was scanned', itemCodes()[0], '2000');
    // ⚠ AND NO RECEIPT. A toast on every scan is noise all day, which is what
    // would take the weight out of the one on a run.
    A.excludes('a single scan stays silent', toastText(), 'items recorded');
  });

  // -------------------------------------------------------------------------
  // 3A — the gap
  // -------------------------------------------------------------------------

  A.group('16h ⚠ a taken id inside the range refuses the WHOLE run and names it', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.mode = INITIAL;
    // ⚠ THE CLASH IS AT 1002, IN THE MIDDLE. At the far end it would pass on
    // code that only checks the first id; outside the range it tests nothing.
    // In the current session, because findItemByCode() is scoped to it.
    app.fn('addItemRecord')({ code: '1002', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    A.eq('the clash is found', app.fn('firstClashInRun')(['1000', '1001', '1002', '1003']), '1002');
    A.eq('and a clean range reports none', app.fn('firstClashInRun')(['3000', '3001']), '');

    app.fn('openNewItemSheet')('1000');
    const sheet = F.openSheetEl(app);
    step(sheet, 5);
    A.includes('the sheet warns while they are still at the shelf',
      sheet.querySelector('#ni-runnote').textContent, '1002 is already logged');
    continueSheet(sheet, 'Kettle');
    // ⚠ REFUSED, NOT TRIMMED AND NOT SKIPPED. Skipping 1002 and carrying on to
    // 1005 would silently move the end of the run, so the last id would be one
    // nobody held a label up against.
    A.eq('⚠ Continue is refused — nothing is pending', st.pending, null);
    A.eq('and nothing beyond the record that was already there', itemCodes().length, 1);
    app.fn('closeSheet')();
  });

  A.group('16i ⚠ and the writer refuses too, not only the sheet', () => {
    // The sheet's check is the early, friendly one. This is the one that
    // protects the file: same single definition (firstClashInRun), asked again
    // at the moment of writing, so a future caller that skipped the sheet
    // cannot write across a gap.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: '1001', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    const out = app.fn('addItemRun')(
      { code: '1000', mode: INITIAL, description: 'Kettle', cls: '1', visual: false, count: 4 },
      'pass', '');
    A.eq('it returns nothing', out, null);
    A.eq('and wrote nothing at all', itemCodes().length, 1);
  });

  A.group('16j a run refused at commit leaves the pending item on screen', () => {
    // ⚠ THE COST OF CLEARING IT WOULD BE A SCAN AND A TYPED DESCRIPTION thrown
    // away to say nothing. Every other path through commitResult() clears,
    // which is why this one needs its own assertion.
    const sheet = openRunSheet('1000');
    step(sheet, 5);
    continueSheet(sheet, 'Kettle');
    A.eq('a run is pending', st.pending.count, 6);
    // The clash appears AFTER the sheet checked — the only way this branch is
    // reachable, and the reason the check is in two places.
    app.fn('addItemRecord')({ code: '1003', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    act('pass');
    A.ok('the run is still pending', !!st.pending && st.pending.count === 6);
    A.eq('and only the clashing record exists', itemCodes().join(','), '1003');
  });

  // -------------------------------------------------------------------------
  // Decision 5 — a run fails only on purpose
  // -------------------------------------------------------------------------

  A.group('16k ⚠ FAIL on a run asks first, and writes NOTHING until it is answered', () => {
    const sheet = openRunSheet('1000');
    step(sheet, 5);
    step(sheet, -1);
    continueSheet(sheet, 'Extension Lead');
    act('fail');
    // Pick a reason off the fail sheet, the way a tap does.
    const fs = F.openSheetEl(app);
    const list = fs.querySelector('.reasonlist');
    const btn = F.tapTarget(app, 'reason', { 'data-r': 'Damaged Lead' });
    btn.parentNode = list;
    list.dispatch('click', { target: btn });

    // ⚠ THIS ASSERTION IS THE GROUP. Everything else here would be green on an
    // app with no confirmation at all — a confirmation is only distinguishable
    // from a decoration by the state in which nothing has been written yet.
    A.eq('⚠ nothing written while the question is on screen', itemCodes().length, 0);
    const confirm = F.openSheetEl(app);
    A.includes('the sheet names the count', confirm.innerHTML, 'Fail all 5');
    A.includes('and the range', confirm.innerHTML, '1000 to 1004');
    A.includes('and says only the first was scanned', confirm.innerHTML, 'was scanned');
    A.includes('and carries the reason it is about to write', confirm.innerHTML, 'Damaged Lead');

    confirm.querySelector('#sheet-ok').onclick();
    A.eq('answering yes writes the run', itemCodes().join(','), '1000,1001,1002,1003,1004');
    const items = st.records.filter(r => r.type === 'item');
    A.eq('all failed', items.filter(r => r.result === 'fail').length, 5);
    A.eq('all with the one reason', items.filter(r => r.failReason === 'Damaged Lead').length, 5);
  });

  A.group('16l ⚠ backing out of that question keeps the run, and writes nothing', () => {
    const sheet = openRunSheet('1000');
    step(sheet, 5);
    continueSheet(sheet, 'Extension Lead');
    act('fail');
    const fs = F.openSheetEl(app);
    const list = fs.querySelector('.reasonlist');
    const btn = F.tapTarget(app, 'reason', { 'data-r': 'Damaged Plug' });
    btn.parentNode = list;
    list.dispatch('click', { target: btn });
    const confirm = F.openSheetEl(app);
    confirm.querySelector('#sheet-cancel').onclick();
    A.eq('nothing written', itemCodes().length, 0);
    // ⚠ "No, not all of them" must cost a tap, not a walk back to the shelf.
    A.ok('the run survives', !!st.pending && st.pending.count === 6);
  });

  A.group('16m a single item still fails on one reason with no extra question', () => {
    // ⚠ THE PAIR TO 16k. Without this, a confirmation added to EVERY fail would
    // pass 16k perfectly and slow down the outcome that happens all day.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.pending = { code: 'A1', mode: AUDIT, description: '', cls: '1', visual: false };
    act('fail');
    const fs = F.openSheetEl(app);
    const list = fs.querySelector('.reasonlist');
    const btn = F.tapTarget(app, 'reason', { 'data-r': 'Damaged Plug' });
    btn.parentNode = list;
    list.dispatch('click', { target: btn });
    A.eq('written immediately, no second sheet', itemCodes().join(','), 'A1');
    A.eq('with the reason', st.records[st.records.length - 1].failReason, 'Damaged Plug');
  });

  A.group('16n PASS commits a run on one tap — the asymmetry is deliberate', () => {
    const sheet = openRunSheet('1000');
    step(sheet, 1);
    continueSheet(sheet, 'Kettle');
    act('pass');
    A.eq('two records, no question asked', itemCodes().join(','), '1000,1001');
  });

  // -------------------------------------------------------------------------
  // What the screen says while a run is pending
  // -------------------------------------------------------------------------

  A.group('16o the scan screen states the count before the thumb lands', () => {
    const sheet = openRunSheet('1000');
    step(sheet, 5);
    step(sheet, -1);
    step(sheet, -1);
    continueSheet(sheet, 'Kettle');
    const html = app.fn('renderScan')();
    // ⚠ THE BUTTONS THEMSELVES, not a line above them. PASS is one tap and no
    // confirmation, so the count has to be on the control being pressed.
    A.includes('PASS says how many', html, 'PASS ALL 4');
    A.includes('FAIL says how many', html, 'FAIL ALL 4');
    A.includes('the range is the headline', html, '1000 to 1003');
    A.includes('with the count beside the description', html, '4 items');
    A.includes('and discard names the run', html, 'Discard this run');
  });

  A.group('16p ⚠ and an ordinary pending scan is unchanged by any of it', () => {
    // The regression that would be invisible on a phone until the day someone
    // scanned a single item: bare PASS/FAIL, the code as the headline.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    st.pending = { code: 'A1', mode: AUDIT, description: '', cls: '1', visual: false };
    const html = app.fn('renderScan')();
    A.includes('PASS is bare', html, '>PASS<');
    A.includes('FAIL is bare', html, '>FAIL<');
    A.excludes('no run wording', html, 'PASS ALL');
    A.includes('and discard is a scan', html, 'Discard this scan');
  });

  // -------------------------------------------------------------------------
  // 7A / 8A — the log
  // -------------------------------------------------------------------------

  A.group('16q ⚠ every item row says which mode it was logged in, both ways', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    app.fn('addItemRecord')(
      { code: 'A2', mode: INITIAL, description: 'Kettle', cls: '1', visual: false }, 'pass', '');
    const html = app.fn('renderLogListHTML')();
    // ⚠ BOTH, AND THIS IS THE POINT OF 7A. The app's standing rule is that only
    // the non-default state is printed on the meta line, and a badge is exempt
    // because it costs the line nothing — but "exempt" only means anything if
    // the quiet one is actually printed. One label alone is the rule, not the
    // decision.
    A.includes('the initial one is labelled', html, 'INITIAL');
    A.includes('the audit one is labelled', html, 'AUDIT');
    A.eq('one badge per item row', (html.match(/class="row-mode/g) || []).length, 2);
    A.includes('the initial badge carries the green class', html, 'row-mode is-initial');
    A.includes('and the audit badge its own', html, 'row-mode is-audit');
  });

  A.group('16r ⚠ the badge is driven by the RECORD, not by the current toggle', () => {
    // ⚠ THE FAILURE THIS CATCHES IS RULE 11 IN MAP.md. Mode is frozen onto the
    // record at scan time; a badge read off state.mode would re-label the
    // morning's work green the moment the toggle was flipped, and the log is
    // the screen an engineer checks BECAUSE they think they had it in the
    // wrong mode.
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    st.mode = INITIAL;
    const html = app.fn('renderLogListHTML')();
    A.includes('still audit', html, 'row-mode is-audit');
    A.excludes('the toggle did not re-label it', html, 'row-mode is-initial');
    st.mode = AUDIT;
  });

  A.group('16s 8A — the unexported dot is gone from the log entirely', () => {
    F.resetApp(app);
    F.onScanScreenWithLocation(app, 'LOC-1');
    app.fn('addItemRecord')({ code: 'A1', mode: AUDIT, cls: '1', visual: false }, 'pass', '');
    const html = app.fn('renderLogListHTML')();
    A.excludes('no dot on an item row', html, 'row-dot');
    A.excludes('nor on a location row', html, 'Not exported');
    A.excludes('and the rule is gone from the stylesheet too', L.readFile('styles.css'), '.row-dot');
    // ⚠ AND THE INFORMATION IS STILL SOMEWHERE. Removing the marker is 8A;
    // removing the ability to know is not, and the count on the Log tab is what
    // makes the difference.
    // Two: the item, and the location it was logged under. The location record
    // is unexported in its own right until the batch goes out.
    A.eq('unexportedCount still reports', app.fn('unexportedCount')(), 2);
    A.includes('and the nav tab still carries it', app.fn('renderNav')('scan'), 'Log (2)');
  });

  A.group('16t the badge has a gutter to sit in', () => {
    // ⚠ MARKUP AND STYLESHEET TOGETHER, the V8 lesson (15b–15d). The badge is
    // absolutely positioned; without the extra right padding on .row-item a
    // long asset code runs underneath it, which renders perfectly, passes every
    // behaviour assertion above, and is unreadable on the phone.
    const css = L.readFile('styles.css');
    A.includes('the badge is positioned', css, '.row-mode {');
    A.includes('and the row makes room for it', css, '.row-item { padding-right:');
    // ⚠ THE GREEN IS THE MODE TOKEN, NOT THE ACCENT. --accent-soft here would
    // tint the badge the same blue the app uses for everything else and destroy
    // the one-colour-one-meaning property the scan screen relies on.
    const badge = css.slice(css.indexOf('.row-mode.is-initial'), css.indexOf('.row-item { padding-right:'));
    A.includes('initial is --mode-tint', badge, 'var(--mode-tint)');
    A.excludes('and not the accent wash', badge, 'accent-soft');
  });
};
