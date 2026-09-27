// 桌宠窗口：透明、置顶、默认鼠标穿透。负责窗口的移动（走路、拖拽、抛出后的下落）和鼠标位置转发。
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const catalog = require('../shared/catalog.json');
const i18n = require('./i18n');

const TOP_AREA = 150; // 宠物头顶上方留给气泡和快捷面板的高度
const MIN_W = 300;
const TICK_MS = 16;
const GRAVITY = 2600; // px/s²

const sizePx = (id) => (catalog.sizes.find((s) => s.id === id) || catalog.sizes[1]).px;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class PetWindow {
  constructor(store) {
    this.store = store;
    this.win = null;
    this.ready = false;
    this.queue = [];
    this.motion = { mode: 'idle' };
    this.loop = null;
    this.cursorLoop = null;
    this.lastCursor = null;
    this.pos = { x: 0, y: 0 };
    this.applyLayout();

    store.on('change', (p) => {
      if (p === 'pet.size' || p === 'pet' || p === '*') this.resize();
      if (p === 'settings.alwaysOnTop' || p === 'settings' || p === '*') this.applyOnTop();
      if (p === 'settings.gravity' && store.get('settings.gravity')) this.dropToFloor();
    });
  }

  applyLayout() {
    this.petSize = sizePx(this.store.get('pet.size'));
    this.w = Math.max(MIN_W, this.petSize + 150);
    this.h = this.petSize + TOP_AREA;
  }

  get alive() {
    return this.win && !this.win.isDestroyed();
  }

  create() {
    const start = this.initialPosition();
    this.pos = { x: start.x, y: start.y };
    this.win = new BrowserWindow({
      x: Math.round(start.x),
      y: Math.round(start.y),
      width: this.w,
      height: this.h,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      acceptFirstMouse: true,
      // Windows 上用工具窗口样式，不出现在任务栏和 Alt+Tab 里
      type: process.platform === 'win32' ? 'toolbar' : undefined,
      title: i18n.petName(this.store.data),
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        spellcheck: false,
      },
    });
    if (process.platform === 'darwin') {
      this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false, skipTransformProcessType: true });
    }
    this.applyOnTop();
    this.win.setIgnoreMouseEvents(true, { forward: true });
    const { app } = require('electron');
    this.win.loadFile(path.join(__dirname, '../renderer/pet/index.html'), { query: app.isPackaged ? {} : { dev: '1' } });
    this.win.once('ready-to-show', () => {
      if (!this.store.get('runtime.hidden')) this.win.showInactive();
    });
    this.win.on('closed', () => {
      this.win = null;
      this.ready = false;
      this.stopLoop();
      clearInterval(this.cursorLoop);
    });
    this.win.webContents.on('render-process-gone', () => {
      this.ready = false;
      setTimeout(() => this.alive && this.win.reload(), 1000);
    });
    this.startCursorLoop();
    return this.win;
  }

  onRendererReady() {
    this.ready = true;
    this.clip = null;
    this.updateClip();
    this.send('pet:layout', this.layoutInfo());
    const q = this.queue.splice(0);
    q.forEach(([ch, payload]) => this.send(ch, payload));
  }

  layoutInfo() {
    return { petSize: this.petSize, w: this.w, h: this.h, topArea: TOP_AREA, clip: this.clip || { left: 0, right: this.w } };
  }

  send(channel, payload) {
    if (!this.alive) return;
    if (!this.ready && channel !== 'pet:layout') {
      this.queue.push([channel, payload]);
      return;
    }
    this.win.webContents.send(channel, payload);
  }

  sendEvent(evt) {
    this.send('pet:event', evt);
  }

  // ---------- 显示 / 隐藏 ----------
  isVisible() {
    return this.alive && this.win.isVisible();
  }

  show() {
    if (!this.alive) return;
    this.store.set('runtime.hidden', false, { silent: true });
    this.ensureOnScreen();
    this.win.showInactive();
    this.applyOnTop();
  }

  hide() {
    if (!this.alive) return;
    this.store.set('runtime.hidden', true, { silent: true });
    this.win.hide();
  }

  applyOnTop() {
    if (!this.alive) return;
    const on = this.store.get('settings.alwaysOnTop') !== false;
    this.win.setAlwaysOnTop(on, 'floating');
  }

  setIgnoreMouse(ignore) {
    if (!this.alive) return;
    if (this.motion.mode === 'drag') ignore = false;
    if (this.ignoring === ignore) return;
    this.ignoring = ignore;
    this.win.setIgnoreMouseEvents(ignore, { forward: true });
  }

  // ---------- 几何 ----------
  areaAt(x, y) {
    return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
  }

  petCenter() {
    return { x: this.pos.x + this.w / 2, y: this.pos.y + this.h - this.petSize / 2 };
  }

  currentArea() {
    const c = this.petCenter();
    return this.areaAt(c.x, c.y);
  }

  floorY(area) {
    return area.y + area.height - this.h + Math.round(this.petSize * 0.03);
  }

  xRange(area) {
    const side = (this.w - this.petSize) / 2;
    const slack = this.petSize * 0.1;
    return [area.x - side - slack, area.x + area.width - this.w + side + slack];
  }

  yRange(area) {
    return [area.y - TOP_AREA, this.floorY(area)];
  }

  initialPosition() {
    const saved = this.store.get('runtime.position');
    const gravity = this.store.get('settings.gravity') !== false;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const cx = saved.x + this.w / 2;
      const cy = saved.y + this.h - this.petSize / 2;
      const inside = screen.getAllDisplays().some((d) => {
        const b = d.bounds;
        return cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height;
      });
      if (inside) {
        const area = this.areaAt(cx, cy);
        const [x0, x1] = this.xRange(area);
        const [y0, y1] = this.yRange(area);
        return { x: clamp(saved.x, x0, x1), y: gravity ? y1 : clamp(saved.y, y0, y1) };
      }
    }
    const area = screen.getPrimaryDisplay().workArea;
    // 第一次启动时从屏幕顶上登场（entrance 会让它掉下来）
    const y = this.store.get('runtime.welcomed') ? this.floorY(area) : area.y - TOP_AREA;
    return { x: area.x + area.width - this.w - 40, y };
  }

  applyBounds() {
    if (!this.alive) return;
    const bounds = { x: Math.round(this.pos.x), y: Math.round(this.pos.y), width: this.w, height: this.h };
    this.win.setBounds(bounds);
    // Windows：窗口移到缩放比例不同的另一块屏幕时，系统可能顺带把窗口大小也缩放了，再设一次
    if (process.platform === 'win32') {
      const b = this.win.getBounds();
      if (Math.abs(b.width - this.w) > 1 || Math.abs(b.height - this.h) > 1) this.win.setBounds(bounds);
    }
    this.updateClip();
  }

  // 窗口靠近屏幕边缘时有一部分在屏幕外，告诉页面可见范围，气泡和面板就不会被截掉
  updateClip() {
    const area = this.currentArea();
    const left = Math.max(0, Math.round(area.x - this.pos.x));
    const right = Math.min(this.w, Math.round(area.x + area.width - this.pos.x));
    if (this.clip && this.clip.left === left && this.clip.right === right) return;
    this.clip = { left, right };
    if (this.ready) this.send('pet:clip', this.clip);
  }

  savePosition() {
    this.store.set('runtime.position', { x: Math.round(this.pos.x), y: Math.round(this.pos.y) }, { silent: true });
  }

  resize() {
    const oldW = this.w;
    const oldH = this.h;
    this.applyLayout();
    if (oldW === this.w && oldH === this.h) return;
    this.pos.x += (oldW - this.w) / 2;
    this.pos.y += oldH - this.h;
    this.ensureOnScreen();
    this.send('pet:layout', this.layoutInfo());
  }

  ensureOnScreen() {
    const area = this.currentArea();
    const [x0, x1] = this.xRange(area);
    const [y0, y1] = this.yRange(area);
    this.pos.x = clamp(this.pos.x, x0, x1);
    this.pos.y = this.store.get('settings.gravity') !== false && this.motion.mode === 'idle' ? y1 : clamp(this.pos.y, y0, y1);
    this.applyBounds();
    this.savePosition();
  }

  // ---------- 运动循环 ----------
  startLoop() {
    if (this.loop) return;
    this.lastTick = Date.now();
    this.loop = setInterval(() => this.tick(), TICK_MS);
  }

  stopLoop() {
    clearInterval(this.loop);
    this.loop = null;
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (!this.alive) return this.stopLoop();
    switch (this.motion.mode) {
      case 'walk':
        return this.stepWalk(dt);
      case 'drag':
        return this.stepDrag(dt);
      case 'fall':
        return this.stepFall(dt);
      default:
        return this.stopLoop();
    }
  }

  emit(evt) {
    this.send('motion:event', evt);
  }

  // 走路：{ dir, distance, speed } 或 { toCursor: true, speed }
  walk({ dir = 1, distance = 120, speed = 60, toCursor = false } = {}) {
    if (this.motion.mode === 'drag' || this.motion.mode === 'fall') return;
    const area = this.currentArea();
    const [x0, x1] = this.xRange(area);
    const wanted = toCursor ? screen.getCursorScreenPoint().x - this.w / 2 : this.pos.x + Math.sign(dir || 1) * Math.abs(distance);
    const target = clamp(wanted, x0, x1);
    const edge = target <= x0 + 1 ? -1 : target >= x1 - 1 ? 1 : 0;
    const d = target - this.pos.x;
    if (Math.abs(d) < 3) {
      this.motion = { mode: 'idle' };
      this.emit({ type: 'arrived', blocked: !toCursor && edge !== 0, edge });
      return;
    }
    this.motion = { mode: 'walk', target, speed: clamp(speed, 10, 400), dir: Math.sign(d), edge: toCursor ? 0 : edge, toCursor };
    this.emit({ type: 'walk-start', dir: this.motion.dir });
    this.startLoop();
  }

  stepWalk(dt) {
    const m = this.motion;
    let nx = this.pos.x + m.dir * m.speed * dt;
    const done = (m.dir > 0 && nx >= m.target) || (m.dir < 0 && nx <= m.target);
    if (done) nx = m.target;
    this.pos.x = nx;
    if (this.store.get('settings.gravity') !== false) this.pos.y = this.floorY(this.currentArea());
    this.applyBounds();
    if (done) {
      this.motion = { mode: 'idle' };
      this.savePosition();
      this.emit({ type: 'arrived', blocked: m.edge !== 0, edge: m.edge });
    }
  }

  stopWalk() {
    if (this.motion.mode !== 'walk') return;
    this.motion = { mode: 'idle' };
    this.savePosition();
    this.emit({ type: 'arrived', blocked: false, stopped: true });
  }

  // 拖拽：由主进程读取鼠标位置，避免渲染进程丢事件
  dragStart() {
    if (!this.alive) return;
    const c = screen.getCursorScreenPoint();
    const b = this.win.getBounds();
    this.pos = { x: b.x, y: b.y };
    this.motion = { mode: 'drag', grab: { x: c.x - b.x, y: c.y - b.y }, vx: 0, vy: 0, lastSent: 0 };
    this.setIgnoreMouse(false);
    this.emit({ type: 'drag-start' });
    this.startLoop();
  }

  stepDrag(dt) {
    const m = this.motion;
    const c = screen.getCursorScreenPoint();
    const nx = c.x - m.grab.x;
    const ny = c.y - m.grab.y;
    if (dt > 0) {
      m.vx = m.vx * 0.72 + ((nx - this.pos.x) / dt) * 0.28;
      m.vy = m.vy * 0.72 + ((ny - this.pos.y) / dt) * 0.28;
    }
    this.pos.x = nx;
    this.pos.y = ny;
    this.applyBounds();
    const now = Date.now();
    if (now - m.lastSent > 40) {
      m.lastSent = now;
      this.emit({ type: 'drag', vx: Math.round(m.vx), vy: Math.round(m.vy) });
    }
  }

  dragEnd() {
    if (this.motion.mode !== 'drag') return;
    const { vx, vy } = this.motion;
    if (this.store.get('settings.gravity') === false) {
      this.motion = { mode: 'idle' };
      this.stopLoop();
      const area = this.currentArea();
      const [x0, x1] = this.xRange(area);
      const [y0, y1] = this.yRange(area);
      this.pos.x = clamp(this.pos.x, x0, x1);
      this.pos.y = clamp(this.pos.y, y0, y1);
      this.applyBounds();
      this.savePosition();
      this.emit({ type: 'drop' });
      return;
    }
    this.startFall(clamp(vx, -2200, 2200), clamp(vy, -2000, 1600));
  }

  startFall(vx = 0, vy = 0) {
    this.motion = { mode: 'fall', vx, vy, bounces: 0, wallHits: 0 };
    this.emit({ type: 'fall-start', vx, vy });
    this.startLoop();
  }

  dropToFloor() {
    if (this.motion.mode !== 'idle') return;
    const area = this.currentArea();
    if (this.floorY(area) - this.pos.y > 4) this.startFall(0, 0);
  }

  stepFall(dt) {
    const m = this.motion;
    m.vy += GRAVITY * dt;
    m.vx *= Math.pow(0.55, dt);
    this.pos.x += m.vx * dt;
    this.pos.y += m.vy * dt;
    const area = this.currentArea();
    const [x0, x1] = this.xRange(area);
    const [y0] = this.yRange(area);
    const floor = this.floorY(area);
    if (this.pos.x < x0 || this.pos.x > x1) {
      this.pos.x = clamp(this.pos.x, x0, x1);
      if (Math.abs(m.vx) > 250) {
        m.wallHits++;
        this.emit({ type: 'wall', impact: Math.abs(Math.round(m.vx)) });
      }
      m.vx = -m.vx * 0.45;
    }
    if (this.pos.y < y0) {
      this.pos.y = y0;
      m.vy = Math.abs(m.vy) * 0.3;
    }
    if (this.pos.y >= floor) {
      this.pos.y = floor;
      if (m.vy > 1100 && m.bounces < 1) {
        m.bounces++;
        this.emit({ type: 'bounce', impact: Math.round(m.vy) });
        m.vy = -m.vy * 0.3;
      } else {
        const impact = Math.round(m.vy + (m.bounces ? 900 : 0) + m.wallHits * 500);
        this.motion = { mode: 'idle' };
        this.applyBounds();
        this.savePosition();
        this.emit({ type: 'land', impact });
        return;
      }
    }
    this.applyBounds();
  }

  // 召唤到鼠标所在的屏幕：从顶上掉下来
  summon() {
    if (!this.alive) return;
    const c = screen.getCursorScreenPoint();
    const area = this.areaAt(c.x, c.y);
    const [x0, x1] = this.xRange(area);
    this.motion = { mode: 'idle' };
    this.pos.x = clamp(c.x - this.w / 2, x0, x1);
    if (this.store.get('settings.gravity') === false) {
      this.pos.y = clamp(c.y - this.h + this.petSize / 2, ...this.yRange(area));
      this.applyBounds();
      this.savePosition();
    } else {
      this.pos.y = area.y - TOP_AREA;
      this.applyBounds();
      this.startFall(0, 300);
    }
    this.show();
  }

  // 首次启动的登场：从屏幕上方掉下来
  entrance() {
    const area = this.currentArea();
    this.pos.y = area.y - TOP_AREA;
    this.applyBounds();
    this.startFall(0, 200);
  }

  // ---------- 鼠标位置（让眼睛跟着鼠标转） ----------
  startCursorLoop() {
    clearInterval(this.cursorLoop);
    this.cursorLoop = setInterval(() => {
      if (!this.ready || !this.isVisible() || this.motion.mode === 'drag') return;
      const c = screen.getCursorScreenPoint();
      const ex = this.pos.x + this.w / 2;
      const ey = this.pos.y + this.h - this.petSize * (1 - 122 / 200);
      const dx = Math.round(c.x - ex);
      const dy = Math.round(c.y - ey);
      if (this.lastCursor && this.lastCursor.dx === dx && this.lastCursor.dy === dy) return;
      this.lastCursor = { dx, dy };
      this.send('pet:cursor', { dx, dy, scale: this.petSize / 200 });
    }, 50);
  }
}

module.exports = { PetWindow, TOP_AREA };
