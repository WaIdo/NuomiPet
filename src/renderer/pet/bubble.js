// 对话气泡：排队显示，可带按钮（提醒、心情打卡、信件）。
import { em, t } from '../shared/i18n.mjs';

// 颜文字（括号里的一小串符号）不要被折成两行
const KAOMOJI = /([（(][^（()）\n]{1,10}[)）][ﾉ♡✧~～]*)/; // i18n-ignore: 正则，匹配颜文字的括号和符号
function appendText(el, text) {
  for (const part of String(text).split(KAOMOJI)) {
    if (!part) continue;
    if (KAOMOJI.test(part) && [...part].length <= 14) {
      const span = document.createElement('span');
      span.className = 'nowrap';
      span.textContent = part;
      el.append(span);
    } else {
      el.append(document.createTextNode(part));
    }
  }
}
export class Bubble {
  constructor(el, { anchor, sound, visible }) {
    this.el = el;
    this.anchor = anchor; // () => { x, y }：宠物头顶在舞台里的位置
    this.visible = visible; // () => { left, right }：窗口在屏幕内可见的横向范围
    this.sound = sound;
    this.queue = [];
    this.current = null;
    this.paused = false;
    this.timer = null;
    this.gapUntil = 0;
  }

  /**
   * text: 文本；opts: { id, duration, buttons: [{ label, value, primary }], onButton(value), priority: 'high', emoji, cls }
   * 同 id 的旧消息会被替换。
   */
  say(text, opts = {}) {
    if (!text && !opts.buttons) return;
    const item = { text: String(text || ''), ...opts };
    if (item.id) {
      this.queue = this.queue.filter((q) => q.id !== item.id);
      if (this.current && this.current.id === item.id) {
        this.current = null;
        this.render(item);
        return;
      }
    }
    // interrupt：她刚刚亲手触发的反应要马上显示，正在显示的气泡先放回队首
    if (item.interrupt && this.current && !this.paused) {
      const cur = this.current;
      if (cur.buttons) this.queue.unshift(cur);
      this.current = null;
      this.render(item);
      return;
    }
    if (item.priority === 'high') this.queue.unshift(item);
    else this.queue.push(item);
    if (this.queue.length > 6) this.queue.splice(0, this.queue.length - 6);
    this.next();
  }

  has(id) {
    return (this.current && this.current.id === id) || this.queue.some((q) => q.id === id);
  }

  busy() {
    return !!this.current || this.queue.length > 0;
  }

  pause() {
    this.paused = true;
    if (this.current) {
      // 带按钮的提醒放回队首，普通闲聊直接丢掉
      if (this.current.buttons) this.queue.unshift(this.current);
      this.current = null;
      clearTimeout(this.timer);
      this.el.classList.remove('show');
      this.el.hidden = true;
    }
  }

  resume() {
    this.paused = false;
    this.next();
  }

  dismiss(id) {
    if (id) this.queue = this.queue.filter((q) => q.id !== id);
    if (!id || (this.current && this.current.id === id)) this.hide();
  }

  clearQueue() {
    this.queue = [];
  }

  next() {
    if (this.paused || this.current || !this.queue.length) return;
    const wait = this.gapUntil - Date.now();
    if (wait > 0) {
      clearTimeout(this.gapTimer);
      this.gapTimer = setTimeout(() => this.next(), wait);
      return;
    }
    this.render(this.queue.shift());
  }

  render(item) {
    this.current = item;
    clearTimeout(this.timer);
    const el = this.el;
    el.replaceChildren();
    el.className = 'bubble ' + (item.cls || '');
    const p = document.createElement('div');
    p.className = 'text';
    appendText(p, em(item.text));
    if (item.text) el.append(p);
    if (item.buttons && item.buttons.length) {
      const row = document.createElement('div');
      row.className = 'btns' + (item.buttons.length > 3 ? ' many' : '');
      for (const b of item.buttons) {
        const btn = document.createElement('button');
        btn.className = 'btn' + (b.primary ? ' primary' : '') + (b.emojiOnly ? ' emoji' : '');
        btn.textContent = em(b.label);
        if (b.title) btn.title = b.title;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cb = item.onButton;
          this.hide();
          if (cb) cb(b.value);
        });
        row.append(btn);
      }
      el.append(row);
    }
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '×';
    close.title = t('common.close');
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      const cb = item.onButton;
      this.hide();
      if (cb && item.buttons) cb('dismiss');
    });
    el.append(close);
    el.hidden = false;
    this.place();
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if (!item.silent) this.sound?.play('pop');
    const len = [...item.text].length;
    const duration = item.duration ?? (item.buttons ? 90000 : Math.min(12000, 2600 + len * 140));
    this.timer = setTimeout(() => {
      const cb = item.onButton;
      this.hide();
      if (cb && item.buttons) cb('timeout');
    }, duration);
  }

  place() {
    if (this.el.hidden) return;
    const { x, y } = this.anchor();
    const stage = this.el.parentElement.getBoundingClientRect();
    const { left: minX, right: maxX } = this.visible ? this.visible() : { left: 0, right: stage.width };
    this.el.style.maxWidth = Math.max(120, Math.min(240, maxX - minX - 12)) + 'px';
    // 先放到最左边再量：不然宽度会受上一个气泡的位置限制，右边空间不够时被挤窄（表情按钮排成两行）
    this.el.style.left = '0px';
    const w = this.el.offsetWidth;
    const left = Math.max(minX + 6, Math.min(maxX - w - 6, x - w / 2));
    this.el.style.left = left + 'px';
    this.el.style.bottom = Math.max(4, stage.height - y + 6) + 'px';
    this.el.style.setProperty('--tail-x', Math.max(16, Math.min(w - 16, x - left)) + 'px');
  }

  hide() {
    clearTimeout(this.timer);
    const el = this.el;
    this.current = null;
    el.classList.remove('show');
    el.classList.add('hide');
    this.gapUntil = Date.now() + 450;
    setTimeout(() => {
      if (!this.current) {
        el.hidden = true;
        el.classList.remove('hide');
      }
      this.next();
    }, 220);
  }
}
