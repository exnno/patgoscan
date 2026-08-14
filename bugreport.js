/*
 * PATGo Scan — bugreport.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * One-tap problem reporting, and the global error capture behind it.
 *
 * ⚠⚠ THE PRIVACY RULE: DIAGNOSTICS CARRY COUNTS AND FLAGS ONLY.
 * Never asset numbers, never barcodes, never client names, floors, rooms, item
 * descriptions or fail reasons. This report is emailed, and it belongs to a
 * client whose asset register is their own commercial data. Check every field
 * you add against this rule; the harness asserts it.
 *
 * Captured error TEXT is the one field the rule cannot cover by construction —
 * a stack trace can contain anything. _scrubCustomerData() redacts known
 * customer strings at report-build time and ⚠ FAILS CLOSED: if it cannot be
 * confident, the message is withheld rather than passed through. Do not add a
 * raw-text fallback "so we can see more".
 *
 * KNOWN LIMIT: boot.js loads last, so a parse-time failure in an earlier file
 * happens before these handlers exist. That case is covered by the boot
 * integrity guard instead, which paints its own screen with its own report link.
 */

const SUPPORT_EMAIL = 'hello@patgo.co.uk';
const BUG_LOG_MAX = 5;

let _bugLog = [];

function initErrorCapture() {
  window.addEventListener('error', (e) => {
    try {
      _recordError((e && e.message) || 'Unknown error',
                   (e && e.filename) || '', (e && e.lineno) || 0);
    } catch (err) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const r = e && e.reason;
      _recordError('Unhandled promise: ' + ((r && r.message) || String(r || '')), '', 0);
    } catch (err) {}
  });
}

function _recordError(message, file, line) {
  _bugLog.unshift({
    at: stampLocal(),
    message: String(message || '').slice(0, 300),
    file: String(file || '').split('/').pop().slice(0, 60),
    line: line || 0,
  });
  _bugLog = _bugLog.slice(0, BUG_LOG_MAX);
}

// ---------------------------------------------------------------------------
// Scrubbing
//
// Builds the term list from what is actually on this phone — every barcode,
// room, client, floor and description — and removes any of them from the error
// text. Long terms first, so removing "Ward 4" cannot leave a stray fragment of
// "Ward 4 Kitchen" behind.
// ---------------------------------------------------------------------------
function _customerTerms() {
  const terms = [];
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    [r.code, r.description, r.client, r.floor, r.room, r.locationCode, r.failReason]
      .forEach(v => { if (isNonEmptyString(v) && v.length >= 3) terms.push(v); });
  }
  if (isNonEmptyString(state.engineer)) terms.push(state.engineer);
  return terms.sort((a, b) => b.length - a.length);
}

function _scrubCustomerData(text) {
  let s = String(text == null ? '' : text);
  if (!s) return '';
  const terms = _customerTerms();
  for (let i = 0; i < terms.length; i++) {
    // Plain indexOf replacement — no regex, because a barcode or a room name
    // can legally contain regex metacharacters and building a pattern from
    // user data is how you get either a crash or a silent non-match.
    const t = terms[i];
    let idx = s.toLowerCase().indexOf(t.toLowerCase());
    let guard = 0;
    while (idx !== -1 && guard++ < 40) {
      s = s.slice(0, idx) + '[redacted]' + s.slice(idx + t.length);
      idx = s.toLowerCase().indexOf(t.toLowerCase());
    }
  }
  // ⚠ FAIL CLOSED. Anything that still looks like a long alphanumeric run could
  // be a barcode this phone has never stored (a mis-scan, another engineer's
  // label). Withhold the whole message rather than risk it.
  if (/[A-Za-z0-9][A-Za-z0-9\-\/]{7,}/.test(s.replace(/\[redacted\]/g, ''))) {
    return '(message withheld — it may contain client data)';
  }
  return s.slice(0, 300);
}

function _diagnostics() {
  const counts = todayCounts();
  return [
    'App: PATGo Scan ' + APP_VERSION,
    'Screen: ' + state.view,
    'Mode: ' + state.mode,
    'Records: ' + state.records.length + ' (' + unexportedCount() + ' unexported)',
    'Today: ' + counts.pass + ' pass, ' + counts.fail + ' fail, ' + counts.locations + ' locations',
    'Location set: ' + (currentLocation() ? 'yes' : 'no'),
    'Scanner: ' + (state.scannerEnabled ? 'on' : 'off') +
      ', paired mode ' + (state.scannerPaired ? 'on' : 'off') +
      ', speed ' + state.scanSpeed,
    'Fail reasons: ' + state.failReasons.length,
    'Descriptions learned: ' + state.descriptions.length,
    'Storage: ' + formatBytes(storageBytes()),
    'Standalone: ' + (window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no'),
    'Screen size: ' + (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
    'Agent: ' + String(navigator.userAgent || '').slice(0, 160),
  ].join('\n');
}

function _recentErrors() {
  if (!_bugLog.length) return 'No errors captured.';
  return _bugLog.map(e =>
    e.at + ' — ' + _scrubCustomerData(e.message) +
    (e.file ? ' (' + e.file + ':' + e.line + ')' : '')).join('\n');
}

function openBugReport() {
  openNameSheet({
    title: 'What went wrong?',
    body: 'Describe it in a few words. Your phone details are attached automatically — no asset numbers or client details are ever included.',
    placeholder: 'e.g. scans stopped working after lunch',
    confirmLabel: 'Open email',
    onConfirm: (v) => {
      const what = cleanText(v, 300);
      const body =
        'WHAT HAPPENED\n' + (what || '(not described)') + '\n\n' +
        'DIAGNOSTICS\n' + _diagnostics() + '\n\n' +
        'RECENT ERRORS\n' + _recentErrors() + '\n';
      const url = 'mailto:' + SUPPORT_EMAIL +
        '?subject=' + encodeURIComponent('PATGo Scan problem report') +
        '&body=' + encodeURIComponent(body);
      try { window.location.href = url; }
      catch (e) { showToast('Could not open your email app'); }
      render();
    },
    onCancel: () => render(),
  });
}
