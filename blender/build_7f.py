# =====================================================================
#  LG U+ 대구고객센터 7층 (상담실) — v2
#  기존 floor_7f.glb 의 구역 위치는 그대로 두고, 영상·사진의 디테일을 입힘
#  사용법: 블렌더 5.x → Scripting 탭 → 이 파일 열기 → Run Script
#  좌표: 1 = 1m, 바닥 윗면 Z=0, 이름에 Door 가 있으면 통과 가능, Ceiling_ 은 게임에서 숨김
# =====================================================================
import bpy
import bmesh
import math
import os

EXPORT_PATH = r"C:\Users\User\company-metaverse\client\public\floor_7f.glb"
EXPORT_PATH = os.environ.get("FLOOR7F_EXPORT", EXPORT_PATH)  # (테스트용 경로 덮어쓰기)
# 한글 글꼴 (윈도우 맑은 고딕). 없으면 영어로 대체
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\malgunbd.ttf",
    r"C:\Windows\Fonts\malgun.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
]
WALL_H = 3.2  # 벽 높이
WALL_T = 0.15  # 벽 두께

# ---------------------------------------------------------------------
#  장면 초기화
# ---------------------------------------------------------------------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
    for item in list(block):
        if item.users == 0:
            block.remove(item)

col = bpy.data.collections.get("Floor_7F") or bpy.data.collections.new("Floor_7F")
if col.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(col)

# ---------------------------------------------------------------------
#  재질
# ---------------------------------------------------------------------
_mats = {}


def mat(name, rgb, rough=0.6, metal=0.0, alpha=1.0, emit=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except AttributeError:
            m.blend_method = "BLEND"
    if emit > 0:
        bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*rgb, alpha)
    _mats[name] = m
    return m


def hexrgb(h):
    h = h.lstrip("#")
    # sRGB → linear (블렌더 색 입력은 linear)
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


M = {
    "plaza": mat("Plaza_Granite", hexrgb("9a9a98"), 0.9),
    "marble": mat("Marble_Beige", hexrgb("e4dccd"), 0.25),
    "marble_wall": mat("Marble_White_Wall", hexrgb("eeece6"), 0.3),
    "wood_floor": mat("Wood_Floor_Oak", hexrgb("b07a45"), 0.45),
    "office_floor": mat("Vinyl_Gray_Wood", hexrgb("8d8c8a"), 0.7),
    "wall_white": mat("Wall_Ivory", hexrgb("efece4"), 0.8),
    "wall_dark": mat("Wall_Charcoal", hexrgb("3b3d42"), 0.7),
    "glass": mat("Glass_Clear", hexrgb("bcd8e0"), 0.05, 0.0, alpha=0.28),
    "frosted": mat("Glass_Frosted", hexrgb("dfe9ea"), 0.4, 0.0, alpha=0.6),
    "frame_black": mat("Frame_Black", hexrgb("1d1d1f"), 0.4, 0.4),
    "steel": mat("Steel_Brushed", hexrgb("b9bcc0"), 0.3, 0.9),
    "bronze": mat("Elevator_Bronze", hexrgb("5a3a22"), 0.35, 0.6),
    "magenta": mat("LGU_Magenta", hexrgb("e6007e"), 0.4),
    "white": mat("Plain_White", hexrgb("fafafa"), 0.5),
    "black": mat("Plain_Black", hexrgb("161616"), 0.5),
    "red_leather": mat("Red_Leather", hexrgb("d0202e"), 0.45),
    "yellow_top": mat("Table_Yellow", hexrgb("f2c335"), 0.4),
    "wood_light": mat("Wood_Light", hexrgb("c99a63"), 0.5),
    "wood_dark": mat("Wood_Walnut", hexrgb("6b4428"), 0.5),
    "green_wall": mat("Green_Wall_Leaves", hexrgb("3f7d3a"), 0.9),
    "green_dark": mat("Green_Leaves_Dark", hexrgb("2c5f2b"), 0.9),
    "plant": mat("Plant_Leaf", hexrgb("3e8a3a"), 0.8),
    "pot": mat("Pot_White", hexrgb("f0efea"), 0.5),
    "screen": mat("TV_Screen_Blue", hexrgb("2a4fd6"), 0.2, emit=1.2),
    "screen_off": mat("TV_Screen_Off", hexrgb("101215"), 0.15),
    "ksqi_blue": mat("KSQI_Navy", hexrgb("1c3f8f"), 0.5),
    "banner_white": mat("Banner_White", hexrgb("f7f7f5"), 0.6),
    "text_dark": mat("Text_Dark", hexrgb("222222"), 0.5),
    "text_red": mat("Text_Red", hexrgb("d6162d"), 0.5),
    "text_navy": mat("Text_Navy", hexrgb("1d3c78"), 0.5),
    "text_gray": mat("Text_Gray", hexrgb("8a8f99"), 0.5),
    "box": mat("Cardboard", hexrgb("c9a277"), 0.85),
    "cushion_gray": mat("Fabric_Gray", hexrgb("8a8b90"), 0.9),
    "mat_dark": mat("Mat_Dark", hexrgb("3c3c3c"), 0.95),
    "tape_green": mat("Floor_Tape_Green", hexrgb("7fe08a"), 0.6, emit=0.3),
    "tape_yellow": mat("Floor_Tape_Yellow", hexrgb("f5c518"), 0.6),
    "blue_partition": mat("Partition_Blue", hexrgb("7d93ad"), 0.8),
    "photo": [mat(f"Photo_{i}", hexrgb(c), 0.6) for i, c in enumerate(
        ["e94e77", "f6a623", "4a90e2", "50e3c2", "b8e986", "9013fe", "f8e71c", "d0021b"])],
}

# ---------------------------------------------------------------------
#  기본 도형 도우미
# ---------------------------------------------------------------------


def _link(obj):
    col.objects.link(obj)
    return obj


def box(name, x1, y1, z1, x2, y2, z2, material):
    """축 정렬 직육면체: (x1,y1,z1)~(x2,y2,z2)"""
    lo = (min(x1, x2), min(y1, y2), min(z1, z2))
    hi = (max(x1, x2), max(y1, y2), max(z1, z2))
    sx, sy, sz = hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    obj = bpy.data.objects.new(name, me)
    obj.location = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2)
    return _link(obj)


def cbox(name, cx, cy, z1, sx, sy, sz, material, rot_z=0.0):
    """바닥 중심 (cx,cy), 바닥높이 z1, 크기 sx,sy,sz"""
    o = box(name, cx - sx / 2, cy - sy / 2, z1, cx + sx / 2, cy + sy / 2, z1 + sz, material)
    o.rotation_euler.z = rot_z
    return o


def cyl(name, cx, cy, z1, r, h, material, verts=24, r2=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r,
                          radius2=r if r2 is None else r2, depth=h)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    obj = bpy.data.objects.new(name, me)
    obj.location = (cx, cy, z1 + h / 2)
    return _link(obj)


def floor(name, x1, y1, x2, y2, material, top=0.0):
    """바닥판: 윗면 Z=top, 두께 0.1"""
    return box(name, x1, y1, top - 0.1, x2, y2, top, material)


