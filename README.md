# PATGo Scan

A barcode-first appliance testing log, built for one client's audit and initial
workflow. Mobile-first, fully offline PWA.

**Live:** https://exnno.github.io/patgoscan/
**Repo:** `exnno/patgoscan`

(c) 2026 Peter Birchley. All rights reserved. Proprietary — see `LICENSE.txt`.

---

## What it does

Scan a location barcode, scan an asset barcode, tap PASS or FAIL, export one
CSV. Two modes:

- **Audit** — the asset already exists in the client's system. Result only.
- **Initial** — a new asset. Description and class as well.

The app holds no asset register and cross-references nothing. It records what
the engineer did; the client's own software reconciles it afterwards.

## Stack

Vanilla HTML, CSS and JavaScript. No frameworks, no build step, no external
dependencies, no vendored libraries. 13 script files sharing one global scope,
loading in a fixed order with `boot.js` last. `localStorage` for everything,
stored as plain JSON. Cache-first service worker for full offline use.

Edited through the GitHub web UI, frequently from a phone. That constraint is
why there is no build step and why there never will be.

## Layout

| File | Concern |
|---|---|
| `config.js` | Constants, storage keys, defaults, the CSV column spec |
| `state.js` | The global `state` object |
| `utils.js` | Pure helpers — escaping, timestamps, CSV quoting |
| `storage.js` | Persistence boundary and the shared validators |
| `log.js` | The record model: locations, items, the sticky location |
| `feedback.js` | Toasts, bottom sheets, haptic/flash/sound |
| `scanner.js` | HID barcode scanner burst detection |
| `csv.js` | The client deliverable |
| `backup.js` | JSON backup, restore, clear |
| `bugreport.js` | Error capture and problem reporting |
| `render.js` | Every screen and sheet |
| `dispatch.js` | The scan grammar and delegated events |
| `boot.js` | Startup, integrity guard, crash fallback — runs on load, loads last |

`MAP.md` is the routing document: which concern lives where, and the cross-file
couplings you cannot find by reading one file.

## Testing

```
node harness/run.js       # every assertion
node harness/mutate.js    # breaks the source on purpose, checks the suite notices
```

`run.js` covers parsing, the duplicate top-level declaration scan, load order
against the service worker's precache list, copyright headers and the banned
dialog sweep, as well as the behavioural assertions. `mutate.js` is the real
bar: an assertion nobody has tried to break is an assertion nobody knows works.

Every release adds assertions **and** a matching mutation. Test files are never
deleted — coverage compounds.

## Releasing

1. Bump `APP_VERSION` in `config.js`.
2. Bump `CACHE_VERSION` in `sw.js` (`scan-vNN`). **Never skip this** — the cache
   key is what pulls a new build onto an already-installed PWA.
3. If script files were added or removed: update `index.html`, the `sw.js`
   `ASSETS` list, and `REQUIRED_FNS` in `boot.js`.
4. Upload all files first, `index.html` next, `sw.js` **last**.
5. On the phone, fully close the app from the app switcher and reopen twice.

## Relationship to PATGo

PATGo (`exnno/pat-test-app`) is the general-purpose PAT testing app. PATGo Scan
is a separate application for a single client, sharing some proven code —
notably `scanner.js` — but no codebase and no release cycle. **The two are never
merged.** Anything worth having in both is rebuilt by hand from a specification.
