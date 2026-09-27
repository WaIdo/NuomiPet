// 悄悄话：她的昵称、你的署名、话痨程度、内置语录，以及宠物会悄悄说出来的话。
import { h, pageHead, cardHead, segmented, toggle, toast, icon, shake, burst } from '../ui.js';
import { t, petName, nickname } from '../../shared/i18n.mjs';

const CHATTY = ['low', 'normal', 'high'];
const MAX = 60;

function commitText(app, path, input, { required = false, fallback = '' } = {}) {
  const cur = path.split('.').reduce((o, k) => (o == null ? o : o[k]), app.state) || '';
  const v = input.value.trim().slice(0, 10);
  if (!v && required) {
    input.value = cur || fallback;
    toast(t('home.notes.required'));
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
  return sender ? t('home.notes.spoken', { sender, text }) : text;
}

function say(app, n, e) {
  app.mochi.petCommand({ type: 'say', text: spoken(app, n.text) });
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💬'], n: 6, spread: 22 });
  toast(t('home.notes.said', { pet: petName(app.state) }));
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
  toast(t('home.notes.added'));
  const r = e.currentTarget.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['💌'] });
}

function removeNote(app, id) {
  app.set(
    'love.notes',
    (app.state.love?.notes || []).filter((n) => n.id !== id),
    { quiet: true },
  );
  toast(t('home.notes.removed'));
}

export default {
  id: 'notes',
  icon: '💬',
  render(app) {
    const st = app.state;
    const love = st.love || {};
    const owner = st.owner || {};
    const notes = love.notes || [];
    const pet = petName(st);
    const nick = nickname(st);
    const sender = (owner.sender || '').trim();
    return h(
      'div',
      { class: 'page page-notes' },
      pageHead('💬', t('home.notes.title'), t('home.notes.sub', { pet })),
      h(
        'div',
        { class: 'notes-top' },
        h(
          'section',
          { class: 'card names-card', key: 'names' },
          cardHead('🏷️', t('home.notes.names.title')),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label' }, t('home.notes.names.nick')),
            textInput(app, 'owner.nickname', nick, { required: true, fallback: nick, placeholder: t('home.notes.names.nickPlaceholder'), label: t('home.notes.names.nick') }),
            h('span', { class: 'field-hint' }, t('home.notes.names.nickHint', { pet, nick })),
          ),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label' }, t('home.notes.names.sender')),
            textInput(app, 'owner.sender', owner.sender, { placeholder: t('home.notes.names.senderPlaceholder'), label: t('home.notes.names.sender') }),
            h('span', { class: 'field-hint' }, sender ? t('home.notes.names.senderHint', { sender }) : t('home.notes.names.senderEmpty', { pet })),
          ),
        ),
        h(
          'section',
          { class: 'card talk-card', key: 'talk' },
          cardHead('🗣️', t('home.notes.talk.title')),
          h(
            'div',
            { class: 'set-row' },
            h('div', { class: 'set-label' }, h('span', t('home.notes.talk.chatty')), h('small', t('home.notes.talk.chattyDesc'))),
            segmented(
              CHATTY.map((value) => ({ value, label: t(`home.notes.talk.levels.${value}`) })),
              love.chatty || 'normal',
              (v) => app.set('love.chatty', v),
              { cls: 'sm' },
            ),
          ),
          h(
            'div',
            { class: 'set-row' },
            h('div', { class: 'set-label' }, h('span', t('home.notes.talk.builtin')), h('small', t('home.notes.talk.builtinDesc'))),
            toggle(love.builtin !== false, (v) => app.set('love.builtin', v), { label: t('home.notes.talk.builtin') }),
          ),
        ),
      ),
      h(
        'section',
        { class: 'card notes-card', key: 'notes' },
        cardHead('💌', t('home.notes.title'), h('span', { class: 'muted-chip' }, t('home.notes.list.count', { n: notes.length })), t('home.notes.list.sub', { max: MAX })),
        h(
          'div',
          { class: 'note-add', key: 'add' },
          h('textarea', {
            class: 'input textarea',
            key: 'note-ta',
            rows: 2,
            maxlength: MAX,
            placeholder: t('home.notes.list.placeholder'),
            'aria-label': t('home.notes.list.newLabel'),
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
          h('div', { class: 'note-add-foot' }, h('span', { class: 'note-count', key: 'count' }, `0/${MAX}`), h('button', { type: 'button', class: 'btn primary', key: 'add-btn', onclick: (e) => addNote(app, e) }, icon('plus'), t('common.add'))),
        ),
        notes.length
          ? h(
              'div',
              { class: 'note-list', key: 'list' },
              notes.map((n) =>
                h(
                  'div',
                  { class: 'note', key: n.id },
                  h('div', { class: 'note-bubble' }, sender && h('span', { class: 'note-from' }, t('home.notes.list.from', { sender })), h('span', { class: 'note-text' }, n.text)),
                  h(
                    'div',
                    { class: 'note-actions' },
                    h('button', { type: 'button', class: 'btn soft xs', title: t('home.notes.list.sayTitle'), onclick: (e) => say(app, n, e) }, icon('chat'), t('home.notes.list.say')),
                    h('button', { type: 'button', class: 'icon-btn xs', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: () => removeNote(app, n.id) }, icon('close')),
                  ),
                ),
              ),
            )
          : h('p', { class: 'note-empty', key: 'empty' }, t('home.notes.list.empty')),
      ),
    );
  },
};
