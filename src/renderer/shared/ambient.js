// 常驻的慢动画（呼吸、尾巴摆动、小芽摇摆、鼻涕泡）用低帧率 JS 驱动。
// 桌宠一直开着，如果这些动画用 CSS 按 60 帧跑，透明窗口每帧都要重绘，空闲时也会占不少 CPU/GPU。
const FPS = 12;
const TAU = Math.PI * 2;

const views = new Set();
let timer = null;
const t0 = performance.now();

// 这些姿势的身体动画由这里负责，其它姿势交给 CSS（跳、转圈等短动作保持 60 帧）
const BODY = {
  idle: (t) => {
    const k = (1 - Math.cos((t / 3.4) * TAU)) / 2;
    return `scale(${(1 + 0.018 * k).toFixed(4)}, ${(1 - 0.022 * k).toFixed(4)})`;
  },
  sleep: (t) => {
    const k = (1 - Math.cos((t / 4.2) * TAU)) / 2;
    return `scale(${1.04 + 0.02 * k}, ${0.93 - 0.03 * k})`;
  },
  sad: (t) => {
    const k = (1 - Math.cos((t / 4.2) * TAU)) / 2;
    return `scale(${1.04 + 0.01 * k}, ${0.95 - 0.015 * k})`;
  },
  focus: (t) => {
    const k = (1 - Math.cos((t / 4) * TAU)) / 2;
    return `rotate(-2deg) scale(${1 + 0.012 * k}, ${1 - 0.015 * k})`;
  },
  think: (t) => {
    const k = (1 - Math.cos((t / 3.6) * TAU)) / 2;
    return `rotate(${4 + k}deg) scale(${1 + 0.015 * k}, ${1 - 0.02 * k})`;
  },
};

// 值没变就不写，避免无谓的样式重算
function put(el, prop, value) {
  const key = '__amb_' + prop;
  if (el[key] === value) return;
  el[key] = value;
  el.style[prop] = value;
}

function tick() {
  if (document.hidden) return;
  const t = (performance.now() - t0) / 1000;
  for (const v of views) {
    const svg = v.svg;
    if (!svg || !svg.isConnected) {
      if (!v.container.isConnected) views.delete(v);
      continue;
    }
    const pose = v.state.pose;
    const parts = v.ambientParts();
    const bodyFn = BODY[pose];
    if (parts.body) put(parts.body, 'transform', bodyFn ? bodyFn(t) : '');
    if (parts.tail) {
      const period = parts.tail.classList.contains('puff') ? 0 : parts.tail.classList.contains('wag') ? 1.1 : pose === 'sleep' ? 6 : 2.8;
      if (period) put(parts.tail, 'transform', `rotate(${(1 + 7 * Math.sin((t / period) * TAU)).toFixed(2)}deg)`);
      else {
        // 兔子尾巴：偶尔抖一下
        const p = (t % 3.2) / 3.2;
        const w = p > 0.8 ? Math.sin(((p - 0.8) / 0.2) * TAU * 1.5) * 9 * (1 - (p - 0.8) / 0.2) : 0;
        put(parts.tail, 'transform', `rotate(${w.toFixed(2)}deg)`);
      }
    }
    for (const sway of parts.sway) put(sway, 'transform', `rotate(${(7 * Math.sin((t / 3) * TAU)).toFixed(2)}deg)`);
    if (parts.snot) {
      const k = (1 - Math.cos((t / 4.2) * TAU)) / 2;
      put(parts.snot, 'transform', pose === 'sleep' ? `scale(${(0.3 + 0.85 * k).toFixed(3)})` : '');
      put(parts.snot, 'opacity', pose === 'sleep' ? (0.7 + 0.3 * k).toFixed(2) : '');
    }
    if (parts.pawsIn.length) {
      const typing = svg.classList.contains('typing');
      const frame = Math.floor(t * FPS);
      parts.pawsIn.forEach((p, i) => {
        put(p, 'transform', typing && Math.floor(frame / 3) % 2 === i ? 'translateY(-3px)' : '');
      });
    }
  }
}

let fps = FPS;

export const Ambient = {
  add(view) {
    views.add(view);
    if (!timer) timer = setInterval(tick, 1000 / fps);
  },
  remove(view) {
    views.delete(view);
  },
  // 没人看着的时候降低帧率，省电
  setFps(next) {
    next = Math.max(0, Math.min(30, next));
    if (next === fps) return;
    fps = next;
    clearInterval(timer);
    timer = fps > 0 && views.size ? setInterval(tick, 1000 / fps) : null;
  },
};
