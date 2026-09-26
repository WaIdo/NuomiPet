// 纪念日：在一起的日子、她的生日、自定义纪念日（每年纪念 / 倒数日 / 累计天数）。
import { h, cx, pageHead, cardHead, datePicker, segmented, modal, toast, icon, fmtDate, addDays, burst, shake, rich } from '../ui.js';
import { t, fill, petName } from '../../shared/i18n.mjs';

const KINDS = ['yearly', 'countdown', 'since'];
const kindName = (kind) => t(`home.love.kinds.${KINDS.includes(kind) ? kind : 'other'}`);

const ui = { kind: 'yearly', date: '' };

// 「还有{n}天」这样的句子拆成数字前后两段：{ pre: '还有', num: n, unit: '天' }，数字单独加粗
function around(tpl, n) {
  const [pre, unit = ''] = fill(String(tpl).replace(/\{n\}/g, '\u0000'), { n }).split('\u0000');
  return { pre, num: n, unit };
}

function bigCount(tpl, n) {
  const c = around(tpl, n);
  return h('div', { class: 'lv-big' }, h('span', { class: 'lv-pre' }, c.pre), h('b', { class: 'num' }, c.num), h('span', { class: 'lv-unit' }, c.unit));
}

export function nextMilestone(n, C) {
  for (let k = n + 1; k < n + 20000; k++) if (C.isMilestone(k)) return k;
  return null;
}

// 一个纪念日此刻的说法：{ pre, num, unit } 或 { text }，extra 是「第 N 周年」之类的补充
export function annivInfo(a, C) {
  if (a.kind === 'since') {
    const n = C.dayNumber(a.date);
    if (n) return { ...around(t('home.love.count.sinceDays'), n), sort: 200000 + n };
    const left = C.daysUntil(a.date);
    if (left == null) return { text: t('home.love.count.badDate'), sort: 900000 };
    return { ...around(t('home.love.count.startsIn'), left), sort: left };
  }
  if (a.kind === 'countdown') {
    const d = C.daysUntil(a.date);
    if (d == null) return { text: t('home.love.count.badDate'), sort: 900000 };
    if (d === 0) return { text: t('home.love.count.today'), today: true, sort: 0 };
    if (d > 0) return { ...around(t('home.love.count.daysLeft'), d), sort: d };
    return { ...around(t('home.love.count.daysPast'), -d), past: true, sort: 400000 - d };
  }
  const ny = C.nextYearly(a.date);
  if (!ny) return { text: t('home.love.count.badDate'), sort: 900000 };
  const extra = ny.years > 0 ? t('home.love.count.years', { n: ny.years }) : '';
  if (ny.isToday) return { text: t('home.love.count.today'), extra, today: true, sort: 0 };
  return { ...around(t('home.love.count.daysLeft'), ny.daysLeft), extra, sort: ny.daysLeft };
}

