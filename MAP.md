# PATGo Scan — Code Map (V12)

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

8. **`backupVersion` is 3** — 1 → 2 in V6 (the class value), 2 → 3 in V7 (the
   sessions shape). Additive fields ride through and do not spend a bump; bump
   only for a genuinely incompatible change of shape. ⚠ This entry said "1"
   through V6 and V7 and was two releases out of date when V8 found it, which is
   the exact failure this file exists to prevent — a stale routing note sends
   somebody to the wrong conclusion faster than no note at all.

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
    ⚠ V4 — THE MOVE WRITES BOTH OR NEITHER. `updateRecordFields()` resolves the
    id to a real location record and copies its code across; an id it cannot
    resolve is ignored outright rather than written with the code cleared, or a
    dangling pointer would throw away the barcode the item was scanned under.
    An id-only move is invisible on screen and wrong in the export. Mutation M79.
    ⚠ They degrade separately: deleting a location clears the id off its items
    (rule 5) but never the code. Anything displaying a location must fall back
    to the code — `itemLocationLabel()` / `itemLocationShort()` (log.js).

13. **⚠ SHEET GEOMETRY IS SET IN JS, NOT CSS (V3).** `inset: 0` in the
    stylesheet is the fallback; `feedback.js` overwrites top/left/width/height
    from `window.visualViewport` on open and on every viewport change, because
    iOS never shrinks the layout viewport for the keyboard. Anything that
    focuses a field inside a sheet goes through `focusSheetField()`. Editing
    `.sheet-backdrop` or `.bulk-sheet` in CSS alone will not do what it looks
    like it does. Harness 10k–10p, mutations M71–M77.

14. **⚠⚠ V11 — THE APP INVENTS AN ASSET ID IN EXACTLY ONE PLACE, AND IT IS
    `runCodesFrom()` IN utils.js.** Everywhere else, every code on file came off
    a label — that was true of the whole app until V11 and it is still true of
    everything except items 2..N of a batch initial. Three rules hold the line
    and all three are asserted (16a–16j, mutations M177–M183):
    the counting is **pure** and lives in utils.js with no state near it; the
    engineer is shown the **exact range** before anything is written; and a run
    that meets an id already on file is **refused whole, never skipped past**.
    ⚠ Skipping a taken id and carrying on to make N new ones is the tempting
    version and it is the wrong one — it moves the end of the range, so the last
    id in the run is one nobody held a label against.

