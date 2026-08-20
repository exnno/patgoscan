/*
 * PATGo Scan — config.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Constants and defaults ONLY. No logic, no state, no DOM. Every localStorage
 * key name in the app is declared here so that the full storage surface can be
 * read in one place — that is what makes the backup file provably complete.
 */

const APP_VERSION = 'V6';

// The welcome modal key carries the version IN THE VALUE, never in the
// identifier. A version-named identifier caused a white screen in the parent
// app (PATGo v61) when one file was updated and another was not.
const WELCOME_KEY = 'scan:welcome';
const WELCOME_VERSION = 'V6';

// ---------------------------------------------------------------------------
// Storage keys
//
// Prefix is 'scan:' throughout, distinct from PATGo's 'pat:'. The two apps live
// on different origins so their localStorage could never collide anyway, but a
// distinct prefix means a backup file opened in a text editor announces which
// app produced it.
// ---------------------------------------------------------------------------
const RECORDS_KEY        = 'scan:records';
const ENGINEER_KEY       = 'scan:engineer';
const MODE_KEY           = 'scan:mode';          // 'audit' | 'initial'
const LOCATION_KEY       = 'scan:location';      // the current location record id
const FAIL_REASONS_KEY   = 'scan:failReasons';
const DESCRIPTIONS_KEY   = 'scan:descriptions';  // learned item descriptions

// V1.1: quick-pick presets. ⚠ THESE ARE NOT THE LEARNED DESCRIPTIONS, and the
// distinction is the whole point of the V1.1 fix. Two lists doing two jobs:
//   QUICK_PICKS_KEY   — a HAND-CURATED list of named presets, each holding up
//                       to nine item types, shown as the tap grid. The engineer
//                       owns it; nothing is ever added to it automatically, so
//                       something removed here stays removed.
//   DESCRIPTIONS_KEY  — LEARNED from what gets typed, and only ever surfaced as
//                       the dropdown under the description box.
// V1 fused the two, which is why a description deleted from the list reappeared
// the next time it was typed, and why the grid reshuffled as you used it.
const QUICK_PICKS_KEY    = 'scan:quickPicks';    // JSON [{id,name,items:[…]}]
const ACTIVE_PRESET_KEY  = 'scan:activePreset';  // id of the preset in force
const THEME_KEY          = 'scan:theme';         // 'light' | 'dark' | 'auto'
const HAPTIC_KEY         = 'scan:haptic';        // '1' | '0', DEFAULT ON
const SOUND_KEY          = 'scan:sound';         // '1' | '0', DEFAULT OFF
const EXPORT_REMIND_KEY  = 'scan:exportReminded';

// ⚠ FLAG POLARITY. Default-ON flags are read `!== '0'` (absent means on).
// Default-OFF flags are read `=== '1'` (absent means off). Copying the wrong
// neighbour silently switches a feature on for every user. SCANNER_KEY and
// HAPTIC_KEY are the ONLY default-ON flags in this app.
const SCANNER_KEY        = 'scan:scanner';       // '1' | '0', DEFAULT ON
const SCANNER_PAIRED_KEY = 'scan:scannerPaired'; // '1' | '0', DEFAULT OFF
const SCAN_SPEED_KEY     = 'scan:scanSpeed';     // 'strict' | 'normal' | 'relaxed'

// V5 — the two persistent toggles on the scan screen. STICKY ACROSS RESTARTS
// (decision 7A), the same rule MODE_KEY has carried since V1: the engineer sets
// what they are doing and the phone remembers it, because re-setting it every
// time the app is reopened is how it ends up wrong.
//
// ⚠ VISUAL_KEY IS DEFAULT OFF and must stay that way. The default-flag rule
// above is not decoration — a phone that has never been touched must behave as
// though every item is being TESTED, because a full test recorded as a visual
// inspection understates the work, and a visual recorded as a full test claims
// work that was never done. The second is the dangerous direction.
const VISUAL_KEY         = 'scan:visual';        // '1' | '0', DEFAULT OFF (= Test)
const ITEM_CLASS_KEY     = 'scan:itemClass';     // '1' | '2', DEFAULT '1'

