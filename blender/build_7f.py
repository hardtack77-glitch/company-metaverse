# =====================================================================
#  LG U+ 대구고객센터 상담실 층 (7층 · 8층 · 9층 공통 디자인)
#  7층 영상·사진을 기준으로 만든 상담실 층. 8·9층도 같은 디자인
#  사용법: 블렌더 5.x → Scripting 탭 → 이 파일 열기 → 아래 FLOOR_NO 숫자(7/8/9) 바꾸고 → Run Script
#          → client/public/floor_7f.glb / floor_8f.glb / floor_9f.glb 로 내보냄
#  좌표: 1 = 1m, 바닥 윗면 Z=0, 이름에 Door 가 있으면 통과 가능, Ceiling_ 은 게임에서 숨김
# =====================================================================
import bpy
import bmesh
import math
import os

FLOOR_NO = 7  # ← 만들 층 번호 (7, 8, 9)
FLOOR_NO = int(os.environ.get("FLOOR_NO", FLOOR_NO))  # (테스트용 덮어쓰기)
EXPORT_PATH = rf"C:\Users\User\company-metaverse\client\public\floor_{FLOOR_NO}f.glb"
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
T("Floor_Map_Title", f"{FLOOR_NO}F 층별 안내", 3.6, -13.37, 1.68, 0.5, 0.08, M["white"], facing="N", fallback=f"{FLOOR_NO}F MAP")
wall("West_Hall_Wall", -1.75, -13.5, -1.75, -11.5, M["stone_wall"])
# 동쪽 주황 벽 + 엘리베이터 2대 (x=4)
wall("Elev_Orange_Wall", 4.0, -13.5, 4.0, -8.0, M["orange"], t=0.12)
for nm, (y1, y2) in {"Elev_Door_R": (-12.7, -11.3), "Elev_Door_L": (-9.8, -8.4)}.items():
    box(f"{nm}_Frame", 3.9, y1 - 0.08, 0, 3.95, y2 + 0.08, 2.58, M["charcoal"])
    box(f"{nm}_Leaf_A", 3.86, y1, 0, 3.9, (y1 + y2) / 2 - 0.01, 2.45, M["elev_door"])
    box(f"{nm}_Leaf_B", 3.86, (y1 + y2) / 2 + 0.01, 0, 3.9, y2, 2.45, M["elev_door"])
    box(f"{nm}_Display", 3.88, (y1 + y2) / 2 - 0.15, 2.5, 3.9, (y1 + y2) / 2 + 0.15, 2.56, M["text_red"])
    box(f"{nm}_CallBtn", 3.92, y2 + 0.18, 1.0, 3.94, y2 + 0.28, 1.25, M["steel"])
T("Floor_Num", str(FLOOR_NO), 3.92, -10.55, 2.35, 0.25, 0.42, M["gold"], facing="W", extrude=0.02)
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
T("Window_Gamdong_Banner", f"감동을 전하는 {FLOOR_NO}층", 1.65, -5.1, 2.0, 2.2, 0.22, M["text_red"], facing="W", fallback=f"WOW {FLOOR_NO}F")
box("Corr_East_Wood_Mid", 1.62, -1.7, 0, 1.78, -1.3, 3.2, M["wood_panel"])
box("Corr_East_Wood_Panel", 1.62, -1.3, 0, 1.78, 0.5, 3.2, M["wood_panel"])
box("Lounge_Frosted_Door", 1.68, 0.5, 0, 1.72, 1.5, 2.4, M["frosted"])
box("Lounge_Door_Head", 1.62, 0.5, 2.4, 1.78, 1.5, 3.2, M["wood_panel"])
box("Geometric_Glass_Wall", 1.67, 1.5, 0, 1.73, 8.4, 2.9, M["frosted"])
for i, y in enumerate([2.9, 4.6, 6.3, 8.0]):
    box(f"Geometric_Glass_Mullion_{i + 1}", 1.64, y - 0.03, 0, 1.76, y + 0.03, 2.9, M["frame_black"])
