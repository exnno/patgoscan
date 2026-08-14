/*
 * PATGo Scan — render.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Every screen in the app, plus the sheets and the welcome modal.
 *
 * ⚠ render() IS SYNCHRONOUS AND REBUILDS #app.innerHTML WHOLESALE. Never make
 * it async. Anything it needs must already be in `state` by the time it runs.
 *
 * ⚠ THE NO-RENDER RULE. A sheet CONTAINING INPUTS must never call render()
 * while it is open — a rebuild tears down the focused field and drops the
 * keyboard mid-word. That is why the sheets in this file build their own DOM
 * into <body> (via _openSheet in feedback.js) and are NOT part of render()'s
 * output at all. They mutate themselves in place and only render() on close.
 *
 * ⚠ ALL CLICKS ARE DELEGATED (dispatch.js). Markup here carries data-action /
 * data-arg attributes and NOTHING here attaches an onclick — a listener bound
 * to a node that innerHTML is about to replace is a leak and a dead button.
 * The sheets are the deliberate exception: they live outside #app, so their
 * handlers are safe and are bound directly.
 */

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Navigation
//
// ⚠ EVERY TRANSIENT IS CLEARED HERE. A sheet flag that survives navigation
// reopens a sheet on a screen that knows nothing about it. If you add a
// transient to state.js, add it here too.
// ---------------------------------------------------------------------------
function setView(v) {
  state.view = v;
  state.locationArmed = false;
  closeSheet();
  render();
}