// V6 — the auto-filled test readings. PLAIN STRINGS, NOT NUMBERS, and that is
// not laziness: '<0.2' and '>19.99' are what the client's file contains and
// neither one parses. Anything that tried to treat these as measurements would
// have to invent a format the client has never asked for.
//
// ⚠ THESE ARE THE VALUES WRITTEN ONTO NEW RECORDS, NOT A VIEW OF OLD ONES. A
// reading is COPIED onto the record when the item is logged, so changing the
// figure here in May does not rewrite what was recorded in April. That is the
// whole point of decision 4B — the file has to say what was actually recorded
// at the time, not what the setting happens to be on the day it is exported.
const EARTH_BOND_KEY     = 'scan:earthBond';     // e.g. '<0.2'
const INSULATION_KEY     = 'scan:insulation';    // e.g. '>19.99'

// ---------------------------------------------------------------------------
// Scanner tuning — measured, not guessed. Do not "tidy" these.
//
// V2 RAISED ALL THREE PRESETS. The original numbers (40/60/90) came off a
// NETUM C750 in 2026; the same hardware was measured again in the field at
// 100–115ms between characters and every scan was being rejected as "too
// slow". Whether the scanner firmware, the phone or iOS key delivery changed
// does not matter — the app has to accept what the hardware actually sends.
//
// ⚠ THE PRESETS ARE NOT THE ONLY LIMIT, AND THAT WAS THE V1 BUG. Raising a
// preset alone does nothing, because the end-of-burst window below is a
// SECOND, independent ceiling: a gap larger than it wipes the buffer and
// starts a new burst. With a flat 120 and a relaxed preset of 150, a 130ms
// scanner would stop failing as "too slow" and start failing as "too short" —
// the same rejection wearing a different hat. See scanEndMs() in scanner.js:
// the window is now DERIVED from whichever preset is in force, so it can never
// again sit below the limit it is supposed to be backing up.
// ---------------------------------------------------------------------------
const SCAN_GAP_PRESETS = { strict: 60, normal: 90, relaxed: 150 };
const SCAN_SPEED_DEFAULT = 'normal';

// How long a silence means "the burst has ended" — the fallback path for a
// scanner configured with no suffix at all, and the width of the poison
// window. FLOOR and PAD, not a fixed value: the real figure is computed by
// scanEndMs() as (active gap limit + PAD), never less than FLOOR.
//
// ⚠ PAD must stay comfortably above the jitter between two characters of one
// burst, or a slow scanner's own gaps would read as the end of the burst.
const SCAN_END_FLOOR_MS = 120;
const SCAN_END_PAD_MS = 70;

// After a burst commits, a straggling terminator (a scanner set to CR+LF sends
// two Enters) is swallowed for this long rather than acting on an empty buffer.
const SCAN_DOUBLE_TERMINATOR_MS = 250;

const SCAN_MIN_LENGTH = 3;
const SCAN_MAX_LENGTH = 64;
const SCANNER_TEST_LOG_MAX = 8;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// Peter's standing list. Editable in Settings; this is only the seed.
function makeDefaultFailReasons() {
  return [
    'Damaged Plug',
    'Damaged Lead',
    'Damaged Casing',
    'Earth Continuity',
    'Insulation Resistance',
    'Does Not Conform To BS 1363',
  ];
}

// ⚠ V6: THE VALUES ARE '1' AND '2', NOT 'I' AND 'II'. This is what the client's
// own file contains and it is the STORED form, not a mapping applied on the way
// out (decision 1B). Every record written before V6 holds the Roman form and is
// migrated on load — see normaliseRecordClass() in storage.js. Reverting these
// strings without reverting that migration would leave every existing record
// exporting a blank class, on screen as well as in the file.
//
// ⚠ THE TOGGLE IS A TWO-POSITION SWITCH. Adding a third entry here does not
// just add an option — it puts a third segment in a control sized for two.
// Class III was dropped in V3 for its own reasons; this is the second reason.
const CLASS_OPTIONS = ['1', '2'];
const ITEM_CLASS_DEFAULT = '1';

// ⚠ CLASS 2 HAS NO EARTH TO BOND. Named here rather than written as a bare '2'
// at each of the three places that need it, because this is a fact about
// appliances and not a coincidence of the option list.
const CLASS_NO_EARTH_BOND = '2';

// V6 readings. Seeds only — the live values are in state and editable in
// Settings.
const EARTH_BOND_DEFAULT = '<0.2';
const INSULATION_DEFAULT = '>19.99';
const READING_MAX = 20;

