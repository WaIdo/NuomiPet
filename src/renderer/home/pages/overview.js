// 首页：宠物大卡片、在一起、状态、今天、天气（便当盒布局）。
import phrases from '../../../shared/phrases.json' with { type: 'json' };
import { h, s, cx, petEl, bar, cardHead, popover, closePopover, burst, hearts, toast, icon, fmtDate, WEEK } from '../ui.js';
import { upcomingEvents } from './love.js';
import { em } from '../../shared/emoji.js';

const ui = { line: '', pokeTimer: 0 };

function greeting(d = new Date()) {
  const t = d.getHours() + d.getMinutes() / 60;
  if (t < 5) return '夜深啦';
  if (t < 9) return '早上好呀';
  if (t < 11.5) return '上午好呀';
  if (t < 13.5) return '中午好呀';
  if (t < 18) return '下午好呀';
  if (t < 23) return '晚上好呀';
  return '夜深啦';
}

function daypart(d = new Date()) {
  const t = d.getHours();
  if (t >= 5 && t < 10) return 'morning';
  if (t >= 11 && t < 13) return 'noon';
  if (t >= 17 && t < 20) return 'evening';
  if (t >= 22 || t < 5) return 'night';
  return 'idle';
}

function sayLine(app, cat) {
  const st = app.state;
  const vars = { pet: st.pet?.name || '糯米', nick: st.owner?.nickname || '宝贝' };
  const pool = (phrases[cat] || phrases.idle || []).map((t) => app.C.fill(t, vars)).filter((t) => !/\{\w+\}/.test(t));
  return app.C.pick(pool, 'home-' + cat) || '今天也要开开心心的呀';
}

const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

