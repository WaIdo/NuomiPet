// 番茄钟。状态放在主进程，宠物窗口和小窝窗口都通过 'pomodoro:update' 同步。
const { EventEmitter } = require('events');

class Pomodoro extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.timer = null;
    this.completed = 0; // 本轮已完成的专注次数
    this.state = { phase: 'idle', running: false, paused: false, remaining: 0, total: 0, endsAt: 0 };
  }

  cfg() {
    const p = this.store.get('pomodoro') || {};
    const num = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || d)));
    return {
      focus: num(p.focus, 25, 1, 180),
      shortBreak: num(p.shortBreak, 5, 1, 60),
      longBreak: num(p.longBreak, 15, 1, 90),
      longEvery: num(p.longEvery, 4, 2, 12),
      autoBreak: p.autoBreak !== false,
    };
  }

  todayCount() {
    const { dateKey } = require('../shared/common');
    const daily = this.store.get('stats.daily') || {};
    return daily.date === dateKey() ? daily.pomodoros || 0 : 0;
  }

  snapshot() {
    const round = this.state.phase === 'focus' ? this.completed + 1 : Math.max(1, this.completed);
    return { ...this.state, round, completed: this.completed, longEvery: this.cfg().longEvery, todayCount: this.todayCount() };
  }

  begin(phase) {
    const c = this.cfg();
    const minutes = phase === 'focus' ? c.focus : phase === 'long' ? c.longBreak : c.shortBreak;
    const total = minutes * 60;
    this.state = { ...this.state, phase, running: true, paused: false, total, remaining: total, endsAt: Date.now() + total * 1000 };
    this.ensureTimer();
    this.emit('phase', { phase });
    this.broadcast();
  }

  start() {
    if (this.state.running && !this.state.paused && this.state.phase === 'focus') return this.snapshot();
    this.begin('focus');
    return this.snapshot();
  }

  pause() {
    if (!this.state.running || this.state.paused) return this.snapshot();
    this.state.remaining = Math.max(0, Math.ceil((this.state.endsAt - Date.now()) / 1000));
    this.state.paused = true;
    this.broadcast();
    return this.snapshot();
  }

  resume() {
    if (!this.state.paused) return this.snapshot();
    this.state.paused = false;
    this.state.endsAt = Date.now() + this.state.remaining * 1000;
    this.ensureTimer();
    this.broadcast();
    return this.snapshot();
  }

  stop() {
    const was = this.state.phase;
    this.state = { phase: 'idle', running: false, paused: false, remaining: 0, total: 0, endsAt: 0 };
    this.completed = 0;
    clearInterval(this.timer);
    this.timer = null;
    if (was !== 'idle') this.emit('stopped', { from: was });
    this.broadcast();
    return this.snapshot();
  }

  skip() {
    if (this.state.phase === 'idle') return this.snapshot();
    this.finish(true);
    return this.snapshot();
  }

  ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    const s = this.state;
    if (!s.running || s.paused) return;
    s.remaining = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
    if (s.remaining <= 0) this.finish(false);
    else this.broadcast();
  }

  finish(skipped) {
    const s = this.state;
    const c = this.cfg();
    const idle = () => {
      this.state = { phase: 'idle', running: false, paused: false, remaining: 0, total: 0, endsAt: 0 };
      clearInterval(this.timer);
      this.timer = null;
    };
    if (s.phase === 'focus') {
      this.completed += 1;
      const next = this.completed % c.longEvery === 0 ? 'long' : 'short';
      this.emit('focus-done', { minutes: Math.round(s.total / 60), skipped, next, autoBreak: c.autoBreak });
      if (c.autoBreak) this.begin(next);
      else {
        idle();
        this.broadcast();
      }
    } else if (s.phase === 'short' || s.phase === 'long') {
      if (s.phase === 'long') this.completed = 0;
      idle();
      this.emit('break-done', { skipped });
      this.broadcast();
    }
  }

  broadcast() {
    this.emit('update', this.snapshot());
  }
}

module.exports = { Pomodoro };
