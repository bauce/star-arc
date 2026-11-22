import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from '../config.js';
import { Starfield, createNebula } from './starfield.js';
import { environmentTexture } from './textures.js';
import { Backdrop } from './backdrop.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * 渲染舞台：渲染器 / 相机 / 灯光 / 后处理 / 星空
 * 只负责「怎么显示」，不含任何玩法逻辑。
 *
 * 相机是追尾机位：位置和朝向都从战机的四元数推导，
 * 所以飞机横滚、倒飞、翻筋斗时，画面会跟着一起转 —— 这是 360° 飞行感的一半。
 */
export class Stage {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.fx.exposure;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060e);

    // 程序化环境光：让 metalness 高的材质有东西可反射（否则全是黑剪影）
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(environmentTexture()).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      window.innerWidth / window.innerHeight,
      0.8,
      20000, // 地标在几光年外，远平面必须够
    );
    this.scene.add(this.camera);

    // —— 灯光 ——
    this.scene.add(new THREE.AmbientLight(0x2a3a55, 2.6));

    const keyLight = new THREE.DirectionalLight(0xd6ecff, 2.6);
    keyLight.position.set(7, 13, 21);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x4a6fa8, 1.1);
    fillLight.position.set(-14, -9, 6);
    this.scene.add(fillLight);

    const rimCyan = new THREE.PointLight(0x36e8ff, 230, 180, 2);
    rimCyan.position.set(-26, -10, -26);
    this.scene.add(rimCyan);

    const rimMagenta = new THREE.PointLight(0xff3d8b, 150, 200, 2);
    rimMagenta.position.set(30, 14, -52);
    this.scene.add(rimMagenta);
    this.lights = { keyLight, fillLight, rimCyan, rimMagenta };

    this.starfield = new Starfield(this.scene);

    // 星云作为相机的子节点 = 无限远天空
    this.nebula = createNebula();
    this.camera.add(this.nebula);

    // 会缓慢切换的远景（银河 / 黑洞 / 星云团）
    this.backdrop = new Backdrop(this.scene);

    this.baseFov = CONFIG.camera.fov;
    this.fovKick = 0;
    this.warpFx = 0;
    this.warpKick = 0;

    // —— 后处理 ——
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      CONFIG.fx.bloomStrength,
      CONFIG.fx.bloomRadius,
      CONFIG.fx.bloomThreshold,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.shake = 0;
    this.time = 0;
    this._camBase = new THREE.Vector3();
    this._camReady = false;

    this._offset = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._mat = new THREE.Matrix4();
    this._targetQ = new THREE.Quaternion();
    this._shake = new THREE.Vector3();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  addShake(amount) {
    this.shake = Math.min(1.6, this.shake + amount);
  }

  /** 追尾相机：位置与朝向都从战机姿态推导，带阻尼 */
  update(dt, player) {
    this.time += dt;

    this.shake *= Math.exp(-CONFIG.fx.shakeDecay * dt);
    if (this.shake < 0.001) this.shake = 0;

    const q = player.root.quaternion;
    const p = player.pos;
    const cam = CONFIG.camera;

    // 期望机位 = 战机位置 + 机体系偏移（右, 上, 后）
    this._offset.set(cam.offset[0], cam.offset[1], cam.offset[2]).applyQuaternion(q).add(p);
    const kPos = 1 - Math.exp(-cam.positionLag * dt);

    // 关键：基准机位和抖动偏移分开存。
    // 如果直接对 camera.position 做 lerp，抖动会被下一帧当成"当前机位"带进去，形成自我激励的抖动。
    if (!this._camReady) {
      this._camBase.copy(this._offset);
      this._camReady = true;
    } else {
      this._camBase.lerp(this._offset, kPos);
    }

    // 朝向：看向机头前方；up 用量机的 up（倒飞时画面也跟着倒）
    this._fwd.set(0, 0, -1).applyQuaternion(q);
    this._look.copy(p).addScaledVector(this._fwd, cam.lookAhead);
    this._up.set(0, 1, 0).applyQuaternion(q);

    // 只跟随一部分横滚：机身相对画面还有一点点压坡度，否则玩家看不出自己在滚
    if (cam.rollFollow < 1) {
      this._up.lerp(WORLD_UP, 1 - cam.rollFollow);
      if (this._up.lengthSq() < 0.04) this._up.set(0, 1, 0).applyQuaternion(q);
      this._up.normalize();
    }

    this._mat.lookAt(this._camBase, this._look, this._up);
    this._targetQ.setFromRotationMatrix(this._mat);
    this.camera.quaternion.slerp(this._targetQ, 1 - Math.exp(-cam.rotationLag * dt));
    this.camera.position.copy(this._camBase);

    // 抖动：用两个不同频率的正弦叠加，做出「被撞了一下」的晃动，
    // 而不是每帧随机 —— 每帧随机会变成持续的高频震动，看久了非常难受。
    if (this.shake > 0) {
      const t = this.time;
      const amount = this.shake;
      const ox = (Math.sin(t * 41.3) * 0.6 + Math.sin(t * 23.7) * 0.4) * amount;
      const oy = (Math.cos(t * 37.9) * 0.6 + Math.sin(t * 29.1) * 0.4) * amount;
      this._shake.set(ox, oy, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(this._shake);
    }

    this.starfield.update(dt, p);
    this.backdrop.update(dt, p, this.camera);

    // 冲刺时轻微拉开视野，速度感的一半来自这里；穿越时拉得更狠
    const targetKick = (player.boosting ? CONFIG.boost.fovKick : 0) + this.warpFx * 26;
    this.fovKick += (targetKick - this.fovKick) * (1 - Math.exp(-4.5 * dt));
    if (Math.abs(this.camera.fov - (this.baseFov + this.fovKick)) > 0.02) {
      this.camera.fov = this.baseFov + this.fovKick;
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    // 后处理会多次调用 renderer.render()，默认 autoReset 会把统计重置成最后一次 pass 的数字；
    // 关掉它并手动 reset，才能拿到整帧真实的 draw call / 三角面。
    this.renderer.info.reset();
    this.composer.render();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bloom.setSize(size.x, size.y);
  }

  applyQuality() {
    this.bloom.strength = CONFIG.fx.bloomStrength;
    this.bloom.radius = CONFIG.fx.bloomRadius;
    this.bloom.threshold = CONFIG.fx.bloomThreshold;
    this.renderer.toneMappingExposure = CONFIG.fx.exposure;
  }
}
