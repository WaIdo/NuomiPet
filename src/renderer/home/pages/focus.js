// 专注：番茄钟圆环 + 开始/暂停/继续/结束/跳过 + 时长设置。状态来自主进程（mochi.pomodoro）。
import { h, s, cx, pageHead, cardHead, stepper, toggle, petEl, icon, fmtClock, toast } from '../ui.js';

const PHASE = { idle: '准备开始', focus: '专注中', short: '短休息', long: '长休息' };
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
    toast('番茄钟好像卡住了，再试一次吧', 'err');
  }
}

function petFor(p) {
  const phase = p?.phase || 'idle';
  if (phase === 'idle') return { pose: 'idle', face: null, line: '准备好了就开始吧～' };
  if (p.paused) return { pose: 'think', face: ['normal', 'o'], line: '休息一下也没关系哦' };
  if (phase === 'focus') return { pose: 'focus', face: ['normal', 'flat'], line: '（安静陪你专注中……）' };
  return { pose: 'sleep', face: ['closed', 'smile'], line: phase === 'long' ? '好好休息，喝口水伸个懒腰～' : '小憩一下，马上回来～' };
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
  return h('div', { class: 'ring-dots', title: `每 ${every} 个番茄长休息一次` }, out);
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
      h('span', { class: 'ring-phase' }, p?.paused ? '已暂停' : PHASE[phase] || '准备开始'),
      h('div', { class: 'ring-time' }, fmtClock(remaining)),
      dots(p, every),
    ),
  );
}

function controls(app, p) {
  const phase = p?.phase || 'idle';
  if (phase === 'idle') {
    return h('div', { class: 'focus-btns', key: 'btns' }, h('button', { type: 'button', class: 'btn primary lg', key: 'start', onclick: () => cmd(app, 'start') }, icon('play'), '开始专注'));
  }
  return h(
    'div',
    { class: 'focus-btns', key: 'btns' },
    p.paused
      ? h('button', { type: 'button', class: 'btn primary lg', key: 'resume', onclick: () => cmd(app, 'resume') }, icon('play'), '继续')
      : h('button', { type: 'button', class: 'btn butter lg', key: 'pause', onclick: () => cmd(app, 'pause') }, icon('pause'), '暂停'),
    h('button', { type: 'button', class: 'btn ghost', key: 'skip', onclick: () => cmd(app, 'skip') }, icon('skip'), phase === 'focus' ? '跳过' : '跳过休息'),
    h('button', { type: 'button', class: 'btn ghost', key: 'stop', onclick: () => cmd(app, 'stop') }, icon('stop'), '结束'),
  );
}

function setRow(label, ctrl, desc) {
  return h('div', { class: 'set-row', key: label }, h('div', { class: 'set-label' }, h('span', label), desc && h('small', desc)), ctrl);
}

export default {
  id: 'focus',
  icon: '🍅',
  label: '专注',
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
      pageHead('🍅', '专注', '一次只做一件事，糯米在旁边安安静静地陪着你'),
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
            cardHead('🏅', '今天'),
            h('div', { class: 'ft-count' }, '今天完成 ', h('b', count), ' 个番茄🍅'),
            h('div', { class: 'ft-tomatoes', 'aria-hidden': 'true' }, count ? Array.from({ length: Math.min(count, 12) }, (_, i) => h('span', { key: 't' + i }, '🍅')) : h('span', { class: 'ft-none' }, '还没有番茄，开始第一个吧～')),
            minutes > 0 && h('p', { class: 'ft-min' }, `一共专注了 ${minutes} 分钟`),
          ),
          h(
            'section',
            { class: 'card focus-set', key: 'set' },
            cardHead('⚙️', '番茄设置', null, '改动从下一个番茄开始生效'),
            setRow('专注时长', stepper(pd.focus || 25, { min: 5, max: 120, step: 5, unit: '分钟', onChange: (v) => app.set('pomodoro.focus', v) })),
            setRow('短休息', stepper(pd.shortBreak || 5, { min: 1, max: 30, step: 1, unit: '分钟', onChange: (v) => app.set('pomodoro.shortBreak', v) })),
            setRow('长休息', stepper(pd.longBreak || 15, { min: 5, max: 60, step: 5, unit: '分钟', onChange: (v) => app.set('pomodoro.longBreak', v) })),
            setRow('长休息间隔', stepper(pd.longEvery || 4, { min: 2, max: 8, step: 1, unit: '个番茄', onChange: (v) => app.set('pomodoro.longEvery', v) }), '每几个番茄长休息一次'),
            setRow('自动开始休息', toggle(!!pd.autoBreak, (v) => app.set('pomodoro.autoBreak', v), { label: '自动开始休息' }), '专注结束后直接开始休息'),
          ),
        ),
      ),
    );
  },
};
