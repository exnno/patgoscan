/*
 * PATGo Scan — backup.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * The full-state JSON backup. The CSV is the client's deliverable; THIS is the
 * engineer's safety net — it is the only thing that survives a lost phone, a
 * reinstalled app, or a browser that has quietly evicted its storage.
 *
 * ⚠ RESTORE GOES THROUGH THE SAME VALIDATORS AS load(). Never write a second
 * set. A backup that restores under different rules than a load can produce a
 * state the app has never been tested against.
 *
 * ⚠ backupVersion IS 2 AS OF V6, AND ADDITIVE FIELDS STILL DO NOT SPEND A BUMP.
 * Unknown fields are ignored by the validators and known-but-absent ones fall
 * back to their defaults, so adding a field is always backwards compatible.
 *
 * WHAT SPENT THE BUMP: `cls` changed VALUE, from 'I'/'II' to '1'/'2'. Forwards
 * is handled by normaliseRecordClass() in storage.js, which translates the
 * Roman form on the way in. BACKWARDS is what the number is for — a V6 backup
 * restored onto a V5 phone holds classes V5's CLASS_OPTIONS rejects, and every
 * one of those records would export a blank class with nothing on screen to say
 * so. Hence the newer-than-us guard in restoreBackupObject().
 *
 * ⚠ A BOOLEAN RESTORES ONLY WHEN THE BACKUP ACTUALLY HOLDS ONE. Absence is not
 * "off" — an older backup that predates a flag must leave that flag at its
 * default, not switch it off for everybody who restores.
 */

function buildBackup() {
  return {
    app: 'patgoscan',
    appVersion: APP_VERSION,
    backupVersion: BACKUP_VERSION,
    exportedAt: stampLocal(),
    engineer: state.engineer || '',
    mode: state.mode,
    currentLocationId: state.currentLocationId || '',
    records: state.records,
    failReasons: state.failReasons,
    descriptions: state.descriptions,
    // V1.1, additive — an older app ignores both keys wholesale and a V1 backup
    // simply arrives without them, which is why backupVersion does not move.
    itemPresets: state.itemPresets,
    activePresetId: state.activePresetId || '',
    prefs: {
      // V6, additive — an older app ignores them and an older backup arrives
      // without them, landing on the seeds.
      earthBondValue: state.earthBondValue,
      insulationValue: state.insulationValue,
      theme: state.theme,
      haptic: state.haptic,
      sound: state.sound,
      scannerEnabled: state.scannerEnabled,
      scannerPaired: state.scannerPaired,
      scanSpeed: state.scanSpeed,
    },
  };
}

function backupFilename() {
  const who = cleanText(state.engineer, 40).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'patgoscan-backup-' + dateStampForFilename() + (who ? '-' + who : '') + '.json';
}

// Same share-first pattern as the CSV export, and for the same iOS reason: the
// share sheet is the only route into Files or a cloud folder.
function exportBackup() {
  const data = buildBackup();
  const name = backupFilename();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name })
        .then(() => showToast('Backup saved'))
        .catch((err) => {
          if (err && err.name === 'AbortError') return;
          _downloadBlob(blob, name);
          showToast('Backup saved');
        });
      return;
    }
  } catch (e) { /* fall through */ }
  _downloadBlob(blob, name);
  showToast('Backup saved');
}

