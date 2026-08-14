// PATGo Scan — service worker. Caches the app shell for full offline use.
// (c) 2026 Peter Birchley. All rights reserved.
//
// THE ONE RULE: bump CACHE_VERSION on EVERY release, and update ASSETS below
// only when app files are added or removed. The cache key is what pulls a new
// build onto an already-installed PWA; shipping without bumping it strands
// every engineer on the old version, served from cache, with no way to tell.
//
// ⚠ The prefix is 'scan-', not 'pat-'. Different lineage from PATGo entirely.
const CACHE_VERSION = 'scan-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './state.js',
  './utils.js',
  './storage.js',
  './log.js',
  './feedback.js',
  './scanner.js',
  './csv.js',
  './backup.js',
  './bugreport.js',
  './render.js',
  './dispatch.js',
  './boot.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS))
    // NO skipWaiting() here, deliberately. With it, every update activates
    // immediately and the controllerchange listener in boot.js reloads the
    // page — so an engineer mid-scan would have the app reload under them. The
    // update banner exists precisely so THEY choose the moment. Waiting is the
    // correct behaviour.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// The page posts this when the engineer taps "Update now" on the banner. We
// then activate, which fires controllerchange in the page, which reloads it.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
