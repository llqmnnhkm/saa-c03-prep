// Shared rendering for questions (practice, exam, review and lab steps).
import { esc, md, plain, clip, LETTERS } from './util.js';
import { icon } from './icons.js';
import { DOMAINS } from '../data/questions.js';
import { svcById, COMPARISONS } from '../data/services.js';

export const isCorrect = (q, chosen = []) =>
  chosen.length === q.answer.length && q.answer.every(a => chosen.includes(a));

export function domainTag(id) {
  const d = DOMAINS.find(x => x.id === id);
  return d ? `<span class="tag" style="--c:var(--d${d.id})">${esc(d.name)}</span>` : '';
}

/**
 * q:        { q, options, answer, why, domain? }
 * order:    display position -> original option index
 * chosen:   original option indexes the user picked
 * revealed: show right/wrong with an explanation under every option
 */
export function questionHTML(q, { order, chosen = [], revealed = false, meta = true }) {
  const multi = q.answer.length > 1;
  const correctLetters = order
    .map((oi, pos) => (q.answer.includes(oi) ? LETTERS[pos] : null))
    .filter(Boolean)
    .join(' and ');

  let verdict = '';
  if (revealed) {
    const ok = isCorrect(q, chosen);
    const skipped = !chosen.length;
    const cls = skipped ? 'skip' : ok ? 'ok' : 'bad';
    const title = skipped ? 'Not answered' : ok ? 'Correct' : 'Not quite';
    const sub = ok
      ? 'Now read why the other options are wrong. That’s where the exam traps are.'
      : `The correct answer is ${correctLetters}.`;
    verdict = `<div class="verdict ${cls}" role="status">${icon(ok ? 'check' : skipped ? 'minus' : 'x', 22)}<div>${title}<small>${sub}</small></div></div>`;
  }

  const opts = order.map((oi, pos) => {
    const sel = chosen.includes(oi);
    const right = q.answer.includes(oi);
    let state = '';
    if (revealed) state = right ? 'is-correct' : sel ? 'is-wrong' : 'is-dim';
    else if (sel) state = 'is-selected';
    const key = LETTERS[pos];
    let why = '';
    if (revealed && q.why) {
      const label = right
        ? (sel ? 'Your answer · why it’s right' : 'Correct answer · why')
        : (sel ? 'Your answer · why it’s wrong' : 'Why it’s wrong');
      why = `<div class="opt-why"><span class="why-label">${label}</span>${md(q.why[oi])}</div>`;
    }
    const aria = `${LETTERS[pos]}: ${esc(plain(q.options[oi]))}`;
    return `<div class="opt ${state}">
      <button type="button" class="opt-btn" data-opt="${oi}" ${revealed ? 'disabled' : ''} aria-pressed="${sel}" aria-label="${aria}">
        <span class="opt-key${multi ? ' sq' : ''}" aria-hidden="true">${key}</span><span class="opt-text">${md(q.options[oi])}</span>
      </button>${why}</div>`;
  }).join('');

  const tags = [
    meta && q.domain ? domainTag(q.domain) : '',
    multi ? `<span class="tag" style="--c:var(--text-2)">Choose ${q.answer.length}</span>` : '',
  ].join('');

  return `<article class="q">
    ${tags ? `<div class="q-meta">${tags}</div>` : ''}
    <p class="q-stem">${md(q.q)}</p>
    ${verdict}
    <div class="opts" role="group" aria-label="Answer options">${opts}</div>
  </article>`;
}

export function studyHTML(q) {
  const chips = (q.services || [])
    .map(id => svcById(id))
    .filter(Boolean)
    .map(s => `<a class="chip" href="#/learn/${s.id}">${esc(s.name)}</a>`)
    .join('');
  const cmp = q.compare ? COMPARISONS.find(c => c.id === q.compare) : null;
  const cmpChip = cmp ? `<a class="chip" href="#/learn/compare/${cmp.id}">${icon('columns', 16)}${esc(cmp.title)}</a>` : '';
  return `<section class="card study">
    <h3>${icon('bulb')} Study more</h3>
    <p>${md(q.study)}</p>
    ${chips || cmpChip ? `<div class="chips wrapc">${chips}${cmpChip}</div>` : ''}
  </section>`;
}

export function reviewHTML(q, { order, chosen = [], n, flagged = false }) {
  const ok = isCorrect(q, chosen);
  const skipped = !chosen.length;
  const st = skipped ? 'skip' : ok ? 'ok' : 'bad';
  const label = skipped ? 'Not answered' : ok ? 'Correct' : 'Incorrect';
  return `<details class="review ${st}">
    <summary>
      <span class="rv-mark" aria-label="${label}">${icon(skipped ? 'minus' : ok ? 'check' : 'x', 15)}</span>
      <span class="rv-n">${n}</span>
      <span class="rv-q">${esc(clip(plain(q.q), 120))}</span>
      ${flagged ? `<span class="rv-flag" aria-label="Flagged">${icon('flag', 16)}</span>` : ''}
      <span class="rv-chev">${icon('chevron-right', 18)}</span>
    </summary>
    <div class="rv-body">${questionHTML(q, { order, chosen, revealed: true })}${studyHTML(q)}</div>
  </details>`;
}

// Services that show up most in a list of missed questions.
export function weakServices(questions) {
  const tally = new Map();
  questions.forEach(q => (q.services || []).forEach(id => tally.set(id, (tally.get(id) || 0) + 1)));
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ svc: svcById(id), n }))
    .filter(x => x.svc)
    .slice(0, 8);
}

export function weakChips(list) {
  return list.map(({ svc, n }) =>
    `<a class="chip" href="#/learn/${svc.id}">${esc(svc.name)} <span class="n">${n}</span></a>`).join('');
}
