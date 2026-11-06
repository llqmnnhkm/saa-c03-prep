import { store, recordAnswer } from '../store.js';
import { icon } from '../icons.js';
import { esc, shuffle, pct, fmtClock, fmtDur, fmtDate, uid, plural } from '../util.js';
import { QUESTIONS, DOMAINS, qById } from '../../data/questions.js';
import { questionHTML, reviewHTML, isCorrect, weakServices, weakChips } from '../quiz.js';
import { confirmDialog, openSheet } from '../ui.js';
import { startPractice } from './practice.js';

export const PRESETS = [
  { id: 'full', name: 'Full mock exam', q: 65, min: 130, note: 'Same length and time as the real exam' },
  { id: 'half', name: 'Half exam', q: 30, min: 60, note: 'A solid session in an hour' },
  { id: 'sprint', name: 'Sprint', q: 15, min: 30, note: 'A quick check on the go' },
];
const TARGET = 72;

function pick(n) {
  const out = [];
  const used = new Set();
  DOMAINS.forEach(d => {
    const take = Math.round((n * d.weight) / 100);
    shuffle(QUESTIONS.filter(q => q.domain === d.id)).slice(0, take).forEach(q => { out.push(q); used.add(q.id); });
  });
  const rest = shuffle(QUESTIONS.filter(q => !used.has(q.id)));
  while (out.length < n && rest.length) out.push(rest.pop());
  return shuffle(out).slice(0, n);
}

const answeredCount = e => e.ids.filter(id => (e.chosen[id] || []).length).length;
const flaggedCount = e => e.ids.filter(id => e.flagged[id]).length;

/** Score the active exam, save the result and clear it. Returns the result id. */
export function finalize(timedOut = false) {
  const e = store.state.activeExam;
  if (!e) return null;
  const end = Math.min(Date.now(), e.deadline);
  let correct = 0;
  let total = 0;
  e.ids.forEach(id => {
    const q = qById(id);
    if (!q) return;
    total += 1;
    const ch = e.chosen[id] || [];
    const ok = isCorrect(q, ch);
    if (ok) correct += 1;
    if (ch.length) recordAnswer(id, ok, false);
  });
  const r = {
    id: e.id, at: end, preset: e.preset, ids: e.ids, orders: e.orders, chosen: e.chosen, flagged: e.flagged,
    correct, total, durationSec: Math.round((end - e.startedAt) / 1000), timedOut,
  };
  store.update(s => { s.exams = [r, ...s.exams].slice(0, 30); s.activeExam = null; });
  return r.id;
}

/* ---------------------------------------------------------------- setup -- */

