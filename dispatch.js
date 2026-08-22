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

  // --- A destination for an item being moved (V9) --------------------------
  //
  // ⚠ FIRST, AND ONE-SHOT. The arm is cleared before anything can fail, so
  // every path out of this branch leaves the app disarmed. An arm that survived
  // its own error case would sit waiting on the log screen after telling the
  // engineer it had not worked, and take the next barcode as well.
  if (state.moveArmed) {
    const id = state.moveArmed;
    state.moveArmed = '';
    _routeMoveScan(id, code);
    return;
  }

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

// V9 — the destination has been scanned. Everything that can go wrong here ends
// the same way: say what happened, disarmed, with the record untouched.
//
// ⚠ THE ORDER OF THESE CHECKS IS THE MESSAGE THE ENGINEER GETS. Each one
// explains a different situation, so the narrowest true reason must win — and
// the session check has to come before the lookup, because for an item outside
// the current session NO barcode could ever resolve and "that location isn't in
// this session" would send them off to scan a label that would not help.
function _routeMoveScan(id, code) {
  const rec = recordById(id);
  if (!rec || rec.type !== 'item') {
    showToast('That record has gone');
    render();
    return;
  }

  // ⚠ V9 — SESSIONS DO NOT MIX, and this is the one rule here that protects the
  // client's file rather than the engineer's patience. The log shows every
  // session, so the edit sheet can be opened on an item belonging to a batch
  // that is not the one being scanned into. Pointing it at a location from
  // today's session would export an item under a location the file it lands in
  // does not contain.
  if (!inCurrentSession(rec)) {
    showToast('That item is in another session');
    render();
    return;
  }

  // ⚠ 4A — A LOCATION THAT HAS NOT BEEN SCANNED IS REFUSED, NOT CREATED. Same
  // rule the V4 picker has always followed: an item can only be moved somewhere
  // that already exists, so the export can never carry an item row pointing at
  // a location row that is not in the file. It also makes the accident safe —
  // an ASSET barcode scanned here is simply not a location, and gets this
  // message instead of quietly becoming a junk location record.
  const loc = findLocationByCode(code);
  if (!loc) {
    showToast(code + ' is not a location in this session');
    render();
    return;
  }

  if (loc.id === rec.locationId) {
    showToast(rec.code + ' is already at ' + locationLabel(loc));
    render();
    return;
  }

  // The model already does this correctly — both fields or neither (rule 12).
  updateRecordFields(id, { locationId: loc.id });
  showToast(rec.code + ' moved to ' + locationLabel(loc));
  render();
}

// V9 — arm a move and put the engineer where the banner is.
//
// ⚠ THE ORDER HERE IS LOAD-BEARING AND LOOKS WRONG. setView() clears every
// transient by design, moveArmed included, so arming first and navigating
// second disarms silently: the banner never appears, the scan goes to the log
// search, and nothing tells anybody why. Navigate, THEN arm.
function armMove(id) {
  setView('log');
  state.moveArmed = id;
  render();
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
    // V5 — audit items now carry a class and a visual flag, from the toggles.
    //
    // ⚠ THE TOGGLE WINS OVER THE EXISTING RECORD, and that is deliberate.
    // Before V5 an audit re-scan inherited `existing.cls`, because there was no
    // other way for an audit item to have one. Now there is, and the toggle is
    // the engineer's live statement about the appliance in front of them — a
    // rule of "the toggle, unless an older record disagrees" is the kind
    // nobody remembers, and it would make the switch silently inert on exactly
    // the items most likely to need correcting. The duplicate sheet has already
    // told them this asset was scanned before.
    cls: state.itemClass,
    visual: state.visualMode === true,
  };
  render();
}

