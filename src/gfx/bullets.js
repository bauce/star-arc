import * as THREE from 'three';

/**
 * 子弹对象池
 * ---------------------------------------------------------------
 * 用 InstancedMesh 渲染：无论屏幕上多少发子弹，都只有 1 次 draw call。
 * 逻辑上每个槽位是「active + pos + vel + ttl」，死亡只是把缩放设为 0。
 */
export class BoltPool {
  constructor(scene, { count, color, length = 3.0, width = 0.16, emissiveBoost = 1 }) {
    this.count = count;
    this.items = new Array(count);
    for (let i = 0; i < count; i += 1) {
      this.items[i] = {
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, -1),
        ttl: 0,
        radius: 0.5,
        scale: 1,
      };
    }

    const geometry = new THREE.BoxGeometry(width, width, length);
    const colorObj = new THREE.Color(color).multiplyScalar(emissiveBoost);
    const material = new THREE.MeshBasicMaterial({ color: colorObj, toneMapped: false });

    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this._dummy = new THREE.Object3D();
    this._dummy.scale.setScalar(0);
    this._dummy.updateMatrix();
    for (let i = 0; i < count; i += 1) {
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this._axis = new THREE.Vector3(0, 0, -1);
    this.cursor = 0;
  }

  spawn(position, velocity, { ttl = 1.2, radius = 0.5, scale = 1 } = {}) {
    // 环形游标找一个槽位：最坏情况覆盖最早发射的那一发，天然限流
    let slot = -1;
    for (let i = 0; i < this.count; i += 1) {
      const idx = (this.cursor + i) % this.count;
      if (!this.items[idx].active) {
        slot = idx;
        break;
      }
    }
    if (slot === -1) {
      slot = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
    }

    const item = this.items[slot];
    item.active = true;
    item.pos.copy(position);
    item.vel.copy(velocity);
    item.dir.copy(velocity).normalize();
    item.ttl = ttl;
    item.radius = radius;
    item.scale = scale;
    return item;
  }

  update(dt) {
    for (let i = 0; i < this.count; i += 1) {
      const item = this.items[i];
      if (!item.active) {
        continue;
      }
      item.ttl -= dt;
      if (item.ttl <= 0) {
        item.active = false;
        continue;
      }
      item.pos.addScaledVector(item.vel, dt);
    }
  }

  /** 把逻辑状态写进实例矩阵（每帧一次）：朝飞行方向对齐 */
  commit() {
    for (let i = 0; i < this.count; i += 1) {
      const item = this.items[i];
      if (!item.active) {
        this._dummy.scale.setScalar(0);
        this._dummy.position.set(0, -9999, 0);
        this._dummy.quaternion.identity();
      } else {
        this._dummy.position.copy(item.pos);
        this._dummy.quaternion.setFromUnitVectors(this._axis, item.dir);
        this._dummy.scale.setScalar(item.scale ?? 1);
      }
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const item of this.items) {
      item.active = false;
    }
    this.commit();
  }
}
