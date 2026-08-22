# PATGo Scan

A barcode-first PAT testing log, built for one client's audit and initial
workflow. Scan a location, scan an asset, PASS or FAIL, export one CSV. It holds
no asset register and cross-references nothing — it records what the engineer
did, and the client's own software reconciles it.

**Live:** <https://exnno.github.io/patgoscan/>
**Current version:** `V10` · cache `scan-v10` · backup format `3`

> ⚠ **This is not PATGo.** PATGo (`exnno/pat-test-app`, cache `pat-vNN`) is the
> general product; this is a separate app in a separate repo for a single
> client, and the two never merge. Never carry a version number, cache key or
> file list between them. Anything worth having in both is rebuilt by hand from
> a spec, never copied.

## What it does

Two modes, chosen with the switch at the top of the scan screen:

- **Audit** — the asset already exists in the client's system, so the app
  records the result and nothing else.
- **Initial** — a new asset, so it also asks for a description and a class.

Around that: an armed location bar (the app cannot tell a location label from an
asset label by looking at it, so the engineer says which is which), sessions as
the unit of work, duplicate warnings at scan time, engineer-to-engineer session
exchange as JSON with a side-by-side review of anything scanned twice, a
correctable log, Quick Pick descriptions, a twelve-column CSV written to the
client's specification, and JSON backup and restore.

Full history and the reasoning behind each decision live in the handoff
documents; **`PATGOSCAN_handoff_v9.md`** is the current one.

## Where things are

| | |
|---|---|
| **`MAP.md`** | Routing — which concern lives in which file, and the cross-file couplings you cannot discover by reading one file. **Read this first.** |
| **`PATGOSCAN_handoff_vNN.md`** | Current state, this release's locked decisions, deploy order, post-commit checklist. Highest `NN` is current. |
| **`BACKLOG.md`** | What is being considered, what was answered and dropped, and what is explicitly not being done. |
| **`SKILL.md`** | How this project is worked on — the process, not the code. |
| **`harness/README.md`** | The test suite: what it covers, and the rules that have already cost a real bug. |

## Stack

Vanilla HTML, CSS and JavaScript. **No frameworks, no build step, no external
dependencies, ever** — every file is editable from the GitHub web UI on a phone,
which is a hard constraint rather than a preference. State is plain JSON in
`localStorage`. A cache-first service worker gives full offline use.

Single-concern script files sharing one global scope, loaded in a fixed order
with `boot.js` last; nothing executes until boot. **The authoritative file list
and load order live in `MAP.md` and in `index.html`** — deliberately not
repeated here, because two lists drift apart and the harness reads those two.

## Constraints that do not change

- **iOS PWA limits are real.** No programmatic haptics. `prompt()`, `confirm()`
  and `alert()` are banned — bottom sheets are the reliable modal pattern. The
  `100dvh + overflow:hidden` no-scroll layout is banned: it traps content behind
  the keyboard. A share sheet must be called directly from the tap, because iOS
  revokes the user gesture across an `await`.
- **A cache-first service worker is an operational risk.** A broken shipped
  version keeps serving itself from cache. Recovery is a cache bump plus fully
  closing the app from the app switcher — which is why the bump is never
  skipped, and why the crash fallback and boot integrity guard stay.
- **The CSV columns are the client's specification**, not ours. Changing them
  needs the client's agreement.
- **`bugreport.js` sends counts and flags only.** Never record contents.
- Every file carries `(c) 2026 Peter Birchley. All rights reserved.`

## Testing

A Node harness with mutation testing. It is **not shipped** — not in
`index.html`, not in the service worker's precache list, and test 01e fails if
either changes.

```
node harness/run.js       # must end "N passed, 0 failed"
node harness/mutate.js    # must end "N caught, 0 survived, 0 aborted"
```

`run.js` already covers what used to be manual pre-flight: every file parses,
the duplicate top-level declaration scan, load order against the service
worker's `ASSETS`, copyright headers, the banned-dialog sweep and the storage-key
prefix check — then the behavioural assertions on top.

`mutate.js` breaks the source on purpose, one change at a time, and checks the
suite goes red. **An assertion nobody has tried to break is an assertion nobody
knows works.** Every release adds assertions *and* a matching mutation, and both
ship with the code. See `harness/README.md`.

⚠ **The harness is a deliverable like any other file.** V7 built its additions,
validated on them, reported the numbers and then never uploaded them — so the
repo's suite stayed a release behind and reported ten failures against correct
code, which V8 had to restore. Nothing on the phone can show this.

## Deployment

GitHub Pages, auto-deploying on commit to `main`. Edited through the GitHub web
UI, often from a phone — **upload file contents, not the folder.**

1. Replace each changed file and commit. **New script files go up before
   `index.html` and `sw.js`**, which reference them.
2. **`sw.js` last, always.** It is cache-first: shipped before the files it
   names, phones cache a half-built app.
3. Wait ~1 minute for Pages to redeploy.
4. On the phone, fully close the app from the app switcher and reopen twice.
5. Run the release's post-commit checklist from its handoff — that confirms the
   change works, not merely that the deploy landed.

**Known gotchas:** forgetting the cache bump; uploading a folder instead of its
contents; committing only some of the files.

## Releasing

1. Bump **`APP_VERSION`** in `config.js`.
2. Bump **`CACHE_VERSION`** in `sw.js` — `scan-vNN`, hotfix `scan-vNN-1`. This
   is the step that must never be skipped.
3. If script files were added or removed, update the `<script>` tags in
   `index.html`, the `ASSETS` list in `sw.js`, **and** add a `REQUIRED_FNS`
   probe in `boot.js`.
4. **Feature releases only:** roll `WELCOME_VERSION` in `config.js` and write
   the modal copy in `render.js`. Leave it alone for pure layout or refactor
   releases — there is nothing to teach.
5. Roll the About changelog in `render.js`: four entries, newest first, oldest
   drops off.
6. Bump **`BACKUP_VERSION`** only when the stored data shape changes. It is a
   migration signal, not a release counter.
7. New storage keys documented, and added to backup and restore with validation.
8. Update **`MAP.md`** — routing and coupling. Non-negotiable.
9. Write **`PATGOSCAN_handoff_vNN.md`**, including a post-commit test checklist.
10. Run both harness commands. Ship the changed `harness/` files with the app
    files.

**Hotfixes** bump the cache key only — not `APP_VERSION`, not
`WELCOME_VERSION` — ship only the touched files, and **amend the existing
handoff in place** so it stays the accurate record of current state.

---

(c) 2026 Peter Birchley. All rights reserved. Proprietary — not open source.
See `LICENSE.txt`.
