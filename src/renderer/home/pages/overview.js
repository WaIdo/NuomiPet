// 首页：宠物大卡片、在一起、状态、今天、天气（便当盒布局）。
import { h, s, cx, petEl, bar, cardHead, popover, closePopover, burst, hearts, toast, icon, fmtDate, dateWeek, rich, arrow } from '../ui.js';
import { upcomingEvents } from './love.js';
import { em, phrases, t, petName, nickname, onLangChange } from '../../shared/i18n.mjs';

const ui = { line: '', pokeTimer: 0 };

// 气泡里的那句话是按语言挑的，换了语言就重新挑
onLangChange(() => {
  ui.line = '';
});

function greeting(d = new Date()) {
  const hr = d.getHours() + d.getMinutes() / 60;
  if (hr < 5) return t('home.overview.greet.night');
  if (hr < 9) return t('home.overview.greet.morning');
  if (hr < 11.5) return t('home.overview.greet.forenoon');
  if (hr < 13.5) return t('home.overview.greet.noon');
  if (hr < 18) return t('home.overview.greet.afternoon');
  if (hr < 23) return t('home.overview.greet.evening');
  return t('home.overview.greet.night');
}

function daypart(d = new Date()) {
  const hr = d.getHours();
  if (hr >= 5 && hr < 10) return 'morning';
  if (hr >= 11 && hr < 13) return 'noon';
  if (hr >= 17 && hr < 20) return 'evening';
  if (hr >= 22 || hr < 5) return 'night';
  return 'idle';
}

function sayLine(app, cat) {
  const st = app.state;
  const vars = { pet: petName(st), nick: nickname(st) };
  const pool = (phrases[cat] || phrases.idle || []).map((x) => app.C.fill(x, vars)).filter((x) => !/\{\w+\}/.test(x));
  return app.C.pick(pool, 'home-' + cat) || t('home.overview.defaultLine');
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
  const name = petName(st);
  const pat = t('home.overview.pat', { pet: name });
  const days = app.companionDays();
  if (!ui.line) ui.line = sayLine(app, daypart(d));
  return h(
    'section',
    { class: 'card c-hero', key: 'hero' },
    h(
      'button',
      { type: 'button', class: 'hero-stage', key: 'stage', title: pat, 'aria-label': pat, onclick: (e) => poke(app, e) },
      h('span', { class: 'hs-glow' }),
      h('span', { class: 'hs-spark s1' }, '✦'),
      h('span', { class: 'hs-spark s2' }, '✧'),
      h('span', { class: 'hs-spark s3' }, '✦'),
      petEl(app.look(), { size: 170, blink: true, track: true, cls: 'hero-pet', key: 'hero-pet' }),
    ),
    h(
      'div',
      { class: 'hero-info' },
      h('div', { class: 'hero-date' }, dateWeek(d)),
      h('h2', { class: 'hero-greet' }, t('home.overview.greeting', { greet: greeting(d), nick: nickname(st) })),
      h('p', { class: 'hero-days' }, rich('home.overview.days', { pet: name, n: days }, { n: h('b', days) })),
      h('div', { class: 'bubble', key: 'bubble' }, ui.line),
      h(
        'div',
        { class: 'hero-level' },
        h('span', { class: 'lv-chip' }, h('b', `Lv.${lv.level}`), lv.title),
        h('span', { class: 'xp-num' }, lv.next ? [h('b', xp - lv.xp), ` / ${lv.next.xp - lv.xp}`] : t('home.overview.maxLevel')),
      ),
      bar(lv.progress, 'xp lg'),
      lv.next && h('p', { class: 'xp-hint' }, t('home.overview.xpHint', { n: lv.next.xp - xp, title: lv.next.title })),
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
          h('div', { class: 'lc-label' }, heartIcon('beat'), t('home.together')),
          // 「第 N 天」：数字前后的字各放一个 <small>
          h('div', { class: 'lc-num' }, rich('home.overview.love.dayN', { n }, { n: h('b', n) }).map((x) => (typeof x === 'string' ? h('small', x) : x))),
          h('div', { class: 'lc-since' }, t('home.overview.love.since', { date: fmtDate(love.togetherSince) })),
        )
      : h(
          'div',
          { class: 'love-empty', key: 'empty' },
          heartIcon('le-heart'),
          h('p', t('home.overview.love.empty', { pet: petName(app.state) })),
          // 文字和箭头包在一个 span 里：按钮是 flex，分开放会多出 gap
          h('button', { type: 'button', class: 'btn soft sm', onclick: () => app.go('love') }, h('span', rich('home.overview.love.setDate', {}, { arrow: arrow() }))),
        ),
    h(
      'button',
      { type: 'button', class: 'love-next', key: 'next', onclick: () => app.go('love'), title: t('home.overview.love.go') },
      ev
        ? [
            h('span', { class: 'ln-ico' }, ev.icon),
            h(
              'span',
              { class: 'ln-text' },
              ev.days === 0
                ? rich('home.overview.love.today', {}, { name: h('b', { class: 'ln-name' }, ev.name) })
                : rich('home.overview.love.until', {}, {
                    name: h('b', { class: 'ln-name' }, ev.name),
                    left: h('span', { class: 'nw' }, rich('home.overview.love.left', { n: ev.days }, { n: h('b', { class: 'pink' }, ev.days) })),
                  }),
            ),
          ]
        : [h('span', { class: 'ln-ico' }, '📅'), h('span', { class: 'ln-text muted' }, t('home.overview.love.none'))],
    ),
  );
}

