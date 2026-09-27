// 信箱：一封封信封。解锁未读的有发光的火漆爱心和「新」，已读的是拆开的信封，没到日子的上了锁。
// 也可以在这里写信：定好拆开的日子，封好之后没到日子谁都看不到正文。
import { h, s, cx, pageHead, cardHead, emptyState, icon, fmtDate, toast, shake, modal, morph, datePicker, segmented, popover, closePopover, rich } from '../ui.js';
import { t, petName, nickname } from '../../shared/i18n.mjs';

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
    toast(l.unlock ? t('home.letters.card.lockedToastDate', { date: fmtDate(l.unlock, { withYear: false }) }) : t('home.letters.card.lockedToast'));
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
  const nick = nickname(st);
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
          t('home.letters.editor.title'),
          h('input', { class: 'input', key: 'title', maxlength: 30, value: form.title, placeholder: t('home.letters.editor.titlePlaceholder'), oninput: (e) => (form.title = e.target.value) }),
        ),
        field(
          t('home.letters.editor.from'),
          h('input', { class: 'input', key: 'from', maxlength: 16, value: form.from, placeholder: t('home.letters.editor.fromPlaceholder'), oninput: (e) => (form.from = e.target.value) }),
        ),
      ),
      field(
        t('home.letters.editor.when'),
        h(
          'div',
          { class: 'le-when' },
          segmented(
            [
              { value: 'now', label: t('home.letters.editor.now') },
              { value: 'date', label: t('home.letters.editor.onDate') },
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
        form.mode === 'date' ? t('home.letters.editor.hintDate', { pet: petName(st), nick }) : t('home.letters.editor.hintNow', { pet: petName(st) }),
      ),
      existing
        ? h('p', { class: 'le-sealed', key: 'sealed' }, t('home.letters.editor.sealed'))
        : field(
            t('home.letters.editor.body'),
            h('textarea', {
              class: 'input textarea',
              key: 'body',
              rows: 7,
              maxlength: 5000,
              value: form.body,
              placeholder: t('home.letters.editor.bodyPlaceholder', { nick }),
              oninput: (e) => {
                form.body = e.target.value;
                if (countEl) countEl.textContent = `${form.body.length} / 5000`;
              },
            }),
            h('span', { class: 'le-count', key: 'count' }, `${form.body.length} / 5000`),
          ),
      !existing && h('p', { class: 'le-tip', key: 'tip' }, t('home.letters.editor.tip')),
    );

  const draw = () => {
    morph(box, render());
    countEl = box.querySelector('.le-count');
  };
  draw();

  modal({
    title: existing ? t('home.letters.editor.editTitle') : t('home.letters.editor.newTitle'),
    body: box,
    ok: existing ? t('common.save') : t('home.letters.editor.seal'),
    cancel: t('common.cancel'),
    cls: 'letter-editor',
    onOk: async () => {
      if (!existing && !form.body.trim()) {
        toast(t('home.letters.editor.emptyBody'), 'err');
        return false;
      }
      if (form.mode === 'date' && !C.parseKey(form.unlock)?.y) {
        toast(t('home.letters.editor.pickDate'), 'err');
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
        toast((r && r.error) || t('home.letters.editor.saveFailed'), 'err');
        return false;
      }
      toast(existing ? t('home.letters.editor.edited') : t('home.letters.editor.sealedToast'));
      app.refreshLetters();
      return true;
    },
  });
  setTimeout(() => box.querySelector('input')?.focus({ preventScroll: true }), 300);
}

async function remove(app, l) {
  const ok = await modal({
    title: t('home.letters.remove.title'),
    text: t('home.letters.remove.text', { title: l.title }),
    ok: t('home.letters.remove.ok'),
    danger: true,
    look: app.look(),
    face: ['sad', 'wavy'],
  });
  if (!ok) return;
  const r = await app.mochi.letters.remove(l.id);
  if (r && r.ok) {
    toast(t('home.letters.remove.done'));
    app.refreshLetters();
  } else toast((r && r.error) || t('home.letters.remove.failed'), 'err');
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
          t('home.letters.menu.edit'),
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
        t('home.letters.menu.remove'),
      ),
    ),
    { cls: 'letter-menu' },
  );
}