box("Corr_East_Wood_N1", 1.62, 8.4, 0, 1.78, 9.3, 3.2, M["wood_panel"])
box("SleepRoom_Door", 1.68, 9.3, 0, 1.72, 10.3, 2.4, M["frosted"])  # 수면실 문(통과 가능)
box("SleepRoom_Door_Head", 1.62, 9.3, 2.4, 1.78, 10.3, 3.2, M["wood_panel"])
box("Corr_East_Wood_N2", 1.62, 10.3, 0, 1.78, 15.0, 3.2, M["wood_panel"])
T("SleepRoom_Sign", "수면실", 1.55, 10.85, 1.7, 0.6, 0.16, M["text_dark"], facing="W", fallback="NAP ROOM")
T("SleepRoom_Sign_Sub", "조용히 쉬어 가세요", 1.55, 10.85, 1.45, 0.8, 0.08, M["text_gray"], facing="W", fallback="QUIET")
ext("Corridor_Ext_1", 1.45, -7.6)
# 북쪽 끝 출입문
wall("North_End_Wall", -1.1, 15.0, 1.7, 15.0, M["wood_panel"])  # 북쪽 끝: 문 없음

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
#  5) 휴게 라운지 (사진: 핑크·회색·흰색 모듈 소파 섬 · 창가 회색 수납 벤치 · 벽돌 정원 코너)
# =====================================================================
M.update({
    "pink_fabric": mat("Fabric_Pink", hexrgb("c97fb4"), 0.85),
    "magenta_fabric": mat("Fabric_Magenta", hexrgb("c8235f"), 0.8),
    "white_fabric": mat("Fabric_White", hexrgb("e9e7e2"), 0.85),
    "gray_fabric": mat("Fabric_Gray_Lounge", hexrgb("9a9b9e"), 0.9),
    "dark_cab": mat("Cabinet_DarkGray", hexrgb("55585e"), 0.5),
    "brick_slate": mat("Brick_Slate_Gray", hexrgb("8a8c8c"), 0.9),
    "teal": mat("Cushion_Teal", hexrgb("4fb3bf"), 0.7),
})
wall("Lounge_East_Wall", 6.7, -1.5, 6.7, 8.4, M["wall_white"])
box("Lounge7F_Brown_Blind", 6.58, -1.3, 0.75, 6.62, 8.2, 2.9, M["blind"])
wall("Lounge_North_Wall", 1.7, 8.4, 6.7, 8.4, M["wood_panel"])
# 창가: 짙은 회색 수납장 + 쏙 들어간 핑크 좌석 2곳
SEATS = [(0.2, 1.8), (4.0, 5.6)]
segs, cur = [], -1.3
for (a_, b_) in SEATS:
    segs.append((cur, a_)); cur = b_
segs.append((cur, 8.2))
for i, (ya, yb) in enumerate(segs):
    box(f"Window_Cabinet_{i + 1}", 6.1, ya, 0, 6.66, yb, 0.7, M["dark_cab"])
    box(f"Window_Cabinet_Vent_{i + 1}", 6.25, ya + 0.15, 0.7, 6.5, yb - 0.15, 0.705, M["white"])
for i, (ya, yb) in enumerate(SEATS):
    box(f"Window_Seat_Base_{i + 1}", 6.1, ya, 0, 6.66, yb, 0.36, M["dark_cab"])
    box(f"Window_Seat_Pink_{i + 1}", 6.12, ya + 0.02, 0.36, 6.64, yb - 0.02, 0.45, M["pink_fabric"])
cbox("Window_Pillow_Pink", 6.5, 4.5, 0.45, 0.14, 0.4, 0.38, M["magenta_fabric"])
cbox("Window_Pillow_Gray", 6.52, 4.05 + 0.1, 0.45, 0.12, 0.38, 0.36, M["gray_fabric"])
cyl("Window_Pillow_Teal", 6.5, 5.2, 0.45, 0.2, 0.1, M["teal"], 16).rotation_euler = (0, math.pi / 2, 0)
cbox("Window_Nutcracker_1", 6.48, 5.45, 0.45, 0.14, 0.12, 0.36, M["text_red"])
cbox("Window_Nutcracker_2", 6.48, 0.55, 0.45, 0.14, 0.32, 0.32, M["white_fabric"])
cbox("Window_Pillow_White", 6.52, 1.5, 0.45, 0.12, 0.38, 0.36, M["white_fabric"])
box("Window_Red_Heart", 6.45, 0.85, 0.45, 6.6, 1.25, 0.8, M["red_pouf"])
cbox("Window_Photo_Stand", 6.35, 3.0, 0.705, 0.04, 0.2, 0.16, M["text_dark"])

# 모듈 소파 섬 (높이 0.42, 등받이 0.75)
def pouf(name, x1, y1, x2, y2, m, h=0.42):
    box(name, x1, y1, 0, x2, y2, h, m)


