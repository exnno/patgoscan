# PATGo Scan — Backlog

Carried forward each release. Nothing here is committed to; it is the list of
things worth considering when the client's actual working day suggests them.
(c) 2026 Peter Birchley. All rights reserved.

---

## Pending answers from the client

- **Audited locations as their own CSV rows.** Included in V1. Trivial to drop
  if their importer objects to them.

## Under consideration

- **A Visual button alongside PASS and FAIL.** For items that get a visual
  inspection only rather than a full test. Needs deciding: what the CSV carries
  in the result column (a third value the client's importer has to accept, or a
  pass with a flag), and whether a visual-only item still asks for a class.
  Raised V3 in place of the dropped Class III item. ⚠ BLOCKED ON THE CLIENT, not
  on us: the CSV columns are their specification and a third result value is not
  ours to choose. Considered for V4 and deferred for exactly that. Ask them
  before it is specced — everything else about it is a day's work.

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
  picker turns out to be slow on a big site.
- **Naming an audit location retrospectively.** Already possible — tap it in the
  log and fill in Client / Floor / Room — but nothing prompts for it, and the V4
  picker is the first place where an unnamed location visibly costs something.
  If engineers start revisiting sites, a nudge to name a location the second
  time it is scanned might pay for itself. Watch before building.

## Worth building if the job grows

- **Merge helper.** Six engineers produce six CSVs a day. Currently merged in a
  spreadsheet. A small importer here — read several CSVs, resolve duplicate
  asset ids by timestamp, emit one file — would remove a manual step at the end
  of every day and a class of copy-paste error with it. ⚠ Flagged V4: this job
  happens at a desk at the end of the day, not on a phone in a plant room, and
  it needs the app to READ a CSV, which nothing here has ever done. It may want
  to be a separate one-page tool rather than a screen in this app. Decide that
  before speccing it. Still the highest-value item on the list.
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
