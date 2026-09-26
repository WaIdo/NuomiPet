// 桌宠窗口入口：把数据、输入事件、主进程消息接到 Brain 上。
import { PetView } from '../shared/pet-view.js';
import { Sound } from '../shared/sound.js';
import { Bubble } from './bubble.js';
import { Fx } from './fx.js';
import { Panel } from './panel.js';
import { Brain } from './brain.js';
import { Ambient } from '../shared/ambient.js';
import { nextYearly, festivalOf, resolveTheme } from '../shared/common.mjs';
import catalog from '../../shared/catalog.json' with { type: 'json' };
import festivals from '../../shared/festivals.json' with { type: 'json' };

const api = window.mochi;
const $ = (id) => document.getElementById(id);

let data = await api.getData();
let layout = await api.pet.getLayout();
let pomodoro = await api.pomodoro.get();

const stage = $('stage');
const petHost = $('pet');
// 生日和部分节日当天临时换上应景的配饰
function specialAccessory(d) {
  const now = new Date();
  if (nextYearly(d.love.birthday, now)?.isToday) return 'partyhat';
  return festivalOf(festivals, now)?.acc || null;
}
const lookOf = (d) => ({
  species: d.pet.species,
  color: d.pet.color,
  accessory: specialAccessory(d) || d.pet.accessory,
  markings: d.pet.markings,
});

const applyTheme = (d) => {
  document.documentElement.dataset.theme = resolveTheme(d, catalog);
};
applyTheme(data);

const view = new PetView(petHost, lookOf(data));
const sound = new Sound();
sound.configure({ enabled: data.settings.sound, volume: data.settings.volume });
const fx = new Fx($('fx'));

// 宠物某个部位在舞台（整个窗口）里的坐标
function anchor(point = 'head') {
  const a = view.anchor(point);
  const r = petHost.getBoundingClientRect();
  return { x: a.x + r.left, y: a.y + r.top, scale: a.scale };
}

let clip = layout.clip || { left: 0, right: layout.w };
const visible = () => clip;
const bubble = new Bubble($('bubble'), { anchor: () => anchor('head'), sound, visible });
const panel = new Panel($('panel'), {
  api,
  anchor: () => anchor('head'),
  visible,
  getData: () => data,
  getPomodoro: () => pomodoro,
  actions: {
    feed: (id) => brain.feed(id),
    play: () => brain.play(),
    coax: (kind) => brain.coax(kind),
    openHome: (page) => api.openHome(page),
  },
  onToggle: (open) => brain.onPanelToggle(open),
  onNeedSpace: (need, v) => api.pet.walk({ dir: v.left > 0 ? 1 : -1, distance: need, speed: 520 }),
});

const brain = new Brain({
  view,
  bubble,
  fx,
  sound,
  api,
  panel,
  anchor,
  getData: () => data,
  getLayout: () => layout,
  visible,
});

// ---------- 布局 ----------
function applyLayout(l) {
  layout = l;
  if (l.clip) clip = l.clip;
  document.documentElement.style.setProperty('--pet-size', l.petSize + 'px');
  requestAnimationFrame(() => {
    bubble.place();
    panel.place();
    placeBadge();
  });
}

// ---------- 番茄钟角标 ----------
const badge = $('badge');
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
function renderBadge() {
  const p = pomodoro;
  if (!p || p.phase === 'idle') {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.className = 'badge' + (p.phase !== 'focus' ? ' break' : '') + (p.paused ? ' paused' : '');
  badge.replaceChildren();
  const e = document.createElement('span');
  e.className = 'e';
  e.textContent = p.phase === 'focus' ? '🍅' : '☕';
  const t = document.createElement('span');
  t.textContent = (p.paused ? '⏸ ' : '') + fmt(p.remaining);
  badge.append(e, t);
  placeBadge();
}
function placeBadge() {
  if (badge.hidden) return;
  const h = anchor('face');
  const s = h.scale;
  const right = h.x + 62 * s + badge.offsetWidth > clip.right - 4 ? h.x - 62 * s - badge.offsetWidth : h.x + 62 * s;
  badge.style.left = Math.max(clip.left + 4, right) + 'px';
  badge.style.top = Math.max(4, h.y - 58 * s) + 'px';
}
badge.addEventListener('click', (e) => {
  e.stopPropagation();
  panel.open('focus');
});

// ---------- 鼠标穿透 ----------
let ignoring = true;
function setIgnore(v) {
  if (v === ignoring) return;
  ignoring = v;
  api.pet.ignoreMouse(v);
}
function hitAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const pet = !!el && !!el.closest('.pet .hit');
  const ui = !!el && !!el.closest('[data-hit]');
  return { pet, any: pet || ui };
}

let press = null;
let dragging = false;
let lastHover = null;

window.addEventListener('mousemove', (e) => {
  if (press || dragging) return;
  if (!ignoring) attend();
  const h = hitAt(e.clientX, e.clientY);
  setIgnore(!h.any);
  if (h.pet) {
    if (lastHover) brain.onHoverMove(e.clientX - lastHover.x, e.clientY - lastHover.y);
    lastHover = { x: e.clientX, y: e.clientY };
  } else if (lastHover) {
    lastHover = null;
    brain.onHoverLeave();
  }
});
document.addEventListener('mouseleave', () => {
  if (press || dragging) return;
  setIgnore(true);
  if (lastHover) {
    lastHover = null;
    brain.onHoverLeave();
  }
});

