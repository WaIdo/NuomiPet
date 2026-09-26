// 小窝窗口：标题栏 + 侧边栏 + 各个页面。
// 数据只有一份（app.state，来自主进程）；任何变化都重新渲染当前页面，再用 morph() 合并进页面，
// 所以正在输入的框、开关动画、宠物动画都不会被打断。
import { syncLang, t, petName } from '../shared/i18n.mjs'; // 要最先执行：按语言填好名字和台词，缺字的 emoji 先换掉
import catalog from '../../shared/catalog.json' with { type: 'json' };
import C from '../shared/common.mjs';
import { Ambient } from '../shared/ambient.js';
import { h, morph, cx, toast, petEl, bar, closePopover, pawGlyph, fmtClock, dateWeek, rich } from './ui.js';
import overview from './pages/overview.js';
import dress from './pages/dress.js';
import reminders from './pages/reminders.js';
import focus from './pages/focus.js';
import todos from './pages/todos.js';
import love from './pages/love.js';
import letters from './pages/letters.js';
import moods from './pages/moods.js';
import notes from './pages/notes.js';
import settings from './pages/settings.js';
import { openProfile } from './profile.js';

const mochi = window.mochi;
const PAGES = [overview, dress, reminders, focus, todos, love, letters, moods, notes, settings];
const PAGE = Object.fromEntries(PAGES.map((p) => [p.id, p]));

const app = {
  mochi,
  catalog,
  C,
  state: null,
  page: 'overview',
  pomo: null,
  pomoAt: 0,
  letters: [],
  lettersLoaded: false,
  weather: { status: 'off', data: null },
  info: null,
  today: C.dateKey(),
  set,
  go,
  rerender,
  bump,
  recordMood,
  look,
  pomoNow,
  refreshWeather,
  refreshLetters,
  companionDays,
  openProfile: (o) => openProfile(app, o),
};

/* ---------------- 数据 ---------------- */

function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] === null || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

// 还在路上的写入：主进程的广播可能比我们后面的写入先到，这时用本地的新值盖回去，避免开关闪一下。
const pending = new Map();

function set(path, value, { quiet = false } = {}) {
  setPath(app.state, path, value);
  const p = pending.get(path) || { n: 0 };
  p.value = value;
  p.n++;
  pending.set(path, p);
  rerender();
  return Promise.resolve(mochi.set(path, value))
    .then(
      () => {
        if (!quiet) toast(t('home.toast.saved'));
      },
      (err) => {
        console.error('[home] save failed', path, err);
        toast(t('home.toast.saveFailed'), 'err');
        reload();
      },
    )
    .finally(() => {
      p.n--;
      if (p.n <= 0 && pending.get(path) === p) pending.delete(path);
    });
}

async function reload() {
  try {
    applyData(await mochi.getData(), ['*']);
  } catch (err) {
    console.error('[home] reload failed', err);
  }
}

function bump(delta) {
  return Promise.resolve(mochi.bumpStats(delta)).catch((err) => console.error('[home] bumpStats failed', err));
}

function recordMood(date, mood, note = '') {
  const value = { mood, note, at: Date.now() };
  app.state.moods = { ...(app.state.moods || {}), [date]: value };
  const key = 'moods.' + date;
  const p = pending.get(key) || { n: 0 };
  p.value = value;
  p.n++;
  pending.set(key, p);
  rerender();
  return Promise.resolve(mochi.recordMood(date, mood, note))
    .catch((err) => {
      console.error('[home] recordMood failed', err);
      toast(t('home.toast.moodFailed'), 'err');
      reload();
    })
    .finally(() => {
      p.n--;
      if (p.n <= 0 && pending.get(key) === p) pending.delete(key);
    });
}

