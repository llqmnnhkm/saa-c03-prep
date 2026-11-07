// Flashcards built from the service notes in Learn:
//  - fill the blank: an "Exam must-know" with its bold term hidden
//  - which service: a must-know or a "Pick it when" line with the service name hidden
// Tap a card to flip it, then mark it Got it or Again (or swipe right / left).
// Cards marked Again come back later in the same session.
import { store, recordCard } from '../store.js';
import { icon } from '../icons.js';
import { esc, md, shuffle, plural, pct } from '../util.js';
import { SERVICES, CATEGORIES, plainName } from '../../data/services.js';

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLANK = '\u0000';

// Hide the service’s own names in a sentence so the answer isn’t on the card.
function maskService(text, s) {
  const names = [...new Set([s.name, plainName(s), s.short, s.name.replace(/^(Amazon|AWS) /, '')])]
    .filter(n => n && n.length > 1)
    .sort((a, b) => b.length - a.length);
  return text.replace(new RegExp(`\\b(${names.map(reEsc).join('|')})\\b`, 'g'), 'this service');
}

let deckCache = null;
export function deck() {
  if (deckCache) return deckCache;
  const cards = [];
  SERVICES.forEach(s => {
    s.must.forEach((m, i) => {
      const bold = m.match(/\*\*(.+?)\*\*/);
      if (bold) cards.push({ id: `${s.id}:m${i}`, kind: 'blank', svc: s, text: m, term: bold[1] });
      else cards.push({ id: `${s.id}:m${i}`, kind: 'which', svc: s, text: m });
    });
    s.use.forEach((u, i) => cards.push({ id: `${s.id}:u${i}`, kind: 'use', svc: s, text: u }));
  });
  deckCache = cards;
  return cards;
}
const byId = id => deck().find(c => c.id === id);

const DEFAULTS = { kind: 'all', cats: [], count: 20 };
const getFilters = () => ({ ...DEFAULTS, ...(store.state.settings.cardFilters || {}) });

function matching(f) {
  return deck().filter(c =>
    (f.kind === 'all' || (f.kind === 'blank' ? c.kind === 'blank' : c.kind !== 'blank')) &&
    (!f.cats.length || f.cats.includes(c.svc.cat)));
}

// Cards you got wrong last time first, then ones you haven’t seen, then the rest.
function pick(list, n) {
  const seen = store.state.cards;
  const rank = c => (!seen[c.id] ? 1 : seen[c.id].last === false ? 0 : 2);
  return shuffle(list)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, n);
}

// The session lives in memory: it’s short, and a reload just starts a new one.
let session = null;

function start(ctx, ids) {
  session = { queue: ids.slice(), total: ids.length, i: 0, flipped: false, again: {}, firstTry: 0, done: [] };
  ctx.go('#/cards/run');
}

/* ---------------------------------------------------------------- setup -- */

