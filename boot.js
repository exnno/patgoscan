/*
 * PATGo Scan — boot.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * ⚠ THIS FILE RUNS ON LOAD AND MUST BE LAST IN index.html. Nothing executes
 * until it does; every other file only defines things.
 *
 * TWO INDEPENDENT NETS, NOT ONE.
 *   1. bootIntegrityOK() checks that one function from every script file
 *      actually loaded, BEFORE anything is allowed to touch storage.
 *   2. The try/catch around load() no-ops save() and render() and paints its
 *      own screen if the first one somehow passed and things still broke.
 * That redundancy is deliberate. Do not remove either on the grounds that the
 * other covers it.
 *
 * WHY THE GUARD EXISTS AT ALL. All files share one global scope. A duplicate
 * top-level `const` of the same name in two files is a fatal SyntaxError that
 * kills a WHOLE FILE silently — and if the file it killed was storage.js, the
 * app would come up looking fine, find no data, and then SAVE that emptiness
 * over the top of a day's work. That is not hypothetical; it happened in the
 * parent app. The guard's whole job is to refuse to save when the build is only
 * half loaded.
 */

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    }).catch((e) => console.warn('SW registration failed', e));

    // The page reloads when the new worker takes over. The engineer chooses the
    // moment by tapping the banner — an update must never reload the app under
    // someone mid-scan.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  } catch (e) {
    console.warn('SW registration threw', e);
  }
}

function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'update-banner';
  bar.className = 'update-banner';
  bar.innerHTML =
    '<span>An update is ready.</span>' +
    '<button type="button" id="ub-apply" class="btn btn-primary btn-sm">Update now</button>' +
    '<button type="button" id="ub-close" class="btn btn-ghost btn-sm">Later</button>';
  document.body.appendChild(bar);
  bar.querySelector('#ub-apply').onclick = applyUpdate;
  bar.querySelector('#ub-close').onclick = dismissUpdateBanner;
}

function applyUpdate() {
  try {
    navigator.serviceWorker.getRegistration().then((reg) => {
      const w = reg && (reg.waiting || reg.installing);
      if (w) w.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    });
  } catch (e) { window.location.reload(); }
}

function dismissUpdateBanner() {
  const bar = document.getElementById('update-banner');
  if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
}

// ---------------------------------------------------------------------------
// The integrity guard
//
// ⚠ ONE PROBE PER SCRIPT FILE — this is not a list of important functions, it
// is a roll-call. Adding a script file means adding a probe here, or a file
// that is referenced but never uploaded fails silently until a user taps
// something an hour into a job.
//
// ⚠ THIS FUNCTION CAN THROW. `typeof state` hits a temporal-dead-zone binding
// if config.js failed to parse, and the throw escapes an `if` and leaves a
// white screen. Its call site below is WRAPPED and a throw counts as a FAILED
// check. Never call it bare.
// ---------------------------------------------------------------------------
const REQUIRED_FNS = [
  'makeDefaultFailReasons',   // config.js
  'escapeHTML',               // utils.js
  'load',                     // storage.js
  'addItemRecord',            // log.js
  'showToast',                // feedback.js
  'initScanner',              // scanner.js
  'buildCSV',                 // csv.js
  'buildBackup',              // backup.js
  'render',                   // render.js
  'initDelegation',           // dispatch.js
  'initErrorCapture',         // bugreport.js
];

// ⚠ CONSTANTS NEED A DIFFERENT CHECK FROM FUNCTIONS. A top-level `const` does
// NOT attach to `window`, so window.APP_VERSION is undefined even when config.js
// loaded perfectly — checking them the same way as functions would report every
// constant in the app as missing. They are named directly below, which is the
// only thing that actually reads them. No eval: it is refused under a strict
// content-security policy and would turn a diagnostic into an outage.
function _constantsPresent() {
  try {
    return typeof APP_VERSION !== 'undefined' &&
           typeof RECORDS_KEY !== 'undefined' &&
           typeof CSV_COLUMNS !== 'undefined' &&
           _csvColumnsWellFormed() &&
           typeof SCAN_GAP_PRESETS !== 'undefined' &&
           typeof MODE_AUDIT !== 'undefined';
  } catch (e) {
    // A TDZ binding throws rather than reporting undefined — that is a fail.
    return false;
  }
}