function applyData(data, paths) {
  if (!data || typeof data !== 'object') return;
  for (const [path, p] of pending) setPath(data, path, p.value);
  app.state = data;
  const langChanged = syncLang(data);
  if (!started) return;
  const ps = Array.isArray(paths) && paths.length ? paths : ['*'];
  if (!langChanged && ps.every((p) => String(p).startsWith('runtime'))) return;
  const touches = (prefix) => ps.some((p) => p === '*' || p === prefix || String(p).startsWith(prefix + '.') || prefix.startsWith(p + '.'));
  if (touches('letters')) refreshLetters();
  const weatherAsked = touches('weather') && syncWeather();
  // 换了语言：天气的描述要换成新语言的，重新要一次（主进程按当前语言返回）
  if (langChanged && !weatherAsked) refreshWeather();
  rerender();
}

function look() {
  const p = app.state.pet || {};
  return { species: p.species, color: p.color, accessory: p.accessory, markings: p.markings };
}

function companionDays() {
  const created = new Date(app.state.createdAt || Date.now());
  return C.dayNumber(C.dateKey(created)) || 1;
}

/* ---------------- 番茄钟 / 天气 / 信件 ---------------- */

function setPomo(p) {
  if (!p || typeof p !== 'object' || !p.phase) return;
  app.pomo = p;
  app.pomoAt = Date.now();
  rerender();
}

function pomoNow() {
  const p = app.pomo;
  if (!p) return null;
  if (p.running && !p.paused) {
    const gone = (Date.now() - app.pomoAt) / 1000;
    return { ...p, remaining: Math.max(0, p.remaining - gone) };
  }
  return p;
}

let weatherKey = '';
let weatherSeq = 0;

// 天气开关或城市变了才重新请求；返回这次有没有发出请求
function syncWeather() {
  const w = app.state.weather || {};
  const key = w.enabled ? `${w.lat},${w.lon},${w.city}` : '';
  if (key === weatherKey) return false;
  const first = !weatherKey;
  weatherKey = key;
  if (!key) {
    app.weather = { status: 'off', data: null };
    return false;
  }
  refreshWeather(!first);
  return true;
}

async function refreshWeather(force = false) {
  if (!app.state.weather?.enabled) return;
  const seq = ++weatherSeq;
  app.weather = { ...app.weather, status: 'loading' };
  rerender();
  let next;
  try {
    const r = await mochi.weather.get(force);
    // 主进程没给原因时 error 留空，显示的时候再按当前语言取默认的说法
    next = r && r.ok ? { status: 'ok', data: r } : { status: 'error', error: (r && r.error) || '', data: null };
  } catch (err) {
    next = { status: 'error', error: '', data: null };
  }
  if (seq !== weatherSeq) return;
  app.weather = next;
  rerender();
}

let lettersSeq = 0;

async function refreshLetters() {
  const seq = ++lettersSeq;
  try {
    const list = await mochi.letters.list();
    if (seq !== lettersSeq) return;
    app.letters = Array.isArray(list) ? list : [];
    app.lettersLoaded = true;
    rerender();
  } catch (err) {
    console.error('[home] letters.list failed', err);
  }
}

/* ---------------- 渲染 ---------------- */

const els = {};
let scheduled = 0; // 1 = 只刷新侧边栏和实时页面，2 = 全部
let started = false;

function rerender(kind = 'all') {
  const lvl = kind === 'tick' ? 1 : 2;
  if (scheduled) {
    scheduled = Math.max(scheduled, lvl);
    return;
  }
  scheduled = lvl;
  queueMicrotask(renderNow);
}

function renderNow() {
  const lvl = scheduled;
  scheduled = 0;
  if (!app.state) return;
  const title = t('home.title', { pet: petName(app.state) });
  if (document.title !== title) document.title = title;
  const theme = C.resolveTheme(app.state, catalog);
  if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  morph(els.titlebar, titlebar());
  morph(els.sidebar, sidebar());
  const page = PAGE[app.page];
  if (lvl === 1 && !page.live) return;
  const tree = page.render(app);
  const cur = els.page.firstElementChild;
  if (cur && cur.__page === app.page && cur.nodeName === tree.nodeName) {
    morph(cur, tree);
  } else {
    tree.__page = app.page;
    els.page.replaceChildren(tree);
    els.main.scrollTop = 0;
    els.page.classList.remove('enter');
    void els.page.offsetWidth;
    els.page.classList.add('enter');
  }
}

