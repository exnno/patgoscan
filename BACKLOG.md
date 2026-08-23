# PATGo Scan — Backlog

Carried forward each release. Nothing here is committed to; it is the list of
things worth considering when the client's actual working day suggests them.
(c) 2026 Peter Birchley. All rights reserved.

---

## Pending answers from the client

*(Nothing outstanding. Both long-running questions closed in V6.)*

## Closed in V12

- **~~A run has no undo.~~** ✅ SHIPPED V12 (6A), and **the V11 note was half
  wrong in a way worth keeping written down.** It said a batch undo and a
  multi-move were the same ask because both needed a selection mechanism.
  Undoing the run you *just committed* needs no selection at all: `addItemRun()`
  hands back the records it wrote, so the app is holding those ids at the moment
  it writes them. The receipt (`state.lastRun`) is one transient and one label —
  Undo reads **Undo all 6** while the run stands. ⚠ SELECTION ALONE WOULD HAVE
  BEEN A POOR ANSWER TO THIS: twenty rows is still twenty taps, because nothing
  on a record says "these six were one run" (V11 decision 6A declined to stamp
  one, and V12 did not revisit it).
- **~~The log has no way to act on several rows at once.~~** ✅ SHIPPED V12
  (2A/3A/4A). **Select** in the log ticks items and removes them together.
  Items only — a location delete runs the `locationId` sweep, and at batch scale
  that consequence is invisible. **Select all** is scoped to what the search is
  showing and carries the count in its label, because the number is the safety
  feature: the log holds a whole session, and an unlabelled "all" over a filtered
  list means whatever the box a thumb is covering says. ⚠ MULTI-MOVE IS STILL
  NOT BUILT — see "Raised in V12".
- **~~The log screen disagreed with itself about what a session is.~~** ✅ FIXED
  V12 (5B). The list showed every session, the totals strip counted one and
  called itself "all time", and the tab badge counted the phone — three scopes
  on one screen. All three now mean the current session; the phone-wide figures
  moved to a line under the sessions list (12A/13A). ⚠ THE COST IS REAL AND IS
  STATED ON SCREEN: another session's records can no longer be reached by
  tapping. Sessions → Work in this → correct it → switch back.
- **~~A committed run read back shuffled in the log.~~** ✅ FIXED V12 (7A). Six
  records written in one loop share a millisecond, and `byNewest()` fell through
  to the id — six random base-36 characters — so a run came back in a different
  order every time. Numeric tiebreak on the code now. ⚠ THE EXPORT WAS NEVER
  AFFECTED and must not be brought into it: `csv.js` sorts ascending by `ts` and
  relies on stability. Two comparators, two jobs.

## Raised in V12

- **⚠ MOVING SEVERAL ITEMS AT ONCE IS STILL NOT BUILT, AND THE SELECTION NOW
  EXISTS TO DO IT WITH.** Deliberately held back: a multi-move has to answer the
  V10 question — which session's locations does the picker offer when the
  selection could in principle span sessions — and V12's hard scope means it
  cannot, which makes the answer *look* free. It is not free the day a "view a
  past session" screen arrives. Spec the picker's session explicitly when this
  is built; do not inherit it from "the log is the current session".
- **⚠ THE ONLY WAY TO CORRECT ANOTHER SESSION'S RECORD IS TO SWITCH INTO IT.**
  This is the accepted cost of 5B, not an oversight, and V10's out-of-session
  edit paths are kept whole and unreachable-by-tap against the day it wants
  answering properly — a **view a past session** screen, read-only or otherwise.
  Watch whether it bites before building it.
- **⚠ A TEST WHOSE COVERAGE DEPENDED ON MACHINE SPEED.** 17s asserted a run
  sorts in order, and passed with the numeric compare disabled — because that
  particular six-item run had straddled two milliseconds, so the tiebreak never
  ran. Caught only because mutation M198 survived. The stamps are now forced
  equal in the fixture-facing groups. **This is the sixth documented way this
  suite has reported something other than what it was testing**, after wrong
  selector, wrong text, wrong edit, wrong stub and leaked output: **accidental
  coverage.**
