/**
 * HUD：纯 DOM 覆盖层
 * ---------------------------------------------------------------
 * 为什么不用 Canvas/WebGL 画 HUD？
 *  - 文字清晰度、字体、响应式布局都由浏览器免费提供
 *  - 改 UI 不需要重跑渲染管线
 * 只在数值真正变化时写 DOM，避免每帧 60 次无意义的样式重排。
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class HUD {
  constructor() {
    this.shieldBar = document.getElementById('shield-bar');
    this.boostBar = document.getElementById('boost-bar');
    this.scoreEl = document.getElementById('score');
    this.waveEl = document.getElementById('wave');
    this.reticle = document.getElementById('reticle');
    this.flashEl = document.getElementById('flash');
    this.overEl = document.getElementById('over');
    this.startEl = document.getElementById('start');
    this.pauseEl = document.getElementById('pause');
    this.effectsEl = document.getElementById('effects');
    this.finalScoreEl = document.getElementById('final-score');
    this.finalWaveEl = document.getElementById('final-wave');
    this.hintEl = document.getElementById('hint');

    this._shield = -1;
    this._boost = -1;
    this._score = -1;
    this._wave = -1;
    this._flashTimer = 0;
    this._chips = new Map();
    this._iconUrls = {};

    this.warpEl = document.getElementById('warp');
    this.warpText = this.warpEl ? this.warpEl.querySelector('.warp-text') : null;
    this.waypointEl = document.getElementById('waypoint');
    this.wpArrow = this.waypointEl ? this.waypointEl.querySelector('.wp-arrow') : null;
    this.wpLabel = this.waypointEl ? this.waypointEl.querySelector('.wp-label') : null;
    this._wpV = new THREE.Vector3();
  }

  /** 穿越/进入的过场闪白 */
  showWarp(type, duration = 1.25) {
    if (!this.warpEl) return;
    this.warpEl.classList.remove('on');
    this.warpEl.classList.toggle('galaxy', type === 'galaxy');
    this.warpEl.style.setProperty('--warp-dur', `${duration}s`);
    if (this.warpText) this.warpText.textContent = type === 'blackhole' ? '穿越' : '进入';
    void this.warpEl.offsetWidth; // 强制重排，动画才会重播
    this.warpEl.classList.add('on');
  }

  hideWarp() {
    this.warpEl?.classList.remove('on');
  }

  /** 地标导航：屏幕边缘的箭头 + 距离 */
  setWaypoint(landmark, camera, playerPos) {
    if (!this.waypointEl) return;
    const v = this._wpV.copy(landmark.position).project(camera);
    let dx = v.x;
    let dy = -v.y;
    if (v.z > 1) {
      dx = -dx;
      dy = -dy;
    }
    const len = Math.hypot(dx, dy) || 1;
    const R = Math.min(window.innerWidth, window.innerHeight) * 0.19 + 40;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    // 夹在屏幕内，避免箭头和文字被裁掉（竖屏手机上尤其明显）
    const px = Math.min(Math.max(cx + (dx / len) * R, 62), window.innerWidth - 62);
    const py = Math.min(Math.max(cy + (dy / len) * R, 84), window.innerHeight - 120);
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

    this.waypointEl.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    if (this.wpArrow) this.wpArrow.style.transform = `rotate(${deg}deg)`;
    if (this.wpLabel) {
      const d = landmark.position.distanceTo(playerPos);
      const ly = d / CONFIG.sector.unitsPerLightYear;
      this.wpLabel.textContent = `${landmark.label} · ${ly >= 1 ? ly.toFixed(1) : ly.toFixed(2)} 光年`;
    }
    this.waypointEl.classList.add('on');
    this.waypointEl.classList.toggle('blackhole', landmark.type === 'blackhole');
    this.waypointEl.classList.toggle('galaxy', landmark.type === 'galaxy');
  }

  hideWaypoint() {
    this.waypointEl?.classList.remove('on');
  }

  /** 道具图标（ComfyUI 生成的纯黑底图标，用 screen 混合抠掉黑） */
  setIcon(type, url) {
    this._iconUrls[type] = url;
    const chip = this._chips.get(type);
    if (chip) {
      chip.icon.src = url;
      chip.icon.style.display = '';
    }
  }

  /** 主菜单插画 */
  setMenuArt(url) {
    this.startEl.style.backgroundImage =
      `linear-gradient(rgba(3, 6, 14, 0.62), rgba(2, 4, 10, 0.9)), url("${url}")`;
    this.startEl.style.backgroundSize = 'cover';
    this.startEl.style.backgroundPosition = 'center';
  }

  /** 暂停面板里的座机肖像 */
  setShipPortrait(url) {
    const img = document.getElementById('pause-ship');
    if (img) img.src = url;
  }

  setShield(ratio) {
    const v = Math.max(0, Math.min(1, ratio));
    if (Math.abs(v - this._shield) < 0.005) {
      return;
    }
    this._shield = v;
    this.shieldBar.style.transform = `scaleX(${v})`;
    this.shieldBar.classList.toggle('low', v < 0.35);
  }

  setScore(score) {
    if (score === this._score) {
      return;
    }
    this._score = score;
    this.scoreEl.textContent = String(score).padStart(5, '0');
  }

  setWave(wave) {
    if (wave === this._wave) {
      return;
    }
    this._wave = wave;
    this.waveEl.textContent = String(wave);
  }

  setBoost(ratio) {
    const v = Math.max(0, Math.min(1, ratio));
    if (Math.abs(v - this._boost) < 0.01) {
      return;
    }
    this._boost = v;
    this.boostBar.style.transform = `scaleX(${v})`;
    this.boostBar.classList.toggle('empty', v < 0.03);
  }

  /** 道具倒计时 chip：只在内容变化时改 DOM */
  setEffects(list) {
    const seen = new Set();
    for (const effect of list) {
      seen.add(effect.key);
      let chip = this._chips.get(effect.key);
      if (!chip) {
        chip = document.createElement('div');
        chip.className = `chip ${effect.key}`;
        const icon = document.createElement('img');
        icon.className = 'chip-icon';
        icon.alt = '';
        const url = this._iconUrls[effect.key];
        if (url) {
          icon.src = url;
        } else {
          icon.style.display = 'none';
        }
        const label = document.createElement('span');
        label.textContent = effect.label;
        const time = document.createElement('b');
        chip.append(icon, label, time);
        this.effectsEl.appendChild(chip);
        this._chips.set(effect.key, { el: chip, time, icon });
        chip = this._chips.get(effect.key);
      }
      const text = `${Math.max(0, effect.remain).toFixed(1)}s`;
      if (chip.time.textContent !== text) {
        chip.time.textContent = text;
      }
    }
    for (const [key, chip] of this._chips) {
      if (!seen.has(key)) {
        chip.el.remove();
        this._chips.delete(key);
      }
    }
  }

  /** 短暂浮出的提示（吃到道具时） */
  toast(text, color = '#6ff2ff') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    el.style.color = color;
    document.getElementById('hud').appendChild(el);
    window.setTimeout(() => el.remove(), 1300);
  }

  hideStart() {
    this.startEl.classList.add('hidden');
  }

  showStart() {
    this.startEl.classList.remove('hidden');
  }

  showPause() {
    this.pauseEl.classList.remove('hidden');
  }

  hidePause() {
    this.pauseEl.classList.add('hidden');
  }
  flash() {
    this.flashEl.style.opacity = '1';
    this._flashTimer = 0.08;
  }

  update(dt) {
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) {
        this.flashEl.style.opacity = '0';
      }
    }
  }

  /** 准星跟随战机在屏幕上的投影（用 transform，不触发重排） */
  setReticle(x, y) {
    this.reticle.style.transform = `translate3d(${x - 23}px, ${y - 23}px, 0)`;
  }

  showGameOver(score, wave) {
    this.finalScoreEl.textContent = String(score);
    this.finalWaveEl.textContent = String(wave);
    this.overEl.classList.remove('hidden');
    document.body.classList.add('dead');
  }

  hideGameOver() {
    this.overEl.classList.add('hidden');
    document.body.classList.remove('dead');
  }

  fadeHint() {
    this.hintEl.style.transition = 'opacity 1.2s ease';
    this.hintEl.style.opacity = '0';
  }
}