// ---------------------------------------------------------------------------
// Restore
//
// ⚠ RESTORE REPLACES, IT DOES NOT MERGE. Merging two logs would need conflict
// rules the engineer would have to understand mid-job, and getting them wrong
// silently would be worse than the honest confirm this shows instead. Merging
// several engineers' days is a job for the spreadsheet at the end, on the CSVs.
// ---------------------------------------------------------------------------
function restoreBackupObject(obj) {
  if (!obj || typeof obj !== 'object') {
    showToast('That file is not a PATGo Scan backup');
    return false;
  }
  // The file-kind guard. A CSV renamed to .json, or a PATGo backup, must be
  // refused clearly rather than restored as an empty log.
  if (obj.app && obj.app !== 'patgoscan') {
    showToast('That backup is from a different app');
    return false;
  }
  if (!Array.isArray(obj.records)) {
    showToast('That file has no records in it');
    return false;
  }
  // ⚠ V6: REFUSE A BACKUP FROM THE FUTURE RATHER THAN IMPORTING IT
  // OPTIMISTICALLY. This is the direction the version number exists for. A
  // newer file may hold field VALUES this build does not understand — as a V6
  // file does for anything before V6 — and the validators would quietly
  // collapse each one to a default, which looks like a successful restore and
  // is a silent partial data loss.
  if (typeof obj.backupVersion === 'number' && obj.backupVersion > BACKUP_VERSION) {
    showToast('That backup is from a newer version of the app');
    return false;
  }

  state.records = normaliseRecords(obj.records);
  state.engineer = cleanText(obj.engineer, 60);
  state.mode = normaliseMode(obj.mode);
  state.failReasons = normaliseStringList(obj.failReasons, makeDefaultFailReasons, 40);
  state.descriptions = normaliseStringList(obj.descriptions, makeSeedDescriptions, DESCRIPTIONS_STORED_MAX);

  // ⚠ THE SAME VALIDATORS load() USES, not a second relaxed set. A V1 backup has
  // no presets at all and lands on the default preset — it must not land on an
  // empty grid, which is what an unvalidated `obj.itemPresets` of undefined
  // would give.
  state.itemPresets = normalisePresets(obj.itemPresets);
  state.activePresetId = resolveActivePreset(obj.activePresetId, state.itemPresets);

  const p = (obj.prefs && typeof obj.prefs === 'object') ? obj.prefs : {};
  state.theme = normaliseTheme(p.theme);
  state.scanSpeed = normaliseScanSpeed(p.scanSpeed);
  state.earthBondValue = normaliseReading(p.earthBondValue, EARTH_BOND_DEFAULT);
  state.insulationValue = normaliseReading(p.insulationValue, INSULATION_DEFAULT);
  if (typeof p.haptic === 'boolean') state.haptic = p.haptic;
  if (typeof p.sound === 'boolean') state.sound = p.sound;
  if (typeof p.scannerEnabled === 'boolean') state.scannerEnabled = p.scannerEnabled;
  if (typeof p.scannerPaired === 'boolean') state.scannerPaired = p.scannerPaired;

  // Validated against the records that actually came back, exactly as load()
  // does — a location id with no record behind it would stamp every later item
  // with a dangling reference.
  const locId = cleanText(obj.currentLocationId, 60);
  state.currentLocationId = locationRecordById(locId) ? locId : '';

  save();
  return true;
}

function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let obj = null;
    try { obj = JSON.parse(String(reader.result || '')); }
    catch (e) { showToast('That file could not be read'); return; }

    const count = Array.isArray(obj && obj.records) ? obj.records.length : 0;
    openConfirmSheet({
      title: 'Replace everything on this phone?',
      body: 'This backup holds ' + count + ' record' + (count === 1 ? '' : 's') +
            '. Restoring replaces the ' + state.records.length +
            ' currently on this phone. It cannot be undone.',
      confirmLabel: 'Restore',
      danger: true,
      onConfirm: () => {
        if (restoreBackupObject(obj)) {
          showToast('Restored ' + state.records.length + ' records');
          setView('scan');
        }
      },
    });
  };
  reader.onerror = () => showToast('That file could not be read');
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Clearing
//
// The only path that destroys data on purpose. Two guards: it refuses outright
// while anything is unexported, and it confirms with a count even when
// everything has gone out.
// ---------------------------------------------------------------------------
function clearExportedRecords() {
  const pending = unexportedCount();
  if (pending > 0) {
    openInfoSheet({
      title: 'Export first',
      body: pending + ' record' + (pending === 1 ? ' has' : 's have') +
            ' not been exported yet. Export them before clearing, so nothing is lost.',
    });
    return;
  }
  const n = state.records.length;
  if (!n) { showToast('Nothing to clear'); return; }
  openConfirmSheet({
    title: 'Clear ' + n + ' exported record' + (n === 1 ? '' : 's') + '?',
    body: 'Everything here has been exported. Make sure you have the CSV somewhere safe — this cannot be undone.',
    confirmLabel: 'Clear',
    danger: true,
    onConfirm: () => {
      state.records = [];
      state.currentLocationId = '';
      saveRecords();
      savePrefs();
      showToast('Cleared');
      setView('scan');
    },
  });
}

// The nudge. A count, not a date — this app is used in bursts on a job and a day
// counter would nag on the drive home.
function exportNudgeDue() {
  return unexportedCount() >= EXPORT_NUDGE_AT;
}
