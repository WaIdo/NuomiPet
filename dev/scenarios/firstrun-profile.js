// 第一次启动：递信之后，宠物问「认识一下」，点「好呀」打开资料弹窗。
const path = require('path');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ app, pet, capture, scheduler }) => {
  scheduler.goAway = () => {};
  // 测试机没人操作，系统空闲时间会很长；假装一直有人在用
  require('electron').powerMonitor.getSystemIdleTime = () => 0;
  const log = [];
  const t0 = Date.now();
  pet.send = ((orig) => (ch, payload) => {
    if (ch === 'pet:event') log.push(`${Math.round((Date.now() - t0) / 1000)}s ${payload.type}`);
    return orig.call(pet, ch, payload);
  })(pet.send);
  const js = (c) => pet.win.webContents.executeJavaScript(c);
  // 等信递过来，先点「等会儿」
  for (let i = 0; i < 40; i++) {
    await wait(1000);
    if (await js(`!!document.querySelector('#bubble:not([hidden]) .btn')`)) break;
  }
  await js(`[...document.querySelectorAll('#bubble .btn')].find(b => b.textContent.includes('等会儿'))?.click(); 0`);
  // 等「认识一下」
  let asked = false;
  for (let i = 0; i < 90; i++) {
    await wait(1000);
    const text = await js(`document.querySelector('#bubble:not([hidden]) .text')?.textContent || ''`);
    if (text.includes('认识') || text.includes('生日')) { asked = true; break; }
  }
  log.push('asked: ' + asked);
  await capture(pet.win, path.join(out, 'fp-01-ask.png'), 'linear-gradient(#8fb6de,#c3d8ee)');
  await js(`[...document.querySelectorAll('#bubble .btn')].find(b => b.textContent.includes('好呀'))?.click(); 0`);
  await wait(3000);
  const home = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/home/'));
  log.push('home opened: ' + !!home);
  if (home) {
    log.push('profile modal: ' + (await home.webContents.executeJavaScript(`!!document.querySelector('.modal.profile-editor')`)));
    await capture(home, path.join(out, 'fp-02-home.png'));
  }
  fs.writeFileSync(path.join(out, 'fp-log.txt'), log.join('\n'));
  app.quit();
};