def wall(name, x1, y1, x2, y2, material, h=WALL_H, t=WALL_T, openings=(), z0=0.0):
    """축 방향 벽. openings = [(시작, 끝, 높이)] 벽 길이 방향 거리(시작점 기준)로 문 구멍"""
    horizontal = abs(y2 - y1) < 1e-6
    length = abs(x2 - x1) if horizontal else abs(y2 - y1)
    sign = 1 if (x2 - x1 if horizontal else y2 - y1) >= 0 else -1
    cuts = sorted(openings)
    segs, cur = [], 0.0
    for (a, b, oh) in cuts:
        if a > cur:
            segs.append((cur, a, z0, z0 + h))
        if oh < h:  # 문 위 상인방
            segs.append((a, b, z0 + oh, z0 + h))
        cur = b
    if cur < length:
        segs.append((cur, length, z0, z0 + h))
    objs = []
    for i, (a, b, za, zb) in enumerate(segs):
        n = f"{name}" if len(segs) == 1 else f"{name}_{i + 1}"
        if horizontal:
            xa, xb = x1 + sign * a, x1 + sign * b
            objs.append(box(n, xa, y1 - t / 2, za, xb, y1 + t / 2, zb, material))
        else:
            ya, yb = y1 + sign * a, y1 + sign * b
            objs.append(box(n, x1 - t / 2, ya, za, x1 + t / 2, yb, zb, material))
    return objs


_font = None


def get_font():
    global _font
    if _font is not None:
        return _font
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                _font = bpy.data.fonts.load(path)
                return _font
            except Exception:
                pass
    _font = False
    return _font


def text(name, body, x, y, z, size, material, facing="S", extrude=0.01, align="CENTER", fallback=None, fit=None):
    """벽에 붙는 글자. facing: 글자가 바라보는 방향 S/N/E/W. 한글 글꼴 없으면 fallback 사용
    fit=(최대폭, 최대높이) 를 주면 글꼴과 상관없이 그 크기에 꼭 맞게 늘이거나 줄임"""
    font = get_font()
    if not font and fallback is not None:
        body = fallback
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    if font:
        cu.font = font
    cu.size = size
    cu.extrude = extrude
    cu.resolution_u = 3  # 글자 곡선 단순화 (휴대폰용 용량 절약)
    cu.align_x = align
    cu.align_y = "CENTER"
    obj = bpy.data.objects.new(name, cu)
    obj.data.materials.append(material)
    _link(obj)
    # 글자를 세워서 방향 맞추기 (기본: XY 평면에 누워 +Z 를 바라봄)
    rot = {"S": (math.pi / 2, 0, 0), "N": (math.pi / 2, 0, math.pi),
           "E": (math.pi / 2, 0, math.pi / 2), "W": (math.pi / 2, 0, -math.pi / 2)}[facing]
    obj.rotation_euler = rot
    obj.location = (x, y, z)
    # 메시로 변환 (glb 내보내기용)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
    if fit and len(me.vertices):
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        k = min(fit[0] / max(w, 1e-4), fit[1] / max(h, 1e-4))
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        for v in me.vertices:  # 글자 크기 맞추고 가운데 정렬
            v.co.x = (v.co.x - cx) * k
            v.co.y = (v.co.y - cy) * k
    mesh_obj = bpy.data.objects.new(name, me)
    mesh_obj.matrix_world = obj.matrix_world.copy()
    _link(mesh_obj)
    bpy.data.objects.remove(obj)
    return mesh_obj


def leaf_ball(name, x, y, z, r, material):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    for v in bm.verts:  # 살짝 납작하게
        v.co.z *= 0.75
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    obj = bpy.data.objects.new(name, me)
    obj.location = (x, y, z)
    return _link(obj)


def plant(name, x, y, h=1.6, big=False):
    """화분 + 줄기 + 잎 뭉치 (사무실 관엽식물 느낌)"""
    cyl(f"{name}_Pot", x, y, 0, 0.22 if not big else 0.3, 0.45, M["pot"])
    cyl(f"{name}_Stem", x, y, 0.45, 0.03, h - 0.6, M["wood_dark"], 8)
    r = 0.28 if not big else 0.45
    spots = [(0, 0, h - 0.15), (0.18, 0.05, h - 0.45), (-0.16, 0.12, h - 0.55),
             (0.05, -0.18, h - 0.75), (-0.1, -0.08, h - 0.95)]
    for i, (dx, dy, zz) in enumerate(spots):
        k = 1.0 if not big else 1.6
        leaf_ball(f"{name}_Leaves_{i + 1}", x + dx * k, y + dy * k, zz, r * (1 - i * 0.08),
                  M["plant"] if i % 2 == 0 else M["green_dark"])


def tv(name, x, y, z, w, h, facing, on=True):
    """벽걸이 TV: (x,y) 벽면 위치, z 아래쪽 높이"""
    d = 0.06
    if facing in ("S", "N"):
        s = -1 if facing == "S" else 1
        cbox(f"{name}_Frame", x, y + s * d / 2, z, w, d, h, M["black"])
        cbox(f"{name}_Screen", x, y + s * (d + 0.005), z + 0.04, w - 0.08, 0.01, h - 0.08,
             M["screen"] if on else M["screen_off"])
    else:
        s = -1 if facing == "W" else 1
        cbox(f"{name}_Frame", x + s * d / 2, y, z, d, w, h, M["black"])
        cbox(f"{name}_Screen", x + s * (d + 0.005), y, z + 0.04, 0.01, w - 0.08, h - 0.08,
             M["screen"] if on else M["screen_off"])


def chair(name, x, y, color=None, face=0.0):
    c = color or M["white"]
    cbox(f"{name}_Seat", x, y, 0.42, 0.44, 0.44, 0.05, c)
    back = cbox(f"{name}_Back", x, y + 0.2, 0.47, 0.44, 0.04, 0.42, c)
    for i, (dx, dy) in enumerate([(-0.18, -0.18), (0.18, -0.18), (-0.18, 0.18), (0.18, 0.18)]):
        cbox(f"{name}_Leg_{i + 1}", x + dx, y + dy, 0, 0.03, 0.03, 0.42, M["wood_light"])



# v2 추가 재질 (사진 색감)
M.update({
    "bianco": mat("Bianco_Marble_Gloss", hexrgb("f4f4f2"), 0.12),
    "vein": mat("Marble_Vein_Gray", hexrgb("b9bcbf"), 0.2),
    "charcoal": mat("Charcoal_Frame", hexrgb("26292e"), 0.45),
    "cafe_yellow": mat("Cafe_Yellow_Wall", hexrgb("c9a417"), 0.55),
    "mint": mat("Mint_Gray_Chair", hexrgb("b8c4bf"), 0.45),
    "blue_seat": mat("Blue_Seat", hexrgb("1f6fd1"), 0.5),
    "neon": mat("Neon_Blue", hexrgb("38bdf8"), 0.2, emit=2.0),
    "neon_pink": mat("Neon_Pink", hexrgb("ff4fa0"), 0.2, emit=1.5),
    "exit_green": mat("Exit_Green", hexrgb("16a34a"), 0.3, emit=2.0),
    "gold": mat("Gold_Wreath", hexrgb("e7b416"), 0.3, 0.7),
    "brick": mat("Brick_Gray", hexrgb("8e8f8c"), 0.9),
    "lime": mat("Lime_Cuff", hexrgb("8bc34a"), 0.4),
    "red_flower": mat("Red_Flower", hexrgb("c81d2a"), 0.6),
    "panel_white": mat("Panel_Ivory", hexrgb("efede6"), 0.7),
    "wood_panel": mat("Wood_Panel_Oak", hexrgb("c39a6b"), 0.55),
    "blind": mat("Wood_Blind", hexrgb("9a6a3e"), 0.6),
    "roller": mat("Roller_Blind", hexrgb("e8e4da"), 0.8),
    "book": [mat(f"Book_{i}", hexrgb(c), 0.6) for i, c in enumerate(
        ["b23a48", "2f5d8a", "e0c341", "3d7a4f", "f1f1ee", "6a4c93"])],
})


def T(name, body, x, y, z, w, h, material, facing="S", fallback=None, extrude=0.01):
    """글자를 (w, h) 크기 상자에 꼭 맞게"""
    return text(name, body, x, y, z, 0.3, material, facing, extrude=extrude, fallback=fallback, fit=(w, h))


