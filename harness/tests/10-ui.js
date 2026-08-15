/*
 * 10-ui — screens, sheets and the stylesheet contract (V2).
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Layout cannot be measured headlessly: there is no box model here, so nothing
 * in this file can prove that two elements do not visually collide. What it
 * CAN prove is that the markup and the rules which produce the spacing are
 * both present and still pointing at each other — the failure mode being
 * guarded is a class rename or a deleted rule silently reverting a fix, not a
 * pixel being two out. Where an assertion is a source guard it says so.
 */

const A = require('../assert');
const F = require('../fixture');
const L = require('../load');

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');

  A.group('10a the item edit sheet shows the location', () => {
    // THE V2 BUG, behaviourally. Open the real sheet on a real record and read
    // what is on it — not what renderLogListHTML() would have produced, which
    // is a different screen and was never the thing that was wrong.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', INITIAL,
      { client: 'Acme Ltd', floor: 'Ground', room: 'Staff Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle' }, 'pass', '');
    const item = app.fn('itemRecords')()[0];

    app.fn('openEditSheet')(item.id);
    const sheet = F.openSheetEl(app);
    const html = sheet ? sheet.innerHTML : '';
    A.ok('the sheet opened', !!sheet);
    A.ok('it is labelled Location', html.indexOf('Location') !== -1);
    A.ok('and names the room', html.indexOf('Staff Kitchen') !== -1);
    A.ok('and carries the barcode', html.indexOf('LOC-1') !== -1);
    app.fn('closeSheet')();
  });

  A.group('10b the location on the sheet is read-only', () => {
    // Read-only THIS release; the move-to-another-location picker is a
    // separate one. If a future edit adds an input or a data-action inside the
    // metarow, that release has changed behaviour and should say so.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', INITIAL, { room: 'Staff Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL }, 'pass', '');
    app.fn('openEditSheet')(app.fn('itemRecords')()[0].id);
    const sheet = F.openSheetEl(app);
    const html = sheet ? sheet.innerHTML : '';
    const start = html.indexOf('metarow');
    const end = html.indexOf('</div>', start);
    const block = start === -1 ? '' : html.slice(start, end);
    A.ok('the metarow is present', start !== -1);
    A.ok('with no input in it', block.indexOf('<input') === -1);
    A.ok('and nothing tappable', block.indexOf('data-action') === -1);
    app.fn('closeSheet')();
  });

  A.group('10c an item with no location still opens its sheet', () => {
    // The degraded path has to be survivable, not just correct. A sheet that
    // throws on a swept record would make the item impossible to correct at
    // all — strictly worse than the bug V2 is fixing.
    F.resetApp(app);
    const loc = app.fn('addLocationRecord')('LOC-1', INITIAL, { room: 'Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL }, 'pass', '');
    app.fn('deleteRecord')(loc.id);
    const item = app.fn('itemRecords')()[0];
    let threw = false;
    try { app.fn('openEditSheet')(item.id); } catch (e) { threw = true; }
    A.eq('it did not throw', threw, false);
    const sheet = F.openSheetEl(app);
    A.ok('and still shows the surviving code',
      !!sheet && sheet.innerHTML.indexOf('LOC-1') !== -1);
    app.fn('closeSheet')();
  });

  A.group('10d the log row names the room, not the barcode', () => {
    // ⚠ THE ITEM ROW ONLY, AND THIS IS WHY. The list also renders a row for
    // the LOCATION itself, and that row has always carried "Staff Kitchen".
    // Searching the whole list for the room name therefore passes whatever the
    // item row says — the first version of this group did exactly that and
    // mutation M65 walked straight through it. Slice to the item row first.
    F.resetApp(app);
    app.fn('addLocationRecord')('LOC-1', INITIAL,
      { client: 'Acme Ltd', floor: 'Ground', room: 'Staff Kitchen' });
    app.fn('addItemRecord')({ code: 'A1', mode: INITIAL, description: 'Kettle' }, 'pass', '');
    const html = app.fn('renderLogListHTML')();

    const start = html.indexOf('row-item');
    A.ok('there is an item row', start !== -1);
    const end = html.indexOf('</button>', start);
    const itemRow = html.slice(start, end);

    A.ok('the item row names the room', itemRow.indexOf('Staff Kitchen') !== -1);
    A.ok('and not the raw location barcode', itemRow.indexOf('LOC-1') === -1);
  });

  A.group('10e Settings gives About its own section', () => {
    // The spacing fix had two halves and this is the one that is assertable:
    // the Help heading between the toggle rows and the About card. The CSS
    // half is guarded in 10g.
    F.resetApp(app);
    const html = app.fn('renderSettings')();
    const sound = html.indexOf('Sound on a result');
    const help = html.indexOf('>Help<');
    const about = html.indexOf('>About<');
    A.ok('Help is present', help !== -1);
    A.ok('it sits after the sound toggle', help > sound && sound !== -1);
    A.ok('and before About', about > help && about !== -1);
  });

  A.group('10f pages without a nav opt out of the nav gutter', () => {
    // ⚠ SOURCE GUARD, and deliberately so: the pairing this protects is
    // "no renderNav() call ⇒ main--nonav", which is a property of the whole
    // function and cannot be read off one rendered string. Every screen is
    // checked, so a NEW screen that forgets the class fails here rather than
    // shipping with an unexplained gap at the bottom.
    const src = L.readFile('render.js');
    const screens = [
      'renderScan', 'renderLog', 'renderSettings',
      'renderSettingsScanner', 'renderSettingsLists',
      'renderSettingsBackup', 'renderAbout',
    ];
    screens.forEach((name) => {
      const start = src.indexOf('function ' + name + '(');
      A.ok(name + ' exists', start !== -1);
      const next = src.indexOf('\nfunction ', start + 1);
      const body = src.slice(start, next === -1 ? src.length : next);
      const hasNav = body.indexOf('renderNav(') !== -1;
      const optsOut = body.indexOf('main--nonav') !== -1;
      A.eq(name + ': nav and gutter agree', hasNav, !optsOut);
    });
  });

  A.group('10g the stylesheet still carries the V2 spacing rules', () => {
    // Source guards on styles.css. There is no box model here, so the most
    // that can be proven is that the rule which produces the spacing has not
    // been deleted or renamed out from under the markup above.
    const css = L.readFile('styles.css');
    A.ok('a card following a toggle row is separated',
      css.indexOf('.rowline + .row') !== -1);
    A.ok('the no-nav gutter override exists',
      css.indexOf('.main--nonav') !== -1);
    A.ok('the read-only metarow is styled',
      css.indexOf('.metarow') !== -1);
  });

  A.group('10h the mode tint is its own token', () => {
    // ⚠ THE ONE THAT MATTERS IN THIS GROUP. --mode-tint must not collapse back
    // into --accent-soft: they were the same token in V1 because the accent
    // and the tint were both amber, and reuniting them under a blue accent
    // would tint the screen identically in both modes and destroy the
    // at-a-glance mode signal. Asserted as "declared, and different".
    const css = L.readFile('styles.css');
    A.ok('--mode-tint is declared', css.indexOf('--mode-tint:') !== -1);
    A.ok('Initial mode uses it', css.indexOf('.mode-initial { background: var(--mode-tint); }') !== -1);

    const block = css.slice(css.indexOf(':root {'), css.indexOf('[data-theme="dark"]'));
    const read = (name) => {
      const m = block.match(new RegExp('--' + name + ':\\s*([^;]+);'));
      return m ? m[1].trim() : null;
    };
    A.ok('the tint has a value', !!read('mode-tint'));
    A.ok('and it is not the accent wash', read('mode-tint') !== read('accent-soft'));
  });

  A.group('10i Initial mode still tints and Audit still does not', () => {
    // The behaviour the token exists for. One mode looks different; that is
    // the whole mechanism for spotting a wrong-mode scan in seconds.
    F.resetApp(app);
    st.mode = INITIAL;
    A.ok('Initial carries the tint class',
      app.fn('renderScan')().indexOf('mode-initial') !== -1);
    st.mode = AUDIT;
    A.ok('Audit does not',
      app.fn('renderScan')().indexOf('mode-initial') === -1);
  });

  A.group('10j the release strings all agree', () => {
    const css = L.readFile('styles.css');
    A.eq('the app version is V2', app.val('APP_VERSION'), 'V2');
    A.eq('the welcome rolled with it', app.val('WELCOME_VERSION'), 'V2');
    A.eq('the cache key matches', L.cacheVersion(), 'scan-v2');
    A.ok('About leads with V2',
      app.fn('renderAbout')().indexOf('<b>V2</b>') !== -1);
    A.ok('and still lists three versions, oldest last',
      app.fn('renderAbout')().indexOf('<b>V1</b>') !== -1);
    // The amber set is kept in the stylesheet on purpose — it is the one-edit
    // route back if the two apps ever do get confused on a job.
    A.ok('the V1 amber palette is still recorded', css.indexOf('#b45309') !== -1);
  });
};
