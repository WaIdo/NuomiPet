// 「认识一下」：一次填好宠物名字、她的昵称、生日、在一起的日子和送礼人的署名。
// 第一次打开小窝时自动出现；之后可以在设置页「我们的资料」里改。每一项都要填（「以后再说」可以先跳过）。
import { h, cx, modal, morph, datePicker, toast, shake } from './ui.js';
import { t, petName, nickname } from '../shared/i18n.mjs';
import { parseKey } from '../shared/common.mjs';

const field = (label, control, hint, err) =>
  h(
    'div',
    { class: cx('field', { bad: !!err }) },
    h('span', { class: 'field-label' }, label),
    control,
    err ? h('span', { class: 'field-hint err' }, err) : hint && h('span', { class: 'field-hint' }, hint),
  );

let opening = false;

export async function openProfile(app, { first = false } = {}) {
  if (opening) return;
  opening = true;
  const st = app.state;
  const now = new Date();
  // 名字和称呼直接显示现在实际用的（没改过就是当前语言的默认值）
  const form = {
    name: petName(st),
    nick: nickname(st),
    birthday: st.love?.birthday || '',
    since: st.love?.togetherSince || '',
    sender: st.owner?.sender || '',
  };
  let tried = false; // 点过一次「好啦」以后，没填的项下面才显示提示
  const box = h('div', { class: 'pf-form' });

  // 还没填好的项：{ 项: 提示 }
  const problems = () => {
    const out = {};
    if (!form.name.trim()) out.name = t('home.profile.needName');
    if (!form.nick.trim()) out.nick = t('home.profile.needNick');
    const bd = parseKey(form.birthday);
    if (!bd) out.birthday = t('home.profile.needBirthday');
    else if (!bd.y) out.birthday = t('home.profile.needBirthdayYear');
    if (!parseKey(form.since)) out.since = t('home.profile.needSince');
    if (!form.sender.trim()) out.sender = t('home.profile.needSender');
    return out;
  };

  const text = (key, max, placeholder) =>
    h('input', {
      class: 'input',
      key,
      name: 'pf-' + key,
      maxlength: max,
      value: form[key],
      placeholder,
      oninput: (e) => {
        form[key] = e.target.value;
        if (tried) draw();
      },
    });

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
    );

  const render = () => {
    const err = tried ? problems() : {};
    // 老数据里的生日可能只有月日：提醒她补上年份
    const bd = parseKey(form.birthday);
    const bdHint = bd && !bd.y ? t('home.profile.birthdayNoYear') : t('home.profile.birthdayHint');
    return h(
      'div',
      { class: 'pf-form' },
      h(
        'div',
        { class: 'pf-two' },
        field(t('home.profile.name'), text('name', 8), null, err.name),
        field(t('home.profile.nick'), text('nick', 8), null, err.nick),
      ),
      field(t('home.profile.birthday'), dateRow('pf-birthday', 'birthday', { yearMin: 1950, yearMax: now.getFullYear() }), bdHint, err.birthday),
      field(t('home.profile.since'), dateRow('pf-since', 'since', { yearMin: 1980, yearMax: now.getFullYear() }), t('home.profile.sinceHint'), err.since),
      field(t('home.profile.sender'), text('sender', 16, t('home.profile.senderPlaceholder')), t('home.profile.senderHint'), err.sender),
    );
  };

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
      const bad = problems();
      const n = Object.keys(bad).length;
      if (n) {
        // 每一项下面写清楚还差什么，再用一句话提醒一下
        tried = true;
        draw();
        const firstBad = box.querySelector('.field.bad');
        firstBad?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        shake(firstBad);
        toast(n === 1 ? Object.values(bad)[0] : t('home.profile.missing', { n }), 'err');
        return false;
      }
      const name = form.name.trim();
      const nick = form.nick.trim();
      const q = { quiet: true };
      await Promise.all([
        // 和当前语言的默认值一样就存空的，换语言时跟着变
        app.set('pet.name', name === petName(null) ? '' : name, q),
        app.set('owner.nickname', nick === nickname(null) ? '' : nick, q),
        app.set('love.birthday', form.birthday, q),
        app.set('love.togetherSince', form.since, q),
        app.set('owner.sender', form.sender.trim(), q),
        app.set('runtime.profileDone', true, q),
      ]);
      toast(first ? t('home.profile.firstDone') : t('home.toast.saved'));
      const cheer = first ? t('home.profile.cheerFirst', { nick }) : t('home.profile.cheerSaved');
      app.mochi.petCommand({ type: 'cheer', text: cheer });
      return true;
    },
  });
  if (!ok && first) app.set('runtime.profileSkipped', true, { quiet: true });
  opening = false;
}