function heartIcon(cls) {
  return s(
    'svg',
    { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('path', { d: 'M12 20.5c-.3 0-.6-.1-.8-.3C7.6 17.2 3 13.6 3 9.2 3 6.3 5.2 4 8 4c1.6 0 3 .8 4 2 1-1.2 2.4-2 4-2 2.8 0 5 2.3 5 5.2 0 4.4-4.6 8-8.2 11-.2.2-.5.3-.8.3z' }),
  );
}

/* ---------------- 宠物大卡片 ---------------- */

function poke(app, e) {
  const el = e.currentTarget.querySelector('mochi-pet');
  const pv = el && el.pv;
  if (!pv) return;
  pv.setPose('jump');
  pv.setFace('happy', 'open');
  pv.setFlag('blush-strong', true);
  clearTimeout(ui.pokeTimer);
  ui.pokeTimer = setTimeout(() => {
    pv.setPose('idle');
    pv.setFace('normal', 'cat');
    pv.setFlag('blush-strong', false);
  }, 1000);
  app.mochi.petCommand({ type: 'pet' });
  const r = el.getBoundingClientRect();
  hearts(r.left + r.width / 2, r.top + r.height * 0.3);
  ui.line = sayLine(app, 'stroke');
  app.rerender();
}

function heroCard(app) {
  const st = app.state;
  const { C, catalog } = app;
  const xp = st.stats?.xp || 0;
  const lv = C.levelFor(xp, catalog.levels);
  const d = new Date();
  if (!ui.line) ui.line = sayLine(app, daypart(d));
  return h(
    'section',
    { class: 'card c-hero', key: 'hero' },
    h(
      'button',
      { type: 'button', class: 'hero-stage', key: 'stage', title: `摸摸${st.pet.name}`, 'aria-label': `摸摸${st.pet.name}`, onclick: (e) => poke(app, e) },
      h('span', { class: 'hs-glow' }),
      h('span', { class: 'hs-spark s1' }, '✦'),
      h('span', { class: 'hs-spark s2' }, '✧'),
      h('span', { class: 'hs-spark s3' }, '✦'),
      petEl(app.look(), { size: 170, blink: true, track: true, cls: 'hero-pet', key: 'hero-pet' }),
    ),
    h(
      'div',
      { class: 'hero-info' },
      h('div', { class: 'hero-date' }, `${d.getMonth() + 1}月${d.getDate()}日 · ${WEEK[d.getDay()]}`),
      h('h2', { class: 'hero-greet' }, `${greeting(d)}，${st.owner?.nickname || '宝贝'}`),
      h('p', { class: 'hero-days' }, `${st.pet.name}已经陪伴你 `, h('b', app.companionDays()), ' 天啦'),
      h('div', { class: 'bubble', key: 'bubble' }, ui.line),
      h(
        'div',
        { class: 'hero-level' },
        h('span', { class: 'lv-chip' }, h('b', `Lv.${lv.level}`), lv.title),
        h('span', { class: 'xp-num' }, lv.next ? [h('b', xp - lv.xp), ` / ${lv.next.xp - lv.xp}`] : '已满级 ✨'),
      ),
      bar(lv.progress, 'xp lg'),
      lv.next && h('p', { class: 'xp-hint' }, `再攒 ${lv.next.xp - xp} 点亲密度，就升到「${lv.next.title}」啦`),
    ),
  );
}

/* ---------------- 在一起 ---------------- */

function loveCard(app) {
  const { C } = app;
  const love = app.state.love || {};
  const n = love.togetherSince ? C.dayNumber(love.togetherSince) : null;
  const ev = upcomingEvents(app.state, C)[0];
  return h(
    'section',
    { class: 'card c-love', key: 'love' },
    n
      ? h(
          'div',
          { class: 'love-count', key: 'count' },
          h('div', { class: 'lc-label' }, heartIcon('beat'), '在一起'),
          h('div', { class: 'lc-num' }, h('small', '第'), h('b', n), h('small', '天')),
          h('div', { class: 'lc-since' }, `${fmtDate(love.togetherSince)} 开始`),
        )
      : h(
          'div',
          { class: 'love-empty', key: 'empty' },
          heartIcon('le-heart'),
          h('p', '把你们在一起的那天告诉糯米吧'),
          h('button', { type: 'button', class: 'btn soft sm', onclick: () => app.go('love') }, '设置在一起的日子 →'),
        ),
    h(
      'button',
      { type: 'button', class: 'love-next', key: 'next', onclick: () => app.go('love'), title: '去纪念日看看' },
      ev
        ? [
            h('span', { class: 'ln-ico' }, ev.icon),
            h(
              'span',
              { class: 'ln-text' },
              ev.days === 0 ? ['今天就是「', h('b', { class: 'ln-name' }, ev.name), '」🎉'] : ['距离「', h('b', { class: 'ln-name' }, ev.name), '」', h('span', { class: 'nw' }, '还有 ', h('b', { class: 'pink' }, ev.days), ' 天')],
            ),
          ]
        : [h('span', { class: 'ln-ico' }, '📅'), h('span', { class: 'ln-text muted' }, '还没有纪念日，去添加一个吧')],
    ),
  );
}

/* ---------------- 状态 ---------------- */

const fullWord = (v) => (v >= 85 ? '饱饱的' : v >= 55 ? '刚刚好' : v >= 30 ? '有点饿' : '饿扁啦');
const moodWord = (v) => (v >= 85 ? '超开心' : v >= 60 ? '开心' : v >= 35 ? '一般般' : '有点低落');

function meter(label, emo, v, cls, word) {
  return h(
    'div',
    { class: cx('meter', cls) },
    h('div', { class: 'meter-top' }, h('span', { class: 'meter-label' }, h('i', emo), label), h('span', { class: 'meter-val' }, h('span', { class: 'meter-word' }, word), h('b', Math.round(v)), '%')),
    bar(v / 100, cls),
  );
}

function feed(app, f, e) {
  app.mochi.petCommand({ type: 'feed', food: f.id });
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: [f.emoji, '💗'], n: 10 });
  closePopover();
  toast(`${f.emoji} 送到${app.state.pet.name}嘴边啦`);
}

