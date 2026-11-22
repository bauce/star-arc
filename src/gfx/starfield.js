import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { glowTexture } from './textures.js';

/**
 * 星空：一个 Points 系统，包裹在玩家周围的一个长方体内循环。
 * 玩家真的在飞（位置会变），所以不需要伪造"滚动"，帕 parallax 自然就出来了。
 * 成本：1 次 draw call + 每帧一次环绕（3200 个点）。
 */
export class Starfield {
  constructor(scene) {
    const count = CONFIG.fx.starCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < count; i += 1) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 620;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 420;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 840;

      const t = Math.random();
      if (t < 0.62) {
        color.setRGB(0.85, 0.95, 1.0);
      } else if (t < 0.88) {
        color.setRGB(0.55, 0.8, 1.0);
      } else {
        color.setRGB(1.0, 0.75, 0.9);
      }
      const k = 0.35 + Math.random() * 0.65;
      colors[i * 3 + 0] = color.r * k;
      colors[i * 3 + 1] = color.g * k;
      colors[i * 3 + 2] = color.b * k;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.4,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      opacity: 0.95,
    });

    this.geometry = geometry;
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    // 星星先画，黑洞的"视界"才能盖在它们上面
    this.points.renderOrder = -50;
    scene.add(this.points);

    this.half = { x: 310, y: 210, z: 420 };
  }

  update(dt, center) {
    const attr = this.geometry.attributes.position;
    const arr = attr.array;
    const { x: hx, y: hy, z: hz } = this.half;

    for (let i = 0; i < arr.length; i += 3) {
      let dx = arr[i] - center.x;
      if (dx > hx) dx -= hx * 2;
      else if (dx < -hx) dx += hx * 2;
      arr[i] = center.x + dx;

      let dy = arr[i + 1] - center.y;
      if (dy > hy) dy -= hy * 2;
      else if (dy < -hy) dy += hy * 2;
      arr[i + 1] = center.y + dy;

      let dz = arr[i + 2] - center.z;
      if (dz > hz) dz -= hz * 2;
      else if (dz < -hz) dz += hz * 2;
      arr[i + 2] = center.z + dz;
    }
    attr.needsUpdate = true;
  }
}

/**
 * 远处星云：挂在相机下面，等价于"无限远的天空盒"，
 * 这样玩家飞到哪、怎么横滚，星云都保持在正确的天球位置上。
 */
export function createNebula() {
  const tints = [0x2a1e6b, 0x0d3f6e, 0x5b1a4a, 0x14485c];
  const group = new THREE.Group();
  for (let i = 0; i < 7; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: tints[i % tints.length],
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set((Math.random() - 0.5) * 900, (Math.random() - 0.5) * 500, -520 - Math.random() * 280);
    const s = 300 + Math.random() * 320;
    sprite.scale.set(s, s * (0.6 + Math.random() * 0.5), 1);
    group.add(sprite);
  }
  group.frustumCulled = false;
  return group;
}
