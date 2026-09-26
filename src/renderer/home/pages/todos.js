// 待办：添加、勾选（小彩纸 + 桌面宠物加油）、删除、筛选、清除已完成。
import { h, cx, pageHead, segmented, emptyState, toast, icon, burst, shake, bar } from '../ui.js';

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '未完成' },
  { value: 'done', label: '已完成' },
];
const ui = { filter: 'all' };

function when(app, t) {
  const { C } = app;
  const ms = t.done && t.doneAt ? t.doneAt : t.createdAt;
  if (!ms) return '';
  const d = new Date(ms);
  const key = C.dateKey(d);
  const diff = C.daysUntil(key);
  const day = diff === 0 ? '今天' : diff === -1 ? '昨天' : `${d.getMonth() + 1}月${d.getDate()}日`;
  return t.done ? `${day} ${C.hm(d)} 完成` : `${day} ${C.hm(d)}`;
}

function add(app, e) {
  const box = e.currentTarget.closest('.todo-add');
  const input = box.querySelector('input');
  const text = input.value.trim().slice(0, 60);
  if (!text) {
    shake(input);
    input.focus();
    return;
  }
  const item = { id: app.C.uid(), text, done: false, createdAt: Date.now(), doneAt: null };
  if (ui.filter === 'done') ui.filter = 'all';
  app.set('todos', [...(app.state.todos || []), item], { quiet: true });
  input.value = '';
  input.focus();
  toast('记下啦 ✓');
}

function toggleDone(app, t, e) {
  const done = !t.done;
  app.set(
    'todos',
    (app.state.todos || []).map((x) => (x.id === t.id ? { ...x, done, doneAt: done ? Date.now() : null } : x)),
    { quiet: true },
  );
  if (!done) return;
  app.bump({ xp: 2, counters: { todos: 1 } });
  const left = (app.state.todos || []).filter((x) => !x.done).length;
  app.mochi.petCommand({ type: 'cheer', allDone: left === 0 });
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💗', '✨'] });
  toast(left === 0 ? '全部完成啦！你最棒 🎉' : '又完成一件，真厉害！🎉');
}

function remove(app, id) {
  app.set(
    'todos',
    (app.state.todos || []).filter((x) => x.id !== id),
    { quiet: true },
  );
  toast('删掉啦');
}

function clearDone(app) {
  const list = app.state.todos || [];
  const n = list.filter((t) => t.done).length;
  if (!n) return;
  app.set(
    'todos',
    list.filter((t) => !t.done),
    { quiet: true },
  );
  toast(`清理了 ${n} 件已完成的待办 ✨`);
}

function row(app, t) {
  return h(
    'div',
    { class: cx('todo', { done: t.done }), key: t.id },
    h(
      'button',
      { type: 'button', class: 'todo-check', role: 'checkbox', 'aria-checked': t.done ? 'true' : 'false', 'aria-label': t.done ? '标记为没完成' : '标记为完成', onclick: (e) => toggleDone(app, t, e) },
      icon('check'),
    ),
    h('span', { class: 'todo-text' }, h('span', t.text)),
    h('span', { class: 'todo-time' }, when(app, t)),
    h('button', { type: 'button', class: 'icon-btn xs todo-del', title: '删除', 'aria-label': '删除', onclick: () => remove(app, t.id) }, icon('close')),
  );
}

export default {
  id: 'todos',
  icon: '📝',
  label: '待办',
  render(app) {
    const all = app.state.todos || [];
    const done = all.filter((t) => t.done).length;
    const list = all.filter((t) => (ui.filter === 'open' ? !t.done : ui.filter === 'done' ? t.done : true));
    let empty = null;
    if (!all.length) empty = emptyState(app.look(), '今天没有待办，休息一下吧～', '想到要做的事，就写在上面吧');
    else if (!list.length && ui.filter === 'open') empty = emptyState(app.look(), '全部完成啦！你最棒 🎉', null, { pose: 'bounce', face: ['happy', 'open'] });
    else if (!list.length) empty = emptyState(app.look(), '还没有完成的事项，加油鸭～', null, { pose: 'idle', face: ['normal', 'smile'] });
    return h(
      'div',
      { class: 'page page-todos' },
      pageHead('📝', '待办', all.length ? `完成了 ${done} 件，还剩 ${all.length - done} 件` : '把要做的事交给糯米记着吧'),
      h(
        'section',
        { class: 'card todo-card', key: 'card' },
        h(
          'div',
          { class: 'todo-add', key: 'add' },
          h('input', {
            class: 'input grow',
            key: 'todo-input',
            placeholder: '接下来要做什么呢？按回车添加',
            maxlength: 60,
            'aria-label': '新的待办',
            onkeydown: (e) => e.key === 'Enter' && !e.isComposing && add(app, e),
          }),
          h('button', { type: 'button', class: 'btn primary', onclick: (e) => add(app, e) }, icon('plus'), '添加'),
        ),
        all.length > 0 &&
          h(
            'div',
            { class: 'todo-bar', key: 'bar' },
            segmented(FILTERS, ui.filter, (v) => {
              ui.filter = v;
              app.rerender();
            }, { cls: 'sm' }),
            h('div', { class: 'todo-progress' }, bar(all.length ? done / all.length : 0, 'mini'), h('span', `${done}/${all.length}`)),
            h('button', { type: 'button', class: 'link-btn', disabled: !done, onclick: () => clearDone(app) }, '清除已完成'),
          ),
        empty || h('div', { class: 'todo-list', key: 'list' }, list.map((t) => row(app, t))),
      ),
      h('p', { class: 'page-hint', key: 'hint' }, `💡 每完成一件，${app.state.pet?.name || '糯米'}都会在桌面上为你加油，亲密度 +2`),
    );
  },
};