pouf("Pouf_Gray_1", 2.6, 0.3, 3.7, 1.4, M["gray_fabric"])
pouf("Pouf_Pink_1", 3.7, 0.3, 4.8, 1.3, M["pink_fabric"])
pouf("Pouf_Back_1", 3.7, 1.3, 4.8, 1.55, M["magenta_fabric"], 0.75)
pouf("Pouf_White_1", 2.6, 1.4, 3.4, 2.4, M["white_fabric"])
pouf("Pouf_Gray_2", 3.4, 1.55, 4.9, 2.7, M["gray_fabric"])
pouf("Pouf_Pink_2", 2.5, 2.4, 3.4, 3.5, M["pink_fabric"])
pouf("Pouf_Back_2", 2.5, 2.4, 2.75, 3.5, M["magenta_fabric"], 0.75)
pouf("Pouf_White_2", 3.4, 2.7, 4.4, 3.5, M["white_fabric"])
pouf("Pouf_Gray_3", 3.0, 3.5, 4.3, 4.5, M["gray_fabric"])
pouf("Pouf_Pink_3", 4.3, 3.4, 5.1, 4.5, M["pink_fabric"])
pouf("Pouf_Back_3", 4.85, 3.4, 5.1, 4.5, M["magenta_fabric"], 0.75)
pouf("Pouf_Gray_4", 2.6, 4.5, 3.6, 5.5, M["gray_fabric"])
pouf("Pouf_Pink_4", 3.6, 4.5, 4.6, 5.5, M["pink_fabric"])
pouf("Pouf_Back_4", 3.6, 5.5, 4.6, 5.75, M["magenta_fabric"], 0.75)
# 인형·쿠션
leaf_ball("Plush_Yellow_Dino", 4.25, 0.8, 0.5, 0.18, M["yellow_cush"])
leaf_ball("Plush_White_Bunny", 4.1, 5.0, 0.5, 0.12, M["white"])
# 작은 원목 사이드 테이블 (검은 다리)
cyl("Lounge_Side_Table_Top", 3.15, -0.25, 0.52, 0.22, 0.04, M["wood_light"], 18)
cyl("Lounge_Side_Table_Leg", 3.15, -0.25, 0, 0.16, 0.52, M["frame_black"], 8, r2=0.2)

# 북쪽 코너: 나무 패널 속 회색 벽돌 정원 + 흰 쉘 의자 2개 + 검은 와이어 테이블 + 금색 펜던트
box("Garden_Brick_Wall", 2.0, 8.25, 0, 4.7, 8.32, 2.6, M["brick_slate"])
for k in range(13):  # 벽돌 줄눈
    z = 0.2 * (k + 1)
    box(f"Garden_Brick_Line_{k}", 2.0, 8.245, z, 4.7, 8.25, z + 0.012, M["mat_dark"])
box("Garden_Frame_Top", 1.95, 8.2, 2.6, 4.75, 8.32, 2.68, M["frame_black"])
box("Garden_Frame_L", 1.95, 8.2, 0, 2.0, 8.32, 2.68, M["frame_black"])
box("Garden_Frame_R", 4.7, 8.2, 0, 4.75, 8.32, 2.68, M["frame_black"])
box("Garden_Planter_Bed", 2.0, 7.85, 0, 4.7, 8.25, 0.32, M["dark_cab"])
for k, (x, c) in enumerate([(2.25, "green_dark"), (2.65, "white"), (3.05, "plant"), (3.45, "pink_back"),
                            (3.85, "plant"), (4.25, "white"), (4.55, "green_dark")]):
    leaf_ball(f"Garden_Flower_{k}", x, 8.05, 0.42, 0.17, M[c])
cyl("Garden_Bamboo_Stem", 2.55, 8.05, 0.32, 0.025, 1.6, M["wood_light"], 6)
for k, (dz, r) in enumerate([(1.9, 0.3), (1.5, 0.34), (1.1, 0.28)]):
    leaf_ball(f"Garden_Bamboo_Leaves_{k}", 2.55 + (k - 1) * 0.08, 8.0, dz, r, M["plant"])
for k, (dx, dz) in enumerate([(-0.15, 1.3), (0.1, 1.6), (0.25, 1.15), (0.0, 0.85)]):  # 극락조화
    cbox(f"Garden_BirdParadise_Leaf_{k}", 4.15 + dx, 8.05, dz - 0.35, 0.18, 0.04, 0.7, M["green_dark"])
for k in range(5):  # 위에서 늘어진 덩굴
    leaf_ball(f"Garden_Hanging_Vine_{k}", 2.3 + k * 0.55, 8.15, 2.35 - (k % 2) * 0.2, 0.16, M["plant"])
for k, (x, z) in enumerate([(3.15, 1.95), (3.45, 2.2)]):  # 금색 기하학 펜던트 + 전구
    cyl(f"Garden_Pendant_Cord_{k}", x, 7.75, z + 0.3, 0.006, 0.9, M["black"], 6)
    cyl(f"Garden_Pendant_Gold_{k}", x, 7.75, z, 0.13, 0.3, M["gold"], 6, r2=0.0)
    leaf_ball(f"Garden_Pendant_Bulb_{k}", x, 7.75, z + 0.08, 0.06, M["amber"])
