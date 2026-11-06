import { store, recordAnswer } from '../store.js';
import { icon } from '../icons.js';
import { esc, shuffle, plural, pct } from '../util.js';
import { QUESTIONS, DOMAINS, qById } from '../../data/questions.js';
import { SERVICES, plainName } from '../../data/services.js';
import { questionHTML, studyHTML, reviewHTML, isCorrect, weakServices, weakChips } from '../quiz.js';
import { confirmDialog } from '../ui.js';

const DEFAULTS = { source: 'all', domains: [], services: [], count: 10 };
const getFilters = () => ({ ...DEFAULTS, ...(store.state.settings.practiceFilters || {}) });

export function pool(f) {
  const ans = store.state.answers;
  return QUESTIONS.filter(q =>
    (!f.domains.length || f.domains.includes(q.domain)) &&
    (!f.services.length || q.services.some(s => f.services.includes(s))) &&
    (f.source === 'all' ||
      (f.source === 'new' && !ans[q.id]) ||
      (f.source === 'missed' && ans[q.id] && ans[q.id].last === false)));
}

/** Start a session from filters, or from an explicit list of question ids. */
export function startPractice(ctx, { ids, filters, limit } = {}) {
  let qs = ids ? ids.map(qById).filter(Boolean) : pool(filters || DEFAULTS);
  qs = shuffle(qs);
  const count = limit || (filters && filters.count !== 'all' ? filters.count : 0);
  if (count) qs = qs.slice(0, count);
  if (!qs.length) return false;
  const orders = {};
  qs.forEach(q => { orders[q.id] = shuffle(q.options.map((_, i) => i)); });
  store.update(s => {
    s.practice = { ids: qs.map(q => q.id), i: 0, orders, chosen: {}, done: {}, result: {}, finished: false, at: Date.now() };
  });
  ctx.go('#/practice/run');
  return true;
}

/* ---------------------------------------------------------------- setup -- */

