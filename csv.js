/*
 * PATGo Scan — csv.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * THE DELIVERABLE. This file produces the only thing the client ever sees, so
 * the column order in CSV_COLUMNS (config.js) is their specification, not ours.
 * Changing it changes what lands in their system.
 *
 * ⚠ V5: THE COLUMNS LIVE ENTIRELY IN CONFIG.JS AND THIS FILE DOES NOT KNOW
 * WHAT THEY ARE. Do not reintroduce a column name here. If a row needs a value
 * this file would have to reach for, the answer is a new entry in CSV_COLUMNS,
 * not a special case in the builder — the moment the order exists in two
 * places, reordering the client's file stops being safe.
 *
 * ONE FILE, ONE ROW PER RECORD (decision 3B). Locations and items share the
 * table; the columns an audit row has nothing to say about are simply empty.
 * `record_type` and `mode` are the two columns that tell the receiving system
 * how to read the rest of the row, which is why they lead.
 *
 * ⚠ EXPORT DOES NOT DELETE (decision 8A). It stamps `exported: true` and stops.
 * Clearing is a separate, deliberate, confirmed action on the Backup page. Six
 * engineers exporting daily over a long job will at some point export to a
 * cloud folder that has not finished syncing, and the only recovery is that the
 * data is still on the phone.
 *
 * ⚠ AN EDIT UN-EXPORTS ITS RECORD (see log.js). A row corrected after export
 * goes out again in the next file — the client's system is expected to treat a
 * repeated asset id as an update.
 */

// The header text, in order. Anything that needs to know where a column sits
// asks here rather than counting — including the harness, which is why
// reordering CSV_COLUMNS does not turn the test suite red.
function csvColumnKeys() {
  return CSV_COLUMNS.map(c => c.key);
}

// ⚠ V5: THIS FUNCTION NO LONGER KNOWS WHAT THE COLUMNS ARE, and that is the
// point. It walks CSV_COLUMNS and asks each column for its own cell, so the
// header and the body cannot disagree about the order — they are built from
// one list. The V4 version held the order three times (a header list plus two
// positional row builders padded with empty strings) and every reorder meant
// getting three copies right by hand.
//
// One row per record, locations and items sharing the table. A column a record
// has nothing to say about comes back '' from its own cell function.
function csvRowsForRecords(records) {
  const cols = CSV_COLUMNS;
  const rows = [csvRow(cols.map(c => c.key))];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const line = [];
    for (let c = 0; c < cols.length; c++) {
      // A column that throws would take the whole export with it, and the
      // export is the only thing the client ever sees. A cell that cannot be
      // derived is empty; the row still goes out.
      let v = '';
      try { v = cols[c].cell(r); } catch (e) { v = ''; }
      line.push(v == null ? '' : v);
    }
    rows.push(csvRow(line));
  }
  return rows;
}

// Records in scan order. NOT newest-first: the client reads this as a walk
// through the building, and a location row must precede the items scanned under
// it or the file cannot be read sequentially at all.
function recordsForExport(onlyUnexported) {
  const list = state.records.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return onlyUnexported ? list.filter(r => !r.exported) : list;
}

function buildCSV(onlyUnexported) {
  const recs = recordsForExport(onlyUnexported);
  // \r\n, not \n. Excel on Windows is what opens this at the client's end.
  return { text: csvRowsForRecords(recs).join('\r\n'), count: recs.length, records: recs };
}

function exportFilename() {
  const who = cleanText(state.engineer, 40).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'patgoscan-' + dateStampForFilename() + (who ? '-' + who : '') + '.csv';
}

// ---------------------------------------------------------------------------
// Delivery
//
// Share sheet first, download as the fallback. On iOS the share sheet is the
// only route into Files, Mail or a cloud folder — a plain download lands in a
// place the engineer cannot easily reach.
//
// ⚠ THE SHARE MUST BE CALLED DIRECTLY FROM THE TAP. iOS requires a user gesture
// and revokes it across an await, so nothing asynchronous may happen before
// navigator.share(). Building the text is synchronous for exactly this reason.
// ---------------------------------------------------------------------------
function exportCSV(onlyUnexported) {
  const built = buildCSV(onlyUnexported);
  if (!built.count) {
    showToast(onlyUnexported ? 'Nothing new to export' : 'Nothing to export yet');
    return;
  }
  const name = exportFilename();
  const blob = new Blob([built.text], { type: 'text/csv;charset=utf-8;' });

  const finish = () => {
    markExported(built.records);
    showToast(built.count + ' record' + (built.count === 1 ? '' : 's') + ' exported');
  };

  try {
    const file = new File([blob], name, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name })
        .then(finish)
        .catch((err) => {
          // A cancelled share is not a failure and must not mark anything
          // exported — the engineer backed out on purpose.
          if (err && err.name === 'AbortError') return;
          _downloadBlob(blob, name);
          finish();
        });
      return;
    }
  } catch (e) { /* fall through to download */ }

  _downloadBlob(blob, name);
  finish();
}

function _downloadBlob(blob, name) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
  } catch (e) {
    console.error('Download failed', e);
    showToast('Could not save the file');
  }
}

function markExported(records) {
  for (let i = 0; i < records.length; i++) records[i].exported = true;
  saveRecords();
  if (typeof render === 'function') render();
}

// Copy to clipboard — the escape hatch when the share sheet misbehaves on a
// particular phone. Keeps a bad day recoverable by paste.
function copyCSV(onlyUnexported) {
  const built = buildCSV(onlyUnexported);
  if (!built.count) { showToast('Nothing to copy'); return; }
  try {
    navigator.clipboard.writeText(built.text).then(() => {
      showToast('Copied ' + built.count + ' record' + (built.count === 1 ? '' : 's'));
    }).catch(() => showToast('Could not copy'));
  } catch (e) {
    showToast('Could not copy');
  }
}
