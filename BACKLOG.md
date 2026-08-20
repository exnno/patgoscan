# PATGo Scan — Backlog

Carried forward each release. Nothing here is committed to; it is the list of
things worth considering when the client's actual working day suggests them.
(c) 2026 Peter Birchley. All rights reserved.

---

## Pending answers from the client

- **Audited locations as their own CSV rows.** Included in V1. Trivial to drop
  if their importer objects to them.

## Under consideration

- **Confirm the final column layout with the client.** ⚠ CARRIED OUT OF V5 AND
  STILL OPEN. V5 shipped `class_1`, `class_2` and `visual` on Peter's reading of
  what they want, with the single `class` column retired. The layout is expected
  to change. It is now a one-place edit — whole lines in `CSV_COLUMNS`
  (config.js) — and the two hedges left open are one line each, written into the
  file: **1B** (id moves out of `asset_id`) is emptying that column's cell, and
  **2C** (visual becomes a flag rather than the id) is returning `'Y'` instead of
  `r.code`. Nothing else in the app needs touching for either.

## Queued from V2

- **A maskable icon variant.** The V2 icon's scan brackets fall outside the
  maskable safe circle, so the manifest declares `purpose: "any"` only. Fine on
  iOS, which is the whole fleet. Only worth doing if Android appears.

## Raised in V4

- **Scan a location barcode to move an item there.** The obvious gesture: stand
  in the room, scan its label, item moves. Ruled out of V4 rather than bodged —
  the scanner refuses to collect while a sheet is open, by construction since V1
  (mutations M24, M78), so this needs a new armed mode in the dispatch grammar
  along the lines of the location bar's. Its own release, and worth doing if the
  picker turns out to be slow on a big site. ⚠ Considered for V5 and dropped —
  V5 changed the client's column layout, and a data-shape release and a new
  armed scanner mode do not belong in the same upload.
- **Naming an audit location retrospectively.** Already possible — tap it in the
  log and fill in Client / Floor / Room — but nothing prompts for it, and the V4
  picker is the first place where an unnamed location visibly costs something.
  If engineers start revisiting sites, a nudge to name a location the second
  time it is scanned might pay for itself. Watch before building.

## Raised in V5 — the sessions group

⚠ **THESE FOUR ARE ONE PIECE OF WORK, NOT FOUR.** Sessions is the spine and the
other three sit on it; building any of them first means building a private
version of sessions inside it and throwing that away later. This is also the
first item on the list that genuinely changes the storage shape — it is the
release where `backupVersion` finally moves off 1, which is reason enough not to
bundle it with anything else.

- **Work saved as sessions**, as PATGo does it. One continuous log per phone is
  what V1 chose and it has held, but everything below needs a boundary to point
  at.
- **A sessions screen.** List, switch, name, close.
- **Combine sessions and files from other engineers, flagging duplicates for
  review.** The merge helper, in its answered form. Needs CSV reading.
- **Duplicate item warnings.** ⚠ SCOPED CAREFULLY: the within-phone case ALREADY
  EXISTS and has since V1 — re-scan an asset already logged and the confirm
  sheet offers Replace or Skip it, caught at scan time while the engineer is
  still stood at the appliance. What is missing is the CROSS-SESSION and
  CROSS-ENGINEER case, which is the merge problem wearing a different hat. Do
  not rebuild the local warning.

## Raised in V5 — small and independent

Both are cheap, neither depends on sessions, and either could ride along with a
small release or be a V5.1 on its own.

- **A quick view of the last item on the entry screen**, with delete, undo and
  edit buttons. ⚠ Worth deciding first whether this replaces the "Discard this
  scan" button or sits alongside it — two ways to unsay the last thing you did,
  a thumb's width apart, on the screen where FAIL also lives.
- **Totals on the log view.** The scan screen already carries today's pass /
  fail / location counts; this is the same idea over the whole log rather than
  the day, and it should say which it is counting or it will be read as the
  other one.

## Worth building if the job grows

- **Merge helper.** ⚠ ITS OPEN QUESTION IS ANSWERED — see "Sessions" below,
  which supersedes it. V4 asked whether this belonged in this app or in a
  separate one-page tool; V5's scoping settled it as a screen here, driven by
  sessions. What has NOT changed is that it needs the app to READ a CSV, which
  nothing here has ever done, and that remains the single largest new capability
  on the list.
- **Setup bundle export/import.** PATGo has `setup.js`: a shareable config file
  covering lists and preferences. Worth porting when there are enough phones
  that setting each one by hand is a risk of inconsistency.
- **Session/day boundaries.** V1 keeps one continuous log per phone, exported
  daily. If engineers start covering several buildings in a day, named batches
  would make the merge easier to reason about.
- **Photo evidence on a fail.** Deliberately left out of V1 — it is the single
  heaviest subsystem in PATGo and the client has not asked for it. Revisit only
  if a dispute over a failed item actually happens.

## Owed to PATGo

- **⚠ Port the poison-window scanner fix back.** V1 found and fixed a real bug:
  when a burst is dropped because an unreadable key arrived part-way through,
  the remaining characters used to form a fresh, short, plausible-looking scan.
  PATGo v70 still has this. It is a hotfix there, not a feature. Mutation M24
  here is the test that exposes it.

## Explicitly not doing

- **Auto-detect location vs asset barcodes.** Dropped V3, and not for want of
  the client's labelling convention — some barcode types are shared between
  locations and asset ids on the same site, so the two are not distinguishable
  by looking at the code at all. The armed location bar stays. Do not re-propose
  this.
- **Class III / lead as class options.** Dropped V3. See the Visual button
  above, which is the shape of what is actually wanted.
- **Merging PATGo Scan back into PATGo.** Two codebases by design. Anything
  worth having in both is rebuilt by hand from a spec.
- **A local asset register.** The client's software owns the register. This app
  records what the engineer did and nothing more; adding a register here would
  create a second source of truth that has to be reconciled.
- **Cloud sync.** That is PAT Cloud's problem, not this app's.