export function setup(ctx) {
  ctx.header({ title: 'Practice', large: 'Practice' });
  const f = getFilters();
  const active = store.state.practice && !store.state.practice.finished ? store.state.practice : null;
  const svcCounts = SERVICES
    .map(sv => [sv, QUESTIONS.filter(q => q.services.includes(sv.id)).length])
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1] || plainName(a[0]).localeCompare(plainName(b[0])));
  const srcCount = k => pool({ ...DEFAULTS, source: k }).length;

  ctx.render(`<div class="wrap stack">
    ${active ? `<section class="card resume">
      <div class="resume-main"><b>Session in progress</b><span>Question ${Math.min(active.i + 1, active.ids.length)} of ${active.ids.length}</span></div>
      <div class="resume-actions">
        <button type="button" class="btn sm" data-act="discard">Discard</button>
        <button type="button" class="btn primary sm" data-act="resume">Resume</button>
      </div>
    </section>` : ''}

    <p class="lede">Pick an answer and check it. You’ll see why every option is right or wrong, plus what to study next.</p>

    <section>
      <h2 class="label">Questions from</h2>
      <div class="seg" role="group" aria-label="Question source">
        ${[['all', 'All'], ['new', 'Not tried'], ['missed', 'Missed']].map(([k, l]) =>
          `<button type="button" data-src="${k}" aria-pressed="${f.source === k}">${l}<small>${srcCount(k)}</small></button>`).join('')}
      </div>
    </section>

    <section>
      <h2 class="label">Domains</h2>
      <div class="chips wrapc">
        <button type="button" class="chip" data-dom="all" aria-pressed="${!f.domains.length}">All domains</button>
        ${DOMAINS.map(d => `<button type="button" class="chip" data-dom="${d.id}" aria-pressed="${f.domains.includes(d.id)}"><i class="dot" style="--c:var(--d${d.id})"></i>${esc(d.name)}</button>`).join('')}
      </div>
    </section>

    <section>
      <h2 class="label">Services <span class="label-note">optional · swipe for more</span></h2>
      <div class="chips" data-scroll="x" data-bleed>
        <button type="button" class="chip" data-svc="all" aria-pressed="${!f.services.length}">Any service</button>
        ${svcCounts.map(([sv, n]) => `<button type="button" class="chip" data-svc="${sv.id}" aria-pressed="${f.services.includes(sv.id)}">${esc(plainName(sv))} <span class="n">${n}</span></button>`).join('')}
      </div>
    </section>

    <section>
      <h2 class="label">Session length</h2>
      <div class="seg" role="group" aria-label="Session length">
        ${[10, 20, 'all'].map(c => `<button type="button" data-count="${c}" aria-pressed="${f.count === c}">${c === 'all' ? 'All matching' : c + ' questions'}</button>`).join('')}
      </div>
    </section>
  </div>`);

  const sync = () => {
    const v = ctx.view;
    v.querySelectorAll('[data-src]').forEach(b => b.setAttribute('aria-pressed', b.dataset.src === f.source));
    v.querySelectorAll('[data-dom]').forEach(b => b.setAttribute('aria-pressed', b.dataset.dom === 'all' ? !f.domains.length : f.domains.includes(+b.dataset.dom)));
    v.querySelectorAll('[data-svc]').forEach(b => b.setAttribute('aria-pressed', b.dataset.svc === 'all' ? !f.services.length : f.services.includes(b.dataset.svc)));
    v.querySelectorAll('[data-count]').forEach(b => b.setAttribute('aria-pressed', String(f.count) === b.dataset.count));
    const n = pool(f).length;
    const take = f.count === 'all' ? n : Math.min(n, f.count);
    ctx.dock(`<button type="button" class="btn primary block" data-act="start" ${take ? '' : 'disabled'}>${take ? `${icon('play', 18)} Start · ${plural(take, 'question')}` : 'No questions match these filters'}</button>`);
    store.update(s => { s.settings.practiceFilters = f; });
  };
  sync();

  const toggle = (list, v) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  ctx.on('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.src) f.source = d.src;
    else if (d.dom) f.domains = d.dom === 'all' ? [] : toggle(f.domains, +d.dom);
    else if (d.svc) f.services = d.svc === 'all' ? [] : toggle(f.services, d.svc);
    else if (d.count) f.count = d.count === 'all' ? 'all' : +d.count;
    else if (d.act === 'start') { startPractice(ctx, { filters: f }); return; }
    else if (d.act === 'resume') { ctx.go('#/practice/run'); return; }
    else if (d.act === 'discard') { store.update(s => { s.practice = null; }); ctx.go('#/practice'); return; }
    else return;
    sync();
  });
}

/* ------------------------------------------------------------------ run -- */

