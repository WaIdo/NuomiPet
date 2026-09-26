// 定时事件：问候、喝水/久坐/护眼/早睡提醒、自定义提醒、纪念日、信件、饥饿、待办、心情打卡、离开/回来。
// 这里只决定「什么时候说什么」，具体的动作和气泡由宠物窗口完成。
const { powerMonitor, Notification } = require('electron');
const C = require('../shared/common');
const phrases = require('../shared/phrases.json');
const catalog = require('../shared/catalog.json');
const festivals = require('../shared/festivals.json');
const weather = require('./weather');

const AWAY_AFTER = 5 * 60; // 秒：多久没操作算离开
const MIN = 60 * 1000;

const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
const nowMin = (d) => d.getHours() * 60 + d.getMinutes();

class Scheduler {
  constructor({ store, pet, gift }) {
    this.store = store;
    this.pet = pet;
    this.gift = gift;
    this.away = false;
    this.activeSince = Date.now();
    this.lastSpoke = 0; // 上一次非紧急事件的时间，用来把事件错开
    this.timer = null;
    this.awayPoll = null;
  }

  get s() {
    return this.store.data;
  }

  vars(extra = {}) {
    const d = this.s;
    return {
      nick: d.owner.nickname || '宝贝',
      pet: d.pet.name || '糯米',
      sender: d.owner.sender || '',
      days: C.dayNumber(d.love.togetherSince) || '',
      knownDays: C.diffDays(C.todayParts(new Date(d.createdAt)), C.todayParts()) + 1,
      love: d.owner.sender ? `${d.owner.sender}让我告诉你：我爱你` : '有人很爱很爱你哦',
      ...extra,
    };
  }

  line(key, extra) {
    return C.fill(C.pick(phrases[key], key), this.vars(extra));
  }

  runtime(key, value) {
    this.store.set('runtime.' + key, value, { silent: true });
  }

  // 发给宠物。urgent 的事件（自定义提醒、番茄钟）不受节流限制。
  emit(evt, { urgent = false } = {}) {
    if (!urgent) this.lastSpoke = Date.now();
    this.pet.sendEvent(evt);
    if (urgent && !this.pet.isVisible() && Notification.isSupported()) {
      new Notification({ title: this.vars().pet, body: evt.text || '', silent: false }).show();
    }
  }

  canChat(gap = 45 * 1000) {
    return Date.now() - this.lastSpoke > gap;
  }

  quiet() {
    return !!this.s.settings.dnd;
  }

  inActiveHours(d) {
    const a = toMin(this.s.reminders.activeStart) ?? 0;
    const b = toMin(this.s.reminders.activeEnd) ?? 24 * 60;
    const n = nowMin(d);
    return a <= b ? n >= a && n <= b : n >= a || n <= b;
  }

  start() {
    const now = Date.now();
    // 第一次喝水提醒不要一启动就来
    const water = this.s.reminders.water.interval * MIN;
    if (now - (this.s.runtime.lastWater || 0) > water) this.runtime('lastWater', now - water * 0.6);
    const eyes = this.s.reminders.eyes.interval * MIN;
    if (now - (this.s.runtime.lastEyes || 0) > eyes) this.runtime('lastEyes', now - eyes * 0.5);
    this.decayStats(true);

    powerMonitor.on('lock-screen', () => this.goAway());
    powerMonitor.on('suspend', () => this.goAway());
    powerMonitor.on('unlock-screen', () => this.comeBack());
    powerMonitor.on('resume', () => this.comeBack());

    this.timer = setInterval(() => this.tick(), 15 * 1000);
    setTimeout(() => this.tick(), 8000);
  }

