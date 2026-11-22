import * as THREE from 'three';

/**
 * 程序化贴图：不依赖任何美术资源文件。
 * 原型阶段用「代码生成贴图」可以让画面先行，正式版再换成 Blender/Substance 出的图。
 */
const cache = new Map();

export function glowTexture(key = 'white') {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.62)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** 一张柔和的椭圆形云团，用作星云/背景 */export function nebulaTexture(seed = 0) {
  const key = `nebula-${seed}`;
  if (cache.has(key)) {
    return cache.get(key);
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // 叠加几个噪点团，避免过于规整
  for (let i = 0; i < 18; i += 1) {
    const r = 20 + ((seed * 37 + i * 61) % 70);
    const x = (size / 2) + Math.cos(i * 2.3 + seed) * 60;
    const y = (size / 2) + Math.sin(i * 1.7 + seed) * 60;
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, 'rgba(255,255,255,0.14)');
    blob.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/**
 * 程序化「天空」：等距柱状投影的渐变 + 一个太阳光斑。
 * 经 PMREM 处理后作为 scene.environment，金属材质才有东西可反射，
 * 否则 metalness 高的模型在纯黑环境里会变成剪影。
 */
export function environmentTexture() {
  if (cache.has('env')) {
    return cache.get('env');
  }
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.0, '#0b1630');
  sky.addColorStop(0.45, '#16233f');
  sky.addColorStop(0.62, '#203349');
  sky.addColorStop(1.0, '#05070e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 冷色太阳
  const sun = ctx.createRadialGradient(w * 0.72, h * 0.3, 0, w * 0.72, h * 0.3, 90);
  sun.addColorStop(0, 'rgba(210,240,255,1)');
  sun.addColorStop(0.25, 'rgba(120,200,255,0.55)');
  sun.addColorStop(1, 'rgba(20,60,120,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // 品红补光
  const glow = ctx.createRadialGradient(w * 0.18, h * 0.72, 0, w * 0.18, h * 0.72, 110);
  glow.addColorStop(0, 'rgba(255,90,160,0.5)');
  glow.addColorStop(1, 'rgba(255,90,160,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set('env', tex);
  return tex;
}
