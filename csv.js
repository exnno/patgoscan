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
 * ⚠ V6: ONE ROW PER ITEM, AND LOCATIONS NO LONGER GET A ROW AT ALL (decision
 * 8A). Every line in the file is an asset. A location's floor and room ride on
 * the first item row beneath it — see csvRowsForRecords() — and a location
 * visited with nothing found under it leaves no trace in the file, which is
 * what the client's own sample does.
 *
 * ⚠ LOCATION RECORDS ARE STILL MARKED EXPORTED even though they emit nothing.
 * Leaving them unmarked would pile them up forever and drift the "not exported"
 * count on the Backup page away from what is actually outstanding.
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
// ⚠ V6: A CELL NOW TAKES (record, ctx). Two columns — FLOOR and ROOM — cannot
// be written from the row's own record: they need the LOCATION record, and they
// need to know whether this row is the first of its location. Everything else
// ignores the second argument entirely.
//
// ⚠ "FIRST OF ITS LOCATION" MEANS FIRST IN THIS FILE, AND THE SET IS REBUILT
// ON EVERY EXPORT ON PURPOSE. Do not "optimise" this into a flag stored on the
// location record. Export sends UNEXPORTED RECORDS ONLY, so a location
// initialised on Monday and added to on Tuesday would put its floor and room in
// Monday's file and leave Tuesday's file with no location detail anywhere in
// it. Rebuilding per file means every file is self-describing, including a
// single corrected row re-exported months later. The cost is that a location
// spanning two files has its descriptors in both, which is harmless — the
// client's system treats a repeated asset id as an update and these are
// identical values.
function csvRowsForRecords(records) {
  const cols = CSV_COLUMNS;
  const rows = [csvRow(cols.map(c => c.key))];
  const seenLocation = {};
  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    // Keyed on the id where there is one and on the barcode where there is not,
    // so items whose location record was deleted still group together rather
    // than every one of them reading as the first of its own location.
    const locKey = r.locationId ? ('id:' + r.locationId) : ('code:' + (r.locationCode || ''));
    const first = seenLocation[locKey] !== 1;
    seenLocation[locKey] = 1;

    // Resolved ONCE per row rather than once per column — three columns would
    // otherwise each walk the whole record list, on a phone, per row.
    const ctx = {
      location: (typeof locationRecordById === 'function')
        ? locationRecordById(r.locationId)
        : null,
      firstForLocationInFile: first,
    };

    const line = [];
    for (let c = 0; c < cols.length; c++) {
      // A column that throws would take the whole export with it, and the
      // export is the only thing the client ever sees. A cell that cannot be
      // derived is empty; the row still goes out.
      let v = '';
      try { v = cols[c].cell(r, ctx); } catch (e) { v = ''; }
      line.push(v == null ? '' : v);
    }
    rows.push(csvRow(line));
  }
  return rows;
}

// Records in scan order. NOT newest-first: the client reads this as a walk
// through the building.
//
// ⚠ THE ORDER STILL MATTERS EVEN THOUGH LOCATIONS NO LONGER EMIT A ROW. It is
// what decides WHICH item row carries a location's floor and room — the first
// one scanned there, not whichever happens to sort first.
// ⚠ V7 — THE SESSION IS THE UNIT OF EXPORT, AND IT IS THE WHOLE SESSION EVERY
// TIME (decision 3B). The `onlyUnexported` argument is GONE, not defaulted, so
// that no caller can ask for a delta and quietly get one.
//
// Before V7 a file held whatever had not been sent yet. That made a re-export
// after a correction a handful of loose rows the client had to reconcile
// against something they were sent that morning — and it meant a record edited
// after export went out ALONE, stripped of the context of the batch it belonged
// to. A session exports complete or not at all: the client's importer treats a
// repeated asset id as an update, so re-sending a row that has not changed
// costs nothing and re-sending one that has is the entire point.
//
// ⚠ THIS IS ALSO WHAT MAKES DECISION 7A CORRECT AGAIN. Floor and room ride on
// the first item row of a location IN THIS FILE. Under a delta export, a
// location initialised on Monday and added to on Tuesday left Tuesday's file
// with no floor or room anywhere in it — the reason csvRowsForRecords() rebuilds
// its Set per file. With a whole-session export every file is complete, so the
// descriptors are always present. The per-file Set stays regardless: it is what
// makes the property true rather than incidental. Mutation M119, test 13f.
function recordsForExport() {
  return state.records
    .filter(r => inCurrentSession(r))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

// ⚠ V6: THE ROWS AND THE RECORDS-TO-MARK ARE TWO DIFFERENT LISTS, and keeping
// them separate is the whole of decision 8A.
//
//   rows    — items only. A location emits nothing.
//   records — items AND the location records in the same batch, so the
//             locations get stamped exported and stop accumulating.
//
// `count` is the number of ROWS, because that is what the toast and the empty
// check are about: an export of nothing but locations produces an empty file
// and correctly reports nothing to export, leaving those locations pending for
// the day items are finally scanned under them.
function buildCSV() {
  const recs = recordsForExport();
  const items = recs.filter(r => r.type === 'item');
  // \r\n, not \n. Excel on Windows is what opens this at the client's end.
  return { text: csvRowsForRecords(items).join('\r\n'), count: items.length, records: recs };
}

// ⚠ V7 — THE SESSION NAME IS IN THE FILENAME. With export scoped to a session,
// a folder can hold several files from one phone on one day, and 'patgoscan-
// 2026-08-20-Pete.csv' twice over is how the wrong one gets sent.
function exportFilename() {
  const who = cleanText(state.engineer, 40).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const what = cleanText(currentSessionName(), 40)
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'patgoscan-' + dateStampForFilename() +
         (what ? '-' + what : '') + (who ? '-' + who : '') + '.csv';
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
function exportCSV() {
  const built = buildCSV();
  if (!built.count) {
    showToast('Nothing to export in this session yet');
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
function copyCSV() {
  const built = buildCSV();
  if (!built.count) { showToast('Nothing to copy'); return; }
  try {
    navigator.clipboard.writeText(built.text).then(() => {
      showToast('Copied ' + built.count + ' record' + (built.count === 1 ? '' : 's'));
    }).catch(() => showToast('Could not copy'));
  } catch (e) {
    showToast('Could not copy');
  }
}