for k, x in enumerate([2.55, 4.15]):  # 흰 쉘 의자 (회색 방석, 원목 다리)
    c = f"Shell_Chair_{k + 1}"
    for j, (dx, dy) in enumerate([(-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2)]):
        cbox(f"{c}_Leg_{j}", x + dx, 7.25 + dy, 0, 0.035, 0.035, 0.4, M["wood_light"])
    cbox(f"{c}_Seat", x, 7.25, 0.4, 0.58, 0.55, 0.1, M["gray_fabric"])
    cyl(f"{c}_Shell", x, 7.5, 0.42, 0.32, 0.55, M["white"], 20, r2=0.36)
    if k == 0:
        cbox(f"{c}_Pillow", x, 7.38, 0.5, 0.36, 0.14, 0.22, M["gray_fabric"])
cyl("Wire_Table_Base", 3.35, 7.35, 0, 0.3, 0.42, M["frame_black"], 16, r2=0.34)
cyl("Wire_Table_Top", 3.35, 7.35, 0.42, 0.34, 0.03, M["black"], 20)
# 나무 기둥 + 고무나무 (검은 화분)
box("Lounge_Wood_Column", 4.8, 7.75, 0, 5.4, 8.4, 3.2, M["wood_panel"])
box("Lounge_Dark_Panel", 5.4, 8.25, 0, 6.66, 8.33, 3.2, M["dark_cab"])
cbox("Ficus_Pot", 5.75, 7.95, 0, 0.32, 0.32, 0.65, M["black"])
cyl("Ficus_Stem", 5.75, 7.95, 0.65, 0.02, 0.8, M["wood_dark"], 6)
for k, z in enumerate([1.0, 1.25, 1.5]):
    leaf_ball(f"Ficus_Leaves_{k}", 5.75 + (k - 1) * 0.05, 7.95, z, 0.2, M["green_dark"])

# =====================================================================
#  5-2) 수면실 (휴게 라운지 북쪽 빈 공간 · 안마의자 3대)
# =====================================================================
floor("SleepRoom_Floor", 1.7, 8.4, 6.7, 15.0, M["cushion_gray"])
wall("SleepRoom_East_Wall", 6.7, 8.4, 6.7, 15.0, M["wall_white"])
wall("SleepRoom_North_Wall", 1.7, 15.0, 6.7, 15.0, M["wall_white"])
box("SleepRoom_South_Panel", 1.78, 8.48, 0, 6.62, 8.5, 3.0, M["panel_white"])
box("SleepRoom_Blind", 6.58, 9.0, 1.0, 6.62, 14.4, 2.8, M["blind"])
box("SleepRoom_Rug", 2.3, 10.6, 0, 6.2, 13.0, 0.01, M["mat_purple"])


def massage_chair(name, x, y):
    """안마의자: 남쪽을 바라봄 (등받이 북쪽, 다리 받침 남쪽)"""
    cbox(f"{name}_Base", x, y, 0, 0.82, 1.1, 0.35, M["black"])
    cbox(f"{name}_Seat", x, y - 0.05, 0.35, 0.6, 0.6, 0.15, M["wood_dark"])
    cbox(f"{name}_Arm_L", x - 0.33, y, 0.35, 0.16, 0.85, 0.42, M["black"])
    cbox(f"{name}_Arm_R", x + 0.33, y, 0.35, 0.16, 0.85, 0.42, M["black"])
    back = cbox(f"{name}_Back", x, y + 0.42, 0.45, 0.62, 0.22, 0.95, M["wood_dark"])
    back.rotation_euler.x = -0.35  # 뒤로 젖힌 등받이
    cbox(f"{name}_Head_Pillow", x, y + 0.6, 1.25, 0.4, 0.16, 0.22, M["mesh_black"])
    leg = cbox(f"{name}_Leg_Rest", x, y - 0.62, 0.05, 0.5, 0.2, 0.45, M["wood_dark"])
    leg.rotation_euler.x = -0.5
    cbox(f"{name}_Remote", x + 0.33, y - 0.3, 0.77, 0.08, 0.14, 0.03, M["steel"])


for i, x in enumerate([2.75, 4.2, 5.65]):
    massage_chair(f"Massage_Chair_{i + 1}", x, 14.1)
for i, x in enumerate([3.48, 4.93]):  # 의자 사이 작은 탁자 + 물병
    cyl(f"SleepRoom_SideTable_{i + 1}", x, 14.3, 0, 0.18, 0.5, M["white"], 16)
    cyl(f"SleepRoom_Bottle_{i + 1}", x, 14.3, 0.5, 0.04, 0.2, M["glass"], 10)