15. **⚠⚠ V12 — THE LOG IS THE CURRENT SESSION AND NOTHING ELSE (5B).**
    `renderLogListHTML()` filters on `inCurrentSession`. The list, the totals
    strip and the Log tab badge now all count the same work — before V12 they
    counted three different things on one screen. ⚠ The consequence, stated
    plainly because it is the cost of the decision: **another session's records
    cannot be reached by tapping.** The route is Sessions → *Work in this*
    (Reopen first if closed) → correct it → switch back, and the empty/no-match
    copy says so on screen (8A).
    ⚠ **V10 IS DELIBERATELY LEFT WHOLE AND UNREACHABLE-BY-TAP.**
    `openEditSheet()`'s out-of-session branch and `locationChoices(max,
    sessionId)` still run and are still correct; nothing can currently open a
    sheet on an out-of-session record. Do **not** tidy them away — a hard-scoped
    log makes a "view a past session" screen *more* likely to be wanted, and
    that branch is what stops the picker offering today's rooms for last week's
    item. Harness 17d guards the behaviour so removal is a decision, not a
    mutation quietly reporting SKIPPED.

16. **⚠ V12 — THERE ARE TWO UNEXPORTED COUNTS AND MERGING THEM IS A BUG.**
    `unexportedCount()` is the **current session** — the Log tab badge, the
    export nudge, the Settings row: everything meaning *what will exporting
    send*, and export has been session-scoped since V7.
    `unexportedCountAllSessions()` is the **whole phone** — the clear guard
    (clearing destroys every session) and the diagnostics dump, and nothing
    else. ⚠ They agree on a handset holding one session, which is most handsets
    most days, so a merge looks correct until the day two engineers' work is on
    one phone. `phoneTotals()` is the same global pass and exists partly so the
    clear guard's number is visible somewhere (Sessions screen, 12A/13A) —
    being refused by a number that appears on no screen is being refused by
    nothing you can act on. Harness 14c5, mutations M196/M201.

17. **⚠ V12 — `byNewest()` TIEBREAKS ON THE CODE, NUMERICALLY, BEFORE THE ID.**
    A run is written in one synchronous loop, so its records usually share a
    millisecond and the tiebreak decides their order; the old id fallback is six
    random base-36 characters, so a run came back shuffled afresh on every
    commit. The compare is numeric via `splitTrailingNumber()` because a run
    that grows its padding (`PAT-998` ×5) mixes code widths and a string compare
    puts `999` above `1002`. ⚠ **The export never used this and must not start
    to** — `recordsForExport()` sorts ascending by `ts` and relies on sort
    stability. Two comparators, two jobs. Harness 17s–17u, mutations M197/M198.

18. **⚠ V12 — `state.lastRun` IS THE ONE TRANSIENT BESIDES `pending` THAT
    SURVIVES `setView()`,** and `state.logSelect` is not. Getting either
    backwards is silent: select mode carried across leaves a log where tapping a
    row opens nothing, and a receipt cleared on navigation takes the batch undo
    away on the exact trip that finds the mistake (commit the run, check the
    log, come back). This is a deliberate exception to rule 4. Harness 17p,
    mutations M193/M194.

19. **Two independent scanner ceilings, not one.** The gap preset judges a
    burst; `scanEndMs()` decides where one burst ends and the next begins. The
    second must always exceed the first, which is why it is derived from it and
    not a constant. Raising a preset alone re-caps at the boundary.

---

## Load order (index.html) — 14 first-party files

`config` → `state` → `utils` → `storage` → `log` → `feedback` → `scanner`
→ `csv` → `backup` → `sessions` → `bugreport` → `render` → `dispatch` → `boot`

`sw.js` ASSETS lists 20 entries: these 14 plus `./`, `index.html`, `styles.css`,
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
⚠ **V10: `stubs.js` `querySelector('#id')` RETURNS null** when the node's
innerHTML has been set and does not contain that id — the browser's behaviour.
It used to manufacture the element for any selector, which meant a missing
conditional button could never crash the suite the way it crashes a phone.
M174 survived its first run because of it. Everything else stays permissive.
⚠ V3: `stubs.js` `appendChild`/`removeChild` register by `id`, so
`getElementById` sees nodes the app appended. Before that, `sheetIsOpen()` read
false with a sheet open, `_closeSheet()` removed nothing, and the sheet tests
passed only because `openSheetEl()` reads the last child of body. Mutation M78.
⚠ **V11: `F.resetApp()` ALSO CLEARS THE TOAST.** `showToast()` appends its node
to `<body>` ONCE and reuses it forever, so a message survives every reset and
every render — a group asserting something stayed SILENT reads the previous
group's toast and fails, pointing at working code in a group that never called
showToast. Found by exactly that: 16g went red because 16f had just written a
run receipt. Third member of the same family as the two below.
⚠ `F.resetApp()` closes any open sheet and clears `doc.activeElement` FIRST.
Both block the scanner (`_scanTarget()` bails on `sheetIsOpen()`, and on focus
sitting in a detached node with the same id), so a group that leaks either makes
a LATER group's burst fail for a reason nowhere near itself. Added V2 after
exactly that.

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

**⚠ V5: `CSV_COLUMNS` IS THE WHOLE SPEC, NOT A LIST OF NAMES.** Each entry is
`{ key, cell }` — the header text plus how that column's value comes off one
record. csv.js walks it and knows nothing about what is in it, so **reordering
the client's file is cut-and-paste of whole lines here and nothing else**, and
renaming a column is one string. This is the one constant expected to be edited
by hand between releases; boot.js checks its shape (`_csvColumnsWellFormed()`)
because a dropped comma would not stop the app booting, it would stop the export
at the end of a day's work. A cell function must never throw — csv.js catches,
but a caught cell is an empty cell in the client's file.

**⚠ V6: A CELL TAKES `(record, ctx)`.** Two columns — FLOOR and ROOM — cannot be
written from the row's own record; they need the location and a
first-of-its-location-IN-THIS-FILE flag. Everything else ignores the second
argument. **Every cell must tolerate `ctx` being absent.** Helpers `csvOutcome()`
and `csvLocationDescriptor()` live beside `CSV_COLUMNS` on purpose.

**⚠ V6: `CLASS_OPTIONS` IS `['1','2']` AND THAT IS THE STORED FORM.** Not a
mapping applied on the way out (decision 1B). Records written before V6 hold
`I`/`II` and are migrated by `normaliseRecordClass()` in storage.js — reverting
these strings without reverting that migration blanks the class on every
existing record. A third entry puts three segments in a control sized for two.
`CLASS_NO_EARTH_BOND` is named rather than written as a bare `'2'` because it is
a fact about appliances, not a coincidence of the option list.
`VISUAL_KEY` is DEFAULT OFF and must stay so: absent means "tested".

**⚠ V6: THE READINGS (`EARTH_BOND_DEFAULT`, `INSULATION_DEFAULT`) ARE SEEDS.**
The live values are in `state` and editable in Settings; the figure is COPIED
onto each record as it is logged, so changing the setting never rewrites past
work (decision 4B).

**⚠ V11: `RUN_MAX` IS A SAFETY LIMIT, NOT A UI ONE.** It caps a batch initial.
Every id in a run after the first is invented, so a mis-typed count is the only
thing in this app that can put dozens of unseen rows into the client's system on
one tap. The range preview on the New item sheet is the other half of it: the
ceiling stops the absurd, the preview stops the plausible-but-wrong.

### state.js (~130 ln) — the global `state` object
The single `let state = {…}`. Persisted fields, transients, derived.
**Touch to:** add a runtime field.
**⚠ V5/V6: `visualMode`, `itemClass`, `earthBondValue` and `insulationValue` sit
with `mode`, not with Preferences.**
They decide what is written into the client's file, not how the app feels, and
they are sticky across restarts (decision 7A). ⚠ Anything the app persists
deliberately must also be reset in `harness/fixture.js resetApp()` or the first
test to flip it sets it for every test after it.
⚠ **V11 — `pending` MAY HOLD A RUN, AND `count` IS THE WHOLE OF WHAT MAKES IT
ONE.** There is no second flag and no stored list of the other codes: they are
derived from the code and the count by `runCodesFrom()` wherever they are
needed, so there is nothing that can fall out of step with the first id and no
way to be half in a run. 1 or absent for every ordinary scan.
**Coupling:** a new transient must also be cleared in `setView()` (render.js) —
rule 4. ⚠ **V9 — `moveArmed` holds an ITEM ID, not a flag.** A boolean would need
a second field naming the item, and two fields that must agree can be half-set.
It is cleared by `setView()` like every other transient, which is why
`armMove()` navigates *before* it arms — see dispatch.js.

### utils.js (~110 ln) — pure helpers, no state access
Escaping, ids, local timestamps, title-casing, CSV cell quoting, sorting.
**Touch to:** add a stateless helper.
⚠ **V11 — `splitTrailingNumber()` / `runCodesFrom()` / `runRangeLabel()` ARE
THE ONLY PLACE AN ASSET ID IS INVENTED (rule 14).** They are here rather than in
log.js so that what an id becomes can be reasoned about and broken on its own,
with no records, no session and no state anywhere near it. Three traps, each
with its own mutation: the prefix split is LAZY (greedy turns `PAT-0998` into
`PAT-09910`, M177); the padding is restored while it fits and allowed to GROW
when it cannot (M178); and a tail longer than 15 digits is REFUSED rather than
counted, because past the safe integer range parseInt returns a number close to
the label instead of equal to it — first id right, tenth quietly wrong (M179).
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

### log.js (~400 ln) — THE RECORD MODEL
Two record types, the sticky location, duplicate lookup, add/replace/update/
delete, learned descriptions, quick-pick presets, today's counts, the
item-location labels, and (V4) `locationChoices()` for the move picker.
**Touch to:** anything about what a record IS or how one changes.
**Coupling:** rules 5, 11, 12. ⚠ An audit re-scan of a known location REUSES it
rather than duplicating; an initial over a known location FILLS IT IN. Both are
deliberate — the client's export must not carry two rows for one kitchen.
⚠ **V10 — `locationChoices(max, sessionId)` TAKES THE SESSION IT IS ASKED FOR,
defaulting to the current one.** Hard-wiring it to the current session was only
ever right by accident: the log lists EVERY session, so the picker opens on
items from other batches, and offering today's rooms for one of them files it
under a location its own export does not contain. Same hole V9 closed from the
scanning side. Callers pass the RECORD's `sessionId`. Harness 11ab–11ag,
mutations M169/M170/M172.
⚠ **V11 — `addItemRun()` GOES THROUGH `addItemRecord()` FOR EVERY ITEM.** A
second record builder here would be a second home for the class rules, the
reading rules, the visual rule, the session stamp and the key order, and the
first release to change one of them would change it in one place only. The cost
is one save per item and it is the right price. It refuses the WHOLE run on a
clash (`firstClashInRun()`, rule 14) and copies the pending item per id rather
than mutating it — handing the same object round the loop leaves the caller's
pending item holding the LAST id in the run. Harness 16f–16j, mutations
M180/M181.
⚠ `replaceItemRecord()` keeps the original id and ts: a correction is one event,
not a second one. ⚠ V4 — A MOVE DOES NOT RE-STAMP EITHER, for the same reason.
The moved row therefore keeps its place in the timestamp-ordered export and can
sit ABOVE its new location's row; the `location_id` column is what resolves it,
and the client's importer reads columns, not reading order. Harness 11d.
⚠ V4 — `locationLineFor(locId, fallbackCode)` labels a location from an id that
is not on any record yet, which is what lets the edit sheet show a location you
have PICKED but not saved. `itemLocationLabel()` delegates to it; mutation M64
guards the swept-item fallback that used to live inside it.
⚠ QUICK-PICK PRESETS ARE CURATED AND THE LEARNED DESCRIPTIONS ARE NOT. Nothing
on the scan path writes to a preset. Fusing the two is what made a removed item
reappear and the grid reshuffle (V1, fixed V1.1). Harness 09a/09b, mutation M51.

### feedback.js (~330 ln) — toast, dialogs, sheet geometry, haptic / flash / sound
`showToast`, `_openSheet` and the three shared dialogs, the feedback channels,
and (V3) the visual-viewport sheet positioning plus `focusSheetField()`.
(V4) `_syncSheetViewport()` also flags `.is-keyboard` on the backdrop when the
visual viewport is >120px shorter than the layout one — the only signal iOS
gives that the keyboard is up — which drops the safe-area padding that has no
home indicator to clear. Mutations M90/M91.
**Touch to:** change feedback, toasts, the shared dialogs, or how any sheet sits
on the screen.
**Coupling:** rule 9 — every yes/no in the app routes here. Rule 13 — the sheet
geometry and the focus path both live here and are used by render.js's four
sheets. No state, no re-render, which is what makes these safe to call from an
error handler. ⚠ iOS gives a PWA no programmatic haptics; that is permanent and
not a bug to fix.

### scanner.js (~490 ln) — HID barcode scanner
Carried across from PATGo v67. Burst detection, the diagnostic log, paired-mode
focus. Burst state is module-level `let`, never `state` — it is the last ~100ms
of keyboard.
**Touch to:** change scan detection, timing, or where scans are accepted.
**⚠ TIMING IS TWO NUMBERS (rule 14).** `scanMaxGapMs()` is the preset;
`scanEndMs()` is the burst boundary, DERIVED as limit + pad. Never reintroduce a
flat end-of-burst constant — that was the V1 bug that made the presets
un-raisable. Harness 05r–05w, mutations M61–M63.
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
⚠ **V9 — THE LOG TARGET HAS TWO KINDS.** `#log-search` delivers as `search`
normally and as `move` while `state.moveArmed` is set; the element is the same
either way so the focus rule cannot behave differently between them. Which one
applies is a routing question and lives here; what a destination barcode MEANS
is still `routeScan()`'s. Harness 11r–11aa, mutations M160–M167.
Bound once from boot.js (rule 6). `focusScanInput()` is called from `render()`.

