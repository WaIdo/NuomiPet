// 控制一只宠物 SVG 的姿势、表情、爪子和道具。宠物窗口和小窝窗口的预览共用。
import { petSVG, PAW_REST } from './pet-art.js';
import { Ambient } from './ambient.js';

const POSES = [
  'idle', 'think', 'walk', 'sleep', 'drag', 'fall', 'land', 'jump', 'bounce', 'eat', 'stretch',
  'spin', 'dance', 'dizzy', 'shake', 'sad', 'play', 'focus', 'shy',
];

// 爪子姿势：目标中心点 + 旋转角（普通物种 / 小鸡翅膀）
const PAW_TARGETS = {
  default: {
    rest: { l: [80, 180, 0], r: [120, 180, 0] },
    up: { l: [31, 108, -50], r: [169, 108, 50] },
    flail: { l: [31, 108, -50], r: [169, 108, 50] },
    cheer: { l: [33, 100, -55], r: [167, 100, 55] },
    stretch: { l: [34, 94, -60], r: [166, 94, 60] },
    hold: { l: [84, 163, 35], r: [116, 163, -35] },
    wave: { l: [80, 180, 0], r: [160, 116, 30] },
    bat: { l: [80, 180, 0], r: [148, 175, 0] },
    cover: { l: [78, 123, 10], r: [122, 123, -10] },
    belly: { l: [90, 163, 20], r: [110, 163, -20] },
  },
  chick: {
    rest: { l: [34, 146, 0], r: [166, 146, 0] },
    up: { l: [30, 112, -40], r: [170, 112, 40] },
    flail: { l: [30, 112, -40], r: [170, 112, 40] },
    cheer: { l: [30, 104, -50], r: [170, 104, 50] },
    stretch: { l: [30, 98, -55], r: [170, 98, 55] },
    hold: { l: [82, 152, -55], r: [118, 152, 55] },
    wave: { l: [34, 146, 0], r: [170, 116, 50] },
    bat: { l: [34, 146, 0], r: [156, 160, -30] },
    cover: { l: [76, 124, -70], r: [124, 124, 70] },
    belly: { l: [80, 160, -60], r: [120, 160, 60] },
  },
};

export class PetView {
  // opts.ambient = false：静止的缩略图，不参加低帧率常驻动画（呼吸、尾巴）
  constructor(container, look = {}, opts = {}) {
    this.container = container;
    this.look = { ...look };
    this.state = { pose: 'idle', eyes: 'normal', mouth: 'cat', paws: 'rest', facing: 1, flags: new Set() };
    this.gaze = { x: 0, y: 0, fx: 0, fy: 0 };
    this.render();
    if (opts.ambient !== false) Ambient.add(this);
  }

  destroy() {
    Ambient.remove(this);
  }

  // 低帧率常驻动画要控制的元素（见 ambient.js）
  ambientParts() {
    if (!this._parts || this._parts.svg !== this.svg) {
      const q = (sel) => this.svg.querySelector(sel);
      this._parts = {
        svg: this.svg,
        body: q('.p-body'),
        tail: q('.p-tail'),
        sway: [...this.svg.querySelectorAll('.acc-sprout, .tuft')],
        snot: q('.p-snot'),
        pawsIn: [...this.svg.querySelectorAll('.paw-in')],
      };
    }
    return this._parts;
  }

  get species() {
    return this.svg?.dataset.species || 'cat';
  }

  render() {
    this.container.innerHTML = petSVG(this.look);
    this.svg = this.container.querySelector('svg.pet');
    this.pawL = this.svg.querySelector('.paw-l');
    this.pawR = this.svg.querySelector('.paw-r');
    this.propLayer = this.svg.querySelector('.p-prop');
    const { pose, eyes, mouth, paws, facing, flags } = this.state;
    this.state.flags = new Set();
    this.setPose(pose, { restart: false });
    this.setEyes(eyes);
    this.setMouth(mouth);
    this.setPaws(paws, true);
    this.setFacing(facing);
    flags.forEach((f) => this.setFlag(f, true));
    this.applyGaze();
    if (this.prop) this.setProp(this.prop.content, this.prop.opts);
  }

  setLook(look) {
    const next = { ...this.look, ...look };
    if (JSON.stringify(next) === JSON.stringify(this.look)) return;
    this.look = next;
    this.render();
  }

  swapClass(prefix, value) {
    const cl = this.svg.classList;
    [...cl].forEach((c) => {
      if (c.startsWith(prefix)) cl.remove(c);
    });
    if (value) cl.add(prefix + value);
  }

  setPose(pose, { restart = true } = {}) {
    if (!POSES.includes(pose)) pose = 'idle';
    const same = this.state.pose === pose;
    this.state.pose = pose;
    this.swapClass('pose-', null);
    if (restart && same) void this.svg.getBoundingClientRect();
    this.svg.classList.add('pose-' + pose);
    this.svg.classList.toggle('airborne', pose === 'drag' || pose === 'fall');
  }

