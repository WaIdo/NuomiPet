// 右键菜单和托盘菜单：逐项点击，检查效果（退出、开机启动用假函数）
const path = require('path');
const fs = require('fs');
const { app: electronApp, BrowserWindow } = require('electron');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const menus = require('../../src/main/menus');

module.exports = async ({ app, store, scheduler, pet, pomodoro, openHome, petCommand }) => {
  store.set('runtime.welcomed', true);
  scheduler.goAway = () => {};
  const log = [];
  const realQuit = electronApp.quit.bind(electronApp);
  let quitCalls = 0;
  electronApp.quit = () => quitCalls++;
  const commands = [];
  const cmd = (c) => { commands.push(c.type + (c.food ? ':' + c.food : '')); petCommand(c); };
  let loginCalls = [];
  const setLoginItem = (on) => loginCalls.push(on);
  await wait(2500);

  const walk = async (menu, prefix, filter) => {
    for (const item of menu.items) {
      if (item.type === 'separator' || !item.enabled) continue;
      const label = prefix + (item.label || item.role || '').trim();
      if (item.submenu) {
        await walk(item.submenu, label + ' > ', filter);
        continue;
      }
      if (filter && !filter(label)) continue;
      const before = JSON.stringify({ s: store.get('settings'), size: store.get('pet.size'), vis: pet.isVisible(), pomo: pomodoro.snapshot().phase });
      try {
        item.click(item, undefined, {});
        await wait(250);
        const after = JSON.stringify({ s: store.get('settings'), size: store.get('pet.size'), vis: pet.isVisible(), pomo: pomodoro.snapshot().phase });
        log.push(`OK   ${label}${before !== after ? '  (状态变了)' : ''}`);
      } catch (err) {
        log.push(`FAIL ${label}: ${err.message}`);
      }
    }
  };

  log.push('--- 右键菜单 ---');
  const pm = menus.petMenu({ store, pet, pomodoro, openHome, petCommand: cmd, state: { sleeping: false } });
  await walk(pm, '', (l) => !l.includes('藏起来') && !l.includes('退出'));
  log.push('commands sent: ' + commands.join(', '));
  // 番茄钟子菜单在运行时的样子
  const pm2 = menus.petMenu({ store, pet, pomodoro, openHome, petCommand: cmd, state: { sleeping: true } });
  log.push('pomodoro submenu while running: ' + pm2.items.find((i) => i.label.includes('番茄钟')).submenu.items.map((i) => i.label).join(' / '));
  log.push('sleep item when sleeping: ' + pm2.items.find((i) => i.label.includes('起床') || i.label.includes('睡觉')).label);
  pomodoro.stop();
  // 藏起来 / 退出
  pm.items.find((i) => i.label.includes('藏起来')).click();
  await wait(300);
  log.push('after 藏起来 visible=' + pet.isVisible());
  log.push('--- 托盘菜单 ---');
  const tm = menus.trayMenu({ store, pet, pomodoro, openHome, petCommand: cmd, setLoginItem });
  await walk(tm, '', (l) => !l.includes('退出'));
  log.push('visible after tray walk=' + pet.isVisible() + ' loginCalls=' + JSON.stringify(loginCalls));
  tm.items.find((i) => i.label === '退出').click();
  pm.items.find((i) => i.label === '退出').click();
  log.push('quit calls=' + quitCalls);
  log.push('windows: ' + BrowserWindow.getAllWindows().map((w) => w.getTitle()).join(', '));
  fs.writeFileSync(path.join(out, 'menus.txt'), log.join('\n'));
  realQuit();
};
