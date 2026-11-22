# -*- coding: utf-8 -*-
"""用 Blender 无头模式生成《星弧》的敌机与道具模型，导出 GLB。

运行：
  blender -b -P tools/blender_assets.py

约定：模型机头朝 Blender +Y（导出后 = glTF -Z，正好是游戏里的前方），Z 向上。
"""
import math
import os

import bpy
from mathutils import Vector, noise

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "models")


# ————————————————————————— 工具 —————————————————————————

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.unit_settings.system = "METRIC"


def make_material(name, base, metallic, roughness, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def bevel(obj, width=0.035, segments=2):
    mod = obj.modifiers.new("bev", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40)
    return obj


def shade_flat(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = False


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def export(objs, filename):
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )
    size = os.path.getsize(path)
    print(f"[OK] {path}  {size/1024:.0f} KB")


# ————————————————————————— 敌机 —————————————————————————

def build_fighter():
    reset_scene()
    hull = make_material("Hull", (0.42, 0.12, 0.16), 0.50, 0.52, emission=(0.22, 0.035, 0.06), strength=1.1)
    trim = make_material("Trim", (0.70, 0.24, 0.28), 0.60, 0.42, emission=(0.22, 0.03, 0.06), strength=1.2)
    glow = make_material("Glow", (0.02, 0.0, 0.005), 0.2, 0.3, emission=(1.0, 0.15, 0.30), strength=3.2)

    body_parts = []

    # 机身：细长的纺锤体
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1.0, location=(0, 0, 0))
    pod = bpy.context.active_object
    pod.scale = (0.64, 1.95, 0.60)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(pod, hull)
    body_parts.append(pod)

    # 机头
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.6, radius2=0.08, depth=1.5, location=(0, 2.25, 0))
    nose = bpy.context.active_object
    nose.rotation_euler = (math.radians(-90), 0, 0)
    assign(nose, trim)
    body_parts.append(nose)

    # 两片后掠翼（短、薄、带下反）
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 1.02, -0.55, -0.05))
        wing = bpy.context.active_object
        wing.scale = (1.15, 0.62, 0.06)
        wing.rotation_euler = (math.radians(4), 0, side * math.radians(-22))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        bevel(wing, 0.03, 2)
        assign(wing, trim)
        body_parts.append(wing)

        # 翼端小翼
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 2.02, -0.3, 0.06))
        tip = bpy.context.active_object
        tip.scale = (0.1, 0.42, 0.3)
        tip.rotation_euler = (0, 0, side * math.radians(-22))
        assign(tip, hull)
        body_parts.append(tip)

    # 尾部双发动机舱
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.26, depth=1.5,
                                            location=(side * 0.55, -1.35, -0.02))
        nac = bpy.context.active_object
        nac.rotation_euler = (math.radians(-90), 0, 0)
        assign(nac, trim)
        body_parts.append(nac)

    # 前方两枚叉齿
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.14, radius2=0.02, depth=1.9,
                                        location=(side * 0.72, 1.75, 0.02))
        prong = bpy.context.active_object
        prong.rotation_euler = (math.radians(-90), 0, 0)
        assign(prong, trim)
        body_parts.append(prong)

    # 背部脊线
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.4, 0.42))
    spine = bpy.context.active_object
    spine.scale = (0.16, 1.9, 0.16)
    assign(spine, trim)
    body_parts.append(spine)

    body = join(body_parts, "Body")
    shade_flat(body)
    bevel(body, 0.02, 1)

    # 发光件：眼 + 尾喷口
    glow_parts = []
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.3, location=(0, 1.55, 0.14))
    eye = bpy.context.active_object
    assign(eye, glow)
    glow_parts.append(eye)

    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.24, depth=0.35,
                                            location=(side * 0.52, -1.95, -0.02))
        cap = bpy.context.active_object
        cap.rotation_euler = (math.radians(-90), 0, 0)
        assign(cap, glow)
        glow_parts.append(cap)

    glow_obj = join(glow_parts, "Glow")
    shade_flat(glow_obj)

    # 独立的光环（游戏里单独让它自转）：做成机身尾部的"环箍"，别做成套马圈
    bpy.ops.mesh.primitive_torus_add(major_radius=0.80, minor_radius=0.055,
                                     major_segments=44, minor_segments=8, location=(0, -1.0, 0))
    ring = bpy.context.active_object
    ring.name = "Ring"
    ring.rotation_euler = (math.radians(90), 0, 0)
    bind = make_material("RingGlow", (0.02, 0.0, 0.005), 0.3, 0.25, emission=(1.0, 0.2, 0.35), strength=2.2)
    assign(ring, bind)
    shade_flat(ring)

    export([body, glow_obj, ring], "enemy_fighter.glb")


