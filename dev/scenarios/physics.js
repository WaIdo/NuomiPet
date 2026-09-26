// 物理场景：用假的鼠标坐标驱动拖拽、甩出、撞墙、落地；再看不同物种/尺寸下气泡和面板的位置。
const path = require('path');
const { screen } = require('electron');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ app, pet, capture, store, scheduler }) => {
  store.set('runtime.welcomed', true);
  scheduler.goAway = () => {};
  const log = [];
  const shot = (name) => capture(pet.win, path.join(out, `p-${name}.png`), 'linear-gradient(#8fb6de,#c3d8ee)');
  const js = (code) => pet.win.webContents.executeJavaScript(code);
  pet.send = ((orig) => (ch, payload) => {
    if (ch === 'motion:event' && payload.type !== 'drag') log.push(`${Date.now() % 100000} ${payload.type} ${JSON.stringify(payload)}`);
    return orig.call(pet, ch, payload);
  })(pet.send);
  await wait(3000);
  await js(`__pet.bubble.dismiss()`);
  const area = pet.currentArea();
  log.push('area ' + JSON.stringify(area) + ' pos ' + JSON.stringify(pet.pos) + ' size ' + pet.w + 'x' + pet.h + ' floor ' + pet.floorY(area));
  // 假鼠标：抓住宠物中心，往上拖再往左甩
  const real = screen.getCursorScreenPoint;
  let cur = { x: Math.round(pet.pos.x + pet.w / 2), y: Math.round(pet.pos.y + pet.h - 60) };
  screen.getCursorScreenPoint = () => ({ ...cur });
  await js(`__pet.brain.onDragStart(); 0`);
  pet.dragStart();
  for (let i = 0; i < 20; i++) { cur = { x: cur.x - 4, y: cur.y - 18 }; await wait(16); }
  await wait(300);
  await shot('01-held-high');
  for (let i = 0; i < 8; i++) { cur = { x: cur.x - 40, y: cur.y - 6 }; await wait(16); }
  await shot('02-swing');
  pet.dragEnd();
  log.push('released vx/vy ' + JSON.stringify({ x: pet.pos.x, y: pet.pos.y }));
  await wait(120);
  await shot('03-thrown');
  await wait(2500);
  await shot('04-landed');
  log.push('after land pos ' + JSON.stringify(pet.pos) + ' mode ' + pet.motion.mode);
  screen.getCursorScreenPoint = real;
  await wait(3500);
  // 走到屏幕边缘
  await js(`__pet.brain.startWalk({ dir: 1, distance: 99999, speed: 400 }); 0`);
  await wait(6000);
  log.push('after edge walk pos ' + JSON.stringify(pet.pos));
  await js(`__pet.brain.nextDir`).then((v) => log.push('nextDir ' + v));
  // 不同物种和尺寸
  for (const [sp, size, acc] of [['bunny', 'xl', 'crown'], ['chick', 's', 'partyhat'], ['hamster', 'l', 'strawberry']]) {
    store.set('pet.species', sp);
    store.set('pet.size', size);
    store.set('pet.accessory', acc);
    await wait(1200);
    pet.sendEvent({ type: 'say', text: '这是一句比较长的话，用来看看气泡在不同大小的宠物头上会不会被挡住～', mood: 'happy' });
    await wait(1600);
    await shot(`05-${sp}-${size}-bubble`);
    await js(`__pet.bubble.dismiss()`);
    await wait(500);
    await js(`__pet.panel.open('main'); 0`);
    await wait(600);
    await shot(`06-${sp}-${size}-panel`);
    await js(`__pet.panel.close()`);
    await wait(400);
  }
  require('fs').writeFileSync(path.join(out, 'physics-log.txt'), log.join('\n'));
  app.quit();
};
