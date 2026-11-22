import { CONFIG } from '../config.js';

/**
 * 移动端触控（参照主流手游射击的「左摇杆 + 右开火」布局）
 * ---------------------------------------------------------------
 * - 左半屏：**浮动摇杆**。手指按下的地方就是摇杆原点，不用去追固定圆圈，
 *   这是 2018 年后手机射击游戏（PUBG Mobile / CODM）的通用做法。
 * - 右侧：FIRE 持续射击 + BOOST 加力。
 * - 右半屏任意位置按下也能射击（拇指不用精确找按钮）。
 *
 * 所有输入最终写回 input.touch，玩法层完全不知道有触摸屏这回事。
 */
export class TouchControls {
  constructor(input, container) {
    this.input = input;
    this.enabled = false;
    this.stick = { id: null, cx: 0, cy: 0, radius: CONFIG.control.touchRadius };

    const layer = document.createElement('div');
    layer.id = 'touch';
    layer.innerHTML = `
      <div class="stick-base"><div class="stick-knob"></div></div>
      <div class="pad">
        <button class="btn btn-boost" type="button">BOOST</button>
        <button class="btn btn-fire" type="button">FIRE</button>
      </div>
    `;
    container.appendChild(layer);
    this.layer = layer;
    this.base = layer.querySelector('.stick-base');
    this.knob = layer.querySelector('.stick-knob');

    const fireBtn = layer.querySelector('.btn-fire');
    const boostBtn = layer.querySelector('.btn-boost');

    this._bindHold(fireBtn, (on) => {
      this.input.touch.fire = on;
    });
    this._bindHold(boostBtn, (on) => {
      this.input.touch.boost = on;
    });

    // 左半屏：浮动摇杆
    layer.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.target.closest('.btn')) return; // 按钮自己处理
      if (e.clientX > window.innerWidth * 0.5) {
        // 右半屏随手一按 = 开火
        this.input.touch.fire = true;
        this._rightFire = e.pointerId;
        return;
      }
      this.stick.id = e.pointerId;
      this.stick.cx = e.clientX;
      this.stick.cy = e.clientY;
      this.base.style.display = 'block';
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this._moveKnob(0, 0);
      this.input.touch.active = true;
    });

    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.cx;
      let dy = e.clientY - this.stick.cy;
      const len = Math.hypot(dx, dy);
      const r = this.stick.radius;
      if (len > r) {
        dx = (dx / len) * r;
        dy = (dy / len) * r;
      }
      this._moveKnob(dx, dy);
      this.input.touch.steer.x = dx / r;
      this.input.touch.steer.y = -dy / r; // 屏幕 y 向下 = 低头
    });

    const endStick = (e) => {
      if (e.pointerId === this.stick.id) {
        this.stick.id = null;
        this.base.style.display = 'none';
        this.input.touch.steer.x = 0;
        this.input.touch.steer.y = 0;
        this.input.touch.active = false;
      }
      if (e.pointerId === this._rightFire) {
        this.input.touch.fire = false;
        this._rightFire = null;
      }
    };
    layer.addEventListener('pointerup', endStick);
    layer.addEventListener('pointercancel', endStick);
    layer.addEventListener('pointerleave', endStick);

    // 触屏设备才显示（?touch=1 可强制开启，方便桌面调试）
    this.setEnabled(
      new URLSearchParams(location.search).has('touch') ||
        (window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0),
    );

  }

  _moveKnob(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  _bindHold(el, setter) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('pressed');
      setter(true);
    });
    const release = (e) => {
      el.classList.remove('pressed');
      setter(false);
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  setEnabled(on) {
    this.enabled = on;
    this.layer.classList.toggle('enabled', on);
    // 触屏模式下隐藏"点击画面用鼠标操控"这类桌面提示
    document.body.classList.toggle('touch-mode', on);
    if (!on) {
      this.input.touch.steer.x = 0;
      this.input.touch.steer.y = 0;
      this.input.touch.fire = false;
      this.input.touch.boost = false;
    }
  }
}
