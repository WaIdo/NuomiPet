// 提醒：喝水、久坐、护眼、早点睡、按时吃饭、活跃时间段，以及自定义提醒。
import { h, cx, pageHead, cardHead, toggle, segmented, timePicker, datePicker, toast, icon, shake, burst, fmtDate } from '../ui.js';

const WATER = [30, 45, 60, 90, 120];
const STRETCH = [30, 40, 50, 60, 90];
const EYES = [20, 30, 40, 60];

const REPEAT = [
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '工作日' },
  { value: 'weekends', label: '周末' },
  { value: 'once', label: '仅一次' },
];
const REPEAT_NAME = { daily: '每天', weekdays: '工作日', weekends: '周末', once: '仅一次' };

const ui = { time: '09:00', repeat: 'daily', date: '' };

function intervalCtrl(app, path, value, list) {
  const opts = [...new Set([...list, Number(value)])]
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
    .map((v) => ({ value: v, label: String(v) }));
  return h('div', { class: 'rm-ctrl' }, h('span', { class: 'rm-ctrl-label' }, '间隔（分钟）'), segmented(opts, Number(value), (v) => app.set(path, v), { cls: 'sm fill' }));
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
    toast('写一下要提醒什么吧～');
    return;
  }
  const item = { id: C.uid(), time: ui.time, text, repeat: ui.repeat, enabled: true };
  if (ui.repeat === 'once') {
    item.date = ui.date || C.dateKey();
    const left = C.daysUntil(item.date);
    if (left < 0 || (left === 0 && item.time <= C.hm())) {
      shake(box.querySelector('.timepick'));
      toast('这个时间已经过去啦，换一个吧');
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
  const rep = r.repeat === 'once' ? `仅一次 · ${fmtDate(r.date, { withYear: false })}` : REPEAT_NAME[r.repeat] || '每天';
  return h(
    'div',
    { class: cx('cr-row', { off: r.enabled === false, expired }), key: r.id },
    h('span', { class: 'cr-time' }, r.time),
    h('span', { class: 'cr-text', title: r.text }, r.text),
    h('span', { class: cx('cr-rep', 'r-' + (r.repeat || 'daily')) }, rep),
    expired && h('span', { class: 'cr-exp' }, '已过'),
    toggle(r.enabled !== false, (v) => update(app, r.id, { enabled: v }), { label: '开关' }),
    h('button', { type: 'button', class: 'icon-btn xs', title: '删除', 'aria-label': '删除', onclick: () => remove(app, r.id) }, icon('close')),
  );
}

function customCard(app) {
  const year = new Date().getFullYear();
  const list = [...(app.state.reminders.custom || [])].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return h(
    'section',
    { class: 'card custom-card', key: 'custom' },
    cardHead('📌', '自定义提醒', h('span', { class: 'muted-chip' }, `${list.length} 个`), '到点了糯米会跳出来提醒你，勿扰模式下也会照常提醒'),
    list.length ? h('div', { class: 'cr-list', key: 'list' }, list.map((r) => row(app, r))) : h('p', { class: 'cr-empty', key: 'empty' }, '还没有自定义提醒，比如「10:00 开会」「21:30 敷面膜」～'),
    h(
      'div',
      { class: 'cr-add', key: 'add' },
      h(
        'div',
        { class: 'cr-add-row' },
        timePicker(ui.time, (v) => {
          ui.time = v;
          app.rerender();
        }, { key: 'tp', title: '提醒时间' }),
        h('input', {
          class: 'input grow',
          name: 'cr-text',
          key: 'cr-text',
          placeholder: '提醒什么呢？比如：记得给妈妈打电话',
          maxlength: 30,
          onkeydown: (e) => e.key === 'Enter' && !e.isComposing && add(app, e),
        }),
      ),
      h(
        'div',
        { class: 'cr-add-row' },
        segmented(REPEAT, ui.repeat, (v) => {
          ui.repeat = v;
          app.rerender();
        }, { cls: 'sm', key: 'rep' }),
        ui.repeat === 'once' &&
          datePicker('cr-date', ui.date, (v) => {
            ui.date = v;
            app.rerender();
          }, { yearMin: year, yearMax: year + 3, onPartial: app.rerender, key: 'cr-date' }),
        h('span', { class: 'spacer', key: 'sp' }),
        h('button', { type: 'button', class: 'btn primary', key: 'go', onclick: (e) => add(app, e) }, icon('plus'), '添加提醒'),
      ),
    ),
  );
}

export default {
  id: 'reminders',
  icon: '⏰',
  label: '提醒',
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
      pageHead('⏰', '提醒', '糯米会在合适的时候，轻轻地提醒你～'),
      dnd &&
        h(
          'div',
          { class: 'notice', key: 'dnd' },
          h('span', '🔕'),
          h('span', { class: 'grow' }, '勿扰模式开着：现在只会弹出自定义提醒哦'),
          h('button', { type: 'button', class: 'link-btn', onclick: () => app.go('settings') }, '去设置'),
        ),
      h(
        'div',
        { class: 'rm-grid', key: 'grid' },
        rmCard(app, { key: 'water', emoji: '💧', tint: 'blue', title: '喝水', desc: `每 ${w.interval || 60} 分钟喝一杯水`, enabled: w.enabled, path: 'reminders.water.enabled', body: intervalCtrl(app, 'reminders.water.interval', w.interval || 60, WATER) }),
        rmCard(app, { key: 'stretch', emoji: '🧘', tint: 'mint', title: '久坐起来动动', desc: '坐久了，喊你起来伸伸腰', enabled: st.enabled, path: 'reminders.stretch.enabled', body: intervalCtrl(app, 'reminders.stretch.interval', st.interval || 50, STRETCH) }),
        rmCard(app, { key: 'eyes', emoji: '👀', tint: 'lav', title: '护眼', desc: '看看远处，让眼睛歇一歇', enabled: ey.enabled, path: 'reminders.eyes.enabled', body: intervalCtrl(app, 'reminders.eyes.interval', ey.interval || 40, EYES) }),
        rmCard(app, {
          key: 'sleep',
          emoji: '🌙',
          tint: 'night',
          title: '早点睡',
          desc: `到了 ${sl.time || '23:30'} 就催你去睡觉`,
          enabled: sl.enabled,
          path: 'reminders.sleep.enabled',
          body: h('div', { class: 'rm-ctrl inline' }, h('span', { class: 'rm-ctrl-label' }, '睡觉时间'), timePicker(sl.time || '23:30', (v) => app.set('reminders.sleep.time', v), { key: 'sleep-tp' })),
        }),
        rmCard(app, {
          key: 'meals',
          emoji: '🍱',
          tint: 'butter',
          title: '按时吃饭',
          desc: '到饭点了提醒你好好吃饭',
          enabled: ml.enabled,
          path: 'reminders.meals.enabled',
          body: h('div', { class: 'meal-times' }, h('span', { class: 'meal' }, h('b', '12:00'), '午饭'), h('span', { class: 'meal' }, h('b', '18:00'), '晚饭')),
        }),
        rmCard(app, {
          key: 'active',
          emoji: '🌤️',
          tint: 'pink',
          title: '活跃时间段',
          desc: '喝水、久坐和护眼提醒只在这段时间里出现',
          body: h(
            'div',
            { class: 'rm-ctrl inline rm-range' },
            timePicker(r.activeStart || '08:30', (v) => app.set('reminders.activeStart', v), { key: 'as', title: '开始' }),
            h('span', { class: 'range-dash' }, '至'),
            timePicker(r.activeEnd || '23:30', (v) => app.set('reminders.activeEnd', v), { key: 'ae', title: '结束' }),
          ),
        }),
      ),
      customCard(app),
    );
  },
};
