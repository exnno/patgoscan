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

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
