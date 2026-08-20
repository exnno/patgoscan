/*
 * PATGo Scan — config.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Constants and defaults ONLY. No logic, no state, no DOM. Every localStorage
 * key name in the app is declared here so that the full storage surface can be
 * read in one place — that is what makes the backup file provably complete.
 */

const APP_VERSION = 'V5';

// The welcome modal key carries the version IN THE VALUE, never in the
// identifier. A version-named identifier caused a white screen in the parent
// app (PATGo v61) when one file was updated and another was not.
const WELCOME_KEY = 'scan:welcome';
const WELCOME_VERSION = 'V5';

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
const ITEM_CLASS_KEY     = 'scan:itemClass';     // 'I' | 'II', DEFAULT 'I'

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

// ⚠ V5: THIS LIST DRIVES THE SCAN SCREEN'S CLASS TOGGLE, and the toggle is a
// two-position switch. Adding a third entry here does not just add an option —
// it puts a third segment in a control sized for two, and it needs a matching
// `class_N` column in CSV_COLUMNS or the new class exports as nothing at all.
// Class III was dropped in V3 for its own reasons; this is the second reason.
const CLASS_OPTIONS = ['I', 'II'];
const ITEM_CLASS_DEFAULT = 'I';

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
  { key: 'record_type', cell: (r) => (r.type === 'location' ? 'location' : 'item') },
  { key: 'mode',        cell: (r) => r.mode || '' },
  { key: 'asset_id',    cell: (r) => (r.type === 'item' ? r.code : '') },
  { key: 'description', cell: (r) => (r.type === 'item' ? (r.description || '') : '') },

  // V5 — the asset id repeated into a class column and a visual column
  // (decisions 1A and 2B). ⚠ THE THREE BELOW ARE INDEPENDENT OF ONE ANOTHER.
  // They answer two different questions — "what class is it" and "was it
  // tested or only looked at" — so a Class I item inspected visually writes
  // its id into class_1 AND visual. That is not a bug to tidy up later.
  //
  // The two hedges Peter kept open are both one line each, here, and nowhere
  // else in the app:
  //   → 1B (id MOVES out of asset_id): change asset_id's cell to return ''.
  //   → 2C (visual becomes a flag, not the id): change visual's cell to
  //     return 'Y' instead of r.code.
  { key: 'class_1', cell: (r) => (r.type === 'item' && r.cls === 'I') ? r.code : '' },
  { key: 'class_2', cell: (r) => (r.type === 'item' && r.cls === 'II') ? r.code : '' },
  { key: 'visual',  cell: (r) => (r.type === 'item' && r.visual === true) ? r.code : '' },

  { key: 'result',      cell: (r) => (r.type === 'item' ? (r.result || '') : '') },
  { key: 'fail_reason', cell: (r) => (r.type === 'item' ? (r.failReason || '') : '') },

  // THE BARCODE IS THE LOCATION ID. On a location row it is the location
  // itself; on an item row it is the location the item was filed under, and it
  // is authoritative — see the note in the V4 handoff about a moved item's row
  // sitting above its location's row.
  { key: 'location_id', cell: (r) => (r.type === 'location' ? r.code : (r.locationCode || '')) },

  // Carried on the location row only. Repeating them on every item row would
  // put the same three strings a few hundred times in a day's file.
  { key: 'client', cell: (r) => (r.type === 'location' ? (r.client || '') : '') },
  { key: 'floor',  cell: (r) => (r.type === 'location' ? (r.floor || '') : '') },
  { key: 'room',   cell: (r) => (r.type === 'location' ? (r.room || '') : '') },

  { key: 'engineer',   cell: (r) => r.engineer || '' },
  { key: 'scanned_at', cell: (r) => stampLocal(r.ts) },
];

const BACKUP_VERSION = 1;