async function exportLetters(app) {
  const r = await app.mochi.letters.exportFile();
  if (r && r.ok) toast(t('home.letters.tools.exported', { n: r.count }));
  else if (r && r.error) toast(r.error, 'err');
}

async function importLetters(app) {
  const r = await app.mochi.letters.importFile();
  if (r && r.ok) {
    toast(t('home.letters.tools.imported', { n: r.count }));
    app.refreshLetters();
  } else if (r && r.error) toast(r.error, 'err');
}

/* ---------------- 邮件 ---------------- */

// ready（收信、发确认邮件要的都填齐了）只有 mail.get() 算得出来：进页面、邮件设置变了的时候重新取。
// known：取到过一次（在那之前先不显示邮件卡片，免得闪一下「去设置」）；busy：正在「立即收信」
const mailUi = { key: null, known: false, ready: false, busy: false };

function syncMail(app) {
  const api = app.mochi.mail;
  const m = app.state.mail || {};
  const key = JSON.stringify([m.enabled, m.address, m.server, m.imap, m.smtp, m.hasPass, m.hasMsToken, m.msClientId, m.ms && m.ms.state]);
  if (!api || key === mailUi.key) return;
  mailUi.key = key;
  api.get().then(
    (info) => {
      if (mailUi.key !== key) return;
      mailUi.known = true;
      mailUi.ready = !!(info && info.ready);
      app.rerender();
    },
    (err) => console.error('[letters] mail.get failed', err),
  );
}

async function checkMail(app) {
  if (mailUi.busy) return;
  mailUi.busy = true;
  app.rerender();
  let r = null;
  try {
    r = await app.mochi.mail.check();
  } catch (err) {
    console.error('[letters] mail.check failed', err);
  }
  mailUi.busy = false;
  app.rerender();
  if (!r || !r.ok) toast((r && r.error) || t('home.letters.mail.checkFailed'), 'err');
  else if (r.added) {
    toast(t('home.letters.mail.received', { n: r.added }));
    app.refreshLetters();
  } else if (r.error) toast(r.error, 'err');
  else toast(t('home.letters.mail.noNew'));
}

// 「今天 14:05」「昨天 21:30」「9月20日 08:00」
function when(app, ms) {
  const { C } = app;
  const d = new Date(ms);
  const key = C.dateKey(d);
  const diff = C.daysUntil(key);
  const day = diff === 0 ? t('home.letters.mail.today') : diff === -1 ? t('home.letters.mail.yesterday') : fmtDate(key, { withYear: false });
  return t('home.letters.mail.at', { day, time: C.hm(d) });
}

function mailCard(app) {
  syncMail(app);
  if (!mailUi.known) return null;
  const st = app.state;
  const m = st.mail || {};
  // 名字和邮箱地址用 <bdi> 隔开，从右往左的语言里也不会被打乱
  const sender = h('bdi', String(st.owner?.sender || '').trim() || t('home.letters.mail.him'));
  if (!mailUi.ready) {
    return h(
      'section',
      { class: 'card letter-tools letter-mail', key: 'mail' },
      cardHead('📮', t('home.letters.mail.title'), null, rich('home.letters.mail.guide', {}, { sender })),
      h('div', { class: 'lt-btns' }, h('button', { type: 'button', class: 'btn soft', onclick: () => app.go('settings') }, t('home.letters.mail.toSettings'))),
    );
  }
  const last = m.lastCheck ? t('home.letters.mail.lastCheck', { time: when(app, m.lastCheck) }) : t('home.letters.mail.never');
  const auto = m.enabled ? t('home.letters.mail.auto', { n: m.interval || 5 }) : t('home.letters.mail.autoOff');
  return h(
    'section',
    { class: 'card letter-tools letter-mail', key: 'mail' },
    cardHead('📮', t('home.letters.mail.title'), null, rich('home.letters.mail.sendTo', {}, { sender, address: h('bdi', m.address || '') })),
    h('p', { class: 'card-sub lm-status' }, t('home.letters.mail.status', { last, auto })),
    m.lastError && h('p', { class: 'card-sub lm-error' }, t('home.letters.mail.error', { error: m.lastError })),
    h(
      'div',
      { class: 'lt-btns' },
      h('button', { type: 'button', class: 'btn soft', disabled: mailUi.busy, onclick: () => checkMail(app) }, mailUi.busy ? t('home.letters.mail.checking') : t('home.letters.mail.check')),
    ),
  );
}

