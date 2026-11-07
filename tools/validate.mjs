// Checks the content files for mistakes: run `node tools/validate.mjs`.
// Catches wrong answer indexes, missing explanations, unknown service ids,
// duplicate ids and broken comparison links.
import { QUESTIONS, DOMAINS } from '../data/questions.js';
import { SERVICES, COMPARISONS, CATEGORIES } from '../data/services.js';
import { LABS } from '../data/labs.js';
import { DIAGRAMS } from '../data/diagrams.js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const svcIds = new Set(SERVICES.map(s => s.id));
const cmpIds = new Set(COMPARISONS.map(c => c.id));
const catIds = new Set(CATEGORIES.map(c => c.id));

const dupes = (list, label) => {
  const seen = new Set();
  list.forEach(x => { if (seen.has(x.id)) err(label, `duplicate id ${x.id}`); seen.add(x.id); });
};
dupes(QUESTIONS, 'questions');
dupes(SERVICES, 'services');
dupes(COMPARISONS, 'comparisons');
dupes(LABS, 'labs');

function checkMcq(item, where) {
  if (!item.q) err(where, 'missing question text');
  if (!Array.isArray(item.options) || item.options.length < 2) err(where, 'needs at least 2 options');
  if (!Array.isArray(item.answer) || !item.answer.length) err(where, 'missing answer');
  item.answer?.forEach(a => { if (a < 0 || a >= item.options.length) err(where, `answer index ${a} out of range`); });
  if (new Set(item.answer).size !== item.answer?.length) err(where, 'duplicate answer index');
  if (!Array.isArray(item.why) || item.why.length !== item.options.length) err(where, `why has ${item.why?.length} entries, options has ${item.options?.length}`);
  item.why?.forEach((w, i) => { if (!w || !w.trim()) err(where, `empty explanation for option ${i}`); });
}

QUESTIONS.forEach(q => {
  const w = `question ${q.id}`;
  checkMcq(q, w);
  if (!DOMAINS.some(d => d.id === q.domain)) err(w, `unknown domain ${q.domain}`);
  if (!q.services?.length) err(w, 'no services');
  q.services?.forEach(s => { if (!svcIds.has(s)) err(w, `unknown service ${s}`); });
  if (q.compare && !cmpIds.has(q.compare)) err(w, `unknown comparison ${q.compare}`);
  if (!q.study) err(w, 'missing study text');
  if (q.answer.length > 1 && !/choose (two|three|2|3)/i.test(q.q)) err(w, 'multi-answer question should say "Choose two"');
});

SERVICES.forEach(s => {
  const w = `service ${s.id}`;
  ['name', 'short', 'one', 'about', 'docs'].forEach(k => { if (!s[k]) err(w, `missing ${k}`); });
  if (!catIds.has(s.cat)) err(w, `unknown category ${s.cat}`);
  ['must', 'use', 'avoid'].forEach(k => { if (!s[k]?.length) err(w, `missing ${k}`); });
  s.related?.forEach(r => { if (!svcIds.has(r)) err(w, `unknown related ${r}`); });
  if (s.table) s.table.rows.forEach((r, i) => { if (r.length !== s.table.cols.length) err(w, `table row ${i} has ${r.length} cells, expected ${s.table.cols.length}`); });
});

COMPARISONS.forEach(c => {
  const w = `comparison ${c.id}`;
  c.services.forEach(s => { if (!svcIds.has(s)) err(w, `unknown service ${s}`); });
  c.cats.forEach(k => { if (!catIds.has(k)) err(w, `unknown category ${k}`); });
  c.table.rows.forEach((r, i) => { if (r.length !== c.table.cols.length) err(w, `row ${i} has ${r.length} cells, expected ${c.table.cols.length}`); });
});

LABS.forEach(l => {
  const w = `lab ${l.id}`;
  l.services.forEach(s => { if (!svcIds.has(s)) err(w, `unknown service ${s}`); });
  l.steps.forEach((st, i) => {
    checkMcq(st, `${w} step ${i + 1}`);
    if (!st.do) err(`${w} step ${i + 1}`, 'missing "do"');
    if (!st.screen) err(`${w} step ${i + 1}`, 'missing "screen"');
  });
});

