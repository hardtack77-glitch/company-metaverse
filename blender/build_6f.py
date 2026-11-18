# =====================================================================
#  LG U+ 대구고객센터 6층 (CS1그룹 사무실) — 영상 기반
#  기존 floor_6f.glb 의 구역 위치는 유지하고, 영상의 디테일을 입힘
#  사용법: 블렌더 5.x → Scripting 탭 → 이 파일 열기 → Run Script
#  좌표: 1 = 1m, 바닥 윗면 Z=0, 이름에 Door 가 있으면 통과 가능, Ceiling_ 은 게임에서 숨김
# =====================================================================
import bpy
import bmesh
import math
import os

FLOOR_NO = 6
EXPORT_PATH = r"C:\Users\User\company-metaverse\client\public\floor_6f.glb"
EXPORT_PATH = os.environ.get("FLOOR_EXPORT", EXPORT_PATH)  # (테스트용 경로 덮어쓰기)
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

col = bpy.data.collections.get(f"Floor_{FLOOR_NO}F") or bpy.data.collections.new(f"Floor_{FLOOR_NO}F")
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

M.update({
    "purple": mat("Purple_Banner", hexrgb("6b2a8c"), 0.5),
    "carpet": mat("Carpet_Gray", hexrgb("6e6f73"), 0.95),
    "teal_seat": mat("Chair_Teal", hexrgb("4f8f98"), 0.6),
    "brown_seat": mat("Chair_Brown", hexrgb("8a5a44"), 0.7),
    "beige_stone": mat("Stone_Beige_Wall", hexrgb("cfc8bb"), 0.5),
    "water_blue": mat("Water_Bottle_Blue", hexrgb("8fc4e8"), 0.1, alpha=0.7),
})


def office_chair_x(name, x, y, face_x):
    """x 방향을 바라보는 메시 의자 (face_x=+1 → 동쪽 책상을 봄)"""
    cyl(f"{name}_Base", x, y, 0, 0.26, 0.42, M["black"], 10, r2=0.04)
    cbox(f"{name}_Seat", x, y, 0.42, 0.46, 0.48, 0.07, M["mesh_black"])
    cbox(f"{name}_Back", x - face_x * 0.24, y, 0.49, 0.05, 0.44, 0.55, M["mesh_black"])


def pod(name, cx, cy):
    """4인 상담석 (가운데 십자 칸막이, 마주 보는 책상, 의자는 바깥쪽)"""
    box(f"{name}_Part_X", cx - 1.5, cy - 0.03, 0, cx + 1.5, cy + 0.03, 1.2, M["fabric_blue"])
    box(f"{name}_Trim_X", cx - 1.5, cy - 0.04, 1.2, cx + 1.5, cy + 0.04, 1.23, M["white"])
    box(f"{name}_Part_Y", cx - 0.03, cy - 0.66, 0, cx + 0.03, cy + 0.66, 1.2, M["fabric_blue"])
    pothos(f"{name}_Top_Plant", cx, cy, 1.23, 0.9)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k = f"{name}_{'E' if sx > 0 else 'W'}{'N' if sy > 0 else 'S'}"
            dx, dy = cx + sx * 0.76, cy + sy * 0.35
            cbox(f"{k}_Desk", dx, dy, 0.7, 1.4, 0.64, 0.035, M["desk_white"])
            cbox(f"{k}_Pedestal", cx + sx * 1.22, dy, 0, 0.42, 0.55, 0.62, M["white"])
            cbox(f"{k}_Mon_L", dx - 0.24, cy + sy * 0.12, 0.78, 0.46, 0.03, 0.3, M["black"])
            cbox(f"{k}_Mon_R", dx + 0.24, cy + sy * 0.12, 0.78, 0.46, 0.03, 0.3, M["black"])
            office_chair(f"{k}_Chair", dx, cy + sy * 1.0, -sy)


def line_ns(name, sx, y0, nseat, skip=(), south_end="plain"):
    """남북(세로)으로 긴 상담석 줄: 가운데 칸막이를 두고 서·동 양쪽이 마주 봄
    skip = {("E", k), ...} 빼는 자리, south_end = "planter"(화분 칸막이) / "plain" / None"""
    P = 1.3
    y1 = y0 + nseat * P
    box(f"{name}_Spine", sx - 0.03, y0, 0, sx + 0.03, y1, 1.2, M["fabric_blue"])
    box(f"{name}_Spine_Trim", sx - 0.04, y0, 1.2, sx + 0.04, y1, 1.23, M["white"])
    for k in range(nseat + 1):
        yy = y0 + k * P
        box(f"{name}_Side_{k}", sx - 0.7, yy - 0.025, 0, sx + 0.7, yy + 0.025, 1.1, M["fabric_blue"])
    for side, sg in (("W", -1), ("E", 1)):
        for k in range(nseat):
            if (side, k) in skip:
                continue
            q = f"{name}_{side}{k + 1}"
            cy = y0 + (k + 0.5) * P
            cbox(f"{q}_Desk", sx + sg * 0.36, cy, 0.7, 0.66, 1.2, 0.035, M["desk_white"])
            cbox(f"{q}_Pedestal", sx + sg * 0.33, cy + 0.36, 0, 0.55, 0.4, 0.62, M["white"])
            cbox(f"{q}_Mon_L", sx + sg * 0.14, cy - 0.24, 0.78, 0.03, 0.46, 0.3, M["black"])
            cbox(f"{q}_Mon_R", sx + sg * 0.14, cy + 0.24, 0.78, 0.03, 0.46, 0.3, M["black"])
            office_chair_x(f"{q}_Chair", sx + sg * 1.05, cy, -sg)
    for k in range(0, nseat, 2):
        pothos(f"{name}_Top_Plant_{k}", sx, y0 + (k + 0.5) * P, 1.23, 0.85)
    ex0, ex1 = sx - 1.35, sx + 1.35
    if south_end == "planter":  # 철제 프레임 + 메시 + 회색 패브릭 + 나무 화분함
        e = f"{name}_AisleEnd"
        for k, xx in enumerate((ex0, sx - 0.03, ex1 - 0.06)):
            box(f"{e}_Frame_{k}", xx, y0 - 0.05, 0, xx + 0.06, y0 + 0.05, 1.28, M["frame_black"])
        box(f"{e}_Mesh", ex0 + 0.06, y0 - 0.02, 0.06, ex1 - 0.06, y0 + 0.02, 0.62, M["mesh_black"])
        box(f"{e}_Fabric", ex0 + 0.06, y0 - 0.03, 0.62, ex1 - 0.06, y0 + 0.03, 1.22, M["cushion_gray"])
        box(f"{e}_Wood_Top", ex0 - 0.03, y0 - 0.12, 1.28, ex1 + 0.03, y0 + 0.12, 1.32, M["wood_light"])
        for k, bx in enumerate((ex0 + 0.2, sx + 0.2)):
            box(f"{e}_Planter_{k}", bx, y0 - 0.3, 0.62, bx + 0.6, y0 - 0.05, 0.92, M["wood_light"])
            leaf_ball(f"{e}_Planter_Leaves_{k}", bx + 0.3, y0 - 0.18, 1.02, 0.2, M["plant"])
    elif south_end == "plain":
        box(f"{name}_South_End", ex0, y0 - 0.03, 0, ex1, y0 + 0.03, 1.15, M["fabric_blue"])
    return y1