# ————————————————————————— 道具胶囊 —————————————————————————

def build_powerup():
    reset_scene()
    shell = make_material("PodShell", (0.35, 0.4, 0.48), 0.85, 0.28)
    core = make_material("PodCore", (0.02, 0.05, 0.06), 0.1, 0.2, emission=(0.35, 0.95, 1.0), strength=6.0)

    parts = []
    # 六棱柱外壳
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.62, depth=1.1, location=(0, 0, 0))
    body = bpy.context.active_object
    bevel(body, 0.05, 2)
    assign(body, shell)
    parts.append(body)

    # 上下端盖
    for z in (-0.62, 0.62):
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.62, radius2=0.22, depth=0.3, location=(0, 0, z))
        cap = bpy.context.active_object
        assign(cap, shell)
        parts.append(cap)

    # 三片散热鳍
    for i in range(3):
        a = i * math.tau / 3
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(math.cos(a) * 0.72, math.sin(a) * 0.72, 0))
        fin = bpy.context.active_object
        fin.scale = (0.1, 0.42, 0.5)
        fin.rotation_euler = (0, 0, a)
        assign(fin, shell)
        parts.append(fin)

    shell_obj = join(parts, "Shell")
    shade_flat(shell_obj)
    bevel(shell_obj, 0.02, 1)

    # 核心（游戏里会按道具类型改色）
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.42, location=(0, 0, 0))
    core_obj = bpy.context.active_object
    core_obj.name = "Core"
    assign(core_obj, core)
    shade_flat(core_obj)

    export([shell_obj, core_obj], "powerup_pod.glb")


# ————————————————————————— 障碍物 —————————————————————————

def craggy(subdiv=3, amp=0.28, seed=2.0):
    """带噪声扰动的球体 —— 比代码里的随机位移更像真石头"""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=1.0, location=(0, 0, 0))
    ob = bpy.context.active_object
    for v in ob.data.vertices:
        n = noise.noise_vector(Vector((v.co.x * seed, v.co.y * seed, v.co.z * seed)))
        v.co *= max(0.62, 1.0 + (n.x + n.y * 0.8) * amp)
    shade_flat(ob)
    return ob