cbox("SleepRoom_Coat_Rack_Base", 2.1, 8.9, 0, 0.35, 0.35, 0.04, M["black"])
cyl("SleepRoom_Coat_Rack", 2.1, 8.9, 0.04, 0.025, 1.7, M["black"], 8)
cbox("SleepRoom_Blanket_Shelf", 6.35, 10.4, 0, 0.5, 1.2, 0.9, M["wood_light"])
for i, z in enumerate([0.9, 1.02]):
    cbox(f"SleepRoom_Blanket_{i + 1}", 6.35, 10.4, z, 0.42, 0.9, 0.12, M["fabric_blue"] if i else M["cushion_gray"])
dracaena("SleepRoom_Plant", 6.3, 8.95, 1.5)
T("SleepRoom_Wall_Text", "잠시 쉬어도 괜찮아요", 4.2, 14.9, 2.4, 2.4, 0.22, M["text_navy"], facing="S", fallback="TAKE A BREAK")

# =====================================================================
#  6) 상담실 — 중앙 기둥 줄을 기준으로 남·북 양쪽에 5줄씩
#     · 한 줄 = 가운데 칸막이를 사이에 두고 마주 보는 2열 × 5칸 (10석)
#     · 회의실 복도 쪽 줄 끝: 철제 프레임 + 다이아 메시 + 회색 패브릭 + 나무 화분함 칸막이
#     · 기둥 쪽 줄 끝: 칸막이 없이 가로로 놓인 팀장 좌석 (팀원 쪽을 바라봄)
# =====================================================================
LINE_X = [-17.3, -13.85, -10.4, -6.95, -3.5]  # 각 줄의 가운데 칸막이 x
PITCH = 1.3  # 자리 간격
NSEAT = 5  # 한 열의 칸 수
PILLAR_Y = 5.3  # 중앙 기둥 줄
# 각 구역: (상담석 시작 y, 끝 y, 팀장 책상 쪽 y 방향)
# 팀장석은 두 구역 모두 줄의 북쪽 끝 (북쪽 구역은 창가 쪽 팀장석 자리만큼 남쪽으로 당김)
HALVES = {"S": (-3.7, -3.7 + NSEAT * PITCH, +1), "N": (6.68, 6.68 + NSEAT * PITCH, +1)}


def office_chair_x(name, x, y, face_x):
    """x 방향을 바라보는 메시 의자 (face_x=-1 → 서쪽 책상을 봄)"""
    cyl(f"{name}_Base", x, y, 0, 0.26, 0.42, M["black"], 10, r2=0.04)
    cbox(f"{name}_Seat", x, y, 0.42, 0.46, 0.48, 0.07, M["mesh_black"])
    cbox(f"{name}_Back", x - face_x * 0.24, y, 0.49, 0.05, 0.44, 0.55, M["mesh_black"])


