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
    // 在应用里写的信：{ id?, title, from, unlock: 'YYYY-MM-DD'|'', body }；修改时可以不传 body
    save: (letter) => invoke('letters:save', letter),
    remove: (id) => invoke('letters:delete', id),
    exportFile: () => invoke('letters:export'),
    importFile: () => invoke('letters:import'),
  },

  // ---- 邮件（他用邮件寄信、「来接我」）----
  // 授权码、推送网址、微软的登录凭据不会传到页面：get() 里只有 hasPass、hasPush、hasMsToken
  mail: {
    get: () => invoke('mail:get'), // 设置 + 状态 + resolved（自动识别的服务器）
    // patch 里 password、pushUrl 是明文：不传表示不改，'' 表示清掉。返回同 get()，另有 ok、error
    save: (patch) => invoke('mail:save', patch),
    test: () => invoke('mail:test'), // → { ok, imap: { ok, error }, smtp: { ok, error } }
    check: () => invoke('mail:check'), // 立即收信 → { ok, added, error }
    pickup: (opts = {}) => invoke('mail:pickup', opts), // { when: 'now'|'30'|'60', note } → { ok, via, error, tooSoon? }
    sendGuide: () => invoke('mail:sendGuide'), // 把用法发给他 → { ok, to, error }
    // Outlook 等微软邮箱：开始用微软账号登录 → { ok, userCode, verificationUri, expiresIn, error }；
    // 之后主进程在后台等她在浏览器里同意，进度写进 store 的 mail.ms（state：idle / waiting / ok / error）
    msLoginStart: () => invoke('mail:msLoginStart'),
    msOpen: () => invoke('mail:msOpen'), // 在浏览器里打开登录的网址（只开微软的网址）→ { ok }
    msLogout: () => invoke('mail:msLogout'), // 退出微软账号 → { ok }
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
