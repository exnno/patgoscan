/*
 * PATGo Scan — dispatch.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Two things live here:
 *   1. THE SCAN GRAMMAR — what a barcode MEANS. scanner.js decides whether a
 *      burst was a scanner; routeScan() decides what to do about it.
 *   2. DELEGATED EVENT HANDLING — three registries attached ONCE to #app at
 *      boot, so they survive every innerHTML rewrite and never need rebinding.
 *
 * ⚠ A THROW INSIDE AN ACTION IS CAUGHT AND RECOVERED TO THE SCAN SCREEN. This
 * is the post-boot half of the crash net (boot.js covers the first render
 * only). Without it, one bad action leaves the app on a half-painted screen
 * with no way back — which on a phone, mid-job, means the engineer force-quits
 * and hopes. Assert this through handleDelegatedClick, never through render().
 */

// ---------------------------------------------------------------------------
// THE SCAN GRAMMAR
//
// One barcode, two possible meanings, decided by whether the location bar is
// armed — decision 1D. The app cannot tell a location label from an asset label
// by looking at it, and guessing from length or prefix would be wrong on the
// first roll of labels that broke the pattern. The engineer arms it; the app
// obeys.
// ---------------------------------------------------------------------------
function routeScan(text) {
  const code = cleanText(text, SCAN_MAX_LENGTH);
  if (!code) return;

  // --- A location ---------------------------------------------------------
  if (state.locationArmed) {
    state.locationArmed = false;
    if (state.mode === MODE_INITIAL) {
      openNewLocationSheet(code);
    } else {
      const rec = addLocationRecord(code, MODE_AUDIT, null);
      showToast(rec ? 'Location: ' + locationLabel(rec) : 'Location set');
      render();
    }
    return;
  }

  // --- An asset -----------------------------------------------------------
  //
  // ⚠ A LOCATION IS REQUIRED FIRST. An item with no location is a row the
  // client cannot place, and across six engineers and several thousand rows
  // there is no way to reconstruct it afterwards. Refusing here costs one tap;
  // allowing it costs a site visit.
  if (!currentLocation()) {
    showToast('Set a location first — tap the bar at the top');
    render();
    return;
  }

  const dup = findItemByCode(code, null);
  if (dup) {
    // Caught at SCAN time, not at save time. Right now the engineer is still
    // stood at the appliance and can look at the label again; by save time they
    // have moved on.
    openConfirmSheet({
      title: 'Already scanned',
      body: 'Asset ' + code + ' was logged as ' + (dup.result || 'no result').toUpperCase() +
            ' at ' + timeOfDay(dup.ts) + '. Test it again and replace that result?',
      confirmLabel: 'Replace',
      cancelLabel: 'Skip it',
      onConfirm: () => { _beginPending(code, dup.id, dup); },
      onCancel: () => render(),
    });
    return;
  }

  _beginPending(code, null, null);
}

// Start an item waiting for a result. Nothing is written to `records` yet — see
// the note on state.pending in state.js.
function _beginPending(code, replaceId, existing) {
  if (state.mode === MODE_INITIAL) {
    openNewItemSheet(code);
    // The sheet sets state.pending itself once it has the description and
    // class. It does not know about replaceId, so carry it separately.
    state._pendingReplaceId = replaceId || '';
    return;
  }
  state._pendingReplaceId = replaceId || '';
  state.pending = {
    code: code,
    mode: MODE_AUDIT,
    // An audit re-scan of an item first logged as an initial keeps the
    // description already captured — re-typing it would be busywork and a
    // chance to type it differently.
    description: existing ? existing.description : '',
    cls: existing ? existing.cls : '',
  };
  render();
}