function openFood(app, anchor) {
  const sp = app.catalog.species.find((x) => x.id === app.state.pet.species);
  const fav = sp && sp.favorite;
  const foods = [...app.catalog.foods].sort((a, b) => (b.id === fav) - (a.id === fav));
  popover(
    anchor,
    h(
      'div',
      { class: 'food-pop' },
      h('div', { class: 'pop-title' }, `给${app.state.pet.name}喂点什么？`),
      h(
        'div',
        { class: 'food-grid' },
        foods.map((f) =>
          h(
            'button',
            { type: 'button', class: cx('food', { fav: f.id === fav }), title: f.line, onclick: (e) => feed(app, f, e) },
            h('span', { class: 'food-emoji' }, f.emoji),
            h('span', { class: 'food-name' }, f.name),
            f.id === fav && h('span', { class: 'fav-tag' }, '最爱'),
          ),
        ),
      ),
    ),
    { cls: 'pop-food' },
  );
}

const COAX = [
  { id: 'kneel', emoji: '🙇', label: '跪搓衣板' },
  { id: 'flower', emoji: '💐', label: '送花' },
  { id: 'heart', emoji: '❤️', label: '比心' },
  { id: 'hug', emoji: '🤗', label: '抱抱' },
  { id: 'kiss', emoji: '😘', label: '亲亲' },
  { id: 'tea', emoji: em('🧋'), label: '请喝奶茶' },
  { id: 'bow', emoji: '🙏', label: '鞠躬' },
  { id: 'cute', emoji: '🥺', label: '撒娇' },
  { id: 'roll', emoji: '🌀', label: '打滚' },
  { id: 'dance', emoji: '💃', label: '跳舞' },
  { id: 'praise', emoji: '🌟', label: '夸夸我' },
  { id: 'random', emoji: '🎲', label: '随便哄' },
];

function coax(app, c, e) {
  app.mochi.petCommand({ type: 'coax', kind: c.id });
  const r = e.currentTarget.getBoundingClientRect();
  hearts(r.left + r.width / 2, r.top + r.height / 2);
  closePopover();
  toast(c.id === 'kneel' ? `${app.state.pet.name}去跪搓衣板啦，快看桌面～` : `${app.state.pet.name}来哄你啦～看看桌面`);
}

function openCoax(app, anchor) {
  popover(
    anchor,
    h(
      'div',
      { class: 'food-pop' },
      h('div', { class: 'pop-title' }, `要${app.state.pet.name}怎么哄你？`),
      h(
        'div',
        { class: 'food-grid' },
        COAX.map((c) =>
          h(
            'button',
            { type: 'button', class: cx('food', { fav: c.id === 'kneel' }), onclick: (e) => coax(app, c, e) },
            h('span', { class: 'food-emoji' }, c.emoji),
            h('span', { class: 'food-name' }, c.label),
          ),
        ),
      ),
    ),
    { cls: 'pop-food' },
  );
}

function play(app, e) {
  app.mochi.petCommand({ type: 'play' });
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['🧶'], n: 8 });
  toast(`${app.state.pet.name}开心地玩起来啦～`);
}

// 一起的回忆：从认识到现在的累计次数
function memories(c) {
  const item = (emoji, label, n, unit) => h('div', { class: 'mem', title: `${label} ${n || 0} ${unit}` }, h('i', emoji), h('span', label), h('b', n || 0), h('small', unit));
  return h(
    'div',
    { class: 'memories', key: 'mem' },
    h('div', { class: 'mem-title' }, '一起的回忆'),
    h(
      'div',
      { class: 'mem-grid' },
      item('🤲', '摸摸', c.pets, '次'),
      item('🍓', '喂食', c.feeds, '次'),
      item('🧶', '玩耍', c.plays, '次'),
      item('💧', '喝水', c.waters, '杯'),
      item('🍅', '专注', c.pomodoros, '个'),
      item('📝', '完成', c.todos, '件'),
    ),
  );
}