/* ---------------- 状态 ---------------- */

const fullLevel = (v) => (v >= 85 ? 'full' : v >= 55 ? 'fine' : v >= 30 ? 'hungry' : 'starving');
const moodLevel = (v) => (v >= 85 ? 'great' : v >= 60 ? 'happy' : v >= 35 ? 'meh' : 'low');
const fullWord = (v) => t(`home.overview.fullness.${fullLevel(v)}`);
const moodWord = (v) => t(`home.overview.mood.${moodLevel(v)}`);

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
  toast(t('home.overview.food.fed', { emoji: f.emoji, pet: petName(app.state) }));
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
      h('div', { class: 'pop-title' }, t('home.overview.food.title', { pet: petName(app.state) })),
      h(
        'div',
        { class: 'food-grid' },
        foods.map((f) =>
          h(
            'button',
            { type: 'button', class: cx('food', { fav: f.id === fav }), title: f.line, onclick: (e) => feed(app, f, e) },
            h('span', { class: 'food-emoji' }, f.emoji),
            h('span', { class: 'food-name' }, f.name),
            f.id === fav && h('span', { class: 'fav-tag' }, t('home.overview.food.fav')),
          ),
        ),
      ),
    ),
    { cls: 'pop-food' },
  );
}

// 哄哄我的各个动作；名字在 home.overview.coax.<id>
const COAX = [
  { id: 'kneel', emoji: '🙇' },
  { id: 'flower', emoji: '💐' },
  { id: 'heart', emoji: '❤️' },
  { id: 'hug', emoji: '🤗' },
  { id: 'kiss', emoji: '😘' },
  { id: 'tea', emoji: em('🧋') },
  { id: 'bow', emoji: '🙏' },
  { id: 'cute', emoji: '🥺' },
  { id: 'roll', emoji: '🌀' },
  { id: 'dance', emoji: '💃' },
  { id: 'praise', emoji: '🌟' },
  { id: 'random', emoji: '🎲' },
];

function coax(app, c, e) {
  app.mochi.petCommand({ type: 'coax', kind: c.id });
  const r = e.currentTarget.getBoundingClientRect();
  hearts(r.left + r.width / 2, r.top + r.height / 2);
  closePopover();
  const pet = petName(app.state);
  toast(c.id === 'kneel' ? t('home.overview.coax.kneeling', { pet }) : t('home.overview.coax.coming', { pet }));
}

