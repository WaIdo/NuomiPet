// 番茄钟状态机测试
const test = require('node:test');
const assert = require('node:assert');
const { Pomodoro } = require('../src/main/pomodoro');

function make(cfg = {}) {
  const data = { pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 2, autoBreak: true, ...cfg }, 'stats.daily': {} };
  const pm = new Pomodoro({ get: (p) => data[p] });
  const events = [];
  for (const e of ['phase', 'focus-done', 'break-done', 'stopped']) pm.on(e, (x) => events.push([e, x]));
  return { pm, events };
}

test('专注 → 短休息 → 专注 → 长休息 → 重新计数', () => {
  const { pm, events } = make();
  pm.start();
  assert.equal(pm.snapshot().phase, 'focus');
  assert.equal(pm.snapshot().total, 25 * 60);
  pm.finish(false);
  assert.equal(pm.snapshot().phase, 'short');
  pm.finish(false);
  assert.equal(pm.snapshot().phase, 'idle');
  pm.start();
  assert.equal(pm.snapshot().round, 2);
  pm.finish(false);
  assert.equal(pm.snapshot().phase, 'long');
  pm.finish(false);
  assert.equal(pm.snapshot().completed, 0);
  assert.deepEqual(events.filter(([e]) => e === 'focus-done').map(([, x]) => x.next), ['short', 'long']);
  pm.stop();
});

test('暂停后剩余时间不变，继续后接着倒计时', async () => {
  const { pm } = make({ focus: 1 });
  pm.start();
  pm.pause();
  const r = pm.snapshot().remaining;
  await new Promise((res) => setTimeout(res, 1100));
  assert.equal(pm.snapshot().remaining, r);
  pm.resume();
  assert.ok(pm.snapshot().endsAt > Date.now());
  pm.stop();
});

test('关闭自动休息时，专注结束后回到空闲', () => {
  const { pm, events } = make({ autoBreak: false });
  pm.start();
  pm.finish(false);
  assert.equal(pm.snapshot().phase, 'idle');
  assert.equal(events.find(([e]) => e === 'focus-done')[1].autoBreak, false);
});

test('跳过专注不算完成', () => {
  const { pm, events } = make();
  pm.start();
  pm.skip();
  assert.equal(events.find(([e]) => e === 'focus-done')[1].skipped, true);
  pm.stop();
});

test('非法设置会被夹到合理范围', () => {
  const { pm } = make({ focus: 0, shortBreak: 999, longEvery: 1 });
  const c = pm.cfg();
  assert.equal(c.focus, 25);
  assert.equal(c.shortBreak, 60);
  assert.equal(c.longEvery, 2);
});
