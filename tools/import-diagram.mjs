// Imports a light/dark SVG pair (e.g. exported from Claude Design) as one
// themed diagram: colours become f-*/s-* classes (see "Infographics" in
// css/app.css), ids are namespaced, the title/description text at the top is
// moved out (the app shows it as HTML) and the drawing is cropped.
//
//   npm i --no-save puppeteer-core
//   node tools/import-diagram.mjs light.svg dark.svg <diagram-id>
//
// Set BROWSER to a Chrome/Edge executable if the default path is wrong.
// Then add the printed entry to data/diagrams.js, add the file to SHELL in
// sw.js and run `node tools/validate.mjs`.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const [lightPath, darkPath, id] = process.argv.slice(2);
if (!id) { console.error('usage: node tools/import-diagram.mjs light.svg dark.svg <diagram-id>'); process.exit(1); }
const BROWSER = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// light|dark colour pair -> token. Add a pair here (and its CSS rule) if a new design uses one.
const TOKENS = {
  '#15181D|#ECEEF1': 'ink',
  '#565D69|#9AA1AC': 'muted',
  '#1F6FEB|#5C9DFF': 'accent',
  '#FFFFFF|#0D0E11': 'canvas',
  '#F3F4F6|#17191D': 'panel',
  '#C3C8D0|#3B4048': 'line',
  '#A595D9|#6857A8': 'violet-line',
  '#4B3891|#C3B6F3': 'violet-ink',
  '#EEEAFA|#1E1A2D': 'violet-fill',
  '#DFA766|#8A6232': 'amber-line',
  '#83500F|#F0C087': 'amber-ink',
  '#FCEFDF|#291F14': 'amber-fill',
  '#84C29E|#3D7955': 'green-line',
  '#1D6640|#8FD4AA': 'green-ink',
  '#E6F4EC|#13241A': 'green-fill',
  '#E7EFFD|#13213A': 'tip-fill',
};

const strip = s => s.replace(/<metadata>[\s\S]*?<\/metadata>/, '').replace(/\s+xmlns:c2pa="[^"]*"/, '');
const COLOR_ATTR = /\s(fill|stroke)="(#[0-9A-Fa-f]{6})"/g;
const L = strip(readFileSync(lightPath, 'utf8'));
const D = strip(readFileSync(darkPath, 'utf8'));
if (L.replace(COLOR_ATTR, 'C') !== D.replace(COLOR_ATTR, 'C')) throw new Error('light and dark files differ in more than colours');
const darkColours = [...D.matchAll(COLOR_ATTR)].map(m => m[2].toUpperCase());

let n = 0;
let svg = L.replace(/<([a-zA-Z]+)(\s[^<>]*?)?(\/?)>/g, (tag, name, attrs = '', self) => {
  const cls = [];
  attrs = attrs.replace(COLOR_ATTR, (_, kind, hex) => {
    const key = `${hex.toUpperCase()}|${darkColours[n++]}`;
    if (!TOKENS[key]) throw new Error(`no token for colour pair ${key}`);
    cls.push(`${kind === 'fill' ? 'f' : 's'}-${TOKENS[key]}`);
    return '';
  });
  if (cls.length) attrs += ` class="${cls.join(' ')}"`;
  return `<${name}${attrs}${self}>`;
});
if (/#[0-9A-Fa-f]{6}/.test(svg)) throw new Error('a colour outside fill/stroke was left behind');
svg = svg.replace(/\sid="([^"]+)"/g, ` id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`);

const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true });
const page = await browser.newPage();
await page.setContent(`<body style="margin:0">${svg}</body>`);
const res = await page.evaluate(() => {
  const root = document.querySelector('svg');
  const kids = [...root.children].filter(el => el.tagName !== 'defs');
  const bg = kids.shift();
  const head = [];
  while (kids[0]?.tagName === 'text' && (head.length < 2 || kids[0].getAttribute('font-size') === '14')) head.push(kids.shift());
  const [topic, title, ...desc] = head.map(t => t.textContent.trim());
  head.forEach(t => t.remove());
  let top = Infinity, bottom = -Infinity;
  kids.forEach(el => { const b = el.getBBox(); if (b.height) { top = Math.min(top, b.y); bottom = Math.max(bottom, b.y + b.height); } });
  const y = Math.floor(top - 12), h = Math.ceil(bottom + 20) - y;
  root.setAttribute('viewBox', `0 ${y} 390 ${h}`);
  root.removeAttribute('width');
  root.removeAttribute('height');
  bg.setAttribute('y', y);
  bg.setAttribute('height', h);
  return { topic, title, blurb: desc.join(' '), h, svg: root.outerHTML };
});
await browser.close();

const out = res.svg
  .replace('<svg ', `<svg class="ig-svg" role="img" aria-label="${res.title}" `)
  .replace(/<(path|line|rect|circle|polyline|polygon|ellipse)([^>]*)><\/\1>/g, '<$1$2/>');
const file = new URL(`../assets/diagrams/${id}.svg`, import.meta.url);
writeFileSync(file, out + '\n');
const topic = res.topic ? res.topic[0] + res.topic.slice(1).toLowerCase() : '';
console.log(`wrote assets/diagrams/${id}.svg (${out.length} bytes). Entry for data/diagrams.js:\n`);
console.log(`  {\n    id: '${id}', title: ${JSON.stringify(res.title)}, topic: '${topic}', h: ${res.h},\n    blurb: ${JSON.stringify(res.blurb)},\n    services: [], compares: [],\n  },`);
