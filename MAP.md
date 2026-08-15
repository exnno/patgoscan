# PATGo Scan — Code Map (V1.1)

Routing only: which concern lives in which file, and the cross-file couplings
you cannot discover by reading one file. Read this to decide *what to open*.
(c) 2026 Peter Birchley. All rights reserved.

> This file does NOT list functions — use `grep -n "^function \|^const " file.js`,
> which is live, accurate and cheap. It does NOT explain design decisions either;
> durable reasoning lives in comments beside the code it describes, and release
> history lives in `PATGOSCAN_handoff_vNN.md`. This file answers one question:
> *where does this live?*

---

## Cross-cutting rules — read before editing anything

1. **Duplicate top-level `const` across two loaded files = fatal `SyntaxError`**
   that kills the whole file. All files share one global scope. Duplicate
   top-level `function` declarations are legal and silent — last loaded wins.
   The boot integrity guard catches the first class; nothing catches the second.
   Harness 01b asserts it.

2. **`render()` is synchronous and rebuilds `#app.innerHTML` wholesale.** Never
   make it async. Anything it needs must be in `state` before it runs.

3. **The no-render rule.** A sheet CONTAINING INPUTS must not call `render()`
   while open — a rebuild tears down the focused field and drops the keyboard.
   This is why every sheet builds its own DOM into `<body>` and is not part of
   `render()`'s output at all.

4. **Every transient is cleared in `setView()`.** A sheet flag that survives
   navigation reopens a sheet on a screen that knows nothing about it.

5. **Sweep before you remove.** Deleting a location clears the dangling
   `locationId` on its items *before* the filter, or they are orphaned.

6. **Optional subsystems fail soft.** `scanner.js` and `bugreport.js` are
   typeof-guarded and try/catch-wrapped at their boot call sites.

7. **Flag polarity.** Default-ON flags read `!== '0'`; default-OFF read `=== '1'`.
   `scan:scanner` and `scan:haptic` are the only default-ON flags. ⚠
   `SCANNER_PAIRED_KEY` sits on the next line from `SCANNER_KEY` in config.js and
   is ordinary opt-in. Harness-asserted both ways.

8. **`backupVersion` is 1.** Additive fields ride through and do not spend a
   bump. Bump only for a genuinely incompatible change of shape.

9. **`prompt()` / `confirm()` / `alert()` are banned** — iOS can suppress them
   silently inside a PWA. Use the `.bulk-sheet` dialogs in feedback.js.

10. **iOS keyframes.** CSS-variable `@keyframes` on freshly inserted
    `position:fixed` nodes silently fail — use literal values, inline styles,
    forced reflow, next-frame RAF. See `flashScreen()`.

11. **Mode is frozen onto the record at scan time**, never re-derived from
    `state.mode` at save. Otherwise flipping the toggle retro-relabels the
    morning's work.

12. **Items carry both `locationId` and `locationCode`.** The id finds the
    record; the code is what the client reads and must not change under them.

---

## Load order (index.html) — 13 first-party files

`config` → `state` → `utils` → `storage` → `log` → `feedback` → `scanner`
→ `csv` → `backup` → `bugreport` → `render` → `dispatch` → `boot`

`sw.js` ASSETS lists 19 entries: these 13 plus `./`, `index.html`, `styles.css`,
`manifest.webmanifest` and the two icons. No vendored libraries — there is no
PDF engine in this app.

`boot.js` runs on load and must be last. Every other position is a readability
choice: cross-file calls resolve at call time, which is why `scanner.js` can
call `routeScan()` from `dispatch.js` two files later.

**Adding a file:** update the `index.html` `<script>` chain AND `sw.js` ASSETS,
and upload the new file **before** either of them. Also add one function from it
to `REQUIRED_FNS` in boot.js — without a probe, a file referenced but never
uploaded fails silently until someone taps something. Harness 01c/02a and
mutations M02/M07 hold all three.

---

## Not shipped

### harness/ — the committed test harness
Stub layer, load-order runner, fixtures, standing assertions, mutation runner.
NOT in `index.html`, NOT in `sw.js` ASSETS — test 01e fails if either changes.
**Touch to:** validate a release, or add this release's assertions and mutations.
Never delete from `tests/`. See `harness/README.md`.

---

## Files