  // 启动时说的第一句话
  greetOnStartup() {
    const d = new Date();
    const today = C.dateKey(d);
    const h = d.getHours();
    if (!this.s.runtime.welcomed) {
      this.runtime('welcomed', true);
      this.runtime('welcomedAt', Date.now());
      this.store.set('runtime.greeted', { ...this.s.runtime.greeted, morning: today }, { silent: true });
      this.emit({ type: 'hello', text: this.line(this.s.owner.sender ? 'helloFrom' : 'hello') });
      // 第一次见面：打个招呼后不久就把欢迎信递过去
      setTimeout(() => {
        this.lastSpoke = 0;
        this.checkLetters(new Date());
      }, 14000);
      return;
    }
    if (h >= 5 && h < 11 && this.s.runtime.greeted?.morning !== today) {
      this.store.set('runtime.greeted', { ...this.s.runtime.greeted, morning: today }, { silent: true });
      this.morningGreeting();
      return;
    }
    this.emit({ type: 'say', text: this.line('startup'), mood: 'happy' });
  }

  fortuneText() {
    const v = this.vars();
    const f = C.fortune(C.dateKey() + v.nick, phrases.fortuneGood, phrases.fortuneBad);
    return C.fill(`🔮 今日运势 ${f.stars}\n宜：${f.good.join('、')}\n忌：${f.bad.join('、')}`, v);
  }

  async morningGreeting() {
    let text = this.line('morning');
    const days = C.dayNumber(this.s.love.togetherSince);
    if (days && Math.random() < 0.5) text += '\n' + this.line('together', { days });
    else if (Math.random() < 0.5) text += '\n' + this.fortuneText();
    this.emit({ type: 'greet', period: 'morning', text });
    if (this.s.weather.enabled && this.s.weather.lat != null) {
      const w = await weather.current(this.s.weather);
      if (w.ok) {
        const t = `${w.emoji} 今天${w.city || ''}${w.desc}，${w.min}~${w.max}°C。${w.advice}`;
        setTimeout(() => this.emit({ type: 'weather', text: t, emoji: w.emoji }), 9000);
      }
    }
  }

  // ---------- 离开 / 回来 ----------
  goAway(idleSec = AWAY_AFTER) {
    if (this.away) return;
    this.away = true;
    this.awayAt = Date.now() - idleSec * 1000;
    this.emit({ type: 'away' }, { urgent: true });
    clearInterval(this.awayPoll);
    this.awayPoll = setInterval(() => {
      if (powerMonitor.getSystemIdleTime() < 3) this.comeBack();
    }, 2000);
  }

  comeBack() {
    if (!this.away) return;
    this.away = false;
    clearInterval(this.awayPoll);
    const minutes = Math.round((Date.now() - (this.awayAt || Date.now())) / MIN);
    this.activeSince = Date.now();
    this.runtime('lastEyes', Date.now());
    const text = minutes >= 10 ? this.line('welcomeBack') : '';
    this.emit({ type: 'back', minutes, text }, { urgent: true });
    this.lastSpoke = Date.now();
  }

  // ---------- 主循环 ----------
  tick() {
    const d = new Date();
    const idle = powerMonitor.getSystemIdleTime();
    this.decayStats();
    this.rollDaily(d);
    this.checkCustom(d);
    if (idle >= AWAY_AFTER) {
      this.goAway(idle);
      return;
    }
    if (this.away) this.comeBack();
    this.runtime('lastSeen', Date.now());

    // 以下事件每次最多触发一个，彼此至少间隔 45 秒
    const checks = [
      () => this.checkTips(),
      () => this.checkMorning(d),
      () => this.checkCelebrations(d),
      () => this.checkLetters(d),
      () => this.checkMeals(d),
      () => this.checkSleep(d),
      () => this.checkWater(d),
      () => this.checkStretch(d),
      () => this.checkEyes(d),
      () => this.checkMoodAsk(d),
      () => this.checkTodos(d),
      () => this.checkHunger(d),
      () => this.checkSoon(d),
    ];
    if (!this.canChat()) return;
    for (const check of checks) if (check()) break;
  }

  rollDaily(d) {
    const today = C.dateKey(d);
    const st = this.s.stats;
    if (st.daily?.date !== today) {
      this.store.set('stats.daily', { date: today, water: 0, pomodoros: 0, focusMinutes: 0, pets: 0, feeds: 0 });
    }
  }