### csv.js (~150 ln) — THE CLIENT DELIVERABLE
Row building, export, share/download, clipboard copy, export flagging.
**Touch to:** change the CSV or how it is delivered.
**⚠ Column order is the client's spec (config.js), not ours.**
**⚠ V6: ONE ROW PER ITEM — LOCATIONS EMIT NOTHING** (decision 8A). Their floor
and room ride on the first item row beneath them. `buildCSV()` returns TWO
different lists: `rows` (items only) and `records` (items *and* the locations in
the batch, so those get marked exported and stop accumulating). `count` is rows.

**⚠ V6: "FIRST OF ITS LOCATION" MEANS FIRST IN THIS FILE.** The `Set` is rebuilt
on every export, deliberately. Do not park it on the location record — export
sends unexported records only, so a location initialised Monday and added to
Tuesday would leave Tuesday's file with no location detail anywhere in it.
Mutation M119 breaks it in exactly that direction; test 13f is the only group
that can see the difference.

**⚠ V5: THIS FILE NO LONGER KNOWS WHAT THE COLUMNS ARE.** `csvRowsForRecords()`
walks `CSV_COLUMNS` and builds the header and the body from the same list, so
the two cannot disagree about order. Do not reintroduce a column name here — if
a row needs a value this file would have to reach for, the answer is a new entry
in `CSV_COLUMNS`, not a special case in the builder. `csvColumnKeys()` is the
one accessor; the harness uses it so a reorder does not turn the suite red.
**⚠ Export flags, it does not delete** — decision 8A. ⚠ The share must be called
directly from the tap: iOS revokes the user gesture across an await.
**Coupling:** `recordsForExport()` sorts by scan order deliberately — with no
location rows it is what decides WHICH item row carries a location's floor and
room. ⚠ V7: it is scoped to the CURRENT SESSION and returns the whole of it —
`buildCSV()` takes no argument, so no caller can ask for a delta (decision 3B).

