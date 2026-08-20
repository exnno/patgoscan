# PATGo Scan — Backlog

Carried forward each release. Nothing here is committed to; it is the list of
things worth considering when the client's actual working day suggests them.
(c) 2026 Peter Birchley. All rights reserved.

---

## Pending answers from the client

*(Nothing outstanding. Both long-running questions closed in V6.)*

## Closed in V6

- **~~Audited locations as their own CSV rows.~~** ✅ ANSWERED AND DROPPED. Open
  since V1. The client's own sample file has no location rows at all — every row
  is an asset, with the location's barcode repeated on each. A location's floor
  and room now ride on the first item row beneath it. ⚠ THE KNOWN COST: a
  location visited and found empty leaves no trace in the file. Accepted
  deliberately (decision 8A); if it ever needs reversing, the shape to revisit is
  8B — an asset-less row for a location with nothing under it.
- **~~Confirm the final column layout with the client.~~** ✅ ANSWERED. Carried
  through V4 and V5. The client supplied their finalised twelve columns plus a
  worked sample, and V6 ships them. Both V5 hedges are resolved: **1B** was
  taken (the class is stored as its own value, `1` / `2`), and the `visual`
  column is gone entirely — a visual inspection is now expressed by empty
  readings rather than by a column of its own.

  ⚠ THE V5 CLAIM PAID FOR ITSELF. Nine of fifteen columns moved and `csv.js` was
  not touched for the reorder — only for the new `(record, ctx)` cell signature
  that FLOOR and ROOM needed. Test 12ac proves the property still holds.

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
  armed scanner mode do not belong in the same upload. ⚠ HELD OUT OF V6 FOR THE
  SAME REASON — V6 was the bigger data-shape release of the two. It is now the
  strongest candidate for V7: self-contained, no open questions, and nothing
  ahead of it in the queue.
- **Naming an audit location retrospectively.** Already possible — tap it in the
  log and fill in Client / Floor / Room — but nothing prompts for it, and the V4
  picker is the first place where an unnamed location visibly costs something.
  If engineers start revisiting sites, a nudge to name a location the second
  time it is scanned might pay for itself. Watch before building.

## Raised in V5 — the sessions group

⚠ **THESE FOUR ARE ONE PIECE OF WORK, NOT FOUR.** Sessions is the spine and the
other three sit on it; building any of them first means building a private
version of sessions inside it and throwing that away later. This is also the
first item on the list that genuinely changes the storage SHAPE. ⚠ V6 MOVED
`backupVersion` TO 2 for the class value change (`I`/`II` → `1`/`2`), so this
group will be spending the move to 3 — the reasoning is unchanged, it just
starts from a different number.

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

## Raised in V5 — small and independent — BOTH SHIPPED IN V6

- **~~A quick view of the last item on the entry screen.~~** ✅ SHIPPED V6, AND
  IT IS ON TRIAL. It sits at the FOOT of the scan screen and "Discard this scan"
  was left exactly where it was — folding the two together would have made
  removing the quick view destructive, and the point of a trial is that it comes
  out cleanly. Two controls, not three: delete and undo are the same action when
  the record is the last one.

  ⚠ IF IT IS PULLED, IT COMES OUT IN THREE EDITS — `renderLastItem()` in
  render.js, the two actions in dispatch.js, the `.lastitem` block in styles.css
  — and nothing else on the screen moves. Keep it that way.

  ⚠ THE LIKELIEST REASON IT FAILS: on a smaller phone it sits below the fold, so
  confirming a scan costs a scroll. That is a placement problem, not an idea
  problem — worth trying it above the counts before abandoning it.
- **~~Totals on the log view.~~** ✅ SHIPPED V6, labelled "all time" so it cannot
  be read as the scan screen's daily strip.

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