export function setup(ctx) {
  ctx.header({ title: 'Exam', large: 'Mock exam' });
  let sel = store.state.settings.examPreset || 'full';
  const a = store.state.activeExam;
  const left = a ? a.deadline - Date.now() : 0;
  const exams = store.state.exams;

  ctx.render(`<div class="wrap stack">
    ${a ? `<section class="card resume ${left <= 0 ? 'alert' : ''}">
      <div class="resume-main"><b>${left > 0 ? 'Exam in progress' : 'Time is up'}</b>
        <span>${answeredCount(a)} of ${a.ids.length} answered${left > 0 ? ` · ${fmtClock(left)} left` : ''}</span></div>
      <div class="resume-actions">
        ${left > 0 ? `<button type="button" class="btn sm" data-act="discard">Discard</button>` : ''}
        <button type="button" class="btn primary sm" data-act="${left > 0 ? 'resume' : 'score'}">${left > 0 ? 'Resume' : 'See results'}</button>
      </div>
    </section>` : ''}

    <p class="lede">Timed, with no hints along the way. When you finish you get your score, a breakdown by domain and a full review with explanations.</p>

    <section>
      <h2 class="label">Length</h2>
      <div class="choices" role="radiogroup" aria-label="Exam length">
        ${PRESETS.map(p => `<button type="button" class="choice" role="radio" data-preset="${p.id}" aria-checked="${sel === p.id}">
          <span class="radio" aria-hidden="true"></span>
          <span class="choice-main"><b>${esc(p.name)}</b><span>${esc(p.note)}</span></span>
          <span class="choice-meta">${p.q} questions<br>${p.min} min</span>
        </button>`).join('')}
      </div>
    </section>

    <section class="card">
      <h3 style="margin-bottom:12px">How it works</h3>
      <ul class="rules">
        <li>${icon('clock', 18)}<span>The timer keeps running if you leave the app, just like the real exam.</span></li>
        <li>${icon('flag', 18)}<span>Flag questions to come back to. Jump to any question from the grid.</span></li>
        <li>${icon('grid', 18)}<span>Questions follow the real domain weighting: 30 / 26 / 24 / 20%.</span></li>
        <li>${icon('target', 18)}<span>Aim for ${TARGET}% or more. The real exam is scaled from 100 to 1000, with 720 to pass.</span></li>
      </ul>
    </section>

    <section>
      <h2 class="label">History</h2>
      ${exams.length ? `<div class="list">${exams.map(r => {
        const p = pct(r.correct, r.total);
        const preset = PRESETS.find(x => x.id === r.preset);
        return `<a class="row" href="#/exam/result/${r.id}">
          <span class="row-main"><span class="row-title">${p}% · ${r.correct}/${r.total}</span><span class="row-sub">${esc(preset ? preset.name : 'Exam')} · ${fmtDate(r.at)}</span></span>
          <span class="badge ${p >= TARGET ? 'ok' : 'bad'}">${p >= TARGET ? 'Above' : 'Below'} ${TARGET}%</span>
          <span class="chev">${icon('chevron-right', 18)}</span>
        </a>`;
      }).join('')}</div>` : `<div class="card empty"><b>No exams yet</b>Your results will be listed here.</div>`}
    </section>
  </div>`);

  const drawDock = () => {
    const p = PRESETS.find(x => x.id === sel);
    ctx.dock(`<button type="button" class="btn primary block" data-act="start">${icon('play', 18)} Start ${esc(p.name.toLowerCase())} · ${p.min} min</button>`);
  };
  drawDock();

  ctx.on('click', async e => {
    const pb = e.target.closest('[data-preset]');
    if (pb) {
      sel = pb.dataset.preset;
      ctx.view.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-checked', b === pb));
      store.update(s => { s.settings.examPreset = sel; });
      drawDock();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'resume') ctx.go('#/exam/run');
    if (act === 'score') { const id = finalize(true); ctx.go(id ? `#/exam/result/${id}` : '#/exam'); }
    if (act === 'discard') {
      const ok = await confirmDialog({ title: 'Discard this exam?', body: 'Your answers in this exam won’t be scored or saved.', confirm: 'Discard', danger: true });
      if (ok) { store.update(s => { s.activeExam = null; }); ctx.go('#/exam'); }
    }
    if (act === 'start') {
      if (store.state.activeExam) {
        const ok = await confirmDialog({ title: 'Replace the exam in progress?', body: 'Starting a new exam discards the one you haven’t finished.', confirm: 'Start new', danger: true });
        if (!ok) return;
      }
      const p = PRESETS.find(x => x.id === sel);
      const qs = pick(p.q);
      const orders = {};
      qs.forEach(q => { orders[q.id] = shuffle(q.options.map((_, i) => i)); });
      const now = Date.now();
      store.update(s => {
        s.activeExam = { id: uid(), preset: p.id, ids: qs.map(q => q.id), orders, chosen: {}, flagged: {}, i: 0, startedAt: now, deadline: now + p.min * 60000 };
      });
      ctx.go('#/exam/run');
    }
  });
}

/* ------------------------------------------------------------------ run -- */

