/**
 * 输入层：把「设备」抽象成「意图」
 * ---------------------------------------------------------------
 * 游戏逻辑只读 steer / fire / boost / roll，永远不直接读事件。
 * 三套设备（键盘、鼠标锁定、触屏摇杆）在这里汇成一个量：
 *
 *   steer.x = 偏航（右为正）
 *   steer.y = 俯仰（抬头为正）
 *   roll    = 滚转（右为正）
 *   fire / boost = 布尔
 *
 * 这样以后接手柄、接 AI 演示，都只改这一个文件。
 */
import { CONFIG } from '../config.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export class Input {
  constructor(target = window, canvas = null) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDown = false;
    this.pointerLocked = false;

    // 鼠标锁定时累积的转向量，会随时间回中（像一根会自己弹回的摇杆）
    this.mouse = { x: 0, y: 0 };

    // 触屏由 ui/touch.js 写入
    this.touch = { active: false, steer: { x: 0, y: 0 }, fire: false, boost: false, roll: 0 };
    this._steer = { x: 0, y: 0 };

    this.canvas = canvas;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);

    // 只有「鼠标左键按在游戏画面上」才算开火。
    // 早期版本只判断 e.button === 0，结果手指点 BOOST / 暂停 / 开始按钮时
    // 也会把 mouseDown 置为 true —— 表现就是「点加速同时开火」。
    this._onPointerDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el && el.closest('button, .btn, #start, #pause, #over, #touch')) return;
      this.mouseDown = true;
    };
    this._onPointerUp = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      this.mouseDown = false;
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      const sens = CONFIG.control.mouseSensitivity;
      // 鼠标右移 = 右滚转（偏航），上移 = 抬头
      this.mouse.x = clamp(this.mouse.x + e.movementX * sens, -1, 1);
      this.mouse.y = clamp(this.mouse.y - e.movementY * sens, -1, 1);
    };
    this._onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked) {
        this.mouse.x = 0;
        this.mouse.y = 0;
      }
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
    };

    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('pointerdown', this._onPointerDown);
    target.addEventListener('pointerup', this._onPointerUp);
    target.addEventListener('mousemove', this._onMouseMove);
    target.addEventListener('blur', this._onBlur);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  /** 点击画面进入鼠标飞行模式（Esc 退出） */
  requestMouseFlight() {
    if (this.canvas && !this.pointerLocked && this.canvas.requestPointerLock) {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    }
  }

  get steer() {
    const k = this.keys;
    let x =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y =
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) -
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);

    x += this.touch.steer.x + this.mouse.x;
    y += this.touch.steer.y + this.mouse.y;

    // 径向死区 + 归一化到单位圆（复用同一个对象，避免每帧分配）
    const dz = CONFIG.control.deadzone;
    const len = Math.hypot(x, y);
    if (len <= dz) {
      this._steer.x = 0;
      this._steer.y = 0;
      return this._steer;
    }
    const scaled = Math.min(1, (len - dz) / (1 - dz));
    this._steer.x = (x / len) * scaled;
    this._steer.y = (y / len) * scaled;
    return this._steer;
  }

  get roll() {
    const k = this.keys;
    const key = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    return clamp(key + this.touch.roll, -1, 1);
  }

  get fire() {
    const k = this.keys;
    return this.mouseDown || k.has('Space') || k.has('KeyJ') || this.touch.fire;
  }

  get boost() {
    const k = this.keys;
    return k.has('ShiftLeft') || k.has('ShiftRight') || this.touch.boost;
  }

  consumePress(code) {
    const hit = this.justPressed.has(code);
    this.justPressed.delete(code);
    return hit;
  }

  /** 每帧末尾：鼠标转向量随时间回中 */
  endFrame(dt) {
    const decay = Math.exp(-CONFIG.control.mouseDecay * dt);
    this.mouse.x *= decay;
    this.mouse.y *= decay;
    if (Math.abs(this.mouse.x) < 0.002) this.mouse.x = 0;
    if (Math.abs(this.mouse.y) < 0.002) this.mouse.y = 0;
    this.justPressed.clear();
  }
}
