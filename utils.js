/*
 * PATGo Scan — utils.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Pure helpers. Nothing here reads `state` and nothing here touches storage —
 * that is the whole point of the file and it is what makes these safe to call
 * from anywhere, including from inside the crash fallback screens.
 */

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uid(prefix) {
  return (prefix || 'r') + '_' +
    Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 8);
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

// ISO-ish local timestamp. NOT toISOString() — that converts to UTC, and a scan
// logged at 08:15 in a British summer would export as 07:15, which is wrong on
// a timesheet and unexplainable to the client.
function stampLocal(ms) {
  const d = new Date(typeof ms === 'number' ? ms : Date.now());
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

// V6 — the client's DATE column. dd/MM/yyyy, no time (decision 10A), matching
// their own sample file exactly.
//
// ⚠ NOT stampLocal() TRUNCATED. That is ISO order (yyyy-MM-dd) and this is not;
// slicing one to make the other would silently produce an American reading on
// any day where the day and month could be swapped. Local, for the same reason
// stampLocal is local: a scan logged at 00:30 in British summer time exports as
// the previous day in UTC.
function dateOnlyLocal(ms) {
  const d = new Date(typeof ms === 'number' ? ms : Date.now());
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

function dateStampForFilename(ms) {
  const d = new Date(typeof ms === 'number' ? ms : Date.now());
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
}

function timeOfDay(ms) {
  const d = new Date(typeof ms === 'number' ? ms : Date.now());
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// Title-case for typed descriptions, so "kettle", "Kettle" and "KETTLE" do not
// arrive in the client's system as three different appliances.
//
// ⚠ An all-caps word is left ALONE. "PSU" and "RCD" are deliberate and
// lowercasing them would be a bug, not a tidy-up.
function titleCaseWords(s) {
  return String(s == null ? '' : s)
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w === w.toUpperCase() && w.length > 1)
      ? w
      : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function cleanText(s, max) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return typeof max === 'number' ? t.slice(0, max) : t;
}

// ---------------------------------------------------------------------------
// CSV
//
// ⚠ EVERY cell goes through this, including ones that "cannot" contain a comma.
// A fail reason is an editable list and an engineer will eventually type
// "Damaged Lead, replaced". Quoting only the fields that look risky is how a
// CSV export silently shifts every column right on one row in a thousand.
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return '"' + s.replace(/"/g, '""') + '"';
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

// Sort helper: newest first, stable on equal timestamps by falling back to id.
function byNewest(a, b) {
  const d = (b.ts || 0) - (a.ts || 0);
  if (d !== 0) return d;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// V11 — THE RUN. Turning one scanned asset id into the next N.
//
// ⚠⚠ THIS IS THE ONLY PLACE IN THE APP THAT INVENTS AN ASSET ID, and until V11
// the app did not do that at all — every code on file had come off a label. The
// two functions below are deliberately PURE and deliberately here rather than
// in log.js, so that what an id becomes can be reasoned about, tested and
// broken on its own, with no records, no session and no state anywhere near it.
// ---------------------------------------------------------------------------

// Split a code into its leading part and its trailing digits. Returns null when
// there are no trailing digits — which is the answer to "what about a code we
// cannot count from": there is no run, and the control is never offered.
//
// ⚠ THE PREFIX IS LAZY AND THE DIGITS ARE ANCHORED TO THE END, so 'PAT-0998'
// splits as 'PAT-' + '0998' and not as 'PAT-' + '0' + junk. A greedy prefix
// would take all but the last digit and count 'PAT-099' upwards in units of
// one, which is the same shape of bug as an off-by-one and far harder to see.
function splitTrailingNumber(code) {
  const s = String(code == null ? '' : code);
  const m = s.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], digits: m[2] };
}

// The codes a run of `count` items would use, starting AT the scanned one.
// An empty array means "no run is possible from this code" and every caller
// treats it that way rather than falling back to something clever.
function runCodesFrom(code, count) {
  const parts = splitTrailingNumber(code);
  if (!parts) return [];
  // ⚠ REFUSED RATHER THAN ROUNDED. Beyond 15 digits parseInt is past the safe
  // integer range and starts returning a number that is CLOSE to the label
  // rather than equal to it — so the first id would be right, the second
  // plausible, and the tenth quietly wrong in the client's system. A code that
  // long is not a run; it is a serial number.
  if (parts.digits.length > 15) return [];
  const n = (typeof count === 'number' && count > 0) ? Math.floor(count) : 0;
  const width = parts.digits.length;
  const start = parseInt(parts.digits, 10);
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = String(start + i);
    // ⚠ THE PADDING IS RESTORED WHILE IT FITS AND ALLOWED TO GROW WHEN IT DOES
    // NOT. '0998' → '0999' → '1000': four digits throughout, and the run does
    // not stop at the end of the padding. Truncating back to the original width
    // would turn 1000 into 000 and file three items under one id.
    out.push(parts.prefix + (v.length >= width ? v : '0'.repeat(width - v.length) + v));
  }
  return out;
}

// How a run is named on screen and in a confirmation. One item is just its own
// code — "1 item: 1000 to 1000" reads like a bug.
function runRangeLabel(codes) {
  if (!codes || !codes.length) return '';
  if (codes.length === 1) return codes[0];
  return codes[0] + ' to ' + codes[codes.length - 1];
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
