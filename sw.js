// Service worker: offline support + update detection.
// BUILD is stamped by the deploy workflow, so every deploy changes this file.
// The browser then installs the new worker in the background and the page
// shows an "Update available" banner. Nothing switches until you tap Reload.

const BUILD = '__BUILD__';
const CACHE = `saa-prep-${BUILD}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/icons.js',
  'js/util.js',
  'js/store.js',
  'js/ui.js',
  'js/update.js',
  'js/version.js',
  'js/quiz.js',
  'js/views/home.js',
  'js/views/practice.js',
  'js/views/exam.js',
  'js/views/labs.js',
  'js/views/learn.js',
  'data/questions.js',
  'data/services.js',
  'data/labs.js',
  'data/diagrams.js',
  'assets/diagrams/vpc-layout.svg',
  'assets/diagrams/sg-nacl.svg',
  'assets/diagrams/load-balancers.svg',
  'assets/diagrams/s3-classes.svg',
  'assets/diagrams/messaging.svg',
  'assets/diagrams/dr-strategies.svg',
  'assets/icons/icon.svg',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('saa-prep-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));

// Network first (always fresh when online), cache as fallback (works offline).
// If the network is very slow, fall back to the cached copy after 4 s.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const navigate = req.mode === 'navigate';
  const key = navigate ? new URL('index.html', self.registration.scope).href : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(navigate ? req.url : req, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        if (res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      });

    if (!cached) {
      try { return await network; } catch { return Response.error(); }
    }
    return Promise.race([
      network.catch(() => cached),
      timeout(4000).then(() => cached),
    ]);
  })());
});
