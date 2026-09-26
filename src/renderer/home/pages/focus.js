// 专注：番茄钟圆环 + 开始/暂停/继续/结束/跳过 + 时长设置。状态来自主进程（mochi.pomodoro）。
import { h, s, cx, pageHead, cardHead, stepper, toggle, petEl, icon, fmtClock, toast, rich } from '../ui.js';
import { t, petName } from '../../shared/i18n.mjs';

const PHASES = ['idle', 'focus', 'short', 'long'];
const phaseName = (phase) => t(`home.focus.phase.${PHASES.includes(phase) ? phase : 'idle'}`);
const R = 100;
const CIRC = 2 * Math.PI * R;

async function cmd(app, name) {
  try {
    const res = await app.mochi.pomodoro[name]();
    if (res && typeof res === 'object' && res.phase) {
      app.pomo = res;
      app.pomoAt = Date.now();
      app.rerender();
    }
  } catch (err) {
    console.error('[focus] pomodoro', name, err);
    toast(t('home.focus.stuck'), 'err');
  }
}

function petFor(p) {
  const phase = p?.phase || 'idle';
  if (phase === 'idle') return { pose: 'idle', face: null, line: t('home.focus.pet.idle') };
  if (p.paused) return { pose: 'think', face: ['normal', 'o'], line: t('home.focus.pet.paused') };
  if (phase === 'focus') return { pose: 'focus', face: ['normal', 'flat'], line: t('home.focus.pet.focus') };
  return { pose: 'sleep', face: ['closed', 'smile'], line: phase === 'long' ? t('home.focus.pet.long') : t('home.focus.pet.short') };
}

function dots(p, every) {
  const phase = p?.phase || 'idle';
  const round = p?.round || 1;
  const out = [];
  for (let i = 1; i <= every; i++) {
    const done = phase !== 'idle' && (i < round || (i === round && phase !== 'focus'));
    const cur = phase === 'focus' && i === round;
    out.push(h('i', { class: cx({ done, cur }) }));
  }
  return h('div', { class: 'ring-dots', title: t('home.focus.dots', { n: every }) }, out);
}

function ring(app, p) {
  const pd = app.state.pomodoro || {};
  const phase = p?.phase || 'idle';
  const idle = phase === 'idle';
  const total = idle ? (pd.focus || 25) * 60 : p.total || 1;
  const remaining = idle ? total : p.remaining;
  const frac = idle ? 1 : Math.max(0, Math.min(1, remaining / total));
  const every = p?.longEvery || pd.longEvery || 4;
  return h(
    'div',
    { class: cx('ring', 'ph-' + phase, { paused: p?.paused }), key: 'ring' },
    s(
      'svg',
      { class: 'ring-svg', viewBox: '0 0 240 240', 'aria-hidden': 'true' },
      s(
        'defs',
        null,
        s('linearGradient', { id: 'rg-focus', x1: '0', y1: '0', x2: '1', y2: '1' }, s('stop', { offset: '0', 'stop-color': '#FFB3CD' }), s('stop', { offset: '1', 'stop-color': '#FF6F9E' })),
        s('linearGradient', { id: 'rg-short', x1: '0', y1: '0', x2: '1', y2: '1' }, s('stop', { offset: '0', 'stop-color': '#A8EBD2' }), s('stop', { offset: '1', 'stop-color': '#4CC49B' })),
        s('linearGradient', { id: 'rg-long', x1: '0', y1: '0', x2: '1', y2: '1' }, s('stop', { offset: '0', 'stop-color': '#C9BDFF' }), s('stop', { offset: '1', 'stop-color': '#8C74FF' })),
      ),
      s('circle', { class: 'ring-track', cx: 120, cy: 120, r: R }),
      s('circle', { class: 'ring-tick', cx: 120, cy: 120, r: R - 16 }),
      s('circle', {
        class: 'ring-bar',
        cx: 120,
        cy: 120,
        r: R,
        transform: 'rotate(-90 120 120)',
        style: { 'stroke-dasharray': CIRC.toFixed(2), 'stroke-dashoffset': (CIRC * (1 - frac)).toFixed(2) },
      }),
    ),
    h(
      'div',
      { class: 'ring-center' },
      h('span', { class: 'ring-phase' }, p?.paused ? t('home.focus.paused') : phaseName(phase)),
      h('div', { class: 'ring-time' }, fmtClock(remaining)),
      dots(p, every),
    ),
  );
}