def leader_desk(name, x, y, face_south=True):
    """가로로 놓인 팀장석 (face_south: 남쪽 팀원 쪽을 바라봄)"""
    d = -1 if face_south else 1
    cbox(f"{name}_Desk", x, y, 0.7, 1.4, 0.7, 0.035, M["desk_white"])
    cbox(f"{name}_Panel", x, y + d * 0.32, 0, 1.4, 0.04, 0.7, M["white"])
    cbox(f"{name}_Pedestal", x + 0.45, y, 0, 0.42, 0.55, 0.62, M["white"])
    cbox(f"{name}_Mon_L", x - 0.22, y + d * 0.18, 0.74, 0.44, 0.03, 0.3, M["black"])
    cbox(f"{name}_Mon_R", x + 0.22, y + d * 0.18, 0.74, 0.44, 0.03, 0.3, M["black"])
    office_chair(f"{name}_Chair", x, y - d * 0.72, -d)


def recycle_station(name, x, y, along="x"):
    """4구 분리수거함 (일반·플라스틱·캔·종이)"""
    cols = [M["text_dark"], M["blue_box"], M["phone_yellow"], M["box"]]
    for k, c in enumerate(cols):
        dx, dy = ((k - 1.5) * 0.36, 0) if along == "x" else (0, (k - 1.5) * 0.36)
        cbox(f"{name}_Bin_{k}", x + dx, y + dy, 0, 0.34, 0.34, 0.75, c)
        cbox(f"{name}_Lid_{k}", x + dx, y + dy, 0.75, 0.34, 0.34, 0.04, M["white"])


def water_purifier(name, x, y):
    cbox(f"{name}_Body", x, y, 0, 0.34, 0.36, 1.15, M["white"])
    cbox(f"{name}_Panel", x, y - 0.185, 0.85, 0.2, 0.02, 0.18, M["text_navy"])
    cbox(f"{name}_Tray", x, y - 0.15, 0.6, 0.22, 0.1, 0.03, M["steel"])


# =====================================================================
#  0) 바닥
# =====================================================================
floor("Elev_Lobby_Floor", -2.2, -13.6, 3.2, -10.0, M["tile_light"])
floor("Corridor_Gray_Floor", -16.2, -12.0, 3.2, -8.0, M["tile_light"])
box("Elev_Front_DarkTile", 1.3, -13.4, 0, 2.75, -8.2, 0.008, M["mat_purple"])
floor("Main_Wood_Corridor", -1.4, -8.0, 1.8, 1.0, M["oak_floor"])
floor("Left_Turn_Corridor", -9.7, 0.2, -0.7, 2.9, M["oak_floor"])
floor("Pantry_Wood_Floor", -4.4, -3.6, -1.4, 0.2, M["oak_floor"])
floor("Meeting_A_Floor", -8.8, -3.6, -4.4, 0.2, M["carpet"])
floor("Sleep_Room_Floor", -16.0, -3.6, -8.8, 0.2, M["carpet"])
floor("Massage_Room_Floor", -8.4, -7.9, -1.4, -3.6, M["oak_floor"])
floor("Resource_Room_Floor", -16.0, -7.9, -8.4, -3.6, M["office_gray"])
floor("Office1_Floor", -0.7, 1.0, 7.6, 10.4, M["office_gray"])
floor("Psych_Room_Floor", 1.8, -7.95, 5.2, -4.0, M["oak_floor"])
floor("Office2_Floor", -9.6, 2.9, -0.7, 16.0, M["office_gray"])

box("Yellow_Tactile_Main", -8.3, -10.5, 0, 2.1, -10.1, 0.01, M["tape_yellow"])
box("Yellow_Tactile_Branch", 1.8, -10.2, 0, 2.1, -8.8, 0.01, M["tape_yellow"])
box("Stair_Floor_GlowLine", -0.9, -13.2, 0, -0.7, -11.6, 0.01, M["tape_green"])
box("West_Glow_Line_X", -15.8, -9.2, 0, -14.5, -9.1, 0.01, M["tape_green"])
box("Entrance_Dark_Mat", -1.2, -9.8, 0, 1.6, -8.0, 0.006, M["mat_dark"])
T("Floor_Cheer_Text", "그대의 오늘을 응원합니다", 0.2, -5.8, 0.012, 1.8, 0.2, M["white"],
  fallback="CHEER UP TODAY").rotation_euler = (0, 0, 0)
cyl("Caution_Mat_Round", -9.5, -8.55, 0, 0.85, 0.008, M["mat_dark"], 28)
cbox("Caution_Mat_Yellow", -9.5, -8.55, 0.008, 0.9, 0.35, 0.004, M["phone_yellow"])

# =====================================================================
#  1) 엘리베이터 홀 (짙은 갈색 엘리베이터 2대 · 금색 "6" · 노란 점자블록)
# =====================================================================
wall("Lobby_South_Wall", -2.3, -13.5, 2.8, -13.5, M["beige_stone"], openings=[(0.8, 2.2, 2.4)])
box("Stair_Dark_Door", -1.5, -13.43, 0, -0.1, -13.4, 2.4, M["charcoal"])
exit_sign("Stair_Exit_Sign", -0.8, -13.42, 2.55, "N")
for i, x in enumerate([0.65, 1.15, 1.65, 2.15]):
    for j, z in enumerate([1.14, 1.64]):
        box(f"Notice_Board_{i}_{j}", x - 0.21, -13.42, z, x + 0.21, -13.39, z + 0.42, M["banner_white"])
wall("Hall_West_Wall", -2.3, -13.5, -2.3, -11.5, M["beige_stone"])
wall("Elev_Wall", 2.85, -13.5, 2.85, -8.0, M["beige_stone"], t=0.12)
for nm, (y1, y2) in {"Elev_Door_Right": (-12.7, -11.3), "Elev_Door_Left": (-9.8, -8.4)}.items():
    box(f"{nm}_Frame", 2.74, y1 - 0.08, 0, 2.79, y2 + 0.08, 2.58, M["charcoal"])
    box(f"{nm}_Leaf_A", 2.7, y1, 0, 2.74, (y1 + y2) / 2 - 0.01, 2.45, M["elev_door"])
    box(f"{nm}_Leaf_B", 2.7, (y1 + y2) / 2 + 0.01, 0, 2.74, y2, 2.45, M["elev_door"])
    box(f"{nm}_Display", 2.72, (y1 + y2) / 2 - 0.15, 2.5, 2.74, (y1 + y2) / 2 + 0.15, 2.56, M["text_red"])
    box(f"{nm}_CallBtn", 2.76, y2 + 0.18, 1.0, 2.78, y2 + 0.28, 1.25, M["steel"])
