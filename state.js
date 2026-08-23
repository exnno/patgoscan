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

  // V9 — moveArmed: the id of an ITEM waiting to be moved. While it is set, the
  // next scan on the log screen is that item's destination.
  //
  // ⚠ IT HOLDS AN ID, NOT A FLAG, and that is not just convenience. A boolean
  // would need a second field to say WHICH item, and two fields that must agree
  // is a state that can be half-set — armed with nothing to move, or a target
  // left behind after a cancel. One field cannot disagree with itself.
  //
  // ⚠ IT IS CLEARED BY setView(), like every other transient. See the ordering
  // trap in armMove() (dispatch.js): arming BEFORE navigating silently disarms.
  moveArmed: '',

  // V12 — logSelect: the log's selection mode. `null` means the mode is OFF;
  // an ARRAY means it is on, and holds the ids ticked so far — so an empty
  // array is "selecting, nothing chosen yet".
  //
  // ⚠ ONE FIELD HOLDS BOTH FACTS FOR THE SAME REASON moveArmed HOLDS AN ID
  // RATHER THAN A FLAG. A boolean plus a list is a state that can be half-set:
  // a selection left behind after the mode closes, or a mode open with a stale
  // list under it. One field cannot disagree with itself.
  //
  // ⚠ IT IS CLEARED BY setView(), like locationArmed and moveArmed. Select mode
  // changes what tapping a row DOES — ticking it rather than opening it — and a
  // mode that alters a row's meaning must not survive leaving the screen that
  // explains it.
  logSelect: null,           // null | [ids]

  // V12 — lastRun: the receipt for the run just committed.
  //   { ids: [...], count: n, code: 'PAT-0998' }
  //
  // ⚠ IT IS WHAT MAKES A BATCH UNDO POSSIBLE AT ALL. Nothing on a record says
  // "these six were one run" — decision 6A in V11 deliberately declined to
  // stamp one — so once this is gone the six are only six items that happen to
  // share a description. addItemRun() hands back exactly what it wrote, so this
  // needs no field on the data and no guessing after the fact.
  //
  // ⚠ IT IS NOT CLEARED BY setView(), AND THAT IS DELIBERATE — the one
  // transient besides `pending` that survives navigation. The realistic way a
  // bad run is caught is: commit it, tap Log to check it wrote correctly, see
  // that it did not, come back. Clearing on navigation would take the offer
  // away on exactly the trip that discovers the mistake. It is safe to carry
  // because it changes nothing invisible: it alters one label on one block that
  // is only drawn when the run's records are all still on file.
  lastRun: null,

  // pending: an asset has been scanned but no result recorded yet. This is the
  // half-finished record sitting on the screen with PASS/FAIL waiting. It is
  // deliberately NOT in `records` — an item with no result is not data, and
  // writing it early would mean a mis-scan had to be found and deleted rather
  // than simply re-scanned over.
  //
  // ⚠ V11 — IT MAY NOW HOLD A RUN. `count` is how many items the one PASS or
  // FAIL about to be pressed will write, and it is 1 or absent for every scan
  // that is not a batch initial. The other ids are NOT stored here: they are
  // derived from the code and the count by runCodesFrom() wherever they are
  // needed, so there is no second list to fall out of step with the first id.
  pending: null,             // { code, mode, description, cls, visual, count }

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