export function run(ctx) {
  const e = store.state.activeExam;
  if (!e) { ctx.go('#/exam'); return; }
  const left = () => e.deadline - Date.now();
  let timer = 0;

  const done = timedOut => {
    clearInterval(timer);
    const id = finalize(timedOut);
    ctx.go(id ? `#/exam/result/${id}` : '#/exam');
  };

  if (left() <= 0) { done(true); return; }

  const leave = async () => {
    const ok = await confirmDialog({
      title: 'Leave the exam?',
      body: 'The timer keeps running. You can resume from the Exam tab or Home.',
      confirm: 'Leave',
      cancel: 'Stay',
    });
    if (ok) ctx.go('#/exam');
  };

  const finishFlow = async () => {
    const un = e.ids.length - answeredCount(e);
    const fl = flaggedCount(e);
    const parts = [];
    if (un) parts.push(`<b>${plural(un, 'question')}</b> unanswered`);
    if (fl) parts.push(`<b>${fl}</b> flagged for review`);
    const ok = await confirmDialog({
      title: 'Finish the exam?',
      body: parts.length ? `You have ${parts.join(' and ')}. Unanswered questions count as wrong.` : 'All questions are answered. You can’t change answers after finishing.',
      confirm: 'Finish exam',
      cancel: 'Keep going',
    });
    if (ok) done(false);
  };

  const openNav = () => {
    const html = `
      <div class="nav-legend">
        <span><i class="a"></i>Answered (${answeredCount(e)})</span>
        <span><i></i>Unanswered (${e.ids.length - answeredCount(e)})</span>
        <span><i class="f"></i>Flagged (${flaggedCount(e)})</span>
      </div>
      <div data-scroll="y" style="--max-h:52vh">
        <div class="nav-grid">${e.ids.map((id, i) => {
          const ans = (e.chosen[id] || []).length > 0;
          const cls = [ans ? 'is-answered' : '', e.flagged[id] ? 'is-flagged' : '', i === e.i ? 'is-current' : ''].join(' ');
          return `<button type="button" class="nav-cell ${cls}" data-jump="${i}" aria-label="Question ${i + 1}${ans ? ', answered' : ''}${e.flagged[id] ? ', flagged' : ''}">${i + 1}</button>`;
        }).join('')}</div>
      </div>
      <button type="button" class="btn primary block" data-sheet="finish">Finish exam</button>`;
    openSheet({
      title: 'Questions',
      html,
      onClick: (ev, close) => {
        const j = ev.target.closest('[data-jump]');
        if (j) { e.i = +j.dataset.jump; store.save(); close(); window.scrollTo(0, 0); draw(); return; }
        if (ev.target.closest('[data-sheet="finish"]')) { close(); finishFlow(); }
      },
    });
  };

  function draw() {
    const q = qById(e.ids[e.i]);
    const chosen = e.chosen[q.id] || [];
    const flagged = !!e.flagged[q.id];
    const n = e.ids.length;
    const answered = answeredCount(e);
    const l = left();

    ctx.header({
      title: `${e.i + 1} of ${n}`,
      back: { icon: 'x', label: 'Leave exam', fn: leave },
      right: `<span class="timer ${l < 300000 ? 'low' : ''}" id="exam-timer" role="timer" aria-label="Time left">${icon('clock', 16)}<span>${fmtClock(l)}</span></span>`,
    });
    ctx.render(`<div class="wrap">
      <div class="qprog">
        <div class="bar"><span style="width:${pct(answered, n)}%"></span></div>
        <span class="qprog-txt">${answered}/${n} answered</span>
      </div>
      ${questionHTML(q, { order: e.orders[q.id], chosen, revealed: false, meta: false })}
      <button type="button" class="btn ghost flag-btn" data-act="flag" aria-pressed="${flagged}">${icon('flag', 18)} ${flagged ? 'Flagged for review' : 'Flag for review'}</button>
    </div>`);
    const last = e.i === n - 1;
    ctx.dock(`<div class="dock-row">
      <button type="button" class="btn" data-act="prev" ${e.i === 0 ? 'disabled' : ''} aria-label="Previous question">${icon('chevron-left', 20)}</button>
      <button type="button" class="btn grow" data-act="nav">${icon('grid', 18)}<span class="btn-label">All questions</span></button>
      ${last
        ? `<button type="button" class="btn primary" data-act="finish">Finish</button>`
        : `<button type="button" class="btn primary" data-act="next" aria-label="Next question">Next ${icon('chevron-right', 18)}</button>`}
    </div>`);

    ctx.on('click', ev => {
      const opt = ev.target.closest('[data-opt]');
      if (opt) {
        const oi = +opt.dataset.opt;
        if (q.answer.length === 1) e.chosen[q.id] = chosen[0] === oi ? [] : [oi];
        else e.chosen[q.id] = chosen.includes(oi) ? chosen.filter(x => x !== oi) : [...chosen, oi];
        store.save();
        draw();
        return;
      }
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'flag') { e.flagged[q.id] = !flagged; store.save(); draw(); }
      if (act === 'prev' && e.i > 0) { e.i -= 1; store.save(); window.scrollTo(0, 0); draw(); }
      if (act === 'next' && e.i < n - 1) { e.i += 1; store.save(); window.scrollTo(0, 0); draw(); }
      if (act === 'nav') openNav();
      if (act === 'finish') finishFlow();
    });
  }

  draw();
  timer = setInterval(() => {
    const l = left();
    const el = document.getElementById('exam-timer');
    if (el) {
      el.lastElementChild.textContent = fmtClock(l);
      el.classList.toggle('low', l < 300000);
    }
    if (l <= 0) done(true);
  }, 1000);
  return () => clearInterval(timer);
}

/* --------------------------------------------------------------- result -- */

