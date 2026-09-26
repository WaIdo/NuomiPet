import { CATALOG } from '../src/renderer/shared/pet-art.js';
import { PetView } from '../src/renderer/shared/pet-view.js';

const q = new URLSearchParams(location.search);
if (q.get('static')) document.body.classList.add('static');
const root = document.getElementById('root');
const section = (title, cls = '') => {
  const h = document.createElement('h2'); h.textContent = title; root.append(h);
  const r = document.createElement('div'); r.className = 'row ' + cls; root.append(r); return r;
};
const cell = (row, look, label, setup, w) => {
  const c = document.createElement('div'); c.className = 'cell'; if (w) c.style.setProperty('--w', w + 'px');
  const p = document.createElement('div'); p.className = 'p'; c.append(p);
  const t = document.createElement('div'); t.textContent = label; c.append(t);
  row.append(c);
  const v = new PetView(p, look); if (setup) setup(v); return v;
};

const only = q.get('only');
if (!only || only === 'species') {
  const r = section('物种 × 配色');
  for (const sp of CATALOG.species) for (const pal of ['milk', 'sakura', 'milktea', 'custard', 'mist', 'cocoa'])
    cell(r, { species: sp.id, color: pal }, `${sp.name}·${pal}`, null, 110);
}
if (!only || only === 'palettes') {
  const r = section('全部配色（猫猫）');
  for (const pal of CATALOG.palettes) cell(r, { species: 'cat', color: pal.id }, pal.name, null, 110);
}
if (!only || only === 'faces') {
  const r = section('表情');
  const faces = [['normal','cat'],['happy','open'],['closed','smile'],['surprised','o'],['squeeze','wavy'],['heart','open'],['dizzy','wavy'],['wink','tongue'],['sad','wavy'],['sleepy','yawn'],['normal','chew']];
  for (const [e, m] of faces) cell(r, { species: 'cat', color: 'sakura', accessory: 'bow' }, `${e}/${m}`, v => v.setFace(e, m));
  for (const [e, m] of faces.slice(0, 6)) cell(r, { species: 'chick', color: 'custard' }, `${e}/${m}`, v => v.setFace(e, m));
}
if (!only || only === 'acc') {
  const r = section('配饰');
  const sps = ['cat', 'bunny', 'bear', 'puppy', 'hamster', 'chick'];
  CATALOG.accessories.forEach((a, i) => cell(r, { species: sps[i % 6], color: ['milk','sakura','milktea','caramel','peach','custard'][i % 6], accessory: a.id }, a.name));
  const r2 = section('配饰（兔兔）');
  CATALOG.accessories.forEach((a) => cell(r2, { species: 'bunny', color: 'milk', accessory: a.id }, a.name, null, 100));
}
if (!only || only === 'marks') {
  const r = section('花纹');
  for (const sp of ['cat', 'puppy', 'bear', 'hamster']) for (const m of CATALOG.markings)
    cell(r, { species: sp, color: sp === 'hamster' ? 'caramel' : 'milktea', markings: m.id }, `${sp}·${m.name}`, null, 110);
}
if (!only || only === 'paws') {
  const r = section('爪子/姿势');
  for (const sp of ['cat', 'chick']) for (const pz of ['rest', 'up', 'hold', 'wave', 'cover', 'belly', 'stretch'])
    cell(r, { species: sp, color: sp === 'chick' ? 'custard' : 'mist' }, `${sp}·${pz}`, v => { v.setPaws(pz, true); if (pz === 'hold') v.setProp('🍓'); if (pz === 'cover') v.setFace('closed', 'smile'); }, 110);
}
if (!only || only === 'big') {
  const r = section('大图');
  cell(r, { species: q.get('sp') || 'cat', color: q.get('c') || 'milk', accessory: q.get('a') || 'bow', markings: q.get('m') || 'none' }, 'big', null, 420);
}
if (only === 'bigall') {
  const r = section('大图全物种');
  const accs = (q.get('a') || 'bow,flower,sprout,crown,partyhat,heartclip').split(',');
  const cols = (q.get('c') || 'milk,sakura,milktea,caramel,peach,custard').split(',');
  CATALOG.species.forEach((sp, i) => cell(r, { species: sp.id, color: cols[i % cols.length], accessory: accs[i % accs.length], markings: q.get('m') || 'none' }, sp.name, null, +(q.get('w') || 280)));
}
window.__ready = true;
if (only === 'sleep') {
  const r = section('睡觉');
  for (const sp of ['cat', 'bunny', 'chick']) cell(r, { species: sp, color: 'milk' }, sp, (v) => { v.setPose('sleep'); v.setFace('closed', 'smile'); v.setFlag('ears-down', true); }, 200);
}
