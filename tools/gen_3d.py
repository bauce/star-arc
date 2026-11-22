# -*- coding: utf-8 -*-
"""图片 → 3D 网格（Hunyuan3D 2.0，官方 workflow 转 API 后调用）。

前置：hunyuan3d-dit-v2_fp16.safetensors 放在 ComfyUI/models/checkpoints/
用法：python tools/gen_3d.py --image public/art/ship_input.png --out public/models/ship.glb
"""
import argparse
import copy
import json
import pathlib
import shutil
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from gen_turnaround import api, ui_to_api  # noqa: E402

BASE = "http://127.0.0.1:8188"
COMFY = pathlib.Path(r"D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI")
WF = pathlib.Path(__file__).resolve().parent / "workflows" / "hy3d_image_to_mesh.json"
ROOT = pathlib.Path(__file__).resolve().parent.parent

LOAD_IMAGE = "56"
SAVE_GLB = "82"


def submit(graph, timeout=1200):
    r = api("/prompt", {"prompt": graph, "client_id": "stararc-3d"})
    pid = r["prompt_id"]
    print("queued", pid, flush=True)
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = api(f"/history/{pid}")
        if pid in h:
            entry = h[pid]
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError(json.dumps(st.get("messages", []), ensure_ascii=False)[:2000])
            outs = entry.get("outputs", {})
            print("outputs:", json.dumps(outs, ensure_ascii=False)[:600], flush=True)
            return outs
        time.sleep(2)
    raise TimeoutError("超时")


def download(item, dest):
    q = urllib.parse.urlencode({
        "filename": item["filename"],
        "subfolder": item.get("subfolder", ""),
        "type": item.get("type", "output"),
    })
    with urllib.request.urlopen(f"{BASE}/view?{q}", timeout=180) as rr:
        data = rr.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return len(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--out", default="public/models/ship.glb")
    ap.add_argument("--prefix", default="stararc/ship")
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--cfg", type=float, default=5.0)
    args = ap.parse_args()

    wf = json.loads(WF.read_text(encoding="utf-8"))
    object_info = api("/object_info")

    if "hunyuan3d-dit-v2_fp16.safetensors" not in object_info["ImageOnlyCheckpointLoader"]["input"]["required"]["ckpt_name"][0]:
        print("!! ComfyUI 还没看到 hunyuan3d-dit-v2_fp16.safetensors，可能需要重启 ComfyUI", flush=True)
        return 2

    graph = ui_to_api(wf, object_info)

    src = pathlib.Path(args.image)
    name = f"stararc3d_{src.stem}{src.suffix}"
    shutil.copy(src, COMFY / "input" / name)
    graph[LOAD_IMAGE]["inputs"]["image"] = name
    graph[SAVE_GLB]["inputs"]["filename_prefix"] = args.prefix
    graph["3"]["inputs"]["steps"] = args.steps
    graph["3"]["inputs"]["cfg"] = args.cfg

    outs = submit(copy.deepcopy(graph))

    files = [it for node in outs.values() for v in node.values() if isinstance(v, list)
             for it in v if isinstance(it, dict) and "filename" in it]
    glb = [f for f in files if f["filename"].lower().endswith(".glb")]
    pick = (glb or files)
    if not pick:
        print("!! 没有拿到文件", flush=True)
        return 3

    dest = ROOT / args.out
    size = download(pick[0], dest)
    print(f"OK -> {dest}  {size/1024:.0f}KB", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
