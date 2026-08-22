/*
 * PATGo Scan — harness/tests/15-layout.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * V8 — THE SCAN SCREEN FITS ON THE PHONE.
 *
 * ⚠ READ THIS BEFORE ADDING ANYTHING HERE. There is no box model in Node. This
 * file CANNOT prove that the scan screen fits a 402x874pt viewport, and any
 * assertion written as though it can is lying. What it can prove is narrower
 * and still worth having:
 *
 *   1. THE MARKUP THAT PRODUCES THE SHORT LAYOUT IS STILL THE MARKUP BEING
 *      RENDERED (15b, 15c, 15d) — behaviourally, through render.js, not by
 *      reading the stylesheet and hoping.
 *
 *   2. THE DECLARED VALUES HAVE NOT CREPT BACK UP (15e). This is the failure
 *      this group actually exists for. V8 bought its ~150px one 4px at a time,
 *      and every one of those is a number somebody could reasonably raise again
 *      in a later release without ever seeing the screen it breaks — because
 *      on the phone it will not break, it will just quietly go one line too
 *      long again. A budget you cannot see is a budget nobody defends.
 *
 *   3. THE HOME INDICATOR INSET IS APPLIED ONCE (15a). The V8 bug, and the one
 *      with the longest reach: it was wrong on every screen in the app for
 *      seven releases and looked like nothing at all.
 */

const A = require('../assert');
const F = require('../fixture');
const L = require('../load');

// Pull the declarations for a selector out of the stylesheet.
//
// ⚠ EVERY BLOCK FOR THAT SELECTOR, NOT THE FIRST ONE. A selector may legally be
// declared more than once and the cascade applies all of them — `.locbar.is-set`
// is declared twice here, once for its border colour beside the other state
// rules and once for the V8 row collapse beside its own reasoning. The first
// draft of this helper returned only the first block and reported the V8 rule
// as missing when it was present and working. That is a harness defect of the
// classic shape: it would have sent somebody to "fix" correct code.
//
// ⚠ ANCHORED ON THE NEWLINE BEFORE THE SELECTOR so `.main` does not match
// inside `.main--nonav`, and returns '' rather than throwing when a selector
// has been renamed — a rename must FAIL an assertion below with a readable
// message, not crash the group and report nothing at all.
function ruleBlock(css, selector) {
  const needle = '\n' + selector + ' {';
  let out = '';
  let at = css.indexOf(needle);
  while (at !== -1) {
    const open = css.indexOf('{', at);
    const close = css.indexOf('}', open);
    if (close === -1) break;
    out += css.slice(open + 1, close) + '\n';
    at = css.indexOf(needle, close);
  }
  return out;
}

// First integer of a named property inside a block, or -1.
function px(block, prop) {
  const m = new RegExp(prop + ':\\s*([0-9]+)px').exec(block);
  return m ? parseInt(m[1], 10) : -1;
}

