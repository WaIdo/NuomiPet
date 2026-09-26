// 哄她开心：各个动作、下跪认错的完整流程、摸头原谅、生气时自动下跪。
const path = require('path');
const fs = require('fs');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ app, store, scheduler, pet, petCommand, capture, openHome }) => {
  store.set('runtime.welcomed', true);
  store.set('runtime.profileDone', true);
  store.set('owner.sender', '豪豪');
  store.set('owner.nickname', '小橘子');
  scheduler.goAway = () => {};
  const log = [];
  const js = (c) => pet.win.webContents.executeJavaScript(c);
  let n = 0;
  const shot = async (name) => capture(pet.win, path.join(out, `cx-${String(++n).padStart(2, '0')}-${name}.png`), 'linear-gradient(#8fb6de,#c3d8ee)');
  const clear = async () => { await js(`__pet.bubble.dismiss(); __pet.bubble.clearQueue(); __pet.fx.clearSigns(); __pet.brain.cancelTask(); __pet.brain.resetBody(); 0`); await wait(400); };
  const bubbleText = () => js(`document.querySelector('#bubble:not([hidden]) .text')?.textContent || ''`);
  const click = (label) => js(`(() => { const b = [...document.querySelectorAll('#bubble .btn')].find((x) => x.textContent.includes(${JSON.stringify(label)})); if (!b) return 'missing'; b.click(); return 'ok'; })()`);
  await wait(2500);
  await js(`__pet.brain.scheduleIdle = () => {}; clearTimeout(__pet.brain.idleTimer); 0`);
  await clear();

  for (const kind of ['bow', 'flower', 'heart', 'hug', 'kiss', 'tea', 'cute', 'roll', 'dance', 'praise']) {
    petCommand({ type: 'coax', kind });
    await wait(kind === 'hug' ? 1400 : kind === 'roll' ? 700 : 900);
    await shot(kind);
    log.push(`${kind}: task=${await js(`__pet.brain.task?.name || '-'`)} text=${await bubbleText()}`);
    await wait(3200);
    await clear();
  }

  // 下跪：哼 → 再跪 → 哼 → 送花奶茶再跪 → 原谅
  petCommand({ type: 'coax', kind: 'kneel' });
  await wait(1600);
  await shot('kneel-1');
  log.push('kneel1: ' + (await bubbleText()));
  const r = await js(`__pet.brain.poke(); __pet.brain.task?.name`);
  log.push('poke while kneeling keeps task: ' + r);
  await wait(4500);
  log.push('ask: ' + (await bubbleText()) + ' click=' + (await click('哼')));
  await wait(1800);
  await shot('kneel-2');
  log.push('kneel2: ' + (await bubbleText()));
  await wait(4500);
  log.push('click=' + (await click('哼')));
  await wait(2500);
  await shot('kneel-3-gift');
  await wait(8000);
  await shot('kneel-3');
  for (let i = 0; i < 20 && !(await js(`!!document.querySelector('#bubble:not([hidden]) .btn.primary')`)); i++) await wait(500);
  log.push('click=' + (await click('原谅你啦')));
  await wait(700);
  await shot('forgiven');
  log.push('forgiven: ' + (await bubbleText()));
  await wait(3500);
  await clear();

  // 摸摸头 = 原谅
  petCommand({ type: 'coax', kind: 'kneel' });
  await wait(1200);
  const wc = pet.win.webContents;
  const cx = Math.round(pet.w / 2);
  const hy = Math.round(pet.h - pet.petSize * 0.7);
  for (let i = 0; i < 16; i++) { wc.sendInputEvent({ type: 'mouseMove', x: cx + (i % 2 ? 30 : -30), y: hy }); await wait(40); }
  await wait(600);
  log.push('after stroking kneeling pet: task=' + (await js(`__pet.brain.task?.name || '-'`)) + ' text=' + (await bubbleText()));
  await wait(3500);
  await clear();

  // 心情选「生气」→ 自动跪下（替豪豪认错）
  pet.sendEvent({ type: 'mood-recorded', mood: 'angry', text: '谁惹你生气啦！' });
  await wait(1500);
  await shot('mood-angry');
  log.push('angry: task=' + (await js(`__pet.brain.task?.name || '-'`)) + ' text=' + (await bubbleText()));
  await wait(6000);
  await clear();

  // 心情选「难过」→ 抱抱再送花，回应她的那句话不被打断
  pet.sendEvent({ type: 'mood-recorded', mood: 'sad', text: '抱抱你，想哭也没关系' });
  await wait(3800);
  log.push('sad @3.8s: task=' + (await js(`__pet.brain.task?.name || '-'`)) + ' text=' + (await bubbleText()));
  await wait(3500);
  await clear();

  // 第三轮送礼物的时候她去喂食了 → 不再接着递奶茶、下跪
  store.set('stats.fullness', 40);
  js(`__pet.brain.kneel({ reason: 'menu', round: 3 }); 0`);
  await wait(1000);
  petCommand({ type: 'feed', food: 'strawberry' });
  await wait(600);
  log.push('gift then feed: task=' + (await js(`__pet.brain.task?.name || '-'`)));
  await wait(7000);
  log.push('gift then feed @7.6s: task=' + (await js(`__pet.brain.task?.name || '-'`)) + ' signs=' + (await js(`document.querySelectorAll('.fx-sign').length`)));
  await clear();

  // 快捷面板
  await js(`__pet.panel.open('coax'); 0`);
  await wait(600);
  await shot('panel-coax');
  await js(`__pet.panel.close(); 0`);

  // 小窝首页的「哄哄我」
  store.set('runtime.profileDone', true);
  const home = openHome('overview');
  await wait(2500);
  const hr = await home.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('哄哄我')); if (!b) return 'missing'; b.click(); return 'ok'; })()`);
  await wait(600);
  await capture(home, path.join(out, `cx-${String(++n).padStart(2, '0')}-home-popover.png`));
  log.push('home coax button: ' + hr);
  const pick = await home.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.pop-food .food')].find(x => x.textContent.includes('比心')); if (!b) return 'missing'; b.click(); return 'ok'; })()`);
  await wait(900);
  log.push('home pick 比心: ' + pick + ' pet task=' + (await js(`__pet.brain.task?.name || '-'`)));
  fs.writeFileSync(path.join(out, 'coax-log.txt'), log.join('\n'));
  app.quit();
};