def ext_stand(name, x, y):
    """빨간 받침대 소화기"""
    cbox(f"{name}_Stand", x, y, 0, 0.26, 0.26, 0.08, M["red_leather"])
    cyl(f"{name}_Body", x, y, 0.08, 0.08, 0.5, M["text_red"], 14)
    cyl(f"{name}_Head", x, y, 0.58, 0.03, 0.08, M["black"], 8)


def tape_square(name, x, y, s=0.5):
    for i, (a, b, c, d) in enumerate([(-1, -1, 1, -0.86), (-1, 0.86, 1, 1), (-1, -1, -0.86, 1), (0.86, -1, 1, 1)]):
        box(f"{name}_{i + 1}", x + a * s / 2, y + b * s / 2, 0, x + c * s / 2, y + d * s / 2, 0.006, M["tape_yellow"])


def exit_sign(name, x, y, z, facing="S"):
    if facing in ("S", "N"):
        cbox(name, x, y, z, 0.36, 0.05, 0.16, M["exit_green"])
    else:
        cbox(name, x, y, z, 0.05, 0.36, 0.16, M["exit_green"])



# =====================================================================
#  7층 추가 재질 (영상·사진 색감)
# =====================================================================
M.update({
    "orange": mat("Orange_Gloss_Wall", hexrgb("e7731c"), 0.15),
    "elev_door": mat("Elevator_DarkBrown", hexrgb("3b2a22"), 0.3, 0.5),
    "tile_light": mat("Tile_Light_Gray", hexrgb("d9d8d4"), 0.35),
    "mat_purple": mat("Floor_Mat_PurpleGray", hexrgb("4a4752"), 0.9),
    "stone_wall": mat("Stone_Gray_Wall", hexrgb("b8b4ac"), 0.6),
    "brick_gray": mat("Brick_Gray_7F", hexrgb("8f9196"), 0.9),
    "brick_red": mat("Brick_Garden", hexrgb("a5583e"), 0.9),
    "office_gray": mat("Office_Floor_LightGray", hexrgb("b9bab8"), 0.55),
    "oak_floor": mat("Oak_Floor_7F", hexrgb("c79c6e"), 0.5),
    "lime_green": mat("Lime_Pillar", hexrgb("8cc63f"), 0.45),
    "fabric_blue": mat("Fabric_BlueGray", hexrgb("8496ad"), 0.9),
    "desk_white": mat("Desk_White", hexrgb("f3f3f1"), 0.45),
    "mesh_black": mat("Mesh_Black", hexrgb("232427"), 0.7),
    "amber": mat("Pendant_Amber", hexrgb("f0a43a"), 0.3, emit=1.5),
    "pink_back": mat("Backsplash_Pink", hexrgb("f2a7b8"), 0.3),
    "orange_back": mat("Backsplash_Orange", hexrgb("f08a24"), 0.3),
    "red_pouf": mat("Pouf_Red", hexrgb("c9232f"), 0.8),
    "gray_pouf": mat("Pouf_Gray", hexrgb("8e9196"), 0.9),
    "yellow_cush": mat("Cushion_Yellow", hexrgb("f1c232"), 0.8),
    "blue_box": mat("Box_Blue", hexrgb("2f6fd0"), 0.5),
    "screen_proj": mat("Projector_Screen", hexrgb("f6f6f6"), 0.9, emit=0.2),
    "clova": mat("TV_Clova_Screen", hexrgb("1b2a4a"), 0.2, emit=0.8),
    "phone_yellow": mat("PhoneBooth_Yellow", hexrgb("f4c20d"), 0.4),
    "umbrella": mat("Umbrella_Pink", hexrgb("ee6aa7"), 0.6),
    "succulent": mat("Succulent_Green", hexrgb("7aa66a"), 0.8),
    "ext_red": mat("Extinguisher_Red", hexrgb("d11f26"), 0.35),
})

def ext(name, x, y):
    """소화기 + 노란 받침"""
    cbox(f"{name}_Pad", x, y, 0, 0.34, 0.34, 0.015, M["tape_yellow"])
    cyl(f"{name}_Body", x, y, 0.015, 0.08, 0.5, M["ext_red"], 14)
    cyl(f"{name}_Head", x, y, 0.515, 0.03, 0.08, M["black"], 8)

def pothos(name, x, y, z, s=1.0):
    """작은 사각 화분 + 포토스 잎"""
    cbox(f"{name}_Pot", x, y, z, 0.2 * s, 0.2 * s, 0.18 * s, M["black"])
    leaf_ball(f"{name}_Leaf_1", x, y, z + 0.26 * s, 0.17 * s, M["plant"])
    leaf_ball(f"{name}_Leaf_2", x + 0.1 * s, y + 0.06 * s, z + 0.18 * s, 0.12 * s, M["green_dark"])

def dracaena(name, x, y, h=1.7):
    cyl(f"{name}_Pot", x, y, 0, 0.2, 0.42, M["text_dark"], 16)
    cyl(f"{name}_Stem", x, y, 0.42, 0.025, h - 0.5, M["wood_dark"], 6)
    for i, (dx, dy, zz, r) in enumerate([(0, 0, h, 0.26), (0.14, 0.05, h - 0.35, 0.22),
                                         (-0.12, -0.08, h - 0.6, 0.2), (0.05, 0.12, h - 0.85, 0.18)]):
        leaf_ball(f"{name}_Leaves_{i + 1}", x + dx, y + dy, zz, r, M["plant"] if i % 2 else M["green_dark"])

def office_chair(name, x, y, face_y):
    """메시 의자: face_y=+1 이면 북쪽(+Y) 책상을 바라봄"""
    cyl(f"{name}_Base", x, y, 0, 0.26, 0.42, M["black"], 10, r2=0.04)
    cbox(f"{name}_Seat", x, y, 0.42, 0.48, 0.46, 0.07, M["mesh_black"])
    cbox(f"{name}_Back", x, y - face_y * 0.24, 0.49, 0.44, 0.05, 0.55, M["mesh_black"])

def stool(name, x, y):
    cyl(f"{name}_Seat", x, y, 0.72, 0.17, 0.04, M["wood_light"], 14)
    for i, (dx, dy) in enumerate([(-0.12, -0.12), (0.12, -0.12), (-0.12, 0.12), (0.12, 0.12)]):
        cbox(f"{name}_Leg_{i + 1}", x + dx, y + dy, 0, 0.025, 0.025, 0.72, M["steel"])

# =====================================================================
#  0) 바닥
# =====================================================================
floor("Elev_Lobby_SouthFloor", -1.9, -13.6, 4.3, -10.0, M["tile_light"])
floor("Elev_Corridor_Floor", -22.1, -12.0, 4.4, -8.0, M["tile_light"])
box("Elev_Front_DarkMat", 2.3, -13.4, 0, 3.9, -8.2, 0.008, M["mat_purple"])
box("Hall_DarkMat_Band", -1.6, -11.3, 0, 2.3, -10.0, 0.006, M["mat_purple"])
floor("Corridor_Wood_Floor", -1.1, -8.0, 1.7, 15.0, M["oak_floor"])
floor("Expanded_Workspace_Floor", -18.8, -3.8, -1.1, 16.0, M["office_gray"])
floor("Meeting_Aisle_WoodFloor", -18.8, -5.3, -1.1, -3.8, M["oak_floor"])  # 회의실 앞 나무 복도
floor("Meeting_Rooms_Floor_W", -18.8, -7.9, -12.4, -5.3, M["office_gray"])
floor("Copier_Passage_Floor", -12.4, -8.0, -9.8, -5.3, M["oak_floor"])  # 바깥 복도로 나가는 통로
floor("Meeting_Rooms_Floor_E", -9.8, -7.9, -1.1, -5.3, M["office_gray"])
floor("RestBar_Wood_Floor", 1.7, -7.5, 6.7, -1.5, M["oak_floor"])
floor("Lounge7F_Wood_Floor", 1.7, -1.5, 6.7, 8.4, M["oak_floor"])

