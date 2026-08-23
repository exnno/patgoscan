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
 * ⚠ backupVersion IS 3 AS OF V7, AND ADDITIVE FIELDS STILL DO NOT SPEND A BUMP.
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
 * WHAT SPENT THE V7 BUMP: records gained `sessionId` and the file gained
 * `sessions`, which is additive and would normally ride through for free. The
 * BACKWARD direction is what costs: a V7 backup restored onto a V6 phone loses
 * every session boundary, and because export is scoped to the session from V7
 * (decision 3B) that phone would then write a file covering a different set of
 * rows than the one the backup was taken from — silently, and looking correct.
 *
 * ⚠ A BOOLEAN RESTORES ONLY WHEN THE BACKUP ACTUALLY HOLDS ONE. Absence is not
 * "off" — an older backup that predates a flag must leave that flag at its
 * default, not switch it off for everybody who restores.
 *
 * ⚠⚠ A BACKUP IS NOT A SESSION FILE AND THE TWO MUST NEVER BE CONFUSED. This
 * one REPLACES the phone; a session file MERGES into it. They are both .json,
 * they sit next to each other in the Files app, and picking the wrong one at
 * the end of a Friday costs a day's work. Each import path refuses the other by
 * name — see the guard in restoreBackupObject() and _describeWrongKind() in
 * sessions.js.
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
    // V7 — the session list and which one was being worked in. ⚠ WITHOUT THESE
    // EVERY RECORD IN THE FILE IS AN ORPHAN on restore, and the adoption pass in
    // storage.js sweeps the lot into one machine-named session — which is not
    // data loss, but it is the loss of every name the engineer chose.
    sessions: state.sessions,
    currentSessionId: state.currentSessionId || '',
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
  // ⚠ V7 — AND A SESSION FILE IS REFUSED HERE BY NAME. This path REPLACES the
  // phone. A session file restored through it would throw away every other
  // session to install one, which is the single most expensive mistake
  // available in this app and is one tap away in the Files app. Told plainly,
  // with the right route, because the engineer has almost certainly just picked
  // the wrong one of two files with nearly identical names.
  if (obj.kind === SESSION_FILE_KIND) {
    openInfoSheet({
      title: 'That is a session, not a backup',
      body: 'Restoring a backup would replace everything on this phone. To add ' +
            'that session to what you already have, go to Sessions and import it there.',
    });
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
  // V7. ⚠ THROUGH THE SAME VALIDATORS load() USES, and BEFORE the adoption pass
  // below — a backup written by V6 has no `sessions` key at all, so the list
  // comes back empty and every record in it is adopted into one session named
  // after the range it covers, exactly as it would be on an upgrading phone.
  state.sessions = normaliseSessions(obj.sessions);
  const wantSession = cleanText(obj.currentSessionId, 60);
  state.currentSessionId = sessionById(wantSession) ? wantSession : '';
  adoptOrphanRecords();
  ensureOpenSession();
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
  // ⚠ V12 — THE ALL-SESSIONS COUNT, NOT THE LOG'S. Clearing wipes every session
  // on the phone, so the guard has to look at every session on the phone.
  // unexportedCount() was scoped to the current one in V12; using it here would
  // let an engineer clear away another engineer's unsent session because their
  // OWN session happened to be clean.
  const pending = unexportedCountAllSessions();
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
      // V7 — the sessions go with the records they described. ⚠ LEAVING THEM
      // WOULD LEAVE A SCREEN FULL OF NAMED, EMPTY BATCHES that look like work
      // and are not; a single fresh session is the honest state of a phone with
      // nothing on it.
      state.sessions = [];
      state.currentSessionId = '';
      state.currentLocationId = '';
      ensureOpenSession();
      saveRecords();
      saveSessions();
      savePrefs();
      showToast('Cleared');
      setView('scan');
    },
  });
}

// The nudge. A count, not a date — this app is used in bursts on a job and a day
// counter would nag on the drive home.
function exportNudgeDue() {
  // ⚠ V12 — THE SESSION'S COUNT, DELIBERATELY. The nudge sends the engineer to
  // a button that exports THIS SESSION and nothing else, so counting the whole
  // phone offered to fix a number the button could not move: export, come back,
  // and the nudge is still there saying twelve.
  return unexportedCount() >= EXPORT_NUDGE_AT;
}
