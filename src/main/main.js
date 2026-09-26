// 应用入口：数据、桌宠窗口、托盘、定时事件、番茄钟和所有 IPC。
const { app, BrowserWindow, ipcMain, Tray, nativeImage, dialog, screen, Menu, Notification, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const { createDefaults } = require('./defaults');
const { loadGift } = require('./gift');
const { PetWindow } = require('./petWindow');
const windows = require('./windows');
const menus = require('./menus');
const { Scheduler } = require('./scheduler');
const { Pomodoro } = require('./pomodoro');
const weather = require('./weather');
const letters = require('./letters');
const C = require('../shared/common');
const catalog = require('../shared/catalog.json');
const phrases = require('../shared/phrases.json');

const isMac = process.platform === 'darwin';

// 开发/测试用：--data-dir=目录 使用独立的数据目录；--dev-script=文件 启动后运行测试脚本
const argValue = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
if (!app.isPackaged && argValue('data-dir')) app.setPath('userData', path.resolve(argValue('data-dir')));

let store;
let gift;
let pet;
let scheduler;
let pomodoro;
let tray;
let greeted = false;

const petName = () => store?.get('pet.name') || '糯米';

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (process.platform === 'win32') app.setAppUserModelId('com.mochi.desktoppet');

  app.on('second-instance', () => {
    if (!pet) return;
    pet.show();
    windows.openHome('overview', petName());
  });
  // 在访达/启动台里再次打开应用：把宠物叫出来并打开小窝
  app.on('activate', () => {
    if (!pet) return;
    pet.show();
    windows.openHome('overview', petName());
  });
  app.on('window-all-closed', () => {
    // 托盘应用：窗口都关了也不退出
  });
  app.on('before-quit', () => store?.saveNow());

  app.whenReady().then(init);
}

// 开发时把渲染进程的报错打印到终端
function debugConsole(contents) {
  if (app.isPackaged) return;
  contents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.log(`[renderer:${e.level}] ${e.message} (${path.basename(e.sourceId || '')}:${e.lineNumber})`);
  });
  contents.on('preload-error', (_e, p, err) => console.log('[preload-error]', p, err));
}

function init() {
  app.on('web-contents-created', (_e, contents) => debugConsole(contents));
  gift = loadGift();
  store = new Store(path.join(app.getPath('userData'), 'mochi-data.json'), createDefaults(gift));
  if (isMac) {
    app.dock?.hide();
    Menu.setApplicationMenu(menus.appMenu());
  }

  pomodoro = new Pomodoro(store);
  pet = new PetWindow(store);
  scheduler = new Scheduler({ store, pet, gift });

  registerIpc();
  wireStoreBroadcast();
  wirePomodoro();
  pet.create();
  createTray();
  scheduler.start();

  const devScript = !app.isPackaged && argValue('dev-script');
  if (devScript) {
    const capture = async (win, file, background) => {
      if (!win || win.isDestroyed()) return null;
      if (background) {
        await win.webContents.executeJavaScript(`document.documentElement.style.background=${JSON.stringify(background)}`);
        await new Promise((r) => setTimeout(r, 120));
      }
      const img = await win.webContents.capturePage();
      if (background) await win.webContents.executeJavaScript(`document.documentElement.style.background=''`);
      fs.writeFileSync(file, img.toPNG());
      return img.getSize();
    };
    setTimeout(() => {
      require(path.resolve(devScript))({ app, store, pet, scheduler, pomodoro, windows, capture, petCommand, bumpStats, openHome })
        .catch((err) => console.error('[dev-script]', err))
        .finally(() => console.log('[dev-script] done'));
    }, 1500);
  }

  // 全局快捷键：显示/隐藏宠物（全屏看视频时很有用）
  try {
    globalShortcut.register('CommandOrControl+Alt+P', () => (pet.isVisible() ? pet.hide() : pet.show()));
  } catch (err) {
    console.error('[shortcut]', err);
  }
  app.on('will-quit', () => globalShortcut.unregisterAll());

  const keepOnScreen = () => pet.ensureOnScreen();
  screen.on('display-removed', keepOnScreen);
  screen.on('display-metrics-changed', keepOnScreen);
}