/* ---------------- 信封卡片 ---------------- */

function card(app, l) {
  const st = stateOf(l);
  const meta =
    st === 'locked'
      ? [h('span', { class: 'lm-lock' }, icon('lock')), l.daysLeft > 0 ? t('home.letters.card.unlockIn', { n: l.daysLeft }) : t('home.letters.card.unlockSoon'), l.unlock && h('span', { class: 'lm-date' }, fmtDate(l.unlock))]
      : [l.from ? t('home.letters.card.from', { name: l.from }) : t('home.letters.aLetter'), l.unlock && h('span', { class: 'lm-date' }, fmtDate(l.unlock))];
  // 邮件寄来的信：小标记，鼠标放上去显示寄信地址（列表里没有的话从数据里找）
  if (l.source === 'mail') {
    const mailFrom = l.mailFrom || (app.state.letters?.custom || []).find((x) => x.id === l.id)?.mailFrom || '';
    meta.push(h('span', { class: 'muted-chip lm-mail', title: mailFrom || null }, t('home.letters.mail.badge')));
  }
  return h(
    'div',
    { class: 'letter-item', key: l.id },
    h(
      'button',
      {
        type: 'button',
        class: cx('letter-card', 'st-' + st),
        'aria-disabled': st === 'locked' ? 'true' : null,
        title: st === 'locked' ? t('home.letters.card.locked') : t('home.letters.card.open'),
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
        st === 'new' && h('span', { class: 'env-new' }, t('home.letters.card.new')),
      ),
      h('div', { class: 'lc-title', title: l.title }, l.title || t('home.letters.aLetter')),
      h('div', { class: 'lc-meta' }, meta),
      st === 'read' && l.preview && h('div', { class: 'lc-preview' }, l.preview),
      st === 'new' && h('div', { class: 'lc-preview new' }, t('home.letters.card.tapToOpen')),
    ),
    l.mine && h('button', { type: 'button', class: 'lc-more', title: t('home.letters.card.more'), 'aria-label': t('home.letters.card.more'), onclick: (e) => more(app, l, e) }, '···'),
  );
}

const ORDER = { new: 0, read: 1, locked: 2 };

export default {
  id: 'letters',
  icon: '💌',
  enter(app) {
    app.refreshLetters();
    syncMail(app);
  },
  render(app) {
    const list = [...(app.letters || [])].sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)] || (a.daysLeft || 0) - (b.daysLeft || 0));
    const fresh = list.filter((l) => stateOf(l) === 'new').length;
    // 能导出的只有在这里写的信（邮件寄来的不导出）
    const mine = list.filter((l) => l.mine && l.source !== 'mail').length;
    const sub = !list.length ? t('home.letters.sub.empty') : fresh ? t('home.letters.sub.fresh', { n: fresh }) : t('home.letters.sub.all');
    return h(
      'div',
      { class: 'page page-letters' },
      pageHead('💌', t('home.letters.title'), sub, h('button', { type: 'button', class: 'btn primary', key: 'write', onclick: () => editor(app) }, t('home.letters.write'))),
      list.length
        ? h('div', { class: 'letter-grid', key: 'grid' }, list.map((l) => card(app, l)))
        : app.lettersLoaded
          ? h('section', { class: 'card', key: 'empty' }, emptyState(app.look(), t('home.letters.empty.text'), t('home.letters.empty.sub')))
          : h('div', { class: 'letter-grid', key: 'loading' }),
      mailCard(app),
      h(
        'section',
        { class: 'card letter-tools', key: 'tools' },
        cardHead('📦', t('home.letters.tools.title'), null, t('home.letters.tools.sub')),
        h(
          'div',
          { class: 'lt-btns' },
          h('button', { type: 'button', class: 'btn soft', disabled: !mine, onclick: () => exportLetters(app) }, t('home.letters.tools.export')),
          h('button', { type: 'button', class: 'btn soft', onclick: () => importLetters(app) }, t('home.letters.tools.import')),
        ),
      ),
      h('p', { class: 'letter-hint', key: 'hint' }, t('home.letters.hint')),
    );
  },
};