function commitResult(result, failReason) {
  const pending = state.pending;
  if (!pending) return;
  const replaceId = state._pendingReplaceId || '';
  let rec;
  if (replaceId) rec = replaceItemRecord(replaceId, pending, result, failReason);
  // V11 — a run. ⚠ THE BRANCH IS ON THE PENDING ITEM, NOT ON A SECOND FLAG.
  // `count` is the whole of what makes this a run, so there is no way to be
  // half in one. A run and a replace cannot both be true — the sheet does not
  // offer the count on a re-scan — and the order here states which would win if
  // that ever stopped being enforced upstream: the replace, because overwriting
  // one known record is the smaller mistake of the two.
  else if (pending.count > 1) rec = addItemRun(pending, result, failReason);
  else rec = addItemRecord(pending, result, failReason);

  // ⚠ A REFUSED RUN LEAVES THE PENDING ITEM WHERE IT IS. addItemRun() returns
  // null when an id in the range has been taken since the sheet checked, and
  // clearing the pending item on that path would throw away a scan and a typed
  // description to say nothing at all. Every other path clears, as it always
  // has: a written record is finished with.
  if (!rec && pending.count > 1) {
    showToast('One of those numbers is already logged');
    render();
    return;
  }

  state.pending = null;
  state._pendingReplaceId = '';
  if (rec) feedback(result);
  // ⚠ A RUN SAYS HOW MANY IT WROTE, AND A SINGLE SCAN STAYS SILENT. Six records
  // appearing at once is the one commit in this app whose size is not obvious
  // from the screen afterwards — the last-item block shows the LAST id and the
  // counts have moved by an amount nobody is counting. A toast on every single
  // scan would be noise all day; on a run it is the receipt.
  if (rec && pending.count > 1) showToast(pending.count + ' items recorded');
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

  // V5 — the two persistent toggles. Same shape as setMode above: a
  // two-position switch written straight through to storage so it survives a
  // restart (decision 7A).
  //
  // ⚠ CHANGING A TOGGLE WHILE AN ITEM IS PENDING UPDATES THE PENDING ITEM TOO,
  // and this is the whole reason the toggle state is repeated down on the
  // pending panel. The moment an engineer is most likely to notice the switch
  // is in the wrong position is when they look down at an asset waiting for a
  // result. Without this they would have to discard the scan and start again —
  // and the realistic alternative to that, mid-corridor, is pressing PASS
  // anyway and leaving a wrong row in the client's file.
  setClass: (arg) => {
    state.itemClass = normaliseItemClass(arg);
    if (state.pending) state.pending.cls = state.itemClass;
    savePrefs();
    render();
  },

  setVisual: (arg) => {
    state.visualMode = (arg === 'visual');
    if (state.pending) state.pending.visual = state.visualMode;
    savePrefs();
    render();
  },

  armLocation: () => { state.locationArmed = true; render(); },
  cancelLocation: () => { state.locationArmed = false; render(); },
  // V9. The whole banner is the cancel target, not a small × in the corner —
  // this is a state the engineer wants OUT of, one-handed, holding a scanner.
  cancelMove: () => { state.moveArmed = ''; render(); },

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

  // ⚠ V11 — PASS COMMITS A RUN ON ONE TAP AND FAIL DOES NOT, AND THE ASYMMETRY
  // IS THE SAFETY FEATURE. It is the same shape as the Visual toggle colouring
  // in while Test stays quiet: the costly outcome is the one that has to be
  // said twice. The PASS button already reads "PASS ALL 10", which states the
  // count before the thumb lands, and a pass wrongly given is corrected in the
  // log. A fail wrongly given is ten rows with a fail reason in the client's
  // system, and the reason is the part that gets acted on at their end.
  //
  // ⚠ DO NOT "TIDY" THIS BY CONFIRMING BOTH. A confirmation on the outcome that
  // happens all day is a confirmation that stops being read, and it would take
  // the weight out of this one.
  pass: () => commitResult('pass', ''),

  fail: () => openFailSheet((reason) => {
    const p = state.pending;
    const n = (p && p.count > 1) ? p.count : 0;
    if (!n) { commitResult('fail', reason); return; }
    openConfirmSheet({
      title: 'Fail all ' + n + ' items?',
      body: runRangeLabel(runCodesFrom(p.code, n)) + ' — ' + n +
            ' items recorded as FAIL, reason: ' + reason +
            '. Only ' + p.code + ' was scanned; the rest are numbered from it.',
      confirmLabel: 'Fail all ' + n, danger: true,
      onConfirm: () => commitResult('fail', reason),
      // ⚠ THE PENDING RUN SURVIVES A CANCEL. Backing out of this returns to the
      // verdict panel with the run intact, so "no, not all of them" costs a tap
      // rather than a re-scan and a retyped description.
      onCancel: () => render(),
    });
  }),

  cancelPending: () => {
    state.pending = null;
    state._pendingReplaceId = '';
    render();
  },

  editRecord: (arg) => openEditSheet(arg),

  // V6 (13D) — the last item quick view. ⚠ THE WHOLE FEATURE'S DISPATCH SURFACE
  // IS THESE TWO ENTRIES. Nothing else calls them; removing the block means
  // removing them and renderLastItem() and the CSS, and nothing else.
  //
  // ⚠ UNDO CONFIRMS. It is the one destructive control on the scan screen that
  // is not "discard the thing you have not committed yet" — this record is
  // already in the log and already counted.
  editLastItem: () => {
    const rec = lastItemRecord();
    if (!rec) { showToast('Nothing recorded yet'); return; }
    openEditSheet(rec.id);
  },

  undoLastItem: () => {
    const rec = lastItemRecord();
    if (!rec) { showToast('Nothing recorded yet'); return; }
    openConfirmSheet({
      title: 'Undo ' + rec.code + '?',
      body: 'It will be removed from the log and from any future export. Scan it again to record it afresh.',
      confirmLabel: 'Undo', danger: true,
      onConfirm: () => { deleteRecord(rec.id); showToast('Removed ' + rec.code); render(); },
      onCancel: () => render(),
    });
  },

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

  // V6 — the readings (decision 4B). Free text, deliberately: '<0.2' and
  // '>19.99' are not numbers and a numeric input would refuse both.
  editEarthBond: () => {
    openNameSheet({
      title: 'Earth bond reading',
      body: 'Written onto each Class 1 item as you log it. Class 2 items never carry one.',
      value: state.earthBondValue,
      onConfirm: (v) => {
        state.earthBondValue = cleanText(v, READING_MAX);
        savePrefs();
        render();
      },
      onCancel: () => render(),
    });
  },

  editInsulation: () => {
    openNameSheet({
      title: 'Insulation reading',
      body: 'Written onto each item you test. A visual inspection never carries one.',
      value: state.insulationValue,
      onConfirm: (v) => {
        state.insulationValue = cleanText(v, READING_MAX);
        savePrefs();
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

  // --- Quick Pick presets (V1.1) ------------------------------------------
  // ⚠ These read the textarea out of the DOM at the moment of the tap rather
  // than tracking it on every keystroke. An input action that re-rendered would
  // rebuild the box and take the cursor with it — the rule that the log search
  // field exists to demonstrate.
  saveQuickPicks: () => {
    const p = activePreset();
    const el = document.getElementById('qp-items');
    if (!p || !el) return;
    setPresetItemsFromText(p.id, el.value);
    showToast('Quick Pick saved');
    render();
  },

  resetQuickPicks: () => {
    openConfirmSheet({
      title: 'Reset Quick Pick?',
      body: 'Replaces every list with the one starter list. Your typed descriptions and fail reasons are not touched.',
      confirmLabel: 'Reset', danger: true,
      onConfirm: () => {
        state.itemPresets = makeDefaultPresets();
        state.activePresetId = state.itemPresets[0].id;
        saveLists();
        showToast('Reset');
        render();
      },
      onCancel: () => render(),
    });
  },

  addPreset: () => {
    openNameSheet({
      title: 'New Quick Pick list',
      body: 'Name it for where you use it — Workshop, Offices, Kitchens.',
      placeholder: 'e.g. Workshop',
      confirmLabel: 'Create',
      onConfirm: (v) => {
        const p = addPreset(v);
        if (p) showToast('Created — now add its items');
        render();
      },
      onCancel: () => render(),
    });
  },

  renamePreset: () => {
    const p = activePreset();
    if (!p) return;
    openNameSheet({
      title: 'Rename list',
      value: p.name,
      onConfirm: (v) => {
        renamePreset(p.id, v);
        render();
      },
      onCancel: () => render(),
    });
  },

  deletePreset: () => {
    const p = activePreset();
    if (!p) return;
    openConfirmSheet({
      title: 'Delete "' + p.name + '"?',
      body: 'Only the list of buttons goes. Nothing you have already tested changes.',
      confirmLabel: 'Delete', danger: true,
      onConfirm: () => {
        if (!deletePreset(p.id)) showToast('That is your only list — it has to stay');
        render();
      },
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
  // ---------------------------------------------------------------------
  // V7 — SESSIONS
  //
  // ⚠ EVERY DESTRUCTIVE OR DIRECTION-CHANGING ONE CONFIRMS. Switching, closing
  // and reopening all change which batch the next scan lands in and which
  // records the next export writes, and none of that is visible from the tap
  // itself. Rename and share change nothing and go straight through.
  // ---------------------------------------------------------------------
  goSessions: () => setView('sessions'),

  newSession: () => {
    openNameSheet({
      title: 'Start a new session',
      body: 'Everything you scan from now on goes into it. The one you are in now stays exactly as it is.',
      value: defaultSessionName(Date.now()),
      placeholder: 'Name this batch',
      confirmLabel: 'Start',
      onConfirm: (name) => {
        const ses = createSession(name);
        showToast('Working in ' + ses.name);
        setView('scan');
      },
      onCancel: () => render(),
    });
  },

  switchSession: (arg) => {
    const ses = sessionById(arg);
    if (!ses) return;
    openConfirmSheet({
      title: 'Work in ' + ses.name + '?',
      body: 'Everything you scan will go into it, and exporting will send the whole of it. Your current location is cleared, so scan the room again when you start.',
      confirmLabel: 'Switch',
      onConfirm: () => { switchToSession(ses.id); showToast('Working in ' + ses.name); setView('scan'); },
      onCancel: () => render(),
    });
  },

  renameSession: (arg) => {
    const ses = sessionById(arg);
    if (!ses) return;
    openNameSheet({
      title: 'Rename session',
      value: ses.name,
      confirmLabel: 'Save',
      onConfirm: (name) => { renameSession(ses.id, name); render(); },
      onCancel: () => render(),
    });
  },

  closeSession: (arg) => {
    const ses = sessionById(arg);
    if (!ses) return;
    const c = sessionCounts(ses.id);
    openConfirmSheet({
      title: 'Close ' + ses.name + '?',
      body: (c.unexported ? c.unexported + ' record' + (c.unexported === 1 ? ' has' : 's have') +
             ' not been exported yet. Closing keeps everything — you can still export it, and you can reopen it later. '
           : 'Nothing is deleted. You can reopen it later. ') +
            'You will be moved to a new session for anything you scan next.',
      confirmLabel: 'Close it',
      onConfirm: () => { closeSession(ses.id); showToast('Closed ' + ses.name); render(); },
      onCancel: () => render(),
    });
  },

  // Decision 5B — reopening is allowed, and it asks first. ⚠ THE WARNING IS THE
  // POINT OF THE DECISION. A closed session has usually been sent to the
  // client; adding to it means the next export sends the whole thing again, and
  // an engineer who reopens one by accident would have no way to tell from the
  // scan screen that today's work is landing in last Tuesday's batch.
  reopenSession: (arg) => {
    const ses = sessionById(arg);
    if (!ses) return;
    openConfirmSheet({
      title: 'Are you sure?',
      body: ses.name + ' was closed. Reopening it makes it the session you are working in, so everything you scan next goes into it — and the next export sends the whole of it again, not just what you add.',
      confirmLabel: 'Reopen it',
      onConfirm: () => { reopenSession(ses.id); showToast('Working in ' + ses.name); setView('scan'); },
      onCancel: () => render(),
    });
  },

  deleteSession: (arg) => {
    const ses = sessionById(arg);
    if (!ses) return;
    openConfirmSheet({
      title: 'Delete ' + ses.name + '?',
      body: 'It has nothing in it, so nothing is lost.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => { deleteEmptySession(ses.id); showToast('Deleted'); render(); },
      onCancel: () => render(),
    });
  },

  // ⚠ CALLED STRAIGHT FROM THE TAP, no confirm and nothing asynchronous before
  // it — iOS revokes the user gesture across an await and the share sheet never
  // appears. Same rule as the CSV export and the backup.
  shareSession: (arg) => exportSessionFile(arg),

  mergeSession: (arg) => openMergePickerSheet(arg),

  reviewPick: (arg) => {
    const parts = String(arg || '').split('|');
    reviewChoose(parts[0], parts[1]);
  },
  reviewAll:    (arg) => reviewChooseAll(arg),
  reviewCommit: () => commitReview(),
  cancelReview: () => { cancelReview(); setView('sessions'); },

  // V7 (3B) — one export, and it writes the whole current session.
  exportNew:    () => exportCSV(),
  copyCsv:      () => copyCSV(),
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
  // Switching is global and immediate — it changes which buttons show and
  // nothing else. It can never alter a record, so there is nothing to confirm.
  switchPreset: (el) => {
    if (setActivePreset(el.value)) render();
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
  // V7. ⚠ SAME CLEAR-THE-INPUT RULE, and it bites harder here: an engineer who
  // cancels a review and then picks the same file again is the expected way to
  // use this screen, not an edge case.
  importSession: (el) => {
    const f = el.files && el.files[0];
    el.value = '';
    if (f) importSessionFile(f);
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
