/*
 * PATGo Scan — config.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Constants and defaults ONLY. No logic, no state, no DOM. Every localStorage
 * key name in the app is declared here so that the full storage surface can be
 * read in one place — that is what makes the backup file provably complete.
 */

const APP_VERSION = 'V1.1';

// The welcome modal key carries the version IN THE VALUE, never in the
// identifier. A version-named identifier caused a white screen in the parent
// app (PATGo v61) when one file was updated and another was not.
const WELCOME_KEY = 'scan:welcome';
const WELCOME_VERSION = 'V1';

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

// ---------------------------------------------------------------------------
// Scanner tuning — carried across from PATGo v67 unchanged.
//
// These numbers are not guesses any more; they came off a real NETUM C750 in
// the field. Do not "tidy" them.
// ---------------------------------------------------------------------------
const SCAN_GAP_PRESETS = { strict: 40, normal: 60, relaxed: 90 };
const SCAN_SPEED_DEFAULT = 'normal';

// How long a silence means "the burst has ended" — the fallback path for a
// scanner configured with no suffix at all.
const SCAN_END_MS = 120;

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

const CLASS_OPTIONS = ['I', 'II'];

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

// The CSV column order. THIS IS THE CLIENT'S SPEC — one row per record, with
// the initial-only columns simply left empty on audit rows. Changing the order
// or the header text changes what lands in their system.
const CSV_COLUMNS = [
  'record_type',
  'mode',
  'asset_id',
  'description',
  'class',
  'result',
  'fail_reason',
  'location_id',
  'client',
  'floor',
  'room',
  'engineer',
  'scanned_at',
];

const BACKUP_VERSION = 1;
