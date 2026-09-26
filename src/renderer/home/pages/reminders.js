// 提醒：喝水、久坐、护眼、早点睡、按时吃饭、活跃时间段，以及自定义提醒。
import { h, cx, pageHead, cardHead, toggle, segmented, timePicker, datePicker, toast, icon, shake, burst, fmtDate } from '../ui.js';
import { t, petName } from '../../shared/i18n.mjs';

const WATER = [30, 45, 60, 90, 120];
const STRETCH = [30, 40, 50, 60, 90];
const EYES = [20, 30, 40, 60];

const REPEATS = ['daily', 'weekdays', 'weekends', 'once'];
const repeatName = (repeat) => t(`home.reminders.repeat.${REPEATS.includes(repeat) ? repeat : 'daily'}`);

const ui = { time: '09:00', repeat: 'daily', date: '' };

function intervalCtrl(app, path, value, list) {
  const opts = [...new Set([...list, Number(value)])]
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
    .map((v) => ({ value: v, label: String(v) }));
  return h('div', { class: 'rm-ctrl' }, h('span', { class: 'rm-ctrl-label' }, t('home.reminders.interval')), segmented(opts, Number(value), (v) => app.set(path, v), { cls: 'sm fill' }));
}

function rmCard(app, o) {
  return h(
    'section',
    { class: cx('card', 'rm-card', 't-' + o.tint, { off: o.enabled === false }), key: o.key },
    h(
      'div',
      { class: 'rm-head' },
      h('span', { class: 'rm-ico' }, o.emoji),
      h('div', { class: 'rm-text' }, h('h3', o.title), h('p', o.desc)),
      o.path && toggle(o.enabled !== false, (v) => app.set(o.path, v), { label: o.title }),
    ),
    o.body && h('div', { class: 'rm-body' }, o.body),
  );
}

function update(app, id, patch) {
  app.set(
    'reminders.custom',
    (app.state.reminders.custom || []).map((x) => (x.id === id ? { ...x, ...patch } : x)),
  );
}

function remove(app, id) {
  app.set(
    'reminders.custom',
    (app.state.reminders.custom || []).filter((x) => x.id !== id),
  );
}

function add(app, e) {
  const { C } = app;
  const box = e.currentTarget.closest('.cr-add');
  const input = box.querySelector('input[name="cr-text"]');
  const text = input.value.trim();
  if (!text) {
    shake(input);
    input.focus();
    toast(t('home.reminders.custom.needText'));
    return;
  }
  const item = { id: C.uid(), time: ui.time, text, repeat: ui.repeat, enabled: true };
  if (ui.repeat === 'once') {
    item.date = ui.date || C.dateKey();
    const left = C.daysUntil(item.date);
    if (left < 0 || (left === 0 && item.time <= C.hm())) {
      shake(box.querySelector('.timepick'));
      toast(t('home.reminders.custom.past'));
      return;
    }
  }
  app.set('reminders.custom', [...(app.state.reminders.custom || []), item]);
  input.value = '';
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['⏰'] });
}

function row(app, r) {
  const { C } = app;
  const expired = r.repeat === 'once' && r.date && (C.daysUntil(r.date) < 0 || (C.daysUntil(r.date) === 0 && r.time < C.hm()));
  const rep = r.repeat === 'once' ? t('home.reminders.custom.onceOn', { date: fmtDate(r.date, { withYear: false }) }) : repeatName(r.repeat);
  return h(
    'div',
    { class: cx('cr-row', { off: r.enabled === false, expired }), key: r.id },
    h('span', { class: 'cr-time' }, r.time),
    h('span', { class: 'cr-text', title: r.text }, r.text),
    h('span', { class: cx('cr-rep', 'r-' + (r.repeat || 'daily')) }, rep),
    expired && h('span', { class: 'cr-exp' }, t('home.reminders.custom.expired')),
    toggle(r.enabled !== false, (v) => update(app, r.id, { enabled: v }), { label: t('home.reminders.custom.toggle') }),
    h('button', { type: 'button', class: 'icon-btn xs', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: () => remove(app, r.id) }, icon('close')),
  );
}

