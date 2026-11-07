// Progress lives in localStorage on this device. Every access is guarded:
// private mode or blocked storage falls back to memory for the session.
import { DOMAINS, qById } from '../data/questions.js';

const KEY = 'saa-prep.v1';
const DAY = 864e5;

/** Days until a missed question comes back: wrong → 1 day, then 3, then 7, then it’s cleared. */
export const REVIEW_STEPS = [1, 3, 7];
/** Readiness uses this many recent answers per domain, and needs at least READY_MIN in each. */
export const RECENT = 30;
export const READY_MIN = 8;
/** Target used for readiness and exam results (720 of 1000 is roughly 72%). */
export const PASS = 72;

const defaults = () => ({
  v: 2,
  answers: {},        // qid -> { seen, correct, last, at, step?, due? }
  recent: {},         // domain id -> '1011…' (1 = right), newest last, max RECENT
  cards: {},          // flashcard id -> { seen, ok, last, at }
  exams: [],          // finished exam results, newest first
  activeExam: null,   // exam in progress
  practice: null,     // practice session in progress
  labSession: null,   // lab in progress
  labs: {},           // labId -> { best, total, at }
  settings: { theme: 'system' },
});

const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const d = defaults();
    const s = { ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings || {}) } };
    if (!parsed.v || parsed.v < 2) migrate(s);
    return s;
  } catch {
    return defaults();
  }
}

// v1 → v2: past mistakes join the review schedule, and readiness history is
// rebuilt from each question’s latest result.
function migrate(s) {
  const list = Object.entries(s.answers).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  s.recent = {};
  list.forEach(([qid, a]) => {
    const q = qById(qid);
    if (!q) return;
    s.recent[q.domain] = ((s.recent[q.domain] || '') + (a.last ? '1' : '0')).slice(-RECENT);
    if (a.last === false && a.due == null) { a.step = 0; a.due = dayStart(a.at || Date.now()) + REVIEW_STEPS[0] * DAY; }
  });
  s.cards = s.cards || {};
  s.v = 2;
}

export const store = {
  get state() { return state; },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  },
  update(fn) { fn(state); this.save(); },
  resetProgress() {
    const settings = state.settings;
    state = defaults();
    state.settings = settings;
    this.save();
  },
};

export function recordAnswer(qid, correct, save = true) {
  const now = Date.now();
  const a = state.answers[qid] || (state.answers[qid] = { seen: 0, correct: 0 });
  a.seen += 1;
  if (correct) a.correct += 1;
  a.last = correct;
  a.at = now;

  // Spaced review. A right answer only moves the schedule on when the
  // question is actually due, so seeing it again early doesn’t skip a step.
  if (!correct) {
    a.step = 0;
    a.due = dayStart(now) + REVIEW_STEPS[0] * DAY;
  } else if (a.due != null && now >= a.due) {
    const next = (a.step || 0) + 1;
    if (next >= REVIEW_STEPS.length) { delete a.step; delete a.due; }
    else { a.step = next; a.due = dayStart(now) + REVIEW_STEPS[next] * DAY; }
  }

  const q = qById(qid);
  if (q) state.recent[q.domain] = ((state.recent[q.domain] || '') + (correct ? '1' : '0')).slice(-RECENT);
  if (save) store.save();
}

/** Questions in the review schedule: ids due now, when the next one is due, and how many in total. */
export function reviewQueue(now = Date.now()) {
  const due = [];
  let next = null, total = 0;
  for (const [id, a] of Object.entries(state.answers)) {
    if (a.due == null || !qById(id)) continue;
    total++;
    if (a.due <= now) due.push(id);
    else if (next == null || a.due < next) next = a.due;
  }
  due.sort((x, y) => state.answers[x].due - state.answers[y].due);
  return { due, next, total };
}

/** Estimated readiness from recent answers, weighted like the exam. score is null until every domain has READY_MIN answers. */
export function readiness() {
  const doms = DOMAINS.map(d => {
    const r = state.recent[d.id] || '';
    const ok = [...r].filter(c => c === '1').length;
    return { d, n: r.length, acc: r.length ? Math.round(ok / r.length * 100) : null };
  });
  const ready = doms.every(x => x.n >= READY_MIN);
  const score = ready ? Math.round(doms.reduce((sum, x) => sum + x.acc * x.d.weight, 0) / DOMAINS.reduce((w, d) => w + d.weight, 0)) : null;
  return { doms, score };
}

export function recordCard(id, ok) {
  const c = state.cards[id] || (state.cards[id] = { seen: 0, ok: 0 });
  c.seen += 1;
  if (ok) c.ok += 1;
  c.last = ok;
  c.at = Date.now();
}
