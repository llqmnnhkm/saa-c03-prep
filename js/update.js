// App updates.
// The service worker file changes on every deploy (the workflow stamps a new
// build id into it), so the browser installs the new version in the
// background. We show a "Reload" banner as soon as it is ready, and also
// check whenever the app comes back to the foreground — iOS keeps home-screen
// apps suspended instead of reloading them, so this is what picks up changes.

let reg = null;
let wantReload = false;
let notify = () => {};

export const supported = 'serviceWorker' in navigator && location.protocol !== 'file:';

export function initUpdates(onAvailable) {
  notify = onAvailable;
  if (!supported) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (wantReload) location.reload();
  });

  navigator.serviceWorker.register('sw.js').then(r => {
    reg = r;
    if (r.waiting && navigator.serviceWorker.controller) notify();
    r.addEventListener('updatefound', () => watch(r.installing));
  }).catch(() => {});

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg?.update().catch(() => {});
  });
  setInterval(() => reg?.update().catch(() => {}), 30 * 60 * 1000);
}

function watch(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) notify();
  });
}

function waitForInstall(worker) {
  return new Promise(resolve => {
    if (!worker || worker.state === 'installed' || worker.state === 'redundant') return resolve();
    const t = setTimeout(resolve, 15000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'redundant' || worker.state === 'activated') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

// 'available' | 'latest' | 'offline' | 'unsupported'
export async function checkForUpdate() {
  if (!supported || !reg) return 'unsupported';
  if (!navigator.onLine) return 'offline';
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  if (reg.installing) await waitForInstall(reg.installing);
  return reg.waiting ? 'available' : 'latest';
}

export function applyUpdate() {
  if (reg?.waiting) {
    wantReload = true;
    reg.waiting.postMessage('skip-waiting');
    // Fallback in case controllerchange never fires.
    setTimeout(() => location.reload(), 4000);
  } else {
    hardReload();
  }
}

// Clears cached files and reloads from the network.
export async function hardReload() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch { /* ignore */ }
  if (reg?.waiting) {
    wantReload = true;
    reg.waiting.postMessage('skip-waiting');
    setTimeout(() => location.reload(), 3000);
    return;
  }
  location.reload();
}
