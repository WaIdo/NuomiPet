// 信件窗口：信封飘进来 → 点一下拆开（火漆弹开、封口翻起、信纸抽出）→ 展开成可以读的信纸。
// 窗口本身是透明的，所有阴影都画在页面里。
import { t, fmtDate, syncLang, nickname, dirOf, getLang } from '../shared/i18n.mjs'; // 要最先执行：按语言填好名字和台词
const mochi = window.mochi;
const id = new URLSearchParams(location.search).get('id') || '';

const scene = document.getElementById('scene');
const petals = document.getElementById('petals');
const SVG_NS = 'http://www.w3.org/2000/svg';

let letter = null;
let state = null; // 应用数据：语言、对她的称呼
let opened = false;

// 界面文字：记下元素和取文字的函数，换了语言（或称呼）时就地更新，不重建页面，拆信的动画和进度都不受影响
const texts = [];
function setText({ node, fn, attr }) {
  const v = fn();
  if (attr) {
    if (node.getAttribute(attr) !== v) node.setAttribute(attr, v);
  } else if (node.textContent !== v) node.textContent = v;
}
function bindText(node, fn, attr) {
  const b = { node, fn, attr };
  texts.push(b);
  setText(b);
  return node;
}
const pageTitle = () => (letter && letter.title) || t('letter.untitled');
function refreshTexts() {
  texts.forEach(setText);
  const title = pageTitle();
  if (document.title !== title) document.title = title;
}

// 从右往左的界面（阿拉伯文）里，署名、称呼这些她写的内容用 Unicode 隔离符（FSI … PDI）包起来，
// 里面的标点、数字不会跑到句子另一头。从左往右的界面里原样返回
const isolate = (s) => (s && dirOf(getLang()) === 'rtl' ? `\u2068${s}\u2069` : s);

// text 可以是函数：界面文字，换语言时跟着变
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (typeof text === 'function') bindText(e, text);
  else if (text != null) e.textContent = text;
  return e;
}

function svgHeart(cls) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M12 20.4c-.3 0-.6-.1-.8-.3C7.6 17.1 3.2 13.6 3.2 9.3c0-2.8 2.2-5 4.8-5 1.6 0 3 .8 4 2 1-1.2 2.4-2 4-2 2.6 0 4.8 2.2 4.8 5 0 4.3-4.4 7.8-8 10.8-.2.2-.5.3-.8.3z');
  s.appendChild(p);
  return s;
}

function svgLock(cls) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M7.5 11V8.5a4.5 4.5 0 0 1 9 0V11M6.8 11h10.4c.8 0 1.4.6 1.4 1.4v5.8c0 .8-.6 1.4-1.4 1.4H6.8c-.8 0-1.4-.6-1.4-1.4v-5.8c0-.8.6-1.4 1.4-1.4z');
  s.appendChild(p);
  return s;
}

// 'YYYY-MM-DD' → { y, m, d }
function dateParts(key) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

function fmtYMD(key) {
  const p = dateParts(key);
  return p ? fmtDate(p) : '';
}

function fmtMD(key) {
  const p = dateParts(key);
  return p ? fmtDate(p, { withYear: false }) : '';
}

function close() {
  window.close();
}

/* ---------------- 信封 ---------------- */

function envelope(locked) {
  const env = el('div', 'env');
  env.append(el('span', 'env-back'));
  const paper = el('span', 'env-paper');
  paper.append(el('i'), el('i'), el('i'), el('i'));
  env.append(paper, el('span', 'env-front'), el('span', 'env-flap'));
  const seal = el('span', 'env-seal');
  seal.append(locked ? svgLock('seal-ico') : svgHeart('seal-ico'));
  env.append(seal);
  return env;
}

function intro() {
  const wrap = el('div', 'intro');
  const holder = el('div', 'env-holder');
  const btnEnv = el('button', 'env-btn');
  btnEnv.type = 'button';
  bindText(btnEnv, () => t('letter.openAria'), 'aria-label');
  btnEnv.append(envelope(false));
  holder.append(btnEnv, el('span', 'env-shadow'));
  const cap = el('div', 'caption');
  cap.append(el('p', 'cap-from', () => (letter.from ? t('letter.from', { name: isolate(letter.from) }) : t('letter.forYou'))), el('h2', 'cap-title', pageTitle));
  const open = el('button', 'btn primary', () => (letter.read ? t('letter.readAgain') : t('letter.open')));
  open.type = 'button';
  btnEnv.addEventListener('click', openLetter);
  open.addEventListener('click', openLetter);
  wrap.append(sparkles(), holder, cap, open);
  scene.append(wrap, paperCard());
  requestAnimationFrame(() => open.focus({ preventScroll: true }));
}

function lockedView() {
  const wrap = el('div', 'intro locked');
  const holder = el('div', 'env-holder');
  const box = el('div', 'env-btn');
  box.append(envelope(true));
  holder.append(box, el('span', 'env-shadow'));
  const cap = el('div', 'caption');
  const when = () => (letter.unlock ? t('letter.locked.seeYouOn', { date: fmtMD(letter.unlock) }) : t('letter.locked.seeYouLater'));
  cap.append(el('p', 'cap-from', () => t('letter.locked.notYet')), el('h2', 'cap-title', when));
  if (letter.daysLeft > 0) cap.append(el('p', 'cap-sub', () => t('letter.locked.daysLeft', { n: letter.daysLeft })));
  const ok = el('button', 'btn ghost', () => t('letter.locked.ok'));
  ok.type = 'button';
  ok.addEventListener('click', close);
  wrap.append(holder, cap, ok);
  scene.append(wrap);
  requestAnimationFrame(() => ok.focus({ preventScroll: true }));
}