- **⚠ FIVE MUTATIONS WENT STALE IN ONE RELEASE AND THE RUN STILL SAID "0
  SURVIVED".** M03, M49, M157, M161 and M168 all reported SKIPPED against V12's
  edits — their anchor text had moved — and skipped is not caught. The runner
  already exits non-zero on a skip; the lesson is that **a release touching a
  file must re-read every mutation anchored in it**, not just add new ones.
- **⚠ AN ASSERTION GUARDED THE WRONG FACT SO FAITHFULLY IT PRESERVED A BUG.**
  13p asserted the log totals strip said "all time" — which it did, and which
  had been untrue since V7 when `logTotals()` was scoped to the session. The
  test kept a four-release-old lie on screen by testing it. ⚠ WHEN A LABEL AND
  THE FUNCTION BEHIND IT ARE ASSERTED SEPARATELY, ASSERT THAT THEY AGREE — the
  strip now asserts the session name *and* that the old words are gone.

## Closed in V11

- **~~Batch initials.~~** ✅ SHIPPED V11, and it is **the first time this app has
  ever written an asset code nobody scanned.** Scan the first item in Initial
  mode, fill the description, set **How many**, and the rest are numbered up from
  it. ⚠ THE THREE RULES THAT MAKE IT SAFE ARE NOT DECORATION, they are the
  answer to that one fact: the counting is a pure function with no state near it
  (`runCodesFrom()`, utils.js); the **exact range is shown before anything is
  written**, so the engineer reads it against the labels in front of them; and a
  run that meets an id already on file is **refused whole and the clash named**.
  ⚠ SKIPPING A TAKEN ID AND CARRYING ON WAS THE TEMPTING VERSION AND IS THE
  WRONG ONE — it moves the end of the range, so the last id is one nobody held a
  label against. Do the run up to the gap, then start another after it.
- **~~You cannot tell an audit row from an initial one in the log.~~** ✅ FIXED
  V11 (7A). A badge on every item row, both ways round. ⚠ THIS IS THE ONE
  EXEMPTION TO "ONLY THE NON-DEFAULT STATE IS PRINTED", and the exemption is
  about shape: that rule protects the META LINE, where every word pushes the
  description and the room off the end. A badge sits in its own column and costs
  the line nothing — so printing the quiet one too is affordable, and printing
  only Initial would have been the rule rather than the decision.
- **~~The blue unexported dot on every log row.~~** ✅ REMOVED V11 (8A). It
  marked "not exported", which since V7 has been true of nearly every row until
  the session goes out — and a marker on nearly every row is not a marker.
  Export is scoped to the session now, so it was answering a question the log is
  the wrong place to ask. The count still lives on the Log tab, in Settings and
  in the export nudge.

## Raised in V11

- **~~⚠ A RUN HAS NO UNDO.~~** ✅ ANSWERED V12 — see "Closed in V12". The note
  was right that it would bite and wrong about what it needed; the correction is
  written up there. Original text kept below.
- **⚠ A RUN HAS NO UNDO.** Undo on the last-item block removes ONE item, so
  correcting a wrongly-committed run of twenty means twenty deletions from the
  log. Deliberately not built: a batch undo needs a selection mechanism the log
  does not have — the same one the V10 note wants for moving several items at
  once — and inventing one to cover a mistake nobody has made yet is how a
  feature grows a second feature before it has earned the first. ⚠ WATCH FOR IT
  IN THE FIELD. If it bites, the two asks share an answer and should be specced
  together.
- **⚠ A toast written once is a toast that outlives its group.** `showToast()`
  appends its node to `<body>` ONCE and reuses it forever, so the message
  survives every `resetApp()` — and 16g went red asserting that a single scan
  stays SILENT, because 16f's run receipt was still sitting in the node. Working
  code, a group that never called showToast, and a failure pointing nowhere near
  the fault. Now cleared in the fixture beside the sheet and the focus, which
  are there for the same reason. **This is the fifth documented way this suite
  has reported something other than what it was testing**, after wrong selector,
  wrong text, wrong edit and wrong stub: **leaked output.**