// ---------- 点击 / 双击 / 拖拽 / 右键 ----------
let clickTimer = null;
function onPetClick() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    brain.onDoubleClick();
    return;
  }
  clickTimer = setTimeout(() => {
    clickTimer = null;
    brain.poke();
  }, 230);
}

petHost.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !e.target.closest('.hit')) return;
  press = { x: e.clientX, y: e.clientY, id: e.pointerId, target: e.target };
  setIgnore(false);
  try {
    e.target.setPointerCapture(e.pointerId);
  } catch {}
});

petHost.addEventListener('pointermove', (e) => {
  if (!press || dragging) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) {
    dragging = true;
    document.body.classList.add('dragging');
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    brain.onDragStart();
    api.pet.dragStart();
  }
});

function release(e) {
  if (!press) return;
  const wasDrag = dragging;
  const target = press.target;
  press = null;
  dragging = false;
  document.body.classList.remove('dragging');
  try {
    target.releasePointerCapture(e.pointerId);
  } catch {}
  if (wasDrag) api.pet.dragEnd();
  else if (e.type === 'pointerup') onPetClick();
}
petHost.addEventListener('pointerup', release);
petHost.addEventListener('pointercancel', release);
petHost.addEventListener('lostpointercapture', (e) => {
  if (dragging) release({ type: 'lostpointercapture', pointerId: e.pointerId });
});
window.addEventListener('blur', () => {
  if (dragging) release({ type: 'blur', pointerId: press?.id });
});

petHost.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.hit')) return;
  e.preventDefault();
  api.pet.contextMenu({ sleeping: brain.mode === 'sleeping' });
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- 主进程消息 ----------
api.onData((d, paths) => {
  const prev = data;
  data = d;
  const all = paths.includes('*');
  if (all || paths.some((p) => p.startsWith('pet') || p.startsWith('love'))) {
    view.setLook(lookOf(d));
    requestAnimationFrame(() => {
      bubble.place();
      panel.place();
      placeBadge();
    });
  }
  if (all || paths.some((p) => p.startsWith('settings') || p.startsWith('pet'))) applyTheme(d);
  if (all || paths.some((p) => p.startsWith('settings'))) {
    sound.configure({ enabled: d.settings.sound, volume: d.settings.volume });
    if (prev.settings.eyeTracking !== d.settings.eyeTracking) brain.eyeTrackingChanged(d.settings.eyeTracking);
    if (prev.settings.activity !== d.settings.activity || prev.settings.followMouse !== d.settings.followMouse) brain.scheduleIdle();
  }
  if (all || paths.some((p) => p.startsWith('love'))) {
    if (prev.love.chatty !== d.love.chatty) brain.scheduleChatter();
  }
  if (all || paths.some((p) => p.startsWith('stats'))) panel.refresh();
});
api.pet.onLayout(applyLayout);
api.pet.onClip((c) => {
  clip = c;
  bubble.place();
  panel.place();
  placeBadge();
});
api.pet.onMotion((e) => brain.onMotion(e));
api.pet.onCursor((c) => brain.onCursor(c));
api.onPetEvent((evt) => brain.handleEvent(evt));
api.onPetCommand((cmd) => brain.handleCommand(cmd));
api.pomodoro.onUpdate((p) => {
  const phaseChanged = p.phase !== pomodoro.phase;
  const pausedChanged = p.paused !== pomodoro.paused;
  pomodoro = p;
  renderBadge();
  brain.syncPomodoro(p);
  if (phaseChanged || pausedChanged) panel.refresh();
  else panel.tick(p);
});

// 过了零点要换回平时的配饰（或换上节日配饰）
setInterval(() => view.setLook(lookOf(data)), 10 * 60 * 1000);

// ---------- 省电：根据有没有人在看调整常驻动画帧率 ----------
let attendedAt = Date.now();
const attend = () => {
  attendedAt = Date.now();
  updateFps();
};
function updateFps() {
  let fps = 6;
  if (document.hidden) fps = 0;
  else if (brain.mode === 'sleeping' && brain.sleepReason === 'away') fps = 4;
  else if (Date.now() - attendedAt < 60000 || bubble.busy() || panel.isOpen || brain.task || brain.physical) fps = 12;
  Ambient.setFps(fps);
}
setInterval(updateFps, 2000);
document.addEventListener('visibilitychange', updateFps);
api.pet.onCursor((c) => {
  if (Math.hypot(c.dx, c.dy) < 450) attend();
});
petHost.addEventListener('pointerdown', attend);

// 开发模式下暴露内部对象，方便测试脚本驱动
if (new URLSearchParams(location.search).get('dev') === '1') window.__pet = { brain, view, bubble, panel, fx, sound };

applyLayout(layout);
renderBadge();
brain.syncPomodoro(pomodoro);
brain.start();
api.pet.ready();
