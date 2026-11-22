import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import { glowTexture } from '../gfx/textures.js';

/**
 * 道具：无敌 / 反弹 / 修复
 * ---------------------------------------------------------------
 * 都是「飞过去吃」的类型 —— 因为玩家在 360° 飞行，道具必须出现在机头前方，
 * 让玩家主动调整航向去拾取，这才是一个操作决策，而不是白送的 buff。
 */
export const POWERUP_TYPES = {
  shield: { label: '无敌', color: 0x6ff2ff, emissive: 0x2bd6ff },
  reflect: { label: '反弹', color: 0xff7ad9, emissive: 0xff2d9a },
  repair: { label: '修复', color: 0x7dffb0, emissive: 0x2bd67a },
};

const POOL_SIZE = 6;

export class Powerups {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.items = [];
    this.time = 0;

    const coreGeo = new THREE.OctahedronGeometry(0.85, 0);
    const ringGeo = new THREE.TorusGeometry(1.25, 0.07, 6, 20);
    const glowTex = glowTexture();

    for (let i = 0; i < POOL_SIZE; i += 1) {
      const group = new THREE.Group();
      group.visible = false;

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 2.2,
        metalness: 0.3,
        roughness: 0.25,
        toneMapped: false,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        toneMapped: false,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      const haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(5);
      group.add(halo);

      this.scene.add(group);
      this.items.push({
        active: false,
        type: 'shield',
        group,
        core,
        coreMat,
        ring,
        ringMat,
        halo,
        haloMat,
        pos: group.position,
        ttl: 0,
        spin: 1,
        phase: Math.random() * Math.PI * 2,
      });
    }

    this._loadPodModel();
  }

  /** Blender 做的补给胶囊（tools/blender_assets.py → models/powerup_pod.glb） */
  _loadPodModel() {
    new GLTFLoader().load(
      'models/powerup_pod.glb',
      (gltf) => {
        const src = gltf.scene;
        const box = new THREE.Box3().setFromObject(src);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 2.4 / Math.max(size.x, size.y, size.z);

        for (const item of this.items) {
          const inst = src.clone(true);
          inst.traverse((o) => {
            if (!o.isMesh) return;
            o.material = o.material.clone(); // 每个胶囊独立染色
            if (o.material.emissive && o.material.emissiveIntensity > 0.1) {
              item.coreMat = o.material; // 之后 spawn() 会按道具类型改色
            }
          });
          inst.position.copy(center).multiplyScalar(-1);

          const holder = new THREE.Group();
          holder.scale.setScalar(scale);
          holder.add(inst);
          item.group.add(holder);
          item.core.visible = false; // 关掉原来的八面体
        }
      },
      undefined,
      () => {
        /* 没有 GLB 就继续用程序化胶囊 */
      },
    );
  }

  spawn(frame, type, ahead = CONFIG.powerup.spawnAhead) {
    const item = this.items.find((p) => !p.active);
    if (!item) return null;

    const preset = POWERUP_TYPES[type];
    item.active = true;
    item.type = type;
    item.ttl = CONFIG.powerup.lifetime;
    item.spin = 1.2 + Math.random() * 0.8;
    item.phase = Math.random() * Math.PI * 2;

    item.coreMat.color.setHex(preset.color);
    item.coreMat.emissive.setHex(preset.emissive);
    item.ringMat.color.setHex(preset.color);
    item.haloMat.color.setHex(preset.emissive);

    item.pos
      .copy(frame.pos)
      .addScaledVector(frame.forward, ahead)
      .addScaledVector(frame.right, (Math.random() - 0.5) * 26)
      .addScaledVector(frame.up, (Math.random() - 0.5) * 16);

    item.group.visible = true;
    item.group.scale.setScalar(1);
    return item;
  }

  /** 返回本帧吃到的道具类型（一次只可能吃到一个） */
  update(dt, player) {
    this.time += dt;
    let picked = null;

    for (const item of this.items) {
      if (!item.active) continue;

      item.ttl -= dt;
      item.group.rotation.y += item.spin * dt;
      item.ring.rotation.z += item.spin * 1.6 * dt;
      const pulse = 1 + Math.sin(this.time * 4 + item.phase) * 0.12;
      item.core.scale.setScalar(pulse);
      item.halo.scale.setScalar(5 * pulse);

      if (item.ttl <= 0) {
        item.active = false;
        item.group.visible = false;
        continue;
      }

      const r = CONFIG.powerup.radius + CONFIG.ship.radius;
      if (item.pos.distanceToSquared(player.pos) <= r * r) {
        item.active = false;
        item.group.visible = false;
        this.fx.explode(item.pos, {
          count: 26,
          speed: 16,
          color: item.coreMat.color.getHex(),
          ring: true,
          ringColor: item.coreMat.color.getHex(),
          life: 0.5,
          flash: 180,
        });
        picked = item.type;
      }
    }

    return picked;
  }

  clear() {
    for (const item of this.items) {
      item.active = false;
      item.group.visible = false;
    }
  }
}
