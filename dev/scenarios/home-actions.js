// 小窝各页面的主要操作：在真实主进程里点一遍，检查数据有没有写进去。
const path = require('path');
const fs = require('fs');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const C = require('../../src/shared/common');

module.exports = async ({ app, store, scheduler, openHome, pomodoro, pet }) => {
  store.set('runtime.welcomed', true);
  store.set('runtime.profileDone', true);
  scheduler.goAway = () => {};
  const log = [];
  const check = (name, ok, extra = '') => log.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`);
  const home = openHome('overview');
  const js = (c) => home.webContents.executeJavaScript(c);
  const nav = async (p) => { home.webContents.send('home:navigate', p); await wait(900); };
  await wait(2500);
  await js(`window.__t = {
    byText(sel, text) { return [...document.querySelectorAll(sel)].find(e => e.textContent.includes(text)); },
    click(sel, text) { const e = text ? this.byText(sel, text) : document.querySelector(sel); if (!e) return 'missing ' + sel + ' ' + (text||''); e.click(); return 'ok'; },
    type(sel, v) { const e = document.querySelector(sel); if (!e) return 'missing ' + sel; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; },
    pick(el, v) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); },
  }; 0`);
  const today = C.dateKey();

  // 首页：+1 杯水、心情打卡
  let before = store.get('stats.daily.water') || 0;
  let r = await js(`__t.click('button', '+1 杯')`);
  await wait(500);
  check('首页 +1 杯水', r === 'ok' && (store.get('stats.daily.water') || 0) === before + 1, r);
  r = await js(`__t.click('.mood-pick .mp')`);
  await wait(700);
  check('首页心情打卡', r === 'ok' && !!store.get('moods')[today], r);

  // 装扮
  await nav('dress');
  r = await js(`__t.click('.opt[title="兔兔"]')`);
  await wait(400);
  check('装扮：物种', store.get('pet.species') === 'bunny', r);
  r = await js(`__t.click('.swatch[title="樱花粉"]')`);
  await wait(400);
  check('装扮：配色', store.get('pet.color') === 'sakura', r);
  r = await js(`__t.click('.opt[title="小皇冠"]')`);
  await wait(400);
  check('装扮：配饰', store.get('pet.accessory') === 'crown', r);
  r = await js(`__t.click('.seg-opt', '大只')`);
  await wait(400);
  check('装扮：大小', store.get('pet.size') === 'l', r);
  r = await js(`(() => { const i = document.querySelector('.name-row .input, .page-dress input'); i.value = '小团团'; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); i.blur(); return 'ok'; })()`);
  await wait(500);
  check('装扮：改名字', store.get('pet.name') === '小团团', r + ' name=' + store.get('pet.name'));

  // 提醒
  await nav('reminders');
  const waterBefore = store.get('reminders.water.enabled');
  r = await js(`__t.click('.toggle')`);
  await wait(400);
  check('提醒：喝水开关', store.get('reminders.water.enabled') === !waterBefore, r);
  r = await js(`__t.type('input[name="cr-text"]', '测试提醒：吃药')`);
  r += ' ' + (await js(`__t.click('button', '添加提醒')`));
  await wait(500);
  check('提醒：添加自定义提醒', (store.get('reminders.custom') || []).some((x) => x.text === '测试提醒：吃药'), r);

  // 专注
  await nav('focus');
  r = await js(`__t.click('button', '开始专注')`);
  await wait(800);
  check('专注：开始', pomodoro.snapshot().phase === 'focus', r);
  r = await js(`__t.click('button', '暂停')`);
  await wait(600);
  check('专注：暂停', pomodoro.snapshot().paused === true, r);
  r = await js(`__t.click('button', '结束')`);
  await wait(600);
  check('专注：结束', pomodoro.snapshot().phase === 'idle', r);

  // 待办
  await nav('todos');
  r = await js(`__t.type('.todo-add input', '测试待办')`);
  r += ' ' + (await js(`__t.click('.todo-add .btn')`));
  await wait(500);
  const todo = (store.get('todos') || []).find((t) => t.text === '测试待办');
  check('待办：添加', !!todo, r);
  const xpBefore = store.get('stats.xp');
  r = await js(`__t.click('.todo-check')`);
  await wait(700);
  const todoAfter = (store.get('todos') || []).find((t) => t.text === '测试待办');
  check('待办：完成（加亲密度）', !!todoAfter?.done && store.get('stats.xp') > xpBefore, r);

  // 纪念日
  await nav('love');
  r = await js(`__t.type('input[name="an-name"]', '测试纪念日')`);
  const sels = `document.querySelectorAll('.an-add .datepick select')`;
  await js(`(() => { const s = ${sels}; __t.pick(s[0], '2024'); })()`);
  await wait(200);
  await js(`(() => { const s = ${sels}; __t.pick(s[1], '5'); })()`);
  await wait(200);
  await js(`(() => { const s = ${sels}; __t.pick(s[2], '20'); })()`);
  await wait(200);
  r += ' ' + (await js(`__t.click('.an-add .btn', '添加')`));
  await wait(500);
  check('纪念日：添加', (store.get('love.anniversaries') || []).some((a) => a.name === '测试纪念日' && a.date === '2024-05-20'), r);

  // 悄悄话
  await nav('notes');
  r = await js(`__t.type('.note-add textarea', '测试悄悄话')`);
  r += ' ' + (await js(`__t.click('.note-add .btn', '添加')`));
  await wait(500);
  check('悄悄话：添加', (store.get('love.notes') || []).some((n) => n.text === '测试悄悄话'), r);
  r = await js(`__t.click('button', '让TA说')`);
  await wait(1500);
  const said = await pet.win.webContents.executeJavaScript(`document.querySelector('#bubble .text')?.textContent || ''`);
  check('悄悄话：让TA说', said.length > 0, JSON.stringify(said));

  // 心情页
  await nav('moods');
  check('心情页：今天已有记录显示', (await js(`document.querySelector('.page-moods') ? 'ok' : 'missing'`)) === 'ok');

  // 设置
  await nav('settings');
  const fm = store.get('settings.followMouse');
  r = await js(`(() => { const row = __t.byText('.set-row', '跟着鼠标走'); row.querySelector('.toggle').click(); return 'ok'; })()`);
  await wait(400);
  check('设置：跟着鼠标走', store.get('settings.followMouse') === !fm, r);
  r = await js(`(() => { const row = __t.byText('.set-row', '跟着鼠标走'); row.querySelector('.toggle').click(); return 'ok'; })()`);
  await wait(300);
  r = await js(`(() => { const box = document.querySelector('.city-search'); if (!box) return 'missing city-search'; const i = box.querySelector('input'); i.value = '上海'; i.dispatchEvent(new Event('input', {bubbles:true})); const b = box.querySelector('button'); b.click(); return 'ok'; })()`);
  await wait(4000);
  r += ' ' + (await js(`(() => { const b = document.querySelector('.cs-results .cs-item'); if (!b) return 'no results'; b.click(); return 'ok'; })()`));
  await wait(1500);
  check('设置：天气城市', store.get('weather.enabled') === true && store.get('weather.lat') != null, r + ' city=' + store.get('weather.city'));

  // 桌宠有没有跟着变
  await wait(600);
  const look = await pet.win.webContents.executeJavaScript(`__pet.view.look`);
  check('桌宠跟着换装', look.species === 'bunny' && look.color === 'sakura', JSON.stringify(look));
  const layout = pet.layoutInfo();
  check('桌宠跟着变大', layout.petSize === 180, 'petSize=' + layout.petSize);

  fs.writeFileSync(path.join(out, 'home-actions.txt'), log.join('\n'));
  app.quit();
};