  decayStats(onStartup = false) {
    const st = this.s.stats;
    const now = Date.now();
    let elapsed = (now - (st.lastTick || now)) / MIN;
    if (elapsed < 1 && !onStartup) return;
    elapsed = Math.min(elapsed, 8 * 60); // 关机再久也最多按 8 小时算
    const fullness = Math.max(0, st.fullness - elapsed / 9);
    const mood = Math.max(20, st.mood - elapsed / 20);
    const changed = Math.round(fullness) !== Math.round(st.fullness) || Math.round(mood) !== Math.round(st.mood);
    this.store.set('stats.fullness', Math.round(fullness * 10) / 10, { silent: !changed });
    this.store.set('stats.mood', Math.round(mood * 10) / 10, { silent: !changed });
    this.store.set('stats.lastTick', now, { silent: true });
  }

  once(key, today) {
    const g = this.s.runtime.greeted || {};
    if (g[key] === today) return false;
    this.store.set('runtime.greeted', { ...g, [key]: today }, { silent: true });
    return true;
  }

  // 刚认识的前 15 分钟，分几次教她怎么和宠物玩
  checkTips() {
    const rt = this.s.runtime;
    const n = rt.tipsShown || 0;
    const at = [1, 3, 6, 10, 15];
    if (!rt.welcomedAt || n >= phrases.tips.length) return false;
    if (Date.now() - rt.welcomedAt < at[n] * MIN) return false;
    this.runtime('tipsShown', n + 1);
    const hotkey = process.platform === 'darwin' ? '⌘ + ⌥ + P' : 'Ctrl + Alt + P';
    this.emit({ type: 'say', text: C.fill(phrases.tips[n], this.vars({ hotkey })), mood: 'wave' });
    return true;
  }

  checkMorning(d) {
    const h = d.getHours();
    if (h < 5 || h >= 11) return false;
    if (!this.once('morning', C.dateKey(d))) return false;
    this.morningGreeting();
    return true;
  }

  checkMeals(d) {
    if (this.quiet() || !this.s.reminders.meals?.enabled) return false;
    const n = nowMin(d);
    const today = C.dateKey(d);
    if (n >= 11 * 60 + 50 && n <= 13 * 60 && this.once('noon', today)) {
      this.emit({ type: 'greet', period: 'noon', text: this.line('noon') });
      return true;
    }
    if (n >= 17 * 60 + 50 && n <= 19 * 60 + 30 && this.once('evening', today)) {
      this.emit({ type: 'greet', period: 'evening', text: this.line('evening') });
      return true;
    }
    return false;
  }

  checkSleep(d) {
    const r = this.s.reminders.sleep;
    if (!r?.enabled || this.quiet()) return false;
    const t = toMin(r.time);
    if (t == null) return false;
    const n = nowMin(d);
    const dawn = 5 * 60;
    // 过了设定的睡觉时间，一直到早上 5 点都算「该睡了」；设定时间本身在凌晨时只看凌晨这一段
    const late = t < dawn ? n >= t && n < dawn : n >= t || n < dawn;
    if (!late) return false;
    const last = this.s.runtime.lastSleepNag || 0;
    if (Date.now() - last < 30 * MIN) return false;
    this.runtime('lastSleepNag', Date.now());
    this.emit({ type: 'remind', kind: 'sleep', id: 'sleep', text: this.line('night') });
    return true;
  }

  checkWater(d) {
    const r = this.s.reminders.water;
    if (!r?.enabled || this.quiet() || !this.inActiveHours(d)) return false;
    if (Date.now() - (this.s.runtime.lastWater || 0) < r.interval * MIN) return false;
    this.runtime('lastWater', Date.now());
    this.emit({ type: 'remind', kind: 'water', id: 'water', text: this.line('water') });
    return true;
  }

