# -*- coding: utf-8 -*-
"""调用本地 ComfyUI 生成《星弧》美术素材（Qwen-Image 2.1 Turbo）。

用法：python tools/gen_assets.py [--force] [--only bg_galaxy,rock]

产物写到 public/art/<id>.png；已存在的默认跳过，方便断点续跑。
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8188"
SIGMAS = "1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0"
UNET = "qwen_image_2.1_turbo_int8_convrot.safetensors"
CLIP = "qwen3vl_8b_int8_convrot.safetensors"
VAE = "qwen_image_2.1_vae_bf16.safetensors"

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "art"

NEG = (
    "text, watermark, logo, signature, letters, words, blurry, low quality, jpeg artifacts, "
    "frame, border, ui, hud, split screen, duplicate"
)

JOBS = [
    # —— 背景（会作为天球贴图，所以要求深色、无边框）——
    dict(id="bg_galaxy", w=1344, h=768, seed=20261119,
         prompt="A majestic spiral galaxy seen from deep space, bright glowing core, blue and violet "
                "spiral arms filled with countless tiny stars, cinematic astrophotography, ultra detailed, "
                "pure dark space around it, high contrast"),
    dict(id="bg_blackhole", w=1344, h=768, seed=20261120,
         prompt="A supermassive black hole in deep space, glowing orange and white accretion disk seen at a "
                "low angle, bright thin photon ring, gravitational lensing arcs, perfectly black event horizon, "
                "cinematic, ultra detailed, dark starfield"),
    dict(id="bg_nebula", w=1344, h=768, seed=20261121,
         prompt="A vast nebula in deep space, teal and magenta gas clouds, bright scattered stars, "
                "cinematic volumetric lighting, ultra detailed, dark edges around the frame"),
    dict(id="bg_nebula_gold", w=1344, h=768, seed=20261201,
         prompt="A vast nebula in deep space, warm gold and crimson gas clouds, bright scattered stars, "
                "cinematic volumetric lighting, ultra detailed, dark edges around the frame"),
    dict(id="bg_nebula_blue", w=1344, h=768, seed=20261202,
         prompt="A vast nebula in deep space, deep blue and violet gas clouds with faint teal glow, "
                "cinematic volumetric lighting, ultra detailed, dark edges around the frame"),
    dict(id="menu_art", w=1344, h=768, seed=20261122,
         prompt="Epic space combat key art: a sleek grey starfighter with cyan engine trails diving through an "
                "asteroid field toward a massive black hole with an orange accretion disk, cinematic lighting, "
                "orange and cyan color contrast, ultra detailed, dark space"),

    # —— 障碍物表面贴图（要求无缝、均匀光）——
    dict(id="tex_rock", w=1024, h=1024, seed=20261123,
         prompt="Seamless tileable texture of grey asteroid rock surface, cratered stone, rough and dusty, "
                "even flat lighting, top down view, photorealistic, no shadows"),
    dict(id="tex_ice", w=1024, h=1024, seed=20261124,
         prompt="Seamless tileable texture of blue white ice crystal surface, frost, deep cracks, "
                "even flat lighting, photorealistic, no shadows"),
    dict(id="tex_crystal", w=1024, h=1024, seed=20261125,
         prompt="Seamless tileable texture of purple amethyst crystal, sharp faceted planes, glowing violet "
                "inner light, even flat lighting, no shadows"),
    dict(id="tex_metal", w=1024, h=1024, seed=20261129,
         prompt="Seamless tileable texture of weathered grey metal hull plating, rivets, panel seams, scratches, "
                "even flat lighting, top down, photorealistic, no shadows"),
    dict(id="tex_basalt", w=1024, h=1024, seed=20261130,
         prompt="Seamless tileable texture of dark basalt volcanic rock, porous charcoal surface, fine cracks, "
                "even flat lighting, top down, photorealistic, no shadows"),

    # —— 道具图标（纯黑底，UI 里用 mix-blend-mode: screen 抠掉黑）——
    dict(id="icon_shield", w=768, h=768, seed=20261126,
         prompt="Game UI icon: glowing cyan hexagonal energy shield emblem, centered on pure black background, "
                "simple flat vector design, strong neon glow, symmetrical"),
    dict(id="icon_reflect", w=768, h=768, seed=20261127,
         prompt="Game UI icon: glowing magenta energy shield with a curved arrow bouncing back, centered on pure "
                "black background, simple flat vector design, strong neon glow, symmetrical"),
    dict(id="icon_repair", w=768, h=768, seed=20261128,
         prompt="Game UI icon: glowing green repair cross with a small wrench, centered on pure black background, "
                "simple flat vector design, strong neon glow, symmetrical"),
]


def api(path, data=None):
    req = urllib.request.Request(BASE + path, method="POST" if data is not None else "GET")
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, body, timeout=60) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def build(prompt, negative, seed, width, height, prefix):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "QwenImage21Cache", "inputs": {"model": ["1", 0], "device": "auto", "dtype": "default"}},
        "5": {"class_type": "TextEncodeQwenImage21",
              "inputs": {"clip": ["2", 0], "prompt": prompt, "negative_prompt": negative, "resolution": 1024}},
        "6": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "7": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "8": {"class_type": "CFGGuider", "inputs": {"model": ["4", 0], "positive": ["5", 0],
                                                    "negative": ["5", 1], "cfg": 1.0}},
        "9": {"class_type": "ManualSigmas", "inputs": {"sigmas": SIGMAS}},
        "10": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "11": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["6", 0], "guider": ["8", 0],
                                                                 "sampler": ["7", 0], "sigmas": ["9", 0],
                                                                 "latent_image": ["10", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": f"stararc/{prefix}"}},
    }


def finalize(job, png_path):
    """大图转 JPEG（体积能小 6 倍，网页游戏必须做）；图标保留 PNG。"""
    if job["id"].startswith("icon_"):
        return png_path
    try:
        from PIL import Image
    except ImportError:
        print("  !! 缺少 Pillow，保留 PNG（assets.js 期望 .jpg，请安装后再转）", flush=True)
        return png_path
    jpg = png_path.with_suffix(".jpg")
    Image.open(png_path).convert("RGB").save(jpg, "JPEG", quality=88, optimize=True, progressive=True)
    png_path.unlink()
    return jpg


def run_job(job, timeout=900):
    out = OUT_DIR / f"{job['id']}.png"
    t0 = time.time()
    r = api("/prompt", {"prompt": build(job["prompt"], NEG, job["seed"], job["w"], job["h"], job["id"]),
                        "client_id": "stararc"})
    pid = r["prompt_id"]

    while time.time() - t0 < timeout:
        h = api(f"/history/{pid}")
        if pid in h:
            entry = h[pid]
            if entry.get("status", {}).get("status_str") == "error":
                print(f"  !! {job['id']} 失败: {json.dumps(entry['status'], ensure_ascii=False)[:600]}", flush=True)
                return False
            imgs = [im for node in entry.get("outputs", {}).values() for im in node.get("images", [])]
            if imgs:
                im = imgs[0]
                q = urllib.parse.urlencode({
                    "filename": im["filename"],
                    "subfolder": im.get("subfolder", ""),
                    "type": im.get("type", "output"),
                })
                with urllib.request.urlopen(f"{BASE}/view?{q}", timeout=120) as rr:
                    data = rr.read()
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(data)
                final_path = finalize(job, out)
                print(f"  OK {job['id']:<14} {time.time()-t0:5.1f}s  {final_path.stat().st_size//1024:4d}KB", flush=True)
                return True
        time.sleep(2)
    print(f"  !! {job['id']} 超时", flush=True)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    jobs = [j for j in JOBS if not only or j["id"] in only]

    print(f"ComfyUI @ {BASE}  共 {len(jobs)} 张 -> {OUT_DIR}", flush=True)
    ok = 0
    for job in jobs:
        target = OUT_DIR / f"{job['id']}.png"
        if (target.exists() or target.with_suffix(".jpg").exists()) and not args.force:
            print(f"  skip {job['id']} (已存在)", flush=True)
            ok += 1
            continue
        ok += 1 if run_job(job) else 0
    print(f"完成 {ok}/{len(jobs)}", flush=True)
    return 0 if ok == len(jobs) else 1


if __name__ == "__main__":
    sys.exit(main())