for h, (y0, y1, lead_dir) in HALVES.items():
    for li, sx in enumerate(LINE_X):
        L = f"Line_{h}{li + 1}"
        # 가운데 칸막이 (청회색 + 흰 테두리)
        box(f"{L}_Spine", sx - 0.03, y0, 0, sx + 0.03, y1, 1.2, M["fabric_blue"])
        box(f"{L}_Spine_Trim", sx - 0.04, y0, 1.2, sx + 0.04, y1, 1.23, M["white"])
        for k in range(NSEAT + 1):  # 자리 사이 칸막이 (양쪽)
            yy = y0 + k * PITCH
            box(f"{L}_Side_{k}", sx - 0.7, yy - 0.025, 0, sx + 0.7, yy + 0.025, 1.1, M["fabric_blue"])
        for side, sg in (("W", -1), ("E", 1)):
            for k in range(NSEAT):
                q = f"{L}_{side}{k + 1}"
                cy = y0 + (k + 0.5) * PITCH
                cbox(f"{q}_Desk_Top", sx + sg * 0.36, cy, 0.7, 0.66, 1.2, 0.035, M["desk_white"])
                cbox(f"{q}_Mobile_Pedestal", sx + sg * 0.33, cy + 0.36, 0, 0.55, 0.4, 0.62, M["white"])
                cbox(f"{q}_Mon_L", sx + sg * 0.14, cy - 0.24, 0.78, 0.03, 0.46, 0.3, M["black"])
                cbox(f"{q}_Mon_R", sx + sg * 0.14, cy + 0.24, 0.78, 0.03, 0.46, 0.3, M["black"])
                office_chair_x(f"{q}_Chair", sx + sg * 1.05, cy, -sg)
        for k in range(0, NSEAT, 2):
            pothos(f"{L}_Top_Plant_{k}", sx, y0 + (k + 0.5) * PITCH, 1.23, 0.85)
        if li % 2 == 0:
            cbox(f"{L}_Pink_Umbrella", sx + 0.1, y0 + 0.4, 0.2, 0.08, 0.08, 0.55, M["umbrella"])
        ex0, ex1 = sx - 1.35, sx + 1.35  # 줄 전체 폭
        if h == "S":
            # 회의실 복도 쪽 끝 (사진): 철제 프레임 + 메시 + 회색 패브릭 + 화분함 + 나무 상판
            e, ey = f"{L}_AisleEnd", y0
            for k, xx in enumerate((ex0, sx - 0.03, ex1 - 0.06)):
                box(f"{e}_Frame_{k}", xx, ey - 0.05, 0, xx + 0.06, ey + 0.05, 1.28, M["frame_black"])
            box(f"{e}_Frame_Bottom", ex0, ey - 0.05, 0, ex1, ey + 0.05, 0.06, M["frame_black"])
            box(f"{e}_Frame_Mid", ex0, ey - 0.05, 0.62, ex1, ey + 0.05, 0.66, M["frame_black"])
            box(f"{e}_Diamond_Mesh", ex0 + 0.06, ey - 0.02, 0.06, ex1 - 0.06, ey + 0.02, 0.62, M["mesh_black"])
            box(f"{e}_Gray_Fabric", ex0 + 0.06, ey - 0.03, 0.66, ex1 - 0.06, ey + 0.03, 1.22, M["cushion_gray"])
            box(f"{e}_Wood_Top", ex0 - 0.03, ey - 0.12, 1.28, ex1 + 0.03, ey + 0.12, 1.32, M["wood_light"])
            for k, bx in enumerate((ex0 + 0.2, sx + 0.2)):
                box(f"{e}_Planter_Box_{k}", bx, ey - 0.3, 0.62, bx + 0.6, ey - 0.05, 0.92, M["wood_light"])
                leaf_ball(f"{e}_Planter_Leaves_{k}", bx + 0.3, ey - 0.18, 1.02, 0.2, M["plant"])
            pothos(f"{e}_Top_Plant_1", ex0 + 0.4, ey, 1.32, 1.1)
            pothos(f"{e}_Top_Plant_2", ex1 - 0.4, ey, 1.32, 1.0)
        # 북쪽 끝: 칸막이 없음, 가로로 놓인 팀장 좌석 (팀원 쪽을 바라봄)
        ty0 = y1  # 줄 끝
        dy = ty0 + lead_dir * 0.35  # 책상 가운데
        cbox(f"{L}_Leader_Desk", sx, dy, 0.7, 2.0, 0.7, 0.035, M["desk_white"])
        cbox(f"{L}_Leader_Desk_Panel", sx, dy - lead_dir * 0.32, 0, 2.0, 0.04, 0.7, M["white"])
        cbox(f"{L}_Leader_Pedestal", sx + 0.7, dy, 0, 0.45, 0.55, 0.62, M["white"])
        cbox(f"{L}_Leader_Mon_L", sx - 0.25, dy - lead_dir * 0.18, 0.74, 0.46, 0.03, 0.3, M["black"])
        cbox(f"{L}_Leader_Mon_R", sx + 0.25, dy - lead_dir * 0.18, 0.74, 0.46, 0.03, 0.3, M["black"])
        office_chair(f"{L}_Leader_Chair", sx, ty0 + lead_dir * 1.1, -lead_dir)
        T(f"{L}_Leader_Plate", f"{li + 1}팀 팀장", sx, dy - lead_dir * 0.36, 0.55, 0.5, 0.08, M["text_navy"],
          facing="S", fallback=f"TEAM {li + 1}")

# 중앙 기둥 줄 (나무 + 라임 측면 + 노란 에티켓 보드 + 화재경보기 + 소화기)
for i, px in enumerate([-14.7, -10.1, -5.5]):
    c, py = f"Pillar_{i}", PILLAR_Y
    cbox(f"{c}_Wood_Core", px, py, 0, 0.62, 0.78, 3.1, M["wood_panel"])
    cbox(f"{c}_Lime_W", px - 0.33, py, 0, 0.05, 0.78, 3.1, M["lime_green"])
    cbox(f"{c}_Lime_E", px + 0.33, py, 0, 0.05, 0.78, 3.1, M["lime_green"])
    for f, sgn in (("S", -1), ("N", 1)):
        box(f"{c}_Yellow_Etiquette_Board_{f}", px - 0.22, py + sgn * 0.39 - 0.01, 1.0, px + 0.22, py + sgn * 0.39 + 0.01, 1.9, M["phone_yellow"])
        T(f"{c}_Etiquette_Text_{f}", "모두 행복", px, py + sgn * 0.42, 1.75, 0.38, 0.09, M["text_dark"], facing=f, fallback="SMILE")
    box(f"{c}_Fire_Alarm", px - 0.22, py + 0.39, 1.3, px - 0.12, py + 0.41, 1.6, M["ext_red"])
    ext(f"{c}_Ext", px + 0.56, py)