function controls(app, p) {
  const phase = p?.phase || 'idle';
  if (phase === 'idle') {
    return h('div', { class: 'focus-btns', key: 'btns' }, h('button', { type: 'button', class: 'btn primary lg', key: 'start', onclick: () => cmd(app, 'start') }, icon('play'), t('home.focus.btn.start')));
  }
  return h(
    'div',
    { class: 'focus-btns', key: 'btns' },
    p.paused
      ? h('button', { type: 'button', class: 'btn primary lg', key: 'resume', onclick: () => cmd(app, 'resume') }, icon('play'), t('home.focus.btn.resume'))
      : h('button', { type: 'button', class: 'btn butter lg', key: 'pause', onclick: () => cmd(app, 'pause') }, icon('pause'), t('home.focus.btn.pause')),
    h('button', { type: 'button', class: 'btn ghost', key: 'skip', onclick: () => cmd(app, 'skip') }, icon('skip'), phase === 'focus' ? t('home.focus.btn.skip') : t('home.focus.btn.skipBreak')),
    h('button', { type: 'button', class: 'btn ghost', key: 'stop', onclick: () => cmd(app, 'stop') }, icon('stop'), t('home.focus.btn.stop')),
  );
}

// id 只用来在重新渲染时认出是哪一行，换语言也不变
function setRow(id, label, ctrl, desc) {
  return h('div', { class: 'set-row', key: id }, h('div', { class: 'set-label' }, h('span', label), desc && h('small', desc)), ctrl);
}

export default {
  id: 'focus',
  icon: '🍅',
  live: true,
  render(app) {
    const p = app.pomoNow();
    const pd = app.state.pomodoro || {};
    const today = app.C.dateKey();
    const daily = app.state.stats?.daily || {};
    const count = p && typeof p.todayCount === 'number' ? p.todayCount : daily.date === today ? daily.pomodoros || 0 : 0;
    const minutes = daily.date === today ? daily.focusMinutes || 0 : 0;
    const pet = petFor(p);
    return h(
      'div',
      { class: 'page page-focus' },
      pageHead('🍅', t('home.focus.title'), t('home.focus.sub', { pet: petName(app.state) })),
      h(
        'div',
        { class: 'focus-wrap' },
        h(
          'section',
          { class: 'card focus-main', key: 'main' },
          ring(app, p),
          h('div', { class: 'focus-pet', key: 'pet' }, petEl(app.look(), { size: 64, pose: pet.pose, face: pet.face, blink: true, key: 'focus-pet' }), h('span', { class: 'focus-say' }, pet.line)),
          controls(app, p),
        ),
        h(
          'div',
          { class: 'focus-side', key: 'side' },
          h(
            'section',
            { class: 'card focus-today', key: 'today' },
            cardHead('🏅', t('home.focus.today.title')),
            h('div', { class: 'ft-count' }, rich('home.focus.today.count', { n: count }, { n: h('b', count) })),
            h('div', { class: 'ft-tomatoes', 'aria-hidden': 'true' }, count ? Array.from({ length: Math.min(count, 12) }, (_, i) => h('span', { key: 't' + i }, '🍅')) : h('span', { class: 'ft-none' }, t('home.focus.today.none'))),
            minutes > 0 && h('p', { class: 'ft-min' }, t('home.focus.today.minutes', { n: minutes })),
          ),
          h(
            'section',
            { class: 'card focus-set', key: 'set' },
            cardHead('⚙️', t('home.focus.set.title'), null, t('home.focus.set.sub')),
            setRow('focus', t('home.focus.set.focus'), stepper(pd.focus || 25, { min: 5, max: 120, step: 5, unit: t('home.focus.set.minutes', { n: pd.focus || 25 }), onChange: (v) => app.set('pomodoro.focus', v) })),
            setRow('short', t('home.focus.phase.short'), stepper(pd.shortBreak || 5, { min: 1, max: 30, step: 1, unit: t('home.focus.set.minutes', { n: pd.shortBreak || 5 }), onChange: (v) => app.set('pomodoro.shortBreak', v) })),
            setRow('long', t('home.focus.phase.long'), stepper(pd.longBreak || 15, { min: 5, max: 60, step: 5, unit: t('home.focus.set.minutes', { n: pd.longBreak || 15 }), onChange: (v) => app.set('pomodoro.longBreak', v) })),
            setRow(
              'longEvery',
              t('home.focus.set.longEvery'),
              stepper(pd.longEvery || 4, { min: 2, max: 8, step: 1, unit: t('home.focus.set.pomodoros', { n: pd.longEvery || 4 }), onChange: (v) => app.set('pomodoro.longEvery', v) }),
              t('home.focus.set.longEveryDesc'),
            ),
            setRow('autoBreak', t('home.focus.set.autoBreak'), toggle(!!pd.autoBreak, (v) => app.set('pomodoro.autoBreak', v), { label: t('home.focus.set.autoBreak') }), t('home.focus.set.autoBreakDesc')),
          ),
        ),
      ),
    );
  },
};
