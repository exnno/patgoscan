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
    A.eq('the app version is V3', app.val('APP_VERSION'), 'V3');
    A.eq('the welcome rolled with it', app.val('WELCOME_VERSION'), 'V3');
    A.eq('the cache key matches', L.cacheVersion(), 'scan-v3');
    A.ok('About leads with V3',
      app.fn('renderAbout')().indexOf('<b>V3</b>') !== -1);
    // Rolling three: V3, V2, V1.1. ⚠ V1 must have DROPPED OFF — asserting only
    // that the oldest is present would stay green on a changelog that had
    // simply grown a fourth entry and never dropped anything.
    A.ok('and still lists three, oldest V1.1',
      app.fn('renderAbout')().indexOf('<b>V1.1</b>') !== -1);
    A.ok('with V1 dropped off the bottom',
      app.fn('renderAbout')().indexOf('<b>V1</b>') === -1);
    // The amber set is kept in the stylesheet on purpose — it is the one-edit
    // route back if the two apps ever do get confused on a job.
    A.ok('the V1 amber palette is still recorded', css.indexOf('#b45309') !== -1);
  });

  // --- V3: the sheet / keyboard fix ---------------------------------------
  //
  // The bug these guard: a sheet is fixed to the LAYOUT viewport, which iOS
  // does not shrink for the keyboard, so a sheet that focused a field put its
  // own buttons underneath the keyboard and the page slid about trying to
  // reveal the field. The stub keeps innerHeight at 844 while visualViewport
  // shrinks, because that discrepancy IS the bug — a stub that shrank both
  // would let a sheet sized from innerHeight pass.

  const vv = app.ctx.visualViewport;

  A.group('10k a sheet is sized from the visual viewport, not the screen', () => {
    F.resetApp(app);
    vv.reset();
    app.fn('openConfirmSheet')({ title: 'Anything' });
    const wrap = app.doc.getElementById('sheet-backdrop');
    A.ok('the backdrop is findable by id', !!wrap);
    A.eq('it is as tall as the visible area', wrap.style.height, '844px');
    A.eq('and starts at its top', wrap.style.top, '0px');
    // ⚠ THE LOAD-BEARING ONE. inset:0 in the stylesheet pins both top and
    // bottom, and a fixed box pinned both ways ignores height entirely. Leave
    // bottom set and every other assertion here still passes while the sheet
    // stays full-screen and the fix does nothing at all.
    A.eq('with bottom released so height can win', wrap.style.bottom, 'auto');
    app.fn('closeSheet')();
  });

  A.group('10l the sheet follows the keyboard up', () => {
    F.resetApp(app);
    vv.reset();
    app.fn('openConfirmSheet')({ title: 'Anything' });
    const wrap = app.doc.getElementById('sheet-backdrop');
    // Fired through the viewport's own listeners — the surface the browser
    // uses — not by calling the sync function directly. A sync that was never
    // wired to a listener passes every direct call and nothing in a browser.
    vv.keyboard(336);
    A.eq('the backdrop shrank with it', wrap.style.height, '508px');
    A.eq('while the layout viewport did not move', app.ctx.innerHeight, 844);
    vv.keyboard(0);
    A.eq('and grows back when the keyboard goes', wrap.style.height, '844px');
    app.fn('closeSheet')();
  });

  A.group('10m the viewport listener does not leak', () => {
    F.resetApp(app);
    vv.reset();
    app.fn('openConfirmSheet')({ title: 'One' });
    A.eq('one resize listener while open', vv._count('resize'), 1);
    // _openSheet closes any previous sheet first, so an unbind that only ran on
    // an explicit close would accumulate one listener per sheet for the life of
    // the page — and every one of them would keep firing.
    app.fn('openConfirmSheet')({ title: 'Two' });
    A.eq('still one after reopening over it', vv._count('resize'), 1);
    A.eq('and one scroll listener', vv._count('scroll'), 1);
    app.fn('closeSheet')();
    A.eq('none once closed', vv._count('resize'), 0);
    A.eq('none once closed, scroll too', vv._count('scroll'), 0);
  });

  A.group('10n an open sheet is visible to sheetIsOpen', () => {
    // Newly observable in V3: until the stub registered appended ids,
    // getElementById could not see the backdrop and this returned false with a
    // sheet plainly open. It matters beyond the sheets — the scanner refuses to
    // collect a burst while one is open, and that refusal was untested.
    F.resetApp(app);
    A.ok('nothing open to start', !app.fn('sheetIsOpen')());
    app.fn('openConfirmSheet')({ title: 'Anything' });
    A.ok('open once a sheet is built', app.fn('sheetIsOpen')());
    app.fn('closeSheet')();
    A.ok('closed once it is dismissed', !app.fn('sheetIsOpen')());
    A.ok('and the backdrop is gone from the document',
      app.doc.getElementById('sheet-backdrop') === null);
  });

  A.group('10o every sheet field is focused through focusSheetField', () => {
    // ⚠ SOURCE GUARDS, AND THEY SAY SO. The focus calls sit inside setTimeout
    // and the harness clock never fires, so there is no honest way to observe
    // the focus itself here. What can be proven is that no sheet builder has
    // grown a bare .focus() back, and that the one shared path still passes
    // preventScroll — the thing that stops the browser scrolling the document
    // to reveal the field.
    const fb = L.stripComments(L.readFile('feedback.js'));
    const rn = L.stripComments(L.readFile('render.js'));
    A.ok('focusSheetField exists', fb.indexOf('function focusSheetField') !== -1);
    A.ok('and it asks for preventScroll', fb.indexOf('preventScroll: true') !== -1);
    A.ok('with a fallback for engines that reject the options object',
      fb.split('.focus(').length - 1 >= 2);
    A.ok('render.js focuses nothing directly', rn.indexOf('.focus(') === -1);
    A.eq('both of its sheet fields go through the helper',
      rn.split('focusSheetField(').length - 1, 2);
    A.ok('and so does the name sheet', fb.indexOf('focusSheetField(input') !== -1);
  });

  A.group('10p the stylesheet lets a sheet fit above a keyboard', () => {
    // ⚠ STRIPPED, and 10g above is not — the difference is that this group
    // asserts a string is ABSENT. The comment explaining why 88vh had to go
    // says "88vh", so the unstripped file fails its own test. Presence
    // assertions never hit this; absence assertions always do.
    const css = L.stripComments(L.readFile('styles.css'));
    // ⚠ 88vh is a fraction of the SCREEN. With the keyboard up that is taller
    // than the space that exists, and the sheet overflows off the top of its
    // own flex-end container — the title disappears. Its absence is the
    // assertion; a percentage of the backdrop is the replacement.
    A.ok('the sheet is no longer measured against the screen',
      css.indexOf('88vh') === -1);
    A.ok('it is measured against the backdrop instead',
      css.indexOf('max-height: calc(100% - 44px)') !== -1);
    A.ok('and a drag inside it cannot reach the page',
      css.indexOf('overscroll-behavior: contain') !== -1);
  });
};
