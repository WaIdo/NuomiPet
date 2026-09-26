// 双击宠物弹出的快捷面板：喂食、哄我、玩耍、专注、心情、小窝。
import catalog from '../../shared/catalog.json' with { type: 'json' };
import { dateKey, levelFor } from '../shared/common.mjs';
import { em } from '../shared/emoji.js';

const MAIN = [
  { id: 'food', emoji: '🍓', label: '喂食' },
  { id: 'coax', emoji: '🥺', label: '哄我' },
  { id: 'play', emoji: '🧶', label: '玩耍' },
  { id: 'focus', emoji: '🍅', label: '专注' },
  { id: 'mood', emoji: '🌈', label: '心情' },
  { id: 'home', emoji: '🏠', label: '小窝' },
];

// 「哄我」里的动作
const COAX = [
  { id: 'kneel', emoji: '🙇', label: '跪搓衣板' },
  { id: 'flower', emoji: '💐', label: '送花' },
  { id: 'heart', emoji: '❤️', label: '比心' },
  { id: 'hug', emoji: '🤗', label: '抱抱' },
  { id: 'kiss', emoji: '😘', label: '亲亲' },
  { id: 'tea', emoji: em('🧋'), label: '奶茶' },
  { id: 'bow', emoji: '🙏', label: '鞠躬' },
  { id: 'cute', emoji: '🥺', label: '撒娇' },
  { id: 'roll', emoji: '🌀', label: '打滚' },
  { id: 'dance', emoji: '💃', label: '跳舞' },
  { id: 'praise', emoji: '🌟', label: '夸夸' },
  { id: 'random', emoji: '🎲', label: '随便哄' },
];

