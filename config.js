/*
 * PATGo Scan — config.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Constants and defaults ONLY. No logic, no state, no DOM. Every localStorage
 * key name in the app is declared here so that the full storage surface can be
 * read in one place — that is what makes the backup file provably complete.
 */

const APP_VERSION = 'V1';

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

// Item descriptions are learned as they are typed rather than maintained as a
// list. These seed the suggestions on a brand new phone so the first day is not
// all typing; anything the engineer types is added to them.
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
