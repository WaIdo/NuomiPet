// 逐个触发主进程发给宠物的事件和命令，每个截一张图。
const path = require('path');
const fs = require('fs');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ app, store, scheduler, pet, petCommand, capture, bumpStats }) => {
  store.set('runtime.welcomed', true);
  store.set('runtime.profileDone', true);
  store.set('owner.sender', '阿杰');
  store.set('love.notes', [{ id: 'n1', text: '今天也要好好吃饭' }]);
  scheduler.goAway = () => {};
  const js = (c) => pet.win.webContents.executeJavaScript(c);
  const shots = [];
  const shot = async (name) => {
    const f = path.join(out, `ev-${String(shots.length + 1).padStart(2, '0')}-${name}.png`);
    await capture(pet.win, f, 'linear-gradient(#8fb6de,#c3d8ee)');
    shots.push(f);
  };
  const clear = () => js(`__pet.bubble.dismiss(); __pet.bubble.clearQueue(); __pet.brain.cancelTask(); __pet.brain.resetBody(); 0`);
  await wait(2500);
  await js(`__pet.brain.scheduleIdle = () => {}; clearTimeout(__pet.brain.idleTimer); 0`);
  await clear();
  const events = [
    ['greet', { type: 'greet', period: 'morning', text: '早安呀～今天也是元气满满的一天！☀️' }],
    ['weather', { type: 'weather', text: '🌧️ 今天上海小雨，18~23°C。可能会下雨，出门记得带伞☂️', emoji: '🌧️' }],
    ['remind-custom', { type: 'remind', kind: 'custom', id: 'r1', text: '⏰ 21:30 敷面膜' }],
    ['remind-sleep', { type: 'remind', kind: 'sleep', id: 'sleep', text: '很晚啦，该睡觉觉了🌙' }],
    ['hungry', { type: 'hungry', text: '肚子咕咕叫了……' }],
    ['levelup', { type: 'levelup', level: 3, title: '好朋友', text: '我们的亲密度升到 Lv.3 啦！「好朋友」💕' }],
    ['festival', { type: 'celebrate', reason: 'festival', text: '七夕快乐💕 阿杰让我告诉你：我爱你' }],
    ['focus-done', { type: 'focus-done', text: '专注完成！休息一下吧～🍅' }],
    ['break-start', { type: 'break-start', phase: 'short', text: '休息一下，活动活动～' }],
    ['break-done', { type: 'break-done', text: '休息结束啦，准备好继续了吗？' }],
    ['profile-ask', { type: 'profile-ask', text: '我们来认识一下吧？告诉我怎么称呼你、你的生日，我都会记住的～' }],
  ];
  for (const [name, evt] of events) {
    pet.sendEvent(evt);
    await wait(1100);
    await shot(name);
    await wait(900);
    await clear();
    await wait(300);
  }
  // 离开 → 睡着；回来 → 醒来打招呼
  pet.sendEvent({ type: 'away' });
  await wait(3500);
  await shot('away-sleep');
  pet.sendEvent({ type: 'back', minutes: 25, text: '你回来啦！糯米好想你～' });
  await wait(2600);
  await shot('back');
  await clear();
  // 命令
  for (const [name, cmd] of [['cmd-celebrate', { type: 'celebrate', text: '🎉🎉🎉' }], ['cmd-cheer', { type: 'cheer' }], ['cmd-pet', { type: 'pet' }]]) {
    petCommand(cmd);
    await wait(800);
    await shot(name);
    await wait(1500);
    await clear();
  }
  // 空闲小动作：逐个调用
  const idle = ['idleLookAround', 'idleTwitch', 'idleThink', 'idleYawn', 'idleStretch', 'idleHop', 'idleSpin', 'idleHungry', 'idleWave'];
  const idleResults = [];
  for (const f of idle) {
    const r = await js(`(async () => { try { __pet.brain.cursor = { dx: 80, dy: -40, at: Date.now() }; const p = __pet.brain.${f}(); await new Promise(r => setTimeout(r, 500)); return 'ok ' + (__pet.brain.task?.name || '-'); } catch (e) { return 'ERR ' + e.message; } })()`);
    idleResults.push(`${f}: ${r}`);
    await wait(2800);
  }
  // 闲聊内容
  const chats = [];
  for (let i = 0; i < 12; i++) chats.push(await js(`__pet.brain.pickChatter()`));
  // 升级：亲密度跨过门槛
  store.set('stats.xp', 29);
  const sent = [];
  const orig = pet.sendEvent.bind(pet);
  pet.sendEvent = (e) => { sent.push(e.type); orig(e); };
  bumpStats({ xp: 2 });
  await wait(1500);
  await shot('levelup-real');
  fs.writeFileSync(path.join(out, 'events.txt'), ['idle:', ...idleResults, 'chatter samples:', ...chats, 'events after xp bump: ' + sent.join(',')].join('\n'));
  fs.writeFileSync(path.join(out, 'events-files.txt'), shots.join(','));
  app.quit();
};
