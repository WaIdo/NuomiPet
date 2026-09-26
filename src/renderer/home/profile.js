// 「认识一下」：一次填好宠物名字、她的昵称、生日、在一起的日子和送礼人的署名。
// 第一次打开小窝时自动出现；之后可以在设置页「我们的资料」里改。
import { h, modal, morph, datePicker, toast } from './ui.js';

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
          '清除',
        ),
    );

  const render = () =>
    h(
      'div',
      { class: 'pf-form' },
      h(
        'div',
        { class: 'pf-two' },
        field('我叫什么名字？', h('input', { class: 'input', key: 'name', maxlength: 8, value: form.name, placeholder: '糯米', oninput: (e) => (form.name = e.target.value) })),
        field('我该怎么称呼你？', h('input', { class: 'input', key: 'nick', maxlength: 8, value: form.nick, placeholder: '宝贝', oninput: (e) => (form.nick = e.target.value) })),
      ),
      field('你的生日', dateRow('pf-birthday', 'birthday', { noYear: true, yearMin: 1950, yearMax: now.getFullYear() }), '生日那天我会给你过生日 🎂（年份可以不填）'),
      field('在一起的日子（可以不填）', dateRow('pf-since', 'since', { yearMin: 1980, yearMax: now.getFullYear() }), '我会帮你们数着在一起的天数，整百天和周年都会庆祝'),
      field(
        '是谁把我带来的？（可以不填）',
        h('input', { class: 'input', key: 'sender', maxlength: 16, value: form.sender, placeholder: '比如：阿杰', oninput: (e) => (form.sender = e.target.value) }),
        '悄悄话会说「xxx让我偷偷告诉你……」',
      ),
    );

  const draw = () => morph(box, render());
  draw();
  setTimeout(() => box.querySelector('input')?.focus({ preventScroll: true }), 300);

  const ok = await modal({
    title: first ? '我们来认识一下吧～' : '我们的资料',
    body: box,
    look: app.look(),
    face: ['happy', 'cat'],
    ok: first ? '好啦 ✓' : '保存',
    cancel: first ? '以后再说' : '取消',
    cls: 'profile-editor',
    onOk: async () => {
      const name = form.name.trim();
      const nick = form.nick.trim();
      if (!name) {
        toast('给我起个名字吧～', 'err');
        return false;
      }
      if (!nick) {
        toast('我该怎么叫你呢？', 'err');
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
      toast(first ? '记住啦！以后请多多关照 💗' : '已保存 ✓');
      app.mochi.petCommand({ type: 'cheer', text: first ? `记住啦，${nick}！以后请多多关照～` : '资料改好啦～' });
      return true;
    },
  });
  if (!ok && first) app.set('runtime.profileSkipped', true, { quiet: true });
  opening = false;
}
