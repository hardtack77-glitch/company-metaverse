# =====================================================================
#  LG유플러스 대구고객센터 1층 — 블렌더 맵 생성 스크립트 v2 (Blender 5.x)
#
#  · 구역 위치는 기존 1F.blend(제미나이 버전) 좌표를 그대로 따름
#      회전문(-1.2,-9.6) · 엘리베이터홀(X -8.7~-2.35, Y -8.5~-4.6)
#      그린월 복도(X -2.35~0) · 안내데스크(X 3.2, 서쪽을 바라봄)
#      북카페·다트 라운지(X 0~7, Y -2.3~3.7) · 탕비실(Y -2.8)
#      카페테리아(X 7.8~13, Y -6.8~-1.2) · 교육 복도(Y 4.4~6.6)
#      사물함 복도(X 7.1~9.3) · 북측 복도와 일반강의장1·2·강사실
#    (겹치던 물체 몇 개만 몇십 cm 옮김: 하이백 소파, 제빙기, 카페 정수기·바 스툴)
#  · 실내 사진 16장 + 영상으로 디테일 보강
#
#  사용법: Blender → Scripting 탭 → Open → 이 파일 → ▶ Run Script
#          → 장면을 새로 만들고 EXPORT_PATH 로 floor_1f.glb 를 바로 내보냄
#
#  게임 규칙 (company-metaverse 와 맞춤)
#    · 바닥 윗면 = Z 0, 단위 1 = 1m, 정문(회전문)은 남쪽(-Y)
#    · 이름에 Door 가 들어간 물체 = 캐릭터가 통과 (문)
#    · 이름이 Ceiling_ 으로 시작 = 게임에서 숨김 (천장·조명)
#    · 웹 좌표 변환: 블렌더 (X, Y, Z) → 웹 [X, Z, -Y]
# =====================================================================
import bpy
import bmesh
import math
import os

EXPORT_PATH = r"C:\Users\User\company-metaverse\client\public\floor_1f.glb"
EXPORT_PATH = os.environ.get("FLOOR1F_EXPORT", EXPORT_PATH)  # (테스트용 경로 덮어쓰기)
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

col = bpy.data.collections.get("Floor_1F") or bpy.data.collections.new("Floor_1F")
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
#  0) 바닥
# =====================================================================
floor("Plaza_Granite_Floor", -9.5, -14, 14, -10, M["plaza"])
for i in range(-9, 14, 2):
    box(f"Plaza_Grout_{i}", i, -14, 0.0, i + 0.03, -10, 0.004, M["mat_dark"])
floor("Lobby_Marble_Floor", -8.7, -10, 7.8, -2.3, M["marble"])        # 로비·엘리베이터홀·안내데스크·탕비실 앞
floor("GreenWall_Corridor_Floor", -2.45, -2.3, 0, 6.8, M["marble"])    # 그린월 복도
floor("North_Exit_Outdoor_Floor", -3.0, 6.8, 1.0, 8.6, M["plaza"])     # 북측 출입문 밖
floor("Restroom_Recess_Floor_1", -4.3, -2.05, -2.45, -0.75, M["marble"])
floor("Restroom_Recess_Floor_2", -4.3, 1.55, -2.45, 2.85, M["marble"])
floor("Lounge_Wood_Floor", 0, -2.3, 7.0, 3.75, M["wood_floor"])        # 북카페·다트 라운지
floor("Cafe_Wood_Floor", 7.8, -6.8, 13.0, -1.2, M["wood_floor"])       # 카페테리아
floor("Training_Entry_Corr_Floor", 0, 4.45, 9.4, 6.6, M["office_floor"])
floor("Meeting_Rooms_Floor", 0, 6.6, 7.1, 9.6, M["office_floor"])
floor("Locker_Corridor_Floor", 7.1, -0.6, 9.4, 4.45, M["office_floor"])
floor("CompRoom1_Floor", 9.4, -1.05, 13.0, 4.45, M["office_floor"])
floor("North_Training_Corr_Floor", 7.1, 6.6, 9.4, 18.8, M["office_floor"])
floor("L1_Floor_Gray", 9.4, 6.0, 16.2, 10.6, M["office_floor"])
floor("L1_Floor_Wood_Stage", 16.2, 6.0, 17.6, 10.6, M["wood_floor"], top=0.12)
floor("L2_Floor_Gray", 9.4, 10.6, 17.6, 15.4, M["office_floor"])
floor("Instructor_Room_Floor", 9.4, 15.4, 15.6, 18.8, M["office_floor"])

# =====================================================================
#  1) 정면 외관 · 원통형 회전문 (회전문 중심 X -1.2, Y -9.6)
# =====================================================================
RX, RY = -1.2, -9.6
wall("Facade_Glass_West", -8.7, -10, -2.35, -10, M["glass"], h=4.2, t=0.06)
wall("Facade_Glass_East", 1.25, -10, 13.0, -10, M["glass"], h=4.2, t=0.06)
for i, x in enumerate([-8.7, -6.6, -4.5, -2.35, 1.25, 3.0, 4.5, 6.5, 8.5, 10.5, 13.0]):
    cbox(f"Facade_Mullion_{i + 1}", x, -10, 0, 0.1, 0.12, 4.2, M["steel"])
box("Facade_Upper_Glass", -2.35, -10.03, 2.75, 1.25, -9.97, 4.2, M["glass"])
box("Ceiling_Entrance_Canopy", -6, -13.2, 3.6, 4, -10, 3.8, M["steel"])
box("Entrance_Sign_Panel", -3.4, -10.35, 2.45, 1.4, -10.2, 3.35, M["marble_wall"])
T("Entrance_Sign_Text", "LG U+", -1.0, -10.42, 2.85, 2.9, 0.55, M["magenta"], "S", extrude=0.03)  # 빨간 원 없이 로고 글자만
for i in range(12):
    a = i / 12 * 2 * math.pi
    if abs(math.sin(a)) > 0.75:  # 남북 출입구는 비움
        continue
    cbox(f"Revolving_Door_Drum_Glass_{i + 1}", RX + 1.1 * math.cos(a), RY + 1.1 * math.sin(a), 0, 0.06, 0.58, 2.6,
         M["glass"], rot_z=a)
cyl("Revolving_Door_Top_Ring", RX, RY, 2.6, 1.17, 0.25, M["steel"], 32)
# 회전문 위 링 정면(남쪽·밖)과 안쪽(북쪽)에 안내데스크와 같은 LG U+ 로고
T("Revolving_Door_Logo_Out", "LG U+", RX, RY - 1.2, 2.66, 0.95, 0.15, M["magenta"], "S", extrude=0.01)
T("Revolving_Door_Logo_In", "LG U+", RX, RY + 1.2, 2.66, 0.95, 0.15, M["magenta"], "N", extrude=0.01)
cyl("Revolving_Door_Center_Post", RX, RY, 0, 0.07, 2.6, M["steel"], 12)
for i in range(4):
    cbox(f"Revolving_Door_Wing_{i + 1}", RX + 0.52 * math.cos(i * math.pi / 2 + 0.4),
         RY + 0.52 * math.sin(i * math.pi / 2 + 0.4), 0.05, 1.0, 0.04, 2.45, M["glass"], rot_z=i * math.pi / 2 + 0.4)
