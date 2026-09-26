// 「小窝」设置窗口和信件窗口。
const { BrowserWindow, app, screen } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';
const preload = path.join(__dirname, '../preload/preload.js');
const themes = require('../shared/themes.json');

const themeOf = (id) => themes.find((t) => t.id === id) || themes[0];
let homeTheme = 'sakura';

let home = null;
let letter = null;

function webPrefs() {
  return { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false };
}

// macOS 上桌宠默认不占 Dock；打开小窝时临时显示 Dock 图标，方便切换窗口和使用菜单快捷键。
function updateDock() {
  if (!isMac || !app.dock) return;
  const needDock = home && !home.isDestroyed();
  if (needDock) app.dock.show();
  else app.dock.hide();
}

// 小窝换颜色时，同步窗口底色和 Windows 右上角系统按钮区域的颜色
function setHomeTheme(id) {
  homeTheme = id;
  const t = themeOf(id);
  if (!home || home.isDestroyed()) return;
  home.setBackgroundColor(t.header);
  if (!isMac && home.setTitleBarOverlay) {
    try {
      home.setTitleBarOverlay({ color: t.header, symbolColor: t.symbol, height: 44 });
    } catch {}
  }
}

function openHome(page, petName = '糯米') {
  if (home && !home.isDestroyed()) {
    if (home.isMinimized()) home.restore();
    home.show();
    home.focus();
    if (page) home.webContents.send('home:navigate', page);
    return home;
  }
  // 不超过屏幕可用区域：1080p 屏幕开 150% 缩放时可用高度只有 670 多
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(980, area.width - 20);
  const height = Math.min(680, area.height - 20);
  home = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    minWidth: Math.min(860, width),
    minHeight: Math.min(600, height),
    show: false,
    title: `${petName}的小窝`,
    backgroundColor: themeOf(homeTheme).header,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 16, y: 15 } : undefined,
    titleBarOverlay: isMac ? undefined : { color: themeOf(homeTheme).header, symbolColor: themeOf(homeTheme).symbol, height: 44 },
    webPreferences: webPrefs(),
  });
  home.removeMenu?.();
  home.loadFile(path.join(__dirname, '../renderer/home/index.html'), { query: { page: page || 'overview' } });
  home.once('ready-to-show', () => {
    home.show();
    home.focus();
    if (isMac) app.focus({ steal: true });
  });
  home.on('closed', () => {
    home = null;
    updateDock();
  });
  guardNavigation(home);
  updateDock();
  return home;
}

function openLetter(id) {
  if (letter && !letter.isDestroyed()) letter.close();
  const w = 560;
  const h = 720;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  letter = new BrowserWindow({
    width: w,
    height: Math.min(h, area.height - 20),
    x: Math.round(area.x + (area.width - w) / 2),
    y: Math.round(area.y + Math.max(10, (area.height - h) / 2)),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: '一封信',
    webPreferences: webPrefs(),
  });
  letter.loadFile(path.join(__dirname, '../renderer/letter/index.html'), { query: { id: String(id) } });
  letter.once('ready-to-show', () => {
    letter.show();
    letter.focus();
    if (isMac) app.focus({ steal: true });
  });
  letter.on('closed', () => {
    letter = null;
  });
  guardNavigation(letter);
  return letter;
}

// 不允许页面跳转到外部链接或打开新窗口
function guardNavigation(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

function homeWindow() {
  return home && !home.isDestroyed() ? home : null;
}

module.exports = { openHome, openLetter, homeWindow, guardNavigation, updateDock, setHomeTheme };
