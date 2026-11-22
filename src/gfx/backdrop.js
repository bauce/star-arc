import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * 远景天文景观：银河 / 黑洞 / 星云团
 * ---------------------------------------------------------------
 * 关键点：这些天体在「无限远」，所以它们必须跟着玩家平移（没有视差），
 * 但**不能**跟着玩家旋转 —— 否则你一转向，银河就黏在屏幕上了。
 *
 * 做法：group.position 每帧跟到玩家位置，rotation 保持世界固定。
 * 每 backdrop.interval 秒淡入淡出切换，切换时把新景观摆到视线侧前方，
 * 保证玩家真的看得到，同时不会挡住正前方的战场。
 */

const TAU = Math.PI * 2;

/** 螺旋星系：沿对数螺旋撒点，中心亮、外围偏紫 */
function galaxyTexture(seed = 1) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.14);
  core.addColorStop(0, 'rgba(255,252,245,0.78)');
  core.addColorStop(0.4, 'rgba(255,232,205,0.4)');
  core.addColorStop(1, 'rgba(255,210,170,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  const arms = 2;
  let s = seed * 9301;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  for (let i = 0; i < 9000; i += 1) {
    const arm = i % arms;
    const t = Math.pow(rnd(), 0.75);
    const radius = 14 + t * size * 0.47;
    const swirl = arm * (TAU / arms) + t * 3.4;
    const spread = (rnd() - 0.5) * (0.24 + t * 0.65);
    const a = swirl + spread;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius * 0.6;

    const hue = 205 + t * 85 + rnd() * 18;
    const alpha = (1 - t) * 0.3 + 0.045;
    ctx.fillStyle = `hsla(${hue}, 72%, ${80 - t * 20}%, ${alpha.toFixed(3)})`;
    const r = 0.45 + rnd() * 1.0;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  const halo = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.5);
  halo.addColorStop(0, 'rgba(120,160,255,0.1)');
  halo.addColorStop(1, 'rgba(120,160,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 黑洞：吸积盘 + 光子环 + 引力透镜的弧 */
function blackHoleTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  const outer = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.5);
  outer.addColorStop(0, 'rgba(255,180,90,0.0)');
  outer.addColorStop(0.55, 'rgba(255,150,60,0.12)');
  outer.addColorStop(0.78, 'rgba(255,120,40,0.04)');
  outer.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.42);
  const disk = ctx.createRadialGradient(0, 0, size * 0.16, 0, 0, size * 0.46);
  disk.addColorStop(0, 'rgba(255,255,240,0)');
  disk.addColorStop(0.55, 'rgba(255,238,200,0.8)');
  disk.addColorStop(0.72, 'rgba(255,176,92,0.6)');
  disk.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.46, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.2, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,225,190,0.4)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.235, size * 0.19, 0, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.235, size * 0.19, 0, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 黑洞的「视界」：一块纯黑圆盘，用来挡住后面的星星 */
function blackDiscTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.72, 'rgba(0,0,0,1)');
  g.addColorStop(0.92, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, TAU);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 星云团：一堆柔和光斑拼出来的云 */
