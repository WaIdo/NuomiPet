// 悄悄话：她的昵称、你的署名、话痨程度、内置语录，以及宠物会悄悄说出来的话。
import { h, pageHead, cardHead, segmented, toggle, toast, icon, shake, burst } from '../ui.js';

const CHATTY = [
  { value: 'low', label: '少' },
  { value: 'normal', label: '适中' },
  { value: 'high', label: '多' },
];
const MAX = 60;

function commitText(app, path, input, { required = false, fallback = '' } = {}) {
  const cur = path.split('.').reduce((o, k) => (o == null ? o : o[k]), app.state) || '';
  const v = input.value.trim().slice(0, 10);
  if (!v && required) {
    input.value = cur || fallback;
    toast('这个不能空着哦');
    return;
  }
  input.value = v;
  if (v !== cur) app.set(path, v);
}

function textInput(app, path, value, o) {
  return h('input', {
    class: 'input',
    key: path,
    value: value || '',
    maxlength: 10,
    placeholder: o.placeholder,
    'aria-label': o.label,
    onchange: (e) => commitText(app, path, e.target, o),
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.isComposing) e.target.blur();
    },
  });
}

function spoken(app, text) {
  const sender = (app.state.owner?.sender || '').trim();
  return sender ? `${sender}让我偷偷告诉你：${text}` : text;
}

function say(app, n, e) {
  app.mochi.petCommand({ type: 'say', text: spoken(app, n.text) });
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💬'], n: 6, spread: 22 });
  toast(`${app.state.pet.name}去桌面上说给她听啦`);
}

function addNote(app, e) {
  const box = e.currentTarget.closest('.note-add');
  const ta = box.querySelector('textarea');
  const text = ta.value.replace(/\s+/g, ' ').trim().slice(0, MAX);
  if (!text) {
    shake(ta);
    ta.focus();
    return;
  }
  app.set('love.notes', [...(app.state.love?.notes || []), { id: app.C.uid(), text }], { quiet: true });
  ta.value = '';
  box.querySelector('.note-count').textContent = `0/${MAX}`;
  toast('悄悄记下啦 💌');
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💌'] });
}

function removeNote(app, id) {
  app.set(
    'love.notes',
    (app.state.love?.notes || []).filter((n) => n.id !== id),
    { quiet: true },
  );
  toast('删掉啦');
}

export default {
  id: 'notes',
  icon: '💬',
  label: '悄悄话',
  render(app) {
    const st = app.state;
    const love = st.love || {};
    const owner = st.owner || {};
    const notes = love.notes || [];
    const pet = st.pet?.name || '糯米';
    const nick = owner.nickname || '宝贝';
    const sender = (owner.sender || '').trim();
    return h(
      'div',
      { class: 'page page-notes' },
      pageHead('💬', '悄悄话', `${pet}会时不时把这些话，悄悄地说给她听`),
      h(
        'div',
        { class: 'notes-top' },
        h(
          'section',
          { class: 'card names-card', key: 'names' },
          cardHead('🏷️', '称呼'),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label' }, '她的昵称'),
            textInput(app, 'owner.nickname', owner.nickname, { required: true, fallback: '宝贝', placeholder: '比如：宝贝', label: '她的昵称' }),
            h('span', { class: 'field-hint' }, `${pet}会这样叫她：「晚上好呀，${nick}」`),
          ),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label' }, '你的署名'),
            textInput(app, 'owner.sender', owner.sender, { placeholder: '可以不填', label: '你的署名' }),
            h('span', { class: 'field-hint' }, sender ? `说悄悄话时会说：「${sender}让我偷偷告诉你…」` : '留空的话，就不说是谁让它说的'),
          ),
        ),
        h(
          'section',
          { class: 'card talk-card', key: 'talk' },
          cardHead('🗣️', '说话方式'),
          h(
            'div',
            { class: 'set-row' },
            h('div', { class: 'set-label' }, h('span', '话痨程度'), h('small', '多久说一次话')),
            segmented(CHATTY, love.chatty || 'normal', (v) => app.set('love.chatty', v), { cls: 'sm' }),
          ),
          h(
            'div',
            { class: 'set-row' },
            h('div', { class: 'set-label' }, h('span', '内置语录'), h('small', '除了你写的悄悄话，也会说些可爱的日常句子')),
            toggle(love.builtin !== false, (v) => app.set('love.builtin', v), { label: '内置语录' }),
          ),
        ),
      ),
      h(
        'section',
        { class: 'card notes-card', key: 'notes' },
        cardHead('💌', '悄悄话', h('span', { class: 'muted-chip' }, `${notes.length} 条`), '每条最多 60 个字，点「让TA说」可以马上在桌面上听一遍'),
        h(
          'div',
          { class: 'note-add', key: 'add' },
          h('textarea', {
            class: 'input textarea',
            key: 'note-ta',
            rows: 2,
            maxlength: MAX,
            placeholder: '写一句想让它转告的话，比如：今天也很想你',
            'aria-label': '新的悄悄话',
            oninput: (e) => {
              e.target.closest('.note-add').querySelector('.note-count').textContent = `${e.target.value.length}/${MAX}`;
            },
            onkeydown: (e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                addNote(app, e);
              }
            },
          }),
          h('div', { class: 'note-add-foot' }, h('span', { class: 'note-count', key: 'count' }, `0/${MAX}`), h('button', { type: 'button', class: 'btn primary', key: 'add-btn', onclick: (e) => addNote(app, e) }, icon('plus'), '添加')),
        ),
        notes.length
          ? h(
              'div',
              { class: 'note-list', key: 'list' },
              notes.map((n) =>
                h(
                  'div',
                  { class: 'note', key: n.id },
                  h('div', { class: 'note-bubble' }, sender && h('span', { class: 'note-from' }, `${sender}让我偷偷告诉你：`), h('span', { class: 'note-text' }, n.text)),
                  h(
                    'div',
                    { class: 'note-actions' },
                    h('button', { type: 'button', class: 'btn soft xs', title: '让桌面上的宠物说一遍', onclick: (e) => say(app, n, e) }, icon('chat'), '让TA说'),
                    h('button', { type: 'button', class: 'icon-btn xs', title: '删除', 'aria-label': '删除', onclick: () => removeNote(app, n.id) }, icon('close')),
                  ),
                ),
              ),
            )
          : h('p', { class: 'note-empty', key: 'empty' }, '还没有悄悄话，写下第一句吧～'),
      ),
    );
  },
};
