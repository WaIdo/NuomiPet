// 信箱：一封封信封。解锁未读的有发光的火漆爱心和「新」，已读的是拆开的信封，没到日子的上了锁。
// 也可以在这里写信：定好拆开的日子，封好之后没到日子谁都看不到正文。
import { h, s, cx, pageHead, cardHead, emptyState, icon, fmtDate, toast, shake, modal, morph, datePicker, segmented, popover, closePopover } from '../ui.js';

function heart() {
  return s(
    'svg',
    { class: 'seal-heart', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('path', { d: 'M12 20.2c-.3 0-.6-.1-.8-.3C7.7 17 3.4 13.6 3.4 9.4c0-2.7 2.1-4.9 4.7-4.9 1.5 0 2.9.7 3.9 1.9 1-1.2 2.4-1.9 3.9-1.9 2.6 0 4.7 2.2 4.7 4.9 0 4.2-4.3 7.6-7.8 10.5-.2.2-.5.3-.8.3z' }),
  );
}

function stateOf(l) {
  if (!l.unlocked) return 'locked';
  return l.read ? 'read' : 'new';
}

function open(app, l, e) {
  if (!l.unlocked) {
    shake(e.currentTarget.querySelector('.env'));
    toast(`还没到拆开的时间哦～${l.unlock ? fmtDate(l.unlock, { withYear: false }) + ' 见' : ''}`);
    return;
  }
  app.mochi.letters.open(l.id);
}

/* ---------------- 写信 / 改信封 ---------------- */

const field = (label, control, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint && h('span', { class: 'field-hint' }, hint));

function editor(app, existing = null) {
  const st = app.state;
  const C = app.C;
  const now = new Date();
  const nextBirthday = C.nextYearly(st.love?.birthday)?.date || '';
  const form = {
    title: existing ? existing.title : '',
    from: existing ? existing.from : st.owner?.sender || '',
    mode: existing ? (existing.unlock ? 'date' : 'now') : nextBirthday ? 'date' : 'now',
    unlock: existing ? existing.unlock : nextBirthday,
    body: '',
  };
  const nick = st.owner?.nickname || 'TA';
  const box = h('div', { class: 'le-form' });
  let countEl = null;

  const render = () =>
    h(
      'div',
      { class: 'le-form' },
      h(
        'div',
        { class: 'le-two', key: 'two' },
        field(
          '标题',
          h('input', { class: 'input', key: 'title', maxlength: 30, value: form.title, placeholder: '比如：生日快乐', oninput: (e) => (form.title = e.target.value) }),
        ),
        field(
          '署名',
          h('input', { class: 'input', key: 'from', maxlength: 16, value: form.from, placeholder: '写信的人', oninput: (e) => (form.from = e.target.value) }),
        ),
      ),
      field(
        '什么时候可以拆开',
        h(
          'div',
          { class: 'le-when' },
          segmented(
            [
              { value: 'now', label: '马上' },
              { value: 'date', label: '到某一天' },
            ],
            form.mode,
            (v) => {
              form.mode = v;
              draw();
            },
            { key: 'mode' },
          ),
          form.mode === 'date' &&
            datePicker(
              'letter-unlock',
              form.unlock,
              (v) => {
                form.unlock = v;
                draw();
              },
              { key: 'unlock', yearMin: now.getFullYear(), yearMax: now.getFullYear() + 15, onPartial: () => draw() },
            ),
        ),
        form.mode === 'date' ? `到了那天，${st.pet?.name || '糯米'}会把信叼给${nick}` : `封好就能拆开，${st.pet?.name || '糯米'}很快会把信递过去`,
      ),
      existing
        ? h('p', { class: 'le-sealed', key: 'sealed' }, '🔒 信已经封好了，正文看不到也改不了。写错了可以删掉重写。')
        : field(
            '正文',
            h('textarea', {
              class: 'input textarea',
              key: 'body',
              rows: 7,
              maxlength: 5000,
              value: form.body,
              placeholder: `想对${nick}说的话……`,
              oninput: (e) => {
                form.body = e.target.value;
                if (countEl) countEl.textContent = `${form.body.length} / 5000`;
              },
            }),
            h('span', { class: 'le-count', key: 'count' }, `${form.body.length} / 5000`),
          ),
      !existing && h('p', { class: 'le-tip', key: 'tip' }, '封好之后，没到拆开的日子谁都看不到正文（写信的人也看不到）。'),
    );

  const draw = () => {
    morph(box, render());
    countEl = box.querySelector('.le-count');
  };
  draw();

  modal({
    title: existing ? '修改信封' : '写一封信 💌',
    body: box,
    ok: existing ? '保存' : '封好 💌',
    cancel: '取消',
    cls: 'letter-editor',
    onOk: async () => {
      if (!existing && !form.body.trim()) {
        toast('信里还什么都没写呢', 'err');
        return false;
      }
      if (form.mode === 'date' && !C.parseKey(form.unlock)?.y) {
        toast('选一下拆开的日子吧', 'err');
        return false;
      }
      const payload = {
        id: existing?.id,
        title: form.title,
        from: form.from,
        unlock: form.mode === 'date' ? form.unlock : '',
      };
      if (!existing) payload.body = form.body;
      const r = await app.mochi.letters.save(payload);
      if (!r || !r.ok) {
        toast((r && r.error) || '没保存上，再试一次吧', 'err');
        return false;
      }
      toast(existing ? '改好啦 ✓' : '信封好啦 💌');
      app.refreshLetters();
      return true;
    },
  });
  setTimeout(() => box.querySelector('input')?.focus({ preventScroll: true }), 300);
}

async function remove(app, l) {
  const ok = await modal({
    title: '删掉这封信？',
    text: `「${l.title}」删掉之后就找不回来了。`,
    ok: '删掉',
    danger: true,
    look: app.look(),
    face: ['sad', 'wavy'],
  });
  if (!ok) return;
  const r = await app.mochi.letters.remove(l.id);
  if (r && r.ok) {
    toast('删掉了');
    app.refreshLetters();
  } else toast((r && r.error) || '没删掉', 'err');
}

function more(app, l, e) {
  e.stopPropagation();
  popover(
    e.currentTarget,
    h(
      'div',
      { class: 'menu-list' },
      !l.read &&
        h(
          'button',
          {
            type: 'button',
            class: 'menu-item',
            onclick: () => {
              closePopover();
              editor(app, l);
            },
          },
          '✏️ 改标题或日期',
        ),
      h(
        'button',
        {
          type: 'button',
          class: 'menu-item danger',
          onclick: () => {
            closePopover();
            remove(app, l);
          },
        },
        '🗑️ 删掉这封信',
      ),
    ),
    { cls: 'letter-menu' },
  );
}

async function exportLetters(app) {
  const r = await app.mochi.letters.exportFile();
  if (r && r.ok) toast(`导出了 ${r.count} 封信 ✓`);
  else if (r && r.error) toast(r.error, 'err');
}

async function importLetters(app) {
  const r = await app.mochi.letters.importFile();
  if (r && r.ok) {
    toast(`导入了 ${r.count} 封信 💌`);
    app.refreshLetters();
  } else if (r && r.error) toast(r.error, 'err');
}

/* ---------------- 信封卡片 ---------------- */

function card(app, l) {
  const st = stateOf(l);
  const meta =
    st === 'locked'
      ? [h('span', { class: 'lm-lock' }, icon('lock')), l.daysLeft > 0 ? `${l.daysLeft} 天后解锁` : '快要解锁啦', l.unlock && h('span', { class: 'lm-date' }, fmtDate(l.unlock))]
      : [l.from ? `来自 ${l.from}` : '一封信', l.unlock && h('span', { class: 'lm-date' }, fmtDate(l.unlock))];
  return h(
    'div',
    { class: 'letter-item', key: l.id },
    h(
      'button',
      {
        type: 'button',
        class: cx('letter-card', 'st-' + st),
        'aria-disabled': st === 'locked' ? 'true' : null,
        title: st === 'locked' ? '还没到拆开的时间哦' : '拆开看看',
        onclick: (e) => open(app, l, e),
      },
      h(
        'div',
        { class: 'env' },
        h('span', { class: 'env-back' }),
        h('span', { class: 'env-paper' }, h('i'), h('i'), h('i')),
        h('span', { class: 'env-pocket' }),
        h('span', { class: 'env-flap' }),
        h('span', { class: 'env-seal' }, st === 'locked' ? icon('lock') : heart()),
        st === 'new' && h('span', { class: 'env-new' }, '新'),
      ),
      h('div', { class: 'lc-title', title: l.title }, l.title || '一封信'),
      h('div', { class: 'lc-meta' }, meta),
      st === 'read' && l.preview && h('div', { class: 'lc-preview' }, l.preview),
      st === 'new' && h('div', { class: 'lc-preview new' }, '点开看看吧～'),
    ),
    l.mine && h('button', { type: 'button', class: 'lc-more', title: '修改或删除', 'aria-label': '修改或删除', onclick: (e) => more(app, l, e) }, '···'),
  );
}

const ORDER = { new: 0, read: 1, locked: 2 };

export default {
  id: 'letters',
  icon: '💌',
  label: '信箱',
  enter(app) {
    app.refreshLetters();
  },
  render(app) {
    const list = [...(app.letters || [])].sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)] || (a.daysLeft || 0) - (b.daysLeft || 0));
    const fresh = list.filter((l) => stateOf(l) === 'new').length;
    const mine = list.filter((l) => l.mine).length;
    const sub = !list.length ? '这里会收到特别的信' : fresh ? `有 ${fresh} 封新的信在等你拆开 💗` : '每一封都好好收着呢';
    return h(
      'div',
      { class: 'page page-letters' },
      pageHead('💌', '信箱', sub, h('button', { type: 'button', class: 'btn primary', key: 'write', onclick: () => editor(app) }, '✍️ 写一封信')),
      list.length
        ? h('div', { class: 'letter-grid', key: 'grid' }, list.map((l) => card(app, l)))
        : app.lettersLoaded
          ? h('section', { class: 'card', key: 'empty' }, emptyState(app.look(), '信箱空空的～', '点右上角「写一封信」，给重要的人留一封信吧'))
          : h('div', { class: 'letter-grid', key: 'loading' }),
      h(
        'section',
        { class: 'card letter-tools', key: 'tools' },
        cardHead('📦', '在别的电脑上写好的信', null, '写好的信可以导出成文件，拿到另一台电脑上导入，信会原样封好。'),
        h(
          'div',
          { class: 'lt-btns' },
          h('button', { type: 'button', class: 'btn soft', disabled: !mine, onclick: () => exportLetters(app) }, '导出在这里写的信'),
          h('button', { type: 'button', class: 'btn soft', onclick: () => importLetters(app) }, '导入信件'),
        ),
      ),
      h('p', { class: 'letter-hint', key: 'hint' }, '💌 信可以提前写好、定好拆开的日子。到了那天，信会自己解锁。'),
    );
  },
};
