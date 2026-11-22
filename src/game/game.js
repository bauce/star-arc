import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Powerups } from './powerups.js';
import { BoltPool } from '../gfx/bullets.js';
import { createLandmark } from '../world/landmarks.js';

/**
 * 玩法核心：状态机 + 波次导演 + 碰撞 + 道具
 * ---------------------------------------------------------------
 * update() 只接受固定步长 dt（见 main.js），所有运动/判定都是确定性的。
 * 世界是无限空间，生成器全部用玩家的机体系（前/右/上）来表达。
 */
const _nearest = new THREE.Vector3();

export class Game {
  constructor({ scene, stage, fx, hud, audio }) {
    this.scene = scene;
    this.stage = stage;
    this.fx = fx;
    this.hud = hud;
    this.audio = audio;

    this.player = new Player(scene);
    this.playerBolts = new BoltPool(scene, {
      count: 200,
      color: 0x9ff4ff,
      length: 5.2,
      width: 0.2,
      emissiveBoost: 1.7,
    });
    this.enemyBolts = new BoltPool(scene, {
      count: 100,
      color: 0xff5f8f,
      length: 1.8,
      width: 0.24,
      emissiveBoost: 1.9,
    });
    this.enemies = new Enemies(scene, fx);
    this.powerups = new Powerups(scene, fx);

    this._muzzle = new THREE.Vector3();
    this._shotVel = new THREE.Vector3();
    this._rel = new THREE.Vector3();
    this._frame = {
      pos: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, -1),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
    };
    this._frozenInput = { steer: { x: 0, y: 0 }, roll: 0, fire: false, boost: true };

    this.landmark = null;
    this.sector = 1;
    this.warp = { active: false, t: 0, type: 'blackhole' };