  checkStretch(d) {
    const r = this.s.reminders.stretch;
    if (!r?.enabled || this.quiet() || !this.inActiveHours(d)) return false;
    if (Date.now() - this.activeSince < r.interval * MIN) return false;
    this.activeSince = Date.now();
    this.emit({ type: 'remind', kind: 'stretch', id: 'stretch', text: this.line('stretch') });
    return true;
  }

  checkEyes(d) {
    const r = this.s.reminders.eyes;
    if (!r?.enabled || this.quiet() || !this.inActiveHours(d)) return false;
    if (Date.now() - (this.s.runtime.lastEyes || 0) < r.interval * MIN) return false;
    this.runtime('lastEyes', Date.now());
    this.emit({ type: 'remind', kind: 'eyes', id: 'eyes', text: this.line('eyes') });
    return true;
  }

  checkCustom(d) {
    const list = this.s.reminders.custom || [];
    if (!list.length) return;
    const today = C.dateKey(d);
    const n = nowMin(d);
    const dow = d.getDay();
    let changed = false;
    const next = list.map((r) => {
      if (!r.enabled || r.lastFired === today) return r;
      const t = toMin(r.time);
      if (t == null || n < t || n - t > 3) return r;
      if (r.repeat === 'weekdays' && (dow === 0 || dow === 6)) return r;
      if (r.repeat === 'weekends' && dow !== 0 && dow !== 6) return r;
      if (r.repeat === 'once' && r.date && r.date !== today) return r;
      changed = true;
      this.emit({ type: 'remind', kind: 'custom', id: r.id, text: `⏰ ${r.text || '提醒时间到啦'}` }, { urgent: true });
      return { ...r, lastFired: today, enabled: r.repeat === 'once' ? false : r.enabled };
    });
    if (changed) this.store.set('reminders.custom', next);
  }

  checkHunger() {
    if (this.quiet() || this.s.stats.fullness >= 30) return false;
    if (Date.now() - (this.s.runtime.lastHungry || 0) < 90 * MIN) return false;
    this.runtime('lastHungry', Date.now());
    this.emit({ type: 'hungry', text: this.line('hungry') });
    return true;
  }

  checkTodos(d) {
    if (this.quiet()) return false;
    const n = nowMin(d);
    const slot = n >= 10 * 60 + 30 && n < 11 * 60 + 30 ? 'todoAM' : n >= 15 * 60 && n < 16 * 60 ? 'todoPM' : null;
    if (!slot) return false;
    const left = (this.s.todos || []).filter((t) => !t.done).length;
    if (!left) return false;
    if (!this.once(slot, C.dateKey(d))) return false;
    this.emit({ type: 'say', text: this.line('todoNudge', { n: left }), mood: 'cheer' });
    return true;
  }

  checkMoodAsk(d) {
    if (this.quiet()) return false;
    const n = nowMin(d);
    if (n < 20 * 60 + 30 || n > 23 * 60 + 30) return false;
    const today = C.dateKey(d);
    if (this.s.moods?.[today]) return false;
    if (!this.once('moodAsk', today)) return false;
    this.emit({ type: 'mood-ask', text: this.line('moodAsk'), moods: catalog.moods });
    return true;
  }

