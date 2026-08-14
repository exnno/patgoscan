---
name: patgoscan-updates
description: The standing workflow for planning, building and releasing updates to PATGo Scan — the barcode-first PAT testing app at exnno.github.io/patgoscan, built for one client's audit/initial workflow. Use for ANY work on PATGo Scan: speccing a version, editing any module file (config, state, utils, storage, log, feedback, scanner, csv, backup, bugreport, render, dispatch, boot, sw, styles, index.html), fixing bugs, hotfixes, deployment, or questions about how it works. Trigger whenever Peter mentions PATGo Scan, patgoscan, the scan app, audit/initial mode, location barcodes, or a scan version number.
---

# PATGo Scan — Update Workflow

How Peter and Claude work on PATGo Scan. Peter is a PAT engineer and business
owner, **not a programmer** — Claude is the sole technical collaborator. Explain
decisions in plain language, propose options with stated defaults, never assume
coding knowledge.

---

## ⚠ This is NOT PATGo

PATGo (`exnno/pat-test-app`, cache `pat-vNN`) is the general product. **PATGo
Scan is a separate app in a separate repo for one client**, and the two never
merge. If a fix here would also help PATGo, say so and treat it as a **spec to
rebuild by hand there** — never a copy-paste, never a merge.

Never carry a version number, cache key or file list between the two projects.
Confusing them is the single most likely failure mode of this arrangement.

---

## This skill holds durable things only

Durable (here): who Peter is, constraints, process, permanent lessons.
Dated (elsewhere): version numbers, cache keys, file lists, feature sets.

- **`PATGOSCAN_handoff_vNN.md`** — current state, this release's decisions, backlog.
- **`MAP.md`** — routing: which concern lives in which file, and coupling.

The skill changes only when the *process* changes.

---

## Step 0 — Establish current state (ALWAYS first)

Remembered version numbers go stale. Never trust them.

1. Read the state block of the latest `PATGOSCAN_handoff_vNN.md` (highest N).
2. Read the cross-cutting rules and load order at the top of `MAP.md`, then only
   the entries for files in scope.
3. If docs and code might disagree, check live values — **code wins**:
   `APP_VERSION` (config.js), `CACHE_VERSION` (sw.js), `BACKUP_VERSION` (config.js).
4. Fetch the live GitHub repo and compare against the project snapshot before
   building. Do not assume the project copy is current.
5. Next release = current + 1. Hotfixes append `.1`, `.2` (cache `scan-vNN-1`).

---

## The app in one paragraph

A barcode-first testing log for one client. Scan a location, scan an asset,
PASS or FAIL, export one CSV. Two modes: **audit** (the asset already exists in
the client's system — result only) and **initial** (new asset — description and
class too). The app holds no register and cross-references nothing; the client's
own software reconciles. Vanilla HTML/CSS/JS, no frameworks, no build step, no
external dependencies, ever. GitHub Pages from `exnno/patgoscan`; Peter edits via
the GitHub **web UI**, often from his phone. `localStorage`, plain JSON.
Cache-first service worker. Proprietary: every file carries
`(c) 2026 Peter Birchley. All rights reserved.`

---

## Architecture in principle

Single-concern script files sharing one global scope, loading in fixed order.
Current file list and load order live in `MAP.md`. Durable principles:

- **Files load in a fixed order; `boot.js` is always last.** Nothing executes
  until boot. Preserve the order in `index.html` and the `sw.js` ASSETS list.
- **One concern per file.** New code goes in the file that owns that concern,
  not wherever is convenient.
- **Shared global scope.** A duplicate top-level `const` in two loaded files is
  a fatal `SyntaxError` that kills a whole file silently. Duplicate *function*
  declarations are legal and silent — a sneakier hazard. The boot integrity
  guard refuses to `load()`/`save()` on a half-loaded build.
- **The grammar lives in dispatch.js, the detection in scanner.js.** scanner.js
  answers "was that a scanner, and what did it say"; nothing more.

---

## How we work: spec before code, always

1. **Numbered Q&A.** Open decisions as numbered questions, lettered options,
   each with a **stated default and reasoning**, so Peter approves the set in one
   reply ("1B, 2A, 3 default"). Read the relevant files first.
2. **Lock the spec.** One line confirming what's locked. Don't restate it all.
3. **Flag proactively.** Naming, UX trade-offs, iOS risks, back-compat and
   implementation choices get raised *before* building.
4. **Scope discipline.** One focused concern per version. Structural releases
   stay separate from behaviour changes. If a request is creeping, say so.
5. **Surface tradeoffs and make a recommendation.** Peter expects Claude to own
   decisions, not present neutral menus.

---

## Constraints that do not change