function nebulaFieldTexture(seed = 3) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  let s = seed * 7919;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const hues = [200, 280, 320, 180];

  for (let i = 0; i < 26; i += 1) {
    const x = size * (0.15 + rnd() * 0.7);
    const y = size * (0.15 + rnd() * 0.7);
    const r = size * (0.08 + rnd() * 0.22);
    const hue = hues[Math.floor(rnd() * hues.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${hue}, 85%, 72%, 0.14)`);
    g.addColorStop(1, `hsla(${hue}, 85%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  // 边缘羽化：否则 sprite 的方形边界会露出来
  const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.5);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Backdrop {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    scene.add(this.group);

    this.items = [];
    this.active = 0;
    this.timer = 0;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    const makers = [
      { tex: galaxyTexture(1), scale: 660, spin: 0.004, tint: 0xdfe6ff },
      { tex: blackHoleTexture(), scale: 540, spin: -0.006, tint: 0xffe0c0, disc: true },
      { tex: nebulaFieldTexture(2), scale: 900, spin: 0.0025, tint: 0xbcd6ff },
      { tex: nebulaFieldTexture(5), scale: 820, spin: -0.002, tint: 0xffc2dd },
      { tex: galaxyTexture(4), scale: 600, spin: 0.0035, tint: 0xe6ecff },
    ];

    const discTex = blackDiscTexture();

    for (let i = 0; i < makers.length; i += 1) {
      const m = makers[i];
      const holder = new THREE.Group();
      holder.position.set(0, 0, -CONFIG.backdrop.distance);

      // 黑洞的视界：先画一块黑盘挡住背景星，再叠发光盘
      let disc = null;
      if (m.disc) {
        const discMat = new THREE.SpriteMaterial({
          map: discTex,
          color: 0x000000,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
        });
        disc = new THREE.Sprite(discMat);
        disc.scale.setScalar(m.scale * 0.46);
        disc.renderOrder = -999;
        holder.add(disc);
      }

      // 关键：天球必须是「不透明 + 加法混合」，才会进不透明队列并被 renderOrder 压到最前。
      // 否则它作为透明层会在最后绘制，把黑洞的视界球一起照亮，黑就不黑了。
      const mat = new THREE.SpriteMaterial({
        map: m.tex,
        color: 0x000000,
        transparent: false,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(m.scale);
      sprite.renderOrder = -1000;
      holder.add(sprite);

      this.group.add(holder);
      this.items.push({
        holder,
        sprite,
        disc,
        mat,
        spin: m.spin,
        scale: m.scale,
        baseColor: new THREE.Color(m.tint),
        fade: 0,
        peak: 1,
      });
    }

    this.items[0].fade = 1;
    this.items[0].mat.color.copy(this.items[0].baseColor);
  }

  /** 用 ComfyUI 生成的大图替换程序化贴图 */
  setTexture(index, tex, width = 1500) {
    const item = this.items[index];
    if (!item) return;
    item.mat.map = tex;
    item.mat.needsUpdate = true;
    item.aspect = tex.image ? tex.image.width / tex.image.height : 1;
    item.width = width;
    item.peak = 0.7; // AI 图细节多、亮度高，压暗一点免得抢戏
    if (item.disc) item.disc.visible = false; // AI 图里已经画好视界了
    this._applyScale(item);
  }

  _applyScale(item, breathe = 1) {
    const w = (item.width ?? item.scale) * breathe;
    const h = item.aspect ? w / item.aspect : w;
    item.sprite.scale.set(w, h, 1);
    if (item.disc && item.disc.visible) {
      item.disc.scale.setScalar(item.scale * 0.46 * breathe);
    }
  }

  /** 把某片景观摆到视线侧前方（避开正前方战场） */
  _place(item, fwd, right, up) {
    const side = Math.random() < 0.5 ? -1 : 1;
    this._dir
      .copy(fwd)
      .addScaledVector(right, side * (0.6 + Math.random() * 0.4))
      .addScaledVector(up, (Math.random() - 0.5) * 0.9)
      .normalize()
      .multiplyScalar(CONFIG.backdrop.distance);
    item.holder.position.copy(this._dir);
  }

  /** 调试用：直接切到第 N 片景观（跳过淡入） */
  setSky(index) {
    this.active = ((index % this.items.length) + this.items.length) % this.items.length;
    this.timer = 0;
    this.items.forEach((item, i) => {
      const on = i === this.active;
      item.fade = on ? 1 : 0;
      item.mat.color.copy(item.baseColor).multiplyScalar(on ? item.peak : 0);
      if (item.disc) item.disc.material.opacity = on ? 0.96 : 0;
    });
    this.items[this.active].holder.position.set(0, 0, -CONFIG.backdrop.distance);
  }

  update(dt, playerPos, camera) {
    // 天球跟着玩家平移，但不跟着转
    this.group.position.copy(playerPos);

    this._fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this._right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    this.timer += dt;
    if (this.timer > CONFIG.backdrop.interval) {
      this.timer = 0;
      this.active = (this.active + 1) % this.items.length;
      // 新景观出现在当前视线侧前方，保证玩家真的看得到
      this._place(this.items[this.active], this._fwd, this._right, this._up);
    }

    const fade = CONFIG.backdrop.fade;
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[i];
      const target = i === this.active ? 1 : 0;
      item.fade += (target - item.fade) * Math.min(1, (dt / fade) * 2.2);
      if (item.fade < 0.002) item.fade = 0;

      // 用颜色做淡入淡出（不透明材质不能改 opacity）
      item.mat.color.copy(item.baseColor).multiplyScalar(item.fade * item.peak);
      if (item.disc) item.disc.material.opacity = item.fade * 0.96;

      item.mat.rotation += item.spin * dt;

      const breathe = 1 + Math.sin(performance.now() * 0.00008 + i) * 0.015;
      this._applyScale(item, breathe);
    }
  }
}
