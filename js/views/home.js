import { store, reviewQueue, readiness, REVIEW_STEPS, READY_MIN, RECENT, PASS } from '../store.js';
import { icon } from '../icons.js';
import { esc, pct, fmtClock } from '../util.js';
import { QUESTIONS, DOMAINS } from '../../data/questions.js';
import { svcById } from '../../data/services.js';
import { confirmDialog, applyTheme, showToast, hideToast } from '../ui.js';
import { startPractice } from './practice.js';
import { finalize as finalizeExam } from './exam.js';
import { BUILD } from '../version.js';
import { supported as updatesSupported, checkForUpdate, applyUpdate, hardReload } from '../update.js';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

function serviceStats(answers) {
  const by = new Map();
  QUESTIONS.forEach(q => {
    const a = answers[q.id];
    if (!a) return;
    q.services.forEach(id => {
      const s = by.get(id) || { seen: 0, correct: 0 };
      s.seen += a.seen;
      s.correct += a.correct;
      by.set(id, s);
    });
  });
  return [...by.entries()]
    .map(([id, s]) => ({ svc: svcById(id), ...s, acc: s.correct / s.seen }))
    .filter(x => x.svc && x.seen >= 2 && x.acc < 0.8)
    .sort((a, b) => a.acc - b.acc || b.seen - a.seen)
    .slice(0, 6);
}

// "today", "tomorrow", or a weekday / date for the next review.
function whenLabel(ts) {
  const day = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(ts) - day(Date.now())) / 864e5);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function reviewHTML(rq) {
  if (!rq.total) return '';
  const steps = REVIEW_STEPS.join(', ').replace(/, (\d+)$/, ' and $1');
  if (rq.due.length) {
    return `<section class="card review-card due">
      <div class="review-main">
        <span class="review-n">${rq.due.length}</span>
        <div><b>${rq.due.length === 1 ? 'Question' : 'Questions'} to review</b><span>Mistakes come back after ${steps} days until you get them right.</span></div>
      </div>
      <button type="button" class="btn primary block" data-act="review">${icon('refresh', 18)} Review now</button>
    </section>`;
  }
  return `<section class="card review-card">
    <div class="review-main">
      <span class="review-n">${icon('check', 20)}</span>
      <div><b>Nothing to review today</b><span>Next review ${whenLabel(rq.next)} · ${rq.total} ${rq.total === 1 ? 'question' : 'questions'} in your review schedule</span></div>
    </div>
  </section>`;
}

function readinessHTML(r) {
  const domRows = r.doms.map(({ d, n, acc }) => `<div class="dom-row" style="--c:var(--d${d.id})">
    <div class="dom-row-top"><b>${esc(d.full)}</b><span>${n ? `${acc}% <small>of last ${n}</small>` : 'Not started'}</span></div>
    <div class="meter sm"><span style="width:${acc || 0}%;background:var(--c)"></span><i style="left:${PASS}%"></i></div>
  </div>`).join('');

  if (r.score == null) {
    const need = r.doms.filter(x => x.n < READY_MIN);
    return `<div class="card stack-sm">
      <div class="ready-top"><div><b class="ready-score muted">—</b><span>Not enough answers yet</span></div></div>
      <p class="small muted">Answer at least ${READY_MIN} questions in every domain to get a score. Still needed: ${need.map(x => `${esc(x.d.name)} (${READY_MIN - x.n})`).join(', ')}.</p>
      <div class="dom-rows">${domRows}</div>
    </div>`;
  }
  const on = r.score >= PASS;
  return `<div class="card stack-sm">
    <div class="ready-top">
      <div><b class="ready-score">${r.score}%</b><span>Exam readiness</span></div>
      <span class="badge ${on ? 'ok' : 'bad'}">${on ? 'On track' : `${PASS - r.score} points to go`}</span>
    </div>
    <div class="meter"><span class="${on ? 'ok' : ''}" style="width:${r.score}%"></span><i style="left:${PASS}%" title="Target ${PASS}%"></i></div>
    <p class="small muted">Your last ${RECENT} answers in each domain, weighted like the exam. The line marks the ${PASS}% target. This is an estimate from practice, not an official score.</p>
    <div class="dom-rows">${domRows}</div>
  </div>`;
}

