// 双击宠物弹出的快捷面板：喂食、哄我、玩耍、专注、心情、小窝、来接我。
import catalog from '../../shared/catalog.json' with { type: 'json' };
import { dateKey, levelFor } from '../shared/common.mjs';
import { em, t, dirOf, getLang } from '../shared/i18n.mjs';

// 按钮上的字在显示时按 id 取（pet.panel.main.<id>、pet.panel.coax.<id>），换语言后重绘就是新的
const MAIN = [
  { id: 'food', emoji: '🍓' },
  { id: 'coax', emoji: '🥺' },
  { id: 'play', emoji: '🧶' },
  { id: 'focus', emoji: '🍅' },
  { id: 'mood', emoji: '🌈' },
  { id: 'home', emoji: '🏠' },
  { id: 'pickup', emoji: '🚗' }, // 字在 pet.pickup.button
];

// 「来接我」：什么时候来（mochi.mail.pickup 的 when）；她写的一句话最多 60 字（主进程也会截断）
const WHEN = ['now', '30', '60'];
const NOTE_MAX = 60;

// 「哄我」里的动作
const COAX = [
  { id: 'kneel', emoji: '🙇' },
  { id: 'flower', emoji: '💐' },
  { id: 'heart', emoji: '❤️' },
  { id: 'hug', emoji: '🤗' },
  { id: 'kiss', emoji: '😘' },
  { id: 'tea', emoji: em('🧋') },
  { id: 'bow', emoji: '🙏' },
  { id: 'cute', emoji: '🥺' },
  { id: 'roll', emoji: '🌀' },
  { id: 'dance', emoji: '💃' },
  { id: 'praise', emoji: '🌟' },
  { id: 'random', emoji: '🎲' },
];

const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

// 叫谁来接：她设置的署名；没填就用通用的称呼（他）。
// 从右往左的界面（阿拉伯文）里用 Unicode 隔离符（FSI … PDI）包起来，名字里的标点、数字不会跑到句子另一头
const senderOf = (d) => {
  const s = String((d && d.owner && d.owner.sender) || '').trim() || t('main.mail.him');
  return dirOf(getLang()) === 'rtl' ? `\u2068${s}\u2069` : s;
};

