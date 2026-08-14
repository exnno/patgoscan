/*
 * 02-boot — the integrity guard and the crash nets.
 * (c) 2026 Peter Birchley. All rights reserved.
 */

const A = require('../assert');
const L = require('../load');

module.exports = function (app) {

  A.group('02a one integrity probe per script file', () => {
    // ⚠ THIS IS A ROLL-CALL, NOT A LIST OF IMPORTANT FUNCTIONS. A script file
    // with no probe can be referenced by index.html, never actually uploaded,
    // and fail silently until an engineer taps something an hour into a job.
    const boot = L.readFile('boot.js');
    const block = boot.slice(boot.indexOf('REQUIRED_FNS'), boot.indexOf('];', boot.indexOf('REQUIRED_FNS')));
    const probes = (block.match(/'([A-Za-z_$][\w$]*)'/g) || []).map(s => s.slice(1, -1));

    // Every file except state.js (declares no functions), boot.js itself and
    // render.js's markup-only helpers must contribute exactly one probe.
    const files = L.scriptOrderFromIndex().filter(f => f !== 'boot.js' && f !== 'state.js');
    files.forEach((f) => {
      const fns = L.topLevelFns(L.readFile(f));
      const covered = probes.some(p => fns.indexOf(p) !== -1);
      A.ok(f + ' has an integrity probe', covered);
    });

    // And every probe must name a function that actually exists, or the guard
    // fails on a healthy build and nobody can start the app at all.
    probes.forEach((p) => {
      A.ok('probe ' + p + ' resolves', typeof app.fn(p) === 'function');
    });
  });

  A.group('02b constants are probed by name, not via window', () => {
    // A top-level const does not attach to window, so window.APP_VERSION is
    // undefined on a perfectly healthy build. Checking constants the same way
    // as functions would fail every boot.
    const boot = L.stripComments(L.readFile('boot.js'));
    A.includes('constants checked with typeof', boot, 'typeof APP_VERSION !==');
    A.ok('no eval used', boot.indexOf('eval(') === -1);
    A.ok('constants not read off window', boot.indexOf('window.APP_VERSION') === -1);
  });

  A.group('02c the guard passes on a healthy build', () => {
    A.ok('bootIntegrityOK returns true', app.fn('bootIntegrityOK')() === true);
  });

  A.group('02d the guard call site is wrapped', () => {
    // ⚠ bootIntegrityOK CAN THROW — typeof on a TDZ binding does. If the call
    // site were a bare `if`, the throw would escape and the recovery screen
    // would never paint: a white screen instead of a message.
    const boot = L.readFile('boot.js');
    const idx = boot.indexOf('_bootIntegrity = bootIntegrityOK()');
    A.ok('call site found', idx !== -1);
    const before = boot.slice(Math.max(0, idx - 120), idx);
    A.includes('wrapped in try', before, 'try {');
  });

  A.group('02e the SW registers even when load() throws', () => {
    // The cache-first worker is what makes a bad release unfixable if the page
    // can no longer register, receive an update and post SKIP_WAITING.
    const boot = L.readFile('boot.js');
    const catchIdx = boot.indexOf('_bootLoadOK = false');
    const regIdx = boot.indexOf('registerServiceWorker();', catchIdx);
    A.ok('registration happens after the try/catch', regIdx > catchIdx);
  });

  A.group('02f both crash screens exist and read differently', () => {
    const boot = L.readFile('boot.js');
    A.includes('guard screen wording', boot, 'did not load completely');
    A.includes('load screen wording', boot, 'could not finish updating');
    A.includes('reassures about data', boot, 'have not been touched');
  });

  A.group('02g the crash link does not depend on bugreport.js', () => {
    // These screens appear precisely when the app failed to load, so they must
    // not call into another file that may not have parsed. Do not "DRY" this.
    const boot = L.readFile('boot.js');
    const fnStart = boot.indexOf('function _crashReportLink');
    const fnEnd = boot.indexOf('\n}', fnStart);
    const body = boot.slice(fnStart, fnEnd);
    A.ok('builds its own mailto', body.indexOf('mailto:') !== -1);
    A.ok('does not call openBugReport', body.indexOf('openBugReport') === -1);
    A.ok('does not call _diagnostics', body.indexOf('_diagnostics') === -1);
  });

  A.group('02h optional inits are guarded and wrapped', () => {
    const boot = L.readFile('boot.js');
    ['initErrorCapture', 'initDelegation', 'initScanner'].forEach((fn) => {
      const i = boot.indexOf(fn + '();');
      A.ok(fn + ' is typeof-guarded', boot.slice(Math.max(0, i - 90), i).indexOf('typeof ' + fn) !== -1);
      A.ok(fn + ' is wrapped', boot.slice(Math.max(0, i - 110), i).indexOf('try {') !== -1);
    });
  });
};
