import { store } from '../store.js';
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

export function render(ctx) {
  ctx.header({ title: 'SAA-C03 Prep', large: 'SAA-C03 Prep' });
  const s = store.state;
  const answers = s.answers;

  const seenQs = QUESTIONS.filter(q => answers[q.id]);
  let seen = 0, correct = 0;
  seenQs.forEach(q => { seen += answers[q.id].seen; correct += answers[q.id].correct; });
  const best = s.exams.reduce((m, e) => Math.max(m, pct(e.correct, e.total)), 0);

  const domains = DOMAINS.map(d => {
    let ds = 0, dc = 0;
    QUESTIONS.filter(q => q.domain === d.id && answers[q.id]).forEach(q => { ds += answers[q.id].seen; dc += answers[q.id].correct; });
    return { d, seen: ds, correct: dc };
  });

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

    <section>
      <h2 class="label">Start</h2>
      <div class="actions">
        <button type="button" class="action primary" data-act="quick">${icon('practice', 22)}<b>Quick practice</b><span>10 random questions with explanations</span></button>
        <a class="action" href="#/exam">${icon('exam', 22)}<b>Mock exam</b><span>Timed, scored at the end</span></a>
        <a class="action" href="#/labs">${icon('labs', 22)}<b>Console labs</b><span>Step-by-step scenarios</span></a>
        <a class="action" href="#/learn">${icon('learn', 22)}<b>Service notes</b><span>What to know for each service</span></a>
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
      <h2 class="label">Accuracy by domain</h2>
      <div class="card dom-rows">
        ${domains.map(({ d, seen: ds, correct: dc }) => `<div class="dom-row" style="--c:var(--d${d.id})">
          <div class="dom-row-top"><b>${esc(d.full)}</b><span>${ds ? pct(dc, ds) + '%' : 'Not started'}</span></div>
          <div class="bar"><span style="width:${ds ? pct(dc, ds) : 0}%"></span></div>
        </div>`).join('')}
      </div>
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