cbox("Entrance_Swing_Door_Glass", 0.65, -10, 0, 1.1, 0.05, 2.5, M["glass"])
cbox("Entrance_Swing_Door_Frame", 0.65, -10, 2.5, 1.25, 0.12, 0.15, M["steel"])
box("Facade_Glass_Fill", -0.1, -10.03, 0, 0.1, -9.97, 2.75, M["glass"])
for i in range(4):
    box(f"Entrance_Mat_Stripe_{i + 1}", -2.2, -8.4 + i * 0.35, 0, -0.2, -8.25 + i * 0.35, 0.008, M["mat_dark"])
# 회전문 안쪽 빨간 차단줄 스탠드 (사진: 회전문 앞 차단봉)
for i, x in enumerate([0.2, 1.1]):
    cyl(f"Lobby_Stanchion_Post_{i + 1}", x, -8.9, 0, 0.04, 0.95, M["steel"], 10)
    cyl(f"Lobby_Stanchion_Base_{i + 1}", x, -8.9, 0, 0.16, 0.03, M["steel"], 16)
box("Lobby_Stanchion_Rope", 0.2, -8.92, 0.85, 1.1, -8.88, 0.89, M["red_leather"])

# =====================================================================
#  2) 엘리베이터 홀 (사진 2·3) — 남쪽 벽: Information + 브론즈 엘리베이터 2기
#                               서쪽 벽: '일상을 바꿉니다 U+5G'
#                               북쪽 벽: U+tv · IoT@home 체험대 + AED
# =====================================================================
wall("ElevHall_South_Wall", -8.7, -8.5, -2.35, -8.5, M["bianco"], openings=[(1.35, 2.45, 2.3), (3.55, 4.65, 2.3)])
wall("ElevHall_Corner_Wall", -2.35, -10, -2.35, -8.5, M["bianco"])
wall("ElevHall_West_Wall", -8.7, -8.5, -8.7, -4.6, M["bianco"], openings=[(2.75, 3.65, 2.25)])
wall("ElevHall_North_Wall", -8.7, -4.6, -2.35, -4.6, M["bianco"], openings=[(0.3, 1.2, 2.25)])
# 대리석 결 (얇은 회색 사선)
for i, (x, z) in enumerate([(-7.9, 1.1), (-5.6, 2.2), (-3.4, 0.6), (-2.8, 2.6)]):
    o = cbox(f"ElevHall_Marble_Vein_{i + 1}", x, -8.42, z, 0.9, 0.005, 0.012, M["vein"])
    o.rotation_euler.y = 0.5
for i, ex in enumerate([-6.8, -4.6]):
    cbox(f"Elev_Bronze_Door_{i + 1}_L", ex - 0.27, -8.47, 0, 0.53, 0.05, 2.3, M["bronze"])
    cbox(f"Elev_Bronze_Door_{i + 1}_R", ex + 0.27, -8.47, 0, 0.53, 0.05, 2.3, M["bronze"])
    box(f"Elev_Black_Jamb_{i + 1}_L", ex - 0.62, -8.44, 0, ex - 0.55, -8.4, 2.35, M["charcoal"])
    box(f"Elev_Black_Jamb_{i + 1}_R", ex + 0.55, -8.44, 0, ex + 0.62, -8.4, 2.35, M["charcoal"])
    box(f"Elev_Black_Glass_Transom_{i + 1}", ex - 0.62, -8.44, 2.35, ex + 0.62, -8.4, 3.2, M["charcoal"])
    box(f"Elev_Floor_Indicator_{i + 1}", ex - 0.28, -8.39, 2.62, ex + 0.28, -8.37, 2.78, M["white"])
    T(f"Elev_Floor_Indicator_Text_{i + 1}", "▲ 2" if i == 0 else "1", ex, -8.36, 2.7, 0.3, 0.1, M["text_red"], "N")
    cbox(f"Elev_Call_Button_{i + 1}", ex + 0.85, -8.43, 1.0, 0.1, 0.03, 0.22, M["steel"])
T("Elev_Gold_Floor_Number", "1", -5.7, -8.41, 2.05, 0.14, 0.26, M["gold"], "N", extrude=0.02)
# Information 층별 안내판 (사진 2)
box("Info_Directory_Board", -3.55, -8.43, 0.75, -2.6, -8.39, 2.3, M["white"])
# (북쪽을 바라보는 판: 보는 사람 기준 왼쪽 = +X)
T("Info_Directory_Title", "Information", -2.88, -8.37, 2.13, 0.45, 0.08, M["text_dark"], "N")
T("Info_Directory_Logo", "LG U+", -3.38, -8.37, 2.13, 0.2, 0.05, M["magenta"], "N")
FLOORS_INFO = [("9F", "대구고객센터"), ("8F", "대구고객센터"), ("7F", "대구고객센터"), ("6F", "대구고객센터"),
               ("5F", "Core인프라운영팀"), ("4F", "Core인프라운영팀"), ("3F", "Core인프라운영팀"),
               ("2F", "경북인프라담당"), ("1F", "대구고객센터"), ("B1", "주차장"), ("B2", "주차장"),
               ("B3", "주차장"), ("B4", "관리사무실")]
for i, (fl, name) in enumerate(FLOORS_INFO):
    z = 1.98 - i * 0.085
    box(f"Info_Floor_Tab_{i + 1}", -2.77, -8.385, z - 0.035, -2.62, -8.375, z + 0.035, M["text_navy"])
    T(f"Info_Floor_Num_{i + 1}", fl, -2.695, -8.37, z, 0.09, 0.045, M["white"], "N")
    T(f"Info_Floor_Name_{i + 1}", name, -3.15, -8.37, z, 0.5, 0.04, M["text_dark"], "N", fallback=name.encode("ascii", "ignore").decode() or "Floor")
box("Info_Directory_Swoosh", -3.5, -8.385, 0.85, -2.75, -8.375, 0.9, M["text_red"])
# 서쪽 벽 그래픽: 일상을 바꿉니다 / U+5G (사진 2 오른쪽)
T("ElevHall_Graphic_Line1", "일상을", -8.6, -7.0, 1.95, 0.9, 0.3, M["text_dark"], "E", fallback="Change")
T("ElevHall_Graphic_Line2", "바꿉니다", -8.6, -7.0, 1.6, 1.2, 0.3, M["text_dark"], "E", fallback="Everyday")
box("ElevHall_Graphic_Bar", -8.62, -7.55, 2.15, -8.6, -6.6, 2.2, M["magenta"])
T("ElevHall_Graphic_U5G", "U+5G", -8.6, -7.0, 1.25, 0.75, 0.22, M["magenta"], "E")
cbox("ElevHall_West_Dark_Door", -8.62, -5.3, 0, 0.05, 0.9, 2.25, M["charcoal"])
cbox("ElevHall_Card_Reader", -8.6, -6.0, 1.15, 0.03, 0.1, 0.16, M["white"])
# 북쪽 벽: U+tv 체험대 + IoT@home 체험대 + AED + 소화기 (사진 3)
cbox("ElevHall_North_Dark_Door", -7.65, -4.68, 0, 0.9, 0.05, 2.25, M["charcoal"])
box("UplusTV_Wood_Panel", -6.3, -4.75, 0.75, -4.6, -4.68, 2.65, M["wood_panel"])
cbox("UplusTV_White_Cabinet", -5.45, -4.95, 0, 1.6, 0.45, 0.72, M["white"])
cbox("UplusTV_Cabinet_Top", -5.45, -4.95, 0.72, 1.62, 0.47, 0.04, M["wood_panel"])
tv("UplusTV_Screen", -5.45, -4.75, 1.25, 1.25, 0.72, "S")
T("UplusTV_Sign", "U+tv", -5.45, -4.79, 2.35, 0.5, 0.16, M["neon_pink"], "S")
box("IoT_Home_Wood_Panel", -4.45, -4.75, 0.75, -3.35, -4.68, 2.75, M["wood_panel"])
cbox("IoT_Home_White_Cabinet", -3.9, -4.95, 0, 1.1, 0.45, 0.72, M["white"])
T("IoT_Home_Sign", "IoT @home", -3.9, -4.79, 2.5, 0.8, 0.14, M["neon_pink"], "S")
for r in range(3):
    for c in range(2):
        cbox(f"IoT_Home_Device_Tile_{r}_{c}", -4.15 + c * 0.5, -4.7, 1.0 + r * 0.45, 0.42, 0.06, 0.38, M["white"])
