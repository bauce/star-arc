import * as THREE from 'three';
import GUI from 'lil-gui';
import { CONFIG } from './config.js';
import { Stage } from './gfx/stage.js';
import { FX } from './gfx/fx.js';
import { Game } from './game/game.js';
import { Input } from './core/input.js';
import { HUD } from './ui/hud.js';
import { Sound } from './audio.js';
import { TouchControls } from './ui/touch.js';
import { loadArt } from './gfx/assets.js';

const params = new URLSearchParams(location.search);
const container = document.getElementById('app');

// ————————————————— 启动 —————————————————
let stage;
try {
  stage = new Stage(container);
} catch (err) {
  document.body.innerHTML = `<div style="padding:40px;font-family:monospace;color:#9ad">
    无法初始化 WebGL：${err.message}<br/>请确认浏览器已开启硬件加速。</div>`;
  throw err;
}

const fx = new FX(stage.scene);
const hud = new HUD();
const audio = new Sound(CONFIG.audio.volume);
const input = new Input(window, stage.renderer.domElement);
const game = new Game({ scene: stage.scene, stage, fx, hud, audio });
const touch = new TouchControls(input, container);

// 调试用：浏览器控制台里可以直接改 window.__stararc.CONFIG 观察效果
window.__stararc = { game, stage, fx, CONFIG, audio, input, touch };

// ————————————————— 美术资源（ComfyUI 生成，缺失时自动退回程序化） —————————————————
loadArt((key, tex) => {
  switch (key) {
    case 'bgGalaxy':
      stage.backdrop.setTexture(0, tex, 1550);
      break;
    case 'bgBlackHole':
      stage.backdrop.setTexture(1, tex, 1550);
      break;
    case 'bgNebula':
      stage.backdrop.setTexture(2, tex, 1650);
      break;
    case 'bgNebulaGold':
      stage.backdrop.setTexture(3, tex, 1650);
      break;
    case 'bgNebulaBlue':
      stage.backdrop.setTexture(4, tex, 1650);
      break;
    case 'menuArt':
      hud.setMenuArt('art/menu_art.jpg');
      break;
    case 'texRock':
      game.enemies.setAsteroidTexture('rock', tex);
      break;
    case 'texIce':
      game.enemies.setAsteroidTexture('ice', tex);
      break;
    case 'texCrystal':
      game.enemies.setAsteroidTexture('crystal', tex);
      break;
    case 'texMetal':
      game.enemies.setAsteroidTexture('metal', tex);
      break;
    case 'texBasalt':
      game.enemies.setAsteroidTexture('basalt', tex);
      break;
    case 'iconShield':
      hud.setIcon('shield', 'art/icon_shield.png');
      break;
    case 'iconReflect':
      hud.setIcon('reflect', 'art/icon_reflect.png');
      break;
    case 'iconRepair':
      hud.setIcon('repair', 'art/icon_repair.png');
      break;
    case 'shipPortrait':
      hud.setShipPortrait('art/ship_portrait.png');
      break;
    default:
      break;
  }
});

// ————————————————— 开始 —————————————————
function startGame() {
  audio.unlock();
  game.begin();
}