def build_asteroids():
    # —— 岩石：一整块疙瘩 ——
    reset_scene()
    rock_mat = make_material("Rock", (0.42, 0.40, 0.38), 0.1, 0.95)
    rock = craggy(3, 0.30, 2.2)
    assign(rock, rock_mat)
    bevel(rock, 0.02, 1)
    export([rock], "asteroid_rock.glb")

    # —— 冰晶：锋利、棱角分明 ——
    reset_scene()
    ice_mat = make_material("Ice", (0.62, 0.86, 0.95), 0.05, 0.14)
    ice = craggy(2, 0.42, 4.6)
    ice.scale = (1.0, 0.78, 1.15)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(ice, ice_mat)
    bevel(ice, 0.015, 1)
    export([ice], "asteroid_ice.glb")

    # —— 晶簇：几根紫色晶柱插在一起 ——
    reset_scene()
    crys_mat = make_material("Crystal", (0.42, 0.24, 0.72), 0.25, 0.18,
                             emission=(0.35, 0.12, 0.75), strength=1.6)
    spikes = []
    for i, (ax, ay, h, r) in enumerate([
        (0.0, 0.0, 1.9, 0.42), (0.55, 0.2, 1.35, 0.30), (-0.5, 0.35, 1.15, 0.26),
        (0.15, -0.55, 1.05, 0.24), (-0.35, -0.3, 0.9, 0.2),
    ]):
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=r, radius2=0.02, depth=h,
                                        location=(ax, ay, h * 0.5 - 0.35))
        sp = bpy.context.active_object
        sp.rotation_euler = (math.radians(ax * 22), math.radians(ay * 22), 0)
        assign(sp, crys_mat)
        spikes.append(sp)
    crys = join(spikes, "Crystal")
    shade_flat(crys)
    export([crys], "asteroid_crystal.glb")

    # —— 金属残骸：一块被打烂的船体板 ——
    reset_scene()
    hull_mat = make_material("Wreck", (0.46, 0.47, 0.5), 0.85, 0.42)
    dark_mat = make_material("WreckDark", (0.14, 0.15, 0.17), 0.9, 0.5)
    parts = []
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    plate = bpy.context.active_object
    plate.scale = (1.5, 0.16, 1.05)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bevel(plate, 0.05, 2)
    assign(plate, hull_mat)
    parts.append(plate)

    for i, x in enumerate((-0.9, 0.1, 1.0)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.13, depth=1.5,
                                            location=(x, 0.18, 0.1))
        pipe = bpy.context.active_object
        pipe.rotation_euler = (0, math.radians(90), math.radians(i * 8 - 8))
        assign(pipe, dark_mat)
        parts.append(pipe)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.6, -0.05, 0.5))
    block = bpy.context.active_object
    block.scale = (0.45, 0.3, 0.22)
    block.rotation_euler = (0, 0, math.radians(12))
    assign(block, dark_mat)
    parts.append(block)

    wreck = join(parts, "Wreck")
    shade_flat(wreck)
    export([wreck], "debris_plate.glb")


# ————————————————————————— 废弃空间站 —————————————————————————

def build_station():
    reset_scene()
    hull = make_material("StationHull", (0.52, 0.53, 0.56), 0.72, 0.48)
    dark = make_material("StationDark", (0.20, 0.21, 0.24), 0.85, 0.52)
    light = make_material("StationLight", (0.02, 0.02, 0.02), 0.2, 0.3,
                          emission=(1.0, 0.62, 0.30), strength=5.0)

    parts = []

    # 中央主轴
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=2.6, depth=17, location=(0, 0, 0))
    core = bpy.context.active_object
    bevel(core, 0.12, 2)
    assign(core, hull)
    parts.append(core)

    # 两端的舱段
    for z in (-9.0, 9.0):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=3.6, depth=2.2, location=(0, 0, z))
        cap = bpy.context.active_object
        bevel(cap, 0.1, 2)
        assign(cap, dark)
        parts.append(cap)

    # 环形居住区（断成两段，看起来废弃了）
    for seg in range(11):
        if seg in (3, 4, 8):
            continue  # 缺口
        a = seg * math.tau / 12
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(math.cos(a) * 15, math.sin(a) * 15, 0))
        ring = bpy.context.active_object
        ring.scale = (1.25, 8.1, 1.6)
        ring.rotation_euler = (0, 0, a + math.pi / 2)
        bevel(ring, 0.12, 1)
        assign(ring, hull)
        parts.append(ring)

    # 连接臂
    for a in (0.0, math.pi * 0.5, math.pi, math.pi * 1.5):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(math.cos(a) * 8.6, math.sin(a) * 8.6, 0))
        arm = bpy.context.active_object
        arm.scale = (0.45, 7.0, 0.4)
        arm.rotation_euler = (0, 0, a + math.pi / 2)
        assign(arm, dark)
        parts.append(arm)

    # 太阳能板（两块还挂着，一块歪了）
    for a, tilt in ((math.pi * 0.25, 0.0), (math.pi * 1.2, 0.35)):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(math.cos(a) * 12, math.sin(a) * 12, 6.5))
        panel = bpy.context.active_object
        panel.scale = (5.2, 0.14, 2.6)
        panel.rotation_euler = (0, math.radians(-tilt * 40), a)
        assign(panel, dark)
        parts.append(panel)

    # 天线
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.4, radius2=0.02, depth=7,
                                    location=(0, 0, 13.5))
    ant = bpy.context.active_object
    assign(ant, dark)
    parts.append(ant)

    station = join(parts, "Station")
    shade_flat(station)
    bevel(station, 0.03, 1)

    # 舷窗灯：一批小方块，单独一个发光材质
    lights = []
    for i in range(26):
        a = (i * 0.61) % math.tau
        z = -8 + (i % 9) * 2.0
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(math.cos(a) * 2.75, math.sin(a) * 2.75, z))
        w = bpy.context.active_object
        w.scale = (0.16, 0.16, 0.5)
        w.rotation_euler = (0, 0, a)
        assign(w, light)
        lights.append(w)
    light_obj = join(lights, "Lights")
    shade_flat(light_obj)

    export([station, light_obj], "station_derelict.glb")