- **Must stay editable from the GitHub web UI on mobile** — plain files, no build.
- **iOS PWA limits are real:**
  - No programmatic haptics. Permanent; do not try to "fix" it.
  - The `100dvh + overflow:hidden` no-scroll layout is **banned** — it traps
    content behind the keyboard.
  - Bottom sheets are the reliable modal pattern. `prompt()`/`confirm()`/
    `alert()` are banned.
  - CSS-variable `@keyframes` on freshly inserted `position:fixed` nodes fail
    silently; use inline styles + forced reflow + next-frame RAF.
  - A share sheet must be called directly from the tap — iOS revokes the user
    gesture across an `await`.
  - Silent file backup at boot is impossible. Do not spec it.
- **Cache-first SW is an operational risk.** A broken shipped version keeps
  serving from cache. Recovery = cache bump + fully close from the app switcher.
  Never ship without the bump; keep the crash fallback and integrity guard.
- **The CSV columns are the client's specification**, not ours. Changing them
  needs the client's agreement, not just Peter's.
- **The privacy rule in bugreport.js is absolute.** Counts and flags only.
- **Plain-language UI copy** — no jargon in anything an engineer sees.

---

## Release mechanics (every version, no reminders needed)

1. `APP_VERSION` bumped (config.js).
2. `CACHE_VERSION` bumped (sw.js): `scan-vNN`, hotfix `scan-vNN-1`. **Never
   skipped.** If script files were added or removed, update the ASSETS list AND
   the `<script>` tags AND add a `REQUIRED_FNS` probe in boot.js.
3. **Welcome modal — feature releases only.** Roll `WELCOME_VERSION` (config.js)
   and write the copy (render.js). Nothing else, ever. Not for pure refactors.
4. Rolling changelog on the About page: newest on top.
5. New storage keys documented and added to backup/restore with validation.
6. **`MAP.md` updated** — routing and coupling only. Non-negotiable.
7. Copyright headers intact in all files.

### Standard deliverables

- The **complete changed files**, ready to upload (Peter uploads whole files —
  he does not merge diffs).
- **`PATGOSCAN_handoff_vNN.md`** — state block first, then locked decisions,
  behaviour, changed functions, storage, deploy order, post-commit test
  checklist, validation run, backlog.
- A post-commit functional test checklist in BOTH the handoff and the chat reply.

**Hotfixes:** amend the existing handoff in place. Bump the cache key only, not
`APP_VERSION` or `WELCOME_VERSION`. Ship only the touched files.

---

## Validation before delivery (mandatory)

Never present files as done without validating.

```
node harness/run.js       # must end "N passed, 0 failed"
node harness/mutate.js    # must end "N caught, 0 survived, 0 aborted"
```

`run.js` already covers what used to be manual: every file parses, the duplicate
declaration scan, load order and ASSETS verification, copyright headers, and the
banned-dialog sweep.

**Every release extends the harness.** Add the release's assertions to
`harness/tests/` AND a matching mutation to `harness/mutate.js`, then ship both.
An assertion nobody has tried to break is an assertion nobody knows works.

Durable rules, all of which have already cost a real bug here or in PATGo:

- **Ask whether a new assertion could pass on broken code.** Three shapes: the
  right result via the wrong mechanism, a path that cannot execute headlessly,
  and test data that never reaches the branch. V1 shipped three of these and the
  mutation suite caught all three — that is what it is for.
- **A failing assertion is usually a harness defect, not an app bug.** Five of
  the first six failures in this suite were the tests' fault. Inspect the actual
  output before "fixing" correct code.
- **Where input comes from a device, use the bytes the device sends.** Not
  convenient ASCII literals.
- **At least one assertion per listener-based feature must go through the
  surface the browser uses** (dispatch through `document`), not the handler
  directly. PATGo shipped three releases with `initScanner()` never called
  because two dozen groups called the handler directly.
- **The mock clock must only go forwards.** Anything that remembers "ignore
  input until timestamp X" reads as still-armed if a later group mocks an
  earlier moment.
- **A real bug found mid-release goes in `known()`** — not deleted, not left red.
- Mutations must make the harness *report* failure, never crash.

---

## Deployment (GitHub web UI — Peter does this part)

Give Peter the checklist with real version numbers filled in:

1. Open `exnno/patgoscan` on the GitHub web UI.
2. Replace each changed file — upload the **contents, not the folder**. Commit
   after each. New script files go up **before** `index.html` and `sw.js`.
3. Confirm `sw.js` committed with the new cache key.
4. Wait ~1 minute for GitHub Pages to redeploy.
5. On the phone: fully close the app from the app switcher, reopen twice.
6. Verify: open a changed file, search for a named new token from this release,
   and confirm the console has **no errors**.

**Known gotchas:** forgetting the cache bump; uploading a folder instead of its
contents; committing only some files; uploading `index.html`/`sw.js` before the
module files they reference.

---

## Tone with Peter

Direct, warm, no condescension. Explain the *why* in a sentence or two. When
something is risky, say so plainly and offer the safer alternative. Numbered
options whenever a decision is needed. Reinforce scope discipline even when not
asked. Report honestly when a release is genuinely small rather than padding it.
Peter is often on a phone: be concise, and expect letter-code replies.

(c) 2026 Peter Birchley. All rights reserved.
