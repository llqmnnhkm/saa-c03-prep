import { store } from './store.js';
import { icon } from './icons.js';
import { enhanceScrollers, disposeScrollers, initChrome, applyTheme, showToast, hideToast } from './ui.js';
import { initUpdates, applyUpdate } from './update.js';
import * as Home from './views/home.js';
import * as Practice from './views/practice.js';
import * as Exam from './views/exam.js';
import * as Labs from './views/labs.js';
import * as Learn from './views/learn.js';
import * as Cards from './views/cards.js';

// [pattern, view, tab, focused-flow?]
const routes = [
  [/^\/$/, Home.render, 'home'],
  [/^\/practice$/, Practice.setup, 'practice'],
  [/^\/practice\/run$/, Practice.run, 'practice', true],
  [/^\/exam$/, Exam.setup, 'exam'],
  [/^\/exam\/run$/, Exam.run, 'exam', true],
  [/^\/exam\/result\/([\w-]+)$/, Exam.result, 'exam'],
  [/^\/labs$/, Labs.list, 'labs'],
  [/^\/labs\/([\w-]+)$/, Labs.run, 'labs', true],
  [/^\/learn$/, Learn.list, 'learn'],
  [/^\/cards$/, Cards.setup, 'learn'],
  [/^\/cards\/run$/, Cards.run, 'learn', true],
  [/^\/learn\/compare\/([\w-]+)$/, Learn.compare, 'learn'],
  [/^\/learn\/visual\/([\w-]+)$/, Learn.visual, 'learn'],
  [/^\/learn\/([\w-]+)$/, Learn.service, 'learn'],
];

const $ = sel => document.querySelector(sel);
const view = $('#view');
const dock = $('#dock');
const titleEl = $('#title');
const backBtn = $('#back');
const rightEl = $('#right');
const appbar = $('.appbar');
const tabbar = $('.tabbar');

document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon, 24); });

const chrome = initChrome({ bar: $('#page-progress'), fade: $('#page-fade'), tabbar, dock, view });

let handlers = {};
let cleanup = null;
let largeTitle = '';
let backAction = null;
const stack = [];

const ctx = {
  view,
  render(html) {
    disposeScrollers(view);
    view.innerHTML = (largeTitle ? `<div class="wrap"><h1 class="large-title">${largeTitle}</h1></div>` : '') + html;
    enhanceScrollers(view);
    chrome.update();
  },
  enhance(el) {
    enhanceScrollers(el);
    chrome.update();
  },
  header({ title = '', large = '', back = null, right = '' } = {}) {
    titleEl.textContent = title;
    largeTitle = large;
    appbar.classList.toggle('is-large', !!large);
    backAction = back;
    backBtn.hidden = !back;
    if (back) {
      const isX = typeof back === 'object' && back.icon === 'x';
      backBtn.innerHTML = icon(isX ? 'x' : 'chevron-left', 26);
      backBtn.setAttribute('aria-label', isX ? back.label || 'Close' : 'Back');
    }
    rightEl.innerHTML = right;
  },
  dock(html = '') {
    disposeScrollers(dock);
    dock.innerHTML = html;
    enhanceScrollers(dock);
    chrome.update();
  },
  on(type, fn) { handlers[type] = fn; },
  go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
};

backBtn.addEventListener('click', () => {
  const b = backAction;
  if (!b) return;
  if (typeof b === 'string') return ctx.go(b);
  if (b.fn) return b.fn();
  if (b.fallback) {
    if (stack.length > 1) history.back();
    else ctx.go(b.fallback);
  }
});

['click', 'input', 'change', 'keydown'].forEach(type => {
  [view, dock].forEach(el => el.addEventListener(type, e => handlers[type]?.(e)));
});

function track(hash) {
  if (stack.length > 1 && stack[stack.length - 2] === hash) stack.pop();
  else if (stack[stack.length - 1] !== hash) stack.push(hash);
  if (stack.length > 50) stack.shift();
}

function route() {
  const hash = location.hash || '#/';
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  let found = null;
  for (const r of routes) {
    const m = path.match(r[0]);
    if (m) { found = { r, m }; break; }
  }
  if (!found) { location.replace('#/'); return; }
  track(hash);

  const [, viewFn, tab, focused] = found.r;
  try { cleanup?.(); } catch { /* ignore */ }
  cleanup = null;
  handlers = {};
  document.body.classList.toggle('is-run', !!focused);
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  ctx.header({});
  ctx.dock('');
  window.scrollTo(0, 0);
  try {
    const ret = viewFn(ctx, { params: found.m.slice(1) });
    if (typeof ret === 'function') cleanup = ret;
  } catch (err) {
    console.error(err);
    ctx.header({ title: 'Something went wrong', back: '#/' });
    ctx.render(`<div class="wrap"><div class="card empty"><b>This screen failed to load.</b>Try reloading the app from Home → Settings.</div></div>`);
  }
  view.focus({ preventScroll: true });
}

applyTheme(store.state.settings.theme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(store.state.settings.theme));

window.addEventListener('hashchange', route);
route();

initUpdates(() => {
  showToast({
    title: 'Update available',
    body: 'Reload to get the latest version.',
    action: 'Reload',
    onAction: () => { hideToast(); applyUpdate(); },
  });
});
