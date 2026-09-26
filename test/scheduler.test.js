// 调度器的日期逻辑测试：node --test test/
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

// 用假的 electron 模块替换真实的
const fakeElectron = {
  powerMonitor: { getSystemIdleTime: () => 0, on: () => {} },
  Notification: class { static isSupported() { return false; } show() {} },
  net: { fetch: async () => { throw new Error('offline'); } },
  app: { getAppPath: () => path.join(__dirname, '..'), getPath: () => '/tmp' },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, parent, isMain);
};

const { Scheduler } = require('../src/main/scheduler');
const { Store } = require('../src/main/store');
const { createDefaults } = require('../src/main/defaults');
const C = require('../src/shared/common');

function setup(patch = {}, gift = {}) {
  const store = new Store(path.join(require('os').tmpdir(), `mochi-test-${Math.random()}.json`), createDefaults(gift));
  store.saveNow = () => {};
  for (const [k, v] of Object.entries(patch)) store.set(k, v);
  const events = [];
  const pet = { sendEvent: (e) => events.push(e), isVisible: () => true };
  const s = new Scheduler({ store, pet, gift: { letters: gift.letters || [] } });
  return { s, store, events };
}
const at = (iso) => new Date(iso);

test('生日当天庆祝一次，第二次不重复', () => {
  const { s, events } = setup({ 'love.birthday': '1999-03-21' });
  assert.equal(s.checkCelebrations(at('2027-03-21T09:00:00')), true);
  assert.equal(events[0].type, 'celebrate');
  assert.equal(events[0].reason, 'birthday');
  assert.equal(s.checkCelebrations(at('2027-03-21T15:00:00')), false);
});

test('生日和节日在同一天：先过生日，再送节日祝福', () => {
  const { s, events } = setup({ 'love.birthday': '1999-08-08' });
  // 2027-08-08 正好是七夕
  assert.equal(s.checkCelebrations(at('2027-08-08T09:00:00')), true);
  assert.equal(s.checkCelebrations(at('2027-08-08T09:01:00')), true);
  assert.equal(s.checkCelebrations(at('2027-08-08T09:02:00')), false);
  assert.deepEqual(events.map((e) => e.reason), ['birthday', 'festival']);
});

test('只写月日的生日也能识别', () => {
  const { s, events } = setup({ 'love.birthday': '03-21' });
  assert.equal(s.checkCelebrations(at('2027-03-21T09:00:00')), true);
  assert.equal(events[0].reason, 'birthday');
});

test('在一起周年和整百天', () => {
  const { s, events } = setup({ 'love.togetherSince': '2025-05-20' });
  assert.equal(s.checkCelebrations(at('2026-05-20T10:00:00')), true);
  assert.equal(events[0].reason, 'anniversary');
  assert.match(events[0].text, /1 周年|1 年/);
  const { s: s2, events: e2 } = setup({ 'love.togetherSince': '2026-01-01' });
  // 2026-01-01 是第 1 天，第 100 天是 2026-04-10
  assert.equal(C.dayNumber('2026-01-01', at('2026-04-10T10:00:00')), 100);
  assert.equal(s2.checkCelebrations(at('2026-04-10T10:00:00')), true);
  assert.equal(e2[0].reason, 'milestone');
});

test('节日祝福（农历七夕）', () => {
  const { s, events } = setup();
  assert.equal(s.checkCelebrations(at('2027-08-08T10:00:00')), true);
  assert.equal(events[0].reason, 'festival');
  assert.match(events[0].text, /七夕/);
});

test('自定义纪念日：每年 / 倒数日 / 累计', () => {
  const { s, events } = setup({
    'love.anniversaries': [
      { id: 'a', name: '第一次约会', date: '2024-06-01', kind: 'yearly' },
      { id: 'b', name: '见面', date: '2026-10-01', kind: 'countdown' },
      { id: 'c', name: '养猫', date: '2026-01-01', kind: 'since' },
    ],
  });
  assert.equal(s.checkCelebrations(at('2026-06-01T10:00:00')), true);
  assert.match(events.at(-1).text, /第一次约会/);
  assert.equal(s.checkCelebrations(at('2026-10-01T10:00:00')), true);
  assert.match(events.at(-1).text, /见面/);
  assert.equal(s.checkCelebrations(at('2026-04-10T10:00:00')), true);
  assert.match(events.at(-1).text, /养猫/);
});