function customCard(app) {
  const year = new Date().getFullYear();
  const list = [...(app.state.reminders.custom || [])].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return h(
    'section',
    { class: 'card custom-card', key: 'custom' },
    cardHead('📌', t('home.reminders.custom.title'), h('span', { class: 'muted-chip' }, t('home.reminders.custom.count', { n: list.length })), t('home.reminders.custom.sub', { pet: petName(app.state) })),
    list.length ? h('div', { class: 'cr-list', key: 'list' }, list.map((r) => row(app, r))) : h('p', { class: 'cr-empty', key: 'empty' }, t('home.reminders.custom.empty')),
    h(
      'div',
      { class: 'cr-add', key: 'add' },
      h(
        'div',
        { class: 'cr-add-row' },
        timePicker(ui.time, (v) => {
          ui.time = v;
          app.rerender();
        }, { key: 'tp', title: t('home.reminders.custom.time') }),
        h('input', {
          class: 'input grow',
          name: 'cr-text',
          key: 'cr-text',
          placeholder: t('home.reminders.custom.placeholder'),
          maxlength: 30,
          onkeydown: (e) => e.key === 'Enter' && !e.isComposing && add(app, e),
        }),
      ),
      h(
        'div',
        { class: 'cr-add-row' },
        segmented(REPEATS.map((value) => ({ value, label: repeatName(value) })), ui.repeat, (v) => {
          ui.repeat = v;
          app.rerender();
        }, { cls: 'sm', key: 'rep' }),
        ui.repeat === 'once' &&
          datePicker('cr-date', ui.date, (v) => {
            ui.date = v;
            app.rerender();
          }, { yearMin: year, yearMax: year + 3, onPartial: app.rerender, key: 'cr-date' }),
        h('span', { class: 'spacer', key: 'sp' }),
        h('button', { type: 'button', class: 'btn primary', key: 'go', onclick: (e) => add(app, e) }, icon('plus'), t('home.reminders.custom.add')),
      ),
    ),
  );
}

export default {
  id: 'reminders',
  icon: '⏰',
  enter(app) {
    ui.date = app.C.dateKey();
  },
  render(app) {
    const r = app.state.reminders || {};
    const w = r.water || {};
    const st = r.stretch || {};
    const ey = r.eyes || {};
    const sl = r.sleep || {};
    const ml = r.meals || {};
    const dnd = !!app.state.settings?.dnd;
    return h(
      'div',
      { class: 'page page-reminders' },
      pageHead('⏰', t('home.reminders.title'), t('home.reminders.sub', { pet: petName(app.state) })),
      dnd &&
        h(
          'div',
          { class: 'notice', key: 'dnd' },
          h('span', '🔕'),
          h('span', { class: 'grow' }, t('home.reminders.dnd')),
          h('button', { type: 'button', class: 'link-btn', onclick: () => app.go('settings') }, t('home.reminders.toSettings')),
        ),
      h(
        'div',
        { class: 'rm-grid', key: 'grid' },
        rmCard(app, { key: 'water', emoji: '💧', tint: 'blue', title: t('home.reminders.water.title'), desc: t('home.reminders.water.desc', { n: w.interval || 60 }), enabled: w.enabled, path: 'reminders.water.enabled', body: intervalCtrl(app, 'reminders.water.interval', w.interval || 60, WATER) }),
        rmCard(app, { key: 'stretch', emoji: '🧘', tint: 'mint', title: t('home.reminders.stretch.title'), desc: t('home.reminders.stretch.desc'), enabled: st.enabled, path: 'reminders.stretch.enabled', body: intervalCtrl(app, 'reminders.stretch.interval', st.interval || 50, STRETCH) }),
        rmCard(app, { key: 'eyes', emoji: '👀', tint: 'lav', title: t('home.reminders.eyes.title'), desc: t('home.reminders.eyes.desc'), enabled: ey.enabled, path: 'reminders.eyes.enabled', body: intervalCtrl(app, 'reminders.eyes.interval', ey.interval || 40, EYES) }),
        rmCard(app, {
          key: 'sleep',
          emoji: '🌙',
          tint: 'night',
          title: t('home.reminders.sleep.title'),
          desc: t('home.reminders.sleep.desc', { time: sl.time || '23:30' }),
          enabled: sl.enabled,
          path: 'reminders.sleep.enabled',
          body: h('div', { class: 'rm-ctrl inline' }, h('span', { class: 'rm-ctrl-label' }, t('home.reminders.sleep.time')), timePicker(sl.time || '23:30', (v) => app.set('reminders.sleep.time', v), { key: 'sleep-tp' })),
        }),
        rmCard(app, {
          key: 'meals',
          emoji: '🍱',
          tint: 'butter',
          title: t('home.reminders.meals.title'),
          desc: t('home.reminders.meals.desc'),
          enabled: ml.enabled,
          path: 'reminders.meals.enabled',
          body: h('div', { class: 'meal-times' }, h('span', { class: 'meal' }, h('b', '12:00'), t('home.reminders.meals.lunch')), h('span', { class: 'meal' }, h('b', '18:00'), t('home.reminders.meals.dinner'))),
        }),
        rmCard(app, {
          key: 'active',
          emoji: '🌤️',
          tint: 'pink',
          title: t('home.reminders.active.title'),
          desc: t('home.reminders.active.desc'),
          body: h(
            'div',
            { class: 'rm-ctrl inline rm-range' },
            timePicker(r.activeStart || '08:30', (v) => app.set('reminders.activeStart', v), { key: 'as', title: t('home.reminders.active.start') }),
            h('span', { class: 'range-dash' }, t('home.reminders.active.to')),
            timePicker(r.activeEnd || '23:30', (v) => app.set('reminders.activeEnd', v), { key: 'ae', title: t('home.reminders.active.end') }),
          ),
        }),
      ),
      customCard(app),
    );
  },
};