# 바닥 표시 (점자블록·안내선·응원 문구)
box("Yellow_Tactile_Main", -12.1, -10.5, 0, 3.1, -10.1, 0.01, M["tape_yellow"])
box("Yellow_Tactile_Branch", 2.7, -10.2, 0, 3.1, -8.8, 0.01, M["tape_yellow"])
box("Stair_Glow_Line", -0.1, -13.2, 0, 0.1, -11.4, 0.01, M["tape_green"])
box("West_Glow_Line", -21.8, -9.4, 0, -20.2, -9.3, 0.01, M["tape_green"])
box("Entrance_Cheer_Mat", -1.1, -9.8, 0, 1.7, -8.0, 0.006, M["mat_dark"])
T("Floor_Cheer_Text", "그대의 오늘을 응원합니다", 0.35, -9.1, 0.012, 1.9, 0.22, M["white"],
  facing="S", fallback="CHEER UP TODAY").rotation_euler = (0, 0, 0)
T("Floor_Cheer_Text_2", "상담은 공감입니다", 0.3, 4.0, 0.012, 1.6, 0.2, M["text_navy"],
  fallback="EMPATHY").rotation_euler = (0, 0, math.pi / 2)
cbox("Caution_Mat_YellowArc", -11.0, -8.95, 0, 1.2, 0.5, 0.008, M["phone_yellow"])

# =====================================================================
#  1) 엘리베이터 홀 (주황 유광벽 · 짙은 갈색 엘리베이터 2대)
# =====================================================================
wall("Lobby_South_Wall", -1.8, -13.5, 4.2, -13.5, M["stone_wall"], openings=[(1.1, 2.5, 2.4)])
box("Stair_Dark_Door", -0.7, -13.43, 0, 0.7, -13.4, 2.4, M["charcoal"])
exit_sign("Stair_Exit_Sign", 0.0, -13.42, 2.55, "N")
for i, x in enumerate([1.2, 1.7, 2.2, 2.7]):  # 게시판
    for j, z in enumerate([1.14, 1.64]):
        box(f"Notice_Board_{i}_{j}", x - 0.19, -13.42, z, x + 0.19, -13.39, z + 0.42, M["banner_white"])
box("Floor_Map_Sign", 3.3, -13.42, 1.2, 3.9, -13.39, 1.8, M["ksqi_blue"])
T("Floor_Map_Title", "7F 층별 안내", 3.6, -13.37, 1.68, 0.5, 0.08, M["white"], facing="N", fallback="7F MAP")
wall("West_Hall_Wall", -1.75, -13.5, -1.75, -11.5, M["stone_wall"])
# 동쪽 주황 벽 + 엘리베이터 2대 (x=4)
wall("Elev_Orange_Wall", 4.0, -13.5, 4.0, -8.0, M["orange"], t=0.12)
for nm, (y1, y2) in {"Elev_Door_R": (-12.7, -11.3), "Elev_Door_L": (-9.8, -8.4)}.items():
    box(f"{nm}_Frame", 3.9, y1 - 0.08, 0, 3.95, y2 + 0.08, 2.58, M["charcoal"])
    box(f"{nm}_Leaf_A", 3.86, y1, 0, 3.9, (y1 + y2) / 2 - 0.01, 2.45, M["elev_door"])
    box(f"{nm}_Leaf_B", 3.86, (y1 + y2) / 2 + 0.01, 0, 3.9, y2, 2.45, M["elev_door"])
    box(f"{nm}_Display", 3.88, (y1 + y2) / 2 - 0.15, 2.5, 3.9, (y1 + y2) / 2 + 0.15, 2.56, M["text_red"])
    box(f"{nm}_CallBtn", 3.92, y2 + 0.18, 1.0, 3.94, y2 + 0.28, 1.25, M["steel"])
T("Floor_Num", "7", 3.92, -10.55, 2.35, 0.25, 0.42, M["gold"], facing="W", extrude=0.02)
T("Hall_Slogan", "일상을 바꿉니다", 3.92, -10.55, 1.72, 1.1, 0.16, M["white"], facing="W", fallback="CHANGE EVERYDAY")
T("Hall_Slogan_5G", "U+5G", 3.92, -10.55, 1.45, 0.6, 0.18, M["magenta"], facing="W")
# 화분 + 녹색 플랜터 + 소화기
cbox("Pot_White_Tray", 3.65, -10.8, 0, 0.36, 0.45, 0.04, M["pot"])
cbox("Green_Planter_Box", 3.65, -10.8, 0.04, 0.32, 0.4, 0.3, M["lime"])
leaf_ball("Green_Planter_Leaves", 3.65, -10.8, 0.48, 0.22, M["plant"])
dracaena("Hall_Big_Plant", -1.2, -13.0, 1.9)
ext("Hall_Extinguisher", 3.6, -8.4)
tape_square("Hall_Wait_Square_1", 2.0, -12.0, 0.45)
tape_square("Hall_Wait_Square_2", 2.0, -9.1, 0.45)
# 홀 북쪽 벽 (REST BAR 쪽 막음)
wall("Hall_North_Wall_E", 1.7, -8.0, 4.0, -8.0, M["orange"])

# =====================================================================
#  2) 엘리베이터 복도 (회색 석재벽 · 직원 사진 벽돌벽 · 폰부스)
# =====================================================================
wall("West_Corr_SouthWall", -22.1, -11.5, -1.6, -11.5, M["stone_wall"],
     openings=[(7.0, 8.2, 2.4), (12.5, 13.7, 2.4)])
for nm, x in {"Restroom_Steel_Portal_1": -14.5, "Restroom_Steel_Portal_2": -9.0}.items():
    box(f"{nm}_Jamb_L", x - 0.62, -11.5, 0, x - 0.55, -11.3, 2.45, M["steel"])
    box(f"{nm}_Jamb_R", x + 0.55, -11.5, 0, x + 0.62, -11.3, 2.45, M["steel"])
    box(f"{nm}_Head", x - 0.62, -11.5, 2.38, x + 0.62, -11.3, 2.45, M["steel"])
    box(f"{nm}_Door", x - 0.55, -11.52, 0, x + 0.55, -11.48, 2.38, M["stone_wall"])
for i, x in enumerate([-14.5, -9.0]):  # 바깥 복도의 여자화장실 2곳
    T(f"Restroom_Sign_Women_{i + 1}", "여자화장실", x, -11.28, 2.15, 0.6, 0.1, M["text_red"], facing="N", fallback="WOMEN")
    box(f"Restroom_Women_Icon_{i + 1}", x - 0.09, -11.29, 1.45, x + 0.09, -11.27, 1.75, M["text_red"])
for i, x in enumerate([-12.2, -11.2]):
    box(f"Hall_Award_Poster_{i + 1}", x - 0.45, -11.42, 1.0, x + 0.45, -11.4, 2.0, M["photo"][i + 2])
box("Fire_Hydrant_Silver", -4.2, -11.43, 0.6, -3.4, -11.4, 1.7, M["steel"])
box("Fire_Hydrant_Red_Lamp", -3.9, -11.39, 1.75, -3.7, -11.37, 1.85, M["text_red"])
cbox("AED_Stand_7F", -5.2, -11.15, 0, 0.4, 0.3, 1.1, M["white"])
cbox("AED_Red_Header", -5.2, -11.15, 1.1, 0.4, 0.3, 0.3, M["ext_red"])
T("AED_Text", "AED", -5.2, -10.99, 1.25, 0.3, 0.12, M["white"], facing="N")
wall("West_End_Wall", -22.0, -11.5, -22.0, -8.0, M["stone_wall"], openings=[(1.2, 2.3, 2.3)])
box("West_Ivory_EmergDoor", -21.97, -10.3, 0, -21.93, -9.2, 2.3, M["panel_white"])
box("West_Door_YellowSign", -21.9, -10.0, 1.3, -21.88, -9.5, 1.4, M["phone_yellow"])
box("Fire_Blanket_RedBox", -21.92, -9.0, 1.2, -21.82, -8.6, 1.7, M["ext_red"])
ext("Corridor_Ext_West", -21.6, -11.0)
# 북쪽 벽돌벽: 직원 사진 "표정있는 목소리"
wall("West_Corr_BrickWall", -22.0, -8.0, -2.2, -8.0, M["brick_gray"],
     openings=[(10.3, 11.5, 2.4)])  # 복사기 통로로 들어가는 철제 유리문 자리 (x -11.7 ~ -10.5)
