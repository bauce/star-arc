import * as THREE from 'three';

/**
 * 玩家战机模型（纯程序化）
 * ---------------------------------------------------------------
 * 不用 Blender 也能做出有设计感的机体，关键是用「放样」而不是拼盒子：
 *
 *  1. loftHull   —— 沿 Z 轴给一组横截面，逐环连成皮肤。
 *                   截面是八边形（带折线/棱线），配合 flatShading 得到
 *                   隐身战机那种硬朗的面，而不是圆柱体的塑料感。
 *  2. 挤出翼型   —— 用 THREE.Shape 画机翼平面图，再 ExtrudeGeometry
 *                   加倒角挤出，得到一个有厚度、边缘有高光的真实翼面。
 *  3. 细节层     —— 座舱、背鳍、发动机舱、进气口、翼灯、机身编号条。
 *
 * 全部使用 DoubleSide：镜像出来的左翼不会因为绕序反转而消失。
 */

// 八边形截面：上脊线 → 右斜切 → 右最宽 → 右下 → 底 → 左...
const PROFILE = [
  [0.0, 1.0],
  [0.74, 0.62],
  [1.0, 0.04],
  [0.72, -0.5],
  [0.0, -0.76],
  [-0.72, -0.5],
  [-1.0, 0.04],
  [-0.74, 0.62],
];

// 机身横截面序列：z = 从机头(-) 到 机尾(+)，w/h = 半宽/半高，y = 中轴抬高
const SECTIONS = [
  { z: -3.72, w: 0.02, h: 0.02, y: 0.02 },
  { z: -3.05, w: 0.13, h: 0.1, y: 0.04 },
  { z: -2.25, w: 0.32, h: 0.23, y: 0.05 },
  { z: -1.3, w: 0.56, h: 0.37, y: 0.03 },
  { z: -0.3, w: 0.73, h: 0.47, y: 0.0 },
  { z: 0.8, w: 0.77, h: 0.49, y: 0.0 },
  { z: 1.9, w: 0.69, h: 0.45, y: 0.02 },
  { z: 2.65, w: 0.52, h: 0.39, y: 0.04 },
  { z: 3.05, w: 0.44, h: 0.35, y: 0.05 },
  { z: 3.32, w: 0.36, h: 0.29, y: 0.05 },
  { z: 3.5, w: 0.28, h: 0.23, y: 0.05 },
];

function loftHull(sections) {
  const verts = [];
  const indices = [];
  const n = PROFILE.length;

  for (const s of sections) {
    for (const [u, v] of PROFILE) {
      verts.push(u * s.w, s.y + v * s.h, s.z);
    }
  }

  for (let i = 0; i < sections.length - 1; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + j;
      const d = (i + 1) * n + ((j + 1) % n);
      indices.push(a, b, c, b, d, c);
    }
  }

  // 机头封口（收成一个尖点）
  const nose = verts.length / 3;
  verts.push(0, sections[0].y, sections[0].z - 0.14);
  for (let j = 0; j < n; j += 1) {
    indices.push(nose, (j + 1) % n, j);
  }

  // 机尾封口（平底，留给发动机）
  const last = sections[sections.length - 1];
  const base = (sections.length - 1) * n;
  const tail = verts.length / 3;
  verts.push(0, last.y, last.z + 0.03);
  for (let j = 0; j < n; j += 1) {
    indices.push(tail, base + j, base + ((j + 1) % n));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** 把 2D 平面图（x, 前向）挤出成水平翼面（厚度沿 Y） */
function extrudeWing(points, thickness, bevel = 0.035) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -thickness / 2, 0);
  return geo;
}

/** 垂尾：平面图在（前向, 高度）平面里，挤出后竖起来 */
function extrudeFin(points, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 1,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-thickness / 2, 0, 0);
  return geo;
}

