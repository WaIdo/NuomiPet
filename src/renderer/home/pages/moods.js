// 心情：月历（周一开头），每天一个心情表情；点今天或以前的日子可以记录/修改；下面是本月统计。
import { h, cx, pageHead, cardHead, popover, closePopover, toast, icon, burst, fmtDate, rich } from '../ui.js';
import { t, weekday, petName } from '../../shared/i18n.mjs';

// 表头的星期几，周一开头（0 = 周日）
const HEAD = [1, 2, 3, 4, 5, 6, 0];
const ui = { y: 0, m: 0 };

const pad2 = (n) => String(n).padStart(2, '0');

// 月份的名字（「9月」）
function monthName(m) {
  const months = t('date.months');
  return t('date.month', { m, mon: Array.isArray(months) ? months[m - 1] : String(m) });
}

function openPicker(app, key, anchor) {
  const { C, catalog } = app;
  const rec = (app.state.moods || {})[key];
  let sel = rec ? rec.mood : null;
  const p = C.parseKey(key);
  const isToday = key === C.dateKey();
  const d = new Date(p.y, p.m - 1, p.d);
  const title = isToday ? t('home.moods.today') : t('home.moods.pick.title', { date: fmtDate(key, { withYear: false }), week: weekday(d.getDay()) });
  const note = h('input', { class: 'input sm', maxlength: 30, placeholder: t('home.moods.pick.placeholder'), value: rec?.note || '' });
  const save = h('button', { type: 'button', class: 'btn primary sm', disabled: !sel, onclick: () => commit() }, t('home.moods.pick.save'));
  const grid = h(
    'div',
    { class: 'mp-grid' },
    catalog.moods.map((m) =>
      h(
        'button',
        {
          type: 'button',
          class: cx('mp-opt', { on: m.id === sel }),
          style: { '--mc': m.color },
          onclick: (e) => {
            sel = m.id;
            for (const b of grid.children) b.classList.toggle('on', b === e.currentTarget);
            save.disabled = false;
          },
          ondblclick: () => commit(),
        },
        h('span', { class: 'mp-emo' }, m.emoji),
        h('small', m.name),
      ),
    ),
  );
  function commit() {
    if (!sel) return;
    const m = catalog.moods.find((x) => x.id === sel);
    app.recordMood(key, sel, note.value.trim());
    const r = anchor.getBoundingClientRect();
    closePopover();
    burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: [m.emoji], n: 10, spread: 26 });
    toast(t('home.moods.saved', { emoji: m.emoji, name: m.name }));
  }
  note.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) commit();
  });
  popover(
    anchor,
    h(
      'div',
      { class: 'mood-pop' },
      h('div', { class: 'pop-title' }, title),
      grid,
      note,
      h('div', { class: 'pop-actions' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => closePopover() }, t('common.cancel')), save),
    ),
    { cls: 'pop-mood' },
  );
}

function shiftMonth(app, d) {
  let m = ui.m + d;
  let y = ui.y;
  if (m < 1) (m = 12), y--;
  if (m > 12) (m = 1), y++;
  ui.y = y;
  ui.m = m;
  closePopover();
  app.rerender();
}

function calendar(app) {
  const { C, catalog } = app;
  const moods = app.state.moods || {};
  const byId = Object.fromEntries(catalog.moods.map((m) => [m.id, m]));
  const now = new Date();
  const isCur = ui.y === now.getFullYear() && ui.m === now.getMonth() + 1;
  const first = new Date(ui.y, ui.m - 1, 1);
  const dim = new Date(ui.y, ui.m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const today = C.dateKey();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'cal-cell blank', key: 'b' + i }));
  for (let d = 1; d <= dim; d++) {
    const key = `${ui.y}-${pad2(ui.m)}-${pad2(d)}`;
    const rec = moods[key];
    const md = rec && byId[rec.mood];
    const future = key > today;
    cells.push(
      h(
        'button',
        {
          type: 'button',
          key,
          class: cx('cal-cell', 'day', { today: key === today, future, has: !!md }),
          disabled: future,
          style: md ? { '--mc': md.color } : null,
          title: md ? (rec.note ? t('home.moods.cal.note', { name: md.name, note: rec.note }) : md.name) : future ? null : t('home.moods.cal.tap'),
          onclick: (e) => openPicker(app, key, e.currentTarget),
        },
        h('span', { class: 'cal-num' }, d),
        md && h('span', { class: 'cal-emo' }, md.emoji),
      ),
    );
  }
  const future = ui.y > now.getFullYear() || (ui.y === now.getFullYear() && ui.m >= now.getMonth() + 1);
  return h(
    'section',
    { class: 'card cal-card', key: 'cal' },
    h(
      'div',
      { class: 'cal-head' },
      h('button', { type: 'button', class: 'icon-btn', title: t('home.moods.cal.prev'), 'aria-label': t('home.moods.cal.prev'), onclick: () => shiftMonth(app, -1) }, icon('left')),
      h('div', { class: 'cal-title' }, h('b', monthName(ui.m)), h('span', t('date.year', { y: ui.y }))),
      h('button', { type: 'button', class: 'icon-btn', title: t('home.moods.cal.next'), 'aria-label': t('home.moods.cal.next'), disabled: future, onclick: () => shiftMonth(app, 1) }, icon('right')),
      !isCur &&
        h(
          'button',
          {
            type: 'button',
            class: 'link-btn cal-today',
            onclick: () => {
              ui.y = now.getFullYear();
              ui.m = now.getMonth() + 1;
              app.rerender();
            },
          },
          t('home.moods.cal.thisMonth'),
        ),
    ),
    h('div', { class: 'cal-week' }, HEAD.map((i) => h('span', weekday(i)))),
    h('div', { class: 'cal-grid', key: `${ui.y}-${ui.m}` }, cells),
  );
}