### config.js (~160 ln) — constants and defaults, pure data
Every `scan:*` storage key, `APP_VERSION`, `WELCOME_VERSION`, scanner tuning,
`CSV_COLUMNS`, `makeDefaultFailReasons()`, `makeSeedDescriptions()`,
`makeDefaultPresets()`, `QUICK_PICK_MAX`.
**Touch to:** add a storage key, change a default, bump the version, roll a
welcome, change the CSV spec.
**Coupling:** rules 7, 8 and 12 originate here. `CSV_COLUMNS` is the client's
specification — changing it changes what lands in their system.

### state.js (~80 ln) — the global `state` object
The single `let state = {…}`. Persisted fields, transients, derived.
**Touch to:** add a runtime field.
**Coupling:** a new transient must also be cleared in `setView()` (render.js) —
rule 4.

### utils.js (~110 ln) — pure helpers, no state access
Escaping, ids, local timestamps, title-casing, CSV cell quoting, sorting.
**Touch to:** add a stateless helper.
**Coupling:** none by design. ⚠ `csvCell()` quotes EVERY cell — a fail reason is
editable and will eventually contain a comma. ⚠ `stampLocal()` is deliberately
not `toISOString()`; UTC would export an 08:15 scan as 07:15 in British summer.

### storage.js (~270 ln) — persistence boundary
Plain JSON. `load()`, the per-area saves, and the shared validators.
**Touch to:** change how data is stored, loaded or validated.
**⚠ Data-integrity zone — run a backup round-trip after every edit.**
**Coupling:** ⚠ the validators here are shared with backup restore. Never write
a second set — a backup restoring under different rules produces a state the app
has never been tested against. Rules 7 and 8 live here.

### log.js (~380 ln) — THE RECORD MODEL
Two record types, the sticky location, duplicate lookup, add/replace/update/
delete, learned descriptions, quick-pick presets, today's counts.
**Touch to:** anything about what a record IS or how one changes.
**Coupling:** rules 5, 11, 12. ⚠ An audit re-scan of a known location REUSES it
rather than duplicating; an initial over a known location FILLS IT IN. Both are
deliberate — the client's export must not carry two rows for one kitchen.
⚠ `replaceItemRecord()` keeps the original id and ts: a correction is one event,
not a second one.
⚠ QUICK-PICK PRESETS ARE CURATED AND THE LEARNED DESCRIPTIONS ARE NOT. Nothing
on the scan path writes to a preset. Fusing the two is what made a removed item
reappear and the grid reshuffle (V1, fixed V1.1). Harness 09a/09b, mutation M51.

### feedback.js (~230 ln) — toast, dialogs, haptic / flash / sound
`showToast`, `_openSheet` and the three shared dialogs, the feedback channels.
**Touch to:** change feedback, toasts or the shared dialogs.
**Coupling:** rule 9 — every yes/no in the app routes here. No state, no
re-render, which is what makes these safe to call from an error handler. ⚠ iOS
gives a PWA no programmatic haptics; that is permanent and not a bug to fix.

### scanner.js (~430 ln) — HID barcode scanner
Carried across from PATGo v67. Burst detection, the diagnostic log, paired-mode
focus. Burst state is module-level `let`, never `state` — it is the last ~100ms
of keyboard.
**Touch to:** change scan detection, timing, or where scans are accepted.
**⚠ CHARACTER KEYS ARE NEVER `preventDefault`ed — ONLY THE TERMINATOR.** At the
moment a character arrives we don't yet know if the burst is a scan. Characters
land wherever they were going *and* are copied to the buffer; only the terminator
judges, and a confirmed scan overwrites the target field wholesale. This is the
reason normal typing cannot break.
**⚠ OVERWRITE, NEVER APPEND. ⚠ `e.repeat` is excluded** — a held key repeats at
machine speed.
**⚠ TRUE MODIFIERS SKIP, EVERYTHING ELSE RESETS.** Asymmetric on purpose: a
skipped key that did produce a character delivers a plausible SHORT asset number.
**⚠ THE POISON WINDOW (V1, new).** A drop also refuses to collect until the
keyboard falls silent — otherwise the tail of an interrupted burst arrives as its
own short, fast, entirely plausible scan. Harness 05g, mutation M24. **The same
hole is open in PATGo v70.**
**Coupling:** accepts scans in three targets only (`#scan-input`, `#log-search`,
`#scanner-test`) and bails everywhere else, including with any sheet open. Hands
the text to `routeScan()` (dispatch.js) — the GRAMMAR is not this file's job.
Bound once from boot.js (rule 6). `focusScanInput()` is called from `render()`.

