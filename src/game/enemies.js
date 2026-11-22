import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';

const FIGHTER_COUNT = 6;

/**
 * 障碍物分三类，各自有自己的几何、材质和数值：
 *   岩石  —— 最常见的钝物，血厚、伤害中等
 *   冰晶  —— 脆、亮、半透明，一碰就碎但伤害略低
 *   晶簇  —— 尖锐的紫水晶，血厚且伤害高（值得绕开）
 *
 * 渲染上仍然是「一类 = 一个 InstancedMesh = 一次 draw call」，
 * 所以加种类几乎不花性能预算。
 */
const KINDS = [
  {
    key: 'rock',
    count: 26,
    weight: 0.55,
    hp: 2,
    bigHp: 4,
    score: 10,
    damage: 16,
    radius: [1.1, 3.4],
    tint: [0x7b8da3, 0x685e54, 0x8b7099],
  },
  {
    key: 'ice',
    count: 16,
    weight: 0.25,
    hp: 1,
    bigHp: 2,
    score: 15,
    damage: 12,
    radius: [0.9, 2.4],
    tint: [0xbfe9ff, 0xd8f4ff, 0x9fd6f2],
  },
  {
    key: 'crystal',
    count: 14,
    weight: 0.2,
    hp: 3,
    bigHp: 5,
    score: 20,
    damage: 22,
    radius: [0.8, 2.2],
    tint: [0x9a6bff, 0xb07bff, 0x7d5cf0],
  },
  {
    key: 'metal',
    count: 14,
    weight: 0.12,
    hp: 3,
    bigHp: 5,
    score: 25,
    damage: 20,
    radius: [1.1, 2.6],
    tint: [0xd2d8e0, 0xb8bfc8, 0xe2e8ee],
  },
  {
    key: 'basalt',
    count: 18,
    weight: 0.18,
    hp: 3,
    bigHp: 6,
    score: 18,
    damage: 18,
    radius: [1.4, 3.8],
    tint: [0x929aa4, 0x7a828c, 0xa4acb6],
  },
];

const FIGHTER_KINDS = {
  raider: { hp: 4, damage: 12, speed: 40, maxSpeed: 95, radius: 2.3, score: 35, fire: 1.7, model: 'models/enemy_fighter.glb', scale: 6.2 },
  gunship: { hp: 10, damage: 26, speed: 26, maxSpeed: 70, radius: 3.6, score: 90, fire: 2.3, model: 'models/enemy_gunship.glb', scale: 9.0 },
};

const _target = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/** 各类障碍物炸开时的配色，避免五种石头炸出同一朵烟花 */
const PALETTE = {
  rock: { color: 0xffc38b, ring: 0xffa96b, spark: 0xffd8a8 },
  ice: { color: 0xbfe9ff, ring: 0x8fe0ff, spark: 0xdff2ff },
  crystal: { color: 0xc9a4ff, ring: 0x9a6bff, spark: 0xd6b4ff },
  metal: { color: 0xe8eef6, ring: 0xaeb8c4, spark: 0xffffff },
  basalt: { color: 0xe0c9a8, ring: 0xa8926e, spark: 0xffe0b0 },
};