function titlebar() {
  return h(
    'header',
    { class: 'titlebar', id: 'titlebar' },
    h('div', { class: 'tb-title' }, pawGlyph(), h('span', { class: 'tb-name' }, t('home.title', { pet: petName(app.state) }))),
    h('div', { class: 'tb-right' }, h('span', { class: 'tb-date' }, dateWeek())),
  );
}

function sidebar() {
  const st = app.state;
  const xp = st.stats?.xp || 0;
  const lv = C.levelFor(xp, catalog.levels);
  const undone = (st.todos || []).filter((x) => !x.done).length;
  const unread = app.letters.some((l) => l.unlocked && !l.read);
  const pomo = pomoNow();
  const pomoLive = pomo && pomo.phase !== 'idle' && (pomo.running || pomo.paused);
  const xpText = lv.next ? t('home.sidebar.xp', { xp, next: lv.next.xp }) : t('home.sidebar.xpMax', { xp });
  const name = petName(st);
  const homeTip = t('home.sidebar.home');
  return h(
    'aside',
    { class: 'sidebar', id: 'sidebar' },
    h(
      'div',
      { class: 'sb-profile' },
      h('button', { type: 'button', class: 'sb-pet', title: homeTip, 'aria-label': homeTip, onclick: () => go('overview') }, h('span', { class: 'sb-glow' }), petEl(look(), { size: 72, blink: true, track: true, key: 'sb-pet' })),
      h('div', { class: 'sb-name', title: name }, name),
      h('div', { class: 'lv-chip', title: xpText }, h('b', `Lv.${lv.level}`), lv.title),
      h('div', { class: 'sb-xp', title: xpText }, bar(lv.progress, 'xp')),
    ),
    h(
      'nav',
      { class: 'nav', 'aria-label': t('home.sidebar.pages') },
      PAGES.map((p) =>
        h(
          'button',
          {
            type: 'button',
            key: p.id,
            class: cx('nav-item', { active: p.id === app.page }),
            'data-nav': p.id,
            'aria-current': p.id === app.page ? 'page' : null,
            onclick: () => go(p.id),
          },
          h('span', { class: 'nav-ico' }, p.icon),
          h('span', { class: 'nav-label' }, t(`home.nav.${p.id}`)),
          p.id === 'todos' && undone > 0 && h('span', { class: 'nav-badge', title: t('home.sidebar.undone', { n: undone }) }, undone > 99 ? '99+' : undone),
          p.id === 'letters' && unread && h('span', { class: 'nav-dot', title: t('home.sidebar.newLetter') }),
          p.id === 'focus' && pomoLive && h('span', { class: cx('nav-timer', 'nt-' + pomo.phase, { paused: pomo.paused }) }, fmtClock(pomo.remaining)),
        ),
      ),
    ),
    h('div', { class: 'sb-foot' }, rich('home.sidebar.foot', {}, { heart: h('span', { class: 'sb-heart' }, '♡') })),
  );
}

function go(id) {
  // 'profile' 不是页面，是「认识一下」资料弹窗
  if (id === 'profile') {
    if (app.state) openProfile(app, { first: !app.state.runtime?.profileDone });
    return;
  }
  if (!PAGE[id]) return;
  closePopover();
  if (id === app.page) return;
  PAGE[app.page]?.leave?.(app);
  app.page = id;
  PAGE[id].enter?.(app);
  try {
    history.replaceState(null, '', `?page=${id}`);
  } catch {}
  rerender();
}