function openCoax(app, anchor) {
  popover(
    anchor,
    h(
      'div',
      { class: 'food-pop' },
      h('div', { class: 'pop-title' }, t('home.overview.coax.title', { pet: petName(app.state) })),
      h(
        'div',
        { class: 'food-grid' },
        COAX.map((c) =>
          h(
            'button',
            { type: 'button', class: cx('food', { fav: c.id === 'kneel' }), onclick: (e) => coax(app, c, e) },
            h('span', { class: 'food-emoji' }, c.emoji),
            h('span', { class: 'food-name' }, t(`home.overview.coax.${c.id}`)),
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
  toast(t('home.overview.played', { pet: petName(app.state) }));
}

// 一起的回忆：从认识到现在的累计次数。id 对应 home.overview.memories.<id>，unit 对应 ….unit.<unit>
function memories(c) {
  const item = (emoji, id, count, unit) => {
    const n = count || 0;
    const label = t(`home.overview.memories.${id}`);
    const u = t(`home.overview.memories.unit.${unit}`, { n });
    return h('div', { class: 'mem', title: t('home.overview.memories.tip', { label, n, unit: u }) }, h('i', emoji), h('span', label), h('b', n), h('small', u));
  };
  return h(
    'div',
    { class: 'memories', key: 'mem' },
    h('div', { class: 'mem-title' }, t('home.overview.memories.title')),
    h(
      'div',
      { class: 'mem-grid' },
      item('🤲', 'pets', c.pets, 'times'),
      item('🍓', 'feeds', c.feeds, 'times'),
      item('🧶', 'plays', c.plays, 'times'),
      item('💧', 'waters', c.waters, 'cups'),
      item('🍅', 'pomodoros', c.pomodoros, 'pomodoros'),
      item('📝', 'todos', c.todos, 'todos'),
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
    cardHead('🍙', t('home.overview.status.title', { pet: petName(app.state) })),
    h('div', { class: 'meters' }, meter(t('home.overview.status.fullness'), '🍚', full, 'full', fullWord(full)), meter(t('home.overview.status.mood'), '💗', mood, 'mood', moodWord(mood))),
    h(
      'div',
      { class: 'facts' },
      fav && h('span', { class: 'fact' }, h('i', fav.emoji), t('home.overview.status.favorite', { food: fav.name })),
      h('span', { class: 'fact', title: t('home.overview.status.patsTip', { n: daily.pets || 0 }) }, h('i', '🤲'), t('home.overview.status.pats', { n: daily.pets || 0 })),
    ),
    memories(st.counters || {}),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary sm grow', onclick: (e) => openFood(app, e.currentTarget) }, t('home.overview.status.feed')),
      h('button', { type: 'button', class: 'btn soft sm grow', onclick: (e) => openCoax(app, e.currentTarget) }, t('home.overview.status.coax')),
      h('button', { type: 'button', class: 'btn ghost sm grow', onclick: (e) => play(app, e) }, t('home.overview.status.play')),
    ),
  );
}

/* ---------------- 今天 ---------------- */

function drink(app, e) {
  app.bump({ xp: 1, counters: { waters: 1 }, daily: { water: 1 } });
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💧'], n: 8, spread: 26 });
  toast(t('home.overview.today.drank'));
}

function checkIn(app, m, e) {
  app.recordMood(app.C.dateKey(), m.id, '');
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: [m.emoji], n: 8, spread: 26 });
  toast(t('home.overview.today.moodSaved', { emoji: m.emoji, mood: m.name }));
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
  const done = todos.filter((x) => x.done).length;
  const mood = (st.moods || {})[today];
  const md = mood && catalog.moods.find((m) => m.id === mood.mood);
  return h(
    'section',
    { class: 'card c-today', key: 'today' },
    cardHead('☀️', t('home.overview.today.title')),
    h(
      'div',
      { class: 'today-list' },
      h(
        'div',
        { class: 'td-row water', key: 'water' },
        h('span', { class: 'td-ico' }, '💧'),
        h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, rich('home.overview.today.water', { n: water }, { n: h('b', water) })), h('div', { class: 'cups', title: t('home.overview.today.cupsGoal', { n: 8 }) }, Array.from({ length: 8 }, (_, i) => h('i', { class: cx({ on: i < water }) })))),
        h('button', { type: 'button', class: 'btn soft xs', onclick: (e) => drink(app, e) }, t('home.overview.today.addCup')),
      ),
      h(
        'button',
        { type: 'button', class: 'td-row link', key: 'pomo', onclick: () => app.go('focus') },
        h('span', { class: 'td-ico' }, '🍅'),
        h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, rich('home.overview.today.pomodoros', { n: pomos }, { n: h('b', pomos) }))),
        icon('right', 'td-go'),
      ),
      h(
        'button',
        { type: 'button', class: 'td-row link', key: 'todo', onclick: () => app.go('todos') },
        h('span', { class: 'td-ico' }, '📝'),
        h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, rich('home.overview.today.todos', { done, total: todos.length }, { done: h('b', done) })), todos.length ? bar(done / todos.length, 'mini') : h('div', { class: 'td-sub' }, t('home.overview.today.noTodos'))),
        icon('right', 'td-go'),
      ),
      md
        ? h(
            'div',
            { class: 'td-row mood', key: 'mood-done' },
            h('span', { class: 'td-ico' }, '🌈'),
            h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, rich('home.overview.today.mood', {}, { mood: h('b', md.name) })), mood.note && h('div', { class: 'td-sub', title: mood.note }, mood.note)),
            h('button', { type: 'button', class: 'td-mood', style: { '--mc': md.color }, title: t('home.overview.today.moodGo'), onclick: () => app.go('moods') }, md.emoji),
          )
        : h(
            'div',
            { class: 'td-row mood ask', key: 'mood-ask' },
            h('span', { class: 'td-ico' }, '🌈'),
            h('div', { class: 'td-main' }, h('div', { class: 'td-label' }, t('home.overview.today.moodAsk'))),
            h('div', { class: 'mood-pick' }, catalog.moods.map((m) => h('button', { type: 'button', class: 'mp', title: m.name, style: { '--mc': m.color }, onclick: (e) => checkIn(app, m, e) }, m.emoji))),
          ),
    ),
  );
}