box("Passage_Steel_Frame_L", -11.78, -8.1, 0, -11.7, -7.9, 2.48, M["steel"])
box("Passage_Steel_Frame_R", -10.5, -8.1, 0, -10.42, -7.9, 2.48, M["steel"])
box("Passage_Steel_Frame_Top", -11.78, -8.1, 2.4, -10.42, -7.9, 2.48, M["steel"])
box("Passage_Glass_Door", -11.7, -8.03, 0, -10.5, -7.97, 2.4, M["glass"])  # 문(통과 가능)
exit_sign("Passage_Exit_Sign", -11.1, -7.88, 2.58, "N")
for i, x in enumerate([-19.5, -17.5, -15.5, -13.5, -8.5, -7.0, -5.5, -4.0]):
    box(f"Staff_Photo_Frame_{i + 1}", x - 0.48, -8.11, 1.22, x + 0.48, -8.08, 1.87, M["black"])
    box(f"Staff_Photo_{i + 1}", x - 0.42, -8.13, 1.27, x + 0.42, -8.11, 1.82, M["photo"][i % 8])
T("Voice_Wall_Title", "표정있는 목소리", -15.5, -8.13, 2.25, 2.4, 0.26, M["text_dark"], facing="S", fallback="VOICE WITH A SMILE")
# 서쪽 복도로 가는 철문
# 폰부스 (노란 PHONE BOOTH 유리문)
box("PhoneBooth_Box_W", -2.2, -8.9, 0, -2.12, -7.9, 2.8, M["stone_wall"])
box("PhoneBooth_Box_E", -1.18, -8.9, 0, -1.1, -7.9, 2.8, M["stone_wall"])
box("PhoneBooth_Box_Top", -2.2, -8.9, 2.6, -1.1, -7.9, 2.8, M["stone_wall"])
box("PhoneBooth_Yellow_Banner", -2.12, -8.88, 0.1, -1.95, -8.84, 2.55, M["phone_yellow"])
box("PhoneBooth_Glass", -1.95, -8.88, 0.1, -1.18, -8.84, 2.55, M["frosted"])
_pb = T("PhoneBooth_Text", "PHONE BOOTH", -2.035, -8.9, 1.3, 1.6, 0.12, M["text_dark"], facing="S")
_pb.rotation_mode = "ZXY"  # 세로로 위→아래 읽히게
_pb.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
cbox("PhoneBooth_Stool", -1.65, -8.3, 0, 0.35, 0.35, 0.45, M["wood_light"])
cbox("Sanitizer_Stand", -0.85, -8.5, 0, 0.12, 0.12, 1.25, M["white"])

# =====================================================================
#  3) 메인 출입문 (LG U+ 유리문) + 나무 루버 복도
# =====================================================================
wall("Main_Portal_Wall", -1.1, -8.0, 1.7, -8.0, M["charcoal"], openings=[(0.5, 2.3, 2.5)])
box("Main_LGU_Door_L", -0.6, -8.03, 0, 0.3, -7.97, 2.5, M["glass"])
box("Main_LGU_Door_R", 0.3, -8.03, 0, 1.2, -7.97, 2.5, M["glass"])
T("Main_Door_Logo_L", "LG U+", -0.15, -8.06, 1.45, 0.45, 0.12, M["text_red"], facing="S")
T("Main_Door_Logo_R", "LG U+", 0.75, -8.06, 1.45, 0.45, 0.12, M["text_red"], facing="S")
box("Main_Door_Yellow_Post", -1.1, -8.12, 0, -0.95, -8.06, 2.5, M["phone_yellow"])
for i in range(14):  # 나무 루버 천장 (게임에서는 숨김)
    y = -7.6 + i * 1.6
    box(f"Ceiling_Wood_Louver_{i + 1}", -1.1, y, 3.0, 1.7, y + 0.12, 3.12, M["wood_light"])
box("Ceiling_Black_Back", -1.1, -8.0, 3.12, 1.7, 15.0, 3.15, M["black"])

# --- 복도 동쪽 벽: REST BAR 창 → 입구 → TV 벽 → 라운지 유리문 → 기하학 유리벽
box("Corr_East_Wood_S", 1.62, -8.0, 0, 1.78, -7.3, 3.2, M["wood_panel"])
box("RestBar_Low_Wall", 1.62, -7.3, 0, 1.78, -3.0, 0.9, M["wood_panel"])
box("RestBar_Window", 1.68, -7.3, 0.9, 1.72, -3.0, 2.4, M["glass"])
box("RestBar_Window_Head", 1.62, -7.3, 2.4, 1.78, -3.0, 3.2, M["wood_panel"])
box("RestBar_Entry_Head", 1.62, -3.0, 2.4, 1.78, -1.7, 3.2, M["wood_panel"])
T("RestBar_Sign", "REST BAR", 1.55, -2.35, 2.65, 1.0, 0.2, M["text_dark"], facing="W")
T("Window_Gamdong_Banner", "감동을 전하는 7층", 1.65, -5.1, 2.0, 2.2, 0.22, M["text_red"], facing="W", fallback="WOW 7F")
box("Corr_East_Wood_Mid", 1.62, -1.7, 0, 1.78, -1.3, 3.2, M["wood_panel"])
box("TV_Wood_Wall", 1.62, -1.3, 0, 1.78, 0.5, 3.2, M["wood_panel"])
tv("Clova_TV", 1.62, -0.4, 1.25, 1.3, 0.75, "W")
T("Clova_TV_Text", "LG U+ | NAVER Clova", 1.53, -0.4, 1.62, 1.0, 0.1, M["white"], facing="W")
cbox("TV_Shelf_Frame", 1.42, -0.4, 0, 0.3, 0.8, 0.85, M["black"])
cbox("TV_Shelf_Board_1", 1.42, -0.4, 0.4, 0.3, 0.78, 0.03, M["white"])
cbox("TV_Shelf_Board_2", 1.42, -0.4, 0.82, 0.3, 0.78, 0.03, M["white"])
dracaena("TV_Dracaena_N", 1.4, 0.25, 1.75)
dracaena("TV_Dracaena_S", 1.4, -1.05, 1.6)
box("Lounge_Frosted_Door", 1.68, 0.5, 0, 1.72, 1.5, 2.4, M["frosted"])
box("Lounge_Door_Head", 1.62, 0.5, 2.4, 1.78, 1.5, 3.2, M["wood_panel"])
box("Geometric_Glass_Wall", 1.67, 1.5, 0, 1.73, 8.4, 2.9, M["frosted"])
for i, y in enumerate([2.9, 4.6, 6.3, 8.0]):
    box(f"Geometric_Glass_Mullion_{i + 1}", 1.64, y - 0.03, 0, 1.76, y + 0.03, 2.9, M["frame_black"])
box("Corr_East_Wood_N", 1.62, 8.4, 0, 1.78, 15.0, 3.2, M["wood_panel"])
ext("Corridor_Ext_1", 1.45, -7.6)
# 북쪽 끝 출입문
wall("North_Portal_Wall", -1.1, 15.0, 1.7, 15.0, M["charcoal"], openings=[(0.9, 1.9, 2.4)])
box("North_LGU_SingleDoor", -0.2, 14.97, 0, 0.8, 15.03, 2.4, M["glass"])

