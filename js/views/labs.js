import { store } from '../store.js';
import { icon } from '../icons.js';
import { esc, md, shuffle, pct, plural } from '../util.js';
import { LABS } from '../../data/labs.js';
import { svcById, plainName } from '../../data/services.js';
import { questionHTML, isCorrect } from '../quiz.js';
import { confirmDialog, openLightbox } from '../ui.js';
import { flowHTML } from './learn.js';

const imgPath = (lab, i) => `assets/labs/${lab.id}/step-${i + 1}.png`;

function shotHTML(lab, step, i) {
  const src = imgPath(lab, i);
  return `<figure class="shot">
    <div class="shot-frame">
      <div class="shot-bar" aria-hidden="true"><i></i><i></i><i></i><em>${esc(step.screen)}</em></div>
      <button type="button" class="shot-img" data-zoom="${esc(src)}" aria-label="Enlarge screenshot">
        <img src="${esc(src)}" alt="${esc(step.screen)}" loading="lazy" onerror="this.closest('.shot').classList.add('is-missing')">
      </button>
      <div class="shot-ph" aria-hidden="true">
        <div class="sk-side"><div class="sk"></div><div class="sk" style="width:70%"></div><div class="sk" style="width:85%"></div><div class="sk" style="width:60%"></div><div class="sk" style="width:75%"></div></div>
        <div class="sk-main"><div class="sk" style="width:45%;height:12px"></div><div class="sk box"></div><div class="sk" style="width:80%"></div><div class="sk box"></div><div class="sk btn-sk"></div></div>
        <div class="shot-label">${icon('image', 22)}<b>Screenshot goes here</b><span>${esc(step.screen)}</span><code>${esc(src)}</code></div>
      </div>
    </div>
  </figure>`;
}

const svcTags = ids => ids.map(svcById).filter(Boolean)
  .map(s => `<span class="tag" style="--c:var(--cat-${s.cat})">${esc(plainName(s))}</span>`).join('');

/* ----------------------------------------------------------------- list -- */

export function list(ctx) {
  ctx.header({ title: 'Labs', large: 'Labs' });
  const progress = store.state.labs;
  ctx.render(`<div class="wrap stack">
    <p class="lede">Walk through real console tasks one step at a time. Each step shows the screen you’d be on and asks what you do next.</p>
    <div class="lab-list">
      ${LABS.map(l => {
        const p = progress[l.id];
        return `<a class="card lab-card" href="#/labs/${l.id}">
          <div class="lab-top"><span>${esc(l.level)} · ${plural(l.steps.length, 'step')} · ~${l.minutes} min</span>
            ${p ? `<span class="badge ${p.best === p.total ? 'ok' : 'neutral'}">${icon('check', 14)} Best ${p.best}/${p.total}</span>` : ''}</div>
          <h3>${esc(l.title)}</h3>
          <p>${esc(l.summary)}</p>
          <div class="lab-meta">${svcTags(l.services)}</div>
        </a>`;
      }).join('')}
    </div>
    <p class="foot">${icon('image', 14).replace('class="i"', 'class="i" style="display:inline;vertical-align:-2px"')} Placeholders show which console page each step refers to. Add your own screenshots as <code>assets/labs/&lt;lab-id&gt;/step-&lt;n&gt;.png</code> and they appear automatically.</p>
  </div>`);
}

/* ------------------------------------------------------------------ run -- */

