/*
 * PATGo Scan — state.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * The single global `state` object. Everything the app knows at runtime.
 *
 * Three kinds of field live here and they behave differently:
 *   PERSISTED  — written by save(), restored by load(), carried in the backup.
 *   TRANSIENT  — UI only. Sheets, pending scans, banners. Never saved.
 *   DERIVED    — computed caches. Never saved, never backed up, never validated.
 *
 * ⚠ A new TRANSIENT must also be cleared in setView() (render.js) or it will
 * survive navigation and reopen a sheet on a screen that knows nothing about it.
 */

let state = {

  // --- Navigation -----------------------------------------------------------
  view: 'scan',              // 'scan' | 'log' | 'settings' | 'settingsScanner'
                             // | 'settingsLists' | 'settingsBackup' | 'about'

  // --- Persisted data -------------------------------------------------------
  records: [],               // the scan log. See log.js for the record shape.

  // V7 — SESSIONS. `sessions` is the list; `currentSessionId` is the one being
  // worked in. Every record carries a `sessionId` naming its session.
  //
  // ⚠ THERE IS ALWAYS EXACTLY ONE OPEN SESSION AND IT IS ALWAYS THE CURRENT
  // ONE. ensureOpenSession() (sessions.js) restores that invariant on load and
  // before anything writes a record, so no path in the app has to cope with
  // "there is nowhere to put this scan". Closing the last open session opens a
  // fresh one rather than leaving the engineer somewhere they cannot work.
  //   session: { id, name, ts, closedAt, engineer }
  //   closedAt — 0 while open, a timestamp once closed.
  sessions: [],
  currentSessionId: '',
  engineer: '',              // stamped on every record and into the filename
  mode: MODE_AUDIT,          // sticky across restarts — decision 2A
  currentLocationId: '',     // id of the location record now in force

  // V5 — the two scan-screen toggles. Sticky across restarts (decision 7A),
  // and they apply in BOTH modes: an audit item now carries a class, which
  // before V5 it only did by inheriting one from an earlier initial.
  //
  // ⚠ THESE ARE NOT PREFERENCES. They live up here with `mode` and not down in
  // Preferences because they decide WHAT GETS WRITTEN INTO THE CLIENT'S FILE.
  // Theme and haptics change how the app feels; these change the data. Left in
  // the wrong position they misfile every scan until somebody notices, which is
  // why they are on the pending panel as well as the top of the screen.
  visualMode: false,         // false = Test (DEFAULT), true = Visual
  itemClass: ITEM_CLASS_DEFAULT,   // '1' | '2'

  // V6 — the readings copied onto a new record. ⚠ THESE ARE UP HERE WITH THE
  // TOGGLES AND NOT DOWN IN PREFERENCES for the same reason: they decide what
  // is written into the client's file. Theme and haptics change how the app
  // feels; these change the data.
  earthBondValue: EARTH_BOND_DEFAULT,
  insulationValue: INSULATION_DEFAULT,

  failReasons: [],
  descriptions: [],           // LEARNED, feeds the dropdown only

  // V1.1: the quick-pick grid. Curated, never learned into — see config.js.
  // itemPresets: [{ id, name, items: [up to 9 strings] }]
  // activePresetId: the one whose items the grid shows. Switching is global and
  // immediate; it changes which buttons appear and nothing else, and it can
  // never change what a tap logs.
  itemPresets: [],
  activePresetId: '',

  // --- Preferences ----------------------------------------------------------
  theme: 'auto',
  haptic: true,
  sound: false,
  scannerEnabled: true,      // DEFAULT ON
  scannerPaired: false,      // DEFAULT OFF
  scanSpeed: SCAN_SPEED_DEFAULT,

  // --- Transient: the scan loop ---------------------------------------------
  // locationArmed: the engineer has tapped the location bar and the NEXT scan
  // is a location, not an asset. It disarms itself once used or on cancel.
  locationArmed: false,

  // pending: an asset has been scanned but no result recorded yet. This is the
  // half-finished record sitting on the screen with PASS/FAIL waiting. It is
  // deliberately NOT in `records` — an item with no result is not data, and
  // writing it early would mean a mis-scan had to be found and deleted rather
  // than simply re-scanned over.
  pending: null,             // { code, mode, description, cls, visual }

  // --- Transient: sheets ----------------------------------------------------
  newItemSheet: null,        // { code } — initial mode, gathering desc + class
  newLocationSheet: null,    // { code } — initial mode, gathering client/floor/room
  failSheet: null,           // { } — picking a reason for the pending item
  editSheet: null,           // { id } — correcting a record from the log
  confirmSheet: null,
  infoSheet: null,
  // V7 — naming a session and picking a merge target both go through the
  // SHARED sheets in feedback.js (openNameSheet) and a picker built the way the
  // V4 location picker is. Neither needs a state flag: rule 3 keeps sheets out
  // of render()'s output entirely.

  // --- Transient: UI --------------------------------------------------------
  welcomeSeen: true,         // set false by load() when the modal is due
  toast: '',
  updateBanner: false,
  logSearch: '',
  // V7 — the duplicate review, held open until every collision is answered.
  //   { incoming: [records], sessionMeta: {…}, collisions: [{code, mine, theirs}],
  //     choices: { code: 'mine' | 'theirs' }, mode: 'import' | 'merge', intoId }
  // ⚠ TRANSIENT ON PURPOSE. A half-answered review must not survive a restart:
  // the incoming records have not been written anywhere yet, and resuming into
  // a half-remembered decision is worse than being handed the file again.
  review: null,
  scannerTestLog: [],        // diagnostic rows, settings scanner page only
  bugDraft: null,

  // --- Derived --------------------------------------------------------------
  _lastRenderedView: '',
};