export function run(ctx) {
  const s = store.state.practice;
  if (!s) { ctx.go('#/practice'); return; }

  const finish = () => { store.update(st => { st.practice = null; }); ctx.go('#/practice'); };

  const endEarly = async () => {
    const answered = s.ids.filter(id => s.done[id]).length;
    if (!answered) { finish(); return; }
    const ok = await confirmDialog({
      title: 'End this session?',
      body: `You’ve answered ${plural(answered, 'question')}. Your answers are already saved to your progress.`,
      confirm: 'End & see results',
      cancel: 'Keep going',
    });
    if (ok) { s.finished = true; store.save(); draw(); }
  };

  const draw = () => (s.finished || s.i >= s.ids.length ? summary() : question());

  function question() {
    const q = qById(s.ids[s.i]);
    if (!q) { s.i += 1; store.save(); draw(); return; }
    const chosen = s.chosen[q.id] || [];
    const revealed = !!s.done[q.id];
    const need = q.answer.length;
    const doneIds = s.ids.filter(id => s.done[id]);
    const right = doneIds.filter(id => s.result[id]).length;

    ctx.header({ title: `Question ${s.i + 1} of ${s.ids.length}`, back: { icon: 'x', label: 'End session', fn: endEarly } });
    ctx.render(`<div class="wrap">
      <div class="qprog">
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${s.ids.length}" aria-valuenow="${doneIds.length}"><span style="width:${pct(doneIds.length, s.ids.length)}%"></span></div>
        <span class="qprog-txt">${right} right · ${doneIds.length - right} wrong</span>
      </div>
      ${questionHTML(q, { order: s.orders[q.id], chosen, revealed })}
      ${revealed ? studyHTML(q) : ''}
    </div>`);

    let label = 'Check answer';
    if (need > 1 && chosen.length < need) label = `Select ${need - chosen.length} more`;
    if (need > 1 && chosen.length > need) label = `Select only ${need}`;
    if (need === 1 && !chosen.length) label = 'Select an answer';
    const last = s.i + 1 >= s.ids.length;
    ctx.dock(revealed
      ? `<button type="button" class="btn primary block" data-act="next">${last ? 'See results' : 'Next question'} ${icon('chevron-right', 18)}</button>`
      : `<button type="button" class="btn primary block" data-act="check" ${chosen.length === need ? '' : 'disabled'}>${label}</button>`);

    ctx.on('click', e => {
      const opt = e.target.closest('[data-opt]');
      if (opt && !opt.disabled) {
        const oi = +opt.dataset.opt;
        if (need === 1) s.chosen[q.id] = [oi];
        else s.chosen[q.id] = chosen.includes(oi) ? chosen.filter(x => x !== oi) : [...chosen, oi];
        store.save();
        draw();
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'check') {
        const ok = isCorrect(q, chosen);
        s.done[q.id] = true;
        s.result[q.id] = ok;
        recordAnswer(q.id, ok, false);
        store.save();
        draw();
        ctx.view.querySelector('.verdict')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else if (act === 'next') {
        s.i += 1;
        store.save();
        window.scrollTo(0, 0);
        draw();
      }
    });
  }

  function summary() {
    const ids = s.ids.filter(id => s.done[id] && qById(id));
    const right = ids.filter(id => s.result[id]).length;
    const wrongIds = ids.filter(id => !s.result[id]);
    const weak = weakServices(wrongIds.map(qById));
    const p = pct(right, ids.length);

    ctx.header({ title: 'Session results', back: { icon: 'x', label: 'Close', fn: finish } });
    ctx.render(`<div class="wrap stack">
      <section class="card score">
        <div class="score-top">
          <div><div class="score-num">${right}<span> / ${ids.length}</span></div>
          <div class="score-pct">${p}% correct${ids.length < s.ids.length ? ` · ${s.ids.length - ids.length} not answered` : ''}</div></div>
          <span class="badge ${p >= 72 ? 'ok' : 'bad'}">${p >= 72 ? 'Exam ready pace' : 'Keep practising'}</span>
        </div>
        <div class="meter"><span class="${p >= 72 ? 'ok' : ''}" style="width:${p}%"></span><i style="left:72%" title="72% target"></i></div>
        <p class="score-note">The marker shows 72%, a rough stand-in for the 720/1000 pass mark.</p>
      </section>
      ${weak.length ? `<section><h2 class="label">Review these services</h2><div class="chips wrapc">${weakChips(weak)}</div></section>` : ''}
      <section>
        <h2 class="label">Questions <span class="label-note">tap to see explanations</span></h2>
        ${ids.length ? ids.map((id, k) => reviewHTML(qById(id), { order: s.orders[id], chosen: s.chosen[id] || [], n: k + 1 })).join('') : '<div class="card empty">No questions answered.</div>'}
      </section>
    </div>`);
    ctx.dock(`<div class="dock-row">
      ${wrongIds.length ? `<button type="button" class="btn grow" data-act="retry">${icon('refresh', 18)}<span class="btn-label">Retry ${wrongIds.length} missed</span></button>` : ''}
      <button type="button" class="btn primary grow" data-act="done">Done</button>
    </div>`);
    ctx.on('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'done') finish();
      if (act === 'retry') startPractice(ctx, { ids: wrongIds });
    });
  }

  draw();
}