  setEyes(eyes) {
    this.state.eyes = eyes;
    this.swapClass('e-', eyes);
  }

  setMouth(mouth) {
    this.state.mouth = mouth;
    this.swapClass('m-', mouth);
  }

  setFace(eyes, mouth) {
    if (eyes) this.setEyes(eyes);
    if (mouth) this.setMouth(mouth);
  }

  setPaws(name, force = false) {
    if (!force && this.state.paws === name) return;
    this.state.paws = name;
    const table = PAW_TARGETS[this.species] || PAW_TARGETS.default;
    const rest = PAW_REST[this.species] || PAW_REST.default;
    const t = table[name] || table.rest;
    const tf = (side) => {
      const [x, y, r] = t[side];
      const [bx, by] = rest[side];
      return `translate(${x - bx}px, ${y - by}px) rotate(${r}deg)`;
    };
    if (this.pawL) this.pawL.style.transform = tf('l');
    if (this.pawR) this.pawR.style.transform = tf('r');
    ['wave', 'bat', 'cheer', 'flail'].forEach((p) => this.svg.classList.toggle('paws-' + p, p === name));
  }

  setFacing(dir) {
    this.state.facing = dir < 0 ? -1 : 1;
    this.svg.classList.toggle('facing-left', this.state.facing < 0);
  }

  setFlag(name, on = true) {
    if (on) this.state.flags.add(name);
    else this.state.flags.delete(name);
    this.svg.classList.toggle(name, on);
  }

  blink(double = false) {
    if (this.state.eyes !== 'normal' && this.state.eyes !== 'wink' && this.state.eyes !== 'sad') return;
    const cl = this.svg.classList;
    cl.add('blink');
    setTimeout(() => {
      cl.remove('blink');
      if (double) setTimeout(() => this.blink(false), 140);
    }, 120);
  }

  twitchEar(side = Math.random() < 0.5 ? 'l' : 'r') {
    const ear = this.svg.querySelector('.ear-' + side);
    if (!ear) return;
    ear.classList.remove('twitch');
    void ear.getBoundingClientRect();
    ear.classList.add('twitch');
    setTimeout(() => ear.classList.remove('twitch'), 520);
  }

  /** nx, ny ∈ [-1, 1]：看的方向；face 为 true 时脸也会轻微转过去 */
  lookAt(nx, ny, face = true) {
    const cx = Math.max(-1, Math.min(1, nx));
    const cy = Math.max(-1, Math.min(1, ny));
    const flip = this.state.facing;
    this.gaze = { x: cx * 3.2 * flip, y: cy * 2.6, fx: face ? cx * 4.5 * flip : 0, fy: face ? cy * 2 : 0 };
    this.applyGaze();
  }

  applyGaze() {
    const s = this.svg.style;
    s.setProperty('--lx', this.gaze.x.toFixed(2) + 'px');
    s.setProperty('--ly', this.gaze.y.toFixed(2) + 'px');
    s.setProperty('--fx', this.gaze.fx.toFixed(2) + 'px');
    s.setProperty('--fy', this.gaze.fy.toFixed(2) + 'px');
  }

  setTilt(deg) {
    this.svg.style.setProperty('--tilt', deg.toFixed(1) + 'deg');
  }

  /** 在爪子之间放一个道具（emoji），null 表示拿走 */
  setProp(content, opts = {}) {
    this.prop = content ? { content, opts } : null;
    if (!this.propLayer) return;
    if (!content) {
      this.propLayer.innerHTML = '';
      return;
    }
    const { x = 100, y = 150, size = 34 } = opts;
    this.propLayer.innerHTML = `<g class="bite"><text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="middle">${content}</text></g>`;
  }

  setPropScale(scale) {
    const g = this.propLayer?.querySelector('.bite');
    if (g) g.style.transform = `scale(${scale})`;
  }

  /** 宠物头顶在容器内的位置（像素），用于放气泡和特效 */
  anchor(point = 'head') {
    const box = this.svg.getBoundingClientRect();
    const host = this.container.getBoundingClientRect();
    const s = box.width / 200;
    const tops = { bunny: 6, chick: 30, default: 46 };
    const headTop = (tops[this.species] ?? tops.default) * s;
    const x = box.left - host.left + box.width / 2;
    if (point === 'head') return { x, y: box.top - host.top + headTop, scale: s };
    if (point === 'face') return { x, y: box.top - host.top + 122 * s, scale: s };
    if (point === 'mouth') return { x, y: box.top - host.top + 140 * s, scale: s };
    return { x, y: box.top - host.top + 186 * s, scale: s };
  }
}