T("Floor_Number_6", "6", 2.76, -10.55, 2.5, 0.22, 0.38, M["gold"], facing="W", extrude=0.02)
box("Elev_Center_Gold_Panel", 2.77, -10.95, 1.0, 2.79, -10.15, 2.2, M["bronze"])
T("Hall_Slogan", "일상을 바꿉니다", 2.75, -10.55, 1.75, 0.7, 0.1, M["white"], facing="W", fallback="CHANGE")
cyl("Orchid_Pot", 2.35, -12.9, 0, 0.18, 0.5, M["white"], 16)
for k, (dy, z) in enumerate([(0, 0.75), (0.1, 0.9), (-0.08, 0.95)]):
    leaf_ball(f"Orchid_Flower_{k}", 2.35, -12.9 + dy, z, 0.1, M["white"] if k else M["green_dark"])
ext("Hall_Extinguisher", 2.45, -10.05)
tape_square("Hall_Wait_Square_1", 1.0, -12.0, 0.45)
tape_square("Hall_Wait_Square_2", 1.0, -9.1, 0.45)
wall("Hall_North_Wall_E", 1.8, -8.0, 5.2, -8.0, M["beige_stone"])

# =====================================================================
#  2) 바깥 복도 (화장실 2곳 · 직원 사진 벽돌벽 · 폰부스 · 서쪽 출입구)
# =====================================================================
wall("Corridor_South_Wall", -16.0, -11.5, -2.3, -11.5, M["beige_stone"],
     openings=[(4.6, 5.8, 2.4), (7.6, 8.8, 2.4)])
for k, (x, lab, m) in enumerate([(-10.8, "여자화장실", M["text_red"]), (-7.8, "남자화장실", M["text_navy"])]):
    r = f"Restroom_{k + 1}"
    box(f"{r}_Recess_Floor", x - 0.6, -12.7, -0.1, x + 0.6, -11.5, 0, M["tile_light"])
    box(f"{r}_Back_Door", x - 0.55, -12.72, 0, x + 0.55, -12.68, 2.3, M["stone_wall"])
    wall(f"{r}_Side_W", x - 0.62, -12.7, x - 0.62, -11.5, M["steel"], t=0.06)
    wall(f"{r}_Side_E", x + 0.62, -12.7, x + 0.62, -11.5, M["steel"], t=0.06)
    T(f"{r}_Sign", lab, x, -11.42, 2.15, 0.6, 0.1, m, facing="N", fallback="WC")
for i, x in enumerate([-9.6, -9.0]):
    box(f"Hallway_Award_Poster_{i + 1}", x - 0.25, -11.43, 1.0, x + 0.25, -11.41, 2.0, M["text_dark"])
box("AED_Wall_Poster", -4.9, -11.43, 1.6, -4.3, -11.41, 2.1, M["banner_white"])
box("Fire_Hydrant_Cabinet", -3.8, -11.43, 0.6, -3.0, -11.4, 1.7, M["steel"])
cbox("AED_Stand_Body", -4.6, -11.15, 0, 0.4, 0.3, 1.1, M["white"])
cbox("AED_Red_Header", -4.6, -11.15, 1.1, 0.4, 0.3, 0.3, M["ext_red"])
wall("West_End_Wall", -16.0, -11.5, -16.0, -8.0, M["beige_stone"], openings=[(1.2, 2.3, 2.3)])
box("West_Ivory_Panel", -15.97, -10.3, 0, -15.93, -9.2, 2.3, M["panel_white"])
box("KSQI_Wall_Plaque", -15.92, -11.0, 1.5, -15.9, -10.5, 1.8, M["gold"])
box("Fire_Blanket_Box", -15.92, -9.0, 1.3, -15.82, -8.7, 1.7, M["ext_red"])
box("Gas_Mask_Box", -15.92, -9.0, 1.0, -15.82, -8.7, 1.3, M["steel"])
ext("West_Extinguisher", -15.65, -10.95)
# 북쪽 벽돌벽 (직원 사진 "표정있는 목소리") + 자료실 흰 문 + 서쪽 LG U+ 출입문
wall("Gray_Brick_Wall", -16.0, -8.0, -2.3, -8.0, M["brick_gray"], openings=[(0.3, 1.5, 2.4), (6.0, 7.0, 2.3)])
box("Sub_Entrance_Frame_L", -15.78, -8.1, 0, -15.7, -7.9, 2.48, M["steel"])
box("Sub_Entrance_Frame_R", -14.5, -8.1, 0, -14.42, -7.9, 2.48, M["steel"])
box("Sub_LGU_Glass_Door", -15.7, -8.03, 0, -14.5, -7.97, 2.4, M["glass"])  # 문(통과 가능)
T("Sub_LGU_Logo", "LG U+", -15.1, -8.06, 1.4, 0.4, 0.1, M["text_red"], facing="S")
box("BrickWall_White_Door", -10.0, -8.03, 0, -9.0, -7.97, 2.3, M["panel_white"])  # 자료실 문(통과 가능)
for i, x in enumerate([-13.2, -11.8, -10.6, -8.2, -6.8, -5.4, -4.0]):
    box(f"Photo_Frame_{i + 1}", x - 0.45, -8.11, 1.22, x + 0.45, -8.08, 1.87, M["black"])
    box(f"Staff_Photo_{i + 1}", x - 0.4, -8.13, 1.27, x + 0.4, -8.11, 1.82, M["photo"][i % 8])
T("Voice_Wall_Title", "표정있는 목소리", -12.0, -8.13, 2.25, 2.2, 0.24, M["text_dark"], facing="S", fallback="VOICE")
box("Wall_Alarm_Box", -3.2, -8.12, 1.3, -3.0, -8.09, 1.6, M["ext_red"])
# 폰부스
box("PhoneBooth_Frame_L", -2.3, -8.9, 0, -2.2, -7.9, 2.8, M["stone_wall"])
box("PhoneBooth_Frame_R", -1.2, -8.9, 0, -1.1, -7.9, 2.8, M["stone_wall"])
box("PhoneBooth_Top", -2.3, -8.9, 2.6, -1.1, -7.9, 2.8, M["stone_wall"])
box("PhoneBooth_Yellow_Banner", -2.2, -8.88, 0.1, -2.03, -8.84, 2.55, M["phone_yellow"])
box("PhoneBooth_Glass", -2.03, -8.88, 0.1, -1.2, -8.84, 2.55, M["frosted"])
_pb = T("PhoneBooth_Text", "PHONE BOOTH", -2.115, -8.9, 1.3, 1.6, 0.12, M["text_dark"], facing="S")
_pb.rotation_mode = "ZXY"
_pb.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
cbox("PhoneBooth_Desk", -1.65, -8.05, 0.85, 0.8, 0.3, 0.04, M["wood_light"])
cbox("Sanitizer_Stand", -0.85, -8.55, 0, 0.12, 0.12, 1.25, M["white"])