// ---------- 数据 ----------
function wireStoreBroadcast() {
  const pending = new Set();
  let timer = null;
  windows.setHomeTheme(C.resolveTheme(store.data, catalog));
  store.on('change', (p) => {
    pending.add(p);
    if (p === 'pet.name' || p === '*') tray?.setToolTip(`${petName()}的桌面小窝`);
    if (p === '*' || p.startsWith('settings') || p.startsWith('pet')) windows.setHomeTheme(C.resolveTheme(store.data, catalog));
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const paths = [...pending];
      pending.clear();
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('store:changed', store.data, paths);
      }
    }, 30);
  });
}

function bumpStats(delta = {}) {
  const s = JSON.parse(JSON.stringify(store.get('stats')));
  const today = C.dateKey();
  if (s.daily?.date !== today) s.daily = { date: today, water: 0, pomodoros: 0, focusMinutes: 0, pets: 0, feeds: 0 };
  const clamp = (v) => Math.max(0, Math.min(100, v));
  if (delta.fullness) s.fullness = clamp(s.fullness + Number(delta.fullness));
  if (delta.mood) s.mood = clamp(s.mood + Number(delta.mood));
  const before = C.levelFor(s.xp, catalog.levels).level;
  if (delta.xp) s.xp = Math.max(0, s.xp + Number(delta.xp));
  for (const [k, v] of Object.entries(delta.counters || {})) s.counters[k] = (s.counters[k] || 0) + Number(v);
  for (const [k, v] of Object.entries(delta.daily || {})) s.daily[k] = (s.daily[k] || 0) + Number(v);
  store.set('stats', s);
  const lv = C.levelFor(s.xp, catalog.levels);
  if (lv.level > before) {
    pet.sendEvent({ type: 'levelup', level: lv.level, title: lv.title, text: scheduler.line('levelUp', { level: lv.level, title: lv.title }) });
  }
  return s;
}

function setLoginItem(on) {
  const opts = { openAtLogin: !!on };
  // Windows 便携版每次运行都解压到临时目录，要指向外面那个 exe
  if (process.env.PORTABLE_EXECUTABLE_FILE) opts.path = process.env.PORTABLE_EXECUTABLE_FILE;
  try {
    app.setLoginItemSettings(opts);
  } catch (err) {
    console.error('[login-item]', err);
  }
  let actual = !!on;
  try {
    const q = process.env.PORTABLE_EXECUTABLE_FILE ? { path: process.env.PORTABLE_EXECUTABLE_FILE } : undefined;
    actual = app.getLoginItemSettings(q).openAtLogin;
  } catch {}
  store.set('settings.launchAtLogin', actual);
  return actual;
}

function petCommand(cmd) {
  pet.send('pet:command', cmd);
}

function notify(body) {
  if (pet.isVisible() || !Notification.isSupported()) return;
  new Notification({ title: petName(), body }).show();
}

// ---------- 番茄钟 ----------
function wirePomodoro() {
  pomodoro.on('update', (snap) => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('pomodoro:update', snap);
  });
  pomodoro.on('phase', ({ phase }) => {
    if (phase === 'focus') pet.sendEvent({ type: 'focus-start', text: scheduler.line('focusStart') });
    else pet.sendEvent({ type: 'break-start', phase, text: phase === 'long' ? '长休息时间！去走走，喝口水～' : '休息一下，活动活动～' });
  });
  pomodoro.on('focus-done', ({ minutes, skipped }) => {
    if (skipped) return;
    bumpStats({ xp: 5, mood: 5, counters: { pomodoros: 1 }, daily: { pomodoros: 1, focusMinutes: minutes } });
    const text = scheduler.line('focusEnd');
    pet.sendEvent({ type: 'focus-done', text });
    notify('🍅 ' + text);
  });
  pomodoro.on('break-done', ({ skipped }) => {
    const text = scheduler.line('breakEnd');
    pet.sendEvent({ type: 'break-done', text });
    if (!skipped) notify(text);
  });
  pomodoro.on('stopped', () => pet.sendEvent({ type: 'focus-stop' }));
}