  // 生日、在一起周年、整百天、自定义纪念日（当天）
  checkCelebrations(d) {
    const today = C.dateKey(d);
    const love = this.s.love;
    const celebrated = this.s.runtime.celebrated || {};
    const fire = (key, evt) => {
      if (celebrated[key] === today) return false;
      this.store.set('runtime.celebrated', { ...celebrated, [key]: today }, { silent: true });
      this.emit({ type: 'celebrate', ...evt });
      return true;
    };
    const bday = C.nextYearly(love.birthday, d);
    if (bday?.isToday && fire('birthday', { reason: 'birthday', text: this.line('birthday') })) return true;
    const together = C.nextYearly(love.togetherSince, d);
    if (together?.isToday && together.years > 0 && fire('together', { reason: 'anniversary', text: this.line('anniversary', { years: together.years }) }))
      return true;
    const days = C.dayNumber(love.togetherSince, d);
    if (days && C.isMilestone(days) && fire('milestone', { reason: 'milestone', text: this.line('milestone', { days }) })) return true;
    for (const a of love.anniversaries || []) {
      let hit = false;
      if (a.kind === 'yearly') hit = !!C.nextYearly(a.date, d)?.isToday;
      else if (a.kind === 'countdown') hit = C.daysUntil(a.date, d) === 0;
      else if (a.kind === 'since') {
        const n = C.dayNumber(a.date, d);
        hit = !!n && C.isMilestone(n);
      }
      if (hit && fire('a-' + a.id, { reason: 'event', text: this.line('eventToday', { name: a.name }) })) return true;
    }
    // 通用节日排在她自己的纪念日后面
    const fest = C.festivalOf(festivals, d);
    if (fest && fire('fest-' + fest.name, { reason: 'festival', text: C.fill(fest.text, this.vars()) })) return true;
    return false;
  }

  // 提前几天提醒生日和纪念日
  checkSoon(d) {
    if (this.quiet()) return false;
    const today = C.dateKey(d);
    const love = this.s.love;
    const soonDays = [1, 3, 7];
    const bday = C.nextYearly(love.birthday, d);
    if (bday && soonDays.includes(bday.daysLeft) && this.once('soon-bday', today)) {
      this.emit({ type: 'say', text: this.line('birthdaySoon', { n: bday.daysLeft }), mood: 'happy' });
      return true;
    }
    for (const a of love.anniversaries || []) {
      const left = a.kind === 'yearly' ? C.nextYearly(a.date, d)?.daysLeft : a.kind === 'countdown' ? C.daysUntil(a.date, d) : null;
      if (left != null && soonDays.includes(left) && this.once('soon-' + a.id, today)) {
        this.emit({ type: 'say', text: this.line('eventSoon', { n: left, name: a.name }), mood: 'happy' });
        return true;
      }
    }
    return false;
  }

  lettersState(d = new Date()) {
    const read = this.s.letters?.read || {};
    return (this.gift.letters || []).map((l) => {
      const left = l.unlock ? C.daysUntil(l.unlock, d) : 0;
      const unlocked = left == null || left <= 0;
      return {
        id: l.id,
        title: l.title || '一封信',
        from: l.from || '',
        unlock: l.unlock || '',
        unlocked,
        daysLeft: unlocked ? 0 : left,
        read: !!read[l.id],
        body: unlocked ? l.body : undefined,
        preview: unlocked ? String(l.body).replace(/\s+/g, ' ').slice(0, 40) : '',
      };
    });
  }

  checkLetters(d) {
    const notified = this.s.letters?.notified || {};
    const fresh = this.lettersState(d).find((l) => l.unlocked && !l.read && !notified[l.id]);
    if (!fresh) return false;
    this.store.set('letters.notified', { ...notified, [fresh.id]: Date.now() }, { silent: true });
    this.emit({ type: 'letter', id: fresh.id, title: fresh.title, text: this.line('letter') });
    return true;
  }

  // 用户点了提醒气泡上的按钮
  ack(id, action) {
    if (action === 'snooze') {
      if (id === 'water') this.runtime('lastWater', Date.now() - (this.s.reminders.water.interval - 10) * MIN);
      else if (id === 'eyes') this.runtime('lastEyes', Date.now() - (this.s.reminders.eyes.interval - 10) * MIN);
      else if (id === 'stretch') this.activeSince = Date.now() - (this.s.reminders.stretch.interval - 10) * MIN;
      else if (id === 'sleep') this.runtime('lastSleepNag', Date.now() - 20 * MIN);
      else {
        const r = (this.s.reminders.custom || []).find((x) => x.id === id);
        if (r) setTimeout(() => this.emit({ type: 'remind', kind: 'custom', id: r.id, text: `⏰ ${r.text || '提醒时间到啦'}` }, { urgent: true }), 10 * MIN);
      }
    }
    return action;
  }
}

module.exports = { Scheduler };
