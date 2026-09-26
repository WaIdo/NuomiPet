// 心情：月历（周一开头），每天一个心情表情；点今天或以前的日子可以记录/修改；下面是本月统计。
import { h, cx, pageHead, cardHead, popover, closePopover, toast, icon, burst, WEEK } from '../ui.js';

const HEAD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const ui = { y: 0, m: 0 };

const pad2 = (n) => String(n).padStart(2, '0');

function openPicker(app, key, anchor) {
  const { C, catalog } = app;
  const rec = (app.state.moods || {})[key];
  let sel = rec ? rec.mood : null;
  const p = C.parseKey(key);
  const isToday = key === C.dateKey();
  const d = new Date(p.y, p.m - 1, p.d);
  const title = isToday ? '今天的心情' : `${p.m}月${p.d}日 · ${WEEK[d.getDay()]}`;
  const note = h('input', { class: 'input sm', maxlength: 30, placeholder: '想说点什么吗？（可以不写）', value: rec?.note || '' });
  const save = h('button', { type: 'button', class: 'btn primary sm', disabled: !sel, onclick: () => commit() }, '记下来');
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
    toast(`记下啦：${m.emoji} ${m.name}`);
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
      h('div', { class: 'pop-actions' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => closePopover() }, '取消'), save),
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
          title: md ? `${md.name}${rec.note ? '：' + rec.note : ''}` : future ? null : '点一下记录心情',
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
      h('button', { type: 'button', class: 'icon-btn', title: '上个月', 'aria-label': '上个月', onclick: () => shiftMonth(app, -1) }, icon('left')),
      h('div', { class: 'cal-title' }, h('b', `${ui.m}月`), h('span', ui.y + '年')),
      h('button', { type: 'button', class: 'icon-btn', title: '下个月', 'aria-label': '下个月', disabled: future, onclick: () => shiftMonth(app, 1) }, icon('right')),
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
          '回到本月',
        ),
    ),
    h('div', { class: 'cal-week' }, HEAD.map((d) => h('span', d))),
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
      cardHead('🌈', '今天的心情'),
      h('div', { class: 'mt-main' }, h('span', { class: 'mt-emo' }, md.emoji), h('div', { class: 'mt-text' }, h('b', md.name), h('p', rec.note ? `「${rec.note}」` : '没有写备注'))),
      h('button', { type: 'button', class: 'btn ghost sm', onclick: (e) => openPicker(app, key, e.currentTarget) }, '改一改'),
    );
  }
  return h(
    'section',
    { class: 'card mood-today', key: 'today' },
    cardHead('🌈', '今天的心情'),
    h('p', { class: 'mt-ask' }, '今天是什么样的一天呀？点一下记下来吧'),
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
              toast(`记下啦：${m.emoji} ${m.name}`);
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
    cardHead('📊', `${ui.m}月的心情`, h('span', { class: 'muted-chip' }, `记录了 ${total} 天`)),
    total
      ? h(
          'div',
          { class: 'sum-bar', key: 'bar' },
          counts.filter((c) => c.n).map((c) => h('i', { key: c.m.id, style: { flex: String(c.n), background: c.m.color }, title: `${c.m.name} ${c.n} 天` })),
        )
      : h('div', { class: 'sum-bar empty', key: 'bar-empty' }),
    total ? h('p', { class: 'sum-top' }, '这个月最多的是 ', h('b', `${top.m.emoji} ${top.m.name}`), `，一共 ${top.n} 天`) : h('p', { class: 'sum-top muted' }, '这个月还没有记录，从今天开始吧～'),
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
  label: '心情',
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
      pageHead('🌈', '心情', '每天记一下心情，糯米会好好记住的'),
      h('div', { class: 'moods' }, calendar(app), h('div', { class: 'mood-side', key: 'side' }, todayCard(app), summary(app))),
    );
  },
};
