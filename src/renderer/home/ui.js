// 小窝窗口的界面小工具（不依赖任何框架）。
// h()/s() 创建元素；morph() 把新渲染出来的树就地合并进旧树，这样重新渲染时
// 输入框的焦点、滚动位置、开关动画和宠物实例都不会被打断。
// 另外还有开关、分段选择、步进器、时间/日期选择、弹窗、气泡菜单、提示和小特效。
import { PetView } from '../shared/pet-view.js';
import { pad2, parseKey } from '../shared/common.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ============================== 创建元素 ============================== */

export function h(tag, props, ...kids) {
  return build(document.createElement(tag), props, kids);
}

export function s(tag, props, ...kids) {
  return build(document.createElementNS(SVG_NS, tag), props, kids);
}

function build(el, props, kids) {
  if (props != null && (typeof props !== 'object' || Array.isArray(props) || props instanceof Node)) {
    kids.unshift(props);
    props = null;
  }
  if (props) for (const k of Object.keys(props)) setProp(el, k, props[k]);
  append(el, kids);
  if (el.__value !== undefined && el.tagName === 'SELECT') el.value = el.__value;
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true || k === '') continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function cx(...args) {
  const out = [];
  for (const a of args) {
    if (!a) continue;
    if (typeof a === 'string') out.push(a);
    else if (Array.isArray(a)) out.push(cx(...a));
    else if (typeof a === 'object') for (const k in a) if (a[k]) out.push(k);
  }
  return out.join(' ');
}

function styleText(o) {
  let t = '';
  for (const k in o) {
    const v = o[k];
    if (v == null || v === false) continue;
    const name = k.startsWith('--') ? k : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    t += `${name}:${v};`;
  }
  return t;
}

// 特殊属性：key（列表匹配）、props（直接赋到元素上）、skip（morph 不碰子节点）、
// on*（事件）、value/checked（受控的表单值）。
function setProp(el, k, v) {
  if (k === 'key') {
    if (v != null) el.__key = String(v);
    return;
  }
  if (k === 'props') {
    el.__props = v;
    Object.assign(el, v);
    return;
  }
  if (k === 'skip') {
    el.__skip = !!v;
    return;
  }
  if (k.length > 2 && k.startsWith('on')) {
    if (typeof v === 'function') listen(el, k.slice(2).toLowerCase(), v);
    return;
  }
  if (k === 'checked') {
    el.__checked = !!v;
    el.checked = !!v;
    return;
  }
  if (k === 'value') {
    if (v != null) {
      el.__value = String(v);
      el.value = String(v);
    }
    return;
  }
  if (v == null || v === false) return;
  if (k === 'class') {
    const c = cx(v);
    if (c) el.setAttribute('class', c);
    return;
  }
  if (k === 'style') {
    const t = typeof v === 'string' ? v : styleText(v);
    if (t) el.setAttribute('style', t);
    return;
  }
  el.setAttribute(k, v === true ? '' : String(v));
}

// 事件通过「蹦床」转发到 el.__on[type]，morph 时只需要换掉 __on 就能用上最新的处理函数。
function listen(el, type, fn) {
  (el.__on || (el.__on = {}))[type] = fn;
  trampoline(el, type);
}

function trampoline(el, type) {
  const set = el.__tr || (el.__tr = new Set());
  if (set.has(type)) return;
  set.add(type);
  el.addEventListener(type, (e) => {
    const fn = el.__on && el.__on[type];
    if (fn) fn(e);
  });
}

/* ============================== morph ============================== */

export function morph(from, to) {
  if (from.nodeType !== 1) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return from;
  }
  const fa = from.attributes;
  for (let i = fa.length - 1; i >= 0; i--) {
    const n = fa[i].name;
    if (!to.hasAttribute(n)) from.removeAttribute(n);
  }
  for (const a of to.attributes) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  from.__on = to.__on;
  if (to.__on) for (const t in to.__on) trampoline(from, t);
  if (to.__props) {
    from.__props = to.__props;
    Object.assign(from, to.__props);
  }
  if (!to.__skip) morphChildren(from, to);
  if (to.__value !== undefined) {
    from.__value = to.__value;
    // 正在输入的框不去动它
    if (from !== document.activeElement && from.value !== to.__value) from.value = to.__value;
  }
  if (to.__checked !== undefined) {
    from.__checked = to.__checked;
    if (from.checked !== to.__checked) from.checked = to.__checked;
  }
  return from;
}