cbox("ElevHall_AED_Box", -6.55, -4.86, 0, 0.32, 0.28, 1.35, M["white"])
cbox("ElevHall_AED_Red_Label", -6.55, -5.01, 1.05, 0.26, 0.01, 0.12, M["text_red"])
ext_stand("ElevHall_Extinguisher", -3.0, -4.95)
box("ElevHall_Fire_Sign", -2.85, -4.69, 1.4, -2.6, -4.67, 1.6, M["text_red"])

# =====================================================================
#  3) 그린월 복도 (사진 1·16) — 서쪽: 검은 프레임 수직정원 3개 + 화장실 입구 2곳
#                            동쪽: 불투명 유리 + 검은 멀리언 / 북쪽 끝: 외부 양개 유리문
# =====================================================================
wall("GreenWall_Corridor_West_Wall", -2.45, -6.1, -2.45, 6.8, M["bianco"],
     openings=[(4.05, 5.35, 2.4), (7.65, 8.95, 2.4)])
wall("GreenWall_Bianco_Segment", -2.35, -6.1, -2.35, -4.6, M["bianco"], t=0.1)
for i, gy in enumerate([-3.2, 0.4, 4.0]):
    cbox(f"GreenWall_Black_Frame_{i + 1}", -2.28, gy, 0, 0.16, 2.15, 3.2, M["charcoal"])
    cbox(f"GreenWall_Foliage_{i + 1}", -2.19, gy, 0.08, 0.08, 1.95, 3.0, M["green_wall"])
    for j in range(14):  # 잎 뭉치
        fy = gy - 0.85 + (j * 0.37) % 1.7
        fz = 0.3 + (j * 0.71) % 2.6
        leaf_ball(f"GreenWall_Leaf_{i + 1}_{j + 1}", -2.12, fy, fz, 0.16, M["plant"] if j % 3 else M["green_dark"])
    for j in range(6):  # 빨간 꽃·흰 장식볼
        fy = gy - 0.7 + (j * 0.53) % 1.4
        fz = 0.6 + (j * 0.47) % 2.0
        leaf_ball(f"GreenWall_Flower_{i + 1}_{j + 1}", -2.06, fy, fz, 0.06, M["red_flower"] if j % 2 else M["white"])
    if i == 1:
        cyl("GreenWall_Gold_Wreath", -2.06, gy, 2.45, 0.24, 0.06, M["gold"], 20).rotation_euler.y = math.pi / 2
# 화장실 입구 리세스 2곳 (그린월 사이)
for i, (y1, y2) in enumerate([(-2.05, -0.75), (1.55, 2.85)]):
    wall(f"Restroom_Recess_{i + 1}_South", -4.3, y1, -2.45, y1, M["marble_wall"])
    wall(f"Restroom_Recess_{i + 1}_North", -4.3, y2, -2.45, y2, M["marble_wall"])
    wall(f"Restroom_Recess_{i + 1}_Back", -4.3, y1, -4.3, y2, M["marble_wall"])
    box(f"Restroom_Floor_Mat_{i + 1}", -3.9, y1 + 0.25, 0, -2.9, y2 - 0.25, 0.01, M["mat_dark"])
    T(f"Restroom_Sign_{i + 1}", "남자 화장실" if i == 0 else "여자 화장실", -4.21, (y1 + y2) / 2, 2.0, 0.9, 0.18,
      M["text_dark"], "E", fallback="Restroom")
ext_stand("GreenWall_Extinguisher", -2.1, -4.3)
box("GreenWall_Fire_Sign", -2.3, -4.55, 0.65, -2.28, -4.35, 0.85, M["text_red"])
# 동쪽 유리 칸막이 (라운지 쪽) + 검은 멀리언
wall("GreenWall_Corridor_East_Glass", 0, -2.3, 0, 4.45, M["frosted"], t=0.06)
for i in range(7):
    cbox(f"GreenWall_East_Black_Mullion_{i + 1}", 0, -2.3 + i * 1.12, 0, 0.08, 0.08, WALL_H, M["charcoal"])
# 북쪽 끝 외부 양개 유리문 + 비상구 유도등
wall("North_Exterior_Glass_Wall", -2.45, 6.8, 0, 6.8, M["glass"], t=0.06, openings=[(0.4, 2.15, 2.5)])
cbox("North_Exterior_GlassDoor_L", -1.65, 6.8, 0, 0.85, 0.05, 2.5, M["glass"])
cbox("North_Exterior_GlassDoor_R", -0.75, 6.8, 0, 0.85, 0.05, 2.5, M["glass"])
for x in (-2.07, -1.22, -0.33):
    cbox(f"North_Exterior_Door_Frame_{x}", x, 6.8, 0, 0.05, 0.08, 2.5, M["steel"])
exit_sign("North_Exit_Sign", -1.2, 6.74, 2.62, "S")

# =====================================================================
#  4) 안내데스크 — 서쪽을 바라보는 검정 카운터 + 대리석 LG U+ 로고벽 (X 4.5)
# =====================================================================
wall("Reception_Marble_Logo_Wall", 4.5, -10, 4.5, -4.6, M["bianco"], t=0.25)
wall("Pantry_Front_South_Wall", 4.5, -4.6, 7.8, -4.6, M["wall_dark"])
cyl("Reception_Logo_Circle", 4.36, -6.9, 1.6, 0.38, 0.05, M["magenta"], 40).rotation_euler.y = math.pi / 2
T("Reception_Logo_Text", "LG U+", 4.36, -5.4, 1.62, 2.0, 0.55, M["magenta"], "W", extrude=0.04)
cbox("Reception_Counter", 3.2, -5.6, 0, 0.85, 2.5, 1.1, M["black"])
cbox("Reception_Counter_Top", 3.2, -5.6, 1.1, 0.95, 2.6, 0.04, M["charcoal"])
cbox("Reception_Info_Sign", 2.76, -6.6, 0.6, 0.02, 0.3, 0.3, M["white"])
T("Reception_Info_Mark", "i", 2.74, -6.6, 0.75, 0.12, 0.2, M["black"], "W")
cbox("Reception_Monitor", 3.45, -5.2, 1.14, 0.05, 0.5, 0.32, M["black"])
cbox("Reception_White_Bench", 2.6, -3.6, 0, 1.7, 0.52, 0.5, M["white"])  # 탕비실 가는 길 확보 (원본 X 3.6)
for i, (x, y, s, z) in enumerate([(2.35, -7.25, 0.5, 0), (2.35, -7.8, 0.45, 0), (2.35, -7.3, 0.35, 0.4)]):
    cbox(f"Reception_Delivery_Box_{i + 1}", x, y, z, s, s, s * 0.8, M["box"])
