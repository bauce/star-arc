import * as THREE from 'three';

/**
 * 美术资源加载（ComfyUI 生成的图，位于 public/art/）
 * ---------------------------------------------------------------
 * 原则：**加载失败不能影响游戏**。所有回调都允许 404 静默跳过，
 * 缺图时游戏自动退回程序化贴图/纯色，仓库里没有图也能跑。
 */
const FILES = {
  bgGalaxy: 'art/bg_galaxy.jpg',
  bgBlackHole: 'art/bg_blackhole.jpg',
  bgNebula: 'art/bg_nebula.jpg',
  bgNebulaGold: 'art/bg_nebula_gold.jpg',
  bgNebulaBlue: 'art/bg_nebula_blue.jpg',
  menuArt: 'art/menu_art.jpg',
  texRock: 'art/tex_rock.jpg',
  texIce: 'art/tex_ice.jpg',
  texCrystal: 'art/tex_crystal.jpg',
  texMetal: 'art/tex_metal.jpg',
  texBasalt: 'art/tex_basalt.jpg',
  iconShield: 'art/icon_shield.png',
  iconReflect: 'art/icon_reflect.png',
  iconRepair: 'art/icon_repair.png',
  shipPortrait: 'art/ship_portrait.png',
};

export function loadArt(onLoad, onDone) {
  const loader = new THREE.TextureLoader();
  const keys = Object.keys(FILES);
  let pending = keys.length;

  const finish = () => {
    pending -= 1;
    if (pending === 0 && onDone) onDone();
  };

  for (const key of keys) {
    loader.load(
      FILES[key],
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        onLoad?.(key, tex);
        finish();
      },
      undefined,
      () => finish(), // 缺图：静默跳过，游戏继续用程序化内容
    );
  }
}
