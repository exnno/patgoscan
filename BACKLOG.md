# PATGo Scan — Backlog

Carried forward each release. Nothing here is committed to; it is the list of
things worth considering when the client's actual working day suggests them.
(c) 2026 Peter Birchley. All rights reserved.

---

## Pending answers from the client

*(Nothing outstanding. Both long-running questions closed in V6.)*

## Closed in V8

- **~~The last-item quick view sits below the fold.~~** ✅ ANSWERED AND FIXED.
  Raised in V5, shipped in V6, and the V6 note called the outcome exactly:
  *"the likeliest reason it fails: on a smaller phone it sits below the fold, so
  confirming a scan costs a scroll. That is a placement problem, not an idea
  problem."* It was measured in V8 — the idle scan screen wanted ~810px against
  ~685px available on a 17 Pro, so the block was ~125px past the bottom. It is
  now one row (~62px) and the whole screen fits with room to spare. ⚠ THE TRIAL
  IS NOT OVER, IT HAS ONLY NOW STARTED FAIRLY: until V8 nobody had used this
  feature without scrolling to it. Judge it over the next few working days.
- **~~The session strip is invisible.~~** ✅ FIXED BY THE SAME CUT, and it was
  the same cause. The strip was directly above the last-item block and directly
  below the same fold, so "there is no sessions screen" was the honest reading
  of what the phone was showing. Decision 1A: no new nav tab, no move — it just
  needed to be on screen. Settings → Sessions was always the other way in.

## Raised in V8

- **⚠ The pending scan screen still overflows, by ~163px.** Decision 2A took the
  tightening only. Measured, the fold now lands just below the counts: PASS/FAIL
  (bottom edge ~542), Discard (~600) and the counts (~644) are all on screen,
  and the session strip is clipped by a few pixels with the last item below it.
  That is the right trade — mid-scan the last item is the wrong card to be
  reading — but it is a trade, not an accident. **2B is the held lever:** hide
  the last-item block while a scan is pending, which recovers the lot. Three
  lines, no decisions attached, if it nags in the field.
- **The changelog roll was not being enforced.** Test 10j's own comment warned
  that asserting "the oldest is present, the one before it is not" would stay
  green on a changelog that grew and never dropped — and then V7 grew it to four
  entries and the test stayed green, because once V3 was gone it could never
  fail again. Now counted: four entries, newest first, oldest drops off. V4 was
  dropped in V8 to bring it back into line.

## Closed in V7

- **~~Work saved as sessions.~~** ✅ SHIPPED V7. `sessions.js`, plus the
  `sessionId` field on every record and the adoption migration in `storage.js`.
- **~~A sessions screen.~~** ✅ SHIPPED V7. List, switch, name, close, reopen
  (5B, behind a confirm), merge, share, and delete for an empty session only.
- **~~Combine sessions and files from other engineers, flagging duplicates.~~**
  ✅ SHIPPED V7, **as a JSON exchange rather than CSV reading** — see the finding
  below.
- **~~Duplicate item warnings (cross-session, cross-engineer).~~** ✅ SHIPPED V7
  as the review screen. The within-phone scan-time warning is untouched, and is
  now correctly scoped so it cannot reach into another engineer's session.

### ⚠ THE FINDING THAT RESHAPED THIS GROUP — the CSV cannot be read back

The backlog said the merge "needs CSV reading" and called it the largest new
capability on the list. That was the wrong answer to the right question, and it
was answered by running two records through the real export code:

An **initial, visual-only, failed** item and an **audit, fully tested, failed**
item produce rows that are identical in every column except the asset id.

The CSV is a report written to the client's specification, not a save file. It
carries **no record id, no time of day, no `mode` column and no `visual`
column**, and it emits no rows for locations at all. Mode is inferred from
DESCRIPTION being blank (9A) and visual from the readings being blank (3B) — and
under 6A a fail carries no readings either way, so that inference is provably
wrong for some rows. Importing one means writing guesses into the client's
system.

**If CSV import is ever wanted anyway,** two prerequisites, in order:
1. **Revisit 6A** — a visual fail and a tested fail must become distinguishable.
2. **Append the missing fields as columns after ENGINEER** (record id, timestamp,
   mode, visual), the same move 12B made for ENGINEER. Needs the client's
   agreement, since it changes what lands in their system. One edit to
   `CSV_COLUMNS`. Considered for V7 and shelved deliberately: the JSON exchange
   does the job with no client conversation and no guessing.

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
  ahead of it in the queue. ⚠ HELD OUT OF V7 TOO — V7 took the sessions group,
  which changed the storage shape. Same argument, third time: it is still
  self-contained, still has no open questions, and is now the strongest
  candidate for V8.
- **Naming an audit location retrospectively.** Already possible — tap it in the
  log and fill in Client / Floor / Room — but nothing prompts for it, and the V4
  picker is the first place where an unnamed location visibly costs something.
  If engineers start revisiting sites, a nudge to name a location the second
  time it is scanned might pay for itself. Watch before building.

## Raised in V7

- **The last-item quick view is still on trial** and V7 did not touch it. It is
  now session-scoped like everything else on the scan screen. Same three-edit
  removal if it does not earn its place.
- **Session housekeeping.** V7 deliberately has no way to delete a session that
  holds records — the records would be orphaned and swept into a machine-named
  session by the next load, which looks exactly like data loss. If closed
  sessions pile up, the honest shape is "export it, then clear", not a delete
  button. Watch first.
- **Naming the session at the start of a job.** V7 names it after the day and
  lets you rename. If engineers routinely do two sites in a day, prompting for a
  name when a new session opens may pay for itself. Cheap to add, easy to
  regret — a prompt on every fresh session would be nagging.

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

- **~~Merge helper.~~** ✅ SHIPPED V7 as the sessions merge and the review
  screen. ⚠ Its long-standing note that it "needs the app to READ a CSV" was
  wrong, and the reason is written up under "Closed in V7" above — the exchange
  is JSON because the CSV is lossy about our own records.
- **Setup bundle export/import.** PATGo has `setup.js`: a shareable config file
  covering lists and preferences. Worth porting when there are enough phones
  that setting each one by hand is a risk of inconsistency.
- **~~Session/day boundaries.~~** ✅ SHIPPED V7.
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
