// Progress lives in localStorage on this device. Every access is guarded:
// private mode or blocked storage falls back to memory for the session.
const KEY = 'saa-prep.v1';

const defaults = () => ({
  answers: {},        // qid -> { seen, correct, last, at }
  exams: [],          // finished exam results, newest first
  activeExam: null,   // exam in progress
  practice: null,     // practice session in progress
  labSession: null,   // lab in progress
  labs: {},           // labId -> { best, total, at }
  settings: { theme: 'system' },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const d = defaults();
    return { ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings || {}) } };
  } catch {
    return defaults();
  }
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
  const a = state.answers[qid] || (state.answers[qid] = { seen: 0, correct: 0 });
  a.seen += 1;
  if (correct) a.correct += 1;
  a.last = correct;
  a.at = Date.now();
  if (save) store.save();
}
