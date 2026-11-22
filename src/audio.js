/**
 * 程序化音效（WebAudio 合成，零音频文件）
 * ---------------------------------------------------------------
 * 原型阶段最省事的做法：先给出「有反馈的声音」，正式版再替换成录音素材。
 * 注意浏览器自动播放策略：AudioContext 必须在用户手势后创建/恢复。
 */
export class Sound {
  constructor(volume = 0.35) {
    this.volume = volume;
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);

      const length = Math.floor(this.ctx.sampleRate * 1.5);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) {
      this.master.gain.value = this.enabled ? this.volume : 0;
    }
    return this.enabled;
  }

  _noise(duration, { gain = 0.3, from = 1800, to = 120, q = 0.8, delay = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) {
      return;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    src.connect(filter).connect(env).connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  _tone(type, from, to, duration, gain = 0.1, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) {
      return;
    }
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);

    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  shoot() {
    this._tone('square', 1500 + Math.random() * 300, 320, 0.07, 0.055);
    this._noise(0.05, { gain: 0.08, from: 6000, to: 1200 });
  }

  boom(strength = 1) {
    this._noise(0.42 * strength, { gain: 0.34 * strength, from: 900, to: 60 });
    this._tone('sine', 160, 40, 0.35 * strength, 0.16 * strength);
  }

  hit() {
    this._tone('sine', 220, 60, 0.26, 0.26);
    this._noise(0.2, { gain: 0.2, from: 2400, to: 200 });
  }

  /** 道具生成提示（很轻，不抢戏） */
  ping() {
    this._tone('sine', 1320, 1760, 0.12, 0.05);
  }

  /** 吃到道具：上行三音 */
  powerup() {
    this._tone('triangle', 660, 660, 0.1, 0.14, 0);
    this._tone('triangle', 880, 880, 0.1, 0.13, 0.07);
    this._tone('triangle', 1320, 1320, 0.16, 0.12, 0.14);
  }

  /** 反弹：金属质感的高频击中 */
  reflect() {
    this._tone('square', 2400, 900, 0.1, 0.07);
    this._noise(0.09, { gain: 0.12, from: 8000, to: 3000 });
  }

  /** 修复：柔和的上行 */
  repair() {
    this._tone('sine', 520, 780, 0.3, 0.12);
    this._tone('sine', 780, 1040, 0.35, 0.08, 0.08);
  }

  /** 穿越 / 进入地标 */
  warp(kind) {
    this._tone('sawtooth', 80, 1200, 1.15, 0.1);
    this._noise(1.25, { gain: 0.26, from: 260, to: 9000 });
    if (kind === 'blackhole') {
      this._tone('sine', 70, 28, 1.4, 0.22);
      this._tone('sine', 140, 56, 1.1, 0.1, 0.1);
    } else {
      this._tone('triangle', 300, 900, 0.9, 0.1);
    }
  }
}