# =====================================================================
#  4) REST BAR (탕비실 · 창가 바 · 하이테이블)
# =====================================================================
wall("RestBar_South_Wall", 1.7, -7.5, 6.7, -7.5, M["wall_white"])
wall("RestBar_East_Wall", 6.7, -7.5, 6.7, -1.5, M["wall_white"])
box("RestBar_Wood_Blind", 6.58, -7.2, 0.95, 6.62, -2.0, 2.8, M["blind"])
wall("RestBar_Lounge_Wall", 1.7, -1.5, 6.7, -1.5, M["wall_white"])
# 창가 바 + 다육이 + 드림캐처 + 펜던트 조명
box("RestBar_Window_Bar", 1.8, -7.0, 0.88, 2.4, -3.2, 0.93, M["wood_light"])
for i, y in enumerate([-6.6, -5.9, -5.2, -4.5, -3.8]):
    cyl(f"Succulent_Pot_{i + 1}", 1.95, y, 0.93, 0.05, 0.07, M["pot"], 10)
    leaf_ball(f"Succulent_{i + 1}", 1.95, y, 1.04, 0.06, M["succulent"])
cyl("Dreamcatcher_Ring", 1.85, -6.2, 1.9, 0.14, 0.01, M["wood_light"], 16).rotation_euler = (0, math.pi / 2, 0)
for i, y in enumerate([-6.2, -5.4, -4.6, -3.8]):
    stool(f"Bar_Stool_W_{i + 1}", 2.65, y)
for i, y in enumerate([-5.7, -4.3, -3.1]):
    cyl(f"Pendant_Cord_{i + 1}", 2.2, y, 2.2, 0.006, 0.8, M["black"], 6)
    cyl(f"Pendant_Amber_{i + 1}", 2.2, y, 1.85, 0.16, 0.35, M["amber"], 16, r2=0.03)
# 하이테이블 + 스툴
cbox("RestBar_High_Table_Top", 4.6, -5.5, 0.98, 2.4, 0.6, 0.05, M["wood_light"])
cbox("RestBar_High_Table_Leg_W", 3.6, -5.5, 0, 0.08, 0.5, 0.98, M["black"])
cbox("RestBar_High_Table_Leg_E", 5.6, -5.5, 0, 0.08, 0.5, 0.98, M["black"])
for i, x in enumerate([3.8, 4.6, 5.4]):
    stool(f"High_Stool_S_{i + 1}", x, -6.15)
    stool(f"High_Stool_N_{i + 1}", x, -4.85)
# 탕비 라인 (북쪽 벽, 남쪽을 바라봄)
cbox("RestBar_Steel_Fridge", 6.3, -7.1, 0, 0.68, 0.7, 1.85, M["steel"])  # 입구 확보 위해 남동쪽 구석
cbox("RestBar_White_Fridge", 3.25, -1.92, 0, 0.7, 0.68, 1.8, M["white"])
cbox("RestBar_Tall_Cabinet", 4.1, -1.85, 0, 0.8, 0.6, 2.4, M["white"])
for i, z in enumerate([0.9, 1.45]):
    cbox(f"Water_Dispenser_{i + 1}", 4.1, -2.17, z, 0.34, 0.06, 0.4, M["steel"])
cbox("RestBar_3Bin_LowerCab", 5.5, -1.85, 0, 1.8, 0.6, 0.88, M["white"])
cbox("RestBar_Counter_Top", 5.5, -1.85, 0.88, 1.84, 0.62, 0.04, M["wood_light"])
box("RestBar_Orange_Back", 4.6, -1.6, 0.92, 5.6, -1.56, 1.75, M["orange_back"])
box("RestBar_Pink_Back", 5.6, -1.6, 0.92, 6.4, -1.56, 1.75, M["pink_back"])
cbox("RestBar_Upper_WhiteCab", 5.5, -1.75, 1.8, 1.8, 0.35, 0.7, M["white"])
cbox("Microwave", 5.0, -1.8, 0.92, 0.48, 0.36, 0.28, M["black"])
cbox("Coffee_Machine", 6.0, -1.8, 0.92, 0.3, 0.36, 0.42, M["steel"])
for i, (x, m, lab) in enumerate([(3.2, M["text_dark"], "일반"), (3.7, M["blue_box"], "재활용")]):
    cbox(f"Trash_Bin_{i + 1}", x, -7.2, 0, 0.4, 0.4, 0.7, m)
T("Trash_Label_1", "일반쓰레기", 3.2, -6.99, 0.55, 0.36, 0.06, M["white"], facing="N", fallback="TRASH")
T("Trash_Label_2", "재활용", 3.7, -6.99, 0.55, 0.3, 0.06, M["white"], facing="N", fallback="RECYCLE")
dracaena("RestBar_Corner_Plant", 6.35, -3.6, 1.6)

# =====================================================================
#  5) 휴게 라운지 (블라인드 창가 벤치 · 오토만 · 벽돌 가든)
# =====================================================================
wall("Lounge_East_Wall", 6.7, -1.5, 6.7, 8.4, M["wall_white"])
box("Lounge7F_Brown_Blind", 6.58, -0.9, 1.1, 6.62, 8.1, 2.9, M["blind"])
wall("Lounge_North_Wall", 1.7, 8.4, 6.7, 8.4, M["brick_red"])
box("Window_Bench_Base", 5.8, -0.8, 0, 6.6, 6.8, 0.4, M["cushion_gray"])
box("Window_Bench_Yellow", 5.85, 0.4, 0.4, 6.55, 2.6, 0.5, M["yellow_cush"])
box("Window_Bench_Gray", 5.85, 3.2, 0.4, 6.55, 5.6, 0.5, M["gray_pouf"])
box("Window_Red_Heart", 6.5, 1.8, 0.5, 6.58, 2.2, 0.85, M["red_pouf"])
cbox("Pouf_Block_Gray1", 4.45, 2.25, 0, 1.1, 1.1, 0.4, M["gray_pouf"])
cbox("Pouf_Block_Red2", 2.5, 2.8, 0, 0.8, 1.2, 0.4, M["red_pouf"])
cbox("Pouf_Block_Gray2", 2.5, 4.45, 0, 0.8, 1.5, 0.4, M["gray_pouf"])
cbox("Pouf_Block_Red1", 4.8, 4.2, 0, 1.0, 1.0, 0.4, M["red_pouf"])
cbox("Pouf_White_1", 3.6, 0.3, 0, 0.6, 0.6, 0.4, M["white"])
# 벽돌 가든 (화분 + 하얀 의자 + 호두까기 쿠션 + 파란 상자)
for i, x in enumerate([2.2, 3.0, 3.8, 4.6, 5.4, 6.2]):
    cbox(f"Garden_Planter_{i + 1}", x, 8.15, 0, 0.6, 0.35, 0.5, M["brick_red"])
    leaf_ball(f"Garden_Green_{i + 1}", x, 8.15, 0.75, 0.3, M["plant"] if i % 2 else M["green_dark"])
for i, x in enumerate([2.9, 4.1]):
    chair(f"Garden_White_Chair_{i + 1}", x, 7.3, M["white"])
    cbox(f"Nutcracker_Pillow_{i + 1}", x, 7.45, 0.47, 0.32, 0.12, 0.3, M["text_red"])
cbox("Lounge_Blue_Box", 5.3, 7.3, 0, 0.45, 0.45, 0.45, M["blue_box"])
T("Lounge_Sign", "쉼터", 4.2, 8.31, 2.3, 0.9, 0.3, M["white"], facing="S", fallback="LOUNGE")