# KSQI 2026 스탠드 배너 (라운지 입구, 영상)
for i, x in enumerate([1.3, 2.05]):
    cbox(f"KSQI_Standee_{i + 1}_Board", x, -2.6, 0.08, 0.68, 0.05, 1.85, M["ksqi_blue"])
    cbox(f"KSQI_Standee_{i + 1}_Base", x, -2.6, 0, 0.5, 0.35, 0.08, M["black"])
    T(f"KSQI_Standee_{i + 1}_Text", "2026\nKSQI", x, -2.63, 1.4, 0.5, 0.45, M["white"], "S", extrude=0.015)

# =====================================================================
#  5) 탕비실 (사진 6) — 남쪽(로비)을 보는 개방형 창 + 4구 분리수거함 + Jura 커피머신 + ICETRO 제빙기
# =====================================================================
wall("Pantry_Back_Window_Wall", 4.1, -2.45, 7.0, -2.45, M["charcoal"], t=0.1, openings=[(0.7, 2.9, 0.95)])
box("Pantry_Window_Upper", 4.8, -2.5, 1.95, 7.0, -2.4, WALL_H, M["charcoal"])
cbox("Pantry_Tall_Purifier_Cabinet", 4.42, -2.8, 0, 0.62, 0.65, 2.7, M["white"])
cbox("Pantry_Water_Dispenser_Niche", 4.42, -3.13, 0.9, 0.4, 0.02, 0.45, M["steel"])
cbox("Pantry_4Bin_Counter", 5.95, -2.8, 0, 2.3, 0.65, 0.9, M["white"])
cbox("Pantry_Counter_Top", 5.95, -2.8, 0.9, 2.35, 0.68, 0.03, M["white"])
for i, label in enumerate(["일반 쓰레기", "PET/캔/유리병", "종이/비닐", "커피찌꺼기"]):
    bx = 5.1 + i * 0.57
    box(f"Pantry_Bin_Slot_{i + 1}", bx - 0.17, -3.14, 0.72, bx + 0.17, -3.12, 0.82, M["panel_white"])
    T(f"Pantry_Bin_Label_{i + 1}", label, bx, -3.135, 0.58, 0.42, 0.06, M["text_dark"], "S", fallback="Bin")
    cbox(f"Pantry_Bin_Icon_{i + 1}", bx, -3.135, 0.3, 0.16, 0.01, 0.16, M["text_dark"])
cbox("Pantry_Upper_7Door_Cabinet", 5.85, -2.75, 1.95, 2.6, 0.45, 0.75, M["white"])
cbox("Pantry_Coffee_Sign", 5.85, -2.97, 2.1, 0.32, 0.01, 0.32, M["charcoal"])
cbox("Pantry_Jura_Coffee_Machine", 6.45, -2.85, 0.93, 0.4, 0.42, 0.5, M["steel"])
cbox("Pantry_Jura_Front", 6.45, -3.07, 1.05, 0.3, 0.01, 0.25, M["black"])
for i, x in enumerate([5.3, 5.65]):
    cyl(f"Pantry_Mug_Tree_{i + 1}", x, -2.85, 0.93, 0.02, 0.35, M["wood_light"], 8)
    cyl(f"Pantry_Mug_Tree_Base_{i + 1}", x, -2.85, 0.93, 0.08, 0.02, M["wood_light"], 12)
cbox("Pantry_ICETRO_Ice_Maker", 7.4, -2.85, 0, 0.75, 0.72, 1.7, M["steel"])
cbox("Pantry_ICETRO_Bin_Front", 7.4, -3.22, 0.35, 0.68, 0.01, 0.65, M["black"])
T("Pantry_ICETRO_Logo", "ICETRO", 7.4, -3.235, 0.85, 0.36, 0.06, M["white"], "S")
box("Pantry_Dark_Side_Wall_W", 4.03, -3.2, 0, 4.11, -2.45, WALL_H, M["charcoal"])

# =====================================================================
#  6) 북카페 · BULLSEYE 다트 라운지 (사진 4·5)
# =====================================================================
wall("Lounge_East_Wall", 7.0, -2.45, 7.0, 3.72, M["wood_panel"])
# 북쪽 벽(책장 뒤) — 교육 복도 쪽에 매립 벤치 니치가 파여 있음
box("Lounge_North_Wall_West", 0, 3.72, 0, 4.6, 4.47, WALL_H, M["wood_panel"])
box("Lounge_North_Wall_East", 6.8, 3.72, 0, 7.1, 4.47, WALL_H, M["wood_panel"])
box("Lounge_North_Wall_Nook_Back", 4.6, 3.72, 0, 6.8, 3.85, WALL_H, M["wood_panel"])
box("Lounge_North_Wall_Nook_Header", 4.6, 3.85, 2.3, 6.8, 4.47, WALL_H, M["charcoal"])
box("TrainingCorr_South_White_Panel_W", 0.03, 4.47, 0, 4.6, 4.49, WALL_H, M["panel_white"])  # 교육 복도 쪽 흰 패널
box("TrainingCorr_South_White_Panel_E", 6.8, 4.47, 0, 7.1, 4.49, WALL_H, M["panel_white"])
box("Lounge_West_Wood_Lining", 0.04, -2.3, 0, 0.1, 3.72, WALL_H, M["wood_panel"])
for i in range(20):  # 원목 루버 천장
    box(f"Ceiling_Lounge_Wood_Slat_{i + 1}", 0, -2.0 + i * 0.3, 2.95, 7.0, -1.9 + i * 0.3, 3.1, M["wood_light"])
# 다트 앞 4기둥 원목 루버 가림막 + 검정 사각 화분(떡갈고무나무)
for i, lx in enumerate([0.15, 0.35, 0.55, 0.75]):
    cbox(f"Lounge_Front_Wood_Louver_Post_{i + 1}", lx, -0.6, 0, 0.08, 0.16, WALL_H, M["wood_light"])
cbox("Lounge_Black_Rect_Planter", 0.45, -0.95, 0, 0.75, 0.32, 0.44, M["charcoal"])
for i, (px, pz) in enumerate([(0.25, 0.75), (0.65, 0.95), (0.3, 1.2), (0.6, 1.45), (0.45, 1.7)]):
    leaf_ball(f"Lounge_Fiddle_Leaf_{i + 1}", px, -0.95, pz, 0.24, M["plant"])
# BULLSEYE 전자 다트 머신 2대 (서쪽 벽, 동쪽을 바라봄)
for i, dy in enumerate([0.2, 1.25]):
    cbox(f"Bullseye_Dart_Machine_{i + 1}_Body", 0.32, dy, 0.1, 0.4, 0.62, 1.9, M["white"])
    cbox(f"Bullseye_Dart_Machine_{i + 1}_Base", 0.42, dy, 0, 0.6, 0.66, 0.1, M["steel"])
    cbox(f"Bullseye_Neon_Light_{i + 1}", 0.53, dy, 0.25, 0.02, 0.56, 0.75, M["neon"])
    cyl(f"Bullseye_Dart_Board_{i + 1}", 0.54, dy, 1.3, 0.22, 0.04, M["text_dark"], 24).rotation_euler.y = math.pi / 2
    cyl(f"Bullseye_Dart_Bull_{i + 1}", 0.57, dy, 1.3, 0.08, 0.02, M["text_red"], 16).rotation_euler.y = math.pi / 2
    cbox(f"Bullseye_Top_Screen_{i + 1}", 0.45, dy, 2.05, 0.06, 0.52, 0.32, M["neon"])
    T(f"Bullseye_Logo_{i + 1}", "BULLSEYE", 0.66, dy, 0.16, 0.45, 0.06, M["text_red"], "E")
