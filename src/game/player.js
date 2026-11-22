import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import { glowTexture } from '../gfx/textures.js';
import { createShipModel } from './shipModel.js';

/**
 * 玩家战机 —— 360° 自由飞行
 * ---------------------------------------------------------------
 * 和上一版（贴在一个平面上的滑块）最大的区别：
 * 姿态用四元数表达，机头方向 = 前进方向，俯仰/偏航/滚转都在**机体坐标系**里积分。
 *
 *   angVel = (pitch, yaw, roll)      目标角速度由输入决定
 *   dq = quat(angVel * dt)           local-space 增量
 *   q  = q * dq                      右侧相乘 = 在机体系里转
 *
 * 所以可以做完整的筋斗、横滚、倒飞 —— 这才是「飞机那种操作感」。
 * 另外转弯时会自动侧倾（bankFromYaw），视觉上才有「压坡度」的味道。
 */

export class Player {
  constructor(scene) {
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.model);
    scene.add(this.root);

    this.pos = this.root.position;
    this.angVel = new THREE.Vector3(); // 机体系角速度 rad/s
    this.speed = CONFIG.flight.speed;
    this.time = 0;
    this.alive = true;
    this.hitFlash = 0;

    // 加力 / 道具状态
    this.boost = CONFIG.boost.max;
    this.boosting = false;
    this.boostDelay = 0;
    this.invincible = 0;
    this.reflect = 0;

    const ship = createShipModel();
    this.procedural = ship.group;
    this.model.add(this.procedural);
    this.hullMaterials = ship.hullMaterials;
    this.nozzlePoints = ship.nozzles;

    this._buildEngines();
    this._buildShield();
    this._loadGltfShip();

    this._localMuzzle = [
      new THREE.Vector3(-0.72, -0.06, -1.4),
      new THREE.Vector3(0.72, -0.06, -1.4),
    ];
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
    this._euler = new THREE.Euler();