// V5. ⚠ SHAPE, NOT JUST PRESENCE. CSV_COLUMNS stopped being a list of strings
// and became a list of { key, cell } — and it is now expected to be EDITED BY
// HAND between releases, to reorder the client's file. A hand edit that drops a
// comma or leaves a column without a cell function would not stop the app
// booting; it would stop the export, silently, at the end of a day's work. This
// is the one constant worth checking the inside of.
function _csvColumnsWellFormed() {
  if (!Array.isArray(CSV_COLUMNS) || !CSV_COLUMNS.length) return false;
  const seen = {};
  for (let i = 0; i < CSV_COLUMNS.length; i++) {
    const c = CSV_COLUMNS[i];
    if (!c || typeof c.key !== 'string' || !c.key) return false;
    if (typeof c.cell !== 'function') return false;
    // Two columns with one header is a file the client's importer reads wrong
    // rather than rejects, which is the worse of the two outcomes.
    if (seen[c.key]) return false;
    seen[c.key] = 1;
  }
  return true;
}

function bootIntegrityOK() {
  if (typeof state === 'undefined' || !state) return false;
  for (let i = 0; i < REQUIRED_FNS.length; i++) {
    if (typeof window[REQUIRED_FNS[i]] !== 'function') {
      console.error('Boot integrity: missing function ' + REQUIRED_FNS[i]);
      return false;
    }
  }
  if (!_constantsPresent()) {
    console.error('Boot integrity: config constants missing');
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Crash screens
//
// ⚠ THESE DELIBERATELY DUPLICATE PART OF bugreport.js. They appear precisely
// when the app has failed to load, so they must not depend on another file
// having parsed. Do not "DRY" this.
// ---------------------------------------------------------------------------
function _crashReportLink(context) {
  const body = 'PATGo Scan failed to start.\n\nContext: ' + context +
    '\nAgent: ' + String(navigator.userAgent || '').slice(0, 160);
  return 'mailto:hello@patgo.co.uk?subject=' +
    encodeURIComponent('PATGo Scan will not start') +
    '&body=' + encodeURIComponent(body);
}

function _paintCrashScreen(heading, message, context) {
  const el = document.getElementById('app');
  if (!el) return;
  el.innerHTML =
    '<div class="crash">' +
    '<h1>' + heading + '</h1>' +
    '<p>' + message + '</p>' +
    '<p><b>Your scans have not been touched.</b> Close the app completely from ' +
    'the app switcher, then open it again.</p>' +
    '<p><a href="' + _crashReportLink(context) + '">Email Peter about this</a></p>' +
    '</div>';
}

// ---------------------------------------------------------------------------
// The boot tail
//
// ORDER MATTERS. Error capture first so everything after it is covered. Then
// delegation and the scanner, so a screen that does paint is interactive. Then
// load() → theme → render, inside a try/catch.
// ---------------------------------------------------------------------------
let _bootIntegrity = false;
try {
  _bootIntegrity = bootIntegrityOK();
} catch (err) {
  // The wrap that stops a TDZ throw becoming a white screen.
  console.error('Boot integrity check threw.', err);
  _bootIntegrity = false;
}

if (!_bootIntegrity) {
  _paintCrashScreen(
    'Update needed',
    'The app did not load completely. This usually means an update was ' +
    'interrupted part-way through.',
    'integrity guard failed');
} else {
  // Every optional init is typeof-guarded AND wrapped: a broken optional
  // subsystem must never stop the app starting.
  try { if (typeof initErrorCapture === 'function') initErrorCapture(); } catch (e) { console.error(e); }
  try { if (typeof initDelegation === 'function') initDelegation(); } catch (e) { console.error(e); }
  try { if (typeof initScanner === 'function') initScanner(); } catch (e) { console.error(e); }

  let _bootLoadOK = true;
  try {
    load();
    applyTheme();
    render();
  } catch (err) {
    _bootLoadOK = false;
    console.error('Boot load/render failed.', err);
    _paintCrashScreen(
      'Something went wrong',
      'The app could not finish updating.',
      'load/render threw: ' + String((err && err.message) || err).slice(0, 120));
  }

  // ⚠ REGISTERED EVEN WHEN load() THREW. This is what makes the cache-first
  // service worker recoverable: a broken build keeps being served from cache
  // forever unless the page can still register, still receive an update, and
  // still post SKIP_WAITING. If registration sat inside the success branch, a
  // bad release would be unfixable without the engineer clearing site data.
  try { registerServiceWorker(); } catch (e) { console.error(e); }

  // Re-apply the theme when the phone flips to dark at sunset.
  try {
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if (state.theme === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  } catch (e) {}

  if (_bootLoadOK && typeof focusScanInput === 'function') {
    try { focusScanInput(); } catch (e) {}
  }
}