export function run(ctx, { params: [id] }) {
  const lab = LABS.find(l => l.id === id);
  if (!lab) { ctx.go('#/labs'); return; }
  let s = store.state.labSession;
  const fresh = () => ({
    id: lab.id, i: -1,
    orders: lab.steps.map(st => shuffle(st.options.map((_, k) => k))),
    chosen: {}, done: {}, result: {},
  });
  if (!s || s.id !== lab.id || !s.orders || s.orders.length !== lab.steps.length) {
    s = fresh();
    store.update(st => { st.labSession = s; });
  }
  const n = lab.steps.length;

  const exit = () => ctx.go('#/labs');
  const leave = async () => {
    if (s.i < 0 || s.i >= n) { exit(); return; }
    const ok = await confirmDialog({ title: 'Leave this lab?', body: 'Your place is saved. Open the lab again to carry on.', confirm: 'Leave', cancel: 'Stay' });
    if (ok) exit();
  };

  const draw = () => (s.i < 0 ? intro() : s.i >= n ? finish() : step());

  function intro() {
    ctx.header({ title: lab.title, back: { icon: 'x', label: 'Close lab', fn: exit } });
    ctx.render(`<div class="wrap stack">
      <div><div class="eyebrow">Lab · ${esc(lab.level)} · ~${lab.minutes} min</div><h1 class="h1">${esc(lab.title)}</h1></div>
      <section class="card prose"><h3>Scenario</h3><p>${md(lab.scenario)}</p></section>
      <section><h2 class="label">What you’ll build</h2>${flowHTML(lab.flow)}</section>
      <section><h2 class="label">You’ll practise</h2><ul class="card checks">${lab.goals.map(g => `<li>${icon('check', 18)}<span>${md(g)}</span></li>`).join('')}</ul></section>
      <section><h2 class="label">Services</h2><div class="chips wrapc">${lab.services.map(svcById).filter(Boolean).map(sv => `<a class="chip" href="#/learn/${sv.id}">${esc(sv.name)}</a>`).join('')}</div></section>
    </div>`);
    const started = Object.keys(s.done).length > 0;
    ctx.dock(`<button type="button" class="btn primary block" data-act="start">${icon('play', 18)} ${started ? 'Continue lab' : 'Start lab'}</button>`);
    ctx.on('click', e => {
      if (e.target.closest('[data-act="start"]')) {
        const firstOpen = lab.steps.findIndex((_, k) => !s.done[k]);
        s.i = firstOpen === -1 ? n : firstOpen;
        store.save();
        draw();
      }
    });
  }

  function step() {
    const st = lab.steps[s.i];
    const chosen = s.chosen[s.i] || [];
    const revealed = !!s.done[s.i];
    const need = st.answer.length;
    ctx.header({ title: `Step ${s.i + 1} of ${n}`, back: { icon: 'x', label: 'Leave lab', fn: leave } });
    ctx.render(`<div class="wrap">
      <div class="steps-dots" aria-hidden="true">${lab.steps.map((_, k) => `<span class="${s.done[k] ? 'done' : ''} ${k === s.i && !s.done[k] ? 'cur' : ''}"></span>`).join('')}</div>
      <h2 class="step-title">${esc(st.title)}</h2>
      ${shotHTML(lab, st, s.i)}
      <p class="step-ctx">${md(st.context)}</p>
      ${questionHTML(st, { order: s.orders[s.i], chosen, revealed, meta: need > 1 })}
      ${revealed ? `<section class="card do">
        <h3>${icon('play', 18)} In the console</h3>
        <p>${md(st.do)}</p>
        ${st.code ? `<pre data-scroll="x" data-fade="end"><code>${esc(st.code)}</code></pre>` : ''}
      </section>` : ''}
    </div>`);
    const last = s.i === n - 1;
    ctx.dock(revealed
      ? `<button type="button" class="btn primary block" data-act="next">${last ? 'Finish lab' : 'Next step'} ${icon('chevron-right', 18)}</button>`
      : `<button type="button" class="btn primary block" data-act="check" ${chosen.length === need ? '' : 'disabled'}>${chosen.length ? (need > 1 && chosen.length !== need ? `Select ${need}` : 'Check answer') : 'Select an answer'}</button>`);

    ctx.on('click', e => {
      const z = e.target.closest('[data-zoom]');
      if (z && !z.closest('.is-missing')) { openLightbox(z.dataset.zoom, st.screen); return; }
      const opt = e.target.closest('[data-opt]');
      if (opt && !opt.disabled) {
        const oi = +opt.dataset.opt;
        s.chosen[s.i] = need === 1 ? [oi] : chosen.includes(oi) ? chosen.filter(x => x !== oi) : [...chosen, oi];
        store.save();
        draw();
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'check') {
        s.done[s.i] = true;
        s.result[s.i] = isCorrect(st, chosen);
        store.save();
        draw();
        ctx.view.querySelector('.verdict')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      if (act === 'next') {
        s.i += 1;
        store.save();
        window.scrollTo(0, 0);
        draw();
      }
    });
  }

  function finish() {
    const right = lab.steps.filter((_, k) => s.result[k]).length;
    const prev = store.state.labs[lab.id];
    store.update(st => { st.labs[lab.id] = { best: Math.max(prev?.best || 0, right), total: n, at: Date.now() }; });
    const p = pct(right, n);
    ctx.header({ title: 'Lab complete', back: { icon: 'x', label: 'Close', fn: () => { store.update(st => { st.labSession = null; }); exit(); } } });
    ctx.render(`<div class="wrap stack">
      <section class="card score">
        <div class="score-top">
          <div><div class="score-num">${right}<span> / ${n}</span></div><div class="score-pct">steps right first time · ${p}%</div></div>
          <span class="badge ${right === n ? 'ok' : 'neutral'}">${right === n ? 'Perfect run' : 'Try again to master it'}</span>
        </div>
        <div class="meter"><span class="${right === n ? 'ok' : ''}" style="width:${p}%"></span></div>
      </section>
      <section>
        <h2 class="label">Full walkthrough <span class="label-note">your cheat sheet</span></h2>
        <ol class="card walk">${lab.steps.map((st, k) => `<li><div class="walk-body">
          <b>${esc(st.title)} ${s.result[k] ? '' : `<span class="tag" style="--c:var(--bad)">missed</span>`}</b>
          <p>${md(st.do)}</p>
          ${st.code ? `<pre data-scroll="x" data-fade="end"><code>${esc(st.code)}</code></pre>` : ''}
        </div></li>`).join('')}</ol>
      </section>
      ${lab.takeaways ? `<section><h2 class="label">Exam takeaways</h2><ul class="card checks">${lab.takeaways.map(t => `<li>${icon('check', 18)}<span>${md(t)}</span></li>`).join('')}</ul></section>` : ''}
    </div>`);
    ctx.dock(`<div class="dock-row">
      <button type="button" class="btn grow" data-act="restart">${icon('refresh', 18)} Restart</button>
      <button type="button" class="btn primary grow" data-act="done">Back to labs</button>
    </div>`);
    ctx.on('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'restart') { s = fresh(); s.i = 0; store.update(st => { st.labSession = s; }); window.scrollTo(0, 0); draw(); }
      if (act === 'done') { store.update(st => { st.labSession = null; }); exit(); }
    });
  }

  draw();
}
