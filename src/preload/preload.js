// 渲染进程能用的全部接口都在 window.mochi 上。
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...args) => ipcRenderer.invoke(ch, ...args);
const send = (ch, ...args) => ipcRenderer.send(ch, ...args);
const on = (ch, cb) => {
  const fn = (_e, ...args) => cb(...args);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('mochi', {
  platform: process.platform,

  // ---- 数据 ----
  getData: () => invoke('store:get'),
  set: (path, value) => invoke('store:set', path, value),
  onData: (cb) => on('store:changed', cb), // cb(data, paths[])
  bumpStats: (delta) => invoke('stats:bump', delta),
  recordMood: (date, mood, note = '') => invoke('mood:record', date, mood, note),

  // ---- 宠物 ----
  petCommand: (cmd) => send('pet:command', cmd), // 例：{ type: 'feed', food: 'cake' }
  onPetCommand: (cb) => on('pet:command', cb),
  onPetEvent: (cb) => on('pet:event', cb),
  pet: {
    ready: () => send('pet:ready'),
    ignoreMouse: (ignore) => send('pet:ignore-mouse', !!ignore),
    dragStart: () => send('motion:drag-start'),
    dragEnd: () => send('motion:drag-end'),
    walk: (opts) => send('motion:walk', opts), // { dir: -1|1, distance, speed } 或 { toCursor: true }
    stop: () => send('motion:stop'),
    contextMenu: (state = {}) => send('pet:context-menu', state), // state: { sleeping }
    onMotion: (cb) => on('motion:event', cb),
    onCursor: (cb) => on('pet:cursor', cb),
    onLayout: (cb) => on('pet:layout', cb),
    onClip: (cb) => on('pet:clip', cb), // { left, right }：窗口在屏幕内可见的横向范围
    getLayout: () => invoke('pet:layout'),
    show: () => send('pet:show'),
    hide: () => send('pet:hide'),
    summon: () => send('pet:summon'),
    isVisible: () => invoke('pet:is-visible'),
  },
  reminderAck: (id, action) => send('reminder:ack', id, action), // action: 'done' | 'snooze' | 'dismiss'
  fortune: () => invoke('fortune:get'),

  // ---- 番茄钟 ----
  pomodoro: {
    get: () => invoke('pomodoro:get'),
    start: () => invoke('pomodoro:cmd', 'start'),
    pause: () => invoke('pomodoro:cmd', 'pause'),
    resume: () => invoke('pomodoro:cmd', 'resume'),
    stop: () => invoke('pomodoro:cmd', 'stop'),
    skip: () => invoke('pomodoro:cmd', 'skip'),
    onUpdate: (cb) => on('pomodoro:update', cb),
  },

  // ---- 天气 ----
  weather: {
    search: (q) => invoke('weather:search', q),
    get: (force = false) => invoke('weather:get', force),
  },

  // ---- 信件 ----
  letters: {
    list: () => invoke('letters:list'),
    markRead: (id) => invoke('letters:read', id),
    open: (id) => send('letter:open', id),
  },

  // ---- 窗口与应用 ----
  openHome: (page) => send('home:open', page),
  onNavigate: (cb) => on('home:navigate', cb),
  app: {
    info: () => invoke('app:info'),
    setLoginItem: (on) => invoke('app:login-item', !!on),
    exportData: () => invoke('data:export'),
    importData: () => invoke('data:import'),
    resetData: () => invoke('data:reset'),
    quit: () => send('app:quit'),
  },
});