# =====================================================================
#  6) 상담실 (64석 · 청회색 파티션 · 플랜터 · 철제 선반 · 라임 기둥)
# =====================================================================
POD_X = [-17.0, -12.4, -7.8, -3.2]
POD_Y = [-2.6, 1.8, 6.2, 10.6]  # 남쪽 회의실 줄 때문에 북쪽으로 1.6m
n = 0
for py in POD_Y:
    for px in POD_X:
        n += 1
        p = f"Pod_{n:02d}"
        box(f"{p}_Part_X", px - 1.55, py - 0.03, 0, px + 1.55, py + 0.03, 1.2, M["fabric_blue"])
        box(f"{p}_WhiteTrim_X", px - 1.55, py - 0.04, 1.2, px + 1.55, py + 0.04, 1.23, M["white"])
        box(f"{p}_Part_Y", px - 0.03, py - 0.68, 0, px + 0.03, py + 0.68, 1.2, M["fabric_blue"])
        box(f"{p}_WhiteTrim_Y", px - 0.04, py - 0.68, 1.2, px + 0.04, py + 0.68, 1.23, M["white"])
        for sx in (-1, 1):  # 끝 파티션 (통로 쪽)
            box(f"{p}_End_{'E' if sx > 0 else 'W'}", px + sx * 1.55 - 0.03, py - 0.68, 0,
                px + sx * 1.55 + 0.03, py + 0.68, 1.05, M["fabric_blue"])
        pothos(f"{p}_Top_Plant", px, py, 1.23, 0.9)
        for sx in (-1, 1):
            for sy in (-1, 1):
                k = f"{p}_{'E' if sx > 0 else 'W'}{'N' if sy > 0 else 'S'}"
                dx, dy = px + sx * 0.78, py + sy * 0.36
                cbox(f"{k}_Desk_Top", dx, dy, 0.7, 1.42, 0.62, 0.035, M["desk_white"])
                cbox(f"{k}_Mobile_Pedestal", px + sx * 1.25, dy, 0, 0.4, 0.55, 0.62, M["white"])
                cbox(f"{k}_Mon_L", dx - 0.24, py + sy * 0.12, 0.78, 0.46, 0.03, 0.3, M["black"])
                cbox(f"{k}_Mon_R", dx + 0.24, py + sy * 0.12, 0.78, 0.46, 0.03, 0.3, M["black"])
                cbox(f"{k}_Blue_Desk_Pad", dx, dy + sy * 0.08, 0.735, 0.6, 0.28, 0.005, M["ksqi_blue"])
                office_chair(f"{k}_Chair", dx, py + sy * 1.0, -sy)
                box(f"{k}_Nameplate", dx - 0.15, py + sy * 0.045, 1.0, dx + 0.15, py + sy * 0.05, 1.1, M["white"])
        if n % 3 == 1:
            cbox(f"{p}_Pink_Umbrella", px + 1.45, py + 0.55, 0.2, 0.08, 0.08, 0.55, M["umbrella"])

# 철제 프레임 선반 (화분 + 나무 선반) — 기존 자리
DIV_X = [-14.7, -10.1, -5.5]
DIV_Y = [-0.4, 4.0, 8.4, 12.8]
for j, dy in enumerate(DIV_Y):
    for i, dx in enumerate(DIV_X):
        d = f"TallDiv_{j}_{i}"
        for k, ox in enumerate((-1.1, 0.0, 1.1)):
            cbox(f"{d}_Post_{k}", dx + ox, dy, 0, 0.06, 0.06, 2.16, M["frame_black"])
        box(f"{d}_TopBar", dx - 1.13, dy - 0.03, 2.1, dx + 1.13, dy + 0.03, 2.16, M["frame_black"])
        box(f"{d}_TopMesh", dx - 1.1, dy - 0.01, 1.7, dx + 1.1, dy + 0.01, 2.1, M["mesh_black"])
        box(f"{d}_BlackBase", dx - 1.1, dy - 0.15, 0.08, dx + 1.1, dy + 0.15, 0.4, M["frame_black"])
        box(f"{d}_WoodTrough", dx - 1.1, dy - 0.16, 0.4, dx + 1.1, dy + 0.16, 0.75, M["wood_light"])
        box(f"{d}_FabricMid", dx - 1.1, dy - 0.02, 0.75, dx + 1.1, dy + 0.02, 1.0, M["fabric_blue"])
        box(f"{d}_FlatShelf", dx - 1.1, dy - 0.16, 1.0, dx + 1.1, dy + 0.16, 1.03, M["wood_light"])
        box(f"{d}_OpenFrame_T", dx - 0.5, dy - 0.16, 1.4, dx + 0.5, dy + 0.16, 1.43, M["wood_light"])
        for k, ox in enumerate((-0.75, -0.25, 0.25, 0.75)):
            pothos(f"{d}_Pot_{k}", dx + ox, dy, 1.03 if k % 2 else 0.75, 1.0)

# 기둥 (나무 + 라임 측면 + 노란 에티켓 보드 + 화재경보기 + 소화기)
for j, py in enumerate([0.2, 6.8]):
    for i, px in enumerate(DIV_X):
        c = f"Pillar_{j}_{i}"
        cbox(f"{c}_Wood_Core", px, py, 0, 0.62, 0.78, 3.1, M["wood_panel"])
        cbox(f"{c}_Lime_W", px - 0.33, py, 0, 0.05, 0.78, 3.1, M["lime_green"])
        cbox(f"{c}_Lime_E", px + 0.33, py, 0, 0.05, 0.78, 3.1, M["lime_green"])
        box(f"{c}_Yellow_Etiquette_Board", px - 0.22, py + 0.39, 1.0, px + 0.22, py + 0.41, 1.9, M["phone_yellow"])
        T(f"{c}_Etiquette_Text", "모두 행복", px, py + 0.42, 1.75, 0.38, 0.09, M["text_dark"], facing="N", fallback="SMILE")
        box(f"{c}_Fire_Alarm", px - 0.22, py + 0.39, 1.3, px - 0.12, py + 0.41, 1.6, M["ext_red"])
        ext(f"{c}_Ext", px, py + 0.58)
# 하얀 2단 수납장
for i, x in enumerate([-11.95, -7.35]):
    cbox(f"White_2Door_Cabinet_{i + 1}", x, 4.0, 0, 0.85, 0.46, 0.96, M["white"])
# 북쪽: 창 + 롤 블라인드 + 낮은 수납장 + 공기청정기
wall("North_Window_Wall", -18.8, 15.8, -0.8, 15.8, M["wall_white"])
wall("Counsel_West_Wall", -18.8, -7.9, -18.8, 15.8, M["wall_white"])
box("North_Roller_Blind", -18.6, 15.68, 0.9, -0.9, 15.72, 2.9, M["roller"])
box("North_Low_WoodCab", -18.5, 15.1, 0, -1.0, 15.6, 0.7, M["wood_light"])
for i, x in enumerate([-13.5, -6.5]):
    cbox(f"North_White_2Door_Cab_{i + 1}", x, 14.6, 0, 1.05, 0.5, 1.1, M["white"])
    cyl(f"Air_Purifier_{i + 1}", x + 1.0, 14.6, 0, 0.18, 0.72, M["white"], 20)
    cyl(f"Air_Purifier_Top_{i + 1}", x + 1.0, 14.6, 0.72, 0.13, 0.03, M["ksqi_blue"], 20)
