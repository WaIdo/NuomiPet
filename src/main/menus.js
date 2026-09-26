// 右键宠物的菜单和托盘菜单。
const { Menu, app } = require('electron');
const catalog = require('../shared/catalog.json');

function toggle(store, path, label) {
  return { label, type: 'checkbox', checked: !!store.get(path), click: (item) => store.set(path, item.checked) };
}

function pomodoroItems(pomodoro) {
  const p = pomodoro.snapshot();
  if (p.phase === 'idle') return [{ label: '开始专注', click: () => pomodoro.start() }];
  return [
    p.paused ? { label: '继续', click: () => pomodoro.resume() } : { label: '暂停', click: () => pomodoro.pause() },
    { label: '跳过这一段', click: () => pomodoro.skip() },
    { label: '结束番茄钟', click: () => pomodoro.stop() },
  ];
}

function foodItems(petCommand) {
  return catalog.foods.map((f) => ({ label: `${f.emoji}  ${f.name}`, click: () => petCommand({ type: 'feed', food: f.id }) }));
}

function petMenu({ store, pet, pomodoro, openHome, petCommand, state = {} }) {
  const name = store.get('pet.name') || '糯米';
  const size = store.get('pet.size');
  return Menu.buildFromTemplate([
    { label: `🍓  喂${name}吃东西`, submenu: foodItems(petCommand) },
    { label: '🧶  陪它玩', click: () => petCommand({ type: 'play' }) },
    state.sleeping
      ? { label: '☀️  叫它起床', click: () => petCommand({ type: 'wake' }) }
      : { label: '💤  哄它睡觉', click: () => petCommand({ type: 'sleep' }) },
    { label: '🍅  番茄钟', submenu: pomodoroItems(pomodoro) },
    { label: '🌈  心情打卡', click: () => petCommand({ type: 'mood-ask' }) },
    { label: '🔮  今日运势', click: () => petCommand({ type: 'fortune' }) },
    { type: 'separator' },
    { label: '🏠  打开小窝', click: () => openHome('overview') },
    { label: '📝  待办清单', click: () => openHome('todos') },
    { label: '⏰  提醒设置', click: () => openHome('reminders') },
    { label: '🎀  换个装扮', click: () => openHome('dress') },
    { label: '💌  信箱', click: () => openHome('letters') },
    { type: 'separator' },
    {
      label: '大小',
      submenu: catalog.sizes.map((z) => ({ label: z.name, type: 'radio', checked: size === z.id, click: () => store.set('pet.size', z.id) })),
    },
    toggle(store, 'settings.walkAround', '自由走动'),
    toggle(store, 'settings.followMouse', '跟着鼠标走'),
    toggle(store, 'settings.alwaysOnTop', '始终在最前面'),
    toggle(store, 'settings.dnd', '勿扰模式'),
    toggle(store, 'settings.sound', '声音'),
    { type: 'separator' },
    { label: `把${name}藏起来`, click: () => pet.hide() },
    { label: '退出', click: () => app.quit() },
  ]);
}

function trayMenu({ store, pet, pomodoro, openHome, petCommand, setLoginItem }) {
  const name = store.get('pet.name') || '糯米';
  const visible = pet.isVisible();
  return Menu.buildFromTemplate([
    { label: `${name}的桌面小窝`, enabled: false },
    { type: 'separator' },
    {
      label: visible ? `藏起${name}` : `叫${name}出来`,
      accelerator: 'CommandOrControl+Alt+P',
      registerAccelerator: false,
      click: () => (visible ? pet.hide() : pet.show()),
    },
    { label: `叫${name}过来`, click: () => pet.summon() },
    { label: '🏠  打开小窝', click: () => openHome('overview') },
    { label: '🍓  喂它吃东西', submenu: foodItems(petCommand) },
    { label: '🍅  番茄钟', submenu: pomodoroItems(pomodoro) },
    { type: 'separator' },
    toggle(store, 'settings.dnd', '勿扰模式'),
    toggle(store, 'settings.sound', '声音'),
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: !!store.get('settings.launchAtLogin'),
      click: (item) => setLoginItem(item.checked),
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
}

// macOS 顶部菜单栏（打开小窝时显示），保证复制粘贴快捷键可用
function appMenu() {
  if (process.platform !== 'darwin') return null;
  return Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about', label: '关于' }, { type: 'separator' }, { role: 'hide', label: '隐藏' }, { role: 'quit', label: '退出' }] },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    { label: '窗口', submenu: [{ role: 'minimize', label: '最小化' }, { role: 'close', label: '关闭' }] },
  ]);
}

module.exports = { petMenu, trayMenu, appMenu };
