/**
 * 全局可调参数（tuning）
 * ---------------------------------------------------------------
 * 原则：「手感」不写死在逻辑里。所有会反复调的数值集中在这里，
 * 并由 lil-gui 暴露成滑杆，运行时热调 → 找到手感后回填默认值。
 */

export const CONFIG = {
  // 飞行：自由 360° 空间飞行，机头方向 = 前进方向
  flight: {
    speed: 58,          // 巡航速度 (m/s)
    boostSpeed: 105,    // 加力速度
    speedResponse: 2.6, // 速度变化响应
    pitchRate: 1.45,    // 最大俯仰角速度 (rad/s)
    yawRate: 1.1,       // 最大偏航角速度
    rollRate: 2.6,      // 手动滚转角速度
    response: 7.5,      // 角速度跟随响应（越大越跟手，越小越飘）
    bankFromYaw: 1.15,  // 转弯自动侧倾系数
    bankFromRoll: 1.0,
    invertPitch: false, // true = 飞行模拟式（下拉抬头）
  },

  // 追尾相机
  camera: {
    fov: 68,
    offset: [0, 2.7, 15.5], // 机体系偏移（右, 上, 后）
    lookAhead: 18,          // 注视点在机头前方多远
    positionLag: 8.0,       // 位置跟随速度
    rotationLag: 11.5,      // 朝向跟随速度（越大越稳，越小越跟手）
    rollFollow: 0.82,       // 相机跟随横滚的比例（1=完全跟随机身，看不到压坡度）
  },

  // 星区与地标：黑洞（穿越）/ 银河（进入）
  // 距离单位是「光年」：1 光年 = unitsPerLightYear 个世界单位（纯换算，不影响手感）
  sector: {
    unitsPerLightYear: 2000,
    landmarkAheadLy: 1.8,   // 开局把地标放在机头前方多少光年
    respawnBehindLy: 2.8,   // 被甩到身后这么多光年就重新投放
    warpDuration: 1.25,     // 穿越/进入的过场时长
    warpSpeed: 260,         // 被吸进去时的速度
  },

  // 加力冲刺：消耗能量条，松手回充
  boost: {
    max: 100,
    drain: 40,        // 每秒消耗
    regen: 18,        // 每秒回复
    regenDelay: 0.7,  // 松开后多久开始回充
    fovKick: 10,      // 冲刺时的视野拉伸（度）
  },

  // 道具
  powerup: {
    minInterval: 8,
    maxInterval: 14,
    radius: 2.4,       // 拾取半径
    spawnAhead: 130,
    lifetime: 22,      // 没吃到就消失
    shieldTime: 4.5,   // 无敌持续时间
    reflectTime: 6.0,  // 反弹持续时间
    repair: 30,        // 修复量
  },

  // 背景：每隔一段时间淡入淡出切换一片天文景观
  backdrop: {
    interval: 46,
    fade: 7,
    distance: 950,
  },

  ship: {
    radius: 1.6,
    hp: 100,
    useGltfModel: true,   // 有 public/models/ship.glb 就用 AI 生成的模型，否则用程序化几何
    modelLength: 7.2,     // 归一化后的机身长度（世界单位）
  },

  weapon: {
    cooldown: 0.075,    // 射速（秒/发）
    speed: 260,         // 弹速（相对世界）
    life: 1.35,         // 子弹存活（秒）
    damage: 1,
  },

  asteroid: {
    spawnAhead: 210,    // 在机头前方多远生成
    spread: 46,         // 横向散布
    speedMin: 2,
    speedMax: 7,
    radiusMin: 1.1,
    radiusMax: 3.4,
    hp: 2,
    score: 10,
    damage: 16,
    despawnBehind: 70,  // 跑到身后多远回收
  },

  fighter: {
    spawnAhead: 190,
    holdAhead: 34,      // 交战距离（机头前方）
    speed: 40,
    maxSpeed: 95,
    radius: 2.3,
    hp: 4,
    score: 35,
    damage: 12,
    fireInterval: 1.7,
    bulletSpeed: 78,
    bulletDamage: 8,
  },

  spawn: {
    waveSeconds: 22,
    intervalBase: 1.25,   // 陨石基础间隔（秒）—— 调大 = 更稀疏
    intervalPerWave: 0.045,
    intervalMin: 0.62,    // 最快也不会低于这个间隔
    fighterFromWave: 2,
    maxFighters: 4,
  },

  control: {
    mouseSensitivity: 0.0026, // 指针锁定后鼠标增量 → 角速度
    mouseDecay: 9,            // 鼠标输入回中速度
    deadzone: 0.12,           // 摇杆死区
    touchRadius: 64,          // 虚拟摇杆半径 (px)
  },

  fx: {
    bloomStrength: 0.5,
    bloomRadius: 0.45,
    bloomThreshold: 0.72,
    exposure: 0.92,
    starCount: 3200,
    shakeDecay: 5.5,
  },

  audio: { volume: 0.35 },
};

/** 深拷贝一份作为「默认值」，供 GUI 一键复位 */
export const DEFAULT_CONFIG = structuredClone(CONFIG);