box("IdeaRoom_Glass_Wall", -7.3, 14.78, 0, -1.1, 14.82, 2.9, M["glass"])
T("Decal_Uplus_5G", "U+5G", -3.5, 14.76, 1.55, 1.0, 0.3, M["magenta"], facing="S")
T("North_Banner", "고객의 마음까지 상담합니다", -9.0, 15.66, 2.6, 5.0, 0.32, M["text_navy"], facing="S", fallback="EMPATHY CENTER")
# 복도 쪽 낮은 칸막이 (화분 레일 · 철제 프레임)
for i, ly in enumerate([-2.6, 1.8, 6.2, 10.6, 13.6]):
    l = f"LowDiv_{i + 1}"
    box(f"{l}_Frame", -1.18, ly - 1.1, 0, -1.12, ly + 1.1, 1.32, M["frame_black"])
    box(f"{l}_BotMesh", -1.2, ly - 1.08, 0.08, -1.1, ly + 1.08, 0.6, M["mesh_black"])
    box(f"{l}_MidFabric", -1.18, ly - 1.08, 0.6, -1.12, ly + 1.08, 1.2, M["fabric_blue"])
    box(f"{l}_TopWoodShelf", -1.32, ly - 1.1, 1.24, -0.98, ly + 1.1, 1.3, M["wood_light"])
    for k, oy in enumerate((-0.7, 0.0, 0.7)):
        pothos(f"{l}_Pothos_{k}", -1.15, ly + oy, 1.3, 0.9)

# =====================================================================
#  7) 남쪽 회의실 줄 (상담석 입구 쪽) + 가운데 복사기 통로 → 바깥 복도
# =====================================================================
MY0, MY1 = -7.9, -5.3  # 회의실 뒷벽 · 앞 유리벽
box("Meeting_Back_Panel_W", -18.8, -7.93, 0, -12.4, -7.9, 3.0, M["panel_white"])
box("Meeting_Back_Panel_E", -9.8, -7.93, 0, -1.15, -7.9, 3.0, M["panel_white"])
wall("Meeting_East_End_Wall", -1.15, MY0, -1.15, MY1, M["wood_panel"])
ROOMS = [(-18.8, -15.6), (-15.6, -12.4), (-9.8, -6.9), (-6.9, -4.0), (-4.0, -1.15)]
for r, (x1, x2) in enumerate(ROOMS):
    m = f"Meeting_{r + 1}"
    W, cx, cy = x2 - x1, (x1 + x2) / 2, (MY0 + MY1) / 2
    if r not in (1, 4):  # 방과 방 사이 칸막이
        wall(f"{m}_Side_Wall", x2, MY0, x2, MY1, M["panel_white"], h=2.9, t=0.1)
    dx1, dx2 = x2 - 1.15, x2 - 0.15  # 유리문 (동쪽 끝)
    box(f"{m}_Front_Glass_W", x1, MY1 - 0.03, 0, dx1, MY1 + 0.03, 2.9, M["frosted"])
    box(f"{m}_Front_Glass_E", dx2, MY1 - 0.03, 0, x2, MY1 + 0.03, 2.9, M["frosted"])
    box(f"{m}_Glass_Door", dx1, MY1 - 0.02, 0, dx2, MY1 + 0.02, 2.4, M["glass"])  # 문(통과 가능)
    box(f"{m}_Door_Head", dx1, MY1 - 0.03, 2.4, dx2, MY1 + 0.03, 2.9, M["frosted"])
    for k, xx in enumerate((x1 + 0.03, dx1, dx2)):
        box(f"{m}_Mullion_{k + 1}", xx - 0.03, MY1 - 0.05, 0, xx + 0.03, MY1 + 0.05, 2.9, M["frame_black"])
    box(f"{m}_Frost_Band", x1 + 0.1, MY1 + 0.035, 1.0, dx1 - 0.05, MY1 + 0.04, 1.5, M["white"])
    T(f"{m}_Sign", f"회의실 {r + 1}", (dx1 + dx2) / 2, MY1 + 0.06, 2.62, 0.7, 0.13, M["text_dark"],
      facing="N", fallback=f"MEETING {r + 1}")
    # 프로젝터 스크린 (서쪽 벽) · 흰 테이블 · 메시 의자 4개
    box(f"{m}_Projector_Screen", x1 + 0.08, cy - 0.8, 0.95, x1 + 0.1, cy + 0.8, 2.3, M["screen_proj"])
    tx = cx - 0.25
    cbox(f"{m}_White_Table", tx, cy, 0.72, 1.4, 0.8, 0.04, M["desk_white"])
    cbox(f"{m}_Table_Leg", tx, cy, 0, 0.9, 0.08, 0.72, M["steel"])
    for k, ox in enumerate((-0.35, 0.35)):
        office_chair(f"{m}_Chair_S_{k + 1}", tx + ox, cy - 0.68, 1)
        office_chair(f"{m}_Chair_N_{k + 1}", tx + ox, cy + 0.68, -1)
    cyl(f"{m}_Clock", cx, MY0 + 0.05, 2.3, 0.15, 0.03, M["white"], 20).rotation_euler = (math.pi / 2, 0, 0)
# 복사기 통로 (x -12.4 ~ -9.8): 서쪽에 복합기 2대, 동쪽에 수납장·주황 벽면·쓰레기통
wall("Passage_West_Wall", -12.4, -8.0, -12.4, MY1, M["panel_white"])
wall("Passage_East_Wall", -9.8, -8.0, -9.8, MY1, M["panel_white"])
for i, y in enumerate([-7.35, -6.45]):
    cbox(f"Passage_Copier_{i + 1}", -12.0, y, 0, 0.6, 0.65, 1.15, M["white"])
    cbox(f"Passage_Copier_Panel_{i + 1}", -11.78, y, 1.15, 0.18, 0.35, 0.08, M["text_dark"])
cbox("Passage_White_Cab", -10.12, -6.4, 0, 0.5, 1.6, 0.9, M["white"])
cbox("Passage_Counter_Top", -10.12, -6.4, 0.9, 0.52, 1.62, 0.04, M["desk_white"])
box("Passage_Orange_Back", -9.89, -7.1, 0.94, -9.86, -5.7, 1.8, M["orange_back"])
cbox("Passage_Upper_Cab", -10.0, -6.4, 1.85, 0.32, 1.6, 0.7, M["white"])
for i, (y, m, lab) in enumerate([(-7.6, M["text_dark"], "일반쓰레기"), (-7.15, M["blue_box"], "재활용")]):
    cbox(f"Passage_Trash_Bin_{i + 1}", -10.1, y, 0, 0.4, 0.4, 0.7, m)
    T(f"Passage_Trash_Label_{i + 1}", lab, -10.31, y, 0.55, 0.32, 0.06, M["white"], facing="W", fallback="TRASH")
box("Passage_Yellow_Poster", -12.32, -5.95, 1.0, -12.3, -5.45, 1.9, M["phone_yellow"])
ext("Passage_Ext", -12.15, -5.55)
# 회의실 앞 나무 루버 천장 (게임에서는 숨김)
for i in range(11):
    x = -18.6 + i * 1.6
    box(f"Ceiling_Meeting_Louver_{i + 1}", x, -5.3, 3.0, x + 0.12, -3.8, 3.12, M["wood_light"])

# =====================================================================
#  천장 (게임에서는 숨김)
# =====================================================================
box("Ceiling_Office", -18.8, -3.8, 3.2, -1.1, 16.0, 3.25, M["white"])
box("Ceiling_Hall_BlackGrid", -22.1, -13.6, 3.2, 4.4, -8.0, 3.25, M["black"])
box("Ceiling_RestBar", 1.7, -7.5, 3.2, 6.7, 8.4, 3.25, M["white"])

# =====================================================================
#  마무리: 내보내기
# =====================================================================
bpy.context.view_layer.update()
print(f"[7F v2] 오브젝트 {len(col.objects)}개 생성 완료")
if EXPORT_PATH:
    export_dir = os.path.dirname(EXPORT_PATH)
    if os.path.isdir(export_dir):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.export_scene.gltf(filepath=EXPORT_PATH, export_format="GLB", use_selection=False,
                                  export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
        print(f"[7F v2] 내보내기 완료 → {EXPORT_PATH}")
    else:
        print(f"[7F v2] 내보내기 폴더가 없어 건너뜀: {export_dir}  (EXPORT_PATH 를 고쳐 주세요)")