tv("Lounge_Wall_TV", 1.5, 3.7, 1.75, 0.9, 0.52, "S", on=False)
# 2단 원목 단상 + 6열 책장 (LOVE 글자·미니 트리·산타 양말)
cbox("Lounge_Wood_Step_1", 3.8, 3.1, 0, 4.6, 0.9, 0.3, M["wood_light"])
cbox("Lounge_Wood_Step_2", 3.8, 3.4, 0.3, 4.6, 0.5, 0.28, M["wood_light"])
cbox("Lounge_Step_Left_Side_Box", 1.4, 3.2, 0, 0.35, 0.45, 0.6, M["wood_light"])
cbox("Lounge_Bookcase_Back", 3.8, 3.65, 0.58, 4.4, 0.08, 2.4, M["wood_light"])
for i, bx in enumerate([1.6, 2.33, 3.06, 3.8, 4.53, 5.26, 6.0]):
    cbox(f"Lounge_Bookcase_Col_{i + 1}", bx, 3.47, 0.58, 0.05, 0.35, 2.4, M["wood_light"])
for i, bz in enumerate([0.6, 1.08, 1.56, 2.04, 2.52, 2.98]):
    cbox(f"Lounge_Bookcase_Row_{i + 1}", 3.8, 3.47, bz, 4.4, 0.35, 0.04, M["wood_light"])
for c in range(6):
    for r in range(5):
        if (c, r) in ((4, 1), (2, 3)):
            continue
        x0 = 1.68 + c * 0.73
        for k in range(3 + (c + r) % 3):
            cbox(f"Lounge_Book_{c}_{r}_{k}", x0 + k * 0.09, 3.45, 0.64 + r * 0.48, 0.07, 0.24,
                 0.24 + (k % 2) * 0.05, M["book"][(c + r + k) % 6])
T("Lounge_Bookcase_LOVE", "LOVE", 5.6, 3.3, 1.2, 0.5, 0.12, M["white"], "S", extrude=0.03)
cyl("Lounge_Mini_Xmas_Tree", 4.9, 3.45, 2.1, 0.1, 0.32, M["green_dark"], 8, r2=0.0)
cbox("Lounge_Red_Santa_Stocking", 6.6, 3.66, 1.55, 0.22, 0.05, 0.36, M["red_leather"], rot_z=0.0)
for i, (x, z) in enumerate([(2.0, 1.12), (4.15, 0.64), (5.6, 1.6)]):
    leaf_ball(f"Lounge_Shelf_Plant_{i + 1}", x, 3.45, z + 0.12, 0.12, M["plant"])
# KSQI 현수막 (영상) — 책장 위
box("Lounge_KSQI_Banner", 1.5, 3.25, 2.55, 6.1, 3.3, 2.94, M["banner_white"])
T("Lounge_KSQI_Banner_Line1", "전 산업군 1위 KSQI '고객감동콜센터'", 3.8, 3.22, 2.83, 4.3, 0.15, M["text_red"], "S",
  fallback="KSQI No.1 Customer Center")
T("Lounge_KSQI_Banner_Line2", "통신업계 1위 KS-CQI '최우수기업' 달성", 3.8, 3.22, 2.65, 4.3, 0.15, M["text_navy"], "S",
  fallback="KS-CQI Best Company")
# 엠보싱 가죽 스툴 세트 (사진 5 배치)
cbox("Lounge_Cube_White_Back", 2.2, 2.35, 0, 0.5, 0.5, 0.44, M["white"])
cbox("Lounge_Bench_Black_Left", 2.7, 1.35, 0, 0.6, 1.75, 0.44, M["charcoal"])
cbox("Lounge_Coffee_Table_Wood", 3.45, 1.35, 0.42, 0.58, 1.25, 0.04, M["wood_light"])
for i, (dx, dy) in enumerate([(-0.24, -0.55), (0.24, -0.55), (-0.24, 0.55), (0.24, 0.55)]):
    cbox(f"Lounge_Coffee_Table_Leg_{i + 1}", 3.45 + dx, 1.35 + dy, 0, 0.04, 0.04, 0.42, M["black"])
cbox("Lounge_Bench_Red_Right", 4.25, 1.35, 0, 0.6, 1.75, 0.44, M["red_leather"])
cbox("Lounge_Bench_White_Right", 4.85, 1.35, 0, 0.6, 1.75, 0.44, M["white"])
cbox("Lounge_Cube_Red_Front", 4.45, 0.2, 0, 0.55, 0.55, 0.44, M["red_leather"])
cbox("Lounge_Gray_Low_Table", 5.35, 0.15, 0.36, 0.9, 0.6, 0.04, M["panel_white"])
# 회색 퀼팅 하이백 소파 2개 (원본보다 서쪽으로 조금: 사물함 벽과 겹침 방지)
for i, sx in enumerate([5.75, 6.5]):
    cbox(f"Lounge_HighBack_Sofa_{i + 1}_Seat", sx, 1.6, 0, 0.7, 1.25, 0.45, M["cushion_gray"])
    cbox(f"Lounge_HighBack_Sofa_{i + 1}_Back", sx + 0.28, 1.6, 0.45, 0.14, 1.25, 0.95, M["cushion_gray"])
cyl("Lounge_Round_Side_Table_Top", 6.35, -0.3, 0.6, 0.25, 0.03, M["white"], 20)
cyl("Lounge_Round_Side_Table_Leg", 6.35, -0.3, 0, 0.03, 0.6, M["wood_light"], 8)
box("Lounge_Floor_Red_Line", 0.0, -2.32, 0, 4.1, -2.28, 0.006, M["text_red"])

# =====================================================================
#  7) 카페테리아 (사진 7·8) — 검정 슬라이딩 도어 · 노래방 · 노란 ㄱ자 벽 · 혈압계 · 인바디
# =====================================================================
wall("Cafe_West_Wall", 7.8, -6.8, 7.8, -1.2, M["charcoal"], openings=[(2.35, 3.5, 2.45)])  # 문: 제빙기 바로 오른쪽(사진 6)
wall("Cafe_South_White_Wall", 7.8, -6.8, 13.0, -6.8, M["white"])
wall("Cafe_North_Brick_Wall", 7.8, -1.2, 13.0, -1.2, M["brick"])
for i in range(10):  # 벽돌 줄눈
    box(f"Cafe_Brick_Course_{i + 1}", 7.9, -1.28, 0.2 + i * 0.3, 12.9, -1.27, 0.215 + i * 0.3, M["panel_white"])
wall("Cafe_East_Window_Wall", 13.0, -6.8, 13.0, -1.2, M["charcoal"], openings=[(1.0, 5.2, 0.9)])
box("Cafe_East_Window_Header", 12.93, -5.8, 2.6, 13.07, -1.6, WALL_H, M["charcoal"])
box("Cafe_East_Window_Glass", 12.98, -5.8, 0.9, 13.02, -1.6, 2.6, M["glass"])
for i in range(14):  # 우드 블라인드
    box(f"Cafe_Wood_Blind_Slat_{i + 1}", 12.92, -5.75, 1.75 + i * 0.06, 12.96, -1.65, 1.77 + i * 0.06, M["blind"])
cbox("Cafe_Window_Wood_Counter", 12.7, -3.7, 1.0, 0.45, 4.0, 0.05, M["wood_light"])
for i in range(3):
    cbox(f"Cafe_Window_Counter_Leg_{i + 1}", 12.7, -5.4 + i * 1.7, 0, 0.05, 0.05, 1.0, M["black"])
