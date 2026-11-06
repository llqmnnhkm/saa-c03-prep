import { icon } from './icons.js';
import { esc } from './util.js';

/* --------------------------------------------------------------------------
   Scroll indicators
   Any element with data-scroll="x" or data-scroll="y" gets wrapped with
   edge fades (only on the side that has more content) and a thin track
   showing position and size. iOS hides native scrollbars, so this is what
   tells you a row or panel scrolls.
   Options: data-fade="end" (no start fade, e.g. tables with a sticky column),
            data-bleed (horizontal row runs edge to edge on phones).
   -------------------------------------------------------------------------- */

const live = new Set();

export function enhanceScrollers(root = document) {
  root.querySelectorAll('[data-scroll]').forEach(vp => {
    if (vp.dataset.enhanced) return;
    vp.dataset.enhanced = '1';
    const axis = vp.dataset.scroll === 'y' ? 'y' : 'x';
    const x = axis === 'x';
    const wrap = document.createElement('div');
    wrap.className = `sc sc-${axis}` + ('bleed' in vp.dataset ? ' bleed' : '');
    vp.parentNode.insertBefore(wrap, vp);
    wrap.appendChild(vp);
    vp.classList.add('sc-vp');

    const track = document.createElement('div');
    track.className = 'sc-track';
    track.setAttribute('aria-hidden', 'true');
    const thumb = document.createElement('div');
    thumb.className = 'sc-thumb';
    track.appendChild(thumb);
    wrap.appendChild(track);

    const fadeStart = vp.dataset.fade !== 'end';
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!vp.isConnected) return;
      const size = x ? vp.clientWidth : vp.clientHeight;
      const full = x ? vp.scrollWidth : vp.scrollHeight;
      const pos = x ? vp.scrollLeft : vp.scrollTop;
      const max = full - size;
      const over = max > 2;
      wrap.dataset.overflow = String(over);
      if (!over) {
        vp.style.setProperty('--fs', '0px');
        vp.style.setProperty('--fe', '0px');
        return;
      }
      const t = Math.min(1, Math.max(0, pos / max));
      const trackLen = x ? track.clientWidth : track.clientHeight;
      const thumbLen = Math.max(28, trackLen * (size / full));
      const offset = (trackLen - thumbLen) * t;
      thumb.style[x ? 'width' : 'height'] = thumbLen + 'px';
      thumb.style.transform = x ? `translateX(${offset}px)` : `translateY(${offset}px)`;
      vp.style.setProperty('--fs', fadeStart && pos > 2 ? '28px' : '0px');
      vp.style.setProperty('--fe', pos < max - 2 ? '32px' : '0px');
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

    vp.addEventListener('scroll', schedule, { passive: true });
    if (x) {
      // Mouse wheels scroll horizontal rows sideways on desktop.
      vp.addEventListener('wheel', e => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        const before = vp.scrollLeft;
        vp.scrollLeft += e.deltaY;
        if (vp.scrollLeft !== before) e.preventDefault();
      }, { passive: false });
    }
    const ro = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
    if (ro) {
      ro.observe(vp);
      [...vp.children].forEach(c => ro.observe(c));
    }
    const entry = { wrap, ro };
    live.add(entry);
    update();
  });
}

export function disposeScrollers(root) {
  for (const entry of live) {
    if (!root || root.contains(entry.wrap) || !entry.wrap.isConnected) {
      entry.ro?.disconnect();
      live.delete(entry);
    }
  }
}

/* --------------------------------------------------------------------------
   Page chrome: scroll progress under the app bar, a bottom fade while
   there is more page below, and the dock height variable.
   -------------------------------------------------------------------------- */

export function initChrome({ bar, fade, tabbar, dock, view }) {
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    const over = max > 8;
    bar.parentElement.dataset.overflow = String(over);
    bar.style.transform = `scaleX(${over ? Math.min(1, Math.max(0, y / max)) : 0})`;
    document.body.classList.toggle('scrolled', y > 4);
    document.body.classList.toggle('past-title', y > 40);
    const dockH = dock.childElementCount ? dock.offsetHeight : 0;
    const tabH = getComputedStyle(tabbar).display === 'none' ? 0 : tabbar.offsetHeight;
    document.documentElement.style.setProperty('--dock-h', dockH + 'px');
    fade.style.bottom = tabH + dockH + 'px';
    fade.classList.toggle('on', over && y < max - 12);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(schedule);
    ro.observe(view);
    ro.observe(dock);
  }
  return { update: schedule };
}

/* --------------------------------------------------------------------------
   Theme
   -------------------------------------------------------------------------- */

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#0c0e12' : '#f3f4f6'));
}

/* --------------------------------------------------------------------------
   Overlays: confirm dialog, bottom sheet, lightbox, toast
   -------------------------------------------------------------------------- */

const lock = on => document.documentElement.classList.toggle('lock', on);

export function confirmDialog({ title, body = '', confirm = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="modal-t" aria-describedby="modal-b">
        <h2 id="modal-t">${esc(title)}</h2>
        <p id="modal-b">${body}</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-r="0">${esc(cancel)}</button>
          <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(confirm)}</button>
        </div>
      </div>`;
    const done = r => {
      document.removeEventListener('keydown', onKey);
      el.classList.add('out');
      setTimeout(() => { el.remove(); lock(false); }, 150);
      resolve(r);
    };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1');
      else if (e.target === el) done(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    lock(true);
    el.querySelector('[data-r="1"]').focus();
  });
}

export function openSheet({ title, html, onClick }) {
  const el = document.createElement('div');
  el.className = 'sheet-backdrop';
  el.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x', 22)}</button></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    disposeScrollers(el);
    el.classList.add('out');
    setTimeout(() => { el.remove(); lock(false); }, 160);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => {
    if (e.target === el || e.target.closest('[data-close]')) return close();
    onClick?.(e, close);
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  lock(true);
  enhanceScrollers(el);
  el.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
  return close;
}

export function openLightbox(src, alt = '') {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', alt || 'Screenshot');
  el.innerHTML = `<img src="${esc(src)}" alt="${esc(alt)}"><button type="button" class="icon-btn" aria-label="Close">${icon('x', 22)}</button>`;
  const close = () => { el.remove(); lock(false); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => { if (e.target.tagName !== 'IMG') close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  lock(true);
}

let toastEl = null;
export function showToast({ title, body = '', action, onAction, onClose }) {
  hideToast();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="toast-msg"><b>${esc(title)}</b>${body ? esc(body) : ''}</div>
    ${action ? `<button type="button" class="btn" data-toast="act">${esc(action)}</button>` : ''}
    <button type="button" class="icon-btn" data-toast="close" aria-label="Dismiss">${icon('x', 18)}</button>`;
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-toast]');
    if (!t) return;
    if (t.dataset.toast === 'act') onAction?.();
    else { hideToast(); onClose?.(); }
  });
  document.body.appendChild(el);
  toastEl = el;
}
export function hideToast() {
  if (!toastEl) return;
  const el = toastEl;
  toastEl = null;
  el.classList.add('out');
  setTimeout(() => el.remove(), 160);
}