    this.reset();
  }

  /**
   * AI 生成的战机模型（ComfyUI Hunyuan3D 图生 3D → GLB）
   * 加载成功就替换掉程序化几何；失败则静默保留程序化版本。
   */
  _loadGltfShip() {
    if (!CONFIG.ship.useGltfModel) return;
    // 调试：?ship=proc 强制用程序化模型，方便和 AI 模型 A/B
    if (new URLSearchParams(location.search).get('ship') === 'proc') return;

    new GLTFLoader().load(
      'models/ship.glb',
      (gltf) => {
        const root = gltf.scene;

        // 归一化：居中 + 缩放到指定机身长度 + 转向（Hunyuan3D 默认机头朝 +Z）
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = CONFIG.ship.modelLength / Math.max(size.z, 0.001);

        const holder = new THREE.Group();
        root.position.sub(center);
        root.rotation.y = Math.PI;
        holder.scale.setScalar(scale);
        holder.add(root);

        // 模型没有法线/UV，补算法线并换成统一的金属材质
        root.traverse((o) => {
          if (!o.isMesh) return;
          const geo = o.geometry;
          if (!geo.attributes.normal) geo.computeVertexNormals();
          o.material = new THREE.MeshStandardMaterial({
            color: 0xc2d2e6,
            metalness: 0.6,
            roughness: 0.44,
            flatShading: true,
          });
        });

        this.model.add(holder);
        this.gltfShip = holder;
        this.procedural.visible = false;
        this._placeEnginesForModel(scale, size);
      },
      undefined,
      () => {
        /* 没有 GLB 就继续用程序化模型 */
      },
    );
  }

  /** 把尾焰挪到模型的三处喷口上 */
  _placeEnginesForModel(scale, size) {
    const halfLen = (size.z * scale) / 2;
    const spots = [-0.95, 0.95];
    this.engineSprites.forEach((sprite, i) => {
      sprite.position.set(spots[i] ?? 0, -0.1, halfLen + 0.15);
      sprite.material.opacity = 0.4;
      sprite.scale.setScalar(0.38);
    });
    this.engineLight.position.set(0, -0.1, halfLen + 0.3);
    this.engineLight.intensity = 4;
  }

  _buildEngines() {
    const tex = glowTexture();
    this.engineSprites = [];
    for (const nozzle of this.nozzlePoints) {
      const material = new THREE.SpriteMaterial({
        map: tex,
        color: 0x6fd8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(nozzle);
      sprite.position.z += 0.18;
      sprite.scale.setScalar(0.55);
      this.model.add(sprite);
      this.engineSprites.push(sprite);
    }

    this.engineLight = new THREE.PointLight(0x66e0ff, 7, 22, 2);
    this.engineLight.position.set(0, -0.16, 3.0);
    this.model.add(this.engineLight);
  }

  /** 护盾罩：用菲涅尔项，只有边缘发光，不会挡住机身 */
  _buildShield() {
    this.shieldGroup = new THREE.Group();
    this.shieldGroup.visible = false;

    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x6ff2ff) },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
          gl_FragColor = vec4(uColor * f * 1.6, f * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const bubble = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 20), this.shieldMat);
    this.shieldGroup.add(bubble);
    this.model.add(this.shieldGroup);
  }

  reset() {
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.angVel.set(0, 0, 0);
    this.speed = CONFIG.flight.speed;
    this.alive = true;
    this.hitFlash = 0;
    this.boost = CONFIG.boost.max;
    this.boosting = false;
    this.boostDelay = 0;
    this.invincible = 0;
    this.reflect = 0;
    this.shieldGroup.visible = false;
    this.root.visible = true;
  }

  /** 机头方向（单位向量，复用了临时对象，别存引用） */
  get forward() {
    return this._fwd.set(0, 0, -1).applyQuaternion(this.root.quaternion);
  }

  update(dt, input) {
    const f = CONFIG.flight;
    this.time += dt;

    const steer = input.steer;
    const invert = f.invertPitch ? -1 : 1;

    // 机体坐标系下的目标角速度
    const targetPitch = steer.y * f.pitchRate * invert;
    const targetYaw = -steer.x * f.yawRate;
    const targetRoll = -input.roll * f.rollRate + targetYaw * f.bankFromYaw;

    const k = 1 - Math.exp(-f.response * dt);
    this.angVel.x += (targetPitch - this.angVel.x) * k;
    this.angVel.y += (targetYaw - this.angVel.y) * k;
    this.angVel.z += (targetRoll - this.angVel.z) * k;

    // 在机体坐标系里积分姿态
    this._euler.set(this.angVel.x * dt, this.angVel.y * dt, this.angVel.z * dt, 'XYZ');
    this._dq.setFromEuler(this._euler);
    this.root.quaternion.multiply(this._dq).normalize();

    // 加力：消耗能量，松开后延迟回充
    const b = CONFIG.boost;
    const wantBoost = input.boost && this.boost > 0.5 && this.alive;
    this.boosting = wantBoost;
    if (wantBoost) {
      this.boost = Math.max(0, this.boost - b.drain * dt);
      this.boostDelay = b.regenDelay;
    } else {
      this.boostDelay = Math.max(0, this.boostDelay - dt);
      if (this.boostDelay <= 0) {
        this.boost = Math.min(b.max, this.boost + b.regen * dt);
      }
    }

    // 速度：加力冲刺
    const targetSpeed = wantBoost ? f.boostSpeed : f.speed;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-f.speedResponse * dt));

    // 道具计时 + 护盾罩
    this.invincible = Math.max(0, this.invincible - dt);
    this.reflect = Math.max(0, this.reflect - dt);
    const shieldOn = this.invincible > 0 || this.reflect > 0;
    this.shieldGroup.visible = shieldOn;
    if (shieldOn) {
      const color = this.invincible > 0 ? 0x6ff2ff : 0xff7ad9;
      const pulse = 0.7 + Math.sin(this.time * 6) * 0.2;
      this.shieldMat.uniforms.uColor.value.setHex(color);
      this.shieldMat.uniforms.uOpacity.value = pulse;
      this.shieldGroup.scale.setScalar(1 + Math.sin(this.time * 6) * 0.02);
    }

    // 前进 = 机头方向
    this._fwd.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    this.pos.addScaledVector(this._fwd, this.speed * dt);

    // 尾焰随速度伸缩（脉动幅度压小一点，避免看起来像整机在震）
    // 注意：speed/boostSpeed 必须钳制 —— 否则一旦 boostSpeed 被调小，
    // 尾焰贴片会被放大到几千单位，直接糊满整个屏幕。
    const speedRatio = THREE.MathUtils.clamp(this.speed / Math.max(f.boostSpeed, 1), 0, 1);
    const throttle = 0.75 + speedRatio * 0.5 + (this.boosting ? 0.35 : 0);
    for (const sprite of this.engineSprites) {
      const pulse = 1 + Math.sin(this.time * 16) * 0.045;
      sprite.scale.setScalar(0.55 * throttle * pulse);
    }
    this.engineLight.intensity = 6 * throttle;

    // 受击闪白
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
      const flash = this.hitFlash;
      for (const mat of this.hullMaterials) {
        mat.emissive.setRGB(flash * 0.85, 0.06 * flash, 0.12 * flash);
      }
    }

    this.root.updateMatrixWorld();
  }

  /** 机体系三轴（供相机/生成器复用，返回值每帧会被覆写） */
  getBasis(right, up, forward) {
    const q = this.root.quaternion;
    right.set(1, 0, 0).applyQuaternion(q);
    up.set(0, 1, 0).applyQuaternion(q);
    forward.set(0, 0, -1).applyQuaternion(q);
  }

  /** 枪口世界坐标 */
  muzzle(index, out = new THREE.Vector3()) {
    const local = this._localMuzzle[index % 2];
    return out.copy(local).applyQuaternion(this.root.quaternion).add(this.pos);
  }
}
