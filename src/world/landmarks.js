import * as THREE from 'three';
import { glowTexture } from '../gfx/textures.js';

/**
 * 可飞入的地标：黑洞 / 银河
 * ---------------------------------------------------------------
 * 和背景天球（无限远、跟玩家平移）不同，地标是**真实存在于世界坐标**里的物体：
 * 玩家要朝它飞，靠近到阈值就触发「穿越」或「进入」。
 *
 * 视觉上刻意做了层次：
 *   黑洞 = 绝对黑的视界球（会挡住后面的星星）+ 倾斜的吸积盘 + 光子环 + 外圈辉光
 *   银河 = 6000 颗螺旋分布的粒子（可以真的飞进去）+ 核心辉光
 */

const TAU = Math.PI * 2;

function discTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  const g = ctx.createRadialGradient(cx, cy, size * 0.16, cx, cy, size * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.32, 'rgba(255,244,220,0)');
  g.addColorStop(0.46, 'rgba(255,238,205,0.95)');
  g.addColorStop(0.56, 'rgba(255,170,80,0.85)');
  g.addColorStop(0.72, 'rgba(255,110,40,0.35)');
  g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, TAU);
  ctx.fill();

  // 吸积盘里的湍流条纹
  let s = 12345;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < 300; i += 1) {
    const a = rnd() * TAU;
    const r = size * (0.23 + rnd() * 0.24);
    const w = 2 + rnd() * 22;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = `rgba(255,${200 + rnd() * 55 | 0},${140 + rnd() * 80 | 0},${0.05 + rnd() * 0.12})`;
    ctx.fillRect(-w / 2, -1.5, w, 3);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBlackHole() {
  const group = new THREE.Group();
  const tilt = -Math.PI / 2 + 0.34;

  // 视界：纯黑球，会遮住背后的星星 —— 这是「洞」的关键
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(56, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  group.add(horizon);

  // 吸积盘：一张带椭圆环的贴图，倾斜摆放
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 250),
    new THREE.MeshBasicMaterial({
      map: discTexture(),
      color: 0xd8c4ac,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  disc.rotation.x = tilt;
  group.add(disc);

  // 光子环
  const photon = new THREE.Mesh(
    new THREE.TorusGeometry(58, 0.8, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0xffe9c4, toneMapped: false }),
  );
  photon.rotation.x = tilt;
  group.add(photon);

  // 外圈辉光
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffa45e,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(280);
  group.add(glow);

  return {
    group,
    entryRadius: 120,
    label: '黑洞',
    type: 'blackhole',
    update(dt) {
      disc.rotation.z += dt * 0.12;
      photon.rotation.z -= dt * 0.2;
    },
  };
}

function createGalaxy() {
  const group = new THREE.Group();
  const COUNT = 6000;
  const radius = 340;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const color = new THREE.Color();

  for (let i = 0; i < COUNT; i += 1) {
    const t = Math.pow(Math.random(), 0.6);
    const arm = i % 3;
    const angle = arm * (TAU / 3) + t * 4.2 + (Math.random() - 0.5) * 0.5;
    const r = 14 + t * radius;
    const spread = 6 + t * 46;

    positions[i * 3 + 0] = Math.cos(angle) * r + (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * (10 + t * 46);
    positions[i * 3 + 2] = Math.sin(angle) * r + (Math.random() - 0.5) * spread;

    const hue = 0.55 + t * 0.12 + Math.random() * 0.05;
    color.setHSL(hue % 1, 0.7, 0.6 + Math.random() * 0.3);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 3.2,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
  points.frustumCulled = false;
  group.add(points);

  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffe9c8,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  core.scale.setScalar(150);
  group.add(core);

  return {
    group,
    entryRadius: 300,
    label: '银河',
    type: 'galaxy',
    update(dt) {
      group.rotation.y += dt * 0.03;
    },
  };
}

export function createLandmark(scene, type, position) {
  const landmark = type === 'galaxy' ? createGalaxy() : createBlackHole();
  landmark.group.position.copy(position);
  scene.add(landmark.group);

  landmark.position = landmark.group.position;
  landmark.dispose = () => {
    scene.remove(landmark.group);
    landmark.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  };
  return landmark;
}
