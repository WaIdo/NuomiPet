// 粒子特效：爱心、星星、彩带、Zzz、感叹号、碎屑、想法云。坐标是舞台（窗口）内的像素。
const HEART_COLORS = ['#FF6F9E', '#FF8FB5', '#FFA8C5', '#FF5C8D', '#FFB6D0'];
const CONFETTI_COLORS = ['#FF8FB5', '#FFD66B', '#8FD3FF', '#A6E3B8', '#C9B6FF', '#FFB38A'];

const heartSVG = (c) =>
  `<svg viewBox="0 0 24 24"><path d="M12 21.3C10.9 20.5 2.8 15 2.8 9.2 2.8 6.1 5.1 3.9 7.9 3.9c1.7 0 3.2.9 4.1 2.3.9-1.4 2.4-2.3 4.1-2.3 2.8 0 5.1 2.2 5.1 5.3 0 5.8-8.1 11.3-9.2 12.1z" fill="${c}"/><ellipse cx="8" cy="8.6" rx="2.1" ry="1.3" fill="#fff" opacity=".6" transform="rotate(-35 8 8.6)"/></svg>`;
const sparkleSVG = (c) =>
  `<svg viewBox="0 0 24 24"><path d="M12 1.5c.9 6.1 3.4 9.1 10.5 10.5-7.1 1.4-9.6 4.4-10.5 10.5C11.1 16.4 8.6 13.4 1.5 12 8.6 10.6 11.1 7.6 12 1.5z" fill="${c}"/></svg>`;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Fx {
  constructor(layer) {
    this.layer = layer;
  }

  spawn({ html, text, cls, x, y, size = 20, dur = 1400, delay = 0, dx = 0, dy = -60, rot = 0, style = '' }) {
    const el = document.createElement('div');
    el.className = 'fx ' + cls;
    if (html) el.innerHTML = html; // 只用于本文件里固定的 SVG 模板
    if (text) el.textContent = text;
    el.style.cssText =
      `left:${x}px;top:${y}px;width:${size}px;height:${size}px;` +
      `--dx:${dx}px;--dy:${dy}px;--rot:${rot}deg;animation-duration:${dur}ms;animation-delay:${delay}ms;${style}`;
    this.layer.append(el);
    setTimeout(() => el.remove(), dur + delay + 80);
    return el;
  }

  hearts({ x, y }, n = 3, spread = 1) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        html: heartSVG(pick(HEART_COLORS)),
        cls: 'fx-float',
        x: x + rand(-28, 28) * spread,
        y: y + rand(-6, 10),
        size: rand(14, 24),
        dur: rand(1300, 1900),
        delay: i * rand(90, 160),
        dx: rand(-26, 26),
        dy: -rand(55, 95),
        rot: rand(-25, 25),
      });
    }
  }

  sparkles({ x, y }, n = 5, radius = 60) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(radius * 0.4, radius);
      this.spawn({
        html: sparkleSVG(pick(['#FFD66B', '#FFE9A8', '#FFB6D0', '#BDE6FF'])),
        cls: 'fx-twinkle',
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r * 0.7,
        size: rand(10, 18),
        dur: rand(700, 1100),
        delay: i * 70,
      });
    }
  }

  confetti({ x, y }, n = 22) {
    for (let i = 0; i < n; i++) {
      const round = Math.random() < 0.35;
      this.spawn({
        cls: 'fx-confetti',
        x: x + rand(-20, 20),
        y: y + rand(-6, 6),
        size: rand(6, 10),
        dur: rand(1400, 2200),
        delay: rand(0, 220),
        dx: rand(-120, 120),
        dy: -rand(40, 120),
        rot: rand(-540, 540),
        style: `background:${pick(CONFETTI_COLORS)};border-radius:${round ? '50%' : '2px'};height:${round ? 8 : rand(4, 6)}px;`,
      });
    }
  }

  zzz({ x, y }) {
    ['z', 'Z', 'Z'].forEach((t, i) =>
      this.spawn({ text: t, cls: 'fx-z', x: x + 8 + i * 7, y: y - i * 4, size: 12 + i * 4, dur: 2600, delay: i * 520, dx: 22 + i * 6, dy: -44 - i * 8 }),
    );
  }

  mark({ x, y }, text = '!', color = '#FF6F9E') {
    this.spawn({ text, cls: 'fx-pop', x, y, size: 26, dur: 1100, style: `color:${color}` });
  }

  notes({ x, y }, n = 3) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        text: pick(['♪', '♫', '♬']),
        cls: 'fx-float fx-note',
        x: x + rand(-30, 30),
        y,
        size: 18,
        dur: 1600,
        delay: i * 260,
        dx: rand(-20, 20),
        dy: -rand(50, 80),
        style: `color:${pick(['#FF8FB5', '#A08CFF', '#6FD3B0', '#FFB84D'])}`,
      });
    }
  }

  crumbs({ x, y }, n = 4) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        cls: 'fx-crumb',
        x: x + rand(-10, 10),
        y,
        size: rand(3, 5),
        dur: rand(500, 800),
        dx: rand(-26, 26),
        dy: rand(18, 34),
        style: `background:${pick(['#E8B86B', '#F3D39B', '#D9A05B'])}`,
      });
    }
  }

  thought({ x, y }, emoji, dur = 2600) {
    const el = this.spawn({ cls: 'fx-thought', x: x + 34, y: y - 22, size: 40, dur });
    const cloud = document.createElement('div');
    cloud.className = 'cloud';
    cloud.textContent = emoji;
    el.append(cloud);
    const dot1 = document.createElement('i');
    const dot2 = document.createElement('i');
    dot1.className = 'd1';
    dot2.className = 'd2';
    el.append(dot1, dot2);
  }
}