# =====================================================================
#  3) 메인 LG U+ 유리문 + 나무 루버 복도 (TV·피규어 선반 · 보라 배너 · 상담실 문)
# =====================================================================
wall("Main_Door_Wall", -1.1, -8.0, 1.8, -8.0, M["charcoal"], openings=[(0.5, 2.1, 2.6)])
box("Main_Glass_Door_L", -0.6, -8.03, 0, 0.2, -7.97, 2.6, M["glass"])
box("Main_Glass_Door_R", 0.2, -8.03, 0, 1.0, -7.97, 2.6, M["glass"])
T("Main_Door_Logo_L", "LG U+", -0.2, -8.06, 1.4, 0.42, 0.11, M["text_red"], facing="S")
T("Main_Door_Logo_R", "LG U+", 0.6, -8.06, 1.4, 0.42, 0.11, M["text_red"], facing="S")
for i in range(7):
    y = -7.6 + i * 1.5
    box(f"Ceiling_Wood_Louver_{i + 1}", -1.4, y, 3.0, 1.8, y + 0.12, 3.12, M["wood_light"])
# 복도 서쪽 벽: TV + 흰 선반(피규어) + 고무나무, 상담실 문, 탕비실 입구
wall("Corridor_Wall_W", -1.4, -8.0, -1.4, 0.2, M["panel_white"], openings=[(3.5, 4.3, 2.3), (4.7, 5.9, 2.6)])
box("Massage_Room_Dark_Door", -1.43, -4.5, 0, -1.37, -3.7, 2.3, M["charcoal"])  # 문(통과 가능)
box("Massage_Room_Door_Window", -1.36, -4.2, 1.0, -1.35, -4.05, 2.0, M["amber"])
box("Massage_Room_Sign", -1.32, -3.55, 1.5, -1.3, -3.35, 1.7, M["banner_white"])
T("Massage_Room_Sign_Text", "안마치료실", -1.29, -3.45, 1.85, 0.5, 0.08, M["text_dark"], facing="E", fallback="MASSAGE")
tv("Corridor_TV", -1.32, -5.85, 1.35, 1.25, 0.72, "E")
SX = -1.08
for k, y in enumerate((-6.5, -5.2)):
    for j, x in enumerate((SX - 0.14, SX + 0.14)):
        cbox(f"Trophy_Shelf_Post_{k}_{j}", x, y, 0, 0.025, 0.025, 0.95, M["white"])
for k, z in enumerate((0.1, 0.5, 0.9)):
    cbox(f"Trophy_Shelf_Board_{k + 1}", SX, -5.85, z, 0.32, 1.35, 0.03, M["white"])
for k, y in enumerate((-6.3, -6.0, -5.7, -5.4)):
    cbox(f"Trophy_Figurine_{k + 1}", SX, y, 0.93, 0.07, 0.07, 0.22 + (k % 2) * 0.08, M["gold"] if k % 2 else M["wood_dark"])
cbox("Ficus_Pot", -1.05, -7.2, 0, 0.32, 0.32, 0.35, M["black"])
cyl("Ficus_Trunk", -1.05, -7.2, 0.35, 0.025, 1.1, M["wood_dark"], 6)
for k, z in enumerate((1.0, 1.3, 1.55)):
    leaf_ball(f"Ficus_Leaves_{k}", -1.05 + (k - 1) * 0.07, -7.2, z, 0.2, M["green_dark"])
# 복도 동쪽 벽: 흰 벽 + 보라색 배너
wall("Corridor_Wall_E", 1.8, -8.0, 1.8, 1.0, M["panel_white"], openings=[(3.05, 3.85, 2.3)])
box("Psych_Room_Door", 1.77, -4.95, 0, 1.83, -4.15, 2.3, M["wood_dark"])  # 심리상담실 문(통과 가능)
box("Psych_Room_Sign_Plate", 1.7, -5.6, 1.45, 1.72, -5.1, 1.75, M["banner_white"])
T("Psych_Room_Sign", "심리상담실", 1.69, -5.35, 1.6, 0.45, 0.09, M["text_dark"], facing="W", fallback="COUNSELING")
box("Purple_CS1_Banner", 1.71, -7.6, 2.2, 1.73, 0.6, 2.7, M["purple"])
T("Purple_Banner_Text", "고객의 마음을 여는 공감상담 · CS1그룹", 1.7, -3.5, 2.45, 6.0, 0.24, M["white"], facing="W", fallback="CS1 GROUP")
ext("Corridor_Extinguisher", 1.45, -7.4)

# =====================================================================
#  3-2) 심리상담실 (출입구 들어와서 오른쪽) — 따뜻한 조명 · 소파 · 1인 체어 · 러그 · 화분
# =====================================================================
wall("Psych_Room_East_Wall", 5.2, -8.0, 5.2, -4.0, M["panel_white"])
wall("Psych_Room_North_Wall", 1.8, -4.0, 5.2, -4.0, M["panel_white"])
box("Psych_Room_Wood_Accent", 5.12, -7.6, 0, 5.15, -4.4, 2.6, M["wood_panel"])
box("Psych_Room_Rug", 2.4, -7.2, 0, 4.6, -4.8, 0.01, M["pink_back"])
cbox("Psych_Sofa_Base", 4.7, -6.0, 0, 0.75, 1.8, 0.42, M["gray_pouf"])
cbox("Psych_Sofa_Back", 5.0, -6.0, 0.42, 0.15, 1.8, 0.45, M["gray_pouf"])
for k, y in enumerate((-6.6, -5.4)):
    cbox(f"Psych_Sofa_Cushion_{k}", 4.85, y, 0.42, 0.14, 0.38, 0.35, M["yellow_cush"] if k else M["pink_back"])
for k, y in enumerate((-6.85, -5.55)):
    cbox(f"Psych_Armchair_{k}", 2.65, y, 0, 0.66, 0.66, 0.42, M["fabric_blue"])
    cbox(f"Psych_Armchair_Back_{k}", 2.35, y, 0.42, 0.1, 0.66, 0.45, M["fabric_blue"])
cyl("Psych_Round_Table", 3.65, -6.2, 0, 0.38, 0.48, M["wood_light"], 20)
cbox("Psych_Tissue_Box", 3.65, -6.2, 0.48, 0.22, 0.12, 0.08, M["white"])
cyl("Psych_Tea_Cup_1", 3.5, -6.15, 0.48, 0.04, 0.08, M["white"], 10)
cyl("Psych_Tea_Cup_2", 3.8, -5.85, 0.48, 0.04, 0.08, M["white"], 10)
cyl("Psych_Floor_Lamp_Pole", 4.75, -7.55, 0, 0.02, 1.5, M["black"], 6)
cyl("Psych_Floor_Lamp_Shade", 4.75, -7.55, 1.45, 0.2, 0.28, M["amber"], 16, r2=0.14)
plant("Psych_Plant", 2.2, -7.55, 1.3)
box("Psych_Frame_1", 3.0, -4.08, 1.3, 3.6, -4.06, 1.9, M["photo"][4])
box("Psych_Frame_2", 3.9, -4.08, 1.3, 4.5, -4.06, 1.9, M["photo"][3])
T("Psych_Wall_Text", "마음도 쉬어 가는 곳", 3.5, -7.93, 2.3, 1.6, 0.16, M["text_navy"], facing="N", fallback="REST YOUR MIND")