function statusCard(app) {
  const st = app.state.stats || {};
  const full = clamp(st.fullness);
  const mood = clamp(st.mood);
  const sp = app.catalog.species.find((x) => x.id === app.state.pet.species);
  const fav = sp && app.catalog.foods.find((f) => f.id === sp.favorite);
  const daily = st.daily && st.daily.date === app.C.dateKey() ? st.daily : {};
  return h(
    'section',
    { class: 'card c-status', key: 'status' },
    cardHead('🍙', `${app.state.pet.name}的状态`),
    h('div', { class: 'meters' }, meter('饱腹', '🍚', full, 'full', fullWord(full)), meter('心情', '💗', mood, 'mood', moodWord(mood))),
    h(
      'div',
      { class: 'facts' },
      fav && h('span', { class: 'fact' }, h('i', fav.emoji), `最爱${fav.name}`),
      h('span', { class: 'fact', title: `今天摸了 ${daily.pets || 0} 次` }, h('i', '🤲'), `今天摸摸 ${daily.pets || 0} 次`),
    ),
    memories(st.counters || {}),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary sm grow', onclick: (e) => openFood(app, e.currentTarget) }, '🍓 喂零食'),
      h('button', { type: 'button', class: 'btn soft sm grow', onclick: (e) => openCoax(app, e.currentTarget) }, '🥺 哄哄我'),
      h('button', { type: 'button', class: 'btn ghost sm grow', onclick: (e) => play(app, e) }, '🧶 陪它玩'),
    ),
  );
}

/* ---------------- 今天 ---------------- */

function drink(app, e) {
  app.bump({ xp: 1, counters: { waters: 1 }, daily: { water: 1 } });
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💧'], n: 8, spread: 26 });
  toast('咕噜咕噜～又喝了一杯 💧');
}

function checkIn(app, m, e) {
  app.recordMood(app.C.dateKey(), m.id, '');
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: [m.emoji], n: 8, spread: 26 });
  toast(`记下啦：${m.emoji} ${m.name}`);
}

function todayCard(app) {
  const { C, catalog } = app;
  const st = app.state;
  const today = C.dateKey();
  const daily = st.stats?.daily || {};
  const water = daily.date === today ? daily.water || 0 : 0;
  const pomo = app.pomoNow();
  const pomos = pomo && typeof pomo.todayCount === 'number' ? pomo.todayCount : daily.date === today ? daily.pomodoros || 0 : 0;
  const todos = st.todos || [];
  const done = todos.filter((t) => t.done).length;
  const mood = (st.moods || {})[today];
  const md = mood && catalog.moods.find((m) => m.id === mood.mood);
  return h(
    'section',
    { class: 'card c-today', key: 'today' },
    cardHead('☀️', '今天'),
    h(
      'div',
      { class: 'today-list' },
      h(
        'div',
        { class: 'td-row water', key: 'water' },
        h('span', { class: 'td-ico' }, '💧'),
        h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, '喝水 ', h('b', water), ' 杯'), h('div', { class: 'cups', title: '一天 8 杯水' }, Array.from({ length: 8 }, (_, i) => h('i', { class: cx({ on: i < water }) })))),
        h('button', { type: 'button', class: 'btn soft xs', onclick: (e) => drink(app, e) }, '+1 杯'),
      ),
      h(
        'button',
        { type: 'button', class: 'td-row link', key: 'pomo', onclick: () => app.go('focus') },
        h('span', { class: 'td-ico' }, '🍅'),
        h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, '专注 ', h('b', pomos), ' 个番茄')),
        icon('right', 'td-go'),
      ),
      h(
        'button',
        { type: 'button', class: 'td-row link', key: 'todo', onclick: () => app.go('todos') },
        h('span', { class: 'td-ico' }, '📝'),
        h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, '待办 ', h('b', done), ` / ${todos.length}`), todos.length ? bar(done / todos.length, 'mini') : h('div', { class: 'td-sub' }, '今天还没有待办')),
        icon('right', 'td-go'),
      ),
      md
        ? h(
            'div',
            { class: 'td-row mood', key: 'mood-done' },
            h('span', { class: 'td-ico' }, '🌈'),
            h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, '心情 ', h('b', md.name)), mood.note && h('div', { class: 'td-sub', title: mood.note }, mood.note)),
            h('button', { type: 'button', class: 'td-mood', style: { '--mc': md.color }, title: '去心情日历', onclick: () => app.go('moods') }, md.emoji),
          )
        : h(
            'div',
            { class: 'td-row mood ask', key: 'mood-ask' },
            h('span', { class: 'td-ico' }, '🌈'),
            h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, '今天心情怎么样？')),
            h('div', { class: 'mood-pick' }, catalog.moods.map((m) => h('button', { type: 'button', class: 'mp', title: m.name, style: { '--mc': m.color }, onclick: (e) => checkIn(app, m, e) }, m.emoji))),
          ),
    ),
  );
}

