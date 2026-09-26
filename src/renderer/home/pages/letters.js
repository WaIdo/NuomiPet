// 信箱：一封封信封。解锁未读的有发光的火漆爱心和「新」，已读的是拆开的信封，没到日子的上了锁。
import { h, s, cx, pageHead, emptyState, icon, fmtDate, toast, shake } from '../ui.js';

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

function card(app, l) {
  const st = stateOf(l);
  const meta =
    st === 'locked'
      ? [h('span', { class: 'lm-lock' }, icon('lock')), l.daysLeft > 0 ? `${l.daysLeft} 天后解锁` : '快要解锁啦', l.unlock && h('span', { class: 'lm-date' }, fmtDate(l.unlock))]
      : [l.from ? `来自 ${l.from}` : '一封信', l.unlock && h('span', { class: 'lm-date' }, fmtDate(l.unlock))];
  return h(
    'button',
    {
      type: 'button',
      key: l.id,
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
    const sub = !list.length ? '这里会收到特别的信' : fresh ? `有 ${fresh} 封新的信在等你拆开 💗` : '每一封都好好收着呢';
    return h(
      'div',
      { class: 'page page-letters' },
      pageHead('💌', '信箱', sub),
      list.length
        ? h('div', { class: 'letter-grid', key: 'grid' }, list.map((l) => card(app, l)))
        : app.lettersLoaded
          ? h('section', { class: 'card', key: 'empty' }, emptyState(app.look(), '信箱空空的～', '说不定哪天，就会收到一封信哦'))
          : h('div', { class: 'letter-grid', key: 'loading' }),
      h('p', { class: 'letter-hint', key: 'hint' }, '💌 这些信是一个很在乎你的人，提前写好托糯米保管的。到了日子，信会自己解锁。'),
    );
  },
};