# 북쪽: 창 + 롤 블라인드 + 낮은 수납장 + 하얀 수납장 + 공기청정기
wall("North_Window_Wall", -18.8, 15.8, -0.8, 15.8, M["wall_white"])
wall("Counsel_West_Wall", -18.8, -7.9, -18.8, 15.8, M["wall_white"])
box("North_Roller_Blind", -18.6, 15.68, 0.9, -0.9, 15.72, 2.9, M["roller"])
box("North_Low_WoodCab", -18.5, 15.1, 0, -1.0, 15.6, 0.7, M["wood_light"])
for i, x in enumerate([-12.2, -5.3]):
    cbox(f"North_White_2Door_Cab_{i + 1}", x, 14.85, 0, 1.05, 0.45, 1.1, M["white"])
    cyl(f"Air_Purifier_{i + 1}", x + 1.0, 14.85, 0, 0.18, 0.72, M["white"], 20)
    cyl(f"Air_Purifier_Top_{i + 1}", x + 1.0, 14.85, 0.72, 0.13, 0.03, M["ksqi_blue"], 20)
# 현수막 (사진): "전 산업군 1위 KSQI '고객감동콜센터' / 통신업계 1위 KS-CQI '최우수기업' 달성"
#  이미지: blender/tex/ksqi_banner.jpg (make_banner.py 로 만듦) → GLB 안에 함께 들어감
BANNER_CANDIDATES = [
    r"C:\Users\User\company-metaverse\blender\tex\ksqi_banner.jpg",
    os.path.join(os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else "", "tex", "ksqi_banner.jpg"),
]


def image_banner(name, path, cx, y, z1, w, h):
    """남쪽(-Y)을 바라보는 그림 현수막 (y 위치의 벽 앞에 걸림)"""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in [(cx - w / 2, y, z1), (cx + w / 2, y, z1), (cx + w / 2, y, z1 + h), (cx - w / 2, y, z1 + h)]]
    face = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new()
    for loop, co in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop[uv].uv = co
    bm.normal_update()
    if face.normal.y > 0:
        face.normal_flip()
    bm.to_mesh(mesh)
    bm.free()
    m = bpy.data.materials.new(name + "_Mat")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return obj


BANNER_PATH = next((p for p in BANNER_CANDIDATES if p and os.path.isfile(p)), None)
if BANNER_PATH:
    box("North_KSQI_Banner_Bar", -12.1, 15.62, 3.0, -5.9, 15.68, 3.04, M["frame_black"])  # 걸이 봉
    image_banner("North_KSQI_Banner", BANNER_PATH, -9.0, 15.6, 1.62, 6.0, 1.4)
else:
    T("North_Banner", "전 산업군 1위 KSQI 고객감동콜센터", -9.0, 15.66, 2.6, 5.0, 0.32, M["text_navy"], facing="S", fallback="KSQI No.1")
# 복도 쪽 낮은 칸막이 (화분 레일 · 철제 프레임) — 중앙 통로(4.1~6.5)는 비워 둠
for i, (ya, yb) in enumerate([(-3.6, -1.4), (-0.4, 1.8), (2.8, 4.1), (6.5, 8.7), (9.7, 11.9), (12.9, 14.6)]):
    l, ly, hl = f"LowDiv_{i + 1}", (ya + yb) / 2, (yb - ya) / 2
    box(f"{l}_Frame", -1.18, ya, 0, -1.12, yb, 1.32, M["frame_black"])
    box(f"{l}_BotMesh", -1.2, ya + 0.02, 0.08, -1.1, yb - 0.02, 0.6, M["mesh_black"])
    box(f"{l}_MidFabric", -1.18, ya + 0.02, 0.6, -1.12, yb - 0.02, 1.2, M["fabric_blue"])
    box(f"{l}_TopWoodShelf", -1.32, ya, 1.24, -0.98, yb, 1.3, M["wood_light"])
    for k in range(max(1, int((yb - ya) / 0.8))):
        pothos(f"{l}_Pothos_{k}", -1.15, ya + 0.4 + k * 0.8, 1.3, 0.9)