module.exports = function (app) {
  const st = app.state();
  const AUDIT = app.val('MODE_AUDIT');
  const INITIAL = app.val('MODE_INITIAL');
  // ⚠ COMMENTS STRIPPED FIRST, AND THIS IS NOT FUSSINESS. Every rule this file
  // guards has a block comment above it explaining why the value is what it is,
  // and those comments necessarily quote the property they are about. The first
  // draft scanned the raw file and reported `body` as carrying the bottom inset
  // because the comment saying it must NOT carry it contains the words. A
  // source guard that reads prose is a source guard that fails on documentation.
  const css = L.readFile('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

  // -------------------------------------------------------------------------
  // 15a — the inset that was counted twice
  // -------------------------------------------------------------------------

  A.group('15a ⚠ THE HOME INDICATOR INSET IS APPLIED ONCE, NOT TWICE', () => {
    // Until V8, `body` carried padding-bottom: env(safe-area-inset-bottom) AND
    // so did .nav, and so did .main--nonav. .screen is min-height:100vh, so the
    // document came out ~34px taller than the phone on EVERY screen — always
    // scrollable by a thumb's width, never able to fit anything exactly. It
    // presented as "the layout is slightly too big", which is unfalsifiable by
    // eye because it was equally true everywhere.
    //
    // ⚠ AN ALLOW-LIST, NOT A CHECK ON body. The first draft of this group
    // asserted only "body does not carry it" and mutation M155 walked straight
    // past it by moving the inset one level down onto .screen — same doubling,
    // same 34px, same invisible symptom, green suite. The bug is not "body has
    // it", it is "something BEHIND the bottom edge has it", and .screen, .app,
    // a wrapper added in some future release and body are all that same thing.
    //
    // So the property asserted is the exact set of selectors allowed to carry
    // the inset at all. Each is genuinely AT the bottom edge in some situation:
    //   .nav          — the bottom edge on the three tabbed screens
    //   .main         — clears the sticky nav while the page is scrolled
    //   .main--nonav  — the bottom edge on the four back-arrow pages
    //   .bulk-sheet   — the bottom edge whenever a sheet is open
    //   .update-banner — floats clear of the nav
    //
    // ⚠ ADDING A SELECTOR HERE IS A DELIBERATE ACT. If a new rule needs the
    // inset, ask first whether the element is really at the bottom edge or
    // merely near it — the second answer is what caused this bug.
    const ALLOWED = ['.nav', '.main', '.main--nonav', '.bulk-sheet', '.update-banner'];
    const carriers = [];
    let at = css.indexOf('safe-area-inset-bottom');
    while (at !== -1) {
      const open = css.lastIndexOf('{', at);
      const prev = Math.max(css.lastIndexOf('}', open), css.lastIndexOf('*/', open));
      const sel = css.slice(prev + 1, open).trim().split('\n').pop().trim();
      if (carriers.indexOf(sel) === -1) carriers.push(sel);
      at = css.indexOf('safe-area-inset-bottom', at + 1);
    }

    A.ok('the inset is used somewhere at all', carriers.length > 0);
    carriers.forEach((sel) => {
      A.ok('⚠ ' + sel + ' is allowed to carry the bottom inset',
        ALLOWED.indexOf(sel) !== -1);
    });

    // And every one of them still does, or de-duplicating has simply LOST the
    // inset rather than removed a copy of it — content under the home indicator
    // instead of a 34px gap above it. Identical in a test that only counts.
    ALLOWED.forEach((sel) => {
      A.ok(sel + ' still carries it', carriers.indexOf(sel) !== -1);
    });
  });

  // -------------------------------------------------------------------------
  // 15b — the prompt sub-line is Initial-only (3C)
  // -------------------------------------------------------------------------

  A.group('15b the "Scan an asset" sub-line appears in Initial only', () => {
    // ⚠ THROUGH renderScan(), NOT BY GREPPING THE SOURCE. The mode is read off
    // state at render time and the whole point of 3C is that the same function
    // produces two different heights; a source grep would pass on a build where
    // the ternary had been inverted.
    F.resetApp(app);

    st.mode = AUDIT;
    const audit = app.fn('renderScan')();
    A.ok('the prompt itself is there in Audit', audit.indexOf('prompt-big') !== -1);
    A.ok('⚠ but Audit has NO sub-line', audit.indexOf('prompt-small') === -1);
    A.ok('and it does not restate the mode switch',
      audit.indexOf('pass or fail only') === -1);

    st.mode = INITIAL;
    const init = app.fn('renderScan')();
    A.ok('⚠ Initial DOES have one', init.indexOf('prompt-small') !== -1);
    A.ok('and it warns about the description sheet',
      init.indexOf('asked for a description') !== -1);
  });

  A.group('15b2 the sub-line is gone entirely once a scan is pending', () => {
    // Not a V8 change — the prompt is replaced by the pending panel and always
    // was. Asserted because 3C put a mode test inside the branch that builds
    // the prompt, and a mistake there would render BOTH panels rather than
    // neither, which on the phone reads as the screen suddenly growing 100px
    // at the exact moment PASS and FAIL need to be under the thumb.
    F.resetApp(app);
    st.mode = INITIAL;
    st.pending = { code: 'A-100', mode: INITIAL, description: 'Kettle', cls: '1' };
    const html = app.fn('renderScan')();
    A.ok('the pending panel is up', html.indexOf('pending-code') !== -1);
    A.ok('⚠ and the prompt is not', html.indexOf('prompt-big') === -1);
    A.ok('⚠ nor its sub-line', html.indexOf('prompt-small') === -1);
    A.ok('PASS and FAIL are on screen', html.indexOf('btn-pass') !== -1);
    st.pending = null;
  });

  // -------------------------------------------------------------------------
  // 15c — the last item block is one row (4B)
  // -------------------------------------------------------------------------

  A.group('15c ⚠ THE LAST ITEM IS ONE ROW, ACTIONS INSIDE IT', () => {
    // V6 stacked four lines: label / code+result / description / Edit+Undo,
    // ~141px, entirely below the fold on a 17 Pro. The V6 backlog called that
    // outcome in advance — "a placement problem, not an idea problem".
    //
    // ⚠ ASSERTED AS "THE ACTIONS ARE INSIDE .lastitem-main", not merely as
    // "both exist". The CSS that pushes them right is margin-left:auto on
    // .lastitem-acts, which does nothing at all unless the actions are a child
    // of the flex row. Markup and stylesheet together, or either half is
    // silently useless — the V7 toggle-grid lesson, same shape.
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'A-100', mode: AUDIT }, 'pass', '');
    const html = app.fn('renderLastItem')();

    A.ok('the block renders', html.indexOf('lastitem') !== -1);
    A.ok('the code is on it', html.indexOf('A-100') !== -1);
    A.ok('and the result', html.indexOf('PASS') !== -1);

    const mainAt = html.indexOf('lastitem-main');
    const actsAt = html.indexOf('lastitem-acts');
    const closeAt = html.indexOf('</div>', mainAt);
    A.ok('the actions are present', actsAt !== -1);
    A.ok('⚠ and they are INSIDE the main row', actsAt > mainAt && actsAt < closeAt);

    // The standing label was explaining a block that explains itself.
    A.ok('⚠ the standing "Last recorded" label is gone',
      html.indexOf('lastitem-label') === -1);

    const rules = ruleBlock(css, '.lastitem-acts');
    A.ok('⚠ and the rule that pushes them right is present',
      /margin-left:\s*auto/.test(rules));
  });

  A.group('15c2 an audit item is one line and an initial item is two', () => {
    // ⚠ THE DIFFERENCE IS THE WHOLE POINT AND IT IS EASY TO LOSE. Audit items
    // are most of them; giving the block a constant height by always emitting
    // the sub-line would cost ~20px on almost every scan and buy nothing. But
    // dropping the line ALTOGETHER is the other failure, and it is the worse
    // one: a mistyped description is the only thing on this block that cannot
    // be checked by looking at the screen, and it is invisible until it reaches
    // the client. Both directions are asserted here on purpose.
    F.resetApp(app);
    app.fn('addItemRecord')({ code: 'A-100', mode: AUDIT }, 'pass', '');
    A.ok('⚠ an audit item has NO second line',
      app.fn('renderLastItem')().indexOf('lastitem-sub') === -1);

    F.resetApp(app);
    app.fn('addItemRecord')(
      { code: 'A-200', mode: INITIAL, description: 'Kettle', cls: '1' }, 'pass', '');
    const html = app.fn('renderLastItem')();
    A.ok('⚠ an initial item DOES', html.indexOf('lastitem-sub') !== -1);
    A.ok('and it carries the description', html.indexOf('Kettle') !== -1);
    A.ok('and the class', html.indexOf('Class 1') !== -1);
  });

  // -------------------------------------------------------------------------
  // 15d — the location bar collapses only when set
  // -------------------------------------------------------------------------

  A.group('15d the location bar is one line when set, stacked when not', () => {
    // ⚠ THE ARMED STATE MUST STAY TALL. It is the one moment the bar is trying
    // to catch the eye — shrinking the state that is shouting to save 21px on
    // the state that is idle would be exactly backwards, and it is the obvious
    // "tidy-up" for somebody who reads the .is-set rule and not this comment.
    F.resetApp(app);

    let html = app.fn('renderScan')();
    A.ok('with no location the bar is the empty one', html.indexOf('locbar is-empty') !== -1);

    st.locationArmed = true;
    A.ok('armed renders the armed state',
      app.fn('renderScan')().indexOf('locbar is-armed') !== -1);
    st.locationArmed = false;

    F.onScanScreenWithLocation(app, 'LOC-42');
    A.ok('once set it is the set state',
      app.fn('renderScan')().indexOf('locbar is-set') !== -1);

    // The collapse is a rule on .is-set alone. If it ever migrates to .locbar
    // it silently flattens the armed callout too.
    A.ok('⚠ the row rule is on .is-set', /flex-direction:\s*row/.test(ruleBlock(css, '.locbar.is-set')));
    A.ok('⚠ and NOT on .locbar itself', /flex-direction:\s*column/.test(ruleBlock(css, '.locbar')));
    A.ok('the barcode does not truncate',
      ruleBlock(css, '.locbar.is-set .locbar-hint').indexOf('flex: 0 0 auto') !== -1);
  });

  // -------------------------------------------------------------------------
  // 15e — the height budget
  // -------------------------------------------------------------------------

  A.group('15e ⚠ THE SCAN SCREEN HEIGHT BUDGET HAS NOT CREPT BACK', () => {
    // ⚠ WHAT THIS IS AND IS NOT. It is NOT a layout assertion — nothing here
    // measures anything, and a build that passes this can still overflow if a
    // whole new block is added to the screen. It is a RATCHET: the declared
    // values V8 spent its ~150px on, with a ceiling on each, so that raising
    // one back fails here with the number in the message rather than silently
    // costing a line on the phone six months from now.
    //
    // ⚠ IF YOU NEED TO RAISE ONE OF THESE, RAISE THE CEILING DELIBERATELY AND
    // SAY WHY IN THE HANDOFF. That is the entire mechanism. A ceiling quietly
    // edited to match a new value is the same as not having one.
    const budget = [
      ['.modeswitch',  'margin-bottom', 10],
      ['.locbar',      'margin-bottom', 10],
      ['.toggrid',     'margin-bottom', 10],
      ['.toggrid',     'row-gap',        6],
      ['.tog-opt',     'min-height',    36],
      ['.scanbox',     'min-height',    52],
      ['.prompt',      'padding',       12],
      ['.counts',      'padding',        8],
      ['.lastitem',    'margin-top',    10],
    ];
    budget.forEach(([sel, prop, ceiling]) => {
      const v = px(ruleBlock(css, sel), prop);
      A.ok(sel + ' ' + prop + ' is findable', v !== -1);
      A.ok('⚠ ' + sel + ' ' + prop + ' is at most ' + ceiling + 'px (found ' + v + ')',
        v !== -1 && v <= ceiling);
    });

    // The bottom gutter is derived from the nav rather than a flat number, so
    // it is checked by shape rather than by value. The flat 96px it replaced is
    // the specific thing that must not come back: it was ~47px of dead space on
    // any phone with no home indicator.
    const main = ruleBlock(css, '.main');
    A.ok('⚠ the flat 96px bottom gutter is gone', main.indexOf('96px') === -1);
    A.ok('and the gutter is derived from the inset', /calc\(\s*60px/.test(main));
  });
};
