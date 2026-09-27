// 待办：添加、勾选（小彩纸 + 桌面宠物加油）、删除、筛选、清除已完成。
import { h, cx, pageHead, segmented, emptyState, toast, icon, burst, shake, bar, fmtDate } from '../ui.js';
import { t, petName, lines, fill } from '../../shared/i18n.mjs';

const FILTERS = ['all', 'open', 'done'];
// ideas：「两个人的小事」这一批抽到的是第几条（重新渲染时不变，只在「换一批」和用掉一条时换）
const ui = { filter: 'all', ideas: null };
const IDEAS = 4;

function when(app, todo) {
  const { C } = app;
  const ms = todo.done && todo.doneAt ? todo.doneAt : todo.createdAt;
  if (!ms) return '';
  const d = new Date(ms);
  const key = C.dateKey(d);
  const diff = C.daysUntil(key);
  const day = diff === 0 ? t('home.todos.today') : diff === -1 ? t('home.todos.yesterday') : fmtDate(key, { withYear: false });
  return todo.done ? t('home.todos.doneAt', { day, time: C.hm(d) }) : t('home.todos.createdAt', { day, time: C.hm(d) });
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
  toast(t('home.todos.added'));
}

/* ---------------- 两个人的小事 ---------------- */

// 每一条填好 {sender} 以后的文字
function ideaTexts(app) {
  const sender = String(app.state.owner?.sender || '').trim() || t('home.todos.ideas.him');
  return lines('todoIdeas').map((tpl) => fill(tpl, { sender }));
}

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// 抽 n 条：和没完成的待办重复的不抽；avoid 里的（比如上一批）尽量不抽，不够时才用
function drawIdeas(app, texts, avoid, n) {
  const open = new Set((app.state.todos || []).filter((x) => !x.done).map((x) => x.text));
  const ok = texts.map((_, i) => i).filter((i) => !open.has(texts[i]));
  return [...shuffle(ok.filter((i) => !avoid.includes(i))), ...shuffle(ok.filter((i) => avoid.includes(i)))].slice(0, n);
}

function useIdea(app, texts, i) {
  const text = texts[i].slice(0, 60);
  const item = { id: app.C.uid(), text, done: false, createdAt: Date.now(), doneAt: null, idea: true };
  if (ui.filter === 'done') ui.filter = 'all';
  app.set('todos', [...(app.state.todos || []), item], { quiet: true });
  toast(t('home.todos.added'));
  // 用掉的这条换成一条这一批里没有的；一条都没有了就少显示一个
  const next = drawIdeas(app, texts, ui.ideas, texts.length).find((k) => !ui.ideas.includes(k));
  ui.ideas = next === undefined ? ui.ideas.filter((k) => k !== i) : ui.ideas.map((k) => (k === i ? next : k));
  app.rerender();
}

function ideas(app) {
  const texts = ideaTexts(app);
  if (!texts.length) return null;
  if (!ui.ideas || ui.ideas.some((i) => i >= texts.length)) ui.ideas = drawIdeas(app, texts, [], IDEAS);
  return h(
    'div',
    { class: 'todo-ideas', key: 'ideas' },
    h(
      'div',
      { class: 'ti-head' },
      h('span', { class: 'ti-title' }, t('home.todos.ideas.title')),
      h(
        'button',
        {
          type: 'button',
          class: 'link-btn',
          onclick: () => {
            ui.ideas = drawIdeas(app, texts, ui.ideas, IDEAS);
            app.rerender();
          },
        },
        t('home.todos.ideas.more'),
      ),
    ),
    h(
      'div',
      { class: 'ti-list', role: 'group', 'aria-label': t('home.todos.ideas.title') },
      ui.ideas.map((i) => h('button', { type: 'button', class: 'btn soft sm todo-idea', key: 'idea-' + i, 'data-idea': i, onclick: () => useIdea(app, texts, i) }, texts[i])),
    ),
  );
}

