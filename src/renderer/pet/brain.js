// 宠物的行为：空闲小动作、闲聊、对鼠标的反应、被拖拽/摔落、处理主进程发来的事件和命令。
import C from '../shared/common.mjs';
import catalog from '../../shared/catalog.json' with { type: 'json' };
import phrases from '../../shared/phrases.json' with { type: 'json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function weighted(list) {
  const total = list.reduce((s, x) => s + Math.max(0, x.w), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const x of list) {
    r -= Math.max(0, x.w);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

// 任务优先级：高优先级可以打断低优先级
const PRI = { idle: 1, event: 2, user: 3 };

export class Brain {
  constructor({ view, bubble, fx, sound, api, getData, anchor, panel, getLayout, visible }) {
    Object.assign(this, { view, bubble, fx, sound, api, getData, anchor, panel, getLayout, visible });
    this.mode = 'awake'; // awake | sleeping | focus
    this.sleepReason = null;
    this.physical = null; // drag | fall
    this.task = null;
    this.walking = false;
    this.pending = [];
    this.pokes = [];
    this.rewardAt = {};
    this.cursor = null;
    this.gazeLock = false;
    this.stroking = null;
    this.strokeEnergy = 0;
    this.nextDir = 0;
    this.panelOpen = false;
  }

  get data() {
    return this.getData();
  }

  start() {
    this.loopBlink();
    this.scheduleIdle(3000);
    this.scheduleChatter();
  }

  vars(extra = {}) {
    const d = this.data;
    return {
      nick: d.owner.nickname || '宝贝',
      pet: d.pet.name || '糯米',
      sender: d.owner.sender || '',
      days: C.dayNumber(d.love.togetherSince) || '',
      knownDays: C.diffDays(C.todayParts(new Date(d.createdAt)), C.todayParts()) + 1,
      ...extra,
    };
  }

  line(key, extra) {
    return C.fill(C.pick(phrases[key], key), this.vars(extra));
  }

  say(text, opts) {
    this.bubble.say(text, opts);
  }

  head() {
    return this.anchor('head');
  }

  markPos() {
    const h = this.head();
    return { x: h.x + 38 * h.scale, y: h.y + 18 * h.scale };
  }

  // ---------- 任务 ----------
  begin(name, pri = PRI.idle) {
    if (this.physical) return null;
    if (this.task && this.task.pri > pri) return null;
    if (this.task) this.task.cancelled = true;
    if (this.walking) this.stopWalking(true);
    const t = { name, pri, cancelled: false };
    this.task = t;
    this.gazeLock = false;
    this.resetBody();
    return t;
  }

  alive(t) {
    return !!t && !t.cancelled && this.task === t && !this.physical;
  }

  async hold(t, ms) {
    await sleep(ms);
    return this.alive(t);
  }

  end(t) {
    if (t && this.task === t) {
      this.task = null;
      this.gazeLock = false;
      this.resetBody();
    }
  }

  cancelTask() {
    if (!this.task) return;
    this.task.cancelled = true;
    this.task = null;
    this.gazeLock = false;
  }

  resetBody() {
    const v = this.view;
    v.setProp(null);
    v.setTilt(0);
    for (const f of ['blush-strong', 'excited', 'sweat', 'ears-down', 'typing']) v.setFlag(f, false);
    if (this.mode === 'sleeping') {
      v.setPose('sleep');
      v.setFace('closed', 'smile');
      v.setPaws('rest');
      v.setFlag('ears-down', true);
      v.lookAt(0, 0, false);
      return;
    }
    if (this.mode === 'focus') {
      v.setPose('focus');
      v.setFace('normal', 'cat');
      v.setPaws('hold');
      v.setProp('💻', { y: 160, size: 30 });
      v.setFlag('typing', true);
      v.lookAt(0, 0.7, false);
      return;
    }
    v.setPose(this.walking ? 'walk' : 'idle');
    v.setFace('normal', this.data.stats.fullness < 25 ? 'wavy' : 'cat');
    v.setPaws('rest');
  }

  // ---------- 循环 ----------
  loopBlink() {
    clearTimeout(this.blinkTimer);
    this.blinkTimer = setTimeout(() => {
      if (this.physical !== 'fall') this.view.blink(chance(0.22));
      this.loopBlink();
    }, rand(2200, 5800));
  }

  loopZzz() {
    clearTimeout(this.zzzTimer);
    if (this.mode !== 'sleeping') return;
    if (!this.physical && !this.task && !document.hidden) {
      const h = this.head();
      this.fx.zzz({ x: h.x + 26 * h.scale, y: h.y + 26 * h.scale });
    }
    // 人离开电脑时少冒一点 Zzz，省电
    this.zzzTimer = setTimeout(() => this.loopZzz(), this.sleepReason === 'away' ? 7000 : 3200);
  }

  canIdle() {
    return this.mode === 'awake' && !this.task && !this.physical && !this.walking && !this.panelOpen;
  }

  scheduleIdle(delay) {
    clearTimeout(this.idleTimer);
    const act = this.data.settings.activity;
    const [a, b] = act === 'lively' ? [2500, 6500] : act === 'quiet' ? [9000, 20000] : [4500, 11000];
    let ms = delay ?? rand(a, b);
    if (this.data.settings.followMouse && delay == null) ms = rand(1200, 2400);
    this.idleTimer = setTimeout(() => this.runIdle(), ms);
  }

  async runIdle() {
    try {
      if (this.mode === 'sleeping' && this.sleepReason === 'nap' && Date.now() > this.napUntil) await this.wakeUp({});
      else if (this.canIdle()) {
        const pick = weighted(this.idleOptions());
        if (pick) await pick.fn();
      }
    } catch (err) {
      console.error(err);
    }
    this.scheduleIdle();
  }

  idleOptions() {
    const d = this.data;
    const s = d.settings;
    const h = new Date().getHours();
    const night = h >= 23 || h < 6;
    const lively = s.activity === 'lively';
    const quiet = s.activity === 'quiet';
    const cursorActive = Date.now() - (this.cursor?.at || 0) < 3000;
    return [
      { w: s.walkAround ? (lively ? 5 : quiet ? 1 : 3) : 0, fn: () => this.idleWalk() },
      { w: cursorActive && s.eyeTracking ? 0.5 : 2, fn: () => this.idleLookAround() },
      { w: 2, fn: () => this.idleTwitch() },
      { w: 1.2, fn: () => this.idleThink() },
      { w: night ? 2 : 0.5, fn: () => this.idleYawn() },
      { w: 0.7, fn: () => this.idleStretch() },
      { w: d.stats.mood > 70 ? 1 : 0.3, fn: () => this.idleHop() },
      { w: lively ? 0.8 : 0.3, fn: () => this.idleSpin() },
      { w: d.stats.fullness < 30 ? 1.5 : 0, fn: () => this.idleHungry() },
      { w: s.followMouse ? 8 : 0, fn: () => this.idleFollow() },
      { w: cursorActive ? 0.6 : 0, fn: () => this.idleWave() },
      { w: night ? 0.5 : quiet ? 0.25 : 0.1, fn: () => this.nap() },
      {
        w: C.levelFor(d.stats.xp || 0, catalog.levels).level >= 3 && d.stats.mood > 60 && !s.dnd && !this.bubble.busy() ? 0.25 : 0,
        fn: () => this.coax(chance(0.5) ? 'heart' : 'flower', { reason: 'idle' }),
      },
    ];
  }

  walkSpeed() {
    return 42 + (this.getLayout().petSize || 140) * 0.16;
  }

  startWalk(opts) {
    this.walking = true;
    if (opts.dir) this.view.setFacing(opts.dir);
    this.view.setPose('walk');
    this.api.pet.walk(opts);
  }

  stopWalking(silent = false) {
    if (!this.walking) return;
    this.walking = false;
    this.api.pet.stop();
    if (!silent && !this.task) this.resetBody();
  }

  idleWalk() {
    const dir = this.nextDir || (chance(0.5) ? 1 : -1);
    this.nextDir = 0;
    this.startWalk({ dir, distance: rand(70, 340), speed: this.walkSpeed() * rand(0.85, 1.15) });
  }

  idleFollow() {
    const c = this.cursor;
    const reach = 100 * ((this.getLayout().petSize || 140) / 140);
    if (!c || Math.abs(c.dx) < reach) return this.idleTwitch();
    this.startWalk({ toCursor: true, speed: this.walkSpeed() * 1.45 });
  }

  async idleLookAround() {
    const t = this.begin('look');
    if (!t) return;
    this.gazeLock = true;
    const side = chance(0.5) ? 1 : -1;
    this.view.lookAt(side, -0.1);
    if (!(await this.hold(t, rand(900, 1500)))) return;
    this.view.lookAt(-side, 0.1);
    if (!(await this.hold(t, rand(800, 1300)))) return;
    this.view.lookAt(0, 0);
    this.end(t);
  }

  async idleTwitch() {
    const t = this.begin('twitch');
    if (!t) return;
    this.view.twitchEar();
    if (!(await this.hold(t, 700))) return;
    if (chance(0.5)) {
      this.view.twitchEar();
      await this.hold(t, 600);
    }
    this.end(t);
  }

  async idleThink() {
    const t = this.begin('think');
    if (!t) return;
    this.gazeLock = true;
    this.view.setPose('think');
    this.view.lookAt(0.5, -0.8, false);
    const d = this.data;
    const fav = catalog.foods.find((f) => f.id === catalog.species.find((s) => s.id === d.pet.species)?.favorite);
    const pool = ['🍓', '🍰', '🎵', '⭐', '🌙', '🧋', '💕', '🌸', '☁️', '🍙', fav?.emoji || '🐟'];
    this.fx.thought(this.head(), C.pick(pool, 'think'));
    await this.hold(t, 2700);
    this.end(t);
  }

  async idleYawn() {
    const t = this.begin('yawn');
    if (!t) return;
    const h = new Date().getHours();
    if ((h >= 23 || h < 6) && chance(0.4) && !this.bubble.busy() && !this.data.settings.dnd) this.say(this.line('sleepy'), { duration: 2600 });
    this.view.setFace('closed', 'yawn');
    this.view.setPose('stretch');
    if (!(await this.hold(t, 1500))) return;
    this.view.setFace('sleepy', 'cat');
    await this.hold(t, 900);
    this.end(t);
  }

  async idleStretch() {
    const t = this.begin('stretch');
    if (!t) return;
    this.view.setPose('stretch');
    this.view.setPaws('stretch');
    this.view.setFace('closed', 'o');
    await this.hold(t, 2350);
    this.end(t);
  }

  async idleHop() {
    const t = this.begin('hop');
    if (!t) return;
    this.view.setPose('jump');
    this.view.setFace('happy', 'open');
    await this.hold(t, 800);
    this.end(t);
  }

  async idleSpin() {
    const t = this.begin('spin');
    if (!t) return;
    this.view.setPose('spin');
    this.view.setFace('happy', 'cat');
    this.fx.sparkles(this.head(), 3, 50);
    await this.hold(t, 950);
    this.end(t);
  }

  async idleHungry() {
    const t = this.begin('hungry');
    if (!t) return;
    this.view.setPaws('belly');
    this.view.setFace('sad', 'wavy');
    this.view.setFlag('ears-down', true);
    await this.hold(t, 2400);
    this.end(t);
  }

  async idleWave() {
    const c = this.cursor;
    if (!c || Math.hypot(c.dx, c.dy) > 420) return this.idleTwitch();
    const t = this.begin('wave');
    if (!t) return;
    this.view.setPaws('wave');
    this.view.setFace('happy', 'open');
    await this.hold(t, 1700);
    this.end(t);
  }

  // ---------- 睡觉 ----------
  nap() {
    this.goSleep('nap');
    this.napUntil = Date.now() + rand(40, 120) * 1000;
  }

  goSleep(reason = 'user', announce = false) {
    if (this.physical) return;
    this.cancelTask();
    this.stopWalking(true);
    if (this.mode === 'focus') return;
    if (announce) this.say(this.line('goSleep'), { duration: 2600 });
    this.mode = 'sleeping';
    this.sleepReason = reason;
    this.resetBody();
    this.loopZzz();
  }

  async wakeUp({ byPoke = false, quick = false } = {}) {
    if (this.mode !== 'sleeping') return;
    this.mode = 'awake';
    this.sleepReason = null;
    clearTimeout(this.zzzTimer);
    const t = this.begin('wake', PRI.event);
    if (!t) return;
    const v = this.view;
    if (quick) {
      v.setFace('surprised', 'o');
      await this.hold(t, 350);
      this.end(t);
      return;
    }
    v.setFace('sleepy', 'flat');
    if (!(await this.hold(t, 550))) return;
    v.setFace('closed', 'yawn');
    v.setPose('stretch');
    v.setPaws('stretch');
    if (byPoke) this.say(this.line('wakeByPoke'), { duration: 3000 });
    if (!(await this.hold(t, 1500))) return;
    v.setPaws('rest');
    v.setPose('idle');
    v.setFace('normal', 'cat');
    v.blink(true);
    await this.hold(t, 500);
    this.end(t);
  }

  async wakeForEvent() {
    if (this.mode === 'sleeping' && this.sleepReason !== 'away') await this.wakeUp({ quick: true });
  }

  // ---------- 闲聊 ----------
  scheduleChatter() {
    clearTimeout(this.chatTimer);
    const c = this.data.love.chatty;
    const [a, b] = c === 'high' ? [6, 13] : c === 'low' ? [45, 80] : [16, 32];
    this.chatTimer = setTimeout(() => this.chatter(), rand(a, b) * 60 * 1000);
  }

  canChat() {
    return this.mode === 'awake' && !this.physical && !this.task && !this.panelOpen && !this.data.settings.dnd && !this.bubble.busy();
  }

  chatter() {
    if (!this.canChat()) {
      this.chatTimer = setTimeout(() => this.chatter(), 60 * 1000);
      return;
    }
    const text = this.pickChatter();
    if (text) this.speak(text, chance(0.5) ? 'wave' : 'happy');
    this.scheduleChatter();
  }

  pickChatter() {
    const d = this.data;
    const notes = (d.love.notes || []).map((n) => n.text).filter(Boolean);
    const r = Math.random();
    if (notes.length && (r < 0.45 || !d.love.builtin)) {
      const note = C.pick(notes, 'note');
      const tpl = d.owner.sender ? C.pick(phrases.note, 'note-tpl') : '悄悄话时间💌 {note}';
      return C.fill(tpl, this.vars({ note }));
    }
    if (!d.love.builtin) return '';
    if (d.love.togetherSince && r < 0.58) return this.line('together');
    return this.line('idle');
  }

  // ---------- 鼠标 ----------
  onCursor(c) {
    this.cursor = { ...c, at: Date.now() };
    if (!this.data.settings.eyeTracking || this.gazeLock || this.physical || this.mode !== 'awake') return;
    const dist = Math.hypot(c.dx, c.dy);
    const nx = clamp(c.dx / 260, -1, 1);
    const ny = clamp(c.dy / 220, -1, 1);
    const near = dist < 90;
    this.view.lookAt(near ? nx * 0.5 : nx, near ? ny * 0.5 : ny, !near);
  }

  eyeTrackingChanged(on) {
    if (!on) this.view.lookAt(0, 0);
  }

  onHoverMove(dx, dy) {
    if (this.physical || this.panelOpen) return;
    const now = performance.now();
    const dt = Math.min(1, (now - (this.strokeT || now)) / 1000);
    this.strokeT = now;
    const d = Math.hypot(dx, dy);
    this.strokeEnergy = this.strokeEnergy * Math.exp(-dt / 0.5) + d;
    if (!this.stroking && this.strokeEnergy > 170) this.startStroke();
    if (!this.stroking) return;
    this.strokeTravel += d;
    if (this.strokeTravel > 120) {
      this.strokeTravel = 0;
      this.fx.hearts(this.head(), 1, 0.7);
      this.sound.play('heart');
    }
    clearTimeout(this.strokeEndTimer);
    this.strokeEndTimer = setTimeout(() => this.endStroke(), 650);
  }

  onHoverLeave() {
    this.strokeEnergy = 0;
    if (this.stroking) {
      clearTimeout(this.strokeEndTimer);
      this.strokeEndTimer = setTimeout(() => this.endStroke(), 250);
    }
  }

  startStroke() {
    this.strokeTravel = 0;
    const v = this.view;
    if (this.kneeling()) {
      this.bubble.dismiss('kneel-ask');
      this.forgiven();
      return;
    }
    if (this.task && this.task.name === 'forgiven') return;
    if (this.mode === 'sleeping') {
      this.stroking = 'sleep';
      v.setFlag('blush-strong', true);
      v.setFace('closed', 'cat');
      return;
    }
    if (this.mode === 'focus') return;
    const t = this.begin('stroke', PRI.user);
    if (!t) return;
    this.stroking = t;
    this.gazeLock = true;
    v.lookAt(0, 0, false);
    v.setFace('closed', 'cat');
    v.setFlag('blush-strong', true);
    v.setFlag('excited', true);
  }

  endStroke() {
    const t = this.stroking;
    this.stroking = null;
    this.strokeEnergy = 0;
    if (t === 'sleep') {
      this.resetBody();
      return;
    }
    if (!this.alive(t)) return;
    this.view.setFace('happy', 'cat');
    if (chance(0.55) && !this.bubble.busy()) this.say(this.line('stroke'));
    this.reward('stroke');
    setTimeout(() => this.end(t), 900);
  }

  reward(kind) {
    const table = {
      poke: [15000, { xp: 1, mood: 1 }],
      stroke: [8000, { xp: 1, mood: 3, counters: { pets: 1 }, daily: { pets: 1 } }],
      coax: [20000, { xp: 1, mood: 5, counters: { coax: 1 } }],
    };
    const cfg = table[kind];
    const now = Date.now();
    if (!cfg || now - (this.rewardAt[kind] || 0) < cfg[0]) return;
    this.rewardAt[kind] = now;
    this.api.bumpStats(cfg[1]);
  }

  kneeling() {
    return this.task && this.task.name === 'kneel';
  }

  async poke() {
    if (this.kneeling()) {
      this.sound.play('sob');
      if (!this.bubble.has('kneel-ask')) this.say(this.line('kneelWaiting'), { id: 'kneel-poke', duration: 2200 });
      return;
    }
    const now = Date.now();
    this.pokes = this.pokes.filter((x) => now - x < 3500);
    this.pokes.push(now);
    this.sound.play('squeak');
    if (this.mode === 'sleeping') return this.wakeUp({ byPoke: true });
    if (this.mode === 'focus') {
      this.view.setFace('wink', 'tongue');
      setTimeout(() => this.mode === 'focus' && !this.task && this.view.setFace('normal', 'cat'), 900);
      if (!this.bubble.busy()) this.say('（小声）专注中哦～加油！', { duration: 2400 });
      return;
    }
    if (this.pokes.length >= 5) {
      this.pokes = [];
      return this.annoyed();
    }
    const t = this.begin('poke', PRI.user);
    if (!t) return;
    const v = this.view;
    const lvl = C.levelFor(this.data.stats.xp || 0, catalog.levels).level;
    const kind = weighted([
      { w: 3, k: 'jump' },
      { w: 2, k: 'surprise' },
      { w: 2, k: 'wink' },
      { w: 1, k: 'spin' },
      { w: lvl >= 3 ? 1.6 : 0.5, k: 'love' },
      { w: 1, k: 'shy' },
    ]).k;
    switch (kind) {
      case 'jump':
        v.setPose('jump');
        v.setFace('happy', 'open');
        v.setFlag('excited', true);
        await this.hold(t, 760);
        break;
      case 'surprise':
        v.setFace('surprised', 'o');
        this.fx.mark(this.markPos(), '!');
        if (!(await this.hold(t, 520))) return;
        v.setFace('happy', 'open');
        v.setPose('bounce');
        await this.hold(t, 900);
        break;
      case 'wink':
        v.setFace('wink', 'tongue');
        await this.hold(t, 1100);
        break;
      case 'spin':
        v.setPose('spin');
        v.setFace('happy', 'cat');
        this.fx.sparkles(this.head(), 4, 50);
        await this.hold(t, 950);
        break;
      case 'love':
        v.setFace('heart', 'open');
        v.setFlag('blush-strong', true);
        this.fx.hearts(this.head(), 3);
        await this.hold(t, 1300);
        break;
      default:
        v.setPose('shy');
        v.setPaws('cover');
        v.setFace('closed', 'smile');
        v.setFlag('blush-strong', true);
        await this.hold(t, 1400);
        break;
    }
    if (chance(0.3) && !this.bubble.busy()) this.say(this.line('poke'));
    this.reward('poke');
    this.end(t);
  }

  async annoyed() {
    if (chance(0.4)) return this.kneel({ reason: 'poke' });
    const t = this.begin('annoyed', PRI.user);
    if (!t) return;
    const v = this.view;
    v.setPose('dizzy');
    v.setFace('dizzy', 'wavy');
    this.fx.mark(this.markPos(), '💢', '#FF6B6B');
    this.say(this.line('pokeMany'), { id: 'annoyed', duration: 3000 });
    await this.hold(t, 2300);
    this.end(t);
  }

  onDoubleClick() {
    if (this.physical) return;
    if (this.mode === 'sleeping') {
      this.wakeUp({ byPoke: true });
      return;
    }
    this.panel.toggle();
  }

  onPanelToggle(open) {
    this.panelOpen = open;
    if (open) {
      this.bubble.pause();
      this.stopWalking();
      if (!this.task && this.mode === 'awake') {
        this.view.setFace('happy', 'cat');
        this.view.setPaws('wave');
        setTimeout(() => {
          if (!this.task && this.mode === 'awake') this.resetBody();
        }, 900);
      }
    } else {
      this.bubble.resume();
    }
  }

  // ---------- 拖拽与摔落 ----------
  onMotion(e) {
    switch (e.type) {
      case 'walk-start':
        this.walking = true;
        this.view.setFacing(e.dir);
        if (!this.task) this.view.setPose('walk');
        break;
      case 'arrived':
        this.walking = false;
        if (e.blocked) this.nextDir = e.edge ? -e.edge : 0;
        if (!this.task && !this.physical) this.resetBody();
        break;
      case 'drag-start':
        this.onDragStart();
        break;
      case 'drag':
        this.tiltTarget = clamp(-e.vx / 45, -32, 32);
        break;
      case 'fall-start':
        this.onFallStart(e);
        break;
      case 'wall':
        this.view.setFace('squeeze', 'wavy');
        this.sound.play('boop');
        break;
      case 'bounce':
        this.view.setPose('land');
        this.sound.play('boing');
        setTimeout(() => this.physical === 'fall' && this.view.setPose('fall'), 180);
        break;
      case 'land':
        this.onLand(e);
        break;
      case 'drop':
        this.onDrop();
        break;
      default:
        break;
    }
  }

  onDragStart() {
    if (this.physical === 'drag') return;
    this.physical = 'drag';
    this.walking = false;
    if (this.task) this.task.cancelled = true;
    this.task = null;
    this.stroking = null;
    this.panel.close();
    if (this.mode === 'sleeping') {
      this.mode = 'awake';
      clearTimeout(this.zzzTimer);
    }
    const v = this.view;
    v.setProp(null);
    for (const f of ['blush-strong', 'excited', 'ears-down', 'typing']) v.setFlag(f, false);
    v.setPose('drag');
    v.setFace('surprised', 'o');
    v.setPaws('flail');
    v.lookAt(0, 0, false);
    this.sound.play('whoosh');
    this.tilt = 0;
    this.tiltVel = 0;
    this.tiltTarget = 0;
    this.runTilt();
    clearTimeout(this.dragT1);
    clearTimeout(this.dragT2);
    this.dragT1 = setTimeout(() => {
      if (this.physical !== 'drag') return;
      v.setFace('squeeze', 'wavy');
      v.setFlag('sweat', true);
    }, 650);
    this.dragT2 = setTimeout(() => {
      if (this.physical !== 'drag') return;
      v.setFace('happy', 'open');
      v.setFlag('sweat', false);
      v.setPaws('up');
    }, 3200);
    if (chance(0.4)) this.say(this.line('drag'), { id: 'drag', duration: 2200, silent: true });
  }

  runTilt() {
    cancelAnimationFrame(this.tiltRaf);
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const acc = -55 * (this.tilt - this.tiltTarget) - 7 * this.tiltVel;
      this.tiltVel += acc * dt;
      this.tilt += this.tiltVel * dt;
      this.tiltTarget *= Math.pow(0.08, dt);
      this.view.setTilt(this.tilt);
      if (this.physical === 'drag') this.tiltRaf = requestAnimationFrame(step);
      else this.view.setTilt(0);
    };
    this.tiltRaf = requestAnimationFrame(step);
  }

  clearDragTimers() {
    clearTimeout(this.dragT1);
    clearTimeout(this.dragT2);
    cancelAnimationFrame(this.tiltRaf);
    this.view.setFlag('sweat', false);
    this.view.setTilt(0);
  }

  onFallStart(e) {
    this.clearDragTimers();
    this.physical = 'fall';
    const v = this.view;
    v.setPose('fall');
    v.setFace('surprised', 'o');
    v.setPaws('up');
    if (Math.hypot(e.vx || 0, e.vy || 0) > 1400 && chance(0.6)) this.say('哇啊啊——', { id: 'drag', duration: 1600, silent: true });
  }

  async onLand({ impact = 0 }) {
    this.clearDragTimers();
    this.physical = null;
    const v = this.view;
    this.sound.play(impact > 1500 ? 'thud' : 'boing');
    const t = this.begin('land', PRI.user);
    if (!t) return;
    v.setPose('land');
    if (impact > 2600) {
      v.setFace('dizzy', 'wavy');
      if (await this.hold(t, 450)) {
        v.setPose('dizzy');
        this.fx.sparkles(this.head(), 5, 40);
        this.say(this.line('dizzy'), { id: 'land', duration: 3000 });
        await this.hold(t, 2600);
      }
    } else if (impact > 1500) {
      v.setFace('squeeze', 'wavy');
      if (await this.hold(t, 700)) {
        v.setFace('normal', 'cat');
        v.setPose('shake');
        await this.hold(t, 550);
      }
    } else {
      v.setFace('happy', 'cat');
      await this.hold(t, 650);
      if (chance(0.22) && !this.bubble.busy()) this.say(this.line('land'), { id: 'land' });
    }
    this.end(t);
    this.flushPending();
  }

  onDrop() {
    this.clearDragTimers();
    this.physical = null;
    this.view.setPose('land');
    this.view.setFace('happy', 'cat');
    setTimeout(() => {
      if (!this.task && !this.physical) this.resetBody();
    }, 600);
    this.flushPending();
  }

  flushPending() {
    const list = this.pending.splice(0);
    list.forEach((evt, i) => setTimeout(() => this.handleEvent(evt), 500 + i * 300));
  }

  // ---------- 主进程事件 ----------
  handleEvent(evt) {
    if (!evt || !evt.type) return;
    if (this.physical) {
      this.pending.push(evt);
      return;
    }
    this.processEvent(evt).catch((err) => console.error(err));
  }

  async processEvent(evt) {
    switch (evt.type) {
      case 'hello':
        return this.hello(evt);
      case 'say':
        await this.wakeForEvent();
        return this.speak(evt.text, evt.mood);
      case 'greet':
        await this.wakeForEvent();
        return this.speak(evt.text, 'wave');
      case 'weather':
        return this.weather(evt);
      case 'remind':
        return this.remind(evt);
      case 'hungry':
        return this.hungry(evt);
      case 'celebrate':
        return this.celebrate(evt.text, evt.reason);
      case 'levelup':
        return this.levelUp(evt);
      case 'letter':
        return this.letter(evt);
      case 'mood-ask':
        return this.moodAsk(evt);
      case 'profile-ask':
        return this.profileAsk(evt);
      case 'mood-recorded':
        return this.moodReact(evt);
      case 'away':
        return this.goSleep('away');
      case 'back':
        return this.back(evt);
      case 'focus-start':
        return this.focusStart(evt);
      case 'break-start':
        return this.breakStart(evt);
      case 'focus-done':
        return this.focusDone(evt);
      case 'break-done':
        return this.breakDone(evt);
      case 'focus-stop':
        return this.focusStop();
      default:
        return undefined;
    }
  }

  async gesture(name, pri, run) {
    if (this.mode !== 'awake') return;
    const t = this.begin(name, pri);
    if (!t) return;
    await run(t, this.view);
    this.end(t);
  }

  async speak(text, mood = 'happy') {
    if (!text) return;
    this.say(text);
    await this.gesture('speak', PRI.event, async (t, v) => {
      if (mood === 'wave') {
        v.setPaws('wave');
        v.setFace('happy', 'open');
      } else if (mood === 'cheer') {
        v.setPaws('cheer');
        v.setFace('happy', 'open');
        v.setPose('bounce');
      } else {
        v.setFace('happy', 'cat');
        v.setPose('bounce');
      }
      await this.hold(t, 1500);
    });
  }

  async hello(evt) {
    await sleep(400);
    this.say(evt.text, { priority: 'high', duration: 7500 });
    this.sound.play('chirp');
    await this.gesture('hello', PRI.event, async (t, v) => {
      v.setFace('happy', 'open');
      v.setPaws('wave');
      v.setPose('bounce');
      this.fx.hearts(this.head(), 4);
      this.fx.sparkles(this.head(), 6, 70);
      await this.hold(t, 2400);
    });
  }

  async weather(evt) {
    await this.wakeForEvent();
    this.say(evt.text, { duration: 9000 });
    await this.gesture('weather', PRI.event, async (t, v) => {
      this.gazeLock = true;
      v.setPose('think');
      v.lookAt(0.3, -1, false);
      await this.hold(t, 2200);
    });
  }

  async remind(evt) {
    await this.wakeForEvent();
    const kinds = {
      water: [['喝完啦 💧', 'done', true], ['等会儿', 'snooze']],
      stretch: [['动一动啦 🙆', 'done', true], ['等会儿', 'snooze']],
      eyes: [['好哒 👀', 'done', true], ['等会儿', 'snooze']],
      sleep: [['这就去睡 🌙', 'done', true], ['再玩一会儿', 'snooze']],
      custom: [['知道啦 ✓', 'done', true], ['10 分钟后', 'snooze']],
    };
    const buttons = (kinds[evt.kind] || kinds.custom).map(([label, value, primary]) => ({ label, value, primary }));
    this.sound.play('chime');
    this.say(evt.text, {
      id: 'remind-' + evt.id,
      priority: evt.kind === 'custom' ? 'high' : undefined,
      buttons,
      onButton: (val) => this.onReminderButton(evt, val),
    });
    await this.gesture('remind', PRI.event, async (t, v) => {
      switch (evt.kind) {
        case 'water':
          v.setPaws('hold');
          v.setProp('🥤', { y: 150, size: 32 });
          v.setFace('happy', 'cat');
          if (!(await this.hold(t, 900))) return;
          v.setFace('closed', 'chew');
          this.sound.play('gulp');
          await this.hold(t, 2200);
          break;
        case 'stretch':
          v.setPose('stretch');
          v.setPaws('stretch');
          v.setFace('closed', 'o');
          await this.hold(t, 2400);
          break;
        case 'eyes':
          v.setPaws('cover');
          v.setFace('closed', 'smile');
          await this.hold(t, 2400);
          break;
        case 'sleep':
          v.setFace('closed', 'yawn');
          v.setPose('stretch');
          if (!(await this.hold(t, 1600))) return;
          v.setFace('sleepy', 'cat');
          await this.hold(t, 1400);
          break;
        default:
          v.setPaws('wave');
          v.setFace('happy', 'open');
          this.fx.mark(this.markPos(), '🔔');
          await this.hold(t, 2000);
          break;
      }
    });
  }

  onReminderButton(evt, val) {
    const action = val === 'done' ? 'done' : val === 'snooze' ? 'snooze' : 'dismiss';
    this.api.reminderAck(evt.id, action);
    if (action === 'snooze') {
      this.say('好哦，那我过一会儿再提醒你～', { duration: 2600 });
    } else if (action === 'done') {
      if (evt.kind === 'sleep') {
        this.say(`晚安${this.vars().nick}，做个好梦～🌙`, { duration: 3000 });
        setTimeout(() => this.goSleep('user'), 1800);
      } else if (evt.kind !== 'water') {
        this.cheer(evt.kind === 'custom' ? '好哒！' : '真乖～', true);
      }
    }
  }

  async hungry(evt) {
    await this.wakeForEvent();
    this.say(evt.text, {
      id: 'hungry',
      buttons: [{ label: '喂它 🍓', value: 'feed', primary: true }, { label: '等会儿', value: 'later' }],
      onButton: (v) => {
        if (v === 'feed') this.panel.open('food');
      },
      duration: 20000,
    });
    await this.gesture('hungry', PRI.event, async (t, v) => {
      v.setPaws('belly');
      v.setFace('sad', 'wavy');
      v.setFlag('ears-down', true);
      await this.hold(t, 2600);
    });
  }

  async celebrate(text, reason) {
    await this.wakeForEvent();
    if (this.mode === 'sleeping') {
      this.mode = 'awake';
      clearTimeout(this.zzzTimer);
    }
    if (text) this.say(text, { priority: 'high', duration: 10000 });
    this.sound.play('sparkle');
    const h = this.head();
    this.fx.confetti({ x: h.x, y: h.y - 10 }, 26);
    this.fx.hearts(h, 5, 1.4);
    await this.gesture('celebrate', PRI.event, async (t, v) => {
      v.setPose('dance');
      v.setFace('happy', 'open');
      v.setPaws('cheer');
      v.setFlag('excited', true);
      if (reason === 'birthday') v.setProp('🎂', { y: 150, size: 30 });
      if (!(await this.hold(t, 1800))) return;
      this.fx.confetti({ x: h.x, y: h.y - 10 }, 18);
      await this.hold(t, 1900);
    });
  }

  async levelUp(evt) {
    await this.wakeForEvent();
    this.sound.play('levelup');
    this.say(evt.text, { priority: 'high', duration: 6000 });
    this.fx.sparkles(this.head(), 8, 70);
    await this.gesture('levelup', PRI.event, async (t, v) => {
      v.setPose('jump');
      v.setFace('heart', 'open');
      v.setPaws('cheer');
      await this.hold(t, 1600);
    });
  }

  async letter(evt) {
    await this.wakeForEvent();
    this.sound.play('chime');
    this.say(evt.text + (evt.title ? `\n「${evt.title}」` : ''), {
      id: 'letter-' + evt.id,
      priority: 'high',
      buttons: [{ label: '打开看看 💌', value: 'open', primary: true }, { label: '等会儿', value: 'later' }],
      onButton: (v) => {
        if (v === 'open') this.api.letters.open(evt.id);
        else if (v === 'later') this.say('好哦，想看的时候去「小窝 → 信箱」找它～', { duration: 3500 });
      },
      duration: 120000,
    });
    await this.gesture('letter', PRI.event, async (t, v) => {
      v.setPaws('hold');
      v.setProp('💌', { y: 150, size: 32 });
      v.setFace('happy', 'cat');
      v.setFlag('blush-strong', true);
      await this.hold(t, 4000);
    });
  }

  async moodAsk(evt) {
    await this.wakeForEvent();
    const moods = evt.moods || catalog.moods;
    this.say(evt.text || this.line('moodAsk'), {
      id: 'mood-ask',
      buttons: moods.map((m) => ({ label: m.emoji, value: m.id, emojiOnly: true, title: m.name })),
      onButton: (id) => {
        if (moods.some((m) => m.id === id)) this.api.recordMood(C.dateKey(), id, '');
      },
      duration: 60000,
    });
    await this.gesture('mood-ask', PRI.event, async (t, v) => {
      v.setPose('think');
      v.setFace('normal', 'smile');
      await this.hold(t, 2000);
    });
  }

  async profileAsk(evt) {
    await this.wakeForEvent();
    this.say(evt.text, {
      id: 'profile-ask',
      buttons: [{ label: '好呀 ✏️', value: 'yes', primary: true }, { label: '以后再说', value: 'later' }],
      onButton: (v) => {
        if (v === 'yes') this.api.openHome('profile');
        else if (v === 'later') {
          this.api.set('runtime.profileSkipped', true);
          this.say('好哦，想告诉我的时候，去「小窝 → 设置 → 我们的资料」就可以～', { duration: 4000 });
        }
      },
      duration: 120000,
    });
    await this.gesture('profile-ask', PRI.event, async (t, v) => {
      v.setPose('think');
      v.setFace('normal', 'smile');
      v.setFlag('blush-strong', true);
      await this.hold(t, 2200);
    });
  }

  async moodReact({ mood, text }) {
    await this.wakeForEvent();
    if (this.mode === 'awake' && !this.physical) {
      if (mood === 'angry') return this.kneel({ reason: 'angry' });
      if (mood === 'sad') {
        if (text) this.say(text, { duration: 5000 });
        // 抱抱和送花都不说话，回应她心情的那句话要完整显示
        await this.coax('hug', { quiet: true });
        return this.coax('flower', { reason: 'mood', quiet: true });
      }
      if (mood === 'tired') {
        if (text) this.say(text, { duration: 5000 });
        return this.coax('tea', { quiet: true });
      }
    }
    if (text) this.say(text, { duration: 5000 });
    await this.gesture('mood', PRI.event, async (t, v) => {
      const h = this.head();
      switch (mood) {
        case 'great':
          v.setPose('dance');
          v.setFace('happy', 'open');
          v.setPaws('cheer');
          this.fx.hearts(h, 4);
          this.fx.sparkles(h, 5);
          break;
        case 'good':
          v.setPose('jump');
          v.setFace('happy', 'open');
          this.fx.hearts(h, 2);
          break;
        case 'calm':
          v.setFace('closed', 'smile');
          v.setFlag('blush-strong', true);
          break;
        case 'tired':
          v.setPose('shy');
          v.setFace('closed', 'smile');
          v.setPaws('belly');
          this.fx.hearts(h, 2);
          break;
        case 'sad':
          v.setPose('shy');
          v.setFace('sad', 'smile');
          v.setPaws('cheer');
          this.fx.hearts(h, 5, 1.3);
          break;
        case 'angry':
          v.setPose('shake');
          v.setFace('squeeze', 'wavy');
          this.fx.mark(this.markPos(), '💢', '#FF6B6B');
          if (await this.hold(t, 900)) {
            v.setPose('bounce');
            v.setFace('happy', 'open');
            this.fx.hearts(h, 3);
          }
          break;
        default:
          break;
      }
      await this.hold(t, 2000);
    });
  }

  async back(evt) {
    if (this.mode === 'sleeping') await this.wakeUp({});
    if (evt.text) await this.speak(evt.text, 'wave');
  }

  // ---------- 番茄钟 ----------
  enterFocus() {
    if (this.mode === 'focus') return;
    this.cancelTask();
    this.stopWalking(true);
    clearTimeout(this.zzzTimer);
    this.mode = 'focus';
    this.panel.close();
    this.resetBody();
    this.scheduleFocusCheer();
  }

  // 专注时偶尔小声打个气（不打扰为主）
  scheduleFocusCheer() {
    clearTimeout(this.focusCheerTimer);
    this.focusCheerTimer = setTimeout(() => {
      if (this.mode !== 'focus') return;
      if (!this.bubble.busy() && !this.physical && !this.data.settings.dnd) this.say(this.line('focusCheer'), { duration: 2400, silent: true });
      this.scheduleFocusCheer();
    }, rand(9, 14) * 60 * 1000);
  }

  leaveFocus() {
    if (this.mode !== 'focus') return;
    clearTimeout(this.focusCheerTimer);
    this.mode = 'awake';
    if (!this.task) this.resetBody();
  }

  async focusStart(evt) {
    if (this.mode === 'sleeping') await this.wakeUp({ quick: true });
    this.enterFocus();
    if (evt.text) this.say(evt.text, { duration: 3500 });
  }

  async breakStart(evt) {
    this.leaveFocus();
    if (evt.text) this.say(evt.text, { duration: 5000 });
    await this.gesture('break', PRI.event, async (t, v) => {
      v.setPose('stretch');
      v.setPaws('stretch');
      v.setFace('closed', 'o');
      await this.hold(t, 2300);
    });
  }

  async focusDone(evt) {
    this.leaveFocus();
    this.sound.play('sparkle');
    if (evt.text) this.say(evt.text, { priority: 'high', duration: 6000 });
    const h = this.head();
    this.fx.confetti({ x: h.x, y: h.y }, 16);
    await this.gesture('focus-done', PRI.event, async (t, v) => {
      v.setPose('jump');
      v.setFace('happy', 'open');
      v.setPaws('cheer');
      await this.hold(t, 1500);
    });
  }

  breakDone(evt) {
    this.say(evt.text || '休息结束啦～', {
      id: 'break-done',
      buttons: [{ label: '再来一个 🍅', value: 'go', primary: true }, { label: '先不了', value: 'no' }],
      onButton: (v) => {
        if (v === 'go') this.api.pomodoro.start();
      },
      duration: 120000,
    });
    this.sound.play('chime');
  }

  focusStop() {
    this.leaveFocus();
  }

  syncPomodoro(p) {
    if (p.phase === 'focus' && p.running && this.mode !== 'focus' && !this.physical) this.enterFocus();
    if (p.phase !== 'focus' && this.mode === 'focus') this.leaveFocus();
  }

  // ---------- 小窝/菜单发来的命令 ----------
  handleCommand(cmd) {
    if (!cmd) return;
    if (this.physical) {
      if (cmd.type === 'say') this.say(cmd.text);
      return;
    }
    switch (cmd.type) {
      case 'feed':
        return this.feed(cmd.food);
      case 'play':
        return this.play();
      case 'pet':
        return this.petted();
      case 'say':
        return this.wakeForEvent().then(() => this.speak(cmd.text, 'happy'));
      case 'celebrate':
        return this.celebrate(cmd.text || '🎉🎉🎉', 'manual');
      case 'cheer':
        return this.cheer(cmd.text || (cmd.allDone ? this.line('todoAllDone') : undefined));
      case 'sleep':
        return this.goSleep('user', true);
      case 'wake':
        return this.wakeUp({});
      case 'mood-ask':
        return this.moodAsk({ text: this.line('moodAsk') });
      case 'fortune':
        return this.fortune();
      case 'coax':
        return this.coax(cmd.kind || 'random', { reason: cmd.reason || 'menu' });
      default:
        return undefined;
    }
  }

  async fortune() {
    if (this.mode === 'sleeping') await this.wakeUp({ quick: true });
    const text = await this.api.fortune();
    this.say(text, { duration: 9000, id: 'fortune' });
    this.sound.play('sparkle');
    this.fx.sparkles(this.head(), 6, 60);
    await this.gesture('fortune', PRI.user, async (t, v) => {
      this.gazeLock = true;
      v.setPose('think');
      v.setFace('closed', 'cat');
      v.lookAt(0, -1, false);
      if (!(await this.hold(t, 1200))) return;
      v.setFace('happy', 'open');
      v.setPose('bounce');
      await this.hold(t, 1200);
    });
  }

  async feed(foodId) {
    const food = catalog.foods.find((f) => f.id === foodId) || catalog.foods[0];
    const d = this.data;
    if (this.mode === 'sleeping') await this.wakeUp({ quick: true });
    if (this.mode === 'focus') {
      this.say('专注结束再吃吧～（其实有点想吃）', { duration: 2800 });
      return;
    }
    if (d.stats.fullness >= 96) {
      this.say(this.line('full'), { duration: 3000 });
      const t = this.begin('full', PRI.user);
      if (!t) return;
      this.view.setPose('shake');
      this.view.setFace('squeeze', 'cat');
      this.view.setPaws('belly');
      await this.hold(t, 1300);
      this.end(t);
      return;
    }
    const t = this.begin('feed', PRI.user);
    if (!t) return;
    const v = this.view;
    const fav = catalog.species.find((s) => s.id === d.pet.species)?.favorite === food.id;
    v.setPaws('hold');
    v.setProp(food.emoji, { y: 150, size: 34 });
    v.setFace(fav ? 'heart' : 'surprised', 'o');
    if (fav) this.fx.hearts(this.head(), 2);
    if (!(await this.hold(t, 600))) return;
    const mouth = this.anchor('mouth');
    for (let i = 0; i < 3; i++) {
      v.setFace('closed', 'chew');
      v.setPose('eat');
      this.sound.play('nom');
      this.fx.crumbs({ x: mouth.x, y: mouth.y + 10 * mouth.scale });
      if (!(await this.hold(t, 650))) return;
      v.setPropScale(0.72 - i * 0.26);
    }
    v.setProp(null);
    v.setPaws('rest');
    v.setPose('jump');
    v.setFace(fav ? 'heart' : 'happy', 'open');
    v.setFlag('excited', true);
    this.fx.hearts(this.head(), fav ? 5 : 3);
    this.sound.play('chirp');
    this.say(fav ? this.line('favorite', { food: food.name }) : food.line);
    this.api.bumpStats({ fullness: food.fill, mood: fav ? 8 : 4, xp: fav ? 3 : 2, counters: { feeds: 1 }, daily: { feeds: 1 } });
    await this.hold(t, 1300);
    this.end(t);
  }

  async play() {
    if (this.mode === 'sleeping') await this.wakeUp({ quick: true });
    if (this.mode === 'focus') {
      this.say('等专注完再玩～', { duration: 2400 });
      return;
    }
    const t = this.begin('play', PRI.user);
    if (!t) return;
    const v = this.view;
    this.say(this.line('play'), { duration: 2600 });
    v.setPose('play');
    v.setPaws('bat');
    v.setFace('happy', 'open');
    v.setFlag('excited', true);
    v.setProp('🧶', { x: 156, y: 172, size: 26 });
    const ball = () => this.view.svg.querySelector('.p-prop .bite');
    for (let i = 0; i < 4; i++) {
      const b = ball();
      if (b) {
        b.style.transition = 'transform .35s cubic-bezier(.3,1.4,.5,1)';
        b.style.transform = `translate(${i % 2 ? 4 : 16}px, ${i % 2 ? 0 : -8}px) rotate(${i * 90}deg)`;
      }
      this.sound.play('boop');
      if (!(await this.hold(t, 650))) return;
    }
    const b = ball();
    if (b) {
      b.style.transition = 'transform .9s ease-out, opacity .9s';
      b.style.transform = 'translate(70px, 0) rotate(540deg)';
      b.style.opacity = '0';
    }
    v.setPaws('rest');
    v.setFace('surprised', 'o');
    if (!(await this.hold(t, 500))) return;
    v.setPose('jump');
    v.setFace('happy', 'open');
    this.fx.hearts(this.head(), 3);
    this.api.bumpStats({ mood: 12, xp: 3, fullness: -3, counters: { plays: 1 } });
    await this.hold(t, 900);
    this.end(t);
    if (this.data.settings.walkAround) this.startWalk({ dir: this.view.state.facing, distance: rand(60, 140), speed: this.walkSpeed() * 1.6 });
  }

  async petted() {
    if (this.mode === 'sleeping') await this.wakeUp({ quick: true });
    const t = this.begin('petted', PRI.user);
    if (!t) return;
    const v = this.view;
    v.setFace('closed', 'cat');
    v.setFlag('blush-strong', true);
    v.setFlag('excited', true);
    v.setPose('shy');
    this.fx.hearts(this.head(), 4);
    this.sound.play('heart');
    this.say(this.line('stroke'), { duration: 2600 });
    this.reward('stroke');
    await this.hold(t, 1600);
    this.end(t);
  }

  // ---------- 哄她开心 ----------
  // 木牌立在宠物右边；右边被屏幕边缘挡住时放到左边
  signPos() {
    const h = this.head();
    const dx = 104 * h.scale;
    const clip = this.visible ? this.visible() : null;
    const x = clip && h.x + dx + 45 > clip.right ? h.x - dx : h.x + dx;
    return { x, y: h.y + 62 * h.scale };
  }

  coaxLine(key, forKey) {
    const d = this.data;
    if (forKey && d.owner.sender && chance(0.6)) return this.line(forKey);
    return this.line(key);
  }

  async coax(kind = 'random', { reason = 'menu', quiet = false } = {}) {
    if (this.physical) return;
    if (this.mode === 'sleeping') await this.wakeUp({ quick: true });
    if (this.mode === 'focus') {
      this.say('（小声）等专注完再哄你～', { duration: 2400 });
      return;
    }
    const kinds = ['kneel', 'bow', 'flower', 'heart', 'hug', 'kiss', 'tea', 'cute', 'roll', 'dance', 'praise'];
    if (kind === 'random') kind = C.pick(kinds, 'coax');
    if (kind === 'kneel') return this.kneel({ reason });
    const t = this.begin('coax-' + kind, PRI.user);
    if (!t) return;
    const v = this.view;
    const h = this.head();
    const say = (key, forKey) => {
      if (!quiet) this.say(this.coaxLine(key, forKey), { duration: 4000, interrupt: reason !== 'idle' });
    };
    switch (kind) {
      case 'bow':
        v.setPose('bow');
        v.setFace('plead', 'frown');
        v.setPaws('pray');
        say('bow');
        this.sound.play('sob');
        await this.hold(t, 2500);
        break;
      case 'flower':
        v.setPose('shy');
        v.setPaws('offer');
        v.setProp(chance(0.5) ? '💐' : '🌹', { y: 133, size: 38 });
        v.setFace('happy', 'cat');
        v.setFlag('blush-strong', true);
        say('flower', 'flowerFor');
        this.fx.hearts(h, 3);
        this.sound.play('chirp');
        await this.hold(t, 3400);
        break;
      case 'heart':
        v.setPaws('cheer');
        v.setFace('heart', 'open');
        v.setPose('bounce');
        this.fx.bigHeart({ x: h.x, y: h.y - 14 * h.scale });
        this.fx.hearts(h, 2);
        this.sound.play('heart');
        say('heart');
        await this.hold(t, 2600);
        break;
      case 'hug':
        v.setPaws('wide');
        v.setFace('happy', 'open');
        if (!(await this.hold(t, 900))) return;
        v.setPaws('belly');
        v.setPose('squeeze');
        v.setFace('closed', 'cat');
        v.setFlag('blush-strong', true);
        this.fx.hearts(h, 4, 1.3);
        this.sound.play('heart');
        say('hug');
        await this.hold(t, 2400);
        break;
      case 'kiss': {
        v.setFace('wink', 'kiss');
        v.setFlag('blush-strong', true);
        v.setPose('shy');
        const m = this.anchor('mouth');
        this.fx.kiss(m, this.view.state.facing);
        this.sound.play('kiss');
        say('kiss');
        if (!(await this.hold(t, 900))) return;
        this.fx.kiss(m, this.view.state.facing);
        await this.hold(t, 1800);
        break;
      }
      case 'tea':
        v.setPaws('offer');
        v.setProp('🧋', { y: 133, size: 36 });
        v.setFace('happy', 'cat');
        v.setPose('bounce');
        say('tea');
        this.sound.play('chirp');
        await this.hold(t, 3200);
        break;
      case 'cute':
        v.setPose('shy');
        v.setFace('plead', 'frown');
        v.setPaws('pray');
        v.setFlag('blush-strong', true);
        say('cute');
        this.sound.play('squeak');
        await this.hold(t, 3000);
        break;
      case 'roll':
        v.setPose('roll');
        v.setFace('squeeze', 'open');
        say('roll');
        this.sound.play('whoosh');
        if (!(await this.hold(t, 1650))) return;
        v.setPose('land');
        v.setFace('happy', 'open');
        this.fx.sparkles(h, 4, 50);
        await this.hold(t, 900);
        break;
      case 'dance':
        v.setPose('dance');
        v.setPaws('cheer');
        v.setFace('happy', 'open');
        v.setFlag('excited', true);
        this.fx.notes(h, 4);
        say('danceCoax');
        await this.hold(t, 3600);
        break;
      default:
        v.setPaws('cheer');
        v.setFace('heart', 'open');
        v.setPose('bounce');
        this.fx.sparkles(h, 6, 60);
        say('praise');
        this.sound.play('sparkle');
        await this.hold(t, 2800);
        break;
    }
    if (reason !== 'idle') this.reward('coax');
    this.end(t);
  }

  // 跪在搓衣板上认错，问她原不原谅；「哼」就接着跪（最多四轮），摸摸头也算原谅
  async kneel({ reason = 'menu', round = 1 } = {}) {
    if (this.physical) return;
    if (this.mode === 'sleeping') await this.wakeUp({ quick: true });
    if (this.mode === 'focus') return;
    if (round === 3) {
      // 第三轮先送花、递奶茶
      this.say(this.line('kneelGift'), { id: 'kneel', duration: 4200, priority: 'high', interrupt: true });
      // 送的时候她去做别的了（喂食、拖动……），就不接着跪了
      await this.coax('flower', { quiet: true });
      if (this.task || this.physical) return;
      await this.coax('tea', { quiet: true });
      if (this.task || this.physical) return;
    }
    const t = this.begin('kneel', PRI.user);
    if (!t) return;
    const v = this.view;
    v.setPose('kneel');
    v.setPaws('pray');
    v.setFace('plead', 'wavy');
    v.setFlag('sweat', round > 1);
    v.lookAt(0, 0, false);
    this.gazeLock = true;
    const signs = ['我错了', '原谅我', '最爱你', '等你原谅'];
    // 只收自己这块牌子：被打断的上一次下跪醒过来时，不能把新举起的牌子收掉
    const sign = this.fx.sign(this.signPos(), signs[Math.min(round, 4) - 1], round >= 4 ? 22000 : 60000);
    const d = this.data;
    let text;
    if (round === 1) {
      if (reason === 'poke') text = this.line('kneelPoke');
      else if (d.owner.sender && (reason === 'angry' || chance(0.5))) text = this.line('kneelFor');
      else text = this.line(reason === 'angry' ? 'kneelAngry' : 'kneel');
    } else text = this.line(round >= 4 ? 'kneelForever' : 'kneelAgain');
    this.say(text, { id: 'kneel', duration: 5200, priority: 'high', interrupt: true });
    this.sound.play('sob');
    // 分段等：被拖走时牌子要马上收起来，不能在原地多挂几秒
    const until = Date.now() + (round >= 4 ? 2500 : 5400);
    while (Date.now() < until && this.alive(t)) await sleep(250);
    if (!this.alive(t)) return this.fx.dropSign(sign, true);
    let answer = null;
    this.say(this.line('forgiveAsk'), {
      id: 'kneel-ask',
      priority: 'high',
      interrupt: true,
      buttons: [{ label: '原谅你啦 💗', value: 'yes', primary: true }, { label: '哼！', value: 'no' }],
      onButton: (val) => {
        answer = val;
      },
      duration: round >= 4 ? 20000 : 45000,
    });
    while (answer === null && this.alive(t)) await sleep(250);
    this.fx.dropSign(sign, true);
    if (!this.alive(t)) {
      // 被拖走或者被别的事打断了：收起还没回答的问题，免得按钮点了没反应
      if (answer === null) this.bubble.dismiss('kneel-ask');
      return;
    }
    this.end(t);
    if (answer === 'yes') return this.forgiven();
    if (answer === 'no' && round < 4) return this.kneel({ reason, round: round + 1 });
  }

  async forgiven() {
    this.fx.clearSigns();
    this.bubble.dismiss('kneel-ask');
    const t = this.begin('forgiven', PRI.user);
    if (!t) return;
    const v = this.view;
    const h = this.head();
    v.setPose('jump');
    v.setPaws('cheer');
    v.setFace('heart', 'open');
    v.setFlag('excited', true);
    this.fx.confetti({ x: h.x, y: h.y }, 20);
    this.fx.hearts(h, 5, 1.3);
    this.sound.play('levelup');
    this.say(this.line('forgiven'), { id: 'kneel', duration: 4000, priority: 'high', interrupt: true });
    this.api.bumpStats({ mood: 10, xp: 3, counters: { forgiven: 1 } });
    if (!(await this.hold(t, 800))) return;
    v.setPose('dance');
    await this.hold(t, 2000);
    this.end(t);
  }

  async cheer(text, quiet = false) {
    if (this.mode === 'sleeping') await this.wakeUp({ quick: true });
    if (!quiet || text) this.say(text || this.line('todoDone'), { duration: 3500 });
    this.sound.play('chirp');
    if (this.mode === 'focus') return;
    const t = this.begin('cheer', PRI.user);
    if (!t) return;
    const v = this.view;
    v.setPaws('cheer');
    v.setFace('happy', 'open');
    v.setPose('bounce');
    this.fx.hearts(this.head(), 3);
    this.fx.sparkles(this.head(), 4);
    await this.hold(t, 1600);
    this.end(t);
  }
}