### backup.js (~190 ln) — backup / restore / clear
`buildBackup`, restore, the file-kind guard, the clear path.
**Touch to:** change the JSON shape or the restore path.
**Coupling:** restores through the SAME validators as `load()` (rule 8). ⚠
Restore REPLACES, it does not merge — merging is what `sessions.js` is for, and
a session file handed to this path is refused by name. ⚠ V7: the file carries
`sessions`, and the restore path runs `adoptOrphanRecords()` so a V6 backup
restored in 2028 does not arrive as a pile of orphans. ⚠ A boolean restores only when the backup
actually holds one; absence ≠ off. Clearing refuses while anything is unexported.

### sessions.js (~600 ln, V7) — sessions, exchange, merge, review
The spine (create / switch / close / reopen / the open invariant), the session
file exchange, the merge, and the duplicate review.
**Touch to:** change what a session is, how one travels between phones, or how a
duplicate is resolved.
**Coupling:** ⚠ `ensureOpenSession()` holds the invariant that there is always
exactly ONE open session and it is current — every write path depends on it, so
nothing else has to cope with "there is nowhere to put this scan".
`inCurrentSession()` is the single definition of "my current work" and the whole
of `log.js` scopes itself with it. ⚠ Import and merge resolve through ONE
function (`_applyChoice`) — they are the same operation with different labels.
⚠ A session file MERGES; a backup REPLACES. Each import path refuses the other
by name. ⚠ The CSV cannot be read back and this is not fixable by trying harder:
it carries no record id, no time of day, no `mode` column and no `visual`
column, so an initial visual-only fail and an audit full-test fail come out of
it byte for byte identical. JSON is the only lossless path.
**Note:** `adoptOrphanRecords()` lives in `storage.js`, not here — it is a
load-time data migration and sits with the V6 class migration.

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