const sameKind = (a, b) =>
  a.nodeType === b.nodeType &&
  a.nodeName === b.nodeName &&
  a.__key === b.__key &&
  (a.nodeName !== 'INPUT' || a.type === b.type);

function morphChildren(from, to) {
  const olds = Array.from(from.childNodes);
  const news = Array.from(to.childNodes);
  const keyed = new Map();
  for (const o of olds) if (o.__key !== undefined) keyed.set(o.__key, o);
  const used = new Set();
  let ui = 0;
  let ref = from.firstChild;
  for (const n of news) {
    let match = null;
    if (n.__key !== undefined) {
      const o = keyed.get(n.__key);
      if (o && !used.has(o) && sameKind(o, n)) match = o;
    } else {
      while (ui < olds.length && (olds[ui].__key !== undefined || used.has(olds[ui]))) ui++;
      if (ui < olds.length && sameKind(olds[ui], n)) match = olds[ui++];
    }
    let node = n;
    if (match) {
      used.add(match);
      node = morph(match, n);
    }
    if (node === ref) ref = ref.nextSibling;
    else from.insertBefore(node, ref);
  }
  for (const o of olds) if (!used.has(o) && o.parentNode === from) from.removeChild(o);
}

/* ============================== 宠物 ============================== */

// <mochi-pet>：连到页面上时才真正画出宠物；look/pose 等属性变化时就地更新。
class MochiPet extends HTMLElement {
  constructor() {
    super();
    this.pv = null;
    this._look = {};
    this._pose = 'idle';
    this._face = '';
    this._paws = '';
    this._blink = false;
    this._bt = 0;
  }

  set look(v) {
    this._look = { ...(v || {}) };
    if (this.pv) this.pv.setLook(this._look);
  }

  get look() {
    return this._look;
  }

  set pose(v) {
    v = v || 'idle';
    if (v === this._pose) return;
    this._pose = v;
    if (this.pv) this.pv.setPose(v);
  }

  get pose() {
    return this._pose;
  }

  set face(v) {
    const k = v ? v.join('/') : '';
    if (k === this._face) return;
    this._face = k;
    if (this.pv) this.pv.setFace(...(v || ['normal', 'cat']));
  }

  set paws(v) {
    v = v || '';
    if (v === this._paws) return;
    this._paws = v;
    if (this.pv) this.pv.setPaws(v || 'rest');
  }

  // 每次重新渲染都会再赋一次值；值没变就别重置计时器，否则每秒刷新时永远等不到眨眼
  set blink(v) {
    v = !!v;
    if (v === this._blink) return;
    this._blink = v;
    this.syncBlink();
  }

  connectedCallback() {
    if (!this.pv) {
      this.pv = new PetView(this, this._look);
      if (this._pose !== 'idle') this.pv.setPose(this._pose);
      if (this._face) this.pv.setFace(...this._face.split('/'));
      if (this._paws) this.pv.setPaws(this._paws);
    }
    this.syncBlink();
  }

  disconnectedCallback() {
    clearTimeout(this._bt);
    this._bt = 0;
    // morph 移动节点时会先断开再立刻接上；到微任务时还没接上，才是真的被移除了
    queueMicrotask(() => {
      if (this.isConnected || !this.pv) return;
      if (this.pv.destroy) this.pv.destroy();
      this.pv = null;
    });
  }

  syncBlink() {
    clearTimeout(this._bt);
    this._bt = 0;
    if (!this._blink || !this.isConnected) return;
    const next = () => {
      this._bt = setTimeout(() => {
        if (this.pv) this.pv.blink(Math.random() < 0.22);
        next();
      }, 3000 + Math.random() * 3000);
    };
    next();
  }
}
if (!customElements.get('mochi-pet')) customElements.define('mochi-pet', MochiPet);

