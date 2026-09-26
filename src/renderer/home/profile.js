// 「认识一下」：一次填好宠物名字、她的昵称、生日、在一起的日子和送礼人的署名。
// 第一次打开小窝时自动出现；之后可以在设置页「我们的资料」里改。
import { h, modal, morph, datePicker, toast } from './ui.js';
import { t, petName, nickname } from '../shared/i18n.mjs';

const field = (label, control, hint) =>
  h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint && h('span', { class: 'field-hint' }, hint));

let opening = false;

export async function openProfile(app, { first = false } = {}) {
  if (opening) return;
  opening = true;
  const st = app.state;
  const now = new Date();
  const form = {
    name: st.pet?.name || '',
    nick: st.owner?.nickname || '',
    birthday: st.love?.birthday || '',
    since: st.love?.togetherSince || '',
    sender: st.owner?.sender || '',
  };
  // 名字、称呼是空的表示用当前语言的默认值（输入框里显示成灰色的提示）。
  // 原来填过的不许清空；原来就是空的，不填也可以
  const had = { name: !!form.name.trim(), nick: !!form.nick.trim() };
  const box = h('div', { class: 'pf-form' });

  const dateRow = (id, key, o) =>
    h(
      'div',
      { class: 'pf-date', key: id },
      datePicker(
        id,
        form[key],
        (v) => {
          form[key] = v;
          draw();
        },
        { ...o, onPartial: () => draw() },
      ),
      form[key] &&
        h(
          'button',
          {
            type: 'button',
            class: 'link-btn',
            onclick: () => {
              form[key] = '';
              draw();
            },
          },
          t('home.profile.clear'),
        ),
    );

  const render = () =>
    h(
      'div',
      { class: 'pf-form' },
      h(
        'div',
        { class: 'pf-two' },
        field(t('home.profile.name'), h('input', { class: 'input', key: 'name', maxlength: 8, value: form.name, placeholder: petName(null), oninput: (e) => (form.name = e.target.value) })),
        field(t('home.profile.nick'), h('input', { class: 'input', key: 'nick', maxlength: 8, value: form.nick, placeholder: nickname(null), oninput: (e) => (form.nick = e.target.value) })),
      ),
      field(t('home.profile.birthday'), dateRow('pf-birthday', 'birthday', { noYear: true, yearMin: 1950, yearMax: now.getFullYear() }), t('home.profile.birthdayHint')),
      field(t('home.profile.since'), dateRow('pf-since', 'since', { yearMin: 1980, yearMax: now.getFullYear() }), t('home.profile.sinceHint')),
      field(
        t('home.profile.sender'),
        h('input', { class: 'input', key: 'sender', maxlength: 16, value: form.sender, placeholder: t('home.profile.senderPlaceholder'), oninput: (e) => (form.sender = e.target.value) }),
        t('home.profile.senderHint'),
      ),
    );

  const draw = () => morph(box, render());
  draw();
  setTimeout(() => box.querySelector('input')?.focus({ preventScroll: true }), 300);

  const ok = await modal({
    title: first ? t('home.profile.firstTitle') : t('home.profile.title'),
    body: box,
    look: app.look(),
    face: ['happy', 'cat'],
    ok: first ? t('home.profile.firstOk') : t('common.save'),
    cancel: first ? t('home.profile.firstCancel') : t('common.cancel'),
    cls: 'profile-editor',
    onOk: async () => {
      const name = form.name.trim();
      const nick = form.nick.trim();
      if (!name && had.name) {
        toast(t('home.profile.needName'), 'err');
        return false;
      }
      if (!nick && had.nick) {
        toast(t('home.profile.needNick'), 'err');
        return false;
      }
      const q = { quiet: true };
      await Promise.all([
        app.set('pet.name', name, q),
        app.set('owner.nickname', nick, q),
        app.set('love.birthday', form.birthday || '', q),
        app.set('love.togetherSince', form.since || '', q),
        app.set('owner.sender', form.sender.trim(), q),
        app.set('runtime.profileDone', true, q),
      ]);
      toast(first ? t('home.profile.firstDone') : t('home.toast.saved'));
      const cheer = first ? t('home.profile.cheerFirst', { nick: nickname({ owner: { nickname: nick } }) }) : t('home.profile.cheerSaved');
      app.mochi.petCommand({ type: 'cheer', text: cheer });
      return true;
    },
  });
  if (!ok && first) app.set('runtime.profileSkipped', true, { quiet: true });
  opening = false;
}
