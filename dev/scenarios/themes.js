// 逐个切换「小窝的颜色」，截小窝首页、设置页、信箱，以及桌宠的气泡和快捷面板。
const path = require('path');
const fs = require('fs');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const themes = require('../../src/shared/themes.json');

module.exports = async ({ app, store, scheduler, openHome, pet, capture }) => {
  store.set('runtime.welcomed', true);
  store.set('runtime.profileDone', true);
  store.set('owner.nickname', '宝贝');
  store.set('love.togetherSince', '2025-08-10');
  store.set('stats.counters', { pets: 128, feeds: 36, plays: 21, waters: 87, pomodoros: 14, todos: 42 });
  scheduler.goAway = () => {};
  const home = openHome('overview');
  await wait(2500);
  const pjs = (c) => pet.win.webContents.executeJavaScript(c);
  const files = [];
  for (const t of [...themes.map((x) => x.id), 'auto']) {
    store.set('settings.theme', t);
    if (t === 'auto') store.set('pet.color', 'mint');
    home.webContents.send('home:navigate', 'overview');
    await wait(900);
    const a = path.join(out, `th-${t}-overview.png`);
    await capture(home, a);
    home.webContents.send('home:navigate', 'settings');
    await wait(900);
    const b = path.join(out, `th-${t}-settings.png`);
    await capture(home, b);
    await pjs(`__pet.bubble.dismiss(); __pet.panel.close(); 0`);
    pet.sendEvent({ type: 'remind', kind: 'water', id: 'water', text: '喝水时间到啦！💧 咕噜咕噜～' });
    await wait(1200);
    const c = path.join(out, `th-${t}-bubble.png`);
    await capture(pet.win, c, 'linear-gradient(#8fb6de,#c3d8ee)');
    await pjs(`__pet.bubble.dismiss(); __pet.panel.open('main'); 0`);
    await wait(700);
    const d = path.join(out, `th-${t}-panel.png`);
    await capture(pet.win, d, 'linear-gradient(#8fb6de,#c3d8ee)');
    await pjs(`__pet.panel.close(); 0`);
    files.push(a, b, c, d);
  }
  fs.writeFileSync(path.join(out, 'themes-files.txt'), files.join(','));
  app.quit();
};