export function petEl(look, o = {}) {
  const size = o.size || 72;
  return h('mochi-pet', {
    class: o.cls,
    key: o.key,
    skip: true,
    style: { width: size + 'px', height: size + 'px' },
    'data-track': o.track ? '' : null,
    'aria-hidden': 'true',
    props: { look, pose: o.pose || 'idle', face: o.face || null, paws: o.paws || null, blink: !!o.blink },
  });
}

/* ============================== 小图标 ============================== */

const ICONS = {
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  check: 'M5.5 12.5l4.2 4.2L18.5 7.8',
  plus: 'M12 5.5v13M5.5 12h13',
  left: 'M14.5 6l-6 6 6 6',
  right: 'M9.5 6l6 6-6 6',
  down: 'M6 9.5l6 6 6-6',
  refresh: 'M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
  lock: 'M7 11V8.5a5 5 0 0 1 10 0V11M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-6A1.5 1.5 0 0 1 6.5 11z',
  play: 'M8 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 8 5.8z',
  pause: 'M8 5.5v13M16 5.5v13',
  stop: 'M7.5 6.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
  skip: 'M6 6l8 6-8 6zM17.5 6v12',
  chat: 'M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-7l-4 3.2v-3.2H5A1.5 1.5 0 0 1 3.5 15V8A1.5 1.5 0 0 1 5 6.5z',
};