function todayCard(app) {
  const { C, catalog } = app;
  const key = C.dateKey();
  const rec = (app.state.moods || {})[key];
  const md = rec && catalog.moods.find((m) => m.id === rec.mood);
  if (md) {
    return h(
      'section',
      { class: 'card mood-today has', key: 'today', style: { '--mc': md.color } },
      cardHead('🌈', t('home.moods.today')),
      h('div', { class: 'mt-main' }, h('span', { class: 'mt-emo' }, md.emoji), h('div', { class: 'mt-text' }, h('b', md.name), h('p', rec.note ? t('home.moods.todayNote', { note: rec.note }) : t('home.moods.noNote')))),
      h('button', { type: 'button', class: 'btn ghost sm', onclick: (e) => openPicker(app, key, e.currentTarget) }, t('home.moods.change')),
    );
  }
  return h(
    'section',
    { class: 'card mood-today', key: 'today' },
    cardHead('🌈', t('home.moods.today')),
    h('p', { class: 'mt-ask' }, t('home.moods.ask')),
    h(
      'div',
      { class: 'mt-pick' },
      catalog.moods.map((m) =>
        h(
          'button',
          {
            type: 'button',
            class: 'mp-quick',
            title: m.name,
            style: { '--mc': m.color },
            onclick: (e) => {
              app.recordMood(key, m.id, '');
              const r = e.currentTarget.getBoundingClientRect();
              burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: [m.emoji], n: 8, spread: 24 });
              toast(t('home.moods.saved', { emoji: m.emoji, name: m.name }));
            },
          },
          h('span', m.emoji),
          h('small', m.name),
        ),
      ),
    ),
  );
}

function summary(app) {
  const { catalog } = app;
  const moods = app.state.moods || {};
  const prefix = `${ui.y}-${pad2(ui.m)}-`;
  const counts = catalog.moods.map((m) => ({ m, n: 0 }));
  const idx = Object.fromEntries(catalog.moods.map((m, i) => [m.id, i]));
  for (const k in moods) {
    if (!k.startsWith(prefix)) continue;
    const i = idx[moods[k]?.mood];
    if (i != null) counts[i].n++;
  }
  const total = counts.reduce((a, c) => a + c.n, 0);
  const top = [...counts].sort((a, b) => b.n - a.n)[0];
  return h(
    'section',
    { class: 'card mood-sum', key: 'sum' },
    cardHead('📊', t('home.moods.month.title', { month: monthName(ui.m) }), h('span', { class: 'muted-chip' }, t('home.moods.month.recorded', { n: total }))),
    total
      ? h(
          'div',
          { class: 'sum-bar', key: 'bar' },
          counts.filter((c) => c.n).map((c) => h('i', { key: c.m.id, style: { flex: String(c.n), background: c.m.color }, title: t('home.moods.month.bar', { name: c.m.name, n: c.n }) })),
        )
      : h('div', { class: 'sum-bar empty', key: 'bar-empty' }),
    total
      ? h('p', { class: 'sum-top' }, rich('home.moods.month.top', { n: top.n }, { mood: h('b', `${top.m.emoji} ${top.m.name}`) }))
      : h('p', { class: 'sum-top muted' }, t('home.moods.month.none')),
    h(
      'div',
      { class: 'sum-legend' },
      counts.map((c) => h('span', { class: cx('sl', { zero: !c.n }), key: c.m.id }, h('i', { style: { background: c.m.color } }), `${c.m.emoji} ${c.m.name}`, h('b', c.n))),
    ),
  );
}

export default {
  id: 'moods',
  icon: '🌈',
  enter() {
    const d = new Date();
    ui.y = d.getFullYear();
    ui.m = d.getMonth() + 1;
  },
  render(app) {
    if (!ui.y) this.enter();
    return h(
      'div',
      { class: 'page page-moods' },
      pageHead('🌈', t('home.moods.title'), t('home.moods.sub', { pet: petName(app.state) })),
      h('div', { class: 'moods' }, calendar(app), h('div', { class: 'mood-side', key: 'side' }, todayCard(app), summary(app))),
    );
  },
};