- **⚠ A hollow assertion removed rather than re-pointed.** 10j's "About leads
  with V10" read `about.indexOf('<b>V10</b>') !== -1` — true of a changelog with
  V10 ANYWHERE in it, including at the bottom, so it could not fail while the
  entry survived at all. `entries[0]` two lines below was already the assertion
  it was pretending to be. Re-pointing it to V11 would have carried the
  hollowness forward for another release.

## Closed in V10

- **~~The picker can point an item at a location in another session.~~** ✅ FIXED
  V10, and fixed by making the list right rather than by taking the control
  away. `locationChoices()` now takes the session it is asked for and the edit
  sheet passes the RECORD's, so **Change** lists the rooms from the batch the
  item actually ships in. **Save & scan is dropped for those items** — the room
  you are stood in belongs to today's session, so a scanned destination could
  only ever refuse. ⚠ THE EMPTY CASE NEEDED ITS OWN COPY: "scan a location and
  come back" is actively wrong advice for another session, because the location
  you scan joins today's.
- **~~The welcome modal lost V7's "a session file is not a backup" note.~~**
  ✅ ANSWERED, and moved somewhere it cannot be lost again. It is now a
  permanent line on the **Sessions screen beside Share**, not welcome copy. ⚠ A
  MODAL IS WHERE A RULE GOES TO BE FORGOTTEN — the copy is replaced wholesale by
  whichever release rolls it next, which is exactly how this one vanished
  between V7 and V9. The import side has said its own version since V7; the
  outbound direction is the one that loses work, and it was the unguarded one.

## Raised in V10

- **⚠ A DOM stub that cannot fail the way the browser fails certifies broken
  code.** M174 removed the `if (locScan)` guard around V10's now-conditional
  Save & scan button — an instant TypeError in a browser, leaving a half-wired
  edit sheet with no Save and no Cancel — and the suite stayed green, because
  `stubs.js` manufactured an element for **any** selector. Now an `#id` lookup
  on a node whose innerHTML does not contain that id returns null. This is the
  fourth documented way a mutation or stub has failed to test what it claimed
  here, after wrong selector, wrong text and wrong edit: **wrong stub.**
- **~~Batch initials.~~** ✅ SHIPPED V11 — see "Closed in V11" above. The V10
  note was right about the shape of it: it did need its own release and its own
  decisions, and the decision that mattered was the one about the gap.

## Closed in V9

- **~~Scan a location barcode to move an item there.~~** ✅ SHIPPED V9. Raised in
  V4 and held out of V5, V6, V7 and V8 — four releases, each time for a reason
  that was true at the time. Tap the item in the log, tap **Save & scan** on the
  Location row, stand in the right room and scan its label. ⚠ THE V4 NOTE WAS
  RIGHT ABOUT THE HARD PART: the scanner refuses to collect while a sheet is
  open, so this needed a new armed mode in the grammar rather than a button on
  the picker. What the note did not know is that **the log screen already
  consumed barcodes** — they went into the search box — so the arm does not add
  a meaning, it takes one over. That is why every path out of the move disarms,
  including the ones that refuse.

## Raised in V9

- **~~The picker can point an item at a location in another session.~~**
  ✅ CLOSED IN V10 — see above.
- **A mutation that adds dead code proves nothing.** M161 survived its first run
  and the mutation was at fault, not the test: it inserted an `if (false)` line
  above the comment block and left the real assignment below it. A mutation must
  REMOVE or CHANGE the line carrying the invariant, and where the same statement
  appears twice in a file it has to be anchored on its neighbour. Written up in
  the V9 handoff.
- **~~The welcome modal lost V7's "a session file is not a backup" note.~~**
  ✅ CLOSED IN V10 — carried forward, and not into another modal.

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

- **~~Scan a location barcode to move an item there.~~** ✅ SHIPPED V9 — see
  "Closed in V9" above. The history is kept because it is the clearest example
  in this project of scope discipline actually working: five releases, four
  deferrals, each with a stated reason, and it shipped alone in the end.
  The obvious gesture: stand
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
  candidate for V8. ⚠ HELD OUT OF V8 as well, for a new reason — V8 was already
  carrying the restored harness and a broad sweep across `render.js` and
  `styles.css`. **V9 took it, alone, exactly as the V8 handoff said it should.**
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