// What the four outcome columns contain. Uppercase in the stored data of the
// client's sample, not a display style applied to it.
const CSV_PASS = 'PASS';
const CSV_FAIL = 'FAIL';

const MODE_AUDIT = 'audit';
const MODE_INITIAL = 'initial';

// The quick-pick grid: up to nine per preset, three across, in the order the
// engineer put them in. NINE IS A UI LIMIT, NOT AN ARBITRARY ONE — it is the
// most that fits above the keyboard on a phone without the grid scrolling, and
// a grid you have to scroll is slower than typing.
const QUICK_PICK_MAX = 9;
const PRESET_NAME_MAX = 40;

// One preset to start with. A preset is never deleted down to none: the app
// always has at least one, because an empty preset list means an empty grid and
// no way back to a full one without going through Settings.
function makeDefaultPresets() {
  return [{
    id: 'preset_default',
    name: 'Default',
    items: [
      'Kettle', 'Microwave', 'Toaster',
      'Fridge', 'Monitor', 'Laptop Charger',
      'Desk Lamp', 'Printer', 'Extension Lead',
    ],
  }];
}

// Item descriptions are LEARNED as they are typed. These seed the dropdown on a
// brand new phone so the first day is not all typing; anything the engineer
// types is added to them. This list is not the quick-pick grid — see the note
// on QUICK_PICKS_KEY above.
function makeSeedDescriptions() {
  return [
    'Kettle', 'Microwave', 'Toaster', 'Fridge', 'Water Cooler',
    'Monitor', 'Laptop Charger', 'Desk Lamp', 'Printer', 'Extension Lead',
    'Vacuum Cleaner', 'Fan Heater',
  ];
}

const DESCRIPTION_SUGGEST_MAX = 6;
const DESCRIPTIONS_STORED_MAX = 200;

// Records held before the "you have not exported for a while" nudge appears.
// Deliberately a count and not a date: this app is used in bursts on a job, and
// a day counter would nag on the drive home.
const EXPORT_NUDGE_AT = 150;