document.getElementById('start-btn').addEventListener('click', startGame);
window.addEventListener('keydown', (e) => {
  if (game.state === 'ready' && (e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault();
    startGame();
  }
});

// ————————————————— 调试取景：?demo —————————————————
if (params.has('sky')) {
  stage.backdrop.setSky(Number(params.get('sky')) || 0);
}

if (params.has('demo')) {
  startGame();
  game.player.root.quaternion.setFromEuler(new THREE.Euler(0.04, 0.2, -0.14));
  game._refreshFrame();
  for (const rock of game.enemies.asteroids) {
    if (!rock.active) continue;
    rock.pos
      .copy(game.player.pos)
      .addScaledVector(game._frame.forward, 45 + Math.random() * 120)
      .addScaledVector(game._frame.right, (Math.random() - 0.5) * 70)
      .addScaledVector(game._frame.up, (Math.random() - 0.5) * 44);
  }
  game.enemies.spawnFighter(game._frame);
  const foe = game.enemies.fighters.find((f) => f.active);
  if (foe) {
    foe.pos
      .copy(game.player.pos)
      .addScaledVector(game._frame.forward, 58)
      .addScaledVector(game._frame.up, 6)
      .addScaledVector(game._frame.right, -8);
  }
  game.powerups.spawn(game._frame, 'shield', 70);
  game.powerups.spawn(game._frame, 'reflect', 110);
  game.player.invincible = 12; // 让截图里能看到护盾罩和状态条
  input.touch.fire = true;

  // 地标拉到近处，方便看效果
  if (game.landmark) {
    game.landmark.position
      .copy(game.player.pos)
      .addScaledVector(game._frame.forward, 300)
      .addScaledVector(game._frame.right, 70)
      .addScaledVector(game._frame.up, 40);
  }
}

// 调试：直接开局（不做任何取景布置），方便看真实游玩画面
if (params.has('play')) {
  startGame();
}

// 调试：直接进入暂停态，方便截图 / 检查菜单
if (params.has('pause')) {
  startGame();
  game.pause();
}

// 调试：强制地标类型（?lm=galaxy），方便看两种地标
if (params.has('lm')) {
  if (game.state === 'ready') startGame();
  game.sector = params.get('lm') === 'galaxy' ? 2 : 1;
  game._refreshFrame();
  game._spawnLandmark(true);
  if (game.landmark) {
    game.landmark.position
      .copy(game.player.pos)
      .addScaledVector(game._frame.forward, 620)
      .addScaledVector(game._frame.right, 80);
  }
}

// 调试：正前方放一架敌机做特写（机身停住，方便看模型）
if (params.has('foe')) {
  startGame();
  CONFIG.flight.speed = 0;
  game.player.speed = 0;
  game.player.invincible = 9999;
  game.enemies.clear(); // 清场，免得陨石撞上门来炸出一片白光
  game.enemies.spawnFighter(game._frame);
  const foe = game.enemies.fighters.find((f) => f.active);
  if (foe) {
    foe.pos
      .copy(game.player.pos)
      .addScaledVector(game._frame.forward, 24)
      .addScaledVector(game._frame.up, 3.5);
    foe.state = 'engage';
  }
}

// 调试：把一个废弃空间站拉近做特写
if (params.has('station')) {
  startGame();
  game.enemies.spawnStation(game._frame);
  const st = game.enemies.stations.find((s) => s.active);
  if (st) {
    st.pos
      .copy(game.player.pos)
      .addScaledVector(game._frame.forward, 150)
      .addScaledVector(game._frame.right, 40);
  }
}

// 调试：立刻触发穿越，验证星区切换
if (params.has('warp')) {
  if (game.state === 'ready') startGame();
  game._enterLandmark();
}

// ————————————————— 主循环 —————————————————
// 自适应子步长：每帧把 dt 切成若干「≤ 1/60 秒」的小步，保证任意刷新率（60/120/144Hz）
// 下机身位移都是连续的。用固定步长 + 累加器会在非 60Hz 屏幕上一帧 1 步、一帧 2 步，
// 表现就是「没操作也一直在抖」。
const MAX_SUBSTEP = 1 / 60;
const MAX_SUBSTEPS = 4;
let lastMs = performance.now();
let elapsed = 0;

const fpsEl = document.createElement('div');
fpsEl.className = 'fps';
fpsEl.textContent = '-- FPS';
document.getElementById('hud').appendChild(fpsEl);
let fpsTimer = 0;
let fpsFrames = 0;

const effectList = [];

function frame(nowMs) {
  requestAnimationFrame(frame);

  let dt = (nowMs - lastMs) / 1000;
  lastMs = nowMs;
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  if (dt > 0.1) dt = 0.1; // 切标签页回来别一次性补太多
  elapsed += dt;

  const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / MAX_SUBSTEP)));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    if (game.state !== 'ready' && game.state !== 'paused') {
      game.update(h, input);
    }
  }
  input.endFrame(dt);

  document.body.classList.toggle('hide-pause', game.state !== 'play');

  if (game.state === 'over' && document.pointerLockElement) {
    document.exitPointerLock();
  }

  stage.update(dt, game.player);

  // —— HUD（每帧一次，不跟着固定步长跑）——
  const p = game.player;
  hud.setBoost(p.boost / CONFIG.boost.max);
  effectList.length = 0;
  if (p.invincible > 0) effectList.push({ key: 'shield', label: '无敌', remain: p.invincible });
  if (p.reflect > 0) effectList.push({ key: 'reflect', label: '反弹', remain: p.reflect });
  hud.setEffects(effectList);

  if (game.state === 'play' && game.landmark) {
    hud.setWaypoint(game.landmark, stage.camera, game.player.pos);
  } else {
    hud.hideWaypoint();
  }

  stage.render();

  fpsTimer += dt;
  fpsFrames += 1;
  if (fpsTimer >= 0.5) {
    const fps = Math.round(fpsFrames / fpsTimer);
    const calls = stage.renderer.info.render.calls;
    const tris = stage.renderer.info.render.triangles;
    fpsEl.textContent = `${fps} FPS · ${calls} DC · ${(tris / 1000).toFixed(1)}k tri`;
    fpsTimer = 0;
    fpsFrames = 0;
  }

  if (elapsed > 12) hud.fadeHint();
}

requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  lastMs = performance.now();
});