# =====================================================================
#  7) 남쪽 회의실 줄 (상담석 입구 쪽) + 가운데 복사기 통로 → 바깥 복도
# =====================================================================
MY0, MY1 = -7.9, -5.3  # 회의실 뒷벽 · 앞 유리벽
box("Meeting_Back_Panel_W", -18.8, -7.93, 0, -12.4, -7.9, 3.0, M["panel_white"])
box("Meeting_Back_Panel_E", -9.8, -7.93, 0, -1.15, -7.9, 3.0, M["panel_white"])
wall("Meeting_East_End_Wall", -1.15, MY0, -1.15, MY1, M["wood_panel"])
# 출입구 왼쪽 벽 (사진): 나무 패널 벽 + LG U+ | NAVER Clova TV + 큰 드라세나 2개 + 철제 선반 + 소화기
EW = -1.07  # 벽면 (복도 쪽)
for k, yy in enumerate((-7.25, -6.6, -5.95)):  # 나무 패널 줄눈
    box(f"Entrance_Wood_Seam_V{k}", EW, yy - 0.006, 0, EW + 0.006, yy + 0.006, 3.0, M["wood_dark"])
box("Entrance_Wood_Seam_H", EW, MY0, 2.4, EW + 0.006, MY1, 2.41, M["wood_dark"])
tv("Clova_TV", EW, -6.6, 1.35, 1.2, 0.7, "E")
cbox("Clova_TV_Screen_White", EW + 0.075, -6.6, 1.39, 0.01, 1.1, 0.62, M["screen_proj"])
T("Clova_TV_Logo", "LG U+", EW + 0.085, -6.78, 1.7, 0.26, 0.07, M["magenta"], facing="E")
T("Clova_TV_Text", "NAVER Clova", EW + 0.085, -6.42, 1.7, 0.3, 0.06, M["text_dark"], facing="E")
SX = EW + 0.18  # 선반 (검은 프레임 + 나무 판)
for k, yy in enumerate((-7.2, -6.6, -6.0)):
    for j, xx in enumerate((SX - 0.12, SX + 0.12)):
        cbox(f"TV_Shelf_Post_{k}_{j}", xx, yy, 0, 0.025, 0.025, 0.95, M["frame_black"])
for k, z in enumerate((0.05, 0.4, 0.92)):
    cbox(f"TV_Shelf_Board_{k + 1}", SX, -6.6, z, 0.28, 1.22, 0.03, M["wood_light"])
pothos("TV_Shelf_Plant_1", SX, -6.9, 0.43, 0.9)
pothos("TV_Shelf_Plant_2", SX, -6.25, 0.08, 0.8)
cyl("TV_Shelf_Vase", SX, -6.25, 0.95, 0.05, 0.22, M["glass"], 10)
leaf_ball("TV_Shelf_Monstera", SX, -6.25, 1.28, 0.13, M["green_dark"])
cyl("TV_Shelf_Flower_Vase", SX, -6.95, 0.95, 0.03, 0.15, M["glass"], 8)
leaf_ball("TV_Shelf_Flower", SX, -6.95, 1.13, 0.05, M["umbrella"])
for k, yy in enumerate((-7.55, -5.65)):  # 흰 화분 커버 + 큰 드라세나
    cyl(f"Entrance_Pot_Cover_{k + 1}", EW + 0.3, yy, 0, 0.25, 0.55, M["banner_white"], 16, r2=0.21)
    cyl(f"Entrance_Trunk_{k + 1}", EW + 0.3, yy, 0.55, 0.05, 1.6, M["wood_light"], 8)
    for j, (dy, z, r) in enumerate(((0, 2.25, 0.42), (0.1, 1.75, 0.3), (-0.12, 1.15, 0.32))):
        leaf_ball(f"Entrance_Dracaena_{k + 1}_{j}", EW + 0.3, yy + dy, z, r, M["plant"] if j % 2 else M["green_dark"])
ext("Entrance_Extinguisher", EW + 0.2, -5.42)
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
print(f"[{FLOOR_NO}F] 오브젝트 {len(col.objects)}개 생성 완료")
if EXPORT_PATH:
    export_dir = os.path.dirname(EXPORT_PATH)
    if os.path.isdir(export_dir):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.export_scene.gltf(filepath=EXPORT_PATH, export_format="GLB", use_selection=False,
                                  export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
        print(f"[{FLOOR_NO}F] 내보내기 완료 → {EXPORT_PATH}")
    else:
        print(f"[{FLOOR_NO}F] 내보내기 폴더가 없어 건너뜀: {export_dir}  (EXPORT_PATH 를 고쳐 주세요)")