const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export class Panel {
  constructor(el, { api, anchor, visible, getData, getPomodoro, actions, onToggle, onNeedSpace }) {
    this.el = el;
    this.api = api;
    this.anchor = anchor;
    this.visible = visible;
    this.onNeedSpace = onNeedSpace; // 贴着屏幕边缘放不下面板时，让宠物往里挪
    this.getData = getData;
    this.getPomodoro = getPomodoro;
    this.actions = actions; // { feed(id), play(), openHome(page) }
    this.onToggle = onToggle;
    this.view = 'main';
    this.isOpen = false;
    this.hover = false;
    el.addEventListener('mouseenter', () => {
      this.hover = true;
      this.armAutoClose();
    });
    el.addEventListener('mouseleave', () => {
      this.hover = false;
      this.armAutoClose();
    });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(view = 'main') {
    this.view = view;
    this.isOpen = true;
    this.render();
    this.el.hidden = false;
    this.place();
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    this.armAutoClose();
    this.onToggle?.(true);
    const v = this.visible?.();
    if (v) {
      const need = this.el.offsetWidth + 12 - (v.right - v.left);
      if (need > 0) this.onNeedSpace?.(need, v);
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    clearTimeout(this.closeTimer);
    this.el.classList.remove('show');
    this.el.hidden = true;
    this.onToggle?.(false);
  }

  armAutoClose() {
    clearTimeout(this.closeTimer);
    if (!this.isOpen || this.hover) return;
    this.closeTimer = setTimeout(() => this.close(), 7000);
  }

  place() {
    if (this.el.hidden) return;
    const { x, y } = this.anchor();
    const stage = this.el.parentElement.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const { left: minX, right: maxX } = this.visible ? this.visible() : { left: 0, right: stage.width };
    const left = Math.max(minX + 6, Math.min(maxX - w - 6, x - w / 2));
    this.el.style.left = left + 'px';
    this.el.style.bottom = Math.max(4, stage.height - y + 4) + 'px';
    this.el.style.setProperty('--tail-x', Math.max(16, Math.min(w - 16, x - left)) + 'px');
  }

  refresh() {
    if (this.isOpen) {
      this.render();
      this.place();
    }
  }

  button(emoji, label, onClick, cls = '') {
    const b = document.createElement('button');
    b.className = 'pbtn ' + cls;
    const i = document.createElement('span');
    i.className = 'ico';
    i.textContent = emoji;
    const t = document.createElement('span');
    t.className = 'lbl';
    t.textContent = label;
    b.append(i, t);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  head(title) {
    const d = this.getData();
    const head = document.createElement('div');
    head.className = 'phead';
    if (title) {
      const back = document.createElement('button');
      back.className = 'back';
      back.textContent = '‹';
      back.title = '返回';
      back.addEventListener('click', (e) => {
        e.stopPropagation();
        this.open('main');
      });
      const t = document.createElement('span');
      t.className = 'ptitle';
      t.textContent = title;
      head.append(back, t);
    } else {
      const bar = (emoji, v, cls) => {
        const s = document.createElement('span');
        s.className = 'stat ' + cls;
        const i = document.createElement('i');
        i.textContent = emoji;
        const b = document.createElement('b');
        const fill = document.createElement('s');
        fill.style.width = Math.round(Math.max(3, Math.min(100, v))) + '%';
        b.append(fill);
        s.append(i, b);
        s.title = `${cls === 'full' ? '饱腹' : '心情'} ${Math.round(v)}`;
        return s;
      };
      const lv = levelFor(d.stats.xp || 0, catalog.levels);
      const chip = document.createElement('span');
      chip.className = 'lv';
      chip.textContent = `Lv.${lv.level}`;
      chip.title = lv.title;
      head.append(bar('🍙', d.stats.fullness, 'full'), bar('💗', d.stats.mood, 'mood'), chip);
    }
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.title = '收起';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    head.append(x);
    return head;
  }

  render() {
    const el = this.el;
    el.replaceChildren();
    this.focusLabel = null;
    this.titleEl = null;
    const body = document.createElement('div');
    body.className = 'pbody view-' + this.view;
    const d = this.getData();
    if (this.view === 'main') {
      el.append(this.head());
      for (const m of MAIN) {
        const b = this.button(m.emoji, m.label, () => this.pickMain(m.id), m.id === 'food' && d.stats.fullness < 30 ? 'pulse' : '');
        if (m.id === 'focus') this.focusLabel = b.querySelector('.lbl');
        body.append(b);
      }
    } else if (this.view === 'food') {
      el.append(this.head('喂点什么呢'));
      const fav = catalog.species.find((s) => s.id === d.pet.species)?.favorite;
      const foods = [...catalog.foods].sort((a, b) => (b.id === fav) - (a.id === fav));
      for (const f of foods) {
        body.append(
          this.button(f.emoji, f.name, () => {
            this.close();
            this.actions.feed(f.id);
          }, f.id === fav ? 'fav' : ''),
        );
      }
    } else if (this.view === 'coax') {
      el.append(this.head('要我怎么哄你？'));
      for (const c of COAX) {
        body.append(
          this.button(c.emoji, c.label, () => {
            this.close();
            this.actions.coax(c.id);
          }, c.id === 'kneel' ? 'fav' : ''),
        );
      }
    } else if (this.view === 'mood') {
      const today = d.moods?.[dateKey()];
      el.append(this.head(today ? '今天的心情（可以改哦）' : '今天心情怎么样？'));
      for (const m of catalog.moods) {
        body.append(
          this.button(m.emoji, m.name, () => {
            this.close();
            this.api.recordMood(dateKey(), m.id, today?.note || '');
          }, today?.mood === m.id ? 'on' : ''),
        );
      }
    } else if (this.view === 'focus') {
      const p = this.getPomodoro();
      el.append(this.head(this.focusTitle(p)));
      this.titleEl = el.querySelector('.ptitle');
      const pomo = this.api.pomodoro;
      if (p.phase === 'idle') {
        body.append(this.button('▶️', `专注 ${d.pomodoro.focus} 分钟`, () => pomo.start().then(() => this.close()), 'wide'));
      } else {
        body.append(
          p.paused ? this.button('▶️', '继续', () => pomo.resume()) : this.button('⏸️', '暂停', () => pomo.pause()),
          this.button('⏭️', '跳过', () => pomo.skip()),
          this.button('⏹️', '结束', () => pomo.stop()),
        );
      }
      body.append(this.button('⚙️', '设置', () => {
        this.close();
        this.actions.openHome('focus');
      }));
    }
    el.append(body);
    this.tick(this.getPomodoro());
  }

  focusTitle(p) {
    const names = { focus: '专注中', short: '短休息', long: '长休息' };
    return p.phase === 'idle' ? `番茄钟 · 今天 ${p.todayCount || 0} 个` : `${names[p.phase]} ${p.paused ? '（暂停）' : ''}${fmt(p.remaining)}`;
  }

  // 每秒只更新文字，不重建按钮（避免点击落空）
  tick(p) {
    if (!this.isOpen) return;
    if (this.view === 'focus' && this.titleEl) this.titleEl.textContent = this.focusTitle(p);
    if (this.view === 'main' && this.focusLabel) this.focusLabel.textContent = p.phase === 'idle' ? '专注' : fmt(p.remaining);
  }

  pickMain(id) {
    switch (id) {
      case 'food':
      case 'coax':
      case 'mood':
      case 'focus':
        this.view = id;
        this.render();
        this.place();
        break;
      case 'play':
        this.close();
        this.actions.play();
        break;
      case 'home':
        this.close();
        this.actions.openHome('overview');
        break;
      default:
        break;
    }
  }
}
