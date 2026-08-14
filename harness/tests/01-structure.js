/*
 * 01-structure — the checks that used to be manual steps.
 * (c) 2026 Peter Birchley. All rights reserved.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const A = require('../assert');
const L = require('../load');

module.exports = function (app) {

  A.group('01a every script file parses', () => {
    L.scriptOrderFromIndex().forEach((f) => {
      let threw = false;
      try { new vm.Script(L.readFile(f), { filename: f }); } catch (e) { threw = true; }
      A.ok(f + ' parses', !threw);
    });
  });

  A.group('01b no duplicate top-level declarations across files', () => {
    // ⚠ THE DATA-LOSS CLASS. All files share one global scope, so the same
    // top-level const in two loaded files is a fatal SyntaxError that kills a
    // whole file silently. If the file it kills is storage.js, the app comes up
    // looking fine, finds no data, and saves that emptiness over the top.
    const seen = {};
    const dupes = [];
    L.scriptOrderFromIndex().forEach((f) => {
      L.topLevelDecls(L.readFile(f)).forEach((d) => {
        if (seen[d.name]) dupes.push(d.name + ' in ' + seen[d.name] + ' and ' + f);
        else seen[d.name] = f;
      });
    });
    A.eq('no duplicates', dupes, []);
  });

  A.group('01c load order matches sw.js ASSETS', () => {
    const order = L.scriptOrderFromIndex();
    const assets = L.assetsFromSW();
    order.forEach(f => A.ok(f + ' is precached', assets.indexOf(f) !== -1));
    // Every .js in ASSETS must be a real file — a stale entry means the SW
    // install fails wholesale and NOTHING is cached.
    assets.forEach((a) => {
      A.ok(a + ' exists on disk', fs.existsSync(path.join(L.ROOT, a)));
    });
  });

  A.group('01d boot.js is last', () => {
    const order = L.scriptOrderFromIndex();
    A.eq('last script is boot.js', order[order.length - 1], 'boot.js');
  });

  A.group('01e the harness is not shipped', () => {
    const assets = L.assetsFromSW();
    const html = L.readFile('index.html');
    A.ok('harness not in ASSETS', !assets.some(a => a.indexOf('harness') === 0));
    A.ok('harness not in index.html', html.indexOf('harness/') === -1);
  });

  A.group('01f copyright header in every file', () => {
    const files = L.scriptOrderFromIndex().concat(['sw.js', 'index.html', 'styles.css']);
    files.forEach((f) => {
      A.includes(f + ' carries the notice', L.readFile(f), 'Peter Birchley. All rights reserved.');
    });
  });

  A.group('01g banned dialogs are absent', () => {
    // prompt/confirm/alert can be suppressed silently by iOS inside a PWA, and
    // when they are, the app appears to do nothing at all.
    L.scriptOrderFromIndex().forEach((f) => {
      const src = L.stripComments(L.readFile(f));
      A.ok(f + ' has no prompt()', !/[^.\w]prompt\s*\(/.test(src));
      A.ok(f + ' has no alert()', !/[^.\w]alert\s*\(/.test(src));
      A.ok(f + ' has no bare confirm()', !/[^.\w]confirm\s*\(/.test(src));
    });
  });

  A.group('01h cache key uses the scan- prefix', () => {
    const v = L.cacheVersion();
    A.ok('cache key is scan-prefixed, not pat-', /^scan-v/.test(v));
  });

  A.group('01i storage keys are all scan-prefixed', () => {
    // A stray 'pat:' key would read or write PATGo's data if the two apps ever
    // ended up on one origin, and would make a backup file lie about its origin.
    // ⚠ Read the CODE, not the comments — config.js explains the prefix choice
    // in prose that necessarily mentions PATGo's prefix.
    const src = L.stripComments(L.readFile('config.js'));
    A.ok('no pat: keys', src.indexOf("'pat:") === -1);
    const keys = src.match(/'scan:[a-zA-Z]+'/g) || [];
    A.ok('scan: keys declared', keys.length >= 8);
  });
};