### render.js (~1600 ln) — every screen, every sheet

⚠ **V11 — THE RUN CONTROL IS ON THE NEW ITEM SHEET AND NOWHERE ELSE (1A), and
that is a height decision as much as a design one.** V8 spent a release buying
~150px back on the scan screen and 15e ratchets every value it bought; the sheet
costs that screen nothing, reuses the description and quick-pick machinery, and
guarantees the FIRST id of every run came off a real label, because the sheet
cannot be reached without scanning one. It is NOT offered on a re-scan
(`state._pendingReplaceId`) nor on a code with no trailing digits — M183.
⚠ **`.run-note` IS nowrap + ellipsis AND THAT IS THIS SHEET'S OLDEST RULE, NOT
A STYLE CHOICE.** Nothing in this sheet may change the height of anything else
in it while it is being used (V1.1). The note's text grows with the count —
"10 items: PAT-0998 to PAT-1007" wraps on a phone at a count reached by tapping,
which pushes Cancel and Continue down under a thumb already travelling.
⚠ **THE PENDING PANEL GAINS NO LINE FOR A RUN.** It is the screen V8 measured as
still overflowing by ~163px (2A), so the run says itself in the three elements
already there: the code line becomes the range, the description line gains the
count, and the buttons say how many they write. Harness 16o/16p, M186.
⚠ **V11 — THE LOG'S MODE BADGE IS THE ONE EXEMPTION TO "ONLY THE NON-DEFAULT
STATE IS PRINTED" (7A), and the exemption is about SHAPE.** That rule is about
the meta line, where every word pushes the description and the room off the end.
A badge sits in its own column and costs the line nothing, so both labels are
affordable — and one label alone is the rule, not the decision (M187). It reads
`r.mode`, never `state.mode`: rule 11, and the log is the screen an engineer
checks BECAUSE they think they were in the wrong mode (M188).