// ---------- 托盘 ----------
function trayImage() {
  const dir = path.join(__dirname, '../../assets/tray');
  if (isMac) {
    const img = nativeImage.createFromPath(path.join(dir, 'trayTemplate.png'));
    img.setTemplateImage(true);
    return img;
  }
  return nativeImage.createFromPath(path.join(dir, process.platform === 'win32' ? 'tray.ico' : 'tray.png'));
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip(`${petName()}的桌面小窝`);
  const popup = () => tray.popUpContextMenu(menus.trayMenu({ store, pet, pomodoro, openHome, petCommand, setLoginItem }));
  tray.on('click', popup);
  tray.on('right-click', popup);
}

function openHome(page) {
  return windows.openHome(page, petName());
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('store:get', () => store.data);
  ipcMain.handle('store:set', (_e, p, value) => {
    store.set(p, value);
    return true;
  });
  ipcMain.handle('stats:bump', (_e, delta) => bumpStats(delta || {}));

  ipcMain.handle('mood:record', (_e, date, mood, note) => {
    if (!catalog.moods.some((m) => m.id === mood) || !C.parseKey(date)) return false;
    const moods = { ...(store.get('moods') || {}) };
    const isNew = !moods[date];
    moods[date] = { mood, note: String(note || '').slice(0, 120), at: Date.now() };
    store.set('moods', moods);
    if (isNew) bumpStats({ xp: 3 });
    if (date === C.dateKey()) {
      const text = C.fill(C.pick(phrases.moodReply[mood], 'mood-' + mood), scheduler.vars());
      pet.sendEvent({ type: 'mood-recorded', mood, text });
    }
    return true;
  });

  // 宠物窗口
  ipcMain.on('pet:ready', () => {
    pet.onRendererReady();
    pet.send('pomodoro:update', pomodoro.snapshot());
    if (greeted) return;
    greeted = true;
    const firstRun = !store.get('runtime.welcomed');
    if (firstRun) pet.entrance();
    setTimeout(() => scheduler.greetOnStartup(), firstRun ? 1600 : 1200);
  });
  ipcMain.on('pet:ignore-mouse', (_e, ignore) => pet.setIgnoreMouse(!!ignore));
  ipcMain.on('motion:drag-start', () => pet.dragStart());
  ipcMain.on('motion:drag-end', () => pet.dragEnd());
  ipcMain.on('motion:walk', (_e, opts) => pet.walk(opts || {}));
  ipcMain.on('motion:stop', () => pet.stopWalk());
  ipcMain.handle('pet:layout', () => pet.layoutInfo());
  ipcMain.on('pet:context-menu', (_e, state) => {
    if (!pet.alive) return;
    menus.petMenu({ store, pet, pomodoro, openHome, petCommand, state: state || {} }).popup({ window: pet.win });
  });
  ipcMain.on('pet:command', (_e, cmd) => {
    if (cmd && typeof cmd.type === 'string') petCommand(cmd);
  });
  ipcMain.handle('fortune:get', () => scheduler.fortuneText());
  ipcMain.on('pet:show', () => pet.show());
  ipcMain.on('pet:hide', () => pet.hide());
  ipcMain.on('pet:summon', () => pet.summon());
  ipcMain.handle('pet:is-visible', () => pet.isVisible());

  ipcMain.on('reminder:ack', (_e, id, action) => {
    scheduler.ack(id, action);
    if (action !== 'done') return;
    if (id === 'water') {
      const s = bumpStats({ xp: 1, counters: { waters: 1 }, daily: { water: 1 } });
      pet.sendEvent({ type: 'say', text: scheduler.line('waterDone', { n: s.daily.water }), mood: 'happy' });
    } else if (id === 'stretch' || id === 'eyes') {
      bumpStats({ xp: 1, mood: 2 });
    }
  });

  // 番茄钟
  ipcMain.handle('pomodoro:get', () => pomodoro.snapshot());
  ipcMain.handle('pomodoro:cmd', (_e, cmd) => {
    if (!['start', 'pause', 'resume', 'stop', 'skip'].includes(cmd)) return pomodoro.snapshot();
    return pomodoro[cmd]();
  });

  // 天气
  ipcMain.handle('weather:search', async (_e, q) => {
    try {
      return await weather.search(q);
    } catch {
      return [];
    }
  });
  ipcMain.handle('weather:get', (_e, force) => weather.current(store.get('weather'), !!force));

  // 信件
  ipcMain.handle('letters:list', () => scheduler.lettersState());
  ipcMain.handle('letters:read', (_e, id) => {
    if (!scheduler.findLetter(id)) return false;
    store.set('letters.read', { ...(store.get('letters.read') || {}), [String(id)]: Date.now() });
    return true;
  });
  // 在应用里写信：新建或修改（修改时不传 body 表示正文不变）
  ipcMain.handle('letters:save', (_e, input) => {
    const r = letters.saveLetter(store.get('letters.custom'), input);
    if (!r.ok) return { ok: false, error: r.error };
    store.set('letters.custom', r.list);
    if (r.changedUnlock) {
      // 换了拆开日期：到新日期时宠物要重新把信递过来
      const notified = { ...(store.get('letters.notified') || {}) };
      delete notified[r.letter.id];
      store.set('letters.notified', notified, { silent: true });
    }
    return { ok: true, id: r.letter.id };
  });
  ipcMain.handle('letters:delete', (_e, id) => {
    const r = letters.deleteLetter(store.get('letters.custom'), id);
    if (!r.ok) return { ok: false, error: '只能删除在这里写的信' };
    store.set('letters.custom', r.list);
    return { ok: true };
  });
  ipcMain.handle('letters:export', async (e) => {
    const list = store.get('letters.custom') || [];
    if (!list.length) return { ok: false, error: '还没有在这里写过信' };
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '导出写好的信',
      defaultPath: path.join(app.getPath('desktop'), `写给${store.get('owner.nickname') || 'TA'}的信.nuomi-letters.json`),
      filters: [{ name: '信件', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    try {
      fs.writeFileSync(filePath, letters.exportLetters(list));
      return { ok: true, path: filePath, count: list.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('letters:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '导入信件',
      properties: ['openFile'],
      filters: [{ name: '信件', extensions: ['json'] }],
    });
    if (canceled || !filePaths?.[0]) return { ok: false };
    try {
      const r = letters.importLetters(store.get('letters.custom'), fs.readFileSync(filePaths[0], 'utf8'));
      if (!r.ok) return { ok: false, error: r.error };
      store.set('letters.custom', r.list);
      return { ok: true, count: r.count };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.on('letter:open', (_e, id) => {
    const l = scheduler.lettersState().find((x) => x.id === String(id));
    if (l && l.unlocked) windows.openLetter(l.id);
  });

  // 窗口与应用
  ipcMain.on('home:open', (_e, page) => openHome(typeof page === 'string' ? page : 'overview'));
  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    userData: app.getPath('userData'),
  }));
  ipcMain.handle('app:login-item', (_e, on) => setLoginItem(on));
  ipcMain.on('app:quit', () => app.quit());

  ipcMain.handle('data:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '导出数据',
      defaultPath: path.join(app.getPath('documents'), `${petName()}-备份-${C.dateKey()}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    try {
      fs.writeFileSync(filePath, JSON.stringify(store.data, null, 2));
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('data:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '导入数据',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths?.[0]) return { ok: false };
    try {
      const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
      if (!data || typeof data !== 'object' || !data.pet || !data.stats) return { ok: false, error: '这不是糯米桌宠的备份文件' };
      store.replaceAll(data);
      pet.resize();
      return { ok: true, path: filePaths[0] };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('data:reset', () => {
    const fresh = createDefaults(gift);
    fresh.runtime.welcomed = true;
    store.replaceAll(fresh);
    pet.resize();
    return { ok: true };
  });
}