/* ---------------- 天气 ---------------- */

function weatherCard(app) {
  const w = app.weather || {};
  const d = w.data;
  const city = app.state.weather?.city || (d && d.city) || t('home.weather.title');
  const refreshTip = t('home.overview.weather.refresh');
  const refresh = h(
    'button',
    { type: 'button', class: cx('icon-btn', 'sm', { spinning: w.status === 'loading' }), title: refreshTip, 'aria-label': refreshTip, onclick: () => app.refreshWeather(true) },
    icon('refresh'),
  );
  let body;
  const noCity = app.state.weather?.lat == null || app.state.weather?.lon == null;
  if (noCity && !d) {
    body = h(
      'div',
      { class: 'wx-state', key: 'nocity' },
      h('span', { class: 'wx-state-ico' }, '🏙️'),
      h('p', t('home.overview.weather.noCity')),
      h('button', { type: 'button', class: 'btn soft xs', onclick: () => app.go('settings') }, h('span', rich('home.overview.weather.pickCity', {}, { arrow: arrow() }))),
    );
  } else if (d && w.status !== 'error') {
    const tmr = d.tomorrow;
    body = h(
      'div',
      { class: 'wx', key: 'wx' },
      h(
        'div',
        { class: 'wx-main' },
        h('span', { class: 'wx-emoji' }, d.emoji || '🌤️'),
        h('div', { class: 'wx-temp' }, h('b', Math.round(d.temp)), h('span', { class: 'deg' }, '°')),
        h('div', { class: 'wx-desc' }, h('b', d.desc || ''), d.feels != null && h('small', t('home.overview.weather.feels', { temp: Math.round(d.feels) }))),
      ),
      h(
        'div',
        { class: 'wx-meta' },
        h('span', `${Math.round(d.min)}° ~ ${Math.round(d.max)}°`),
        d.rainProb != null && h('span', `☔ ${Math.round(d.rainProb)}%`),
        d.uv != null && h('span', `UV ${Math.round(d.uv)}`),
      ),
      d.advice && h('p', { class: 'wx-advice' }, d.advice),
      tmr && h('div', { class: 'wx-tmr' }, t('home.overview.weather.tomorrow', { emoji: tmr.emoji || '', desc: tmr.desc || '', min: Math.round(tmr.min), max: Math.round(tmr.max) })),
    );
  } else if (w.status === 'error') {
    body = h(
      'div',
      { class: 'wx-state', key: 'err' },
      h('span', { class: 'wx-state-ico' }, '🌧️'),
      h('p', w.error || t('home.weather.unavailable')),
      h('button', { type: 'button', class: 'btn ghost xs', onclick: () => app.refreshWeather(true) }, t('common.retry')),
    );
  } else {
    body = h('div', { class: 'wx-loading', key: 'loading', 'aria-label': t('home.overview.weather.loading') }, h('span', { class: 'sk a' }), h('span', { class: 'sk b' }), h('span', { class: 'sk c' }));
  }
  return h('section', { class: 'card c-weather', key: 'weather', title: t('home.overview.weather.credit') }, cardHead('📍', city, refresh), body);
}

export default {
  id: 'overview',
  icon: '🏠',
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