/* ---------------- 宠物的眼睛跟着鼠标 ---------------- */

let mouse = null;
let trackRaf = 0;
let leaveTimer = 0;

function track() {
  trackRaf = 0;
  for (const el of document.querySelectorAll('mochi-pet[data-track]')) {
    const pv = el.pv;
    if (!pv) continue;
    if (!mouse) {
      pv.lookAt(0, 0);
      continue;
    }
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const cx0 = r.left + r.width / 2;
    const cy0 = r.top + r.height * 0.6;
    const range = Math.max(150, r.width * 1.4);
    pv.lookAt((mouse.x - cx0) / range, (mouse.y - cy0) / range);
  }
}

function watchMouse() {
  window.addEventListener('mousemove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    clearTimeout(leaveTimer);
    if (!trackRaf) trackRaf = requestAnimationFrame(track);
  });
  document.documentElement.addEventListener('mouseleave', () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      mouse = null;
      track();
    }, 900);
  });
}

/* ---------------- 启动 ---------------- */

function fatal(msg) {
  document.body.append(h('div', { class: 'fatal' }, msg));
}

async function boot() {
  if (!mochi) {
    fatal(t('home.fatal.noHost'));
    return;
  }
  document.documentElement.dataset.platform = mochi.platform || '';
  els.titlebar = document.getElementById('titlebar');
  els.sidebar = document.getElementById('sidebar');
  els.main = document.getElementById('main');
  els.page = document.getElementById('page');

  const q = new URLSearchParams(location.search).get('page');
  if (q && PAGE[q]) app.page = q;
  const wantProfile = q === 'profile';

  // 先订阅再读取，读取期间发生的变化也不会漏掉
  mochi.onData((data, paths) => applyData(data, paths));
  try {
    const data = await mochi.getData();
    if (!app.state) app.state = data;
    syncLang(app.state);
  } catch (err) {
    console.error('[home] getData failed', err);
    fatal(t('home.fatal.loadFailed'));
    return;
  }
  weatherKey = '';
  syncWeather();
  PAGE[app.page].enter?.(app);
  started = true;
  renderNow();
  // 第一次打开小窝：先认识一下（填名字、昵称、生日……）
  const rt = app.state.runtime || {};
  if (wantProfile || (!rt.profileDone && !rt.profileSkipped)) setTimeout(() => openProfile(app, { first: !rt.profileDone }), 450);

  mochi.onNavigate((page) => go(page));
  mochi.pomodoro.onUpdate(setPomo);
  mochi.pomodoro.get().then(setPomo, (err) => console.error('[home] pomodoro.get failed', err));
  refreshLetters();
  mochi.app.info().then(
    (info) => {
      app.info = info;
      rerender();
    },
    () => {},
  );

  watchMouse();
  // 窗口在后台时，宠物的常驻小动画降到低帧率
  const syncFocus = () => {
    const focused = document.hasFocus();
    document.documentElement.classList.toggle('blurred', !focused);
    Ambient.setFps(focused ? 12 : 5);
  };
  syncFocus();
  window.addEventListener('blur', syncFocus);
  window.addEventListener('focus', () => {
    syncFocus();
    if (started) refreshLetters();
  });
  let minute = new Date().getMinutes();
  setInterval(() => {
    const k = C.dateKey();
    if (k !== app.today) {
      app.today = k;
      refreshLetters();
      rerender();
      return;
    }
    // 每分钟整体刷新一次：问候语、已过期的提醒、标题栏日期等跟着时间变
    const m = new Date().getMinutes();
    if (m !== minute) {
      minute = m;
      rerender();
      return;
    }
    const p = app.pomo;
    if (p && p.running && !p.paused) rerender('tick');
  }, 1000);
  // 天气每半小时刷新一次（主进程有缓存，不会频繁请求）
  setInterval(() => refreshWeather(false), 30 * 60 * 1000);
}

boot();
