import { icon } from '../icons.js';
import { esc, md, plural } from '../util.js';
import { SERVICES, CATEGORIES, COMPARISONS, svcById, plainName } from '../../data/services.js';
import { QUESTIONS } from '../../data/questions.js';
import { LABS } from '../../data/labs.js';
import { DIAGRAMS, diagramById } from '../../data/diagrams.js';
import { openDiagram } from '../ui.js';
import { startPractice } from './practice.js';

// Remembered while the app is open, so going back keeps your search.
let query = '';
let cat = 'all';

const qCount = id => QUESTIONS.filter(q => q.services.includes(id)).length;

export function flowHTML(nodes = []) {
  if (!nodes.length) return '';
  return `<div class="flow" role="list">${nodes.map((n, i) => {
    const [title, sub] = n.split('|');
    const hl = title.startsWith('*');
    return `${i ? `<span class="flow-arrow" aria-hidden="true">${icon('arrow-down', 18)}</span>` : ''}<div class="flow-node${hl ? ' hl' : ''}" role="listitem">${esc(hl ? title.slice(1) : title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  }).join('')}</div>`;
}

export function tableHTML(t) {
  return `<div class="card tbl-card">
    <div data-scroll="x" data-fade="end">
      <table class="tbl${t.cols.length <= 2 ? ' cols-2' : ''}">
        <thead><tr>${t.cols.map(c => `<th scope="col">${md(c)}</th>`).join('')}</tr></thead>
        <tbody>${t.rows.map(r => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${md(c)}</th>` : `<td>${md(c)}</td>`)).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="scroll-hint">${icon('arrows-x', 14)} Swipe sideways to see every column</p>
  </div>`;
}

/* ------------------------------------------------------------ diagrams -- */

// Infographic block. The SVG is fetched after render (see loadDiagrams) into
// a box that already has the right shape, so the page doesn't jump.
export function diagramHTML(d, { heading = true } = {}) {
  return `<section>
    ${heading ? `<h2 class="label">${esc(d.title)}</h2>` : ''}
    <figure class="ig-fig">
      ${heading ? `<figcaption>${esc(d.blurb)}</figcaption>` : ''}
      <button type="button" class="ig" data-ig="${d.id}" aria-label="${esc(d.title)}: open full screen" style="aspect-ratio: 390 / ${d.h}"></button>
      <p class="scroll-hint">${icon('expand', 14)} Tap the diagram to open it full screen</p>
    </figure>
  </section>`;
}

const svgCache = new Map();
const getSvg = id => {
  if (!svgCache.has(id)) {
    svgCache.set(id, fetch(`assets/diagrams/${id}.svg`).then(r => {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).catch(e => { svgCache.delete(id); throw e; }));
  }
  return svgCache.get(id);
};

function loadDiagrams(root) {
  root.querySelectorAll('[data-ig]').forEach(async el => {
    try {
      el.innerHTML = await getSvg(el.dataset.ig);
      el.classList.add('is-ready');
    } catch {
      el.classList.add('is-failed');
      el.innerHTML = `<span class="ig-fail">${icon('alert', 20)}Couldn’t load this diagram. It will show once you’re back online.</span>`;
    }
  });
}

// Returns true when the click opened a diagram.
function diagramClick(e) {
  const el = e.target.closest('[data-ig].is-ready');
  if (!el) return false;
  const d = diagramById(el.dataset.ig);
  getSvg(d.id).then(svg => openDiagram(svg, d.title));
  return true;
}

const diagramsFor = ({ service, compare }) => DIAGRAMS.filter(d => (service && d.services.includes(service)) || (compare && d.compares.includes(compare)));
const diagramCats = d => [...new Set(d.services.map(svcById).filter(Boolean).map(s => s.cat))];
const visualCard = d => `<a class="cmp-card" href="#/learn/visual/${d.id}">${icon('diagram', 20)}<b>${esc(d.title)}</b><span>${esc(d.blurb)}</span></a>`;

const svcRow = s => {
  const n = qCount(s.id);
  return `<a class="row" href="#/learn/${s.id}">
    <span class="mono" style="--c:var(--cat-${s.cat})" aria-hidden="true">${esc(s.short)}</span>
    <span class="row-main"><span class="row-title">${esc(s.name)}</span><span class="row-sub">${esc(s.one)}</span></span>
    ${n ? `<span class="count" title="Practice questions">${n} Q</span>` : ''}
    <span class="chev">${icon('chevron-right', 18)}</span>
  </a>`;
};

const cmpCard = c => `<a class="cmp-card" href="#/learn/compare/${c.id}">${icon('columns', 20)}<b>${esc(c.title)}</b><span>${esc(c.blurb)}</span></a>`;

/* ----------------------------------------------------------------- list -- */

export function list(ctx) {
  ctx.header({ title: 'Learn', large: 'Learn' });
  ctx.render(`<div class="wrap stack">
    <div class="search">
      ${icon('search', 20)}
      <input type="search" id="learn-q" placeholder="Search, e.g. NAT, Glacier, FIFO" value="${esc(query)}" aria-label="Search services" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
      <button type="button" class="icon-btn search-clear" data-act="clear" aria-label="Clear search" ${query ? '' : 'hidden'}>${icon('x', 18)}</button>
    </div>
    <div class="chips" data-scroll="x" data-bleed role="group" aria-label="Categories">
      <button type="button" class="chip" data-cat="all" aria-pressed="${cat === 'all'}">All</button>
      ${CATEGORIES.map(c => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${cat === c.id}"><i class="dot" style="--c:var(--cat-${c.id})"></i>${esc(c.name)}</button>`).join('')}
    </div>
    <div id="learn-results" class="stack"></div>
  </div>`);

  const results = ctx.view.querySelector('#learn-results');
  const draw = () => {
    const q = query.trim().toLowerCase();
    const match = s => !q || [s.name, s.short, s.one, s.keywords || '', s.about].join(' ').toLowerCase().includes(q);
    const svcs = SERVICES.filter(s => (cat === 'all' || s.cat === cat) && match(s));
    const cmps = COMPARISONS.filter(c => (cat === 'all' || c.cats.includes(cat)) && (!q || (c.title + ' ' + c.blurb + ' ' + (c.keywords || '')).toLowerCase().includes(q)));
    const groups = CATEGORIES.map(c => ({ c, items: svcs.filter(s => s.cat === c.id) })).filter(g => g.items.length);
    const visuals = DIAGRAMS.filter(d => (cat === 'all' || diagramCats(d).includes(cat)) && (!q || [d.title, d.topic, d.blurb, ...d.services.map(id => svcById(id)?.name || '')].join(' ').toLowerCase().includes(q)));

    results.innerHTML = `
      ${!q ? `<div class="list"><a class="row" href="#/cards">${icon('cards', 20)}<span class="row-main"><span class="row-title">Flashcards</span><span class="row-sub">Quick recall drills built from these notes</span></span><span class="chev">${icon('chevron-right', 18)}</span></a></div>` : ''}
      ${visuals.length ? `<section>
        <h2 class="label">Visual guides <span class="label-note">swipe</span></h2>
        <div class="cmp-cards" data-scroll="x" data-bleed>${visuals.map(visualCard).join('')}</div>
      </section>` : ''}
      ${cmps.length ? `<section>
        <h2 class="label">Side-by-side comparisons <span class="label-note">swipe</span></h2>
        <div class="cmp-cards" data-scroll="x" data-bleed>${cmps.map(cmpCard).join('')}</div>
      </section>` : ''}
      ${groups.map(g => `<section><h2 class="label">${esc(g.c.name)} <span class="label-note">${g.items.length}</span></h2><div class="list">${g.items.map(svcRow).join('')}</div></section>`).join('')}
      ${!groups.length && !cmps.length && !visuals.length ? `<div class="card empty"><b>No matches for “${esc(query)}”</b>Try a service name like “Aurora” or a topic like “encryption”.</div>` : ''}`;
    ctx.enhance(results);
  };
  draw();

  ctx.on('input', e => {
    if (e.target.id !== 'learn-q') return;
    query = e.target.value;
    ctx.view.querySelector('[data-act="clear"]').hidden = !query;
    draw();
  });
  ctx.on('click', e => {
    const c = e.target.closest('[data-cat]');
    if (c) {
      cat = c.dataset.cat;
      ctx.view.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b === c));
      draw();
      return;
    }
    if (e.target.closest('[data-act="clear"]')) {
      query = '';
      const input = ctx.view.querySelector('#learn-q');
      input.value = '';
      e.target.closest('[data-act="clear"]').hidden = true;
      input.focus();
      draw();
    }
  });
}

/* -------------------------------------------------------------- service -- */

export function service(ctx, { params: [id] }) {
  const s = svcById(id);
  if (!s) { ctx.go('#/learn'); return; }
  const category = CATEGORIES.find(c => c.id === s.cat);
  const qs = QUESTIONS.filter(q => q.services.includes(id));
  const labs = LABS.filter(l => l.services.includes(id));
  const cmps = COMPARISONS.filter(c => c.services.includes(id));
  ctx.header({ title: s.name, back: { fallback: '#/learn' } });

  ctx.render(`<div class="wrap stack">
    <header class="svc-hero">
      <span class="mono lg" style="--c:var(--cat-${s.cat})" aria-hidden="true">${esc(s.short)}</span>
      <div><div class="eyebrow">${esc(category ? category.name : '')}</div><h1 class="svc-name">${esc(s.name)}</h1><p class="svc-one">${esc(s.one)}</p></div>
    </header>

    ${s.stats?.length ? `<section><h2 class="label">At a glance</h2><div class="tiles">${s.stats.map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div></section>` : ''}

    <section><h2 class="label">What it is</h2><div class="card prose"><p>${md(s.about)}</p></div></section>

    ${diagramsFor({ service: id }).map(d => diagramHTML(d)).join('')}

    ${s.flow ? `<section><h2 class="label">${esc(s.flowTitle || 'Typical setup')}</h2>${flowHTML(s.flow)}</section>` : ''}

    <section><h2 class="label">Exam must-knows</h2><ul class="card checks">${s.must.map(m => `<li>${icon('check', 18)}<span>${md(m)}</span></li>`).join('')}</ul></section>

    ${s.table ? `<section><h2 class="label">${esc(s.table.title || 'Options')}</h2>${tableHTML(s.table)}</section>` : ''}

    <section class="duo">
      <div class="card use"><h3>${icon('check', 18)} Pick it when</h3><ul>${s.use.map(u => `<li>${md(u)}</li>`).join('')}</ul></div>
      <div class="card avoid"><h3>${icon('alert', 18)} Think twice when</h3><ul>${s.avoid.map(u => `<li>${md(u)}</li>`).join('')}</ul></div>
    </section>

    ${cmps.length ? `<section><h2 class="label">Compare</h2><div class="list">${cmps.map(c => `<a class="row" href="#/learn/compare/${c.id}">${icon('columns', 20)}<span class="row-main"><span class="row-title">${esc(c.title)}</span><span class="row-sub">${esc(c.blurb)}</span></span><span class="chev">${icon('chevron-right', 18)}</span></a>`).join('')}</div></section>` : ''}

    ${s.related?.length ? `<section><h2 class="label">Related services</h2><div class="chips wrapc">${s.related.map(svcById).filter(Boolean).map(r => `<a class="chip" href="#/learn/${r.id}">${esc(r.name)}</a>`).join('')}</div></section>` : ''}

    ${labs.length ? `<section><h2 class="label">Hands-on</h2><div class="list">${labs.map(l => `<a class="row" href="#/labs/${l.id}">${icon('labs', 20)}<span class="row-main"><span class="row-title">${esc(l.title)}</span><span class="row-sub">${plural(l.steps.length, 'step')} · ${esc(l.level)}</span></span><span class="chev">${icon('chevron-right', 18)}</span></a>`).join('')}</div></section>` : ''}

    <section><div class="list"><a class="row" href="${esc(s.docs)}" target="_blank" rel="noopener">${icon('external', 20)}<span class="row-main"><span class="row-title">AWS documentation</span><span class="row-sub">Official docs, for the latest limits and features</span></span></a></div></section>
  </div>`);

  loadDiagrams(ctx.view);
  if (qs.length) ctx.dock(`<button type="button" class="btn primary block" data-act="practice">${icon('practice', 18)} Practise ${plural(qs.length, 'question')} on ${esc(plainName(s))}</button>`);
  ctx.on('click', e => {
    if (diagramClick(e)) return;
    if (e.target.closest('[data-act="practice"]')) startPractice(ctx, { ids: qs.map(q => q.id) });
  });
}

/* --------------------------------------------------------------- visual -- */

export function visual(ctx, { params: [id] }) {
  const d = diagramById(id);
  if (!d) { ctx.go('#/learn'); return; }
  ctx.header({ title: d.title, back: { fallback: '#/learn' } });
  const svcs = d.services.map(svcById).filter(Boolean);
  const cmps = d.compares.map(cid => COMPARISONS.find(c => c.id === cid)).filter(Boolean);
  const qs = QUESTIONS.filter(q => q.services.some(sid => d.services.includes(sid)) || d.compares.includes(q.compare));
  const row = (href, ic, title, sub) => `<a class="row" href="${href}">${icon(ic, 20)}<span class="row-main"><span class="row-title">${esc(title)}</span><span class="row-sub">${esc(sub)}</span></span><span class="chev">${icon('chevron-right', 18)}</span></a>`;

  ctx.render(`<div class="wrap stack">
    <div><div class="eyebrow">${esc(d.topic)} · visual guide</div><h1 class="h1">${esc(d.title)}</h1><p class="lede" style="margin-top:6px">${esc(d.blurb)}</p></div>
    ${diagramHTML(d, { heading: false })}
    <section><h2 class="label">Read more</h2><div class="list">
      ${svcs.map(s => row(`#/learn/${s.id}`, 'learn', s.name, s.one)).join('')}
      ${cmps.map(c => row(`#/learn/compare/${c.id}`, 'columns', c.title, c.blurb)).join('')}
    </div></section>
  </div>`);

  loadDiagrams(ctx.view);
  if (qs.length) ctx.dock(`<button type="button" class="btn primary block" data-act="practice">${icon('practice', 18)} Practise ${plural(qs.length, 'related question')}</button>`);
  ctx.on('click', e => {
    if (diagramClick(e)) return;
    if (e.target.closest('[data-act="practice"]')) startPractice(ctx, { ids: qs.map(q => q.id), limit: 20 });
  });
}

/* -------------------------------------------------------------- compare -- */

export function compare(ctx, { params: [id] }) {
  const c = COMPARISONS.find(x => x.id === id);
  if (!c) { ctx.go('#/learn'); return; }
  ctx.header({ title: c.title, back: { fallback: '#/learn' } });
  const qs = QUESTIONS.filter(q => q.compare === c.id || q.services.some(sid => c.services.includes(sid)));
  const dias = diagramsFor({ compare: c.id });
  ctx.render(`<div class="wrap stack">
    <div><div class="eyebrow">Comparison</div><h1 class="h1">${esc(c.title)}</h1><p class="lede" style="margin-top:6px">${md(c.intro)}</p></div>
    ${dias.map(d => diagramHTML(d)).join('')}
    ${dias.length ? `<section><h2 class="label">Side by side</h2>${tableHTML(c.table)}</section>` : tableHTML(c.table)}
    <section><h2 class="label">Exam rules of thumb</h2><ul class="card checks">${c.tips.map(t => `<li>${icon('bulb', 18)}<span>${md(t)}</span></li>`).join('')}</ul></section>
    <section><h2 class="label">Services</h2><div class="chips wrapc">${c.services.map(svcById).filter(Boolean).map(s => `<a class="chip" href="#/learn/${s.id}">${esc(s.name)}</a>`).join('')}</div></section>
  </div>`);
  loadDiagrams(ctx.view);
  if (qs.length) ctx.dock(`<button type="button" class="btn primary block" data-act="practice">${icon('practice', 18)} Practise ${plural(qs.length, 'related question')}</button>`);
  ctx.on('click', e => {
    if (diagramClick(e)) return;
    if (e.target.closest('[data-act="practice"]')) startPractice(ctx, { ids: qs.map(q => q.id), limit: 20 });
  });
}