# =====================================================================
#  4) 탕비실 (북쪽 유리창 바 · 펜던트 · 스툴 · 생수 · 냉장고 · 수납장)
# =====================================================================
wall("Pantry_West_Wall", -4.4, -3.6, -4.4, 0.2, M["panel_white"])
wall("Pantry_South_Wall", -4.4, -3.6, -1.4, -3.6, M["panel_white"])
box("Pantry_Window_Low", -4.4, 0.13, 0, -1.4, 0.27, 0.9, M["wood_panel"])
box("Pantry_Window_Glass", -4.4, 0.18, 0.9, -1.4, 0.22, 2.4, M["glass"])
box("Pantry_Window_Head", -4.4, 0.13, 2.4, -1.4, 0.27, 3.2, M["panel_white"])
for k, x in enumerate((-3.9, -3.5, -2.3, -1.9)):  # 유리에 붙은 안내문
    box(f"Pantry_Window_Poster_{k}", x - 0.15, 0.225, 1.3, x + 0.15, 0.23, 1.72, M["orange_back"] if k % 2 else M["banner_white"])
box("Pantry_Window_Bar", -4.3, -0.32, 0.88, -1.5, 0.12, 0.93, M["wood_light"])
for k, x in enumerate((-3.85, -2.9, -1.95)):
    cyl(f"Pantry_Pendant_Cord_{k}", x, -0.15, 2.2, 0.006, 0.8, M["black"], 6)
    cyl(f"Pantry_Pendant_{k}", x, -0.15, 1.85, 0.16, 0.35, M["gold"], 16, r2=0.03)
for k, x in enumerate((-3.85, -3.2, -2.55, -1.9)):
    stool(f"Pantry_Stool_{k}", x, -0.75)
for k, (x, y) in enumerate([(-4.05, -1.3), (-3.75, -1.3), (-4.05, -1.65), (-3.75, -1.65), (-3.9, -1.48)]):
    cyl(f"Water_Bottle_{k}", x, y, 0 if k < 4 else 0.45, 0.14, 0.45, M["water_blue"], 12)
cbox("Pantry_Steel_Fridge", -4.0, -3.15, 0, 0.7, 0.68, 1.8, M["steel"])
cbox("Pantry_Low_Cabinet", -2.55, -3.3, 0, 1.6, 0.6, 0.9, M["white"])
cbox("Pantry_Counter_Top", -2.55, -3.3, 0.9, 1.62, 0.62, 0.04, M["desk_white"])
box("Pantry_Dark_Back", -3.35, -3.58, 0.94, -1.75, -3.55, 1.8, M["charcoal"])
cbox("Pantry_Upper_Cabinet", -2.55, -3.42, 1.8, 1.6, 0.35, 0.7, M["white"])
cbox("Pantry_Water_Dispenser", -1.65, -3.3, 0.94, 0.3, 0.35, 0.45, M["white"])
box("Pantry_Notice", -2.0, -3.54, 1.3, -1.7, -3.52, 1.7, M["text_red"])
T("Pantry_Sign", "탕비실", -2.9, 0.3, 2.65, 0.6, 0.14, M["text_dark"], facing="N", fallback="PANTRY")

# =====================================================================
#  5) 서쪽으로 꺾이는 복도 (나무 루버 · 유리 회의실 · 배너 · LG U+ 자동문)
# =====================================================================
box("Left_Turn_Banner", -8.7, 0.27, 2.4, -4.9, 0.29, 2.8, M["text_dark"])
T("Left_Turn_Banner_Text", "우리가 함께 만드는 최고의 고객센터", -6.8, 0.3, 2.6, 3.6, 0.2, M["white"], facing="N", fallback="TOGETHER")
for i in range(6):
    x = -9.4 + i * 1.5
    box(f"Ceiling_LeftTurn_Louver_{i + 1}", x, 0.2, 3.0, x + 0.12, 2.9, 3.12, M["wood_light"])
# 남쪽: 회의실 · 수면실 유리벽
box("Meeting_A_Glass_W", -8.8, 0.18, 0, -5.4, 0.22, 2.9, M["frosted"])
box("Meeting_A_Glass_Door", -5.4, 0.18, 0, -4.6, 0.22, 2.4, M["glass"])  # 문(통과 가능)
box("Meeting_A_Glass_Head", -5.4, 0.17, 2.4, -4.4, 0.23, 2.9, M["frosted"])
box("Meeting_A_Glass_E", -4.6, 0.18, 0, -4.4, 0.22, 2.4, M["frosted"])
for k, x in enumerate((-8.2, -7.5, -6.8, -6.1)):
    box(f"Meeting_A_Poster_{k}", x - 0.25, 0.225, 1.1, x + 0.25, 0.23, 1.8, M["photo"][(k + 2) % 8])
box("Sleep_Room_Glass", -9.7, 0.18, 0, -9.6, 0.22, 2.9, M["frosted"])
box("Sleep_Room_Door", -9.6, 0.18, 0, -8.85, 0.22, 2.4, M["frosted"])  # 수면실 문(통과 가능)
T("Sleep_Room_Door_Sign", "수면실", -9.22, 0.26, 1.7, 0.45, 0.12, M["text_navy"], facing="N", fallback="NAP")
box("Sleep_Room_Glass_Head", -9.6, 0.17, 2.4, -8.8, 0.23, 2.9, M["frosted"])
for k, x in enumerate((-9.7, -8.8, -5.4, -4.6, -4.4)):
    box(f"LeftTurn_Mullion_{k}", x - 0.03, 0.15, 0, x + 0.03, 0.25, 2.9, M["frame_black"])
box("West_Exit_Door", -9.72, 0.7, 0, -9.68, 2.5, 2.4, M["charcoal"])
wall("LeftTurn_West_Wall", -9.7, 0.2, -9.7, 2.9, M["panel_white"])
exit_sign("West_Exit_Sign", -9.66, 1.6, 2.55, "E")
# 북쪽 벽 + LG U+ 자동문 (사무실2)
wall("Left_Turn_Wall_N", -9.7, 2.9, -0.7, 2.9, M["panel_white"], openings=[(4.3, 5.4, 2.6)])
box("Push_Auto_Door", -5.4, 2.87, 0, -4.3, 2.93, 2.6, M["glass"])  # 문(통과 가능)
T("Auto_Door_Logo", "LG U+", -4.85, 2.84, 1.4, 0.45, 0.11, M["text_red"], facing="S")
box("Door_Warning_Sticker", -4.5, 2.83, 1.0, -4.3, 2.84, 1.25, M["text_red"])
cbox("Door_Push_Switch", -3.35, 2.8, 1.0, 0.1, 0.03, 0.15, M["steel"])
dracaena("LeftTurn_Plant", -3.0, 2.55, 1.4)