export function result(ctx, { params: [id] }) {
  const r = store.state.exams.find(x => x.id === id);
  if (!r) { ctx.go('#/exam'); return; }
  ctx.header({ title: 'Exam results', back: '#/exam' });

  const qs = r.ids.map(qById).filter(Boolean);
  const ok = q => isCorrect(q, r.chosen[q.id] || []);
  const p = pct(r.correct, r.total);
  const pass = p >= TARGET;
  const unanswered = qs.filter(q => !(r.chosen[q.id] || []).length).length;
  const wrong = qs.filter(q => !ok(q));
  const flagged = qs.filter(q => r.flagged?.[q.id]);
  const preset = PRESETS.find(x => x.id === r.preset);
  const weak = weakServices(wrong);
  let filter = 'all';

  const domainRows = DOMAINS.map(d => {
    const dq = qs.filter(q => q.domain === d.id);
    if (!dq.length) return '';
    const c = dq.filter(ok).length;
    const dp = pct(c, dq.length);
    return `<div class="dom-row" style="--c:var(--d${d.id})">
      <div class="dom-row-top"><b>${esc(d.full)}</b><span>${c}/${dq.length} · ${dp}%</span></div>
      <div class="meter" style="height:8px"><span style="width:${dp}%;background:var(--c)"></span><i style="left:${TARGET}%"></i></div>
    </div>`;
  }).join('');

  const listHTML = () => {
    const list = filter === 'wrong' ? wrong : filter === 'flagged' ? flagged : qs;
    if (!list.length) return `<div class="card empty">${filter === 'wrong' ? '<b>Nothing wrong.</b>Every answer was correct.' : '<b>No flagged questions.</b>'}</div>`;
    return list.map(q => reviewHTML(q, { order: r.orders[q.id], chosen: r.chosen[q.id] || [], n: r.ids.indexOf(q.id) + 1, flagged: !!r.flagged?.[q.id] })).join('');
  };

  ctx.render(`<div class="wrap stack">
    <section class="card score">
      <div class="score-top">
        <div>
          <div class="score-num">${r.correct}<span> / ${r.total}</span></div>
          <div class="score-pct">${p}% correct</div>
        </div>
        <span class="badge ${pass ? 'ok' : 'bad'}">${icon(pass ? 'check' : 'x', 14)} ${pass ? 'Above target' : 'Below target'}</span>
      </div>
      <div class="meter"><span class="${pass ? 'ok' : 'bad'}" style="width:${p}%"></span><i style="left:${TARGET}%"></i></div>
      <p class="score-note">The line marks ${TARGET}%. AWS scores the real exam on a 100–1000 scale with 720 to pass, so use this as a guide.</p>
      <dl class="facts-row">
        <div><dt>Time used</dt><dd>${fmtDur(r.durationSec)}</dd></div>
        <div><dt>Unanswered</dt><dd>${unanswered}</dd></div>
        <div><dt>Flagged</dt><dd>${flagged.length}</dd></div>
      </dl>
      <p class="small muted">${esc(preset ? preset.name : 'Exam')} · ${fmtDate(r.at)}${r.timedOut ? ' · finished when time ran out' : ''}</p>
    </section>

    <section>
      <h2 class="label">By domain</h2>
      <div class="card dom-rows">${domainRows}</div>
    </section>

    ${weak.length ? `<section>
      <h2 class="label">Study next</h2>
      <div class="card stack-sm">
        <p class="small muted">Services that came up most in the questions you missed.</p>
        <div class="chips wrapc">${weakChips(weak)}</div>
      </div>
    </section>` : ''}

    <section>
      <h2 class="label">Review</h2>
      <div class="seg" role="group" aria-label="Filter questions" style="margin-bottom:12px">
        <button type="button" data-filter="all" aria-pressed="true">All<small>${qs.length}</small></button>
        <button type="button" data-filter="wrong" aria-pressed="false">Wrong<small>${wrong.length}</small></button>
        <button type="button" data-filter="flagged" aria-pressed="false">Flagged<small>${flagged.length}</small></button>
      </div>
      <div id="rv-list">${listHTML()}</div>
    </section>
  </div>`);

  ctx.dock(`<div class="dock-row">
    ${wrong.length ? `<button type="button" class="btn grow" data-act="retry">${icon('refresh', 18)}<span class="btn-label">Retry ${wrong.length} missed</span></button>` : ''}
    <a class="btn primary grow" href="#/exam">Done</a>
  </div>`);

  ctx.on('click', ev => {
    const f = ev.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      ctx.view.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b === f));
      ctx.view.querySelector('#rv-list').innerHTML = listHTML();
      return;
    }
    if (ev.target.closest('[data-act="retry"]')) startPractice(ctx, { ids: wrong.map(q => q.id) });
  });
}
