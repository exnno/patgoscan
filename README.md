# PATGo Scan — test harness

Not shipped. Not in `index.html`, not in the `sw.js` precache list — test 01e
fails if either changes.

```
node harness/run.js       # must end "N passed, 0 failed"
node harness/mutate.js    # must end "N caught, 0 survived, 0 aborted"
```

(c) 2026 Peter Birchley. All rights reserved.

---

## What run.js covers

It already does what used to be manual pre-flight steps, so running those
separately is redundant: every file parses, the duplicate top-level declaration
scan, load order against the service worker's ASSETS list, existence of every
precached file, copyright headers, the banned-dialog sweep, and the storage-key
prefix check. Then the behavioural assertions on top.

The load order is **derived from `index.html`**, never hard-coded here. Listed
twice, the harness could go green against an order the browser never uses.

## What mutate.js is for

An assertion count proves nothing. A suite can be entirely green and entirely
hollow. `mutate.js` breaks the source on purpose, one change at a time, and
checks the suite goes red.

- **caught** — the assertion works.
- **SURVIVED** — the code was broken and the suite stayed green. That assertion
  does not test what it claims. Fix the test, not the app.
- **aborted** — the suite crashed instead of reporting. Wrap the group.
- **SKIPPED** — the mutation's target text is no longer in the file. The
  mutation is stale, so the invariant is currently unguarded. Update it.

V1 shipped with three survivors on the first run. All three were assertions that
had looked perfectly reasonable:

- **M33** — group 04g tested `findItemByCode()` directly, proving the lookup
  works and saying nothing about whether `routeScan()` ever calls it.
- **M43** — the timestamp test asserted the time, so a mutation that swapped
  only the date half for a UTC one stayed green.
- **M47** — "nothing was cleared" passed either way, because with the guard
  removed the code fell through to a confirm sheet nobody confirms headlessly.

That is the shape to watch for. Ask of every new assertion: **could this pass on
broken code?**

## Rules that have already cost a real bug

- **Go through the surface the browser uses.** At least one assertion per
  listener-based feature must dispatch through `document`, not call the handler
  directly. PATGo shipped three releases with `initScanner()` never called
  because two dozen groups called the handler by hand and all passed.
- **A stub that is too thin is worse than no test.** If an element stub lacks a
  property the app reads, the code bails out before reaching the assertion and
  the assertion passes green having tested nothing. When the window stub was a
  bystander object rather than the global, `bootIntegrityOK()` failed, the whole
  boot tail was skipped, and a dozen scanner assertions "passed" on a dead app.
- **The mock clock must only go forwards.** Any mechanism that remembers "ignore
  input until timestamp X" reads as still-armed when a later group mocks an
  earlier moment. Use `fixture.nextWindow()`; never pick a start time by hand.
- **Source-shape assertions must strip comments first** (`L.stripComments`).
  Every rule worth asserting is also explained in a comment beside the code, and
  that comment contains the very strings the assertion greps for.
- **A failing assertion is usually a harness defect.** Five of the first six
  failures in this suite were the tests' fault.
- **A real bug found mid-release goes in `known()`** — not deleted, not left red.
  It reports as a known defect and announces itself once it starts passing.

## Reaching into the app

Top-level `const`/`let` do not attach to the vm global; top-level functions do.

```js
app.fn('render')        // functions, straight off the global
app.val('APP_VERSION')  // constants, via the bridge the loader appends
app.state()             // the live state object
app.el('scan-input')    // a registered DOM stub
```

## Adding to it

Every release adds assertions to `tests/` **and** a matching mutation to
`mutate.js`, and both ship with the code. Never delete a test file — prior
coverage is never re-paid.
