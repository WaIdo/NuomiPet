// 右键宠物的菜单和托盘菜单。每次打开时现建，文字用当前语言。
const { Menu, app } = require('electron');
const os = require('os');
const catalog = require('../shared/catalog.json');
const { EMOJI_FALLBACK, swapEmoji } = require('../shared/common');
const i18n = require('./i18n');

const { t } = i18n;

// Windows 10（内部版本号 22000 以下）的系统 emoji 字体没有新 emoji，菜单里换成老的
const oldWindows = process.platform === 'win32' && Number(os.release().split('.')[2]) < 22000;
const missingEmoji = new Set(oldWindows ? Object.keys(EMOJI_FALLBACK) : []);
const em = (label) => swapEmoji(label, missingEmoji);

// 建菜单：每一项的文字（包括翻译过来的）都经过 em()
function build(template) {
  const fix = (items) =>
    items.map((item) => {
      const out = { ...item };
      if (typeof out.label === 'string') out.label = em(out.label);
      if (Array.isArray(out.submenu)) out.submenu = fix(out.submenu);
      return out;
    });
  return Menu.buildFromTemplate(fix(template));
}

function toggle(store, path, label) {
  return { label, type: 'checkbox', checked: !!store.get(path), click: (item) => store.set(path, item.checked) };
}

function pomodoroItems(pomodoro) {
  const p = pomodoro.snapshot();
  if (p.phase === 'idle') return [{ label: t('main.pomodoro.start'), click: () => pomodoro.start() }];
  return [
    p.paused ? { label: t('main.pomodoro.resume'), click: () => pomodoro.resume() } : { label: t('main.pomodoro.pause'), click: () => pomodoro.pause() },
    { label: t('main.pomodoro.skip'), click: () => pomodoro.skip() },
    { label: t('main.pomodoro.stop'), click: () => pomodoro.stop() },
  ];
}

function foodItems(petCommand) {
  return catalog.foods.map((f) => ({ label: `${f.emoji}  ${f.name}`, click: () => petCommand({ type: 'feed', food: f.id }) }));
}

// 哄她开心的动作（文字在 main.coax 下）
const COAX = ['kneel', 'bow', 'flower', 'heart', 'hug', 'kiss', 'tea', 'cute', 'roll', 'dance', 'praise'];

function coaxItems(petCommand) {
  return [
    ...COAX.map((kind) => ({ label: t(`main.coax.${kind}`), click: () => petCommand({ type: 'coax', kind }) })),
    { type: 'separator' },
    { label: t('main.menu.coaxRandom'), click: () => petCommand({ type: 'coax', kind: 'random' }) },
  ];
}

// 「🚗 叫他来接我」：打开宠物的「来接我」面板（宠物窗口处理 pickup 命令）。署名没填时用通用的称呼
const pickupLabel = (store) => t('main.mail.menuPickup', { sender: String(store.get('owner.sender') || '').trim() || t('main.mail.him') });

// 语言：跟随系统，或者选一种。语言名不翻译（各自用自己的语言写）；标题带上英文，看不懂当前语言也能找到
function languageItem(store) {
  const setting = store.get('settings.language');
  const cur = i18n.LANGS.some((l) => l.id === setting) ? setting : 'auto';
  const radio = (id, label) => ({ label, type: 'radio', checked: cur === id, click: () => store.set('settings.language', id) });
  return {
    label: i18n.lang() === 'en' ? '🌐 Language' : `🌐 ${t('lang.title')} / Language`,
    submenu: [radio('auto', t('lang.auto')), ...i18n.LANGS.map((l) => radio(l.id, l.name))],
  };
}