/** 确定性顶点扰动：共享顶点位移相同，不会把多边形撕开 */
function bumpGeometry(geo, amp, freq, seed = 0) {
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const bump =
      1 +
      amp * Math.sin(v.x * freq) * Math.cos(v.y * freq * 0.87 + seed) +
      amp * 0.6 * Math.sin(v.z * freq * 1.4 + 1.7) +
      amp * 0.4 * Math.cos(v.x * freq * 2 + v.y * freq * 1.6);
    v.multiplyScalar(bump);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Enemies {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.time = 0;

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._hitColor = new THREE.Color(0xffe6bf);

    this.stations = [];
    for (let i = 0; i < 2; i += 1) {
      const group = new THREE.Group();
      group.visible = false;
      this.scene.add(group);
      this.stations.push({
        active: false,
        group,
        pos: group.position,
        hp: 0,
        maxHp: 60,
        radius: 26,
        spin: 0.05,
      });
    }

    this._buildAsteroids();
    this._buildFighters();
    this._loadFighterModel();
    this._loadAsteroidModels();
    this._loadStations();
  }

  /**
   * 用 Blender 做的几何替换掉程序化的石头外壳。
   * 只换 geometry / material，实例池、碰撞、数值全部复用 —— 改模型不影响玩法。
   */
  _loadAsteroidModels() {
    const map = {
      rock: 'models/asteroid_rock.glb',
      ice: 'models/asteroid_ice.glb',
      crystal: 'models/asteroid_crystal.glb',
      metal: 'models/debris_plate.glb',
    };
    const loader = new GLTFLoader();
    for (const [key, url] of Object.entries(map)) {
      loader.load(url, (gltf) => {
        const pool = this.pools.find((p) => p.kind.key === key);
        if (!pool) return;
        let src = null;
        gltf.scene.traverse((o) => {
          if (o.isMesh && !src) src = o;
        });
        if (!src) return;
        pool.mesh.geometry = src.geometry;
        pool.mesh.material = src.material;
        pool.mesh.computeBoundingSphere?.();
      }, undefined, () => {});
    }
  }

  _createPool(kind, index) {
    let geometry;
    if (kind.key === 'rock') {
      geometry = bumpGeometry(new THREE.IcosahedronGeometry(1, 1), 0.2, 3.1);
    } else if (kind.key === 'ice') {
      geometry = bumpGeometry(new THREE.IcosahedronGeometry(1, 1), 0.3, 4.6, 2.1);
    } else if (kind.key === 'basalt') {
      geometry = bumpGeometry(new THREE.IcosahedronGeometry(1, 1), 0.34, 2.5, 1.3);
    } else if (kind.key === 'metal') {
      // 残骸：一块带厚度的船体板，比圆滚滚的石头更像"人造物"
      geometry = new THREE.BoxGeometry(1.55, 0.4, 2.1, 2, 1, 3);
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        pos.setZ(i, pos.getZ(i) + (Math.random() - 0.5) * 0.18);
      }
      geometry.computeVertexNormals();
    } else {
      geometry = new THREE.OctahedronGeometry(1, 0);
      geometry.scale(0.72, 1.75, 0.72);
    }

    let material;
    if (kind.key === 'ice') {
      material = new THREE.MeshStandardMaterial({
        color: 0xdff2ff,
        emissive: 0x2a6f96,
        emissiveIntensity: 0.7,
        metalness: 0.1,
        roughness: 0.18,
        flatShading: true,
        transparent: true,
        opacity: 0.9,
      });
    } else if (kind.key === 'crystal') {
      material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x6a2fd6,
        emissiveIntensity: 1.1,
        metalness: 0.5,
        roughness: 0.28,
        flatShading: true,
      });
    } else if (kind.key === 'metal') {
      material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.82,
        roughness: 0.38,
        flatShading: true,
      });
    } else if (kind.key === 'basalt') {
      material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.14,
        roughness: 0.95,
        flatShading: true,
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.18,
        roughness: 0.92,
        flatShading: true,
      });
    }

    const mesh = new THREE.InstancedMesh(geometry, material, kind.count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    const items = [];
    for (let i = 0; i < kind.count; i += 1) {
      const item = {
        active: false,
        pos: new THREE.Vector3(0, -9999, 0),
        vel: new THREE.Vector3(),
        euler: new THREE.Euler(),
        spin: new THREE.Vector3(),
        radius: 1,
        hp: 1,
        hitFlash: 0,
        tint: new THREE.Color(0x8595a8),
        kind,
        pool: { mesh, index },
      };
      items.push(item);
      this._dummy.position.set(0, -9999, 0);
      this._dummy.scale.setScalar(0);
      this._dummy.updateMatrix();
      mesh.setMatrixAt(i, this._dummy.matrix);
      mesh.setColorAt(i, this._color.setHex(kind.tint[0]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return { kind, mesh, items };
  }

  _buildAsteroids() {
    this.pools = KINDS.map((kind, index) => this._createPool(kind, index));
    this.asteroids = this.pools.flatMap((pool) => pool.items);
    this.totalWeight = KINDS.reduce((n, k) => n + k.weight, 0);
  }

  /** 贴上 ComfyUI 生成的表面贴图（缺图时保持纯色） */
  setAsteroidTexture(key, tex) {
    const pool = this.pools.find((p) => p.kind.key === key);
    if (!pool) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.6, 1.6);
    pool.mesh.material.map = tex;
    pool.mesh.material.needsUpdate = true;
  }

  /**
   * Blender 做的敌机模型（tools/blender_assets.py → public/models/enemy_fighter.glb）
   * 加载成功就把程序化的八面体替换掉；失败则保留程序化版本。
   */
  _loadFighterModel() {
    const loader = new GLTFLoader();
    for (const [kindKey, def] of Object.entries(FIGHTER_KINDS)) {
      loader.load(
        def.model,
        (gltf) => {
          const src = gltf.scene;
          const box = new THREE.Box3().setFromObject(src);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const scale = def.scale / Math.max(size.z, 0.001);

          for (const f of this.fighters) {
            const inst = src.clone(true);
            inst.position.copy(center).multiplyScalar(-1);

            const holder = new THREE.Group();
            holder.scale.setScalar(scale);
            holder.add(inst);
            holder.visible = false;
            holder.userData.isModel = true;
            f.group.add(holder);
            f.models[kindKey] = holder;
          }

          // 模型到位后把程序化部件收起来
          for (const f of this.fighters) {
            for (const child of f.group.children) {
              if (!child.userData.isModel) child.visible = false;
            }
          }
        },
        undefined,
        () => {
          /* 没有 GLB 就用程序化敌机 */
        },
      );
    }
  }

  _buildFighters() {
    const shell = new THREE.MeshStandardMaterial({
      color: 0xa83a5a,
      emissive: 0x7a0f2a,
      emissiveIntensity: 1.8,
      metalness: 0.55,
      roughness: 0.5,
      flatShading: true,
    });
    const glow = new THREE.MeshStandardMaterial({
      color: 0xff2d6a,
      emissive: 0xff2d6a,
      emissiveIntensity: 3.2,
      metalness: 0.2,
      roughness: 0.4,
      toneMapped: false,
    });

    this.fighters = [];
    for (let i = 0; i < FIGHTER_COUNT; i += 1) {
      const group = new THREE.Group();
      group.visible = false;

      const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), shell);
      group.add(core);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.11, 6, 18), glow);
      group.add(ring);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), glow);
      eye.position.z = -1.15;
      group.add(eye);

      const prongGeo = new THREE.BoxGeometry(0.16, 0.16, 1.6);
      for (const side of [-1, 1]) {
        const prong = new THREE.Mesh(prongGeo, shell);
        prong.position.set(side * 1.2, 0, 0.35);
        prong.rotation.z = side * 0.25;
        group.add(prong);
      }

      this.scene.add(group);
      this.fighters.push({
        active: false,
        group,
        ring,
        core,
        pos: group.position,
        hp: 0,
        state: 'enter',
        fireTimer: 0,
        phase: Math.random() * Math.PI * 2,
        hitFlash: 0,
        radius: CONFIG.fighter.radius,
        kind: 'raider',
        def: FIGHTER_KINDS.raider,
        models: {},
      });
    }
  }

  // ————————————————— 生成（用玩家机体系） —————————————————

  spawnAsteroid(difficulty = 1, frame) {
    const cfg = CONFIG.asteroid;

    // 按权重抽一类
    let roll = Math.random() * this.totalWeight;
    let pool = this.pools[0];
    for (const p of this.pools) {
      roll -= p.kind.weight;
      if (roll <= 0) {
        pool = p;
        break;
      }
    }

    const item = pool.items.find((a) => !a.active);
    if (!item) return false;

    const kind = pool.kind;
    const big = Math.random() < 0.18;
    const radius = big
      ? kind.radius[1] * (0.9 + Math.random() * 0.35)
      : THREE.MathUtils.lerp(kind.radius[0], kind.radius[1], Math.random() * 0.6);

    const ahead = cfg.spawnAhead * (0.85 + Math.random() * 0.3);

    item.active = true;
    item.radius = radius;
    item.hp = big ? kind.bigHp : kind.hp;
    item.hitFlash = 0;
    item.score = kind.score;
    item.damage = kind.damage;
    item.pos
      .copy(frame.pos)
      .addScaledVector(frame.forward, ahead)
      .addScaledVector(frame.right, (Math.random() - 0.5) * 2 * cfg.spread)
      .addScaledVector(frame.up, (Math.random() - 0.5) * 2 * cfg.spread * 0.62);
    item.vel
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(0.9)
      .addScaledVector(frame.forward, -(2 + Math.random() * 4) * (0.8 + difficulty * 0.2));
    item.euler.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    item.spin.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6);
    item.tint.setHex(kind.tint[Math.floor(Math.random() * kind.tint.length)]);

    // 偶尔生成一片碎石群，避免"一颗一颗飞过来"的单调
    if (Math.random() < 0.16) this._scatter(item.pos, radius * 0.55, 3);
    return true;
  }

  /** 在指定世界坐标撒一把小碎石（大石头爆裂 / 碎石群都用它） */
  _scatter(pos, radius, count) {
    const pool = this.pools[0];
    const kind = pool.kind;
    for (let i = 0; i < count; i += 1) {
      const item = pool.items.find((a) => !a.active);
      if (!item) return;
      item.active = true;
      item.radius = radius;
      item.hp = 1;
      item.score = Math.round(kind.score * 0.6);
      item.damage = kind.damage * 0.55;
      item.hitFlash = 0;
      item.pos
        .copy(pos)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          .multiplyScalar(radius * 2.4));
      item.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6);
      item.euler.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      item.spin.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2);
      item.tint.setHex(kind.tint[Math.floor(Math.random() * kind.tint.length)]);
    }
  }

  /** 废弃空间站：比石头大得多，慢转、血厚、撞上必死 */
  _loadStations() {
    new GLTFLoader().load(
      'models/station_derelict.glb',
      (gltf) => {
        const src = gltf.scene;
        const box = new THREE.Box3().setFromObject(src);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 70 / Math.max(size.x, size.y, size.z);

        for (const st of this.stations) {
          const inst = src.clone(true);
          inst.position.copy(center).multiplyScalar(-1);
          const holder = new THREE.Group();
          holder.scale.setScalar(scale);
          holder.add(inst);
          st.group.add(holder);
          st.group.visible = st.active; // 模型可能在生成之后才加载完，别把已激活的藏起来
        }
      },
      undefined,
      () => {},
    );
  }

  spawnStation(frame) {
    const st = this.stations.find((s) => !s.active);
    if (!st) return false;
    st.active = true;
    st.hp = 60;
    st.maxHp = 60;
    st.radius = 26;
    st.spin = 0.045 + Math.random() * 0.03;
    st.group.visible = true;
    st.pos
      .copy(frame.pos)
      .addScaledVector(frame.forward, 780 + Math.random() * 200)
      .addScaledVector(frame.right, (Math.random() - 0.5) * 120)
      .addScaledVector(frame.up, (Math.random() - 0.5) * 80);
    st.group.rotation.set(Math.random() * 0.4, Math.random() * 6.28, Math.random() * 0.3);
    return true;
  }

  spawnFighter(frame, kind = 'raider') {
    const fighter = this.fighters.find((f) => !f.active);
    if (!fighter) return false;
    const cfg = CONFIG.fighter;
    const def = FIGHTER_KINDS[kind] || FIGHTER_KINDS.raider;
    fighter.active = true;
    fighter.kind = kind;
    fighter.def = def;
    fighter.radius = def.radius;
    for (const [k, holder] of Object.entries(fighter.models)) {
      holder.visible = k === kind;
    }
    fighter.hp = def.hp;
    fighter.state = 'enter';
    fighter.fireTimer = 1.2;
    fighter.phase = Math.random() * Math.PI * 2;
    fighter.hitFlash = 0;
    fighter.group.visible = true;
    fighter.group.scale.setScalar(1);
    fighter.pos
      .copy(frame.pos)
      .addScaledVector(frame.forward, cfg.spawnAhead)
      .addScaledVector(frame.right, (Math.random() - 0.5) * 40)
      .addScaledVector(frame.up, (Math.random() - 0.5) * 20);
    return true;
  }

  // ————————————————— 更新 —————————————————

  update(dt, player, frame, onEnemyFire) {
    this.time += dt;
    const cfg = CONFIG.fighter;

    for (const st of this.stations) {
      if (!st.active) continue;
      st.group.rotation.y += st.spin * dt;
      _rel.subVectors(st.pos, player.pos);
      if (_rel.dot(frame.forward) < -300 || _rel.lengthSq() > 3000 * 3000) {
        st.active = false;
        st.group.visible = false;
      }
    }

    for (const a of this.asteroids) {
      if (!a.active) continue;
      a.pos.addScaledVector(a.vel, dt);
      a.euler.x += a.spin.x * dt;
      a.euler.y += a.spin.y * dt;
      a.euler.z += a.spin.z * dt;
      a.hitFlash = Math.max(0, a.hitFlash - dt * 5);

      _rel.subVectors(a.pos, player.pos);
      if (_rel.dot(frame.forward) < -CONFIG.asteroid.despawnBehind || _rel.lengthSq() > 480 * 480) {
        a.active = false;
      }
    }

    for (const f of this.fighters) {
      if (!f.active) continue;
      f.hitFlash = Math.max(0, f.hitFlash - dt * 5);

      _target
        .copy(player.pos)
        .addScaledVector(frame.forward, cfg.holdAhead)
        .addScaledVector(frame.right, Math.sin(this.time * 0.85 + f.phase) * 9)
        .addScaledVector(frame.up, Math.cos(this.time * 0.7 + f.phase) * 5);

      _tmp.subVectors(_target, f.pos);
      const dist = _tmp.length();
      if (dist > 0.001) {
        const speed = f.state === 'engage' ? f.def.maxSpeed : f.def.speed;
        f.pos.addScaledVector(_tmp.divideScalar(dist), Math.min(dist, speed * dt));
      }

      if (f.state === 'enter' && dist < 26) {
        f.state = 'engage';
      }

      if (f.state === 'engage') {
        f.fireTimer -= dt;
        if (f.fireTimer <= 0 && player.alive) {
          f.fireTimer = f.def.fire * (0.75 + Math.random() * 0.5);
          _tmp.subVectors(player.pos, f.pos);
          if (_tmp.lengthSq() > 0.001) {
            _tmp.normalize();
            onEnemyFire(f.pos.clone().addScaledVector(_tmp, 1.6), _tmp.clone());
          }
        }
      }

      f.ring.rotation.z += dt * 2.6;
      f.core.rotation.y += dt * 0.9;
      f.group.rotation.z = Math.sin(this.time * 1.1 + f.phase) * 0.18;

      _rel.subVectors(f.pos, player.pos);
      if (_rel.dot(frame.forward) < -45 || _rel.lengthSq() > 520 * 520) {
        f.active = false;
        f.group.visible = false;
      }
    }
  }

  commit() {
    for (const pool of this.pools) {
      const items = pool.items;
      for (let i = 0; i < items.length; i += 1) {
        const a = items[i];
        if (!a.active) {
          this._dummy.position.set(0, -9999, 0);
          this._dummy.scale.setScalar(0);
          this._dummy.rotation.set(0, 0, 0);
        } else {
          this._dummy.position.copy(a.pos);
          this._dummy.rotation.copy(a.euler);
          const squash = a.kind.key === 'crystal' ? 1 : 0.86;
          this._dummy.scale.set(a.radius * 1.05, a.radius * squash, a.radius);
        }
        this._dummy.updateMatrix();
        pool.mesh.setMatrixAt(i, this._dummy.matrix);

        if (a.hitFlash > 0) {
          this._color.copy(a.tint).lerp(this._hitColor, a.hitFlash * 0.85);
        } else {
          this._color.copy(a.tint);
        }
        pool.mesh.setColorAt(i, this._color);
      }
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    }
  }

  hitTest(point, radius, damage) {
    for (const st of this.stations) {
      if (!st.active) continue;
      const r = st.radius * 0.8 + radius;
      if (st.pos.distanceToSquared(point) > r * r) continue;
      st.hp -= damage * 1.6;
      if (st.hp <= 0) {
        st.active = false;
        st.group.visible = false;
        this.fx.explode(st.pos, {
          count: 140, speed: 46, color: 0xffc38b, ringColor: 0xffa96b, life: 1.2, flash: 1400,
        });
        this._scatter(st.pos, 3.2, 6);
        return { kind: 'station', score: 400 };
      }
      this.fx.sparks(point, 0xffd8a8, 4);
      return { kind: 'station-hit', score: 0 };
    }
    for (const a of this.asteroids) {
      if (!a.active) continue;
      const r = a.radius * 0.92 + radius;
      if (a.pos.distanceToSquared(point) <= r * r) {
        a.hp -= damage;
        a.hitFlash = 1;
        if (a.hp <= 0) {
          a.active = false;
          const pal = PALETTE[a.kind.key] || PALETTE.rock;
          // 大石头炸成小块 —— 玩家得为"打爆它"付出一点走位成本
          if ((a.kind.key === 'rock' || a.kind.key === 'basalt') && a.radius >= 2.6) {
            this._scatter(a.pos, a.radius * 0.42, 3);
          }
          this.fx.explode(a.pos, {
            count: 30 + Math.round(a.radius * 12),
            speed: 22 + a.radius * 8,
            color: pal.color,
            ringColor: pal.ring,
            ring: a.radius > 2.0,
            life: 0.7,
            flash: 220 * a.radius,
          });
          return { kind: a.kind.key, score: a.score };
        }
        this.fx.sparks(point, (PALETTE[a.kind.key] || PALETTE.rock).spark, 5);
        return { kind: `${a.kind.key}-hit`, score: 0 };
      }
    }

    for (const f of this.fighters) {
      if (!f.active) continue;
      const r = f.radius + radius;
      if (f.pos.distanceToSquared(point) <= r * r) {
        f.hp -= damage;
        f.hitFlash = 1;
        if (f.hp <= 0) {
          f.active = false;
          f.group.visible = false;
          this.fx.explode(f.pos, {
            count: 46,
            speed: 30,
            color: 0xff6b8a,
            ringColor: 0xff2d6a,
            life: 0.75,
            flash: 520,
          });
          return { kind: 'fighter', score: f.def.score };
        }
        this.fx.sparks(point, 0xff9db4, 6);
        return { kind: 'fighter-hit', score: 0 };
      }
    }
    return null;
  }

  collideWithPlayer(player) {
    let damage = 0;
    const p = player.pos;

    for (const a of this.asteroids) {
      if (!a.active) continue;
      const r = a.radius * 0.9 + CONFIG.ship.radius;
      if (a.pos.distanceToSquared(p) <= r * r) {
        damage += a.damage * (0.6 + a.radius * 0.35);
        a.active = false;
        const pal = PALETTE[a.kind.key] || PALETTE.rock;
        this.fx.explode(a.pos, {
          count: 34,
          speed: 26,
          color: pal.color,
          ringColor: pal.ring,
          life: 0.6,
          flash: 300,
        });
      }
    }

    for (const st of this.stations) {
      if (!st.active) continue;
      const r = st.radius * 0.55 + CONFIG.ship.radius;
      if (st.pos.distanceToSquared(p) <= r * r) {
        damage += 45;
        st.active = false;
        st.group.visible = false;
        this.fx.explode(st.pos, { count: 120, speed: 40, color: 0xffc38b, life: 1.1, flash: 1200 });
      }
    }

    for (const f of this.fighters) {
      if (!f.active) continue;
      const r = f.radius + CONFIG.ship.radius;
      if (f.pos.distanceToSquared(p) <= r * r) {
        damage += f.def.damage;
        f.active = false;
        f.group.visible = false;
        this.fx.explode(f.pos, { count: 40, speed: 28, color: 0xff6b8a, life: 0.7, flash: 420 });
      }
    }

    return damage;
  }

  activeFighters() {
    return this.fighters.reduce((n, f) => n + (f.active ? 1 : 0), 0);
  }

  clear() {
    for (const a of this.asteroids) a.active = false;
    for (const st of this.stations) {
      st.active = false;
      st.group.visible = false;
    }
    for (const f of this.fighters) {
      f.active = false;
      f.group.visible = false;
    }
    this.commit();
  }
}
