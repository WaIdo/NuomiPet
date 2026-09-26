// 纪念日：在一起的日子、她的生日、自定义纪念日（每年纪念 / 倒数日 / 累计天数）。
import { h, cx, pageHead, cardHead, datePicker, segmented, modal, toast, icon, fmtDate, addDays, burst, shake } from '../ui.js';

const KINDS = [
  { value: 'yearly', label: '每年纪念' },
  { value: 'countdown', label: '倒数日' },
  { value: 'since', label: '累计天数' },
];
const KIND_NAME = { yearly: '每年纪念', countdown: '倒数日', since: '累计天数' };

const ui = { kind: 'yearly', date: '' };

export function nextMilestone(n, C) {
  for (let k = n + 1; k < n + 20000; k++) if (C.isMilestone(k)) return k;
  return null;
}

// 一个纪念日此刻的说法：{ pre, num, unit } 或 { text }，extra 是「第 N 周年」之类的补充
export function annivInfo(a, C) {
  if (a.kind === 'since') {
    const n = C.dayNumber(a.date);
    if (n) return { pre: '已经', num: n, unit: '天', sort: 200000 + n };
    const left = C.daysUntil(a.date);
    if (left == null) return { text: '日期不对哦', sort: 900000 };
    return { pre: '还有', num: left, unit: '天开始', sort: left };
  }
  if (a.kind === 'countdown') {
    const d = C.daysUntil(a.date);
    if (d == null) return { text: '日期不对哦', sort: 900000 };
    if (d === 0) return { text: '就是今天！', today: true, sort: 0 };
    if (d > 0) return { pre: '还有', num: d, unit: '天', sort: d };
    return { pre: '已过去', num: -d, unit: '天', past: true, sort: 400000 - d };
  }
  const ny = C.nextYearly(a.date);
  if (!ny) return { text: '日期不对哦', sort: 900000 };
  const extra = ny.years > 0 ? `第 ${ny.years} 周年` : '';
  if (ny.isToday) return { text: '就是今天！', extra, today: true, sort: 0 };
  return { pre: '还有', num: ny.daysLeft, unit: '天', extra, sort: ny.daysLeft };
}

// 首页用：接下来会到的日子（生日、在一起周年、里程碑、每年纪念、倒数日），按天数排好
export function upcomingEvents(state, C) {
  const love = state.love || {};
  const out = [];
  if (love.birthday) {
    const ny = C.nextYearly(love.birthday);
    if (ny) out.push({ key: 'birthday', icon: '🎂', name: '生日', days: ny.daysLeft, date: ny.date });
  }
  if (love.togetherSince) {
    const ny = C.nextYearly(love.togetherSince);
    if (ny && ny.years > 0) out.push({ key: 'together', icon: '💑', name: `在一起 ${ny.years} 周年`, days: ny.daysLeft, date: ny.date });
    const n = C.dayNumber(love.togetherSince);
    if (n) {
      const ms = nextMilestone(n, C);
      if (ms) out.push({ key: 'milestone', icon: '💗', name: `在一起第 ${ms} 天`, days: ms - n, date: addDays(love.togetherSince, ms - 1) });
    }
  }
  for (const a of love.anniversaries || []) {
    if (a.kind === 'yearly') {
      const ny = C.nextYearly(a.date);
      if (ny) out.push({ key: a.id, icon: '💝', name: a.name, days: ny.daysLeft, date: ny.date });
    } else if (a.kind === 'countdown') {
      const d = C.daysUntil(a.date);
      if (d != null && d >= 0) out.push({ key: a.id, icon: '⏳', name: a.name, days: d, date: a.date });
    }
  }
  return out.sort((x, y) => x.days - y.days);
}

function togetherCard(app) {
  const { C } = app;
  const since = app.state.love?.togetherSince || '';
  const year = new Date().getFullYear();
  let body;
  if (!since) {
    body = h('p', { class: 'lv-hint' }, '选一个日子，糯米会帮你们数着在一起的每一天 💕');
  } else {
    const n = C.dayNumber(since);
    if (n == null) {
      body = h('div', { class: 'lv-big' }, h('span', { class: 'lv-pre' }, '还有'), h('b', { class: 'num' }, C.daysUntil(since)), h('span', { class: 'lv-unit' }, '天'));
    } else {
      const ms = nextMilestone(n, C);
      const ny = C.nextYearly(since);
      body = [
        h('div', { class: 'lv-big' }, h('span', { class: 'lv-pre' }, '在一起的第'), h('b', { class: 'num' }, n), h('span', { class: 'lv-unit' }, '天')),
        h(
          'div',
          { class: 'lv-lines' },
          ms && h('p', { class: 'lv-line' }, h('i', '🎯'), '距离第 ', h('b', ms), ' 天还有 ', h('b', { class: 'pink' }, ms - n), ' 天', h('span', { class: 'lv-date' }, fmtDate(addDays(since, ms - 1), { withYear: false }))),
          ny &&
            ny.years > 0 &&
            h('p', { class: 'lv-line' }, h('i', '🥂'), ny.isToday ? `今天是 ${ny.years} 周年纪念日！` : [`${ny.years} 周年还有 `, h('b', { class: 'pink' }, ny.daysLeft), ' 天'], h('span', { class: 'lv-date' }, fmtDate(ny.date, { withYear: false }))),
        ),
      ];
    }
  }
  return h(
    'section',
    { class: 'card lv-card together', key: 'together' },
    cardHead(
      '💑',
      '在一起的日子',
      since && h('button', { type: 'button', class: 'link-btn', onclick: () => app.set('love.togetherSince', '') }, '清除'),
    ),
    datePicker('together', since, (v) => app.set('love.togetherSince', v), { yearMin: 1980, yearMax: year, onPartial: app.rerender }),
    h('div', { class: 'lv-body' }, body),
  );
}