# =====================================================================
#  6) 회의실 A (흰 테이블 · 메시 의자 · TV) / 수면실 (리클라이너 4대)
# =====================================================================
wall("Meeting_Sleep_Divider", -8.8, -3.6, -8.8, 0.2, M["panel_white"])
wall("NorthBand_South_Wall", -16.0, -3.6, -4.4, -3.6, M["panel_white"])
tv("Meeting_A_TV", -8.72, -1.7, 1.2, 1.5, 0.85, "E")
for k, x in enumerate((-7.9, -6.9, -5.9)):  # 동쪽 유리문 쪽 통로 확보
    cbox(f"Meeting_A_Table_{k}", x, -1.7, 0.72, 1.0, 0.9, 0.04, M["desk_white"])
    cbox(f"Meeting_A_Table_Leg_{k}", x, -1.7, 0, 0.08, 0.6, 0.72, M["steel"])
    for sy in (-1, 1):
        office_chair(f"Meeting_A_Chair_{k}_{'N' if sy > 0 else 'S'}", x, -1.7 + sy * 0.75, -sy)
cbox("Meeting_A_Cart", -4.75, -3.2, 0, 0.45, 0.4, 0.6, M["mesh_black"])
cyl("Meeting_A_Coat_Stand", -8.5, -3.3, 0, 0.02, 1.7, M["white"], 8)
# 수면실 (예전 다이닝 라운지 자리) — 리클라이너 4대 · 사이드 테이블 · 담요 · 어두운 조명
wall("Sleep_West_Wall", -16.0, -3.6, -16.0, 0.2, M["panel_white"])
wall("Sleep_North_Wall", -16.0, 0.2, -9.7, 0.2, M["panel_white"])
box("Sleep_Room_Blind", -15.95, -3.2, 0.9, -15.92, -0.2, 2.8, M["blind"])
box("Sleep_Room_Rug", -15.5, -2.2, 0, -9.4, -0.6, 0.01, M["mat_purple"])


def recliner(name, x, y):
    """수면용 리클라이너 (북쪽을 바라봄: 등받이 남쪽, 다리 받침 북쪽)"""
    cbox(f"{name}_Base", x, y, 0, 0.8, 1.1, 0.35, M["black"])
    cbox(f"{name}_Seat", x, y + 0.05, 0.35, 0.6, 0.6, 0.15, M["wood_dark"])
    cbox(f"{name}_Arm_L", x - 0.33, y, 0.35, 0.16, 0.85, 0.4, M["black"])
    cbox(f"{name}_Arm_R", x + 0.33, y, 0.35, 0.16, 0.85, 0.4, M["black"])
    cbox(f"{name}_Back", x, y - 0.42, 0.45, 0.62, 0.22, 0.95, M["wood_dark"]).rotation_euler.x = 0.35
    cbox(f"{name}_Pillow", x, y - 0.6, 1.25, 0.4, 0.16, 0.22, M["mesh_black"])
    cbox(f"{name}_Leg_Rest", x, y + 0.62, 0.05, 0.5, 0.2, 0.45, M["wood_dark"]).rotation_euler.x = 0.5
    cbox(f"{name}_Blanket", x, y + 0.05, 0.5, 0.56, 0.5, 0.06, M["fabric_blue"])


for k, x in enumerate((-15.0, -13.55, -12.1, -10.65)):
    recliner(f"Sleep_Recliner_{k + 1}", x, -2.75)
for k, x in enumerate((-14.27, -12.82, -11.37)):
    cyl(f"Sleep_Side_Table_{k}", x, -3.0, 0, 0.17, 0.5, M["white"], 14)
    cyl(f"Sleep_Water_{k}", x, -3.0, 0.5, 0.035, 0.18, M["glass"], 8)
cbox("Sleep_Blanket_Shelf", -9.35, -2.6, 0, 0.5, 1.2, 0.9, M["wood_light"])
for k, z in enumerate((0.9, 1.02)):
    cbox(f"Sleep_Blanket_Stack_{k}", -9.35, -2.6, z, 0.42, 0.9, 0.12, M["cushion_gray"] if k else M["fabric_blue"])
cyl("Sleep_Floor_Lamp_Pole", -15.6, -0.25, 0, 0.02, 1.4, M["black"], 6)
cyl("Sleep_Floor_Lamp_Shade", -15.6, -0.25, 1.35, 0.18, 0.25, M["amber"], 14, r2=0.12)
T("Sleep_Room_Wall_Text", "잠시 쉬어도 괜찮아요", -12.8, -3.52, 2.35, 2.2, 0.18, M["text_navy"], facing="N", fallback="TAKE A BREAK")
cbox("Sleep_Coat_Rack_Base", -15.6, -1.2, 0, 0.32, 0.32, 0.04, M["black"])
cyl("Sleep_Coat_Rack", -15.6, -1.2, 0.04, 0.025, 1.7, M["black"], 8)

# =====================================================================
#  7) 안마치료실 (출입구 왼쪽, 복도 쪽 어두운 문) / 자료실 (바깥 복도 흰 문)
# =====================================================================
wall("Massage_Resource_Divider", -8.4, -7.9, -8.4, -3.6, M["panel_white"])
wall("Resource_West_Wall", -16.0, -7.9, -16.0, -3.6, M["panel_white"])
box("Massage_Wood_Wall", -8.32, -7.8, 0, -8.29, -3.7, 2.6, M["wood_panel"])
# 안마 베드 3대 (머리 쪽 남쪽 벽) + 사이 커튼
for k, x in enumerate((-7.4, -5.6, -3.8)):
    b_ = f"Massage_Bed_{k + 1}"
    cbox(f"{b_}_Base", x, -6.6, 0, 0.7, 1.9, 0.6, M["white"])
    cbox(f"{b_}_Cushion", x, -6.6, 0.6, 0.72, 1.92, 0.1, M["teal_seat"])
    cyl(f"{b_}_Face_Hole", x, -7.35, 0.7, 0.1, 0.005, M["black"], 14)
    cbox(f"{b_}_Towel", x, -5.9, 0.7, 0.6, 0.35, 0.04, M["white"])
    cbox(f"{b_}_Pillow", x, -5.75, 0.74, 0.4, 0.2, 0.1, M["banner_white"])
    cyl(f"{b_}_Stool", x + 0.6, -6.4, 0, 0.17, 0.5, M["black"], 12)