⚠ **V9 — THE EDIT SHEET SAVES BEFORE IT ARMS A MOVE (3A), and that is not
optional politeness.** Arming closes the sheet and closing the sheet destroys
the draft — the exact loss V4 and V5 kept extending `snapshot()` to prevent.
There is no coming home from a move, because the engineer walks to another room,
so `saveAll()` is extracted and both `#ed-ok` and `#ed-locscan` go through it.
The button says "Save & scan" so the save is stated rather than hidden.
⚠ `renderMoveBar()` clears the arm if the record it names has gone; a banner
naming a deleted item invites a walk to a room to scan a label for nothing.

⚠ **V8 — THREE SCAN-SCREEN BLOCKS ARE COUPLED TO `styles.css` AND USELESS ALONE.**
`renderLastItem()` puts `.lastitem-acts` INSIDE `.lastitem-main` because the rule
that pushes Edit/Undo right is `margin-left: auto`, which does nothing outside
that flex row. The prompt's sub-line is emitted in Initial only (3C). The
location bar collapses to one row via `.locbar.is-set` alone, never `.locbar`.
Change either half without the other and the markup still renders, still passes
a behaviour test, and is silently a line taller on the phone. Harness 15b–15d
assert markup and stylesheet together; mutations M156–M158.
`setView`, `render()` and its dispatcher, the scan screen, log, settings pages,
about, welcome, and the five sheets (new item, new location, fail reason, edit,
and V4's location picker).
**Touch to:** change any screen or sheet.
**Coupling:** rules 2, 3, 4 all bite here. ⚠ Markup carries `data-action` and
nothing here attaches an `onclick` — a listener bound to a node innerHTML is
about to replace is a leak and a dead button. The SHEETS are the deliberate
exception: they live outside `#app`, so their handlers are safe and bound
directly. ⚠ Suggestions commit on `pointerdown`, not `click` — a click races the
blur teardown and iOS loses the tap. ⚠ The suggestion dropdown is an OVERLAY
(`.desc-wrap` + absolute `.suggest`) and the quick-pick grid is STATIC — nothing
in an open sheet may change the height of anything else in it. Harness 09h–09j,
mutations M56/M57. ⚠ V4 PUT BOTH ON THE EDIT SHEET AS WELL (`#ed-quick`,
`#ed-suggest`), so the two rules now have two homes each and the `pointerdown`
one is asserted separately for each. Mutations M88/M89. ⚠ `openEditSheet(id, draft)` — the second argument is how
unsaved edits survive the trip to the fail-reason picker, which destroys the
sheet. ⚠ V4 — THE DRAFT NOW CARRIES `locationId` TOO, because the edit sheet has
a SECOND round trip (the location picker) and the two compose: pick a location,
then tap FAIL, and the draft goes out through another sheet still holding both.
Either round trip dropping what the other put in saves the item in the location
it started in with nobody the wiser. Harness 11f/11h, mutations M81/M83.
⚠ `openLocationPickerSheet(currentId, onPick, onCancel, sessionId)` can only ever
offer locations that EXIST — that is the answer to "what about a location not yet
scanned", not an incidental limit, and it is why the export can never carry an
item pointing at a location row that is not in the file.
⚠ **V10 — THE FOURTH ARGUMENT IS NOT OPTIONAL AT THE CALL SITE.** It is the
record's own session, and without it the sheet offers the wrong batch's rooms.
The edit sheet also DROPS "Save & scan" for an out-of-session item (2A) — the
wiring for it is therefore guarded, because an unguarded `querySelector(...)
.onclick` on a button that was not rendered throws inside the builder and leaves
a half-wired sheet with no Save and no Cancel. Mutations M171/M173/M174. No scanning from inside it: the scanner refuses to collect
while a sheet is open (rule 3's neighbour, M24/M78), so scan-to-move needs a new
armed mode in the dispatch grammar and is backlogged, not smuggled in. `openFailSheet(onPick, onCancel)` — a caller with its own form MUST pass
`onCancel` or backing out loses that form. ⚠ No sheet here may call `.focus()`
directly — `focusSheetField()` (feedback.js) is the only path, rule 13. Harness
10o asserts render.js contains no bare focus call at all.

### dispatch.js (~420 ln) — the scan grammar and delegated events
`routeScan()` — what a barcode MEANS — plus the three registries (`ACTIONS`,
`INPUT_ACTIONS`, `CHANGE_ACTIONS`) attached once to `#app` at boot.
**Touch to:** change the scan grammar or add a delegated handler.
**Coupling:** ⚠ A location is REQUIRED before an asset scan — an item with no
location is a row the client cannot place. ⚠ **V9 — THE GRAMMAR NOW HAS THREE
MEANINGS, and the move branch is FIRST and ONE-SHOT.** The arm is cleared before
anything can fail, so every path out — moved, refused, wrong session, unknown
code — leaves the app disarmed; an arm that outlived its own error case would
take the next barcode too. ⚠ `armMove()` calls `setView('log')` BEFORE setting
`state.moveArmed`, because `setView()` clears every transient: the obvious order
disarms silently and nothing on screen says why. ⚠ **V11 — PASS COMMITS A RUN ON ONE TAP AND FAIL DOES NOT (decision 5), AND THE
ASYMMETRY IS THE SAFETY FEATURE.** Same shape as the Visual toggle colouring in
while Test stays quiet: the costly outcome is the one said twice. PASS already
reads "PASS ALL 10" before the thumb lands and a wrong pass is corrected in the
log; a wrong fail is ten rows carrying a fail reason into the client's system,
and the reason is the part acted on at their end. Do not "tidy" this by
confirming both — a confirmation on the outcome that happens all day stops being
read and takes the weight out of this one. M184. ⚠ A REFUSED RUN LEAVES THE
PENDING ITEM WHERE IT IS; every other path through `commitResult()` clears, so
that branch needs its own assertion (M185). ⚠ A throw inside any action is caught
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

- `styles.css` (~14KB) — section index at the top; `grep -n '@@' styles.css`.
  Colour lives entirely in the `@@ tokens` block; V1's amber palette is kept
  there in a comment as the one-edit route back. ⚠ `--mode-tint` is NOT
  `--accent-soft` — collapsing them tints both modes alike and destroys the
  mode signal. `.main--nonav` opts a nav-less screen out of the nav gutter.
  ⚠ No `100dvh + overflow:hidden` layout — it traps content behind the keyboard.

  ⚠ **V8 — `env(safe-area-inset-bottom)` IS APPLIED ONCE, AND ONLY BY THE THING
  AT THE BOTTOM EDGE.** Five selectors carry it and no others: `.nav`, `.main`,
  `.main--nonav`, `.bulk-sheet`, `.update-banner`. It was on `body` as well
  until V8, so with `.screen { min-height: 100vh }` every page in the app was
  ~34px taller than the phone and permanently scrollable. Anything BEHIND the
  bottom edge — `body`, `.screen`, any future wrapper — can only ever double up.
  Harness 15a asserts the allow-list; mutation M155 moves it to `.screen` to
  prove the assertion catches the whole class and not just the one selector.

  ⚠ **V8 — THE SCAN SCREEN HAS A HEIGHT BUDGET AND IT IS ASSERTED.** Harness 15e
  holds a ceiling on each of the nine declared values V8 shrank. Raising one is a
  deliberate act: raise the ceiling too and say why in the handoff. A ceiling
  edited quietly to match a new value is the same as not having one.

  ⚠ **V11 — `.row-mode` IS ABSOLUTELY POSITIONED AND `.row-item` CARRIES THE
  GUTTER IT SITS IN.** Ship one without the other and a long asset code runs
  underneath the badge: it renders, it passes every behaviour assertion, and it
  is unreadable on the phone. Same coupling class as the V8 scan-screen blocks.
  Harness 16t, mutation M189. ⚠ The Initial badge is `--mode-tint`, NOT
  `--accent-soft` — see the token note above; green means Initial on the scan
  screen and in the log by construction, and a second colour for Audit would put
  two things shouting on one row.
  ⚠ `.sheet-backdrop` / `.bulk-sheet` sizing is JS-driven — rule 13. The values
  here are the keyboard-down fallback, not the working geometry.
- `index.html` — the `<script>` chain. Small enough to read whole.
- `sw.js` — `CACHE_VERSION` + `ASSETS`. Read whole.