function commitResult(result, failReason) {
  const pending = state.pending;
  if (!pending) return;
  const replaceId = state._pendingReplaceId || '';
  let rec;
  if (replaceId) rec = replaceItemRecord(replaceId, pending, result, failReason);
  else rec = addItemRecord(pending, result, failReason);

  state.pending = null;
  state._pendingReplaceId = '';
  if (rec) feedback(result);
  render();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const ACTIONS = {

  go: (arg) => setView(arg),
  goSettings: () => setView('settings'),

  setMode: (arg) => {
    state.mode = normaliseMode(arg);
    savePrefs();
    render();
  },

  armLocation: () => { state.locationArmed = true; render(); },
  cancelLocation: () => { state.locationArmed = false; render(); },

  manualEntry: () => {
    openNameSheet({
      title: state.locationArmed ? 'Type a location barcode' : 'Type an asset number',
      placeholder: 'Barcode',
      confirmLabel: 'Use it',
      onConfirm: (v) => {
        const t = cleanText(v, SCAN_MAX_LENGTH);
        if (!t) { render(); return; }
        routeScan(t);
      },
      onCancel: () => render(),
    });
  },

  pass: () => commitResult('pass', ''),
  fail: () => openFailSheet((reason) => commitResult('fail', reason)),

  cancelPending: () => {
    state.pending = null;
    state._pendingReplaceId = '';
    render();
  },

  editRecord: (arg) => openEditSheet(arg),

  dismissWelcome: () => { markWelcomeSeen(); render(); },

  // --- Settings -----------------------------------------------------------
  editEngineer: () => {
    openNameSheet({
      title: 'Your name',
      body: 'Goes on every record and into the export filename, so several engineers\' files can be merged.',
      value: state.engineer,
      onConfirm: (v) => {
        state.engineer = cleanText(v, 60);
        savePrefs();
        showToast('Saved');
        render();
      },
      onCancel: () => render(),
    });
  },

  toggleHaptic:  () => { state.haptic = !state.haptic; savePrefs(); render(); },
  toggleSound:   () => { state.sound = !state.sound; savePrefs(); render(); },
  toggleScanner: () => { state.scannerEnabled = !state.scannerEnabled; savePrefs(); render(); },
  togglePaired:  () => { state.scannerPaired = !state.scannerPaired; savePrefs(); render(); },

  clearScanLog: () => {
    state.scannerTestLog = [];
    const el = document.getElementById('scanner-test-log');
    if (el) el.innerHTML = renderScannerTestLogHTML();
  },

  addReason: () => {
    openNameSheet({
      title: 'New fail reason',
      onConfirm: (v) => {
        const t = cleanText(v, 80);
        if (t) { state.failReasons.push(t); saveLists(); }
        render();
      },
      onCancel: () => render(),
    });
  },

  renameReason: (arg) => {
    const i = clampInt(arg, 0, 999, -1);
    if (i < 0 || !state.failReasons[i]) return;
    openNameSheet({
      title: 'Edit fail reason',
      value: state.failReasons[i],
      onConfirm: (v) => {
        const t = cleanText(v, 80);
        if (t) { state.failReasons[i] = t; saveLists(); }
        render();
      },
      onCancel: () => render(),
    });
  },

  deleteReason: (arg) => {
    const i = clampInt(arg, 0, 999, -1);
    if (i < 0 || !state.failReasons[i]) return;
    const name = state.failReasons[i];
    openConfirmSheet({
      title: 'Remove "' + name + '"?',
      body: 'Records already using it keep it — this only removes it from the list you pick from.',
      confirmLabel: 'Remove', danger: true,
      onConfirm: () => { state.failReasons.splice(i, 1); saveLists(); render(); },
      onCancel: () => render(),
    });
  },

  resetDescriptions: () => {
    openConfirmSheet({
      title: 'Reset descriptions?',
      body: 'Forgets the descriptions this phone has learned and goes back to the starter list.',
      confirmLabel: 'Reset', danger: true,
      onConfirm: () => {
        state.descriptions = makeSeedDescriptions();
        saveLists();
        showToast('Reset');
        render();
      },
      onCancel: () => render(),
    });
  },

  // --- Export -------------------------------------------------------------
  // ⚠ These call straight through to csv.js with nothing asynchronous in
  // between. iOS revokes the user gesture across an await, and without the
  // gesture navigator.share() silently does nothing.
  exportNew:    () => exportCSV(true),
  exportAll:    () => exportCSV(false),
  copyCsv:      () => copyCSV(false),
  exportBackup: () => exportBackup(),
  clearExported: () => clearExportedRecords(),

  reportProblem: () => openBugReport(),

  applyUpdate: () => applyUpdate(),
  dismissUpdate: () => dismissUpdateBanner(),
};

const INPUT_ACTIONS = {
  // ⚠ MUST NOT render() ON A KEYSTROKE. A full render would rebuild the search
  // box and take the cursor with it on every character typed.
  logSearch: (el) => {
    state.logSearch = el.value;
    refreshLogListOnly();
  },
};

const CHANGE_ACTIONS = {
  setTheme: (el) => {
    state.theme = normaliseTheme(el.value);
    savePrefs();
    applyTheme();
    render();
  },
  setScanSpeed: (el) => {
    state.scanSpeed = normaliseScanSpeed(el.value);
    savePrefs();
    showToast('Speed set to ' + state.scanSpeed);
  },
  restoreFile: (el) => {
    const f = el.files && el.files[0];
    // ⚠ Clear the input immediately or choosing the SAME file twice fires
    // nothing the second time — the change event never happens.
    el.value = '';
    if (f) importBackupFile(f);
  },
};

// ---------------------------------------------------------------------------
// Delegation
// ---------------------------------------------------------------------------
function handleDelegatedClick(e) {
  const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
  // Returning early when nothing carries data-action is what lets ordinary
  // links and plain text inside #app behave normally.
  if (!el) return;
  const action = el.getAttribute('data-action');
  const arg = el.getAttribute('data-arg');
  const fn = ACTIONS[action];
  if (typeof fn !== 'function') return;
  try {
    fn(arg, el, e);
  } catch (err) {
    console.error('Action "' + action + '" failed.', err);
    try {
      closeSheet();
      state.pending = null;
      showToast('Something went wrong — back to the scan screen');
      setView('scan');
    } catch (e2) {
      console.error('Recovery also failed.', e2);
    }
  }
}

function handleDelegatedInput(e) {
  const el = e.target && e.target.closest ? e.target.closest('[data-input-action]') : null;
  if (!el) return;
  const fn = INPUT_ACTIONS[el.getAttribute('data-input-action')];
  if (typeof fn === 'function') {
    try { fn(el, e); } catch (err) { console.error('Input action failed.', err); }
  }
}

function handleDelegatedChange(e) {
  const el = e.target && e.target.closest ? e.target.closest('[data-change-action]') : null;
  if (!el) return;
  const fn = CHANGE_ACTIONS[el.getAttribute('data-change-action')];
  if (typeof fn === 'function') {
    try { fn(el, e); } catch (err) { console.error('Change action failed.', err); }
  }
}

let _delegationBound = false;
function initDelegation() {
  if (_delegationBound) return;
  _delegationBound = true;
  // Bound to #app, ONCE. Sheets live outside #app and bind their own handlers
  // directly — safe, because they are not rebuilt by render().
  if (!app) return;
  app.addEventListener('click', handleDelegatedClick);
  app.addEventListener('input', handleDelegatedInput);
  app.addEventListener('change', handleDelegatedChange);
}