for k, x in enumerate((-6.5, -4.7)):
    cbox(f"Massage_Curtain_{k}", x, -6.55, 0, 0.04, 2.6, 2.0, M["pink_back"])
    cbox(f"Massage_Curtain_Rail_{k}", x, -6.55, 2.0, 0.04, 2.6, 0.04, M["steel"])
# 치료사 책상 · 수건장 · 세면대 · 화분 (입구 쪽)
cbox("Massage_Therapist_Desk", -2.3, -7.4, 0.72, 1.2, 0.6, 0.04, M["wood_light"])
cbox("Massage_Desk_Pedestal", -2.75, -7.4, 0, 0.4, 0.55, 0.72, M["white"])
office_chair("Massage_Therapist_Chair", -2.1, -6.8, -1)
cbox("Massage_Towel_Cabinet", -1.75, -5.6, 0, 0.5, 0.9, 1.4, M["white"])
for k, z in enumerate((1.4, 1.52)):
    cbox(f"Massage_Towel_Stack_{k}", -1.75, -5.6, z, 0.4, 0.6, 0.12, M["white"] if k else M["banner_white"])
cbox("Massage_Sink", -7.9, -4.1, 0, 0.6, 0.45, 0.85, M["white"])
cbox("Massage_Sink_Bowl", -7.9, -4.1, 0.85, 0.42, 0.3, 0.05, M["steel"])
plant("Massage_Plant", -6.6, -4.0, 1.2)
cyl("Massage_Aroma_Lamp", -2.3, -7.4, 0.76, 0.06, 0.14, M["amber"], 10)
T("Massage_Wall_Text", "안마치료실 · 몸과 마음의 피로를 풀어 드려요", -4.9, -3.68, 2.4, 3.6, 0.16, M["text_navy"], facing="S", fallback="MASSAGE")
# 자료실 (철제 선반 · 박스 · 작업대)
for k, x in enumerate((-15.2, -13.6, -12.0)):
    cbox(f"Resource_Shelf_{k}", x, -7.55, 0, 1.4, 0.45, 2.0, M["steel"])
    for j, z in enumerate((0.5, 1.0, 1.5)):
        cbox(f"Resource_Box_{k}_{j}", x, -7.55, z, 1.2, 0.38, 0.3, M["box"])
cbox("Resource_Work_Table", -11.8, -5.0, 0.72, 2.0, 0.9, 0.04, M["desk_white"])
cbox("Resource_Table_Leg", -11.8, -5.0, 0, 0.08, 0.6, 0.72, M["steel"])
office_chair("Resource_Chair", -11.8, -5.8, 1)
cbox("Resource_Copier", -9.0, -4.2, 0, 0.6, 0.6, 1.1, M["white"])
T("Resource_Sign", "자료실", -9.5, -7.88, 2.45, 0.5, 0.1, M["text_dark"], facing="N", fallback="STORAGE")

# =====================================================================
#  8) 사무실1 (복도 끝 동쪽: 화분 칸막이 · 복합기 · 세로 상담석 2줄 · 블라인드 창)
# =====================================================================
wall("Office1_South_Wall", 1.8, 1.0, 7.6, 1.0, M["panel_white"])
wall("Office1_East_Wall", 7.6, 1.0, 7.6, 10.4, M["wall_white"])
wall("Office1_North_Wall", -0.7, 10.4, 7.6, 10.4, M["wall_white"])
wall("Office1_West_Wall", -0.7, 2.9, -0.7, 10.4, M["panel_white"], openings=[(6.0, 7.4, 2.6)])
for i in range(5):
    box(f"Office1_Window_Blind_{i}", 7.48, 1.3 + i * 1.8, 0.9, 7.52, 2.9 + i * 1.8, 3.0, M["roller"])
box("Office1_Low_Cabinet", 7.22, 2.6, 0, 7.52, 10.2, 0.7, M["wood_light"])
# 입구 화분 칸막이 (메시 + 나무 화분함)
box("Front_Planter_Box", -0.65, 2.85, 0, 0.2, 3.15, 0.9, M["wood_light"])
for k, x in enumerate((-0.45, -0.05)):
    pothos(f"Front_Planter_Plant_{k}", x, 3.0, 0.9, 1.1)
box("Front_Mesh_Divider", 0.2, 2.95, 0, 1.5, 3.05, 1.1, M["mesh_black"])
box("Front_Mesh_TopWood", 0.15, 2.86, 1.1, 1.55, 3.14, 1.14, M["wood_light"])
for k, x in enumerate((0.5, 1.2)):
    pothos(f"Front_Mesh_Plant_{k}", x, 3.0, 1.14, 0.9)
# 복합기 · 흰 수납장 (남쪽 벽)
cbox("Office1_Low_Cabinets", 4.8, 1.4, 0, 4.0, 0.6, 0.9, M["white"])
cbox("Office1_Counter_Top", 4.8, 1.4, 0.9, 4.04, 0.62, 0.04, M["desk_white"])
box("Office1_Dark_Back", 2.8, 1.08, 0.94, 6.8, 1.1, 1.85, M["charcoal"])
cbox("Office1_Upper_Cabinets", 4.8, 1.25, 1.85, 4.0, 0.35, 0.8, M["white"])
for k, x in enumerate((3.4, 4.3)):
    cbox(f"Office1_Copier_{k}", x, 2.05, 0, 0.62, 0.6, 1.15, M["white"] if k else M["steel"])
    cbox(f"Office1_Copier_Panel_{k}", x, 1.85, 1.15, 0.35, 0.18, 0.08, M["text_dark"])
ext("Office1_Extinguisher", 7.2, 1.4)
# 세로 상담석 2줄 (가운데 칸막이를 두고 마주 보는 2열 × 4칸, 입구 쪽 끝은 화분 칸막이)
O1_Y0 = 3.9
line_ns("Office1_Line_1", 1.55, O1_Y0, 4, south_end="planter")
line_ns("Office1_Line_2", 4.9, O1_Y0, 4, skip={("E", 2)}, south_end="planter")  # 기둥 자리 1석 비움
cbox("Office1_Wood_Pillar", 6.2, 7.5, 0, 0.85, 0.85, 3.2, M["wood_panel"])
# 출입구 쪽: 분리수거함 · 정수기
recycle_station("Office1_Recycle", 2.3, 1.35, along="x")
water_purifier("Office1_Water_Purifier", 5.2, 2.05)
plant("Office1_Corner_Plant", 7.1, 10.0, 1.4)

# =====================================================================
#  9) 사무실2 (LG U+ 자동문 안쪽: 흰 수납장+화분 · 상담석 · KSQI 대회의실 · 회색 문 안 복사실)
# =====================================================================
wall("Office2_North_Wall", -9.6, 16.0, -0.7, 16.0, M["wall_white"])
wall("Office2_West_Wall", -9.6, 2.9, -9.6, 16.0, M["wall_white"])
box("Office2_Roller_Blind", -9.52, 3.5, 0.9, -9.48, 9.2, 2.9, M["roller"])
for i in range(4):  # 흰 낮은 수납장 + 화분 (동쪽 벽)
    y = 3.6 + i * 1.3
    cbox(f"Office2_White_Cabinet_{i}", -1.0, y, 0, 0.5, 1.25, 1.0, M["white"])
    pothos(f"Office2_Cabinet_Plant_{i}", -1.0, y, 1.0, 1.1)
