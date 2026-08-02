// service-worker.js
//
// Caches the app shell (and the third-party document readers) so Word Wall
// keeps working with no network connection once it has loaded successfully
// at least once. Your vocabulary data itself lives in IndexedDB, not here,
// so it is unaffected by cache updates.

const CACHE_NAME = 'word-wall-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/parsers.js',
  './js/extraction.js',
  './js/enrichment.js',
  './js/ui.js',
  './js/data/core-vocab.js',
  './icons/icon.svg',
  'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Translation and dictionary lookups must always hit the network live.
  if (request.url.includes('mymemory.translated.net') || request.url.includes('dictionaryapi.dev')) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