export function createShipModel() {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x9fb4cc,
    metalness: 0.78,
    roughness: 0.44,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x27364a,
    metalness: 0.72,
    roughness: 0.44,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x5a7290,
    metalness: 0.7,
    roughness: 0.42,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x041019,
    emissive: 0x1d7d9c,
    emissiveIntensity: 1.35,
    metalness: 0.95,
    roughness: 0.07,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x7fe9ff, toneMapped: false });

  // —— 机身 ——
  const hull = new THREE.Mesh(loftHull(SECTIONS), hullMat);
  group.add(hull);

  // —— 主翼（后掠三角翼）——
  const wingPlan = [
    [0.52, 1.55],
    [2.95, 0.12],
    [3.0, -0.5],
    [0.6, -1.3],
  ];
  const wingGeo = extrudeWing(wingPlan, 0.16);
  const wingL = new THREE.Mesh(wingGeo, hullMat);
  group.add(wingL);
  const wingR = new THREE.Mesh(wingGeo.clone().applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)), hullMat);
  group.add(wingR);

  // 翼根整流罩
  const rootGeo = new THREE.BoxGeometry(0.34, 0.2, 1.7);
  for (const side of [-1, 1]) {
    const root = new THREE.Mesh(rootGeo, trimMat);
    root.position.set(side * 0.62, 0.02, 0.35);
    root.rotation.y = side * -0.06;
    group.add(root);
  }

  // —— 前翼（鸭翼）——
  const canardPlan = [
    [0.4, 2.15],
    [1.28, 1.78],
    [1.3, 1.45],
    [0.44, 1.5],
  ];
  const canardGeo = extrudeWing(canardPlan, 0.08, 0.02);
  const canardL = new THREE.Mesh(canardGeo, trimMat);
  group.add(canardL);
  const canardR = new THREE.Mesh(canardGeo.clone().applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)), trimMat);
  group.add(canardR);

  // —— 垂尾（外倾双垂尾，和机身同材质才不会变成两根黑棍）——
  const finPlan = [
    [0.0, 0.0],
    [1.2, 0.0],
    [0.52, 0.74],
    [0.08, 0.8],
  ];
  const finGeo = extrudeFin(finPlan, 0.08);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, hullMat);
    fin.position.set(side * 0.86, 0.3, 2.2);
    fin.rotation.z = side * -0.34;
    group.add(fin);

    // 垂尾顶端的小灯
    const tipLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x8ff2ff, toneMapped: false }),
    );
    tipLight.position.set(side * 1.06, 0.96, 2.32);
    group.add(tipLight);
  }

  // —— 发动机舱（吊在翼根下）——
  const nacelleGeo = new THREE.CylinderGeometry(0.26, 0.3, 2.3, 10, 1, true);
  nacelleGeo.rotateX(Math.PI / 2);
  const nozzleGeo = new THREE.TorusGeometry(0.24, 0.055, 6, 14);
  const coreGeo = new THREE.CircleGeometry(0.21, 14);
  const intakeGeo = new THREE.CylinderGeometry(0.3, 0.24, 0.5, 10, 1, true);
  intakeGeo.rotateX(Math.PI / 2);

  const nozzles = [];
  for (const side of [-1, 1]) {
    const x = side * 1.02;

    const nacelle = new THREE.Mesh(nacelleGeo, trimMat);
    nacelle.position.set(x, -0.16, 1.75);
    group.add(nacelle);

    const intake = new THREE.Mesh(intakeGeo, panelMat);
    intake.position.set(x, -0.16, 0.72);
    group.add(intake);

    const nozzle = new THREE.Mesh(nozzleGeo, panelMat);
    nozzle.position.set(x, -0.16, 2.9);
    group.add(nozzle);

    const core = new THREE.Mesh(coreGeo, glowMat);
    core.position.set(x, -0.16, 2.9);
    group.add(core);

    nozzles.push(new THREE.Vector3(x, -0.16, 3.0));
  }

  // —— 背脊 + 座舱 ——
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), glassMat);
  canopy.scale.set(1.0, 0.6, 2.05);
  canopy.position.set(0, 0.42, -0.9);
  group.add(canopy);

  // —— 中央主喷口（让机尾读起来是「发动机」而不是一块切面）——
  const mainNozzle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 14), panelMat);
  mainNozzle.position.set(0, 0.05, 3.54);
  group.add(mainNozzle);
  const mainCore = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14), glowMat);
  mainCore.position.set(0, 0.05, 3.54);
  group.add(mainCore);

  // —— 翼尖航行灯（左红右绿，航空惯例）——
  const navGeo = new THREE.SphereGeometry(0.075, 8, 6);
  const navL = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xff4b5e, toneMapped: false }));
  navL.position.set(-2.82, 0.09, -0.02);
  group.add(navL);
  const navR = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0x4bffb0, toneMapped: false }));
  navR.position.set(2.82, 0.09, -0.02);
  group.add(navR);

  // 机头传感器
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), glassMat);
  sensor.position.set(0, 0.08, -3.72);
  group.add(sensor);

  return {
    group,
    hullMaterials: [hullMat, trimMat],
    nozzles,
  };
}
