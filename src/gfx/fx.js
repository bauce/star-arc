import * as THREE from 'three';
import { glowTexture } from './textures.js';

/**
 * 打击感三件套：粒子爆散 + 冲击波环 + 瞬时点光。
 * 全部对象池化，运行期零 new（避免 GC 卡顿）。
 */
const MAX_PARTICLES = 900;
const RING_COUNT = 10;

export class FX {
  constructor(scene) {
    // —— 粒子 ——
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.baseColor = new Float32Array(MAX_PARTICLES * 3);
    this.drag = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;

    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      this.positions[i * 3 + 1] = -9999;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 2.2,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.geometry = geometry;
    scene.add(this.points);

    // —— 冲击波环 ——
    const ringGeometry = new THREE.RingGeometry(0.78, 1.0, 64);
    this.rings = [];
    for (let i = 0; i < RING_COUNT; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x9fe8ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, duration: 1, grow: 1, opacity: 1 });
    }
    this.ringCursor = 0;

    // —— 瞬时闪光 ——
    this.flash = new THREE.PointLight(0xffffff, 0, 120, 2);
    scene.add(this.flash);
    this.flashLife = 0;

    this._color = new THREE.Color();
  }

  _spawnParticle(x, y, z, vx, vy, vz, color, life, drag) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    const i3 = i * 3;
    this.positions[i3 + 0] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;
    this.velocities[i3 + 0] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;
    this.baseColor[i3 + 0] = color.r;
    this.baseColor[i3 + 1] = color.g;
    this.baseColor[i3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
  }

  /** 爆炸：球形爆散 + 冲击波 + 闪光 */
  explode(position, opts = {}) {
    const {
      count = 42,
      speed = 30,
      life = 0.65,
      color = 0x9fe8ff,
      ring = true,
      ringColor = 0x9fe8ff,
      flash = 400,
      flashColor = 0xbfefff,
    } = opts;

    this._color.setHex(color);
    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.25 + Math.random() * 0.95);
      const vx = Math.sin(phi) * Math.cos(theta) * s;
      const vy = Math.cos(phi) * s;
      const vz = Math.sin(phi) * Math.sin(theta) * s;
      const l = life * (0.5 + Math.random() * 0.9);
      this._spawnParticle(
        position.x + vx * 0.02,
        position.y + vy * 0.02,
        position.z + vz * 0.02,
        vx,
        vy,
        vz,
        this._color,
        l,
        2.4,
      );
    }

    if (ring) {
      const r = this.rings[this.ringCursor];
      this.ringCursor = (this.ringCursor + 1) % this.rings.length;
      r.mesh.position.copy(position);
      r.mesh.visible = true;
      r.mesh.scale.setScalar(0.6);
      r.mesh.material.color.setHex(ringColor);
      r.life = 0;
      r.duration = 0.5;
      r.grow = 22;
      r.opacity = 0.6;
    }

    if (flash > 0) {
      this.flash.position.copy(position);
      this.flash.color.setHex(flashColor);
      this.flash.intensity = flash;
      this.flashLife = 0.18;
    }
  }

  /** 命中火花：朝某个方向喷射的小火花 */
  sparks(position, color = 0xffd27a, count = 8) {
    this._color.setHex(color);
    for (let i = 0; i < count; i += 1) {
      const s = 12 + Math.random() * 22;
      this._spawnParticle(
        position.x,
        position.y,
        position.z,
        (Math.random() - 0.5) * s,
        (Math.random() - 0.5) * s,
        (Math.random() - 0.5) * s + 6,
        this._color,
        0.22 + Math.random() * 0.16,
        4.5,
      );
    }
  }

  update(dt) {
    const pos = this.positions;
    const col = this.colors;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) {
        continue;
      }
      const i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        pos[i3 + 1] = -9999;
        col[i3 + 0] = 0;
        col[i3 + 1] = 0;
        col[i3 + 2] = 0;
        continue;
      }
      const damp = Math.exp(-this.drag[i] * dt);
      this.velocities[i3 + 0] *= damp;
      this.velocities[i3 + 1] *= damp;
      this.velocities[i3 + 2] *= damp;
      pos[i3 + 0] += this.velocities[i3 + 0] * dt;
      pos[i3 + 1] += this.velocities[i3 + 1] * dt;
      pos[i3 + 2] += this.velocities[i3 + 2] * dt;

      // 用颜色衰减代替逐粒子透明度（PointsMaterial 做不到逐点 alpha）
      const k = Math.pow(Math.max(0, this.life[i] / this.maxLife[i]), 1.6);
      col[i3 + 0] = this.baseColor[i3 + 0] * k;
      col[i3 + 1] = this.baseColor[i3 + 1] * k;
      col[i3 + 2] = this.baseColor[i3 + 2] * k;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.mesh.visible) {
        continue;
      }
      r.life += dt;
      const t = r.life / r.duration;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.6 + r.grow * t);
      r.mesh.material.opacity = r.opacity * (1 - t) * (1 - t);
    }

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity = Math.max(0, this.flash.intensity * Math.exp(-14 * dt));
    } else if (this.flash.intensity !== 0) {
      this.flash.intensity = 0;
    }
  }

  /** 重开一局时清空 */
  clear() {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      this.life[i] = 0;
      this.positions[i * 3 + 1] = -9999;
      this.colors[i * 3 + 0] = 0;
      this.colors[i * 3 + 1] = 0;
      this.colors[i * 3 + 2] = 0;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    for (const r of this.rings) {
      r.mesh.visible = false;
    }
    this.flash.intensity = 0;
  }
}