export function setup(ctx) {
  ctx.header({ title: 'Flashcards', large: 'Flashcards', back: { fallback: '#/learn' } });
  const f = getFilters();
  const seen = store.state.cards;
  const all = deck();
  const learned = all.filter(c => seen[c.id]?.last === true).length;
  const shaky = all.filter(c => seen[c.id]?.last === false).length;

  ctx.render(`<div class="wrap stack">
    <p class="lede">Short recall drills built from the exam must-knows in Learn. Tap a card to see the answer, then mark whether you knew it.</p>

    <div class="tiles">
      <div class="tile"><b>${learned}<small class="muted" style="font-size:14px;font-weight:600"> / ${all.length}</small></b><span>cards you knew last time</span></div>
      <div class="tile"><b>${shaky}</b><span>cards to go over again</span></div>
    </div>

    <section>
      <h2 class="label">Card type</h2>
      <div class="seg" role="group" aria-label="Card type">
        ${[['all', 'Both'], ['blank', 'Fill the blank'], ['which', 'Which service?']].map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${f.kind === k}">${l}</button>`).join('')}
      </div>
    </section>

    <section>
      <h2 class="label">Topics <span class="label-note">optional · swipe for more</span></h2>
      <div class="chips" data-scroll="x" data-bleed>
        <button type="button" class="chip" data-cat="all" aria-pressed="${!f.cats.length}">All topics</button>
        ${CATEGORIES.map(c => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${f.cats.includes(c.id)}"><i class="dot" style="--c:var(--cat-${c.id})"></i>${esc(c.name)}</button>`).join('')}
      </div>
    </section>

    <section>
      <h2 class="label">Session length</h2>
      <div class="seg" role="group" aria-label="Session length">
        ${[10, 20, 40].map(n => `<button type="button" data-count="${n}" aria-pressed="${f.count === n}">${n} cards</button>`).join('')}
      </div>
      <p class="small muted" style="margin-top:10px">Cards you missed last time come first, then ones you haven’t seen.</p>
    </section>
  </div>`);

  const sync = () => {
    const v = ctx.view;
    v.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', b.dataset.kind === f.kind));
    v.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === 'all' ? !f.cats.length : f.cats.includes(b.dataset.cat)));
    v.querySelectorAll('[data-count]').forEach(b => b.setAttribute('aria-pressed', String(f.count) === b.dataset.count));
    const take = Math.min(matching(f).length, f.count);
    ctx.dock(`<button type="button" class="btn primary block" data-act="start" ${take ? '' : 'disabled'}>${take ? `${icon('play', 18)} Start · ${plural(take, 'card')}` : 'No cards match'}</button>`);
    store.update(s => { s.settings.cardFilters = f; });
  };
  sync();

  ctx.on('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.kind) f.kind = d.kind;
    else if (d.cat) f.cats = d.cat === 'all' ? [] : (f.cats.includes(d.cat) ? f.cats.filter(x => x !== d.cat) : [...f.cats, d.cat]);
    else if (d.count) f.count = +d.count;
    else if (d.act === 'start') { start(ctx, pick(matching(f), f.count).map(c => c.id)); return; }
    else return;
    sync();
  });
}

/* ------------------------------------------------------------------ run -- */

export function frontHTML(c) {
  if (c.kind === 'blank') {
    const re = new RegExp(`\\*\\*${reEsc(c.term)}\\*\\*|\\b${reEsc(c.term)}\\b`, 'gi');
    const html = md(maskService(c.text.replace(re, BLANK), c.svc)).split(BLANK).join('<span class="blank" aria-label="blank">?</span>');
    return `<div class="fc-k">${esc(c.svc.name)} · fill the blank</div><p class="fc-q">${html}</p>`;
  }
  const lead = c.kind === 'use' ? 'Which service would you pick for this?' : 'Which service is this about?';
  return `<div class="fc-k">${lead}</div><p class="fc-q">${md(maskService(c.text, c.svc))}</p>`;
}

function backHTML(c) {
  const svc = `<a class="fc-svc" href="#/learn/${c.svc.id}"><span class="mono" style="--c:var(--cat-${c.svc.cat})" aria-hidden="true">${esc(c.svc.short)}</span><span><b>${esc(c.svc.name)}</b><small>${esc(c.svc.one)}</small></span>${icon('chevron-right', 18)}</a>`;
  if (c.kind === 'blank') return `<div class="fc-k">Answer</div><p class="fc-a">${md(c.term)}</p><p class="fc-full">${md(c.text)}</p>${svc}`;
  return `<div class="fc-k">Answer</div>${svc}<p class="fc-full">${md(c.text)}</p>`;
}

export function run(ctx) {
  if (!session) { ctx.go('#/cards'); return; }
  const s = session;

  const quit = () => { session = null; ctx.go('#/cards'); };
  // A swipe ends with a click on whatever is now under the finger; ignore it.
  let swipedAt = 0;

  const draw = () => (s.i >= s.queue.length ? summary() : card());

  function mark(ok) {
    const id = s.queue[s.i];
    recordCard(id, ok);
    store.save();
    if (ok) {
      if (!s.again[id]) s.firstTry += 1;
      s.done.push(id);
    } else {
      s.again[id] = (s.again[id] || 0) + 1;
      // Bring it back a few cards later.
      s.queue.splice(Math.min(s.queue.length, s.i + 4), 0, id);
    }
    s.i += 1;
    s.flipped = false;
    draw();
  }

  function card() {
    const c = byId(s.queue[s.i]);
    if (!c) { s.i += 1; draw(); return; }
    const left = s.queue.length - s.i;
    const repeats = s.queue.length - s.total;
    ctx.header({ title: `Card ${Math.min(s.done.length + 1, s.total)} of ${s.total}`, back: { icon: 'x', label: 'End session', fn: () => (s.done.length ? (s.i = s.queue.length, draw()) : quit()) } });
    ctx.render(`<div class="wrap fc-wrap">
      <div class="qprog">
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.done.length}"><span style="width:${pct(s.done.length, s.total)}%"></span></div>
        <span class="qprog-txt">${left} left${repeats ? ` · ${plural(repeats, 'repeat')}` : ''}</span>
      </div>
      <div class="fc ${s.flipped ? 'is-flipped' : ''}" data-act="flip" role="button" tabindex="0" aria-label="${s.flipped ? 'Answer side' : 'Question side. Tap to show the answer'}">
        <div class="fc-inner">
          <div class="fc-face fc-front" ${s.flipped ? 'aria-hidden="true"' : ''}>${frontHTML(c)}<span class="fc-hint">${icon('refresh', 14)} Tap to flip</span></div>
          <div class="fc-face fc-back" ${s.flipped ? '' : 'aria-hidden="true"'}>${backHTML(c)}</div>
        </div>
      </div>
      ${s.flipped ? `<p class="fc-swipe">Swipe right if you knew it, left to see it again</p>` : ''}
    </div>`);
    ctx.dock(s.flipped
      ? `<div class="dock-row">
          <button type="button" class="btn grow" data-act="again">${icon('refresh', 18)} Again</button>
          <button type="button" class="btn primary grow" data-act="got">${icon('check', 18)} Got it</button>
        </div>`
      : `<button type="button" class="btn primary block" data-act="flip">Show answer</button>`);
    if (s.flipped) bindSwipe(ctx.view.querySelector('.fc'));
  }

  // Horizontal swipe on the answer side. Vertical movement is left to the page.
  function bindSwipe(el) {
    let x0 = null, y0 = 0, dx = 0, locked = null;
    el.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; dx = 0; locked = null; });
    el.addEventListener('pointermove', e => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (locked == null && Math.abs(dx) + Math.abs(dy) > 8) locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (locked !== 'x') return;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
      el.classList.toggle('swipe-ok', dx > 60);
      el.classList.toggle('swipe-again', dx < -60);
    });
    const end = () => {
      if (x0 == null) return;
      const moved = locked === 'x' ? dx : 0;
      x0 = null;
      el.style.transform = '';
      el.classList.remove('swipe-ok', 'swipe-again');
      if (Math.abs(moved) > 90) { swipedAt = Date.now(); mark(moved > 0); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { x0 = null; el.style.transform = ''; el.classList.remove('swipe-ok', 'swipe-again'); });
  }

  function summary() {
    const shaky = Object.keys(s.again).map(byId).filter(Boolean);
    const p = pct(s.firstTry, s.done.length || 1);
    ctx.header({ title: 'Session done', back: { icon: 'x', label: 'Close', fn: quit } });
    ctx.render(`<div class="wrap stack">
      <section class="card score">
        <div class="score-top">
          <div><div class="score-num">${s.firstTry}<span> / ${s.done.length}</span></div>
          <div class="score-pct">known on the first try (${p}%)</div></div>
        </div>
        <div class="meter"><span class="${p >= 80 ? 'ok' : ''}" style="width:${p}%"></span></div>
      </section>
      ${shaky.length ? `<section>
        <h2 class="label">Took more than one go</h2>
        <div class="list">${shaky.map(c => `<a class="row" href="#/learn/${c.svc.id}">
          <span class="mono" style="--c:var(--cat-${c.svc.cat})" aria-hidden="true">${esc(c.svc.short)}</span>
          <span class="row-main"><span class="row-title">${esc(c.svc.name)}</span><span class="row-sub">${md(c.text)}</span></span>
          <span class="chev">${icon('chevron-right', 18)}</span></a>`).join('')}</div>
      </section>` : `<div class="card empty"><b>Every card on the first try</b>Nice. Try a longer session or another topic.</div>`}
    </div>`);
    ctx.dock(`<div class="dock-row">
      ${shaky.length ? `<button type="button" class="btn grow" data-act="redo">${icon('refresh', 18)}<span class="btn-label">Redo ${shaky.length} tricky</span></button>` : ''}
      <button type="button" class="btn primary grow" data-act="more">New session</button>
    </div>`);
  }

  ctx.on('click', e => {
    if (Date.now() - swipedAt < 500 || e.target.closest('a')) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'flip') { s.flipped = !s.flipped; draw(); }
    else if (act === 'got') mark(true);
    else if (act === 'again') mark(false);
    else if (act === 'redo') start(ctx, Object.keys(s.again));
    else if (act === 'more') { session = null; ctx.go('#/cards'); }
  });
  ctx.on('keydown', e => {
    if (s.i >= s.queue.length) return;
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('.fc')) { e.preventDefault(); s.flipped = !s.flipped; draw(); ctx.view.querySelector('.fc')?.focus(); }
    else if (s.flipped && e.key === 'ArrowRight') mark(true);
    else if (s.flipped && e.key === 'ArrowLeft') mark(false);
  });

  draw();
}