export class Panel {
  constructor(el, { api, anchor, visible, getData, getPomodoro, actions, onToggle, onNeedSpace }) {
    this.el = el;
    this.api = api;
    this.anchor = anchor;
    this.visible = visible;
    this.onNeedSpace = onNeedSpace; // 贴着屏幕边缘放不下面板时，让宠物往里挪
    this.getData = getData;
    this.getPomodoro = getPomodoro;
    this.actions = actions; // { feed(id), play(), coax(kind), openHome(page), pickupNotReady(), pickupResult(r) }
    this.onToggle = onToggle;
    this.view = 'main';
    this.isOpen = false;
    this.hover = false;
    // 「来接我」填到一半的内容：换语言重绘、发送失败以后再打开都还在
    this.pickup = { when: 'now', note: '', sending: false };
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
    if (this.view === 'pickup') {
      // 正在输入（鼠标可能已经移开了）或者正在发：不收起；否则多等一会儿，给她时间想想写什么
      if (this.pickup.sending || (document.hasFocus() && this.el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) return;
      this.closeTimer = setTimeout(() => this.close(), 30000);
      return;
    }
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
    // 面板比头顶上方的空间还高时（外文的按钮字折成两行）往下挪，压住一点头顶，不让窗口顶边切掉
    const bottom = Math.max(4, stage.height - y + 4);
    this.el.style.bottom = Math.min(bottom, stage.height - this.el.offsetHeight - 4) + 'px';
    this.el.style.setProperty('--tail-x', Math.max(16, Math.min(w - 16, x - left)) + 'px');
  }

  // reason：'lang' 换了语言、'owner' 改了署名、'stats' 状态值变了、'pomodoro' 番茄钟换了阶段。
  // 「来接我」只在换语言、改署名时重绘：她正在打字（可能正在用输入法拼字），别的变化不要把输入框重建掉
  refresh(reason) {
    if (!this.isOpen) return;
    if (this.view === 'pickup' && reason !== 'lang' && reason !== 'owner') return;
    this.render();
    this.place();
  }

  button(emoji, label, onClick, cls = '') {
    const b = document.createElement('button');
    b.className = 'pbtn ' + cls;
    const i = document.createElement('span');
    i.className = 'ico';
    i.textContent = emoji;
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = label;
    b.append(i, lbl);
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
      back.textContent = '‹'; // 会镜像的字符：从右往左的界面里自动显示成「›」，不用另外处理
      back.title = t('common.back');
      back.addEventListener('click', (e) => {
        e.stopPropagation();
        this.open('main');
      });
      const name = document.createElement('span');
      name.className = 'ptitle';
      name.textContent = title;
      head.append(back, name);
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
        const n = Math.round(v);
        s.title = cls === 'full' ? t('pet.panel.stat.full', { n }) : t('pet.panel.stat.mood', { n });
        return s;
      };
      const lv = levelFor(d.stats.xp || 0, catalog.levels);
      const chip = document.createElement('span');
      chip.className = 'lv';
      chip.textContent = t('pet.panel.level', { n: lv.level });
      chip.title = lv.title;
      head.append(bar('🍙', d.stats.fullness, 'full'), bar('💗', d.stats.mood, 'mood'), chip);
    }
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.title = t('pet.panel.collapse');
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    head.append(x);
    return head;
  }

  render() {
    const el = this.el;
    // 重绘前正在「来接我」的输入框里打字：重绘后把光标放回去
    const input = el.contains(document.activeElement) && document.activeElement.classList.contains('pk-note') ? document.activeElement : null;
    const caret = input ? [input.selectionStart, input.selectionEnd] : null;
    el.replaceChildren();
    this.focusLabel = null;
    this.titleEl = null;
    const body = document.createElement('div');
    body.className = 'pbody view-' + this.view;
    const d = this.getData();
    if (this.view === 'main') {
      el.append(this.head());
      for (const m of MAIN) {
        const label = m.id === 'pickup' ? t('pet.pickup.button') : t(`pet.panel.main.${m.id}`);
        const b = this.button(m.emoji, label, () => this.pickMain(m.id), m.id === 'food' && d.stats.fullness < 30 ? 'pulse' : '');
        if (m.id === 'focus') this.focusLabel = b.querySelector('.lbl');
        body.append(b);
      }
    } else if (this.view === 'food') {
      el.append(this.head(t('pet.panel.title.food')));
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
      el.append(this.head(t('pet.panel.title.coax')));
      for (const c of COAX) {
        body.append(
          this.button(c.emoji, t(`pet.panel.coax.${c.id}`), () => {
            this.close();
            this.actions.coax(c.id);
          }, c.id === 'kneel' ? 'fav' : ''),
        );
      }
    } else if (this.view === 'mood') {
      const today = d.moods?.[dateKey()];
      el.append(this.head(today ? t('pet.panel.title.moodRecorded') : t('pet.panel.title.mood')));
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
        body.append(this.button('▶️', t('pet.panel.focus.start', { n: d.pomodoro.focus }), () => pomo.start().then(() => this.close()), 'wide'));
      } else {
        body.append(
          p.paused ? this.button('▶️', t('pet.panel.focus.resume'), () => pomo.resume()) : this.button('⏸️', t('pet.panel.focus.pause'), () => pomo.pause()),
          this.button('⏭️', t('pet.panel.focus.skip'), () => pomo.skip()),
          this.button('⏹️', t('pet.panel.focus.stop'), () => pomo.stop()),
        );
      }
      body.append(this.button('⚙️', t('pet.panel.focus.settings'), () => {
        this.close();
        this.actions.openHome('focus');
      }));
    } else if (this.view === 'pickup') {
      el.append(this.head(t('pet.pickup.title', { sender: senderOf(d) })));
      this.renderPickup(body, caret);
    }
    el.append(body);
    this.tick(this.getPomodoro());
    // 面板这时可能还没显示（open() 里先 render 再显示），等到下一帧再量
    requestAnimationFrame(() => this.fitLabels());
  }

  // 按钮上的字一行放不下：先缩小字号（最小 9px），还不行就折成两行
  fitLabels() {
    // 用小数宽度量（scrollWidth 是取整的，会差不到 1px）
    const range = document.createRange();
    const textWidth = (el) => {
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width;
    };
    for (const lbl of this.el.querySelectorAll('.pbtn .lbl')) {
      lbl.classList.remove('wrap');
      lbl.style.fontSize = '';
      const room = lbl.getBoundingClientRect().width;
      const w = textWidth(lbl);
      if (!room || w <= room) continue;
      let size = Math.floor(((10.5 * room) / w) * 4) / 4;
      while (size >= 9) {
        lbl.style.fontSize = size + 'px';
        if (textWidth(lbl) <= room) break;
        size -= 0.25;
      }
      if (size < 9) {
        lbl.style.fontSize = '';
        lbl.classList.add('wrap');
      }
    }
  }

  // 「来接我」：三个时间、一句话、发送
  renderPickup(body, caret) {
    const st = this.pickup;
    const when = document.createElement('div');
    when.className = 'pk-when';
    for (const w of WHEN) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = w === st.when ? 'on' : '';
      b.textContent = t(`pet.pickup.when.${w}`);
      b.setAttribute('aria-pressed', String(w === st.when));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        st.when = w;
        for (const x of when.children) {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        }
      });
      when.append(b);
    }
    const note = document.createElement('input');
    note.type = 'text';
    note.className = 'pk-note';
    note.maxLength = NOTE_MAX;
    note.value = st.note;
    note.placeholder = t('pet.pickup.placeholder');
    note.setAttribute('aria-label', t('pet.pickup.noteLabel', { sender: senderOf(this.getData()) }));
    note.spellcheck = false;
    note.addEventListener('input', () => {
      st.note = note.value;
    });
    note.addEventListener('focus', () => this.armAutoClose());
    note.addEventListener('blur', () => this.armAutoClose());
    note.addEventListener('keydown', (e) => {
      if (e.isComposing) return; // 输入法还在拼字
      if (e.key === 'Enter') this.sendPickup();
      else if (e.key === 'Escape') this.close();
    });
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'pk-send';
    send.disabled = st.sending;
    send.textContent = st.sending ? t('pet.pickup.sending') : t('pet.pickup.send');
    send.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sendPickup();
    });
    body.append(when, note, send);
    if (caret) {
      note.focus({ preventScroll: true });
      note.setSelectionRange(caret[0], caret[1]);
    }
  }

  // 右键菜单、托盘、面板上的「来接我」都走这里：邮件没设置好就直接提示去设置
  async openPickup() {
    const m = await Promise.resolve(this.api.mail?.get?.()).catch(() => null);
    if (!m || !m.ready) {
      this.close();
      this.actions.pickupNotReady?.();
      return;
    }
    if (this.isOpen) {
      this.view = 'pickup';
      this.render();
      this.place();
      this.armAutoClose();
    } else this.open('pickup');
    requestAnimationFrame(() => this.el.querySelector('.pk-note')?.focus({ preventScroll: true }));
  }

  async sendPickup() {
    const st = this.pickup;
    if (st.sending) return;
    st.sending = true;
    if (this.view === 'pickup' && this.isOpen) {
      const send = this.el.querySelector('.pk-send');
      if (send) {
        send.disabled = true;
        send.textContent = t('pet.pickup.sending');
      }
    }
    clearTimeout(this.closeTimer);
    const r = await Promise.resolve(this.api.mail.pickup({ when: st.when, note: st.note.trim() })).catch((err) => ({ ok: false, error: String((err && err.message) || err) }));
    st.sending = false;
    if (r && r.ok) {
      st.note = '';
      st.when = 'now';
    }
    // 气泡在面板开着的时候不显示，先收起面板
    this.close();
    this.actions.pickupResult?.(r || { ok: false });
  }

  focusTitle(p) {
    if (p.phase === 'idle') return t('pet.panel.focus.idle', { n: p.todayCount || 0 });
    const vars = { phase: t(`pet.panel.focus.phase.${p.phase}`), time: fmt(p.remaining) };
    return p.paused ? t('pet.panel.focus.paused', vars) : t('pet.panel.focus.running', vars);
  }

  // 每秒只更新文字，不重建按钮（避免点击落空）
  tick(p) {
    if (!this.isOpen) return;
    if (this.view === 'focus' && this.titleEl) this.titleEl.textContent = this.focusTitle(p);
    if (this.view === 'main' && this.focusLabel) this.focusLabel.textContent = p.phase === 'idle' ? t('pet.panel.main.focus') : fmt(p.remaining);
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
      case 'pickup':
        this.openPickup();
        break;
      default:
        break;
    }
  }
}