# 슬라이딩 도어 (열린 상태 → Door) + 소화기
cbox("Cafe_Black_Sliding_Door_Open", 7.72, -5.0, 0, 0.06, 1.15, 2.45, M["charcoal"])  # 옆으로 밀어 연 상태
ext_stand("Cafe_Door_Extinguisher", 8.1, -1.55)
# 노래방 기기
cbox("Cafe_Karaoke_Speaker", 8.3, -2.65, 0, 0.58, 0.62, 0.76, M["charcoal"])
cbox("Cafe_Karaoke_Amp_Rack", 8.3, -2.65, 0.76, 0.54, 0.58, 0.38, M["steel"])
cbox("Cafe_Karaoke_Monitor", 8.3, -2.65, 1.14, 0.4, 0.56, 0.36, M["neon"], rot_z=-0.2)
# 노란 ㄱ자 포인트 벽 + 3단 원목 선반 + 분리수거함·전자레인지·커피머신·정수기·냉장고
box("Cafe_Yellow_Wall_West", 7.88, -6.7, 0.9, 7.96, -4.6, 2.75, M["cafe_yellow"])
box("Cafe_Yellow_Wall_South", 7.88, -6.73, 0.9, 9.6, -6.68, 2.75, M["cafe_yellow"])
for i, sz in enumerate([1.45, 1.85, 2.25]):
    box(f"Cafe_Yellow_Wood_Shelf_{i + 1}", 7.96, -5.9, sz, 8.25, -4.7, sz + 0.04, M["wood_light"])
cbox("Cafe_4Bin_White_Counter", 8.25, -5.2, 0, 0.6, 1.1, 0.9, M["white"])
cbox("Cafe_White_Microwave", 8.25, -4.95, 0.9, 0.38, 0.48, 0.28, M["white"])
cbox("Cafe_Black_Espresso", 8.25, -5.45, 0.9, 0.38, 0.36, 0.4, M["black"])
cbox("Cafe_Water_Purifier", 8.25, -5.95, 0, 0.36, 0.36, 1.3, M["white"])
cbox("Cafe_Silver_Fridge", 8.85, -6.35, 0, 0.7, 0.68, 1.84, M["steel"])
# 원형 테이블 3 + 민트·흰·검정·파랑 의자
for i, (tx, ty) in enumerate([(9.4, -4.4), (10.15, -3.4), (10.9, -2.4)]):
    cyl(f"Cafe_Round_Table_{i + 1}_Top", tx, ty, 0.72, 0.4, 0.04, M["white"], 28)
    for j, a in enumerate([0.4, 2.5, 4.6]):
        lg = cbox(f"Cafe_Round_Table_{i + 1}_Leg_{j + 1}", tx + 0.15 * math.cos(a), ty + 0.15 * math.sin(a), 0, 0.04, 0.04,
                  0.72, M["wood_light"])
    chair(f"Cafe_Shell_Chair_{i + 1}_A", tx - 0.6, ty, M["mint"])
    chair(f"Cafe_Shell_Chair_{i + 1}_B", tx + 0.6, ty, [M["white"], M["black"], M["mint"]][i])
chair("Cafe_Blue_Seat_Chair", 9.2, -2.0, M["blue_seat"])
# 원목 하이 바 테이블 + 바 스툴 4 + 대형 TV (남쪽 벽)
cbox("Cafe_Wood_Bar_Table", 10.4, -6.0, 1.0, 2.1, 0.62, 0.05, M["wood_light"])
for i, dx in enumerate([-0.95, 0.95]):
    cbox(f"Cafe_Bar_Table_Leg_{i + 1}", 10.4 + dx, -6.0, 0, 0.06, 0.5, 1.0, M["black"])
for i, bx in enumerate([9.65, 10.15, 10.65, 11.15]):
    cyl(f"Cafe_Bar_Stool_Seat_{i + 1}", bx, -5.4, 0.68, 0.17, 0.05, M["white"] if i % 2 else M["black"], 16)
    cyl(f"Cafe_Bar_Stool_Leg_{i + 1}", bx, -5.4, 0, 0.03, 0.68, M["wood_light"], 8)
tv("Cafe_Large_Wall_TV", 10.8, -6.72, 1.5, 1.55, 0.88, "N", on=False)
# 건강관리 코너: 자동 혈압계 + 회전 스툴 + 인바디 + 안내 포스터
cbox("Cafe_BP_Monitor_Stand", 12.0, -6.35, 0, 0.48, 0.42, 0.76, M["white"])
cbox("Cafe_BP_Monitor_Body", 12.0, -6.35, 0.76, 0.38, 0.32, 0.24, M["white"])
cyl("Cafe_BP_Lime_Cuff", 12.1, -6.18, 0.82, 0.09, 0.16, M["lime"], 16).rotation_euler.x = math.pi / 2
cyl("Cafe_BP_Black_Stool", 11.8, -5.85, 0, 0.18, 0.45, M["black"], 16)
cbox("Cafe_InBody_Base", 12.45, -5.6, 0, 0.45, 0.55, 0.08, M["charcoal"])
cbox("Cafe_InBody_Column", 12.62, -5.6, 0.08, 0.08, 0.12, 0.95, M["white"])
cbox("Cafe_InBody_Head", 12.62, -5.6, 1.03, 0.3, 0.2, 0.08, M["white"])
box("Cafe_InBody_Poster", 12.92, -6.6, 1.3, 12.94, -6.05, 2.0, M["banner_white"])
T("Cafe_InBody_Poster_Text", "인바디검사", 12.95, -6.32, 1.88, 0.45, 0.07, M["text_dark"], "W", fallback="InBody")
for i in range(3):  # 펜던트·레일 조명 (천장)
    box(f"Ceiling_Cafe_Track_Light_{i + 1}", 8.4, -5.6 + i * 1.6, 3.1, 12.4, -5.55 + i * 1.6, 3.15, M["black"])

# =====================================================================
#  8) 교육 복도 (사진 9·10) — 불투명 유리 회의실 · 보안 유리문(LG U+) · TV · 매립 벤치 니치
# =====================================================================
# 서쪽 끝: 그린월 복도로 통하는 LG U+ 보안 유리문
wall("Security_Glass_Wall", 0, 4.45, 0, 6.8, M["frosted"], t=0.06, openings=[(0.25, 1.85, 2.5)])
cbox("Security_Glass_Door_Open", 0.6, 4.95, 0, 1.1, 0.05, 2.45, M["frosted"])
T("Security_Glass_Door_Logo", "LG U+", 0.03, 5.5, 1.35, 0.9, 0.22, M["magenta"], "E", extrude=0.015)
cbox("Security_Card_Reader", 0.08, 6.5, 1.15, 0.03, 0.1, 0.15, M["black"])
# 북쪽: 불투명 유리 회의실 2칸 (검은 프레임)
wall("MeetingRoom_Glass_Wall", 0, 6.6, 7.1, 6.6, M["frosted"], t=0.06, openings=[(1.0, 1.95, 2.3), (4.4, 5.35, 2.3)])
for i, x in enumerate([0.15, 1.0, 1.95, 3.55, 4.4, 5.35, 7.0]):
    cbox(f"MeetingRoom_Black_Frame_{i + 1}", x, 6.6, 0, 0.1, 0.1, WALL_H, M["charcoal"])
for i in range(6):  # 유리 사선 패턴
    o = cbox(f"MeetingRoom_Glass_Pattern_{i + 1}", 0.6 + i * 1.1, 6.56, 1.0, 1.0, 0.005, 0.01, M["panel_white"])
    o.rotation_euler.y = 0.35