// 首页用：接下来会到的日子（生日、在一起周年、里程碑、每年纪念、倒数日），按天数排好
export function upcomingEvents(state, C) {
  const love = state.love || {};
  const out = [];
  if (love.birthday) {
    const ny = C.nextYearly(love.birthday);
    if (ny) out.push({ key: 'birthday', icon: '🎂', name: t('home.love.events.birthday'), days: ny.daysLeft, date: ny.date });
  }
  if (love.togetherSince) {
    const ny = C.nextYearly(love.togetherSince);
    if (ny && ny.years > 0) out.push({ key: 'together', icon: '💑', name: t('home.love.events.together', { n: ny.years }), days: ny.daysLeft, date: ny.date });
    const n = C.dayNumber(love.togetherSince);
    if (n) {
      const ms = nextMilestone(n, C);
      if (ms) out.push({ key: 'milestone', icon: '💗', name: t('home.love.events.milestone', { n: ms }), days: ms - n, date: addDays(love.togetherSince, ms - 1) });
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
    body = h('p', { class: 'lv-hint' }, t('home.love.together.hint', { pet: petName(app.state) }));
  } else {
    const n = C.dayNumber(since);
    if (n == null) {
      body = bigCount(t('home.love.count.daysLeft'), C.daysUntil(since));
    } else {
      const ms = nextMilestone(n, C);
      const ny = C.nextYearly(since);
      body = [
        bigCount(t('home.love.together.dayN'), n),
        h(
          'div',
          { class: 'lv-lines' },
          ms &&
            h(
              'p',
              { class: 'lv-line' },
              h('i', '🎯'),
              rich('home.love.together.toMilestone', { ms, n: ms - n }, { ms: h('b', ms), n: h('b', { class: 'pink' }, ms - n) }),
              h('span', { class: 'lv-date' }, fmtDate(addDays(since, ms - 1), { withYear: false })),
            ),
          ny &&
            ny.years > 0 &&
            h(
              'p',
              { class: 'lv-line' },
              h('i', '🥂'),
              ny.isToday
                ? t('home.love.together.anniversaryToday', { n: ny.years })
                : rich('home.love.together.toAnniversary', { years: ny.years, n: ny.daysLeft }, { n: h('b', { class: 'pink' }, ny.daysLeft) }),
              h('span', { class: 'lv-date' }, fmtDate(ny.date, { withYear: false })),
            ),
        ),
      ];
    }
  }
  return h(
    'section',
    { class: 'card lv-card together', key: 'together' },
    cardHead(
      '💑',
      t('home.love.together.title'),
      since && h('button', { type: 'button', class: 'link-btn', onclick: () => app.set('love.togetherSince', '') }, t('home.love.clear')),
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
    body = h('p', { class: 'lv-hint' }, t('home.love.birthday.hint', { pet: petName(app.state) }));
  } else if (ny.isToday) {
    body = [
      h('div', { class: 'lv-big today' }, h('b', { class: 'num sm' }, t('home.love.count.today'))),
      h('p', { class: 'lv-line' }, h('i', '🎉'), ny.years ? t('home.love.birthday.happyAge', { n: ny.years }) : t('home.love.birthday.happy')),
    ];
  } else {
    body = [
      bigCount(t('home.love.count.daysLeft'), ny.daysLeft),
      h(
        'div',
        { class: 'lv-lines' },
        h(
          'p',
          { class: 'lv-line' },
          h('i', '🎂'),
          ny.years
            ? rich('home.love.birthday.dateAge', { date: fmtDate(ny.date), n: ny.years }, { n: h('b', { class: 'pink' }, ny.years) })
            : t('home.love.birthday.date', { date: fmtDate(ny.date) }),
        ),
      ),
    ];
  }
  return h(
    'section',
    { class: 'card lv-card birthday', key: 'birthday' },
    cardHead('🎂', t('home.love.birthday.title'), bd && h('button', { type: 'button', class: 'link-btn', onclick: () => app.set('love.birthday', '') }, t('home.love.clear'))),
    datePicker('birthday', bd, (v) => app.set('love.birthday', v), { noYear: true, yearMin: 1950, yearMax: new Date().getFullYear(), onPartial: app.rerender }),
    h('div', { class: 'lv-body' }, body),
  );
}

async function remove(app, a) {
  const ok = await modal({
    title: t('home.love.remove.title', { name: a.name }),
    text: t('home.love.remove.text'),
    ok: t('common.delete'),
    cancel: t('home.love.remove.keep'),
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
    toast(t('home.love.add.needName'));
    return;
  }
  if (!ui.date) {
    shake(box.querySelector('.datepick'));
    toast(t('home.love.add.needDate'));
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
      h('span', { class: 'an-kind' }, kindName(a.kind)),
      h('button', { type: 'button', class: 'icon-btn xs an-del', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: () => remove(app, a) }, icon('close')),
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
  enter(app) {
    if (!ui.date) ui.date = app.C.dateKey();
  },
  render(app) {
    const list = (app.state.love?.anniversaries || []).map((a) => ({ a, s: annivInfo(a, app.C).sort })).sort((x, y) => x.s - y.s);
    const year = new Date().getFullYear();
    return h(
      'div',
      { class: 'page page-love' },
      pageHead('💝', t('home.love.title'), t('home.love.sub', { pet: petName(app.state) })),
      h('div', { class: 'love-top' }, togetherCard(app), birthdayCard(app)),
      h(
        'section',
        { class: 'card an-card', key: 'list' },
        cardHead('📅', t('home.love.list.title'), h('span', { class: 'muted-chip' }, t('home.love.list.count', { n: list.length }))),
        list.length ? h('div', { class: 'an-grid', key: 'grid' }, list.map(({ a }) => item(app, a))) : h('p', { class: 'an-empty', key: 'empty' }, t('home.love.list.empty')),
        h(
          'div',
          { class: 'an-add', key: 'add' },
          h('div', { class: 'an-add-row' }, h('input', { class: 'input grow', name: 'an-name', key: 'an-name', placeholder: t('home.love.add.placeholder'), maxlength: 16, onkeydown: (e) => e.key === 'Enter' && !e.isComposing && add(app, e) })),
          h(
            'div',
            { class: 'an-add-row' },
            datePicker('an-new', ui.date, (v) => {
              ui.date = v;
              app.rerender();
            }, { yearMin: 1980, yearMax: year + 10, onPartial: app.rerender }),
            segmented(
              KINDS.map((value) => ({ value, label: kindName(value) })),
              ui.kind,
              (v) => {
                ui.kind = v;
                app.rerender();
              },
              { cls: 'sm' },
            ),
            h('button', { type: 'button', class: 'btn primary', onclick: (e) => add(app, e) }, icon('plus'), t('common.add')),
          ),
        ),
      ),
    );
  },
};