### csv.js (~150 ln) — THE CLIENT DELIVERABLE
Row building, export, share/download, clipboard copy, export flagging.
**Touch to:** change the CSV or how it is delivered.
**⚠ Column order is the client's spec (config.js), not ours.**
**⚠ Export flags, it does not delete** — decision 8A. ⚠ The share must be called
directly from the tap: iOS revokes the user gesture across an await.
**Coupling:** `recordsForExport()` sorts by scan order deliberately — a location
row must precede the items under it or the file cannot be read sequentially.

### backup.js (~190 ln) — backup / restore / clear
`buildBackup`, restore, the file-kind guard, the clear path.
**Touch to:** change the JSON shape or the restore path.
**Coupling:** restores through the SAME validators as `load()` (rule 8). ⚠
Restore REPLACES, it does not merge — merging needs conflict rules an engineer
would have to understand mid-job. ⚠ A boolean restores only when the backup
actually holds one; absence ≠ off. Clearing refuses while anything is unexported.

### bugreport.js (~150 ln) — problem reporting
Global error capture, diagnostics, the mailto builder.
**⚠⚠ THE PRIVACY RULE: COUNTS AND FLAGS ONLY.** Never barcodes, client names,
floors, rooms, descriptions or fail reasons. This is emailed, and the asset
register is the client's commercial data. Harness 08n asserts it.
⚠ `_scrubCustomerData()` FAILS CLOSED — an incomplete term list withholds the
message rather than passing it through. Do not add a raw-text fallback.
**Coupling:** `initErrorCapture()` is called once from boot.js (rule 6). Known
limit: boot.js loads last, so a parse-time failure earlier predates these
handlers — the integrity guard covers that case instead.

### render.js (~845 ln) — every screen, every sheet
`setView`, `render()` and its dispatcher, the scan screen, log, settings pages,
about, welcome, and the four sheets (new item, new location, fail reason, edit).
**Touch to:** change any screen or sheet.
**Coupling:** rules 2, 3, 4 all bite here. ⚠ Markup carries `data-action` and
nothing here attaches an `onclick` — a listener bound to a node innerHTML is
about to replace is a leak and a dead button. The SHEETS are the deliberate
exception: they live outside `#app`, so their handlers are safe and bound
directly. ⚠ Suggestions commit on `pointerdown`, not `click` — a click races the
blur teardown and iOS loses the tap. ⚠ The suggestion dropdown is an OVERLAY
(`.desc-wrap` + absolute `.suggest`) and the quick-pick grid is STATIC — nothing
in an open sheet may change the height of anything else in it. Harness 09h–09j,
mutations M56/M57. ⚠ `openEditSheet(id, draft)` — the second argument is how
unsaved edits survive the trip to the fail-reason picker, which destroys the
sheet. `openFailSheet(onPick, onCancel)` — a caller with its own form MUST pass
`onCancel` or backing out loses that form.

### dispatch.js (~420 ln) — the scan grammar and delegated events
`routeScan()` — what a barcode MEANS — plus the three registries (`ACTIONS`,
`INPUT_ACTIONS`, `CHANGE_ACTIONS`) attached once to `#app` at boot.
**Touch to:** change the scan grammar or add a delegated handler.
**Coupling:** ⚠ A location is REQUIRED before an asset scan — an item with no
location is a row the client cannot place. ⚠ A throw inside any action is caught
here and recovered to the scan screen; assert this through
`handleDelegatedClick`, never through `render()`. ⚠ Text-input actions must not
`render()` on a keystroke. ⚠ File inputs must clear `el.value` immediately.

### boot.js (~230 ln) — startup, RUNS ON LOAD, must load LAST
SW registration and update banner, `bootIntegrityOK()`, the boot tail, crash
fallback screens.
**Touch to:** change startup, the update banner or the integrity guard.
**Coupling:** ⚠ `REQUIRED_FNS` is ONE PROBE PER SCRIPT FILE, not a list of
important functions. ⚠ Constants are checked by name, not off `window` — a
top-level `const` never attaches to it. ⚠ `bootIntegrityOK()` CAN THROW (TDZ);
its call site is wrapped and a throw counts as failed. ⚠ The SW registers even
when `load()` threw — that is what keeps a bad release recoverable.
⚠ `_crashReportLink()` deliberately duplicates part of bugreport.js. Don't DRY it.

---

## Not code, but read the same way

- `styles.css` (~13KB) — section index at the top; `grep -n '@@' styles.css`.
  ⚠ No `100dvh + overflow:hidden` layout — it traps content behind the keyboard.
- `index.html` — the `<script>` chain. Small enough to read whole.
- `sw.js` — `CACHE_VERSION` + `ASSETS`. Read whole.