wall("MeetingRoom_Divider", 3.55, 6.6, 3.55, 9.6, M["frosted"], t=0.06)
wall("MeetingRoom_Back_Wall", 0, 9.6, 7.1, 9.6, M["wall_white"])
wall("MeetingRoom_West_Wall", 0, 6.8, 0, 9.6, M["wall_white"])
cbox("MeetingRoom_Door_1_Open", 1.48, 7.1, 0, 0.05, 0.92, 2.25, M["frosted"])
cbox("MeetingRoom_Door_2_Open", 4.88, 7.1, 0, 0.05, 0.92, 2.25, M["frosted"])
for i, cx in enumerate([1.8, 5.3]):
    cbox(f"MeetingRoom_Table_{i + 1}", cx, 8.5, 0, 2.0, 0.9, 0.74, M["white"])
    for j in range(3):
        chair(f"MeetingRoom_Chair_{i + 1}_{j + 1}", cx - 0.6 + j * 0.6, 7.8, M["black"])
ext_stand("TrainingCorr_Extinguisher", 0.55, 6.3)
tape_square("TrainingCorr_Ext_Tape", 0.55, 6.3)
# 남쪽 벽: TV · 액자 게시판 (니치 벽 = 라운지 북쪽 벽)
tv("TrainingCorr_Wall_TV", 2.6, 4.49, 1.35, 1.25, 0.72, "N")
for i in range(4):
    box(f"TrainingCorr_Notice_Frame_{i + 1}", 3.6 + (i % 2) * 0.45, 4.495, 1.0 + (i // 2) * 0.62,
        3.98 + (i % 2) * 0.45, 4.51, 1.5 + (i // 2) * 0.62, M["banner_white"])
# 매립 벤치 니치 (회색 쿠션 등받이 + 주황 쿠션)
box("TrainingCorr_Bench_Nook_Back_Pad", 4.65, 3.86, 0.45, 6.75, 3.98, 2.2, M["cushion_gray"])
box("TrainingCorr_Bench_Nook_Seat", 4.65, 3.86, 0, 6.75, 4.42, 0.45, M["cushion_gray"])
cbox("TrainingCorr_Bench_Orange_Cushion", 6.4, 4.1, 0.45, 0.4, 0.15, 0.32, M["red_leather"])

# =====================================================================
#  9) 사물함 복도 (사진 11·15) — 01~56 사물함 · 3x3 패브릭 매립 벤치 · 전산강의장1
# =====================================================================
box("Locker_Corridor_South_End_Wall", 7.0, -0.68, 0, 9.5, -0.6, WALL_H, M["panel_white"])
wall("Locker_Corridor_East_Wall", 9.4, -0.6, 9.4, 4.45, M["panel_white"], openings=[(0.15, 1.25, 2.3)])
LOCKER_FACE = 7.45
for c in range(14):
    for r in range(4):
        n = c * 4 + r + 1  # 13·14 / 27·28 처럼 위→아래로 번호가 이어지게
        y1 = 4.2 - (c + 1) * 0.31
        z1 = 0.15 + (3 - r) * 0.47
        box(f"Locker_{n:02d}_Door", 7.07, y1 + 0.01, z1, LOCKER_FACE, y1 + 0.3, z1 + 0.45, M["white"])
        T(f"Locker_{n:02d}_Number", f"{n:02d}", LOCKER_FACE + 0.006, y1 + 0.2, z1 + 0.2, 0.15, 0.13, M["text_gray"], "E")
        box(f"Locker_{n:02d}_Keypad", LOCKER_FACE, y1 + 0.05, z1 + 0.18, LOCKER_FACE + 0.02, y1 + 0.1, z1 + 0.3, M["black"])
box("Locker_Top_Blank_Row", 7.07, -0.14, 2.03, LOCKER_FACE, 4.2, 2.55, M["white"])
# 3x3 회색 패브릭 매립 벤치 (동쪽 벽)
box("Locker_Bench_Charcoal_Surround", 9.12, 1.25, 0, 9.4, 4.25, 2.7, M["charcoal"])
box("Locker_Bench_Seat_Cushion", 8.85, 1.3, 0, 9.12, 4.2, 0.45, M["cushion_gray"])
for i, ry in enumerate([1.8, 2.75, 3.7]):
    for j, cz in enumerate([0.75, 1.35, 1.95]):
        cbox(f"Locker_Bench_Fabric_Tile_{i}_{j}", 9.1, ry, cz - 0.28, 0.04, 0.9, 0.56, M["cushion_gray"])
for i, cy in enumerate([1.5, 1.77, 2.05]):
    cbox(f"Locker_Bench_BW_Pillow_{i + 1}", 8.97, cy, 0.45, 0.2, 0.3, 0.3, M["white"] if i % 2 else M["black"], rot_z=0.15)
plant("Locker_End_Lucky_Bamboo", 7.9, -0.3, 1.7)
cbox("CompRoom1_Dark_Door_Open", 9.85, 0.1, 0, 0.9, 0.05, 2.25, M["charcoal"])
T("Sign_CompRoom1_Text", "전산강의장1", 9.31, 0.1, 2.45, 0.7, 0.12, M["text_dark"], "W", fallback="PC Room 1")
# 전산강의장1 (사물함 복도 동쪽)
wall("CompRoom1_East_Wall", 13.0, -1.05, 13.0, 4.45, M["panel_white"])
wall("CompRoom1_South_Wall", 9.4, -1.05, 13.0, -1.05, M["panel_white"])
wall("CompRoom1_North_Wall", 9.4, 4.45, 13.0, 4.45, M["panel_white"])
for i, y in enumerate([1.2, 2.8]):
    for j, x in enumerate([10.6, 12.0]):
        cbox(f"CompRoom1_PC_Desk_{i}_{j}", x, y, 0, 1.2, 0.6, 0.74, M["white"])
        cbox(f"CompRoom1_Monitor_{i}_{j}", x, y + 0.2, 0.74, 0.5, 0.05, 0.32, M["black"])
        chair(f"CompRoom1_Chair_{i}_{j}", x, y - 0.6, M["black"])

# 교육 복도 동쪽 끝(분기점): 4구 분리수거함 + TV + 화분
wall("Junction_East_Wall", 9.4, 4.45, 9.4, 6.6, M["panel_white"])
cbox("Junction_End_4Bin_Cabinet", 9.12, 5.5, 0, 0.5, 1.8, 0.9, M["white"])
tv("Junction_End_TV", 9.33, 5.5, 1.5, 0.9, 0.52, "W")
plant("Junction_End_Plant", 9.1, 4.75, 1.3)

# =====================================================================
#  10) 북측 강의장 복도 (사진 10·14) — 상담사 액자 4점 · 화재발신기 · 강의장 문
# =====================================================================
wall("North_Corr_West_Wall", 7.1, 6.6, 7.1, 18.8, M["panel_white"])
wall("North_Corr_East_Wall", 9.4, 6.6, 9.4, 18.8, M["panel_white"],
     openings=[(0.3, 1.2, 2.3), (7.6, 8.5, 2.3), (9.4, 10.3, 2.3)])
wall("North_Corr_End_Wall", 7.1, 18.8, 9.4, 18.8, M["panel_white"])
exit_sign("North_Corr_Exit_Sign", 8.25, 18.72, 2.55, "S")
for i, py in enumerate([7.6, 8.8, 10.0, 11.2]):
    s = 0.95 if i == 0 else 0.72
    box(f"Consultant_Acrylic_Photo_{i + 1}", 7.18, py - s / 2, 1.58 - s / 2, 7.2, py + s / 2, 1.58 + s / 2, M["photo"][i + 2])
    cbox(f"Consultant_Photo_Headset_{i + 1}", 7.205, py, 1.52, 0.005, s * 0.45, s * 0.45, M["pot"])
T("Consultant_Photo_Quote", "미소는 친절이라는 나무의 뿌리입니다", 7.215, 7.6, 1.9, 0.85, 0.07, M["white"], "E",
  fallback="Smile is the root of kindness")
box("North_Corr_Fire_Alarm", 9.31, 8.0, 1.2, 9.33, 8.16, 1.55, M["text_red"])
for i, (y, label) in enumerate([(7.35, "일반강의장1"), (14.65, "일반강의장2"), (16.45, "강사실")]):
    box(f"North_Corr_Door_Sign_{i + 1}", 9.31, y - 0.55, 2.35, 9.33, y - 0.15, 2.55, M["white"])
    T(f"North_Corr_Door_Sign_Text_{i + 1}", label, 9.3, y - 0.35, 2.45, 0.36, 0.1, M["text_dark"], "W",
      fallback="Room")
cbox("L1_Dark_Door_Open", 9.85, 7.35, 0, 0.9, 0.05, 2.25, M["charcoal"])
cbox("L2_Dark_Door_Open", 9.85, 14.65, 0, 0.9, 0.05, 2.25, M["charcoal"])
cbox("Instructor_Room_Dark_Door_Open", 9.85, 16.45, 0, 0.9, 0.05, 2.25, M["charcoal"])

# =====================================================================
#  11) 일반강의장1 (사진 12·13) — 원목 단상·화이트보드·스크린·LG U+ 강연대·V자 접이식 책상
# =====================================================================
wall("L1_South_Wall", 9.4, 6.0, 17.6, 6.0, M["panel_white"])
wall("L1_L2_Divider", 9.4, 10.6, 17.6, 10.6, M["panel_white"])
wall("L1_L2_Front_Wall", 17.6, 6.0, 17.6, 15.4, M["wood_panel"])
box("L1_Whiteboard_L", 17.52, 6.4, 0.9, 17.54, 7.4, 2.2, M["white"])
box("L1_Projector_Screen", 17.5, 7.5, 0.95, 17.52, 8.9, 2.4, M["white"])
box("L1_Whiteboard_R", 17.52, 9.0, 0.9, 17.54, 10.2, 2.2, M["white"])
cbox("L1_Wood_Low_Cabinet", 17.3, 8.3, 0.12, 0.45, 4.2, 0.45, M["wood_panel"])
box("Ceiling_L1_Wood_Soffit", 16.2, 6.0, 2.9, 17.6, 10.6, 3.2, M["wood_panel"])
cbox("L1_Wood_Podium", 16.55, 6.8, 0.12, 0.45, 0.6, 1.05, M["wood_panel"])
T("L1_Podium_Logo", "LG U+", 16.32, 6.8, 0.9, 0.35, 0.08, M["magenta"], "W")
cyl("L1_Air_Purifier", 16.7, 10.1, 0.12, 0.18, 0.8, M["white"], 20)
plant("L1_Corner_Plant", 16.65, 9.6, 1.3)
for i in range(6):  # 롤 블라인드 (남쪽 창)
    box(f"L1_Roller_Blind_{i + 1}", 10.0 + i * 1.05, 6.08, 0.6, 10.95 + i * 1.05, 6.1, 2.8, M["roller"])
for bi, by in enumerate([6.6, 8.3, 10.0]):  # 3분단 (분단 사이 통로 0.9m)
    ang = math.radians(8 if bi == 0 else (-8 if bi == 2 else 0))
    for bj, bx in enumerate([15.0, 13.6, 12.2, 10.8]):  # 4줄
        cbox(f"L1_Fold_Desk_{bi}_{bj}", bx, by, 0.72, 0.5, 0.8, 0.04, M["white"], rot_z=ang)
        for k, sy in enumerate([-0.2, 0.2]):
            cbox(f"L1_Desk_Leg_{bi}_{bj}_{k}", bx, by + sy, 0, 0.04, 0.04, 0.72, M["white"])
            chair(f"L1_Mesh_Chair_{bi}_{bj}_{k}", bx - 0.45, by + sy, M["black"])

# =====================================================================
#  12) 일반강의장2 — 듀얼 모니터 PC 실습석 / 강사실 — 파티션 책상
# =====================================================================
wall("L2_Instructor_Divider", 9.4, 15.4, 17.6, 15.4, M["panel_white"])
box("L2_Whiteboard", 17.52, 11.6, 0.9, 17.54, 14.4, 2.2, M["white"])
for i, cy in enumerate([14.2, 13.0, 11.8]):
    for j, rx in enumerate([15.0, 13.2, 11.4]):  # 문 쪽 통로 확보 (원본보다 0.5m 동쪽)
        cbox(f"L2_PC_Desk_{i}_{j}", rx, cy, 0, 0.6, 1.1, 0.74, M["white"])
        cbox(f"L2_Dual_Monitor_{i}_{j}", rx + 0.18, cy, 0.74, 0.05, 0.95, 0.32, M["black"])
        chair(f"L2_Chair_{i}_{j}", rx - 0.5, cy, M["black"])
wall("Instructor_Room_East_Wall", 15.6, 15.4, 15.6, 18.8, M["panel_white"])
wall("Instructor_Room_North_Wall", 9.4, 18.8, 15.6, 18.8, M["panel_white"])
cbox("Instructor_Back_Bookshelf", 15.35, 17.2, 0, 0.4, 2.8, 2.2, M["wood_panel"])
for i in range(3):
    x = 10.6 + i * 1.6
    cbox(f"Instructor_Desk_{i + 1}", x, 18.0, 0, 1.4, 0.7, 0.74, M["white"])
    cbox(f"Instructor_Desk_Partition_{i + 1}", x, 18.37, 0, 1.4, 0.05, 1.2, M["blue_partition"])
    cbox(f"Instructor_Monitor_{i + 1}", x, 18.2, 0.74, 0.55, 0.05, 0.35, M["black"])
    chair(f"Instructor_Chair_{i + 1}", x, 17.35, M["black"])
cyl("Instructor_Air_Purifier", 14.9, 15.85, 0, 0.18, 0.75, M["white"], 20)

# =====================================================================
#  천장 (게임에서는 Ceiling_ 이름이라 자동으로 숨김)
# =====================================================================
box("Ceiling_Lobby", -8.7, -10, 3.25, 7.8, -2.3, 3.3, M["white"])
box("Ceiling_Corridor", -2.45, -2.3, 3.25, 0, 6.8, 3.3, M["white"])
box("Ceiling_Office_Wing", 0, 4.45, 3.25, 17.6, 18.8, 3.3, M["white"])

# =====================================================================
#  마무리: 내보내기
# =====================================================================
bpy.context.view_layer.update()
print(f"[1F v2] 오브젝트 {len(col.objects)}개 생성 완료")
if EXPORT_PATH:
    export_dir = os.path.dirname(EXPORT_PATH)
    if os.path.isdir(export_dir):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.export_scene.gltf(filepath=EXPORT_PATH, export_format="GLB", use_selection=False,
                                  export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
        print(f"[1F v2] 내보내기 완료 → {EXPORT_PATH}")
    else:
        print(f"[1F v2] 내보내기 폴더가 없어 건너뜀: {export_dir}  (EXPORT_PATH 를 고쳐 주세요)")