function toggleDone(app, todo, e) {
  const done = !todo.done;
  app.set(
    'todos',
    (app.state.todos || []).map((x) => (x.id === todo.id ? { ...x, done, doneAt: done ? Date.now() : null } : x)),
    { quiet: true },
  );
  if (!done) return;
  app.bump({ xp: 2, counters: { todos: 1 } });
  const left = (app.state.todos || []).filter((x) => !x.done).length;
  app.mochi.petCommand({ type: 'cheer', allDone: left === 0 });
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💗', '✨'] });
  toast(left === 0 ? t('home.todos.allDone') : t('home.todos.oneDone'));
}

function remove(app, id) {
  app.set(
    'todos',
    (app.state.todos || []).filter((x) => x.id !== id),
    { quiet: true },
  );
  toast(t('home.todos.removed'));
}

function clearDone(app) {
  const list = app.state.todos || [];
  const n = list.filter((x) => x.done).length;
  if (!n) return;
  app.set(
    'todos',
    list.filter((x) => !x.done),
    { quiet: true },
  );
  toast(t('home.todos.cleared', { n }));
}

function row(app, todo) {
  return h(
    'div',
    { class: cx('todo', { done: todo.done }), key: todo.id },
    h(
      'button',
      {
        type: 'button',
        class: 'todo-check',
        role: 'checkbox',
        'aria-checked': todo.done ? 'true' : 'false',
        'aria-label': todo.done ? t('home.todos.markUndone') : t('home.todos.markDone'),
        onclick: (e) => toggleDone(app, todo, e),
      },
      icon('check'),
    ),
    h('span', { class: 'todo-text' }, h('span', todo.text)),
    h('span', { class: 'todo-time' }, when(app, todo)),
    h('button', { type: 'button', class: 'icon-btn xs todo-del', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: () => remove(app, todo.id) }, icon('close')),
  );
}

export default {
  id: 'todos',
  icon: '📝',
  render(app) {
    const all = app.state.todos || [];
    const done = all.filter((x) => x.done).length;
    const list = all.filter((x) => (ui.filter === 'open' ? !x.done : ui.filter === 'done' ? x.done : true));
    let empty = null;
    if (!all.length) empty = emptyState(app.look(), t('home.todos.empty'), t('home.todos.emptySub'));
    else if (!list.length && ui.filter === 'open') empty = emptyState(app.look(), t('home.todos.allDone'), null, { pose: 'bounce', face: ['happy', 'open'] });
    else if (!list.length) empty = emptyState(app.look(), t('home.todos.noneDone'), null, { pose: 'idle', face: ['normal', 'smile'] });
    return h(
      'div',
      { class: 'page page-todos' },
      pageHead('📝', t('home.todos.title'), all.length ? t('home.todos.sub', { done, left: all.length - done }) : t('home.todos.subEmpty', { pet: petName(app.state) })),
      h(
        'section',
        { class: 'card todo-card', key: 'card' },
        h(
          'div',
          { class: 'todo-add', key: 'add' },
          h('input', {
            class: 'input grow',
            key: 'todo-input',
            placeholder: t('home.todos.placeholder'),
            maxlength: 60,
            'aria-label': t('home.todos.newLabel'),
            onkeydown: (e) => e.key === 'Enter' && !e.isComposing && add(app, e),
          }),
          h('button', { type: 'button', class: 'btn primary', onclick: (e) => add(app, e) }, icon('plus'), t('common.add')),
        ),
        ideas(app),
        all.length > 0 &&
          h(
            'div',
            { class: 'todo-bar', key: 'bar' },
            segmented(
              FILTERS.map((value) => ({ value, label: t(`home.todos.filter.${value}`) })),
              ui.filter,
              (v) => {
                ui.filter = v;
                app.rerender();
              },
              { cls: 'sm' },
            ),
            h('div', { class: 'todo-progress' }, bar(all.length ? done / all.length : 0, 'mini'), h('span', `${done}/${all.length}`)),
            h('button', { type: 'button', class: 'link-btn', disabled: !done, onclick: () => clearDone(app) }, t('home.todos.clearDone')),
          ),
        empty || h('div', { class: 'todo-list', key: 'list' }, list.map((todo) => row(app, todo))),
      ),
      h('p', { class: 'page-hint', key: 'hint' }, t('home.todos.hint', { pet: petName(app.state) })),
    );
  },
};