    this.reset();
    this.state = 'ready';
  }

  /** 开局教学结束后调用 */
  begin() {
    if (this.state === 'ready') {
      this.state = 'play';
      this.hud.hideStart();
    }
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.hud.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'play';
    this.hud.hidePause();
  }

  /** 退出到主菜单：这一局的进度直接丢弃 */
  quit() {
    this.reset();
    this.state = 'ready';
    this.hud.hidePause();
    this.hud.hideGameOver();
    this.hud.showStart();
  }

  _refreshFrame() {
    const q = this.player.root.quaternion;
    const f = this._frame;
    f.pos.copy(this.player.pos);
    f.forward.set(0, 0, -1).applyQuaternion(q);
    f.right.set(1, 0, 0).applyQuaternion(q);
    f.up.set(0, 1, 0).applyQuaternion(q);
  }

  reset() {
    this.state = 'play';
    this.score = 0;
    this.kills = 0;
    this.hp = CONFIG.ship.hp;
    this.wave = 1;
    this.sector = 1;
    this.time = 0;
    this.cooldown = 0;
    this.spawnTimer = 0.5;
    this.fighterTimer = 6;
    this.powerupTimer = 5;
    this.stationTimer = 22;

    this.player.reset();
    this.enemies.clear();
    this.powerups.clear();
    this.playerBolts.clear();
    this.enemyBolts.clear();
    this.fx.clear();
    this.stage.shake = 0;
    this.stage.warpFx = 0;
    this.warp.active = false;
    this._refreshFrame();
    this._spawnLandmark(true);

    this.hud.hideGameOver();
    this.hud.setShield(1);
    this.hud.setScore(0);
    this.hud.setWave(1);

    // 开局先铺一片碎石带：避免前几秒空场（密度别太高，留给玩家反应距离）
    for (let i = 0; i < 7; i += 1) {
      this.enemies.spawnAsteroid(1, this._frame);
    }
    for (const rock of this.enemies.asteroids) {
      if (!rock.active) continue;
      rock.pos
        .copy(this.player.pos)
        .addScaledVector(this._frame.forward, 55 + Math.random() * 150)
        .addScaledVector(this._frame.right, (Math.random() - 0.5) * 70)
        .addScaledVector(this._frame.up, (Math.random() - 0.5) * 44);
    }
    return this;
  }

  update(dt, input) {
    this.time += dt;

    // 穿越过场中：锁操作、只保留被"吸进去"的速度
    const activeInput = this.warp.active ? this._frozenInput : input;

    if (this.state === 'play') {
      this.player.update(dt, activeInput);
    }
    this._refreshFrame();

    if (this.state === 'play' && !this.warp.active) {
      this._handleFiring(dt, input);
      this._updateWave();
      this._updateDirector(dt);
      this._updatePowerups(dt);
      this._updateStations(dt);
    }

    this._updateLandmark(dt);

    this.enemies.update(dt, this.player, this._frame, (pos, dir) => this._spawnEnemyBolt(pos, dir));
    const picked = this.powerups.update(dt, this.player);
    if (picked) this._applyPowerup(picked);
    this.playerBolts.update(dt);
    this.enemyBolts.update(dt);

    if (this.state === 'play' && !this.warp.active) {
      this._resolveCollisions();
    }

    this.fx.update(dt);
    this.hud.update(dt);

    this.enemies.commit();
    this.playerBolts.commit();
    this.enemyBolts.commit();

    this.stage.warpFx = this.warp.active ? 1 : 0;
  }

  // ————————————————— 地标 / 星区 —————————————————

  _spawnLandmark(fresh = false) {
    if (this.landmark) {
      this.landmark.dispose();
      this.landmark = null;
    }

    // 奇数星区是黑洞（穿越），偶数是银河（进入）
    const type = this.sector % 2 === 1 ? 'blackhole' : 'galaxy';
    const ahead = CONFIG.sector.landmarkAheadLy * CONFIG.sector.unitsPerLightYear;
    const pos = this.player.pos
      .clone()
      .addScaledVector(this._frame.forward, ahead)
      .addScaledVector(this._frame.right, (Math.random() - 0.5) * 700)
      .addScaledVector(this._frame.up, (Math.random() - 0.5) * 380);

    this.landmark = createLandmark(this.scene, type, pos);
    // 天上只放星云（三种色调轮换）：银河/黑洞天会和地标叠在一起，看着像两个天体糊在一块
    this.stage.backdrop.setSky(2 + Math.floor(Math.random() * 3));
    if (!fresh) {
      this.hud.toast(`星区 ${this.sector} · 前方${this.landmark.label}`, '#9fd8ff');
    }
  }

  _updateLandmark(dt) {
    const lm = this.landmark;
    if (!lm) return;

    lm.update(dt);
    this._rel.subVectors(lm.position, this.player.pos);
    this.landmarkDistance = this._rel.length();

    if (this.warp.active) {
      this._updateWarp(dt);
      return;
    }

    if (this.state === 'play' && this.landmarkDistance < lm.entryRadius) {
      this._enterLandmark();
      return;
    }

    // 被甩到身后很远 → 重新投放到前方，免得玩家永远追不上
    const behindLimit = CONFIG.sector.respawnBehindLy * CONFIG.sector.unitsPerLightYear;
    if (this._rel.dot(this._frame.forward) < -200 && this.landmarkDistance > behindLimit) {
      this._spawnLandmark();
    }
  }

  _enterLandmark() {
    const lm = this.landmark;
    this.warp.active = true;
    this.warp.t = 0;
    this.warp.type = lm.type;
    this.player.invincible = Math.max(this.player.invincible, CONFIG.sector.warpDuration + 2);
    this.hud.showWarp(lm.type, CONFIG.sector.warpDuration);
    this.stage.addShake(0.8);
    this.audio.warp(lm.type);
  }

  _updateWarp(dt) {
    this.warp.t += dt;
    const T = CONFIG.sector.warpDuration;

    // 越接近终点越快 —— 被吸进去的感觉
    this.player.speed = THREE.MathUtils.lerp(
      this.player.speed,
      CONFIG.sector.warpSpeed,
      1 - Math.exp(-3 * dt),
    );

    if (this.warp.t >= T) this._completeWarp();
  }

  _completeWarp() {
    const wasBlackHole = this.warp.type === 'blackhole';
    this.warp.active = false;
    this.warp.t = 0;

    // 跃迁：沿机头方向甩出去，清空周围
    this.player.pos.addScaledVector(this._frame.forward, 3200);
    this.player.speed = CONFIG.flight.speed;
    this.player.vel?.set?.(0, 0, 0);
    this.enemies.clear();
    this.powerups.clear();
    this.enemyBolts.clear();
    this.fx.clear();
    this.stage.shake = 0;

    this.sector += 1;
    this.wave = Math.max(this.wave, this.sector);
    this.hud.setWave(this.wave);

    this._refreshFrame();
    this._spawnLandmark();
    this.stage.backdrop.setSky(2 + (this.sector % 3));
    this.hud.hideWarp();
    this.hud.toast(
      wasBlackHole ? `穿越成功 · 星区 ${this.sector}` : `进入银河 · 星区 ${this.sector}`,
      wasBlackHole ? '#6ff2ff' : '#ffd9a0',
    );
    this.stage.addShake(1.2);
    this.audio.boom(1.1);
  }

  _updateWave() {
    // 星区推进也会抬高波次，否则穿越完又被打回第 1 波
    const wave = Math.max(this.sector, 1 + Math.floor(this.time / CONFIG.spawn.waveSeconds));
    if (wave !== this.wave) {
      this.wave = wave;
      this.hud.setWave(wave);
    }
  }

  _updateDirector(dt) {
    const cfg = CONFIG.spawn;
    const difficulty = 1 + (this.wave - 1) * 0.12;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.enemies.spawnAsteroid(difficulty, this._frame);
      const interval = Math.max(
        cfg.intervalMin,
        cfg.intervalBase - (this.wave - 1) * cfg.intervalPerWave,
      );
      this.spawnTimer = interval * (0.7 + Math.random() * 0.6);
    }

    if (this.wave >= cfg.fighterFromWave) {
      this.fighterTimer -= dt;
      if (this.fighterTimer <= 0 && this.enemies.activeFighters() < cfg.maxFighters) {
        const kind = this.wave >= 3 && Math.random() < 0.35 ? 'gunship' : 'raider';
        if (this.enemies.spawnFighter(this._frame, kind)) {
          this.fighterTimer = 6.5 - Math.min(3, this.wave * 0.3);
        } else {
          this.fighterTimer = 1.5;
        }
      }
    }
  }

  _updateStations(dt) {
    this.stationTimer -= dt;
    if (this.stationTimer > 0) return;
    this.stationTimer = this.enemies.spawnStation(this._frame) ? 70 + Math.random() * 40 : 6;
  }

  _updatePowerups(dt) {
    const cfg = CONFIG.powerup;
    this.powerupTimer -= dt;
    if (this.powerupTimer > 0) return;

    this.powerupTimer = cfg.minInterval + Math.random() * (cfg.maxInterval - cfg.minInterval);

    const roll = Math.random();
    const type = roll < 0.4 ? 'shield' : roll < 0.75 ? 'reflect' : 'repair';

    // 体力充足时少刷修复，避免"道具白给"
    const finalType = type === 'repair' && this.hp > CONFIG.ship.hp * 0.8 ? 'shield' : type;
    const item = this.powerups.spawn(this._frame, finalType, cfg.spawnAhead);
    if (item) {
      this.audio.ping();
    }
  }

  _handleFiring(dt, input) {
    this.cooldown -= dt;
    if (!input.fire || this.cooldown > 0) return;
    this.cooldown = CONFIG.weapon.cooldown;

    this._shotVel.copy(this._frame.forward).multiplyScalar(CONFIG.weapon.speed);
    for (let i = 0; i < 2; i += 1) {
      this.player.muzzle(i, this._muzzle);
      this.playerBolts.spawn(this._muzzle, this._shotVel, {
        ttl: CONFIG.weapon.life,
        radius: 0.5,
      });
    }

    this.audio.shoot();
  }

  _spawnEnemyBolt(pos, dir) {
    this._shotVel.copy(dir).multiplyScalar(CONFIG.fighter.bulletSpeed);
    this.enemyBolts.spawn(pos, this._shotVel, { ttl: 2.4, radius: 0.55 });
    this.audio.shoot();
  }

  /** 找离某点最近的敌人，用于「反弹」自动索敌 */
  _nearestEnemy(point) {
    let best = null;
    let bestDist = Infinity;

    for (const a of this.enemies.asteroids) {
      if (!a.active) continue;
      const d = a.pos.distanceToSquared(point);
      if (d < bestDist) {
        bestDist = d;
        best = a.pos;
      }
    }
    for (const f of this.enemies.fighters) {
      if (!f.active) continue;
      const d = f.pos.distanceToSquared(point);
      if (d < bestDist) {
        bestDist = d;
        best = f.pos;
      }
    }
    return best ? _nearest.copy(best) : null;
  }

  _resolveCollisions() {
    // 1) 玩家子弹 → 敌人
    for (const bolt of this.playerBolts.items) {
      if (!bolt.active) continue;
      const hit = this.enemies.hitTest(bolt.pos, bolt.radius, CONFIG.weapon.damage);
      if (!hit) continue;
      bolt.active = false;
      if (hit.score > 0) {
        this.score += hit.score;
        this.kills += 1;
        this.hud.setScore(this.score);
        this.audio.boom(0.65);
        this.stage.addShake(0.1);
      }
    }

    // 2) 敌方子弹 → 玩家（无敌 / 反弹 / 受击）
    const shipR = CONFIG.ship.radius + 0.5;
    for (const bolt of this.enemyBolts.items) {
      if (!bolt.active) continue;
      if (bolt.pos.distanceToSquared(this.player.pos) > shipR * shipR) continue;

      if (this.player.invincible > 0) {
        bolt.active = false;
        this.fx.sparks(bolt.pos, 0x9ffbff, 8);
        continue;
      }

      if (this.player.reflect > 0) {
        bolt.active = false;
        const target = this._nearestEnemy(bolt.pos);
        this._shotVel.copy(bolt.dir).negate();
        if (target) {
          this._shotVel.copy(target).sub(bolt.pos).normalize();
        }
        this._shotVel.multiplyScalar(CONFIG.weapon.speed);
        this.playerBolts.spawn(bolt.pos, this._shotVel, { ttl: 1.5, radius: 0.7 });
        this.fx.sparks(bolt.pos, 0xff7ad9, 10);
        this.audio.reflect();
        continue;
      }

      bolt.active = false;
      this.fx.sparks(bolt.pos, 0xff9db4, 10);
      this.damage(CONFIG.fighter.bulletDamage);
      if (this.state !== 'play') return;
    }

    // 3) 敌人撞玩家
    const contact = this.enemies.collideWithPlayer(this.player);
    if (contact > 0) this.damage(contact);
  }

  /** 吃到道具：无敌 / 反弹 / 修复 */
  _applyPowerup(type) {
    const cfg = CONFIG.powerup;
    if (type === 'shield') {
      this.player.invincible = cfg.shieldTime;
      this.audio.powerup();
      this.hud.toast('无敌', '#6ff2ff');
    } else if (type === 'reflect') {
      this.player.reflect = cfg.reflectTime;
      this.audio.powerup();
      this.hud.toast('能量反弹', '#ff7ad9');
    } else {
      this.hp = Math.min(CONFIG.ship.hp, this.hp + cfg.repair);
      this.hud.setShield(this.hp / CONFIG.ship.hp);
      this.audio.repair();
      this.hud.toast('护盾修复', '#7dffb0');
    }
    this.stage.addShake(0.12);
  }

  damage(amount) {
    if (this.state !== 'play') return;
    if (this.player.invincible > 0) {
      this.fx.sparks(this.player.pos, 0x9ffbff, 6);
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.hud.setShield(this.hp / CONFIG.ship.hp);
    this.hud.flash();
    this.stage.addShake(0.5);
    this.audio.hit();
    this.player.hitFlash = 1;
    if (this.hp <= 0) this._die();
  }

  _die() {
    this.state = 'over';
    this.player.alive = false;
    this.player.root.visible = false;
    this.fx.explode(this.player.pos, {
      count: 110,
      speed: 52,
      color: 0xd6f4ff,
      ringColor: 0x8fe9ff,
      life: 1.1,
      flash: 1200,
      ring: true,
    });
    this.stage.addShake(1.6);
    this.audio.boom(1.5);
    this.hud.showGameOver(this.score, this.wave);
  }

  restart() {
    this.reset();
  }
}