function petMenu({ store, pet, pomodoro, openHome, petCommand, state = {} }) {
  const name = i18n.petName(store.data);
  const size = store.get('pet.size');
  return build([
    { label: t('main.menu.feedPet', { pet: name }), submenu: foodItems(petCommand) },
    { label: t('main.menu.coax'), submenu: coaxItems(petCommand) },
    { label: t('main.menu.play'), click: () => petCommand({ type: 'play' }) },
    state.sleeping
      ? { label: t('main.menu.wake'), click: () => petCommand({ type: 'wake' }) }
      : { label: t('main.menu.sleep'), click: () => petCommand({ type: 'sleep' }) },
    { label: t('main.menu.pomodoro'), submenu: pomodoroItems(pomodoro) },
    { label: t('main.menu.mood'), click: () => petCommand({ type: 'mood-ask' }) },
    { label: t('main.menu.fortune'), click: () => petCommand({ type: 'fortune' }) },
    { label: pickupLabel(store), click: () => petCommand({ type: 'pickup' }) },
    { type: 'separator' },
    { label: t('main.menu.home'), click: () => openHome('overview') },
    { label: t('main.menu.todos'), click: () => openHome('todos') },
    { label: t('main.menu.reminders'), click: () => openHome('reminders') },
    { label: t('main.menu.dress'), click: () => openHome('dress') },
    { label: t('main.menu.letters'), click: () => openHome('letters') },
    { type: 'separator' },
    {
      label: t('main.menu.size'),
      submenu: catalog.sizes.map((z) => ({ label: z.name, type: 'radio', checked: size === z.id, click: () => store.set('pet.size', z.id) })),
    },
    toggle(store, 'settings.walkAround', t('main.menu.walkAround')),
    toggle(store, 'settings.followMouse', t('main.menu.followMouse')),
    toggle(store, 'settings.alwaysOnTop', t('main.menu.alwaysOnTop')),
    toggle(store, 'settings.dnd', t('main.menu.dnd')),
    toggle(store, 'settings.sound', t('main.menu.sound')),
    { type: 'separator' },
    { label: t('main.menu.hidePet', { pet: name }), click: () => pet.hide() },
    { label: t('main.menu.quit'), click: () => app.quit() },
  ]);
}

function trayMenu({ store, pet, pomodoro, openHome, petCommand, setLoginItem }) {
  const name = i18n.petName(store.data);
  const visible = pet.isVisible();
  return build([
    { label: t('main.tray.title', { pet: name }), enabled: false },
    { type: 'separator' },
    {
      label: visible ? t('main.tray.hide', { pet: name }) : t('main.tray.show', { pet: name }),
      accelerator: 'CommandOrControl+Alt+P',
      registerAccelerator: false,
      click: () => (visible ? pet.hide() : pet.show()),
    },
    { label: t('main.tray.summon', { pet: name }), click: () => pet.summon() },
    { label: t('main.menu.home'), click: () => openHome('overview') },
    { label: t('main.tray.feed'), submenu: foodItems(petCommand) },
    { label: t('main.tray.coax'), click: () => petCommand({ type: 'coax', kind: 'random' }) },
    {
      label: pickupLabel(store),
      click: () => {
        // 宠物藏起来了也要叫出来，不然看不到面板
        pet.show();
        petCommand({ type: 'pickup' });
      },
    },
    { label: t('main.menu.pomodoro'), submenu: pomodoroItems(pomodoro) },
    { type: 'separator' },
    toggle(store, 'settings.dnd', t('main.menu.dnd')),
    toggle(store, 'settings.sound', t('main.menu.sound')),
    {
      label: t('main.tray.launchAtLogin'),
      type: 'checkbox',
      checked: !!store.get('settings.launchAtLogin'),
      click: (item) => setLoginItem(item.checked),
    },
    languageItem(store),
    { type: 'separator' },
    { label: t('main.menu.quit'), click: () => app.quit() },
  ]);
}

// macOS 顶部菜单栏（打开小窝时显示），保证复制粘贴快捷键可用。换语言后要重新设一次
function appMenu() {
  if (process.platform !== 'darwin') return null;
  return build([
    {
      label: app.name,
      submenu: [
        { role: 'about', label: t('main.appMenu.about') },
        { type: 'separator' },
        { role: 'hide', label: t('main.appMenu.hide') },
        { role: 'quit', label: t('main.menu.quit') },
      ],
    },
    {
      label: t('main.appMenu.edit'),
      submenu: [
        { role: 'undo', label: t('main.appMenu.undo') },
        { role: 'redo', label: t('main.appMenu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('main.appMenu.cut') },
        { role: 'copy', label: t('main.appMenu.copy') },
        { role: 'paste', label: t('main.appMenu.paste') },
        { role: 'selectAll', label: t('main.appMenu.selectAll') },
      ],
    },
    { label: t('main.appMenu.window'), submenu: [{ role: 'minimize', label: t('main.appMenu.minimize') }, { role: 'close', label: t('common.close') }] },
  ]);
}

module.exports = { petMenu, trayMenu, appMenu };
