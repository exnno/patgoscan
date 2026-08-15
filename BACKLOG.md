# PATGo Scan — Backlog

Carried forward each release. Nothing here is committed to; it is the list of
things worth considering when the client's actual working day suggests them.
(c) 2026 Peter Birchley. All rights reserved.

---

## Pending answers from the client

- **Auto-detect location vs asset barcodes.** V1 uses the armed location bar
  (decision 1D) because the app cannot tell the two apart by looking. If their
  label convention makes them distinguishable — a prefix, a length, a number
  range — auto-detection removes one tap per room, which over a large estate is
  a real saving. Needs their convention in writing first.
- **Audited locations as their own CSV rows.** Included in V1. Trivial to drop
  if their importer objects to them.
- **Class III / lead.** V1 offers Class I and Class II only.

## Queued from V2

- **Move an item to another location.** V2 shows the location on the item edit
  sheet but read-only. Correcting it needs a picker, and it moves a row under a
  different heading in the client's CSV — its own release, with a think about
  what happens to an item moved to a location that has not been scanned yet.
- **A maskable icon variant.** The V2 icon's scan brackets fall outside the
  maskable safe circle, so the manifest declares `purpose: "any"` only. Fine on
  iOS, which is the whole fleet. Only worth doing if Android appears.

## Worth building if the job grows

- **Merge helper.** Six engineers produce six CSVs a day. Currently merged in a
  spreadsheet. A small importer here — read several CSVs, resolve duplicate
  asset ids by timestamp, emit one file — would remove a manual step at the end
  of every day and a class of copy-paste error with it.
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

- **Merging PATGo Scan back into PATGo.** Two codebases by design. Anything
  worth having in both is rebuilt by hand from a spec.
- **A local asset register.** The client's software owns the register. This app
  records what the engineer did and nothing more; adding a register here would
  create a second source of truth that has to be reconciled.
- **Cloud sync.** That is PAT Cloud's problem, not this app's.
