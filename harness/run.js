/*
 * PATGo Scan — harness/run.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 *   node harness/run.js      → must end "N passed, 0 failed"
 *   node harness/mutate.js   → must end "N caught, 0 survived, 0 aborted"
 *
 * This runner already covers what used to be manual pre-flight steps: every
 * file parses, the duplicate top-level declaration scan, load order against
 * sw.js ASSETS, copyright headers and the banned-dialog sweep. Running those
 * separately is redundant.
 *
 * EVERY RELEASE EXTENDS THIS. Add the release's assertions to tests/ AND a
 * matching mutation to mutate.js, then ship both with the code. Coverage
 * compounds; prior coverage is never re-paid. Never delete a test file.
 */

const fs = require('fs');
const path = require('path');
const A = require('./assert');
const { loadApp } = require('./load');

const TESTS_DIR = path.join(__dirname, 'tests');

function run(quiet) {
  const files = fs.readdirSync(TESTS_DIR).filter(f => /\.js$/.test(f)).sort();
  let app;
  try {
    app = loadApp();
  } catch (err) {
    console.error('FATAL: the app would not load at all.');
    console.error(err && err.stack ? err.stack : err);
    return false;
  }

  files.forEach((f) => {
    if (!quiet) console.log('— ' + f.replace(/\.js$/, ''));
    let mod;
    try {
      mod = require(path.join(TESTS_DIR, f));
    } catch (err) {
      A.group(f, () => { throw err; });
      return;
    }
    // ⚠ WRAPPED. A mutation must make the suite REPORT a failure, never crash —
    // an aborted run tells you nothing about whether the assertion works.
    A.group(f + ' (file)', () => mod(app));
  });

  return A.summary();
}

if (require.main === module) {
  const ok = run(false);
  process.exit(ok ? 0 : 1);
}

module.exports = { run };