function birthdayCard(app) {
  const { C } = app;
  const bd = app.state.love?.birthday || '';
  const ny = bd ? C.nextYearly(bd) : null;
  let body;
  if (!ny) {
    body = h('p', { class: 'lv-hint' }, '填上生日，那天糯米会第一个跟她说生日快乐 🎂');
  } else if (ny.isToday) {
    body = [h('div', { class: 'lv-big today' }, h('b', { class: 'num sm' }, '就是今天！')), h('p', { class: 'lv-line' }, h('i', '🎉'), ny.years ? `${ny.years} 岁生日快乐！` : '生日快乐！')];
  } else {
    body = [
      h('div', { class: 'lv-big' }, h('span', { class: 'lv-pre' }, '还有'), h('b', { class: 'num' }, ny.daysLeft), h('span', { class: 'lv-unit' }, '天')),
      h('div', { class: 'lv-lines' }, h('p', { class: 'lv-line' }, h('i', '🎂'), fmtDate(ny.date), ny.years ? [' · ', h('b', { class: 'pink' }, ny.years), ' 岁生日'] : ' 生日')),
    ];
  }
  return h(
    'section',
    { class: 'card lv-card birthday', key: 'birthday' },
    cardHead('🎂', '她的生日', bd && h('button', { type: 'button', class: 'link-btn', onclick: () => app.set('love.birthday', '') }, '清除')),
    datePicker('birthday', bd, (v) => app.set('love.birthday', v), { noYear: true, yearMin: 1950, yearMax: new Date().getFullYear(), onPartial: app.rerender }),
    h('div', { class: 'lv-body' }, body),
  );
}

async function remove(app, a) {
  const ok = await modal({
    title: `删除「${a.name}」？`,
    text: '删掉之后就不会再提醒这个日子了哦。',
    ok: '删除',
    cancel: '留着',
    danger: true,
  });
  if (!ok) return;
  app.set(
    'love.anniversaries',
    (app.state.love.anniversaries || []).filter((x) => x.id !== a.id),
  );
}

function add(app, e) {
  const box = e.currentTarget.closest('.an-add');
  const input = box.querySelector('input[name="an-name"]');
  const name = input.value.trim();
  if (!name) {
    shake(input);
    input.focus();
    toast('先给这个日子起个名字吧～');
    return;
  }
  if (!ui.date) {
    shake(box.querySelector('.datepick'));
    toast('再选一下日期哦');
    return;
  }
  const item = { id: app.C.uid(), name, date: ui.date, kind: ui.kind };
  app.set('love.anniversaries', [...(app.state.love.anniversaries || []), item]);
  input.value = '';
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💝'] });
}

function item(app, a) {
  const info = annivInfo(a, app.C);
  return h(
    'div',
    { class: cx('an-item', 'k-' + a.kind, { today: info.today, past: info.past }), key: a.id },
    h(
      'div',
      { class: 'an-top' },
      h('span', { class: 'an-kind' }, KIND_NAME[a.kind] || '纪念日'),
      h('button', { type: 'button', class: 'icon-btn xs an-del', title: '删除', 'aria-label': '删除', onclick: () => remove(app, a) }, icon('close')),
    ),
    h('div', { class: 'an-name', title: a.name }, a.name),
    h('div', { class: 'an-date' }, fmtDate(a.date)),
    h(
      'div',
      { class: 'an-count' },
      info.text ? h('b', { class: 'an-now' }, info.text) : [h('span', info.pre), h('b', info.num), h('span', info.unit)],
      info.extra && h('span', { class: 'an-extra' }, info.extra),
    ),
  );
}

export default {
  id: 'love',
  icon: '💝',
  label: '纪念日',
  enter(app) {
    if (!ui.date) ui.date = app.C.dateKey();
  },
  render(app) {
    const list = (app.state.love?.anniversaries || []).map((a) => ({ a, s: annivInfo(a, app.C).sort })).sort((x, y) => x.s - y.s);
    const year = new Date().getFullYear();
    return h(
      'div',
      { class: 'page page-love' },
      pageHead('💝', '纪念日', '重要的日子，糯米都帮你们记着'),
      h('div', { class: 'love-top' }, togetherCard(app), birthdayCard(app)),
      h(
        'section',
        { class: 'card an-card', key: 'list' },
        cardHead('📅', '我们的纪念日', h('span', { class: 'muted-chip' }, `${list.length} 个`)),
        list.length ? h('div', { class: 'an-grid', key: 'grid' }, list.map(({ a }) => item(app, a))) : h('p', { class: 'an-empty', key: 'empty' }, '还没有自定义的纪念日，在下面添加一个吧～'),
        h(
          'div',
          { class: 'an-add', key: 'add' },
          h('div', { class: 'an-add-row' }, h('input', { class: 'input grow', name: 'an-name', key: 'an-name', placeholder: '名字，比如：第一次约会', maxlength: 16, onkeydown: (e) => e.key === 'Enter' && !e.isComposing && add(app, e) })),
          h(
            'div',
            { class: 'an-add-row' },
            datePicker('an-new', ui.date, (v) => {
              ui.date = v;
              app.rerender();
            }, { yearMin: 1980, yearMax: year + 10, onPartial: app.rerender }),
            segmented(KINDS, ui.kind, (v) => {
              ui.kind = v;
              app.rerender();
            }, { cls: 'sm' }),
            h('button', { type: 'button', class: 'btn primary', onclick: (e) => add(app, e) }, icon('plus'), '添加'),
          ),
        ),
      ),
    );
  },
};
