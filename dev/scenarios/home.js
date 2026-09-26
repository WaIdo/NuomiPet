// 小窝：用真实主进程逐页截图（先填一些数据）。
const path = require('path');
const { BrowserWindow } = require('electron');
const out = process.env.SNAP_DIR || '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const C = require('../../src/shared/common');

module.exports = async ({ app, store, scheduler, openHome, capture, pomodoro }) => {
  store.set('runtime.welcomed', true);
  scheduler.goAway = () => {};
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return C.dateKey(d); };
  store.set('owner.nickname', '小橘子');
  store.set('owner.sender', '阿杰');
  store.set('love.togetherSince', day(-412));
  store.set('love.birthday', '1999-' + day(12).slice(5));
  store.set('love.anniversaries', [
    { id: 'a1', name: '第一次约会', date: day(-380).replace(/^\d{4}/, '2024'), kind: 'yearly' },
    { id: 'a2', name: '一起去看海', date: day(26), kind: 'countdown' },
    { id: 'a3', name: '养了小猫', date: day(-230), kind: 'since' },
  ]);
  store.set('todos', [
    { id: 't1', text: '交周报', done: true, createdAt: Date.now() - 86400000, doneAt: Date.now() - 3600000 },
    { id: 't2', text: '给妈妈打电话', done: false, createdAt: Date.now() - 7200000, doneAt: null },
    { id: 't3', text: '买猫粮和草莓', done: false, createdAt: Date.now() - 3600000, doneAt: null },
  ]);
  store.set('reminders.custom', [
    { id: 'r1', time: '12:00', text: '吃午饭，不许只喝奶茶', repeat: 'daily', enabled: true },
    { id: 'r2', time: '21:30', text: '护肤 + 敷面膜', repeat: 'daily', enabled: true },
    { id: 'r3', time: '09:30', text: '组会', repeat: 'weekdays', enabled: false },
  ]);
  const moods = {};
  const ids = ['great', 'good', 'calm', 'tired', 'good', 'sad', 'good', 'great', 'calm', 'angry', 'good'];
  for (let i = 1; i <= 11; i++) moods[day(-i)] = { mood: ids[i - 1], note: '', at: Date.now() };
  store.set('moods', moods);
  store.set('stats.xp', 150);
  store.set('stats.daily', { date: C.dateKey(), water: 3, pomodoros: 2, focusMinutes: 50, pets: 8, feeds: 1 });

  const shot = (win, name) => capture(win, path.join(out, `h-${name}.png`));
  const home = openHome('overview');
  await wait(3000);
  const pages = ['overview', 'dress', 'reminders', 'focus', 'todos', 'love', 'letters', 'moods', 'notes', 'settings'];
  for (const p of pages) {
    home.webContents.send('home:navigate', p);
    await wait(1300);
    await shot(home, `${p}`);
  }
  // 最小宽度
  home.setSize(860, 600);
  await wait(800);
  for (const p of ['overview', 'dress', 'love', 'moods', 'settings']) {
    home.webContents.send('home:navigate', p);
    await wait(1100);
    await shot(home, `${p}-860`);
  }
  // 番茄钟运行中
  home.setSize(980, 680);
  pomodoro.start();
  home.webContents.send('home:navigate', 'focus');
  await wait(2500);
  await shot(home, 'focus-running');
  pomodoro.stop();
  // 信件窗口
  const { openLetter } = require('../../src/main/windows');
  const letter = openLetter('hello');
  await wait(2500);
  await capture(letter, path.join(out, 'h-letter-1.png'), 'linear-gradient(135deg,#a8c8e8,#e8d0e8)');
  await letter.webContents.executeJavaScript(`(document.querySelector('[data-action=open], .envelope, .open, button') || document.body).click(); 0`);
  await wait(3500);
  await capture(letter, path.join(out, 'h-letter-2.png'), 'linear-gradient(135deg,#a8c8e8,#e8d0e8)');
  const errs = await home.webContents.executeJavaScript('window.__errors || []').catch(() => []);
  require('fs').writeFileSync(path.join(out, 'home-log.txt'), JSON.stringify({ errs, windows: BrowserWindow.getAllWindows().map((w) => w.getTitle()) }));
  app.quit();
};
