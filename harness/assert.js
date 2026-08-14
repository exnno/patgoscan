/*
 * PATGo Scan — harness/assert.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * ⚠ A SECTION MUST REPORT A FAILURE, NEVER CRASH. mutate.js works by breaking
 * the source on purpose and checking the suite goes red — if a mutation makes
 * the runner throw instead, the mutation reads as "aborted" and tells you
 * nothing. Every group body runs inside a try/catch for that reason.
 *
 * ⚠ ASK OF EVERY NEW ASSERTION: COULD THIS PASS ON BROKEN CODE? The three
 * shapes that have got through before are (1) the right result reached by the
 * wrong mechanism, (2) a path that cannot execute headlessly, and (3) test data
 * that never reaches the branch being tested. A green assertion nobody has
 * tried to break is an assertion nobody knows works.
 */

let passed = 0;
let failed = 0;
let knownCount = 0;
let knownFixed = 0;
const failures = [];
let currentGroup = '';

function group(name, fn) {
  currentGroup = name;
  try {
    fn();
  } catch (err) {
    failed++;
    failures.push(name + ' — group threw: ' + (err && err.message));
  }
  currentGroup = '';
}

function ok(label, cond) {
  if (cond) { passed++; return true; }
  failed++;
  failures.push((currentGroup ? currentGroup + ' › ' : '') + label);
  return false;
}

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; return true; }
  failed++;
  failures.push((currentGroup ? currentGroup + ' › ' : '') + label +
    '\n      expected: ' + e + '\n      actual:   ' + a);
  return false;
}

function includes(label, haystack, needle) {
  return ok(label, String(haystack).indexOf(needle) !== -1);
}

function excludes(label, haystack, needle) {
  return ok(label, String(haystack).indexOf(needle) === -1);
}

function throws(label, fn) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  return ok(label, threw);
}

// A real bug found mid-release goes here rather than being deleted or left red.
// It reports as a known defect, does not block the run, and announces itself
// the moment it starts passing.
function known(label, cond) {
  if (cond) { knownFixed++; console.log('  ~ KNOWN DEFECT APPEARS FIXED: ' + label); }
  else { knownCount++; }
}

function summary() {
  console.log('');
  if (failures.length) {
    console.log('FAILURES');
    failures.forEach(f => console.log('  ✗ ' + f));
    console.log('');
  }
  if (knownCount) console.log(knownCount + ' known defect(s) still open');
  if (knownFixed) console.log(knownFixed + ' known defect(s) appear fixed — promote them');
  console.log(passed + ' passed, ' + failed + ' failed');
  return failed === 0;
}

function counts() { return { passed, failed }; }

module.exports = { group, ok, eq, includes, excludes, throws, known, summary, counts };