export function render(ctx) {
  ctx.header({ title: 'SAA-C03 Prep', large: 'SAA-C03 Prep' });
  const s = store.state;
  const answers = s.answers;

  const seenQs = QUESTIONS.filter(q => answers[q.id]);
  let seen = 0, correct = 0;
  seenQs.forEach(q => { seen += answers[q.id].seen; correct += answers[q.id].correct; });
  const best = s.exams.reduce((m, e) => Math.max(m, pct(e.correct, e.total)), 0);

  const rq = reviewQueue();
  const ready = readiness();
  const weak = serviceStats(answers);
  const exam = s.activeExam;
  const examLeft = exam ? exam.deadline - Date.now() : 0;
  const prac = s.practice && !s.practice.finished ? s.practice : null;
  const showInstall = isIOS() && !isStandalone() && !s.settings.hideInstall;
  const theme = s.settings.theme;

  ctx.render(`<div class="wrap stack">
    <section class="card hero" aria-label="Exam facts">
      <div class="hero-k">AWS Certified Solutions Architect – Associate</div>
      <div class="facts">
        <div><b>65</b><span>questions</span></div>
        <div><b>130</b><span>minutes</span></div>
        <div><b>720</b><span>pass mark out of 1000</span></div>
      </div>
      <div>
        <div class="weights" aria-hidden="true">${DOMAINS.map(d => `<i style="--c:var(--d${d.id});width:${d.weight}%"></i>`).join('')}</div>
        <div class="legend" style="margin-top:8px">${DOMAINS.map(d => `<span><i style="--c:var(--d${d.id})"></i>${esc(d.name)} ${d.weight}%</span>`).join('')}</div>
      </div>
    </section>

    ${exam ? `<section class="card resume ${examLeft <= 0 ? 'alert' : ''}">
      <div class="resume-main"><b>${examLeft > 0 ? 'Exam in progress' : 'Exam time is up'}</b>
        <span>${Object.keys(exam.chosen).filter(k => exam.chosen[k]?.length).length} of ${exam.ids.length} answered${examLeft > 0 ? ` · ${fmtClock(examLeft)} left` : ''}</span></div>
      <div class="resume-actions"><button type="button" class="btn primary sm" data-act="exam">${examLeft > 0 ? 'Resume' : 'See results'}</button></div>
    </section>` : ''}

    ${prac ? `<section class="card resume">
      <div class="resume-main"><b>Practice session</b><span>Question ${Math.min(prac.i + 1, prac.ids.length)} of ${prac.ids.length}</span></div>
      <div class="resume-actions"><a class="btn primary sm" href="#/practice/run">Resume</a></div>
    </section>` : ''}

    ${reviewHTML(rq)}

    <section>
      <h2 class="label">Start</h2>
      <div class="actions">
        <button type="button" class="action primary" data-act="quick">${icon('practice', 22)}<b>Quick practice</b><span>10 random questions with explanations</span></button>
        <a class="action" href="#/exam">${icon('exam', 22)}<b>Mock exam</b><span>Timed, scored at the end</span></a>
        <a class="action" href="#/labs">${icon('labs', 22)}<b>Console labs</b><span>Step-by-step scenarios</span></a>
        <a class="action" href="#/cards">${icon('cards', 22)}<b>Flashcards</b><span>Quick recall of exam facts</span></a>
      </div>
    </section>

    <section>
      <h2 class="label">Your progress</h2>
      <div class="tiles">
        <div class="tile"><b>${seenQs.length}<small class="muted" style="font-size:14px;font-weight:600"> / ${QUESTIONS.length}</small></b><span>questions tried</span></div>
        <div class="tile"><b>${seen ? pct(correct, seen) + '%' : '—'}</b><span>accuracy</span></div>
        <div class="tile"><b>${s.exams.length}</b><span>mock exams done</span></div>
        <div class="tile"><b>${s.exams.length ? best + '%' : '—'}</b><span>best exam score</span></div>
      </div>
    </section>

    <section>
      <h2 class="label">Readiness</h2>
      ${readinessHTML(ready)}
    </section>

    <section>
      <h2 class="label">Weak spots</h2>
      <div class="card stack-sm">
        ${weak.length ? `
          <p class="small muted">Services where you’re below 80%. Tap one to review it.</p>
          <div class="chips wrapc">${weak.map(w => `<a class="chip" href="#/learn/${w.svc.id}">${esc(w.svc.name)} <span class="n">${pct(w.correct, w.seen)}%</span></a>`).join('')}</div>
          <button type="button" class="btn block" data-act="weak">${icon('target', 18)} Practice weak spots</button>`
        : `<p class="small muted">Answer a few questions and the services you get wrong most will show up here.</p>`}
      </div>
    </section>

    ${showInstall ? `<section class="card stack-sm">
      <h3 style="display:flex;gap:8px;align-items:center">${icon('download')} Install on your iPhone</h3>
      <p class="small muted">In Safari, tap ${icon('share', 16).replace('class="i"', 'class="i" style="display:inline;vertical-align:-3px"')} <b>Share</b>, then <b>Add to Home Screen</b>. It opens full screen and works offline.</p>
      <button type="button" class="btn sm" data-act="hide-install">Got it</button>
    </section>` : ''}

    <section>
      <h2 class="label">Settings</h2>
      <div class="list">
        <div class="row static row-stack">
          <span class="row-main"><span class="row-title">Appearance</span></span>
          <div class="seg" role="group" aria-label="Appearance">
            ${[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-theme="${k}" aria-pressed="${theme === k}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="row static row-stack">
          <span class="row-main"><span class="row-title">App version</span><span class="row-sub version" id="update-status">Build ${esc(BUILD)}</span></span>
          <div class="dock-row">
            <button type="button" class="btn sm" data-act="check-update">${icon('refresh', 18)} Check for updates</button>
          </div>
        </div>
        <button type="button" class="row" data-act="reload">
          <span class="row-main"><span class="row-title">Reload app</span><span class="row-sub">Clears cached files and loads the newest version. Your progress stays.</span></span>${icon('refresh', 20)}
        </button>
        <button type="button" class="row" data-act="reset">
          <span class="row-main"><span class="row-title" style="color:var(--bad)">Reset progress</span><span class="row-sub">Deletes answer history and exam results on this device.</span></span>
        </button>
      </div>
    </section>

    <p class="foot">Original practice content written for studying. Not affiliated with or endorsed by Amazon Web Services. Always check the official SAA-C03 exam guide for the current scope. Progress is saved on this device only.</p>
  </div>`);

  ctx.on('click', async e => {
    const themeBtn = e.target.closest('[data-theme]');
    if (themeBtn) {
      store.update(st => { st.settings.theme = themeBtn.dataset.theme; });
      applyTheme(themeBtn.dataset.theme);
      ctx.view.querySelectorAll('[data-theme]').forEach(b => b.setAttribute('aria-pressed', b === themeBtn));
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'quick') startPractice(ctx, { filters: { source: 'all', domains: [], services: [], count: 10 } });
    if (act === 'review') startPractice(ctx, { ids: rq.due, limit: 20 });
    if (act === 'weak') {
      const ids = new Set(weak.map(w => w.svc.id));
      const qs = QUESTIONS.filter(q => q.services.some(id => ids.has(id))).map(q => q.id);
      startPractice(ctx, { ids: qs.slice(0, 200), limit: 15 });
    }
    if (act === 'exam') {
      if (examLeft > 0) ctx.go('#/exam/run');
      else { const id = finalizeExam(true); ctx.go(id ? `#/exam/result/${id}` : '#/exam'); }
    }
    if (act === 'hide-install') { store.update(st => { st.settings.hideInstall = true; }); ctx.go('#/'); }
    if (act === 'check-update') {
      const status = ctx.view.querySelector('#update-status');
      if (!updatesSupported) { status.textContent = `Build ${BUILD} · updates need the hosted app`; return; }
      status.textContent = 'Checking…';
      const r = await checkForUpdate();
      if (r === 'available') {
        status.textContent = `Build ${BUILD} · update ready`;
        showToast({ title: 'Update available', body: 'Reload to get the latest version.', action: 'Reload', onAction: () => { hideToast(); applyUpdate(); } });
      } else if (r === 'offline') {
        status.textContent = `Build ${BUILD} · you’re offline`;
      } else {
        status.textContent = `Build ${BUILD} · you’re up to date`;
      }
    }
    if (act === 'reload') {
      const ok = await confirmDialog({ title: 'Reload the app?', body: 'Cached files are cleared and the newest version is loaded. Your progress is kept.', confirm: 'Reload' });
      if (ok) hardReload();
    }
    if (act === 'reset') {
      const ok = await confirmDialog({ title: 'Reset all progress?', body: 'This deletes your answer history, exam results and lab progress on this device. It can’t be undone.', confirm: 'Reset', danger: true });
      if (ok) { store.resetProgress(); ctx.go('#/'); }
    }
  });

  if (exam && examLeft > 0) {
    const t = setInterval(() => {
      const left = exam.deadline - Date.now();
      if (left <= 0) { clearInterval(t); ctx.go('#/'); }
    }, 5000);
    return () => clearInterval(t);
  }
  return undefined;
}