// Diagrams: links, files on disk, offline cache and colour classes.
const root = new URL('..', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const css = readFileSync(new URL('css/app.css', root), 'utf8');
dupes(DIAGRAMS, 'diagrams');
DIAGRAMS.forEach(d => {
  const w = `diagram ${d.id}`;
  ['title', 'topic', 'blurb', 'h'].forEach(k => { if (!d[k]) err(w, `missing ${k}`); });
  if (!d.services.length && !d.compares.length) err(w, 'not linked to any service or comparison');
  d.services.forEach(s => { if (!svcIds.has(s)) err(w, `unknown service ${s}`); });
  d.compares.forEach(c => { if (!cmpIds.has(c)) err(w, `unknown comparison ${c}`); });
  const file = `assets/diagrams/${d.id}.svg`;
  if (!existsSync(new URL(file, root))) { err(w, `missing ${file}`); return; }
  const svg = readFileSync(new URL(file, root), 'utf8');
  const vb = svg.match(/viewBox="[\d.-]+ [\d.-]+ 390 ([\d.]+)"/);
  if (!vb) err(w, 'SVG needs a viewBox 390 wide');
  else if (Number(vb[1]) !== d.h) err(w, `h is ${d.h} but the SVG is ${vb[1]} tall`);
  if (/(fill|stroke)="#/.test(svg)) err(w, 'hard-coded colour in SVG; use f-*/s-* classes so dark mode works');
  if (!sw.includes(`'${file}'`)) err(w, `add '${file}' to SHELL in sw.js for offline use`);
  new Set([...svg.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(' ')).filter(c => /^[fs]-/.test(c)))
    .forEach(c => { if (!css.includes(`.ig .${c} `)) err(w, `no CSS rule for colour class ${c}`); });
});

// Every data file must be cached for offline use.
readdirSync(new URL('data/', root)).filter(f => f.endsWith('.js')).forEach(f => {
  if (!sw.includes(`'data/${f}'`)) err('sw.js', `add 'data/${f}' to SHELL for offline use`);
});

// Same question twice (e.g. pasted into two files).
const seenQ = new Map();
QUESTIONS.forEach(q => {
  const k = q.q.toLowerCase().replace(/\W+/g, ' ').trim();
  if (seenQ.has(k)) err(`question ${q.id}`, `same text as ${seenQ.get(k)}`);
  seenQ.set(k, q.id);
});

// Giveaway check: the right answer must not stand out by being much longer
// than every wrong option (test-takers learn to "pick the longest").
QUESTIONS.filter(q => q.answer.length === 1).forEach(q => {
  const right = q.options[q.answer[0]].length;
  const wrong = Math.max(...q.options.filter((_, i) => i !== q.answer[0]).map(o => o.length));
  if (right > wrong * 1.3) err(`question ${q.id}`, `correct option is ${Math.round((right / wrong - 1) * 100)}% longer than every other option; trim it or add detail to a wrong one`);
});
const longest = QUESTIONS.filter(q => q.answer.length === 1 && q.options.every((o, i) => i === q.answer[0] || o.length < q.options[q.answer[0]].length)).length;
const single = QUESTIONS.filter(q => q.answer.length === 1).length;

const byDomain = DOMAINS.map(d => `${d.name}: ${QUESTIONS.filter(q => q.domain === d.id).length}`).join(', ');
const multi = QUESTIONS.filter(q => q.answer.length > 1).length;
console.log(`${QUESTIONS.length} questions (${byDomain}; ${multi} multi-answer)`);
console.log(`${SERVICES.length} services, ${COMPARISONS.length} comparisons, ${DIAGRAMS.length} diagrams, ${LABS.length} labs, ${LABS.reduce((n, l) => n + l.steps.length, 0)} lab steps`);
const unused = SERVICES.filter(s => !QUESTIONS.some(q => q.services.includes(s.id))).map(s => s.id);
if (unused.length) console.log(`services without questions: ${unused.join(', ')}`);
console.log(`correct answer is the longest option in ${longest} of ${single} single-answer questions (${Math.round(longest / single * 100)}%), never by more than 30%`);

if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('All content checks passed.');
