// 动作场景：走路、摔落、落地、眩晕、快捷面板、番茄钟、戳一戳。
const path = require('path');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ app, pet, capture, petCommand, store, scheduler, pomodoro }) => {
  store.set('runtime.welcomed', true);
  scheduler.goAway = () => {};
  const shot = (name) => capture(pet.win, path.join(out, `m-${name}.png`), 'linear-gradient(#8fb6de,#c3d8ee)');
  const js = (code) => pet.win.webContents.executeJavaScript(code);
  await wait(3500);
  await js(`__pet.bubble.dismiss()`);
  // 走路
  await js(`__pet.brain.startWalk({ dir: -1, distance: 200, speed: 60 })`);
  await wait(700);
  await shot('01-walk-left');
  await wait(3500);
  // 抛出去：直接启动下落物理
  await js(`__pet.brain.onDragStart()`);
  await wait(300);
  await js(`__pet.brain.tiltTarget = 25`);
  await wait(250);
  await shot('02-dangle');
  await wait(900);
  await shot('03-dangle-later');
  pet.pos.y -= 300; pet.applyBounds();
  pet.startFall(900, -600);
  await wait(250);
  await shot('04-falling');
  await wait(1200);
  await shot('05-landed');
  await wait(3000);
  // 快捷面板
  await js(`__pet.brain.onDoubleClick()`);
  await wait(700);
  await shot('06-panel');
  await js(`__pet.panel.open('food')`);
  await wait(500);
  await shot('07-panel-food');
  await js(`__pet.panel.open('mood')`);
  await wait(500);
  await shot('08-panel-mood');
  await js(`__pet.panel.close()`);
  // 番茄钟
  pomodoro.start();
  await wait(1500);
  await shot('09-focus');
  await js(`__pet.panel.open('focus')`);
  await wait(600);
  await shot('10-panel-focus');
  await js(`__pet.panel.close()`);
  pomodoro.stop();
  await wait(1000);
  // 戳一戳 & 摸摸
  for (let i = 0; i < 4; i++) {
    await js(`__pet.brain.poke()`);
    await wait(420);
    await shot(`11-poke-${i}`);
    await wait(1400);
  }
  await js(`__pet.brain.petted()`);
  await wait(600);
  await shot('12-petted');
  await wait(2500);
  pet.sendEvent({ type: 'remind', kind: 'stretch', id: 'stretch', text: '坐太久啦，起来伸个懒腰吧～' });
  await wait(1200);
  await shot('13-stretch');
  await wait(3000);
  await js(`__pet.bubble.dismiss()`);
  pet.sendEvent({ type: 'remind', kind: 'eyes', id: 'eyes', text: '看看远处吧，让眼睛休息 20 秒👀' });
  await wait(1200);
  await shot('14-eyes');
  await wait(3000);
  await js(`__pet.bubble.dismiss()`);
  pet.sendEvent({ type: 'hungry', text: '肚子咕咕叫了……' });
  await wait(1000);
  await shot('15-hungry');
  await wait(2000);
  await js(`__pet.bubble.dismiss()`);
  await js(`__pet.brain.idleThink()`);
  await wait(700);
  await shot('16-think');
  await wait(2500);
  store.set('pet.species', 'bunny'); store.set('pet.color', 'sakura'); store.set('pet.accessory', 'flower'); store.set('pet.size', 'l');
  await wait(1500);
  await js(`__pet.brain.play()`);
  await wait(1300);
  await shot('17-play-bunny-large');
  await wait(4000);
  app.quit();
};