test('提前 3 天预告生日', () => {
  const { s, events } = setup({ 'love.birthday': '1999-03-21' });
  assert.equal(s.checkSoon(at('2027-03-18T10:00:00')), true);
  assert.match(events[0].text, /3 天/);
  assert.equal(s.checkSoon(at('2027-03-17T10:00:00')), false);
});

test('自定义提醒：每天 / 工作日 / 周末 / 仅一次', () => {
  const { s, store, events } = setup({
    'reminders.custom': [
      { id: 'd', time: '12:00', text: '吃饭', repeat: 'daily', enabled: true },
      { id: 'w', time: '12:00', text: '开会', repeat: 'weekdays', enabled: true },
      { id: 'e', time: '12:00', text: '大扫除', repeat: 'weekends', enabled: true },
      { id: 'o', time: '12:00', text: '取快递', repeat: 'once', date: '2026-09-26', enabled: true },
    ],
  });
  // 2026-09-26 是周六
  s.checkCustom(at('2026-09-26T12:01:00'));
  const texts = events.map((e) => e.text).join('|');
  assert.match(texts, /吃饭/);
  assert.doesNotMatch(texts, /开会/);
  assert.match(texts, /大扫除/);
  assert.match(texts, /取快递/);
  // 同一天不重复触发；仅一次的提醒触发后自动关闭
  const n = events.length;
  s.checkCustom(at('2026-09-26T12:02:00'));
  assert.equal(events.length, n);
  assert.equal(store.get('reminders.custom').find((r) => r.id === 'o').enabled, false);
  // 超过 3 分钟就不补发
  const { s: s2, events: e2 } = setup({ 'reminders.custom': [{ id: 'd', time: '12:00', text: '吃饭', repeat: 'daily', enabled: true }] });
  s2.checkCustom(at('2026-09-28T12:05:00'));
  assert.equal(e2.length, 0);
});

test('早睡提醒：过了时间每 30 分钟最多一次', () => {
  const { s, events } = setup({ 'reminders.sleep': { enabled: true, time: '23:30' } });
  assert.equal(s.checkSleep(at('2026-09-26T23:00:00')), false);
  assert.equal(s.checkSleep(at('2026-09-26T23:40:00')), true);
  assert.equal(s.checkSleep(at('2026-09-26T23:50:00')), false);
  assert.equal(events[0].kind, 'sleep');
});

test('信件：未到日期锁着，到了解锁并通知一次', () => {
  const letters = [
    { id: 'now', title: '马上看', unlock: '', body: '你好' },
    { id: 'later', title: '以后看', unlock: '2099-01-01', body: '秘密' },
  ];
  const { s, events } = setup({}, { letters });
  const list = s.lettersState(at('2026-09-26T10:00:00'));
  assert.equal(list.find((l) => l.id === 'now').unlocked, true);
  const later = list.find((l) => l.id === 'later');
  assert.equal(later.unlocked, false);
  assert.equal(later.body, undefined, '锁着的信不能把内容发给页面');
  assert.equal(s.checkLetters(at('2026-09-26T10:00:00')), true);
  assert.equal(events[0].id, 'now');
  assert.equal(s.checkLetters(at('2026-09-26T10:05:00')), false);
});

test('饥饿提醒只在饱腹低于 30 时出现，并且间隔 90 分钟', () => {
  const { s, store, events } = setup();
  store.set('stats.fullness', 50);
  assert.equal(s.checkHunger(), false);
  store.set('stats.fullness', 20);
  assert.equal(s.checkHunger(), true);
  assert.equal(s.checkHunger(), false);
  assert.equal(events.length, 1);
});

test('勿扰模式下不提醒喝水', () => {
  const { s } = setup({ 'settings.dnd': true, 'runtime.lastWater': 0 });
  assert.equal(s.checkWater(at('2026-09-26T10:00:00')), false);
});

test('喝水提醒只在活跃时间段内', () => {
  const { s } = setup({ 'runtime.lastWater': 0, 'reminders.activeStart': '09:00', 'reminders.activeEnd': '18:00' });
  assert.equal(s.checkWater(at('2026-09-26T20:00:00')), false);
  assert.equal(s.checkWater(at('2026-09-26T10:00:00')), true);
});