export function icon(name, cls = '') {
  const filled = name === 'play' || name === 'stop' || name === 'skip';
  return s(
    'svg',
    { class: cx('ico', cls), viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('path', {
      d: ICONS[name] || '',
      fill: filled ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': filled ? 1.2 : 2.2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
}

// 标题栏里的小爪印
export function pawGlyph() {
  return s(
    'svg',
    { class: 'paw-glyph', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('ellipse', { cx: 12, cy: 15.6, rx: 5.2, ry: 4.4 }),
    s('ellipse', { cx: 5.6, cy: 10.4, rx: 2.2, ry: 2.7, transform: 'rotate(-18 5.6 10.4)' }),
    s('ellipse', { cx: 9.6, cy: 6.6, rx: 2.2, ry: 2.8, transform: 'rotate(-6 9.6 6.6)' }),
    s('ellipse', { cx: 14.4, cy: 6.6, rx: 2.2, ry: 2.8, transform: 'rotate(6 14.4 6.6)' }),
    s('ellipse', { cx: 18.4, cy: 10.4, rx: 2.2, ry: 2.7, transform: 'rotate(18 18.4 10.4)' }),
  );
}

/* ============================== 布局小件 ============================== */

export function pageHead(emoji, title, sub, extra) {
  return h(
    'header',
    { class: 'page-head' },
    h('div', { class: 'ph-text' }, h('h1', h('span', { class: 'ph-emoji' }, emoji), title), sub && h('p', { class: 'ph-sub' }, sub)),
    extra && h('div', { class: 'ph-extra' }, extra),
  );
}

export function cardHead(emoji, title, extra, sub) {
  return h(
    'div',
    { class: 'card-head' },
    h(
      'div',
      { class: 'ch-text' },
      h('h3', { class: 'card-title' }, emoji && h('span', { class: 'ct-emoji' }, emoji), title),
      sub && h('p', { class: 'card-sub' }, sub),
    ),
    extra && h('div', { class: 'ch-extra' }, extra),
  );
}

export function bar(frac, cls = '') {
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  return h('div', { class: cx('bar', cls) }, h('i', { style: { width: (f * 100).toFixed(1) + '%' } }));
}

export function emptyState(look, text, sub, o = {}) {
  return h(
    'div',
    { class: cx('empty', o.cls) },
    h('div', { class: 'empty-pet' }, petEl(look, { size: o.size || 96, pose: o.pose || 'sleep', face: o.face || ['closed', 'smile'], key: 'empty-pet' }), o.pose === 'sleep' || !o.pose ? h('span', { class: 'zzz' }, h('i', 'z'), h('i', 'z'), h('i', 'Z')) : null),
    h('p', { class: 'empty-text' }, text),
    sub && h('p', { class: 'empty-sub' }, sub),
  );
}

/* ============================== 控件 ============================== */

export function toggle(on, onChange, o = {}) {
  return h(
    'button',
    {
      type: 'button',
      role: 'switch',
      class: cx('toggle', o.cls, { on }),
      'aria-checked': on ? 'true' : 'false',
      'aria-label': o.label,
      disabled: o.disabled,
      key: o.key,
      onclick: (e) => {
        const b = e.currentTarget;
        const next = b.getAttribute('aria-checked') !== 'true';
        b.classList.toggle('on', next);
        b.setAttribute('aria-checked', String(next));
        onChange(next);
      },
    },
    h('span', { class: 'knob' }),
  );
}

// options: [{ value, label }]
export function segmented(options, value, onChange, o = {}) {
  const idx = options.findIndex((x) => x.value === value);
  return h(
    'div',
    {
      class: cx('seg', o.cls, { 'no-sel': idx < 0 }),
      role: 'radiogroup',
      key: o.key,
      style: { '--n': options.length, '--i': Math.max(0, idx) },
    },
    h('span', { class: 'seg-thumb', 'aria-hidden': 'true' }),
    options.map((opt) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: cx('seg-opt', { on: opt.value === value }),
          'aria-checked': opt.value === value ? 'true' : 'false',
          title: opt.title,
          onclick: () => {
            if (opt.value !== value) onChange(opt.value);
          },
        },
        opt.label,
      ),
    ),
  );
}

export function stepper(value, { min = 1, max = 99, step = 1, unit = '', onChange, key } = {}) {
  const v = Number(value) || min;
  const go = (d) => {
    const n = Math.max(min, Math.min(max, v + d));
    if (n !== v) onChange(n);
  };
  return h(
    'div',
    { class: 'stepper', key },
    h('button', { type: 'button', class: 'st-btn', disabled: v <= min, 'aria-label': '减少', onclick: () => go(-step) }, '−'),
    h('span', { class: 'st-val' }, h('b', v), unit && h('small', unit)),
    h('button', { type: 'button', class: 'st-btn', disabled: v >= max, 'aria-label': '增加', onclick: () => go(step) }, '+'),
  );
}

// 24 小时制的时间选择（两个下拉框），避免系统时间控件显示成上午/下午。
export function timePicker(value, onChange, o = {}) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value || '') || [0, '9', '00'];
  const hh = Math.min(23, +m[1]);
  const mm = Math.min(59, +m[2]);
  const step = o.step || 5;
  const mins = [];
  for (let i = 0; i < 60; i += step) mins.push(i);
  if (!mins.includes(mm)) mins.push(mm), mins.sort((a, b) => a - b);
  const emit = (H, M) => onChange(`${pad2(H)}:${pad2(M)}`);
  return h(
    'span',
    { class: cx('timepick', o.cls), key: o.key, title: o.title },
    h(
      'select',
      { value: String(hh), 'aria-label': '小时', onchange: (e) => emit(+e.target.value, mm) },
      Array.from({ length: 24 }, (_, i) => h('option', { value: String(i) }, pad2(i))),
    ),
    h('span', { class: 'tp-colon' }, ':'),
    h(
      'select',
      { value: String(mm), 'aria-label': '分钟', onchange: (e) => emit(hh, +e.target.value) },
      mins.map((i) => h('option', { value: String(i) }, pad2(i))),
    ),
  );
}

const daysIn = (y, m) => new Date(y, m, 0).getDate();
const partialDates = new Map();

// 年/月/日三个下拉框。noYear：允许不填年份（生日），这时写回 'MM-DD'。
// 选到一半（还没选全）的状态记在 partialDates 里，id 用来区分不同的选择器。
export function datePicker(id, value, onChange, o = {}) {
  const now = new Date();
  const yMax = o.yearMax || now.getFullYear() + 10;
  const yMin = o.yearMin || 1950;
  const parsed = parseKey(value);
  const cur = parsed ? { ...parsed } : { y: null, m: null, d: null, ...(partialDates.get(id) || {}) };
  const commit = (next) => {
    if (next.m && next.d) next.d = Math.min(next.d, daysIn(next.y || 2000, next.m));
    const done = next.m && next.d && (next.y || o.noYear);
    if (done) {
      partialDates.delete(id);
      onChange(next.y ? `${next.y}-${pad2(next.m)}-${pad2(next.d)}` : `${pad2(next.m)}-${pad2(next.d)}`);
    } else {
      partialDates.set(id, next);
      if (o.onPartial) o.onPartial();
    }
  };
  const years = [];
  for (let y = yMax; y >= yMin; y--) years.push(y);
  if (cur.y && !years.includes(cur.y)) years.push(cur.y), years.sort((a, b) => b - a);
  const dim = daysIn(cur.y || 2000, cur.m || 1);
  const sel = (label, val, opts, key, first) =>
    h(
      'span',
      { class: cx('dp-part', 'dp-' + key) },
      h(
        'select',
        {
          class: val == null && !(key === 'y' && o.noYear && cur.m) ? 'ph' : null,
          value: val == null ? '' : String(val),
          'aria-label': label,
          onchange: (e) => commit({ ...cur, [key]: e.target.value === '' ? null : +e.target.value }),
        },
        h('option', { value: '', disabled: key !== 'y' || !o.noYear ? !!val : false }, first),
        opts,
      ),
    );
  return h(
    'span',
    { class: cx('datepick', o.cls), key: o.key || id },
    sel('年', cur.y, years.map((y) => h('option', { value: String(y) }, `${y}年`)), 'y', o.noYear ? '不填年份' : '年'),
    sel('月', cur.m, Array.from({ length: 12 }, (_, i) => h('option', { value: String(i + 1) }, `${i + 1}月`)), 'm', '月'),
    sel('日', cur.d, Array.from({ length: dim }, (_, i) => h('option', { value: String(i + 1) }, `${i + 1}日`)), 'd', '日'),
  );
}

/* ============================== 提示 ============================== */

let toastEl = null;
let toastTimer = 0;

export function toast(msg, kind = '') {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastEl);
  }
  const wasShown = toastEl.classList.contains('show');
  toastEl.textContent = msg;
  toastEl.className = cx('toast', kind, { show: wasShown });
  if (!wasShown) {
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), kind === 'err' ? 2800 : 1600);
}