function missingView() {
  const wrap = el('div', 'intro missing');
  const holder = el('div', 'env-holder');
  const box = el('div', 'env-btn');
  box.append(envelope(false));
  holder.append(box, el('span', 'env-shadow'));
  const cap = el('div', 'caption');
  cap.append(el('p', 'cap-from', () => t('letter.missing.huh')), el('h2', 'cap-title', () => t('letter.missing.title')));
  const ok = el('button', 'btn ghost', () => t('letter.missing.close'));
  ok.type = 'button';
  ok.addEventListener('click', close);
  wrap.append(holder, cap, ok);
  scene.append(wrap);
}

function sparkles() {
  const s = el('div', 'sparkles');
  s.setAttribute('aria-hidden', 'true');
  ['✦', '✧', '✦', '♡', '✧'].forEach((c, i) => s.append(el('i', 's' + i, c)));
  return s;
}

/* ---------------- 信纸 ---------------- */

function paperCard() {
  const card = el('article', 'letter');
  card.setAttribute('aria-hidden', 'true');
  card.append(el('span', 'washi'));
  const head = el('header', 'l-head');
  const kicker = () => {
    const nick = nickname(state);
    return nick ? t('letter.to', { nick: isolate(nick) }) : t('letter.toYou');
  };
  head.append(el('p', 'l-kicker', kicker), el('h1', 'l-title', pageTitle));
  if (dateParts(letter.unlock)) head.append(el('p', 'l-date', () => fmtYMD(letter.unlock)));
  const body = el('div', 'l-body');
  body.tabIndex = 0;
  const fade = () => body.classList.toggle('more', body.scrollTop + body.clientHeight < body.scrollHeight - 6);
  body.addEventListener('scroll', fade, { passive: true });
  body.__fade = fade;
  body.append(el('div', 'l-text', () => letter.body || ''));
  if (letter.from) body.append(el('p', 'l-sign', () => t('letter.signature', { name: isolate(letter.from) })));
  const foot = el('footer', 'l-foot');
  const keep = el('button', 'btn primary', () => t('letter.keep'));
  keep.type = 'button';
  keep.addEventListener('click', close);
  foot.append(keep);
  card.append(head, body, foot);
  return card;
}

function openLetter() {
  if (opened) return;
  opened = true;
  scene.classList.add('opening');
  Promise.resolve(mochi?.letters?.markRead(letter.id)).catch(() => {});
  setTimeout(() => {
    scene.classList.add('revealed');
    const card = scene.querySelector('.letter');
    card.removeAttribute('aria-hidden');
    const body = card.querySelector('.l-body');
    requestAnimationFrame(() => body.__fade && body.__fade());
    startPetals();
    setTimeout(() => card.querySelector('.l-body').focus({ preventScroll: true }), 700);
  }, 1450);
}

/* ---------------- 飘落的花瓣和爱心 ---------------- */

function startPetals() {
  const colors = ['#FFC2D6', '#FFB0C9', '#FFD6E4', '#FFE1EA', '#F7B8D0'];
  for (let i = 0; i < 16; i++) {
    const heart = i % 4 === 0;
    const p = el('i', heart ? 'petal heart' : 'petal');
    if (heart) p.append(svgHeart('ph'));
    p.style.left = (4 + Math.random() * 92).toFixed(1) + '%';
    p.style.setProperty('--size', (heart ? 12 + Math.random() * 8 : 9 + Math.random() * 7).toFixed(1) + 'px');
    p.style.setProperty('--dur', (7 + Math.random() * 6).toFixed(2) + 's');
    p.style.setProperty('--delay', (-Math.random() * 10).toFixed(2) + 's');
    p.style.setProperty('--sway', (Math.random() * 60 - 30).toFixed(0) + 'px');
    p.style.setProperty('--spin', (Math.random() * 360 + 180).toFixed(0) + 'deg');
    p.style.setProperty('--c', colors[i % colors.length]);
    petals.append(p);
  }
}

/* ---------------- 启动 ---------------- */

async function boot() {
  document.documentElement.dataset.platform = mochi?.platform || '';
  const closeBtn = document.getElementById('close');
  closeBtn.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if ((e.key === 'Enter' || e.key === ' ') && !opened && letter?.unlocked && document.activeElement === document.body) openLetter();
  });
  try {
    const [list, data] = await Promise.all([mochi.letters.list(), mochi.getData().catch(() => null)]);
    letter = (list || []).find((l) => String(l.id) === String(id)) || null;
    state = data;
  } catch (err) {
    console.error('[letter] load failed', err);
  }
  // 先定下语言再画界面
  syncLang(state);
  bindText(closeBtn, () => t('letter.closeHint'), 'title');
  bindText(closeBtn, () => t('common.close'), 'aria-label');
  if (!letter) missingView();
  else if (!letter.unlocked) lockedView();
  else intro();
  refreshTexts();
  // 在小窝里换了语言或称呼：文字跟着换。自带的信（宠物的自我介绍）也跟着语言，重新取一下标题、署名和正文
  mochi?.onData?.(async (d) => {
    state = d;
    if (syncLang(d) && letter) {
      const list = await Promise.resolve(mochi.letters.list()).catch(() => null);
      const fresh = (list || []).find((l) => String(l.id) === String(letter.id));
      if (fresh) Object.assign(letter, { title: fresh.title, from: fresh.from, body: fresh.body ?? letter.body });
    }
    refreshTexts();
  });
  requestAnimationFrame(() => document.body.classList.add('ready'));
}

boot();
