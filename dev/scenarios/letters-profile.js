// 资料弹窗 + 写信 + 导出导入（对话框用假的替代）
const path = require('path');
const fs = require('fs');
const { dialog } = require('electron');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ app, store, scheduler, openHome, capture }) => {
  store.set('runtime.welcomed', true);
  scheduler.goAway = () => {};
  const log = [];
  const shot = (win, name) => capture(win, path.join(out, `lp-${name}.png`));
  const home = openHome('overview');
  const js = (c) => home.webContents.executeJavaScript(c);
  await wait(2500);
  await shot(home, '01-profile-first');
  // 填资料：名字、昵称、生日（年/月/日下拉）
  await js(`(() => {
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    const inputs = document.querySelectorAll('.pf-form input');
    set(inputs[0], '团子'); set(inputs[1], '小橘子'); set(inputs[2], '豪豪');
    const sel = document.querySelectorAll('.pf-form select');
    const pick = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    pick(sel[0], '1999'); 
    return sel.length;
  })()`).then((n) => log.push('selects in profile: ' + n));
  await wait(200);
  await js(`(() => { const sel = document.querySelectorAll('.pf-form select'); const pick = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }; pick(sel[1], '3'); })()`);
  await wait(200);
  await js(`(() => { const sel = document.querySelectorAll('.pf-form select'); const pick = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }; pick(sel[2], '21'); })()`);
  await wait(300);
  await shot(home, '02-profile-filled');
  await js(`document.querySelector('.modal .btn.primary').click(); 0`);
  await wait(1500);
  log.push('after profile: ' + JSON.stringify({ name: store.get('pet.name'), nick: store.get('owner.nickname'), sender: store.get('owner.sender'), birthday: store.get('love.birthday'), done: store.get('runtime.profileDone') }));

  // 写信
  home.webContents.send('home:navigate', 'letters');
  await wait(1200);
  await js(`[...document.querySelectorAll('.page-head .btn')].find(b => b.textContent.includes('写一封信')).click(); 0`);
  await wait(700);
  await shot(home, '03-editor-empty');
  // 空正文点封好：应该被拦下
  await js(`document.querySelector('.modal .btn.primary').click(); 0`);
  await wait(400);
  log.push('modal still open after empty submit: ' + (await js(`!!document.querySelector('.modal.letter-editor')`)));
  await js(`(() => {
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    const f = document.querySelector('.le-form');
    set(f.querySelector('input'), '一周年快乐');
    set(f.querySelector('textarea'), '第一行\\n谢谢你一直在我身边。');
  })()`);
  await wait(300);
  await shot(home, '04-editor-filled');
  await js(`document.querySelector('.modal .btn.primary').click(); 0`);
  await wait(1500);
  const custom = store.get('letters.custom');
  log.push('custom letters: ' + JSON.stringify(custom.map((l) => ({ title: l.title, unlock: l.unlock, from: l.from, body: l.body.length }))));
  await shot(home, '05-letters-grid');
  const list = scheduler.lettersState();
  const mine = list.find((l) => l.mine);
  log.push('sealed body hidden: ' + (mine.unlocked ? 'unlocked' : mine.body === undefined));
  // ··· 菜单
  await js(`(() => { const b = document.querySelector('.lc-more'); b.style.opacity = 1; b.click(); })()`);
  await wait(500);
  await shot(home, '06-letter-menu');
  await js(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 0`);

  // 导出 / 导入
  const file = path.join(out, 'letters-export.json');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  const ex = await js(`window.mochi.letters.exportFile()`);
  log.push('export: ' + JSON.stringify(ex) + ' plaintext-in-file: ' + fs.readFileSync(file, 'utf8').includes('谢谢你'));
  store.set('letters.custom', []);
  const im = await js(`window.mochi.letters.importFile()`);
  log.push('import: ' + JSON.stringify(im) + ' body restored: ' + (store.get('letters.custom')[0]?.body === custom[0].body));

  // 设置页资料卡
  home.webContents.send('home:navigate', 'settings');
  await wait(1200);
  await shot(home, '07-settings-profile');
  fs.writeFileSync(path.join(out, 'lp-log.txt'), log.join('\n'));
  app.quit();
};