/* ============================== 弹窗 ============================== */

export function modal({ title, text, body, ok = '好的', cancel = '取消', danger = false, look = null, pose = 'idle', face = null }) {
  closePopover();
  return new Promise((resolve) => {
    let done = false;
    const close = (v) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 180);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    };
    const okBtn = h('button', { type: 'button', class: cx('btn', danger ? 'danger-solid' : 'primary'), onclick: () => close(true) }, ok);
    const overlay = h(
      'div',
      { class: 'modal-overlay', onpointerdown: (e) => e.target === overlay && close(false) },
      h(
        'div',
        { class: cx('modal', { danger }), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        look && h('div', { class: 'modal-pet' }, petEl(look, { size: 92, pose, face, blink: true })),
        h('h3', { class: 'modal-title' }, title),
        text && h('p', { class: 'modal-text' }, text),
        body,
        h('div', { class: 'modal-actions' }, cancel && h('button', { type: 'button', class: 'btn ghost', onclick: () => close(false) }, cancel), okBtn),
      ),
    );
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => okBtn.focus());
  });
}

/* ============================== 气泡菜单 ============================== */

let pop = null;

export function popover(anchor, content, o = {}) {
  if (pop && pop.anchor === anchor) {
    closePopover();
    return null;
  }
  closePopover();
  const el = h('div', { class: cx('popover', o.cls), role: 'dialog' }, content);
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const ht = el.offsetHeight;
  let top = r.bottom + 8;
  let below = true;
  if (top + ht > innerHeight - 10 && r.top - ht - 8 > 10) {
    top = r.top - ht - 8;
    below = false;
  }
  top = Math.max(10, Math.min(top, innerHeight - ht - 10));
  let left = o.align === 'start' ? r.left : r.left + r.width / 2 - w / 2;
  left = Math.max(10, Math.min(left, innerWidth - w - 10));
  el.style.top = top + 'px';
  el.style.left = left + 'px';
  el.style.transformOrigin = `${Math.round(r.left + r.width / 2 - left)}px ${below ? 0 : ht}px`;
  el.classList.add(below ? 'below' : 'above');

  const onDown = (e) => {
    if (!el.contains(e.target) && !anchor.contains(e.target)) closePopover();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePopover();
    }
  };
  const onScroll = (e) => {
    if (!el.contains(e.target)) closePopover();
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', closePopover);
  window.addEventListener('blur', closePopover);
  pop = {
    el,
    anchor,
    close() {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closePopover);
      window.removeEventListener('blur', closePopover);
      el.classList.add('out');
      setTimeout(() => el.remove(), 150);
      if (o.onClose) o.onClose();
    },
  };
  if (o.focus) requestAnimationFrame(() => el.querySelector(o.focus)?.focus());
  return pop;
}