/* ---------------- 天气 ---------------- */

function weatherCard(app) {
  const w = app.weather || {};
  const d = w.data;
  const city = app.state.weather?.city || (d && d.city) || '天气';
  const refresh = h(
    'button',
    { type: 'button', class: cx('icon-btn', 'sm', { spinning: w.status === 'loading' }), title: '刷新天气', 'aria-label': '刷新天气', onclick: () => app.refreshWeather(true) },
    icon('refresh'),
  );
  let body;
  const noCity = app.state.weather?.lat == null || app.state.weather?.lon == null;
  if (noCity && !d) {
    body = h(
      'div',
      { class: 'wx-state', key: 'nocity' },
      h('span', { class: 'wx-state-ico' }, '🏙️'),
      h('p', '还没有选城市呢'),
      h('button', { type: 'button', class: 'btn soft xs', onclick: () => app.go('settings') }, '去选一个 →'),
    );
  } else if (d && w.status !== 'error') {
    const t = d.tomorrow;
    body = h(
      'div',
      { class: 'wx', key: 'wx' },
      h(
        'div',
        { class: 'wx-main' },
        h('span', { class: 'wx-emoji' }, d.emoji || '🌤️'),
        h('div', { class: 'wx-temp' }, h('b', Math.round(d.temp)), h('span', { class: 'deg' }, '°')),
        h('div', { class: 'wx-desc' }, h('b', d.desc || ''), d.feels != null && h('small', `体感 ${Math.round(d.feels)}°`)),
      ),
      h(
        'div',
        { class: 'wx-meta' },
        h('span', `${Math.round(d.min)}° ~ ${Math.round(d.max)}°`),
        d.rainProb != null && h('span', `☔ ${Math.round(d.rainProb)}%`),
        d.uv != null && h('span', `UV ${Math.round(d.uv)}`),
      ),
      d.advice && h('p', { class: 'wx-advice' }, d.advice),
      t && h('div', { class: 'wx-tmr' }, `明天 ${t.emoji || ''} ${t.desc || ''} ${Math.round(t.min)}°~${Math.round(t.max)}°`),
    );
  } else if (w.status === 'error') {
    body = h(
      'div',
      { class: 'wx-state', key: 'err' },
      h('span', { class: 'wx-state-ico' }, '🌧️'),
      h('p', w.error || '天气暂时查不到'),
      h('button', { type: 'button', class: 'btn ghost xs', onclick: () => app.refreshWeather(true) }, '再试一次'),
    );
  } else {
    body = h('div', { class: 'wx-loading', key: 'loading', 'aria-label': '正在查天气' }, h('span', { class: 'sk a' }), h('span', { class: 'sk b' }), h('span', { class: 'sk c' }));
  }
  return h('section', { class: 'card c-weather', key: 'weather', title: '天气数据由 Open-Meteo.com 提供' }, cardHead('📍', city, refresh), body);
}

export default {
  id: 'overview',
  icon: '🏠',
  label: '首页',
  live: true,
  enter() {
    ui.line = '';
  },
  render(app) {
    const on = !!app.state.weather?.enabled;
    return h(
      'div',
      { class: 'page page-overview' },
      h('div', { class: cx('bento', { 'no-weather': !on }) }, heroCard(app), loveCard(app), statusCard(app), todayCard(app), on && weatherCard(app)),
    );
  },
};