# ————————————————————————— 重型敌机 —————————————————————————

def build_gunship():
    reset_scene()
    hull = make_material("GsHull", (0.46, 0.14, 0.17), 0.55, 0.45,
                         emission=(0.18, 0.03, 0.05), strength=1.0)
    trim = make_material("GsTrim", (0.22, 0.24, 0.28), 0.9, 0.35)
    glow = make_material("GsGlow", (0.02, 0.0, 0.01), 0.2, 0.3,
                         emission=(1.0, 0.18, 0.3), strength=4.0)

    body = []
    # 厚机身
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=1.0, location=(0, 0, 0))
    pod = bpy.context.active_object
    pod.scale = (1.05, 2.4, 0.78)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(pod, hull)
    body.append(pod)

    # 前装甲楔
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.0, radius2=0.32, depth=2.2, location=(0, 2.6, 0))
    nose = bpy.context.active_object
    nose.rotation_euler = (math.radians(-90), 0, 0)
    assign(nose, hull)
    body.append(nose)

    # 双炮管
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.14, depth=2.6,
                                            location=(side * 0.62, 2.4, -0.25))
        gun = bpy.context.active_object
        gun.rotation_euler = (math.radians(-90), 0, 0)
        assign(gun, trim)
        body.append(gun)

    # 两侧发动机舱
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.55, depth=3.2,
                                            location=(side * 1.35, -0.9, -0.1))
        nac = bpy.context.active_object
        nac.rotation_euler = (math.radians(-90), 0, 0)
        assign(nac, trim)
        body.append(nac)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 1.35, -0.6, 0.62))
        fin = bpy.context.active_object
        fin.scale = (0.12, 1.5, 0.7)
        fin.rotation_euler = (0, 0, side * math.radians(-12))
        assign(fin, trim)
        body.append(fin)

    # 短粗翼
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 1.9, -0.9, -0.15))
        wing = bpy.context.active_object
        wing.scale = (1.5, 0.9, 0.14)
        wing.rotation_euler = (0, 0, side * math.radians(-14))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        bevel(wing, 0.04, 2)
        assign(wing, hull)
        body.append(wing)

    ship = join(body, "Gunship")
    shade_flat(ship)

    glows = []
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.46, depth=0.24,
                                            location=(side * 1.35, -2.5, -0.1))
        cap = bpy.context.active_object
        cap.rotation_euler = (math.radians(-90), 0, 0)
        assign(cap, glow)
        glows.append(cap)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.28, location=(0, 1.9, 0.3))
    eye = bpy.context.active_object
    assign(eye, glow)
    glows.append(eye)

    glow_obj = join(glows, "GsGlowObj")
    shade_flat(glow_obj)
    export([ship, glow_obj], "enemy_gunship.glb")


if __name__ == "__main__":
    build_fighter()
    build_powerup()
    build_asteroids()
    build_station()
    build_gunship()
    print("[DONE]")