// ---------------------------------------------------------------------------
// THE CSV COLUMNS — the client's spec, and the whole of it.
//
// ⚠ THIS LIST IS NOW THE ONLY PLACE THE COLUMN ORDER EXISTS. csv.js walks it
// and knows nothing about what is in it, so REORDERING THE CLIENT'S FILE IS
// CUT-AND-PASTE OF WHOLE LINES HERE AND NOTHING ELSE. Renaming a column is one
// string; adding or removing one is one line.
//
// That is a V5 change and it was made because the layout is expected to move
// again. Before V5 the order lived three times over — once as a list of
// headers, then once per row builder as two positional arrays with comments
// counting the empty gaps — and keeping three copies in step by hand is exactly
// how every column past the mistake silently shifts one to the right.
//
//   key  — the header text, exactly as the client's importer reads it.
//   cell — how the value comes off ONE record. Returns '' for a column that
//          record has nothing to say about. ⚠ Called for every row of every
//          export, so it MUST NOT THROW: guard the fields, never assume them.
//
// ⚠ NOTHING IN THE UI EDITS THIS, DELIBERATELY. It is the client's
// specification, not a preference. A control that let an engineer rearrange it
// from a phone in a plant room is a way to break the client's import with a
// mis-tap. It is edited here, in the GitHub web UI, on purpose.
// ---------------------------------------------------------------------------
const CSV_COLUMNS = [
  { key: 'ASSET ID', cell: (r) => r.code || '' },
  { key: 'CLASS',    cell: (r) => r.cls || '' },

  // THE FOUR OUTCOME COLUMNS — the four stages of a PAT test, and between them
  // they carry everything the retired `result` and `fail_reason` columns used
  // to say.
  //
  // ⚠ VISUAL AND OPERATIONAL ARE IDENTICAL BY DESIGN (decision 3B). A visual
  // inspection writes PASS into both; so does a full test. What tells the two
  // apart in the client's file is whether the READINGS below are filled — and
  // nothing else. See the warning on INSULATION.
  //
  // ⚠ A FAIL WRITES FAIL INTO BOTH (decision 5B) and no attempt is made to
  // guess which stage failed from the reason text. "Damaged Casing" is a visual
  // failure and "Insulation Resistance" is not, but the list is editable in
  // Settings and an engineer will eventually add one that maps to neither.
  // Guessing wrong is worse than not guessing: the reason itself goes out
  // intact in NOTES.
  { key: 'VISUAL',      cell: (r) => csvOutcome(r) },
  { key: 'OPERATIONAL', cell: (r) => csvOutcome(r) },

  // ⚠ EARTH BOND IS EMPTY FOR CLASS 2 AND THIS IS NOT A FORMATTING PREFERENCE.
  // A Class II appliance has no earth to bond, so a value here claims a test
  // that cannot physically be performed. The rule is enforced TWICE on purpose
  // — once when the record is written (readingsFor() in log.js) and again here,
  // on the way out — because a class corrected from 1 to 2 in the log would
  // otherwise export a reading that was legitimate when it was recorded.
  { key: 'EARTH BOND', cell: (r) => (r.cls === CLASS_NO_EARTH_BOND ? '' : (r.earthBond || '')) },

  // ⚠ NEVER BLANK THIS FOR TIDINESS. Under decision 3B the readings are the
  // only thing separating a visual inspection from a full test, and for a
  // Class 2 item this column is the whole of that difference. Emptying it on a
  // tested item silently reclassifies the item as visual-only, which understates
  // work that was actually done. Mutation M124 breaks it in exactly this
  // direction.
  { key: 'INSULATION', cell: (r) => r.insulation || '' },

  // ⚠ INITIAL ONLY (decision 9A). An audit row leaves this empty because the
  // client's register already holds the description — and this is one of the
  // two columns that now carry what the retired `mode` column used to say.
  { key: 'DESCRIPTION', cell: (r) => (r.mode === MODE_INITIAL ? (r.description || '') : '') },

  // THE BARCODE IS THE LOCATION ID, and it is the COPY stamped onto the item
  // rather than a lookup through the pointer — see the note in log.js. An item
  // whose location record was later deleted still exports the barcode it was
  // genuinely scanned under.
  { key: 'LOCATION ID', cell: (r) => r.locationCode || '' },

  // ⚠ THE ONLY TWO COLUMNS THAT NEED MORE THAN THE ROW'S OWN RECORD, which is
  // why cells take a second argument in V6. Sparse by design (decision 7A):
  // they appear on the FIRST row of a newly initialised location IN THIS FILE
  // and nowhere else. "In this file" is the whole of the correctness — see
  // csvRowsForRecords() in csv.js.
  { key: 'FLOOR', cell: (r, ctx) => csvLocationDescriptor(ctx, 'floor') },
  { key: 'ROOM',  cell: (r, ctx) => csvLocationDescriptor(ctx, 'room') },

  { key: 'DATE', cell: (r) => dateOnlyLocal(r.ts) },

  // The fail reason, and nothing else (decision 11A).
  { key: 'NOTES', cell: (r) => r.failReason || '' },

  // ⚠ THE THIRTEENTH COLUMN, AND NOT PART OF THE CLIENT'S TWELVE (decision
  // 12B). It is appended rather than inserted so their layout is untouched.
  // The filename carries the engineer too, but filenames are lost the moment
  // six files are merged into one sheet — and then nothing says who did what.
  { key: 'ENGINEER', cell: (r) => r.engineer || '' },
];

// ---------------------------------------------------------------------------
// Cell helpers
//
// These live here rather than in utils.js because they exist only to serve
// CSV_COLUMNS above, and moving them away from it is how the next person ends
// up writing a second copy of the same rule inline in a cell.
// ---------------------------------------------------------------------------

// ⚠ ONE FUNCTION FOR BOTH OUTCOME COLUMNS, called twice. Decision 3B says they
// are identical, and writing the expression out twice is an invitation to
// "fix" one of them.
function csvOutcome(r) {
  if (r.result === 'fail') return CSV_FAIL;
  if (r.result === 'pass') return CSV_PASS;
  return '';
}

// ⚠ TOLERATES A MISSING ctx. The harness calls cells directly in places, and a
// cell that throws is a cell whose column comes out empty for every row of the
// export — the guard in csv.js keeps the file going but says nothing.
function csvLocationDescriptor(ctx, field) {
  if (!ctx || ctx.firstForLocationInFile !== true) return '';
  const loc = ctx.location;
  if (!loc || loc.mode !== MODE_INITIAL) return '';
  return loc[field] || '';
}

const BACKUP_VERSION = 2;