export function closePopover() {
  if (!pop) return;
  const p = pop;
  pop = null;
  p.close();
}

/* ============================== 小特效 ============================== */

function fxLayer() {
  let l = document.getElementById('fx');
  if (!l) {
    l = h('div', { id: 'fx', 'aria-hidden': 'true' });
    document.body.appendChild(l);
  }
  return l;
}

const CONFETTI = ['#FF7EA8', '#A08CFF', '#FFD66B', '#6FD3B0', '#FFB3CB', '#8EC5FF'];

function spawn(cls, x, y, vars, text) {
  const p = document.createElement('span');
  p.className = cls;
  p.style.left = x + 'px';
  p.style.top = y + 'px';
  for (const k in vars) p.style.setProperty(k, vars[k]);
  if (text) p.textContent = text;
  p.addEventListener('animationend', () => p.remove());
  fxLayer().appendChild(p);
  setTimeout(() => p.remove(), 2400);
}

// 彩纸 + 小爱心，从 (x, y) 向四周炸开
export function burst(x, y, o = {}) {
  const n = o.n || 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const d = (o.spread || 34) + Math.random() * (o.spread || 34);
    spawn('fx-bit' + (Math.random() < 0.4 ? ' round' : ''), x, y, {
      '--dx': (Math.cos(a) * d).toFixed(1) + 'px',
      '--dy': (Math.sin(a) * d + 10).toFixed(1) + 'px',
      '--rot': Math.round(Math.random() * 540 - 270) + 'deg',
      '--c': CONFETTI[i % CONFETTI.length],
      '--delay': Math.round(Math.random() * 60) + 'ms',
    });
  }
  const emoji = o.emoji || ['💗'];
  emoji.forEach((em, i) =>
    spawn('fx-emoji', x + (i - (emoji.length - 1) / 2) * 16, y, { '--dx': Math.round(Math.random() * 30 - 15) + 'px', '--fs': 14 + Math.round(Math.random() * 6) + 'px', '--delay': i * 90 + 'ms' }, em),
  );
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

// 往上飘的小爱心（摸摸宠物）
export function hearts(x, y, o = {}) {
  const list = o.emoji || ['💗', '💕', '💖', '✨'];
  const n = o.n || 5;
  for (let i = 0; i < n; i++) {
    spawn(
      'fx-emoji float',
      x + (Math.random() * 70 - 35),
      y + Math.random() * 16,
      { '--dx': Math.round(Math.random() * 40 - 20) + 'px', '--fs': 14 + Math.round(Math.random() * 10) + 'px', '--delay': i * 110 + 'ms' },
      list[i % list.length],
    );
  }
}

/* ============================== 日期文字 ============================== */

export const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function fmtDate(key, { withYear = true } = {}) {
  const p = parseKey(key);
  if (!p) return '';
  if (!p.y || !withYear) return `${p.m}月${p.d}日`;
  return `${p.y}年${p.m}月${p.d}日`;
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

export function addDays(key, n) {
  const p = parseKey(key);
  if (!p || !p.y) return '';
  const d = new Date(p.y, p.m - 1, p.d + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