// ————————————————— 交互 —————————————————
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// 点击画面 → 鼠标飞行模式（Esc 退出）
stage.renderer.domElement.addEventListener('pointerdown', () => {
  if (game.state === 'play' && !touch.enabled) {
    input.requestMouseFlight();
  }
});

document.getElementById('restart').addEventListener('click', () => {
  game.restart();
});

// —— 暂停菜单 ——
document.getElementById('pause-btn').addEventListener('click', () => {
  game.pause();
  if (document.pointerLockElement) document.exitPointerLock();
});
document.getElementById('resume-btn').addEventListener('click', () => game.resume());
document.getElementById('restart-btn').addEventListener('click', () => {
  game.resume();
  game.restart();
});
document.getElementById('quit-btn').addEventListener('click', () => {
  game.quit();
  if (document.pointerLockElement) document.exitPointerLock();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyR') {
    game.restart();
  } else if (e.code === 'KeyM') {
    audio.toggle();
  } else if (e.code === 'KeyG' && gui) {
    gui.show(gui.domElement.style.display === 'none');
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.state === 'paused') {
      game.resume();
    } else if (game.state === 'play') {
      game.pause();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
});

// ————————————————— 调参面板 —————————————————
let gui = null;
if (!params.has('nogui')) {
  gui = new GUI({ title: 'TUNING · 调参', width: 276 });
  gui.domElement.style.marginTop = '120px';

  const flight = gui.addFolder('飞行手感');
  flight.add(CONFIG.flight, 'pitchRate', 0.4, 3, 0.05).name('俯仰角速度');
  flight.add(CONFIG.flight, 'yawRate', 0.3, 2.5, 0.05).name('偏航角速度');
  flight.add(CONFIG.flight, 'rollRate', 0.5, 5, 0.1).name('滚转角速度');
  flight.add(CONFIG.flight, 'response', 1, 20, 0.5).name('转向跟随');
  flight.add(CONFIG.flight, 'bankFromYaw', 0, 2.5, 0.05).name('自动侧倾');
  flight.add(CONFIG.flight, 'speed', 20, 140, 1).name('巡航速度');
  flight.add(CONFIG.flight, 'boostSpeed', 40, 220, 1).name('加力速度');
  flight.add(CONFIG.flight, 'invertPitch').name('反转俯仰');

  const boost = gui.addFolder('加速');
  boost.add(CONFIG.boost, 'max', 20, 200, 5).name('能量上限');
  boost.add(CONFIG.boost, 'drain', 5, 120, 1).name('消耗 / 秒');
  boost.add(CONFIG.boost, 'regen', 2, 60, 1).name('回充 / 秒');
  boost.add(CONFIG.boost, 'fovKick', 0, 24, 1).name('视野拉伸');

  const cam = gui.addFolder('相机');
  cam.add(CONFIG.camera, 'positionLag', 1, 20, 0.5).name('位置跟随');
  cam.add(CONFIG.camera, 'rotationLag', 1, 20, 0.5).name('朝向跟随');
  cam.add(CONFIG.camera, 'lookAhead', 4, 40, 1).name('前视距离');
  cam.add(CONFIG.camera, 'rollFollow', 0, 1, 0.02).name('横滚跟随');

  const weapon = gui.addFolder('武器');
  weapon.add(CONFIG.weapon, 'cooldown', 0.03, 0.4, 0.005).name('射击间隔 (s)');
  weapon.add(CONFIG.weapon, 'speed', 80, 500, 5).name('弹速');
  weapon.add(CONFIG.weapon, 'damage', 1, 6, 1).name('伤害');

  const visual = gui.addFolder('画面');
  visual.add(CONFIG.fx, 'bloomStrength', 0, 2.5, 0.01).name('泛光强度').onChange(() => stage.applyQuality());
  visual.add(CONFIG.fx, 'exposure', 0.2, 2.5, 0.01).name('曝光').onChange(() => stage.applyQuality());
  visual.add(CONFIG.backdrop, 'interval', 10, 180, 1).name('背景切换间隔 (s)');

  const diff = gui.addFolder('难度节奏');
  diff.add(CONFIG.spawn, 'intervalBase', 0.1, 2, 0.01).name('陨石间隔 (s)');
  diff.add(CONFIG.spawn, 'waveSeconds', 8, 60, 1).name('每波时长 (s)');
  diff.add(CONFIG.spawn, 'maxFighters', 0, 6, 1).name('同屏敌机上限');
  diff.add(CONFIG.powerup, 'minInterval', 3, 30, 1).name('道具最短间隔');
  diff.add(CONFIG.powerup, 'maxInterval', 3, 40, 1).name('道具最长间隔');

  gui.add({ restart: () => game.restart() }, 'restart').name('重开一局 (R)');
  gui.close();
}
