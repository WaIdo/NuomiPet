// 用 WebAudio 合成的小音效，不依赖音频文件。
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.6;
    this.last = new Map();
  }

  configure({ enabled, volume }) {
    if (enabled !== undefined) this.enabled = !!enabled;
    if (volume !== undefined) this.volume = Math.max(0, Math.min(1, Number(volume)));
    if (this.master) this.master.gain.value = 0.32 * this.volume;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32 * this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  tone({ type = 'sine', f0, f1, f2, dur = 0.15, vol = 0.5, delay = 0, attack = 0.008, vibrato = 0 }) {
    const ctx = this.ensure();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f2) {
      o.frequency.linearRampToValueAtTime(f1, t + dur * 0.45);
      o.frequency.linearRampToValueAtTime(f2, t + dur);
    } else if (f1) {
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    }
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 22;
      lg.gain.value = vibrato;
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.08, vol = 0.2, delay = 0, freq = 1200, q = 1.2 }) {
    const ctx = this.ensure();
    const t = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.enabled || this.volume <= 0) return;
    const now = performance.now();
    if (now - (this.last.get(name) || 0) < 60) return;
    this.last.set(name, now);
    try {
      switch (name) {
        case 'squeak':
          this.tone({ f0: 820, f1: 1380, f2: 1050, dur: 0.2, vol: 0.4, vibrato: 18 });
          break;
        case 'boop':
          this.tone({ f0: 620, f1: 980, dur: 0.12, vol: 0.4 });
          break;
        case 'chirp':
          this.tone({ f0: 880, f1: 1320, dur: 0.09, vol: 0.35 });
          this.tone({ f0: 1175, f1: 1760, dur: 0.11, vol: 0.32, delay: 0.1 });
          break;
        case 'pop':
          this.tone({ f0: 380, f1: 820, dur: 0.07, vol: 0.28 });
          break;
        case 'boing':
          this.tone({ type: 'triangle', f0: 560, f1: 170, dur: 0.3, vol: 0.4, vibrato: 12 });
          break;
        case 'thud':
          this.tone({ type: 'sine', f0: 180, f1: 70, dur: 0.18, vol: 0.5 });
          this.noise({ dur: 0.08, vol: 0.12, freq: 400 });
          break;
        case 'nom':
          this.noise({ dur: 0.05, vol: 0.22, freq: 1600, q: 2 });
          this.noise({ dur: 0.05, vol: 0.2, freq: 1300, q: 2, delay: 0.12 });
          break;
        case 'gulp':
          this.tone({ f0: 300, f1: 520, dur: 0.12, vol: 0.3 });
          break;
        case 'chime':
          [1047, 1319, 1568, 2093].forEach((f, i) => this.tone({ f0: f, dur: 0.55, vol: 0.26, delay: i * 0.11 }));
          break;
        case 'sparkle':
          [1568, 2093, 2637, 3136, 2637, 3520].forEach((f, i) => this.tone({ f0: f, dur: 0.2, vol: 0.18, delay: i * 0.06 }));
          break;
        case 'levelup':
          [784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.22, vol: 0.28, delay: i * 0.09 }));
          break;
        case 'whoosh':
          this.noise({ dur: 0.28, vol: 0.14, freq: 700, q: 0.8 });
          break;
        case 'snore':
          this.tone({ type: 'sine', f0: 140, f1: 110, dur: 0.6, vol: 0.12 });
          break;
        case 'heart':
          this.tone({ f0: 1320, f1: 1760, dur: 0.08, vol: 0.18 });
          break;
        default:
          break;
      }
    } catch {
      // 音频设备不可用时静默
    }
  }
}
