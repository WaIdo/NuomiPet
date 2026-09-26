// 第一次启动：从天而降、打招呼、递信、打开信件、打开小窝。
const path = require('path');
const { BrowserWindow } = require('electron');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ app, pet, capture, scheduler, openHome }) => {
  scheduler.goAway = () => {};
  const bg = 'linear-gradient(#8fb6de,#c3d8ee)';
  const shot = (win, name, background = bg) => capture(win, path.join(out, `fr-${name}.png`), background);
  const log = [];
  const t0 = Date.now();
  pet.send = ((orig) => (ch, payload) => {
    if (ch === 'pet:event' || (ch === 'motion:event' && payload.type !== 'drag')) log.push(`${Date.now() - t0}ms ${ch} ${payload.type}`);
    return orig.call(pet, ch, payload);
  })(pet.send);
  await shot(pet.win, '01-start');
  await wait(1500);
  await shot(pet.win, '02-hello');
  await wait(15000);
  await shot(pet.win, '03-letter-prompt');
  await pet.win.webContents.executeJavaScript(`document.querySelector('#bubble .btn.primary')?.click(); 0`);
  await wait(2500);
  const letterWin = BrowserWindow.getAllWindows().find((w) => w.getTitle() === '一封信' || w.webContents.getURL().includes('letter'));
  log.push('letter window: ' + !!letterWin);
  if (letterWin) {
    await shot(letterWin, '04-letter-closed', 'linear-gradient(135deg,#a8c8e8,#e8d0e8)');
    await letterWin.webContents.executeJavaScript(`(document.querySelector('.envelope, #envelope, [data-open], .open-btn, button') || document.body).click(); 0`);
    await wait(3000);
    await shot(letterWin, '05-letter-open', 'linear-gradient(135deg,#a8c8e8,#e8d0e8)');
    letterWin.close();
  }
  const home = openHome('overview');
  await wait(2500);
  await shot(home, '06-home', '');
  require('fs').writeFileSync(path.join(out, 'firstrun.txt'), log.join('\n'));
  app.quit();
};
