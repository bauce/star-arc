# -*- coding: utf-8 -*-
"""按「切换角度.json」工作流出一组多角度图（三视图/环视图）。

原理：ComfyUI 的 /prompt 只吃 API 格式，而工作流文件是 UI 格式（nodes + links）。
这里把 UI 图转换成 API 图，再替换 LoadImage 的图和正向提示词，逐个角度提交。

用法：
  python tools/gen_turnaround.py --image public/art/base_ship.png --out public/art/turnaround
"""
import argparse
import copy
import json
import pathlib
import random
import shutil
import time
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8188"
COMFY = pathlib.Path(r"D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI")
WF = COMFY / "user" / "default" / "workflows" / "切换角度.json"
ROOT = pathlib.Path(__file__).resolve().parent.parent

WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"}
SEED_CONTROL = {"fixed", "increment", "decrement", "randomize"}


def api(path, data=None):
    req = urllib.request.Request(BASE + path, method="POST" if data is not None else "GET")
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, body, timeout=60) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def build_specs(info):
    """返回 [(input_name, type)]，按 required → optional 的顺序"""
    inp = info.get("input", {})
    specs = []
    for group in ("required", "optional"):
        for name, spec in (inp.get(group) or {}).items():
            typ = spec[0]
            if isinstance(typ, list):
                typ = "COMBO"
            specs.append((name, typ))
    return specs


def ui_to_api(wf, object_info):
    links = {l[0]: (l[1], l[2]) for l in wf.get("links", [])}
    nodes = {n["id"]: n for n in wf["nodes"] if n["type"] not in ("Note", "MarkdownNote")}
    out = {}

    for nid, node in nodes.items():
        typ = node["type"]
        info = object_info.get(typ)
        if not info:
            raise RuntimeError(f"节点类型不存在: {typ}")

        linked = {i["name"]: i["link"] for i in node.get("inputs", []) if i.get("link") is not None}
        widgets = node.get("widgets_values") or []
        wi = 0
        inputs = {}

        for name, itype in build_specs(info):
            if name in linked:
                src, slot = links[linked[name]]
                inputs[name] = [str(src), slot]
                continue
            if itype not in WIDGET_TYPES:
                continue  # 纯连线输入（IMAGE/LATENT/MODEL...），没接线就跳过
            if wi >= len(widgets):
                continue
            inputs[name] = widgets[wi]
            wi += 1
            # seed 后面的 control_after_generate 不是真实输入
            if name in ("seed", "noise_seed") and wi < len(widgets) and widgets[wi] in SEED_CONTROL:
                wi += 1

        out[str(nid)] = {"class_type": typ, "inputs": inputs}

    return out


def run(graph, seed, timeout=600):
    g = copy.deepcopy(graph)
    g["106"]["inputs"]["seed"] = seed
    r = api("/prompt", {"prompt": g, "client_id": "stararc-turn"})
    pid = r["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = api(f"/history/{pid}")
        if pid in h:
            e = h[pid]
            if e.get("status", {}).get("status_str") == "error":
                msgs = e["status"].get("messages", [])
                raise RuntimeError(json.dumps(msgs, ensure_ascii=False)[:1200])
            imgs = [im for node in e.get("outputs", {}).values() for im in node.get("images", [])]
            if imgs:
                im = imgs[0]
                q = urllib.parse.urlencode({"filename": im["filename"],
                                            "subfolder": im.get("subfolder", ""),
                                            "type": im.get("type", "output")})
                with urllib.request.urlopen(f"{BASE}/view?{q}", timeout=120) as rr:
                    return rr.read()
        time.sleep(1.5)
    raise TimeoutError("生成超时")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, help="输入图（会被复制进 ComfyUI/input）")
    ap.add_argument("--out", default="public/art/turnaround")
    args = ap.parse_args()

    wf = json.loads(WF.read_text(encoding="utf-8"))
    object_info = api("/object_info")
    graph = ui_to_api(wf, object_info)

    # 输入图放进 ComfyUI/input，LoadImage 才能读到
    src = pathlib.Path(args.image)
    name = f"stararc_{src.stem}{src.suffix}"
    dst = COMFY / "input" / name
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dst)
    graph["41"]["inputs"]["image"] = name

    print(f"图: {name}  |  节点数: {len(graph)}", flush=True)

    angles = [
        ("front", "<sks> front view eye-level shot medium shot"),
        ("right", "<sks> right side view eye-level shot medium shot"),
        ("back", "<sks> back view eye-level shot medium shot"),
        ("left", "<sks> left side view eye-level shot medium shot"),
        ("front_top", "<sks> front view elevated shot medium shot"),
    ]

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)

    for tag, prompt in angles:
        graph["112"]["inputs"]["prompt"] = prompt
        seed = random.randint(1, 2**31)
        t0 = time.time()
        try:
            data = run(graph, seed)
        except Exception as err:  # noqa: BLE001
            print(f"  !! {tag}: {err}", flush=True)
            continue
        p = outdir / f"{tag}.png"
        p.write_bytes(data)
        print(f"  OK {tag:<10} {time.time()-t0:5.1f}s {len(data)//1024}KB", flush=True)

    print("done ->", outdir, flush=True)


if __name__ == "__main__":
    main()