function applyTheme() {
  const t = state.theme;
  const dark = t === 'dark' ||
    (t === 'auto' && window.matchMedia &&
     window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------
function render() {
  if (!app) return;

  if (!state.welcomeSeen) {
    app.innerHTML = renderWelcome();
    state._lastRenderedView = 'welcome';
    return;
  }

  let html = '';
  switch (state.view) {
    case 'log':             html = renderLog(); break;
    case 'settings':        html = renderSettings(); break;
    case 'settingsScanner': html = renderSettingsScanner(); break;
    case 'settingsLists':   html = renderSettingsLists(); break;
    case 'settingsBackup':  html = renderSettingsBackup(); break;
    case 'about':           html = renderAbout(); break;
    default:                html = renderScan(); break;
  }
  app.innerHTML = html;

  // Scroll to the top only when the SCREEN changed, not on every repaint — a
  // repaint after logging an item must leave the engineer where they were.
  if (state._lastRenderedView !== state.view) {
    try { window.scrollTo(0, 0); } catch (e) {}
    state._lastRenderedView = state.view;
  }

  // Paired mode. Called after every paint of the scan screen, because dropping
  // focus is what "the scan after a PASS goes nowhere" actually was.
  if (typeof focusScanInput === 'function') {
    try { focusScanInput(); } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------
function renderHeader(title, backAction) {
  return `
  <header class="hdr">
    ${backAction
      ? `<button type="button" class="hdr-btn" data-action="${backAction}" aria-label="Back">‹</button>`
      : `<span class="hdr-mark" aria-hidden="true"></span>`}
    <h1 class="hdr-title">${escapeHTML(title)}</h1>
    ${backAction ? '<span class="hdr-btn is-spacer"></span>' : ''}
  </header>`;
}

function renderNav(active) {
  const tab = (id, label, view) => `
    <button type="button" class="nav-tab${active === view ? ' is-active' : ''}"
            data-action="go" data-arg="${view}">${escapeHTML(label)}</button>`;
  const pending = unexportedCount();
  return `
  <nav class="nav">
    ${tab('scan', 'Scan', 'scan')}
    ${tab('log', 'Log' + (pending ? ' (' + pending + ')' : ''), 'log')}
    ${tab('settings', 'Settings', 'settings')}
  </nav>`;
}

// ---------------------------------------------------------------------------
// THE SCAN SCREEN — the only screen that matters on a working day
// ---------------------------------------------------------------------------
function renderScan() {
  const initial = state.mode === MODE_INITIAL;
  const loc = currentLocation();
  const counts = todayCounts();
  const pending = state.pending;

  // The location bar. Three states: armed and waiting, set, or not yet set.
  let locBar;
  if (state.locationArmed) {
    locBar = `
    <div class="locbar is-armed" data-action="cancelLocation">
      <span class="locbar-label">Scan a location barcode now</span>
      <span class="locbar-hint">Tap to cancel</span>
    </div>`;
  } else if (loc) {
    locBar = `
    <div class="locbar is-set" data-action="armLocation">
      <span class="locbar-label">${escapeHTML(locationLabel(loc))}</span>
      <span class="locbar-hint">${escapeHTML(loc.code)} · tap to change</span>
    </div>`;
  } else {
    locBar = `
    <div class="locbar is-empty" data-action="armLocation">
      <span class="locbar-label">No location set</span>
      <span class="locbar-hint">Tap, then scan a location barcode</span>
    </div>`;
  }

  // The result panel. Either an asset waiting to be judged, or the prompt.
  let panel;
  if (pending) {
    const desc = [pending.description, pending.cls ? 'Class ' + pending.cls : '']
      .filter(isNonEmptyString).join(' · ');
    panel = `
    <div class="pending">
      <span class="pending-label">Waiting for a result</span>
      <span class="pending-code">${escapeHTML(pending.code)}</span>
      ${desc ? `<span class="pending-desc">${escapeHTML(desc)}</span>` : ''}
    </div>
    <div class="verdict">
      <button type="button" class="btn-pass" data-action="pass">PASS</button>
      <button type="button" class="btn-fail" data-action="fail">FAIL</button>
    </div>
    <button type="button" class="btn btn-ghost btn-wide" data-action="cancelPending">Discard this scan</button>`;
  } else {
    panel = `
    <div class="prompt">
      <span class="prompt-big">Scan an asset</span>
      <span class="prompt-small">${initial
        ? 'Initial — you will be asked for a description and class'
        : 'Audit — pass or fail only'}</span>
    </div>`;
  }

  return `
  <div class="screen${initial ? ' mode-initial' : ''}">
    ${renderHeader('PATGo Scan')}
    <main class="main">

      <div class="modeswitch" role="group" aria-label="Scan mode">
        <button type="button" class="mode-opt${!initial ? ' is-on' : ''}"
                data-action="setMode" data-arg="${MODE_AUDIT}">Audit</button>
        <button type="button" class="mode-opt${initial ? ' is-on' : ''}"
                data-action="setMode" data-arg="${MODE_INITIAL}">Initial</button>
      </div>

      ${locBar}

      <input type="text" id="scan-input" class="scanbox"
             placeholder="Barcode appears here"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
             ${state.scannerPaired ? 'inputmode="none"' : ''}
             value="">
      <button type="button" class="linkbtn" data-action="manualEntry">Type a number instead</button>

      ${panel}

      <div class="counts">
        <span><b>${counts.pass}</b> pass</span>
        <span><b>${counts.fail}</b> fail</span>
        <span><b>${counts.locations}</b> locations</span>
        <span class="counts-note">today</span>
      </div>

      ${exportNudgeDue() ? `
      <div class="nudge" data-action="go" data-arg="settingsBackup">
        ${unexportedCount()} records not exported yet — tap to export
      </div>` : ''}

    </main>
    ${renderNav('scan')}
  </div>`;
}

// ---------------------------------------------------------------------------
// THE LOG — the correction path (decision 5)
// ---------------------------------------------------------------------------
function renderLog() {
  return `
  <div class="screen">
    ${renderHeader('Log')}
    <main class="main">
      <input type="text" id="log-search" class="field" placeholder="Search asset or location"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
             data-input-action="logSearch" value="${escapeHTML(state.logSearch)}">
      <div id="log-list">${renderLogListHTML()}</div>
    </main>
    ${renderNav('log')}
  </div>`;
}

// Split out so a search keystroke repaints the list ALONE. Re-rendering the
// whole screen would take the search box's focus with it on every character.
function renderLogListHTML() {
  const q = cleanText(state.logSearch, 60).toLowerCase();
  let rows = state.records.slice().sort(byNewest);
  if (q) {
    rows = rows.filter(r =>
      String(r.code).toLowerCase().indexOf(q) !== -1 ||
      String(r.description || '').toLowerCase().indexOf(q) !== -1 ||
      String(r.room || '').toLowerCase().indexOf(q) !== -1 ||
      String(r.locationCode || '').toLowerCase().indexOf(q) !== -1);
  }
  if (!rows.length) {
    return `<p class="muted">${q ? 'Nothing matches that.' : 'Nothing scanned yet. Everything you log appears here and can be corrected by tapping it.'}</p>`;
  }
  return rows.map(r => {
    if (r.type === 'location') {
      return `
      <button type="button" class="row row-loc" data-action="editRecord" data-arg="${escapeHTML(r.id)}">
        <span class="row-main">${escapeHTML(locationLabel(r))}</span>
        <span class="row-sub">Location · ${escapeHTML(r.mode)} · ${escapeHTML(r.code)} · ${escapeHTML(timeOfDay(r.ts))}</span>
        ${r.exported ? '' : '<span class="row-dot" title="Not exported"></span>'}
      </button>`;
    }
    const bits = [r.description, r.cls ? 'Class ' + r.cls : '', r.locationCode]
      .filter(isNonEmptyString).join(' · ');
    return `
    <button type="button" class="row row-item is-${escapeHTML(r.result || 'none')}"
            data-action="editRecord" data-arg="${escapeHTML(r.id)}">
      <span class="row-main">${escapeHTML(r.code)}
        <span class="row-result">${escapeHTML((r.result || '').toUpperCase())}</span></span>
      <span class="row-sub">${escapeHTML(bits || r.mode)}${r.failReason ? ' · ' + escapeHTML(r.failReason) : ''} · ${escapeHTML(timeOfDay(r.ts))}</span>
      ${r.exported ? '' : '<span class="row-dot" title="Not exported"></span>'}
    </button>`;
  }).join('');
}

function refreshLogListOnly() {
  const el = document.getElementById('log-list');
  if (el) el.innerHTML = renderLogListHTML();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function renderSettings() {
  const link = (label, view, sub) => `
    <button type="button" class="row" data-action="go" data-arg="${view}">
      <span class="row-main">${escapeHTML(label)}</span>
      ${sub ? `<span class="row-sub">${escapeHTML(sub)}</span>` : ''}
    </button>`;
  return `
  <div class="screen">
    ${renderHeader('Settings')}
    <main class="main">
      <button type="button" class="row" data-action="editEngineer">
        <span class="row-main">Engineer</span>
        <span class="row-sub">${escapeHTML(state.engineer || 'Not set — tap to add your name')}</span>
      </button>
      ${link('Barcode scanner', 'settingsScanner', state.scannerEnabled ? 'On' : 'Off')}
      ${link('Fail reasons and descriptions', 'settingsLists', state.failReasons.length + ' fail reasons')}
      ${link('Export and backup', 'settingsBackup', unexportedCount() + ' not exported')}

      <h2 class="sec">Appearance</h2>
      <div class="rowline">
        <span>Theme</span>
        <select class="field field-inline" data-change-action="setTheme">
          <option value="auto"${state.theme === 'auto' ? ' selected' : ''}>Match phone</option>
          <option value="light"${state.theme === 'light' ? ' selected' : ''}>Light</option>
          <option value="dark"${state.theme === 'dark' ? ' selected' : ''}>Dark</option>
        </select>
      </div>
      ${renderToggle('Vibrate on a result', 'toggleHaptic', state.haptic)}
      ${renderToggle('Sound on a result', 'toggleSound', state.sound)}

      ${link('About', 'about', 'Version ' + APP_VERSION)}
      <button type="button" class="row" data-action="reportProblem">
        <span class="row-main">Report a problem</span>
        <span class="row-sub">Sends the details Peter needs to fix it</span>
      </button>
    </main>
    ${renderNav('settings')}
  </div>`;
}

function renderToggle(label, action, on) {
  return `
  <div class="rowline">
    <span>${escapeHTML(label)}</span>
    <button type="button" class="toggle${on ? ' is-on' : ''}" data-action="${action}"
            role="switch" aria-checked="${on ? 'true' : 'false'}"
            aria-label="${escapeHTML(label)}"><span class="knob"></span></button>
  </div>`;
}

function renderSettingsScanner() {
  const speeds = ['strict', 'normal', 'relaxed'];
  return `
  <div class="screen">
    ${renderHeader('Barcode scanner', 'goSettings')}
    <main class="main">
      ${renderToggle('Accept scans', 'toggleScanner', state.scannerEnabled)}
      ${renderToggle('Scanner always connected', 'togglePaired', state.scannerPaired)}
      <p class="muted small">Turn the second one on only when a scanner is paired to this phone. It puts the cursor in the scan box by itself so you never have to tap first — but with no scanner attached it will keep opening the on-screen keyboard.</p>

      <h2 class="sec">Speed</h2>
      <p class="muted small">The app tells a scanner from a thumb by how fast the characters arrive. If good scans are being rejected, move this looser.</p>
      <div class="rowline">
        <span>Threshold</span>
        <select class="field field-inline" data-change-action="setScanSpeed">
          ${speeds.map(s => `<option value="${s}"${state.scanSpeed === s ? ' selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)} (${SCAN_GAP_PRESETS[s]}ms)</option>`).join('')}
        </select>
      </div>

      <h2 class="sec">Test it</h2>
      <p class="muted small">Pull the trigger with this page open. Everything the scanner sends appears below — accepted or not, and why not.</p>
      <input type="text" id="scanner-test" class="field" placeholder="Scan here"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      <div id="scanner-test-log" class="scanner-log">${renderScannerTestLogHTML()}</div>
      <button type="button" class="btn btn-ghost btn-wide" data-action="clearScanLog">Clear the test log</button>
    </main>
  </div>`;
}

function renderSettingsLists() {
  const reasons = state.failReasons.map((r, i) => `
    <div class="rowline">
      <span>${escapeHTML(r)}</span>
      <span class="rowline-actions">
        <button type="button" class="linkbtn" data-action="renameReason" data-arg="${i}">Edit</button>
        <button type="button" class="linkbtn is-danger" data-action="deleteReason" data-arg="${i}">Remove</button>
      </span>
    </div>`).join('');
  return `
  <div class="screen">
    ${renderHeader('Lists', 'goSettings')}
    <main class="main">
      <h2 class="sec">Fail reasons</h2>
      ${reasons || '<p class="muted">No fail reasons. Add one below.</p>'}
      <button type="button" class="btn btn-ghost btn-wide" data-action="addReason">Add a fail reason</button>

      <h2 class="sec">Item descriptions</h2>
      <p class="muted small">Descriptions are remembered as you type them and offered back, most recent first. There is nothing to set up.</p>
      <p class="muted small">${state.descriptions.length} remembered.</p>
      <button type="button" class="btn btn-ghost btn-wide" data-action="resetDescriptions">Reset to the starter list</button>
    </main>
  </div>`;
}

function renderSettingsBackup() {
  const pending = unexportedCount();
  return `
  <div class="screen">
    ${renderHeader('Export and backup', 'goSettings')}
    <main class="main">
      <h2 class="sec">Send to the client</h2>
      <p class="muted small">One CSV, every record in scan order. Exporting marks records as sent but does not delete anything.</p>
      <button type="button" class="btn btn-primary btn-wide" data-action="exportNew">
        Export ${pending} new record${pending === 1 ? '' : 's'}</button>
      <button type="button" class="btn btn-ghost btn-wide" data-action="exportAll">
        Export everything (${state.records.length})</button>
      <button type="button" class="btn btn-ghost btn-wide" data-action="copyCsv">Copy the CSV to the clipboard</button>

      <h2 class="sec">Backup</h2>
      <p class="muted small">A full copy of everything on this phone, including your settings. This is what saves you if the phone is lost — do it at the end of every day.</p>
      <button type="button" class="btn btn-primary btn-wide" data-action="exportBackup">Save a backup file</button>
      <label class="btn btn-ghost btn-wide" for="restore-file">Restore from a backup file</label>
      <input type="file" id="restore-file" accept=".json,application/json" class="hidden-file"
             data-change-action="restoreFile">

      <h2 class="sec">Clear</h2>
      <p class="muted small">Only possible once everything has been exported.</p>
      <button type="button" class="btn btn-danger btn-wide" data-action="clearExported">Clear exported records</button>

      <p class="muted small">Storage used: ${escapeHTML(formatBytes(storageBytes()))}</p>
    </main>
  </div>`;
}

function renderAbout() {
  return `
  <div class="screen">
    ${renderHeader('About', 'goSettings')}
    <main class="main">
      <p><b>PATGo Scan</b> — version ${escapeHTML(APP_VERSION)}</p>
      <p class="muted small">A barcode-first testing log built for a single client's audit and initial workflow. It records what you scanned and what you found; their system does the rest.</p>

      <h2 class="sec">What's new</h2>
      <p class="muted small"><b>V1</b> — first release. Audit and initial modes, sticky locations, scan-to-log, CSV export and full backup.</p>

      <p class="muted small">© 2026 Peter Birchley. All rights reserved.</p>
    </main>
  </div>`;
}

function renderWelcome() {
  return `
  <div class="screen">
    <main class="main welcome">
      <h1>PATGo Scan</h1>
      <p>Built for barcode testing. Here is the whole app in four lines:</p>
      <ul>
        <li>Tap the location bar, scan a location barcode. Everything you scan after that is recorded there.</li>
        <li><b>Audit</b> mode: scan an asset, tap PASS or FAIL. That's it.</li>
        <li><b>Initial</b> mode: the screen turns amber, and each new asset asks for a description and class.</li>
        <li>At the end of the day, Settings → Export and backup. Send the CSV, save a backup.</li>
      </ul>
      <p class="muted small">Put your name in Settings first — it goes on every record and into the filename, which is what lets several engineers' files be merged.</p>
      <button type="button" class="btn btn-primary btn-wide" data-action="dismissWelcome">Start</button>
    </main>
  </div>`;
}

// ---------------------------------------------------------------------------
// SHEETS
//
// These build their own DOM into <body> and are NOT part of render(). See the
// no-render rule at the top of this file.
// ---------------------------------------------------------------------------

// Initial mode, asset scanned: gather description and class before the result.
function openNewItemSheet(code) {
  const sheet = _openSheet('New item');
  sheet.innerHTML = `
    <h3 class="sheet-title">New item</h3>
    <p class="sheet-code">${escapeHTML(code)}</p>
    <label class="lbl" for="ni-desc">Description</label>
    <input type="text" id="ni-desc" class="field" autocomplete="off"
           autocapitalize="words" spellcheck="false" placeholder="e.g. Kettle">
    <div id="ni-suggest" class="suggest"></div>
    <label class="lbl">Class</label>
    <div class="classpick" id="ni-class">
      ${CLASS_OPTIONS.map(c => `<button type="button" class="class-opt" data-cls="${c}">Class ${c}</button>`).join('')}
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="ni-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="ni-ok">Continue</button>
    </div>`;

  let chosenClass = '';
  const desc = sheet.querySelector('#ni-desc');
  const suggest = sheet.querySelector('#ni-suggest');

  const paintSuggest = () => {
    const list = suggestDescriptions(desc.value);
    suggest.innerHTML = list.map(d =>
      `<button type="button" class="suggestion-item" data-d="${escapeHTML(d)}">${escapeHTML(d)}</button>`).join('');
  };
  paintSuggest();

  // ⚠ pointerdown, NOT click. A click races the blur teardown and iOS loses the
  // tap entirely — this cost the parent app a hotfix.
  suggest.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.suggestion-item');
    if (!btn) return;
    e.preventDefault();
    desc.value = btn.getAttribute('data-d') || '';
    paintSuggest();
  });
  desc.addEventListener('input', paintSuggest);

  sheet.querySelector('#ni-class').addEventListener('click', (e) => {
    const btn = e.target.closest('.class-opt');
    if (!btn) return;
    chosenClass = btn.getAttribute('data-cls') || '';
    sheet.querySelectorAll('.class-opt').forEach(b =>
      b.classList.toggle('is-on', b === btn));
  });

  sheet.querySelector('#ni-cancel').onclick = () => { closeSheet(); render(); };
  sheet.querySelector('#ni-ok').onclick = () => {
    const d = titleCaseWords(cleanText(desc.value, 80));
    if (!d) { showToast('Give it a description'); return; }
    if (!chosenClass) { showToast('Pick a class'); return; }
    closeSheet();
    state.pending = { code: code, mode: MODE_INITIAL, description: d, cls: chosenClass };
    render();
  };
  setTimeout(() => { try { desc.focus(); } catch (e) {} }, 60);
}

// Initial mode, location scanned: gather client, floor, room.
function openNewLocationSheet(code) {
  const sheet = _openSheet('New location');
  const existing = findLocationByCode(code);
  sheet.innerHTML = `
    <h3 class="sheet-title">New location</h3>
    <p class="sheet-code">${escapeHTML(code)}</p>
    <label class="lbl" for="nl-client">Client</label>
    <input type="text" id="nl-client" class="field" autocomplete="off" autocapitalize="words"
           value="${escapeHTML(existing ? existing.client : _lastLocationField('client'))}">
    <label class="lbl" for="nl-floor">Floor</label>
    <input type="text" id="nl-floor" class="field" autocomplete="off" autocapitalize="words"
           value="${escapeHTML(existing ? existing.floor : _lastLocationField('floor'))}">
    <label class="lbl" for="nl-room">Room</label>
    <input type="text" id="nl-room" class="field" autocomplete="off" autocapitalize="words"
           value="${escapeHTML(existing ? existing.room : '')}">
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="nl-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="nl-ok">Save location</button>
    </div>`;

  sheet.querySelector('#nl-cancel').onclick = () => { closeSheet(); render(); };
  sheet.querySelector('#nl-ok').onclick = () => {
    const fields = {
      client: cleanText(sheet.querySelector('#nl-client').value, 80),
      floor: cleanText(sheet.querySelector('#nl-floor').value, 60),
      room: cleanText(sheet.querySelector('#nl-room').value, 60),
    };
    if (!fields.room) { showToast('Give the room a name'); return; }
    closeSheet();
    addLocationRecord(code, MODE_INITIAL, fields);
    showToast('Location set');
    render();
  };
  setTimeout(() => {
    try { sheet.querySelector('#nl-room').focus(); } catch (e) {}
  }, 60);
}

// Client and floor barely change through a building, so the last ones used are
// offered again. Room never is — that is the one field that is always different
// and a pre-filled room is how the wrong room ends up on twenty items.
function _lastLocationField(field) {
  const locs = state.records.filter(r => r.type === 'location' && isNonEmptyString(r[field]));
  if (!locs.length) return '';
  locs.sort(byNewest);
  return locs[0][field];
}

function openFailSheet(onPick) {
  const sheet = _openSheet('Fail reason');
  sheet.innerHTML = `
    <h3 class="sheet-title">Why did it fail?</h3>
    <div class="reasonlist">
      ${state.failReasons.map(r =>
        `<button type="button" class="reason" data-r="${escapeHTML(r)}">${escapeHTML(r)}</button>`).join('')}
      <button type="button" class="reason is-other" data-r="__other">Other…</button>
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" id="fs-cancel">Cancel</button>
    </div>`;

  sheet.querySelector('#fs-cancel').onclick = () => { closeSheet(); render(); };
  sheet.querySelector('.reasonlist').addEventListener('click', (e) => {
    const btn = e.target.closest('.reason');
    if (!btn) return;
    const r = btn.getAttribute('data-r');
    closeSheet();
    if (r === '__other') {
      openNameSheet({
        title: 'Fail reason',
        placeholder: 'Describe the fault',
        confirmLabel: 'Use this',
        onConfirm: (v) => {
          const t = cleanText(v, 120);
          if (!t) { render(); return; }
          onPick(t);
        },
        onCancel: () => render(),
      });
      return;
    }
    onPick(r);
  });
}

// The correction path. One sheet for both record types.
function openEditSheet(id) {
  const rec = recordById(id);
  if (!rec) return;
  const sheet = _openSheet('Edit record');

  if (rec.type === 'location') {
    sheet.innerHTML = `
      <h3 class="sheet-title">Location</h3>
      <p class="sheet-code">${escapeHTML(rec.code)}</p>
      <label class="lbl" for="ed-client">Client</label>
      <input type="text" id="ed-client" class="field" value="${escapeHTML(rec.client)}" autocapitalize="words">
      <label class="lbl" for="ed-floor">Floor</label>
      <input type="text" id="ed-floor" class="field" value="${escapeHTML(rec.floor)}" autocapitalize="words">
      <label class="lbl" for="ed-room">Room</label>
      <input type="text" id="ed-room" class="field" value="${escapeHTML(rec.room)}" autocapitalize="words">
      <div class="sheet-actions">
        <button type="button" class="btn btn-danger" id="ed-del">Delete</button>
        <button type="button" class="btn btn-ghost" id="ed-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="ed-ok">Save</button>
      </div>`;
    sheet.querySelector('#ed-ok').onclick = () => {
      updateRecordFields(id, {
        client: sheet.querySelector('#ed-client').value,
        floor: sheet.querySelector('#ed-floor').value,
        room: sheet.querySelector('#ed-room').value,
      });
      closeSheet(); showToast('Saved'); render();
    };
  } else {
    sheet.innerHTML = `
      <h3 class="sheet-title">Item</h3>
      <p class="sheet-code">${escapeHTML(rec.code)}</p>
      <label class="lbl" for="ed-desc">Description</label>
      <input type="text" id="ed-desc" class="field" value="${escapeHTML(rec.description)}" autocapitalize="words">
      <label class="lbl">Class</label>
      <div class="classpick" id="ed-class">
        ${CLASS_OPTIONS.map(c => `<button type="button" class="class-opt${rec.cls === c ? ' is-on' : ''}" data-cls="${c}">Class ${c}</button>`).join('')}
      </div>
      <label class="lbl">Result</label>
      <div class="classpick" id="ed-result">
        <button type="button" class="class-opt${rec.result === 'pass' ? ' is-on' : ''}" data-res="pass">PASS</button>
        <button type="button" class="class-opt${rec.result === 'fail' ? ' is-on' : ''}" data-res="fail">FAIL</button>
      </div>
      <label class="lbl" for="ed-reason">Fail reason</label>
      <input type="text" id="ed-reason" class="field" value="${escapeHTML(rec.failReason)}"
             list="ed-reasons" placeholder="Only used on a fail">
      <datalist id="ed-reasons">
        ${state.failReasons.map(r => `<option value="${escapeHTML(r)}"></option>`).join('')}
      </datalist>
      <div class="sheet-actions">
        <button type="button" class="btn btn-danger" id="ed-del">Delete</button>
        <button type="button" class="btn btn-ghost" id="ed-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="ed-ok">Save</button>
      </div>`;

    let cls = rec.cls;
    let res = rec.result;
    sheet.querySelector('#ed-class').addEventListener('click', (e) => {
      const b = e.target.closest('.class-opt'); if (!b) return;
      cls = b.getAttribute('data-cls');
      sheet.querySelectorAll('#ed-class .class-opt').forEach(x => x.classList.toggle('is-on', x === b));
    });
    sheet.querySelector('#ed-result').addEventListener('click', (e) => {
      const b = e.target.closest('.class-opt'); if (!b) return;
      res = b.getAttribute('data-res');
      sheet.querySelectorAll('#ed-result .class-opt').forEach(x => x.classList.toggle('is-on', x === b));
    });
    sheet.querySelector('#ed-ok').onclick = () => {
      updateRecordFields(id, {
        description: titleCaseWords(sheet.querySelector('#ed-desc').value),
        cls: cls,
        result: res,
        failReason: sheet.querySelector('#ed-reason').value,
      });
      closeSheet(); showToast('Saved'); render();
    };
  }

  sheet.querySelector('#ed-cancel').onclick = () => { closeSheet(); render(); };
  sheet.querySelector('#ed-del').onclick = () => {
    closeSheet();
    openConfirmSheet({
      title: 'Delete this record?',
      body: 'It will be removed from the log and from any future export.',
      confirmLabel: 'Delete', danger: true,
      onConfirm: () => { deleteRecord(id); showToast('Deleted'); render(); },
      onCancel: () => render(),
    });
  };
}