# 세로 상담석 1줄: 마주 보는 2열 × 3칸 = 6석, 북쪽 끝에 팀장석 2석 (팀원 쪽을 바라봄)
O2_Y1 = line_ns("Office2_Line", -3.15, 10.4, 3, south_end="plain")
for k, x in enumerate((-3.85, -2.45)):
    leader_desk(f"Office2_Leader_{k + 1}", x, O2_Y1 + 0.55)
box("Office2_Entry_Planter", -3.8, 8.0, 0, -3.4, 9.6, 0.75, M["wood_light"])
for k, y in enumerate((8.3, 8.8, 9.3)):
    pothos(f"Office2_Entry_Plant_{k}", -3.6, y, 0.75, 1.1)
# 자동문(출입구) 안쪽: 분리수거함 · 정수기 · 복합기
recycle_station("Office2_Recycle", -3.2, 3.25, along="x")
water_purifier("Office2_Water_Purifier", -2.3, 3.25)
cbox("Office2_Entry_Copier", -1.75, 3.35, 0, 0.6, 0.6, 1.15, M["white"])
cbox("Office2_Entry_Copier_Panel", -1.75, 3.15, 1.15, 0.35, 0.18, 0.08, M["text_dark"])
# 회색 문 안쪽 복사실 (복합기 · 정수기 · 흰 수납장 · 냉장고)
wall("Office2_Left_Wall", -5.6, 2.9, -5.6, 9.4, M["panel_white"], openings=[(1.1, 2.1, 2.3)])
box("Office2_Gray_Door", -5.63, 4.0, 0, -5.57, 5.0, 2.3, M["charcoal"])  # 문(통과 가능)
box("Office2_Gray_Door_Window", -5.56, 4.35, 1.0, -5.55, 4.5, 2.0, M["glass"])
cbox("Office2_Wood_Pillar", -5.6, 7.8, 0, 0.75, 0.75, 3.2, M["wood_panel"])
ext("Office2_Pillar_Extinguisher", -5.1, 7.8)
cbox("CopyRoom_Copier_1", -9.15, 3.6, 0, 0.6, 0.62, 1.15, M["white"])
cbox("CopyRoom_Copier_2", -9.15, 4.5, 0, 0.6, 0.62, 1.0, M["steel"])
cbox("CopyRoom_White_Cabinets", -7.6, 9.1, 0, 3.0, 0.55, 0.9, M["white"])
cbox("CopyRoom_Upper_Cabinets", -7.6, 9.22, 1.8, 3.0, 0.32, 0.8, M["white"])
cbox("CopyRoom_Fridge", -5.95, 9.0, 0, 0.6, 0.6, 1.75, M["white"])
cbox("CopyRoom_Water_Purifier", -8.6, 9.1, 0.9, 0.3, 0.35, 0.45, M["white"])
cyl("CopyRoom_Water_Bottle", -9.2, 8.3, 0, 0.14, 0.45, M["water_blue"], 12)
for k, y in enumerate((6.0, 7.0)):
    plant(f"CopyRoom_Plant_{k}", -9.2, y, 1.3)
cbox("CopyRoom_Recycle_Box", -7.0, 4.0, 0, 0.6, 0.45, 0.55, M["box"])
# KSQI 대회의실 (긴 흰 테이블 · 청록 의자 · TV · 수상 문구)
wall("KSQI_South_Wall", -9.6, 9.4, -5.6, 9.4, M["panel_white"])
box("KSQI_Glass_Wall", -5.63, 10.6, 0, -5.57, 16.0, 2.9, M["frosted"])
box("KSQI_Glass_Door", -5.63, 9.4, 0, -5.57, 10.6, 2.4, M["glass"])  # 문(통과 가능)
box("KSQI_Glass_Head", -5.64, 9.4, 2.4, -5.56, 10.6, 2.9, M["frosted"])
cbox("KSQI_Long_Table", -7.6, 12.8, 0.72, 1.3, 4.6, 0.05, M["desk_white"])
for k, y in enumerate((11.2, 14.4)):
    cbox(f"KSQI_Table_Leg_{k}", -7.6, y, 0, 0.9, 0.08, 0.72, M["steel"])
for k in range(6):
    y = 10.9 + k * 0.76
    for sx in (-1, 1):
        c = f"KSQI_Chair_{k}_{'E' if sx > 0 else 'W'}"
        cyl(f"{c}_Base", -7.6 + sx * 1.0, y, 0, 0.24, 0.42, M["black"], 10, r2=0.04)
        cbox(f"{c}_Seat", -7.6 + sx * 1.0, y, 0.42, 0.46, 0.46, 0.07, M["teal_seat"])
        cbox(f"{c}_Back", -7.6 + sx * 1.24, y, 0.49, 0.05, 0.42, 0.5, M["teal_seat"])
tv("KSQI_TV", -7.6, 15.92, 1.1, 1.8, 1.0, "S")
T("KSQI_Banner_1", "전 산업군 1위 KSQI '고객감동콜센터'", -9.55, 12.8, 2.35, 4.0, 0.26, M["text_dark"], facing="E", fallback="KSQI No.1")
T("KSQI_Banner_2", "통신업계 1위 KS-CQI '최우수기업' 선정", -9.55, 12.8, 1.95, 4.0, 0.24, M["text_red"], facing="E", fallback="KS-CQI No.1")
plant("KSQI_Corner_Plant", -9.2, 15.6, 1.3)
T("KSQI_Room_Sign", "대회의실", -5.55, 10.0, 2.62, 0.7, 0.13, M["text_dark"], facing="E", fallback="MEETING")

# =====================================================================
#  천장 (게임에서는 숨김)
# =====================================================================
box("Ceiling_Hall_BlackGrid", -16.2, -13.6, 3.2, 3.2, -8.0, 3.25, M["black"])
box("Ceiling_Offices", -9.6, 1.0, 3.2, 7.6, 16.0, 3.25, M["white"])

# =====================================================================
#  마무리: 내보내기
# =====================================================================
bpy.context.view_layer.update()
print(f"[6F] 오브젝트 {len(col.objects)}개 생성 완료")
if EXPORT_PATH:
    export_dir = os.path.dirname(EXPORT_PATH)
    if os.path.isdir(export_dir):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.export_scene.gltf(filepath=EXPORT_PATH, export_format="GLB", use_selection=False,
                                  export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
        print(f"[6F] 내보내기 완료 → {EXPORT_PATH}")
    else:
        print(f"[6F] 내보내기 폴더가 없어 건너뜀: {export_dir}  (EXPORT_PATH 를 고쳐 주세요)")
