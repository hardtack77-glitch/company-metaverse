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
    "door_gray": mat("Door_Dark_Gray", hexrgb("4b4f55"), 0.5),
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
floor("Lobby_Marble_Floor", -8.7, -10, 4.5, -2.3, M["marble"])        # 로비·엘리베이터홀·안내데스크
floor("Cafe_Vestibule_Floor", 4.5, -3.3, 7.0, -2.3, M["marble"])      # 탕비실 앞 → 카페테리아 자동문
floor("GreenWall_Corridor_Floor", -2.45, -2.3, 0, 6.8, M["marble"])    # 그린월 복도
floor("North_Exit_Outdoor_Floor", -3.0, 6.8, 1.0, 8.6, M["plaza"])     # 북측 출입문 밖
floor("Restroom_Recess_Floor_1", -4.3, -2.05, -2.45, -0.75, M["marble"])
floor("Restroom_Recess_Floor_2", -4.3, 1.55, -2.45, 2.85, M["marble"])
floor("Lounge_Wood_Floor", 0, -2.3, 7.0, 3.75, M["wood_floor"])        # 북카페·다트 라운지
floor("Cafe_Wood_Floor", 4.5, -10, 9.4, -3.3, M["wood_floor"])        # 카페테리아 (안내데스크 대리석 벽 바로 뒤)
floor("Training_Entry_Corr_Floor", 0, 4.45, 9.4, 6.6, M["office_floor"])
floor("Meeting_Rooms_Floor", 0, 6.6, 7.1, 10.45, M["office_floor"])  # 회의실 2칸 (실습실 아래 남은 공간의 50%)
floor("Locker_Corridor_Floor", 7.0, -3.3, 9.4, 4.45, M["office_floor"])  # 남쪽 끝 = 카페테리아 북쪽 벽
floor("North_Training_Corr_Floor", 7.1, 6.6, 9.4, 14.35, M["office_floor"])
# 동쪽 강의장 3개 — 남쪽 벽을 건물 정면 벽(Y -10)에 맞춰 내림 (크기 그대로, 위쪽 Y 14.65~23 은 추후 수정)
#   전산강의장2 는 카페테리아 북쪽 벽(Y -3.3)보다 문 폭만큼 북쪽으로 튀어나와 사물함 복도 쪽에 출입문
floor("CompRoom2_Floor", 9.4, -10, 17.6, -2.2, M["office_floor"])       # 전산강의장2
floor("CompRoomN1_Floor", 9.4, -2.2, 17.6, 8.6, M["office_floor"])      # 전산강의장1 (북측 복도 아래쪽 문까지 늘림, 4줄)
floor("Lecture_Floor", 9.4, 8.6, 17.6, 18.2, M["office_floor"])         # 일반강의장 (크기 그대로 북쪽으로)
floor("Instructor_Room_Floor", 0, 10.45, 7.1, 14.35, M["office_floor"])  # 강사실 (50%)
floor("Practice_Room_Floor", 0, 14.35, 9.4, 18.2, M["office_floor"])    # 실습실 (북쪽 벽 = 일반강의장 북쪽 벽 선, 깊이 3.85m)

# =====================================================================
#  1) 정면 외관 · 원통형 회전문 (회전문 중심 X -1.2, Y -9.6)
# =====================================================================
RX, RY = -1.2, -9.6
wall("Facade_Glass_West", -8.7, -10, -2.35, -10, M["glass"], h=4.2, t=0.06)
wall("Facade_Glass_East", 1.25, -10, 9.4, -10, M["glass"], h=4.2, t=0.06)
for i, x in enumerate([-8.7, -6.6, -4.5, -2.35, 1.25, 3.0, 4.5, 6.5, 8.0, 9.4]):
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
wall("ElevHall_North_Wall", -8.7, -4.6, -2.35, -4.6, M["bianco"])  # 뒷벽 문은 실제로 없어서 막음
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
# (엘리베이터홀 북쪽 벽 끝(Y -4.6)에서 시작 — 김지연 센터장 옆으로 튀어나와 있던 벽 토막(Y -6.1~-4.6)은 실제로 없어서 지움)
wall("GreenWall_Corridor_West_Wall", -2.45, -4.6, -2.45, 6.8, M["bianco"],
     openings=[(2.55, 3.85, 2.4), (6.15, 7.45, 2.4)])
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
# 문 모양만 있고 지나갈 수 없음 (이름에 Door 를 넣지 않아 막힌 유리로 처리)
cbox("North_Exterior_Glass_Leaf_L", -1.65, 6.8, 0, 0.85, 0.05, 2.5, M["glass"])
cbox("North_Exterior_Glass_Leaf_R", -0.75, 6.8, 0, 0.85, 0.05, 2.5, M["glass"])
for x in (-2.07, -1.22, -0.33):
    cbox(f"North_Exterior_Door_Frame_{x}", x, 6.8, 0, 0.05, 0.08, 2.5, M["steel"])
exit_sign("North_Exit_Sign", -1.2, 6.74, 2.62, "S")

# =====================================================================
#  4) 안내데스크 — 서쪽을 바라보는 검정 카운터 + 대리석 LG U+ 로고벽 (X 4.5)
# =====================================================================
wall("Reception_Marble_Logo_Wall", 4.5, -10, 4.5, -3.3, M["bianco"], t=0.25)  # 뒤쪽(동쪽)이 바로 카페테리아
cyl("Reception_Logo_Circle", 4.36, -6.9, 1.6, 0.38, 0.05, M["magenta"], 40).rotation_euler.y = math.pi / 2
T("Reception_Logo_Text", "LG U+", 4.36, -5.4, 1.62, 2.0, 0.55, M["magenta"], "W", extrude=0.04)
cbox("Reception_Counter", 3.2, -5.55, 0, 0.85, 2.4, 1.1, M["black"])  # 남쪽 끝을 비워 택배보관실 문 앞 공간 확보
cbox("Reception_Counter_Top", 3.2, -5.55, 1.1, 0.95, 2.5, 0.04, M["charcoal"])
cbox("Reception_Info_Sign", 2.76, -6.6, 0.6, 0.02, 0.3, 0.3, M["white"])
T("Reception_Info_Mark", "i", 2.74, -6.6, 0.75, 0.12, 0.2, M["black"], "W")
cbox("Reception_Monitor", 3.45, -5.2, 1.14, 0.05, 0.5, 0.32, M["black"])
# (안내데스크 옆 흰색 벤치 소파는 요청으로 삭제)
# 택배보관실 — 안내데스크와 같은 검정 벽의 룸 (안내데스크 대리석 벽 ~ 정면 유리 사이, X 1.6~4.4, Y -10~-7.84 · 길이 20% 줄임)
#   문: 북쪽 벽 동쪽 끝(안내데스크 쪽) · 안: 벽을 따라 스틸 선반 + 택배 상자
wall("Parcel_Room_North_Wall", 1.6, -7.84, 4.4, -7.84, M["black"], openings=[(1.45, 2.45, 2.3)])  # 문 X 3.05~4.05 (폭 1m)
wall("Parcel_Room_West_Wall", 1.6, -10, 1.6, -7.84, M["black"])
box("Parcel_Room_Sign_Plate", 1.85, -7.78, 1.75, 2.95, -7.76, 2.05, M["white"])
T("Parcel_Room_Sign_Text", "택배보관실", 2.4, -7.75, 1.9, 0.9, 0.18, M["text_dark"], "N", fallback="Parcel Room")
def parcel_shelf(name, x0, y0, x1, y1):
    for k, z in enumerate([0.1, 0.65, 1.2, 1.75]):
        box(f"{name}_Board_{k + 1}", x0, y0, z, x1, y1, z + 0.03, M["steel"])
    for px in (x0, x1 - 0.04):
        for py in (y0, y1 - 0.04):
            box(f"{name}_Post_{px:.2f}_{py:.2f}", px, py, 0, px + 0.04, py + 0.04, 2.1, M["steel"])
    import random
    rnd = random.Random(name)
    for k, z in enumerate([0.13, 0.68, 1.23, 1.78]):
        if abs(x1 - x0) > abs(y1 - y0):
            t = x0 + 0.05
            while t < x1 - 0.3:
                w = rnd.uniform(0.25, 0.45)
                h = rnd.uniform(0.18, 0.4)
                cbox(f"{name}_Box_{k}_{t:.2f}", t + w / 2, (y0 + y1) / 2, z, w - 0.03, (y1 - y0) * rnd.uniform(0.6, 0.9), h, M["box"])
                t += w
        else:
            t = y0 + 0.05
            while t < y1 - 0.3:
                w = rnd.uniform(0.25, 0.45)
                h = rnd.uniform(0.18, 0.4)
                cbox(f"{name}_Box_{k}_{t:.2f}", (x0 + x1) / 2, t + w / 2, z, (x1 - x0) * rnd.uniform(0.6, 0.9), w - 0.03, h, M["box"])
                t += w
parcel_shelf("Parcel_Shelf_West", 1.7, -9.9, 2.15, -8.0)
parcel_shelf("Parcel_Shelf_South", 2.25, -9.92, 4.3, -9.47)
for i, (x, y, sz) in enumerate([(2.6, -8.75, 0.5), (2.55, -9.2, 0.4), (2.62, -8.72, 0.35)]):  # 바닥에 쌓인 택배
    cbox(f"Parcel_Floor_Box_{i + 1}", x, y, 0.4 if i == 2 else 0, sz, sz, sz * 0.8, M["box"])
# KSQI 2026 스탠드 배너 (라운지 입구, 영상)
# (로비에서 라운지 원목 바닥 안으로 한 칸 들이고 서쪽 벽에 붙임)
for i, x in enumerate([0.52, 1.25]):
    cbox(f"KSQI_Standee_{i + 1}_Board", x, -1.75, 0.08, 0.68, 0.05, 1.85, M["ksqi_blue"])
    cbox(f"KSQI_Standee_{i + 1}_Base", x, -1.75, 0, 0.5, 0.35, 0.08, M["black"])
    T(f"KSQI_Standee_{i + 1}_Text", "2026\nKSQI", x, -1.78, 1.4, 0.5, 0.45, M["white"], "S", extrude=0.015)

# =====================================================================
#  5) 탕비실 (사진 6·실사) — 라운지 동쪽 벽을 따라 세로로(남북), 서쪽(라운지)을 바라봄
#     북→남: 정수기 키큰장 · 4구 분리수거함(커피머신) · ICETRO 제빙기 → 바로 옆 카페테리아 자동문 → 대리석 벽
# =====================================================================
box("Pantry_Charcoal_Back_Panel", 6.89, -3.3, 0, 6.925, 0.6, WALL_H, M["charcoal"])  # 위쪽 짙은 회색 벽
cbox("Pantry_Tall_Purifier_Cabinet", 6.6, 0.18, 0, 0.62, 0.62, 2.7, M["white"])
cbox("Pantry_Water_Dispenser_Niche", 6.28, 0.18, 0.9, 0.02, 0.4, 0.45, M["steel"])
cbox("Pantry_4Bin_Counter", 6.6, -1.3, 0, 0.65, 2.3, 0.9, M["white"])
cbox("Pantry_Counter_Top", 6.58, -1.3, 0.9, 0.7, 2.35, 0.03, M["white"])
for i, label in enumerate(["일반 쓰레기", "PET/캔/유리병", "종이/비닐", "커피찌꺼기"]):
    by = -0.45 - i * 0.57  # 라운지에서 볼 때 왼쪽(북)부터
    box(f"Pantry_Bin_Slot_{i + 1}", 6.255, by - 0.17, 0.72, 6.275, by + 0.17, 0.82, M["panel_white"])
    T(f"Pantry_Bin_Label_{i + 1}", label, 6.265, by, 0.58, 0.42, 0.06, M["text_dark"], "W", fallback="Bin")
    cbox(f"Pantry_Bin_Icon_{i + 1}", 6.265, by, 0.3, 0.01, 0.16, 0.16, M["text_dark"])
cbox("Pantry_Upper_7Door_Cabinet", 6.7, -1.25, 1.95, 0.45, 2.6, 0.75, M["white"])
cbox("Pantry_Coffee_Sign", 6.47, -1.25, 2.1, 0.01, 0.32, 0.32, M["charcoal"])
cbox("Pantry_Jura_Coffee_Machine", 6.65, -2.0, 0.93, 0.42, 0.4, 0.5, M["steel"])
cbox("Pantry_Jura_Front", 6.435, -2.0, 1.05, 0.01, 0.3, 0.25, M["black"])
for i, y in enumerate([-0.75, -1.1]):
    cyl(f"Pantry_Mug_Tree_{i + 1}", 6.65, y, 0.93, 0.02, 0.35, M["wood_light"], 8)
    cyl(f"Pantry_Mug_Tree_Base_{i + 1}", 6.65, y, 0.93, 0.08, 0.02, M["wood_light"], 12)
cbox("Pantry_ICETRO_Ice_Maker", 6.55, -2.86, 0, 0.72, 0.75, 1.7, M["steel"])
cbox("Pantry_ICETRO_Bin_Front", 6.185, -2.86, 0.35, 0.01, 0.68, 0.65, M["black"])
T("Pantry_ICETRO_Logo", "ICETRO", 6.17, -2.86, 0.85, 0.36, 0.06, M["white"], "W")
box("Pantry_Floor_Mat", 5.7, -3.2, 0, 6.15, -2.5, 0.01, M["mat_dark"])

# =====================================================================
#  6) 북카페 · BULLSEYE 다트 라운지 (사진 4·5)
# =====================================================================
wall("Lounge_East_Wall", 7.0, -3.3, 7.0, 3.72, M["wood_panel"])
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
# (책장·단상 끝선 = 2인 부스 소파 시작선 X 4.95)
cbox("Lounge_Wood_Step_1", 3.225, 3.1, 0, 3.45, 0.9, 0.3, M["wood_light"])
cbox("Lounge_Wood_Step_2", 3.225, 3.4, 0.3, 3.45, 0.5, 0.28, M["wood_light"])
cbox("Lounge_Step_Left_Side_Box", 1.4, 3.2, 0, 0.35, 0.45, 0.6, M["wood_light"])
cbox("Lounge_Bookcase_Back", 3.275, 3.65, 0.58, 3.35, 0.08, 2.4, M["wood_light"])
for i, bx in enumerate([1.6, 2.27, 2.94, 3.61, 4.28, 4.95]):
    cbox(f"Lounge_Bookcase_Col_{i + 1}", bx, 3.47, 0.58, 0.05, 0.35, 2.4, M["wood_light"])
for i, bz in enumerate([0.6, 1.08, 1.56, 2.04, 2.52, 2.98]):
    cbox(f"Lounge_Bookcase_Row_{i + 1}", 3.275, 3.47, bz, 3.35, 0.35, 0.04, M["wood_light"])
for c in range(5):
    for r in range(5):
        if (c, r) in ((4, 1), (2, 3)):
            continue
        x0 = 1.67 + c * 0.67
        for k in range(3 + (c + r) % 3):
            cbox(f"Lounge_Book_{c}_{r}_{k}", x0 + k * 0.09, 3.45, 0.64 + r * 0.48, 0.07, 0.24,
                 0.24 + (k % 2) * 0.05, M["book"][(c + r + k) % 6])
T("Lounge_Bookcase_LOVE", "LOVE", 4.55, 3.3, 1.2, 0.5, 0.12, M["white"], "S", extrude=0.03)
cyl("Lounge_Mini_Xmas_Tree", 4.3, 3.45, 2.1, 0.1, 0.32, M["green_dark"], 8, r2=0.0)
cbox("Lounge_Red_Santa_Stocking", 5.45, 3.66, 1.75, 0.22, 0.05, 0.36, M["red_leather"], rot_z=0.0)
for i, (x, z) in enumerate([(2.0, 1.12), (3.95, 0.64), (4.6, 1.6)]):
    leaf_ball(f"Lounge_Shelf_Plant_{i + 1}", x, 3.45, z + 0.12, 0.12, M["plant"])
# KSQI 현수막 (영상) — 책장 위
# 7·8·9층 상담실과 같은 그림 현수막 (blender/tex/ksqi_banner.jpg) — 원목 루버 천장 바로 아래, 책장 위쪽
BANNER_CANDIDATES = [
    r"C:\Users\User\company-metaverse\blender\tex\ksqi_banner.jpg",
    os.path.join(os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else "", "tex", "ksqi_banner.jpg"),
    os.path.join(os.getcwd(), "blender", "tex", "ksqi_banner.jpg"),
    os.path.join(os.getcwd(), "tex", "ksqi_banner.jpg"),
]
BANNER_PATH = next((p for p in BANNER_CANDIDATES if p and os.path.isfile(p)), None)


def image_banner(name, path, cx, y, z1, w, h):
    """남쪽(-Y)을 바라보는 그림 현수막"""
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


if BANNER_PATH:
    image_banner("Lounge_KSQI_Banner", BANNER_PATH, 3.275, 3.22, 2.16, 3.3, 0.77)
else:
    box("Lounge_KSQI_Banner", 1.62, 3.25, 2.55, 4.93, 3.3, 2.94, M["banner_white"])
    T("Lounge_KSQI_Banner_Line1", "전 산업군 1위 KSQI '고객감동콜센터'", 3.275, 3.22, 2.83, 3.2, 0.15, M["text_red"], "S",
      fallback="KSQI No.1 Customer Center")
    T("Lounge_KSQI_Banner_Line2", "통신업계 1위 KS-CQI '최우수기업' 달성", 3.275, 3.22, 2.65, 3.2, 0.15, M["text_navy"], "S",
      fallback="KS-CQI Best Company")
# 엠보싱 가죽 스툴 세트 (사진 5 배치 · 부스 소파 자리를 위해 서쪽으로 0.3m)
cbox("Lounge_Cube_White_Back", 1.9, 2.35, 0, 0.5, 0.5, 0.44, M["white"])
cbox("Lounge_Bench_Black_Left", 2.4, 1.35, 0, 0.6, 1.75, 0.44, M["charcoal"])
cbox("Lounge_Coffee_Table_Wood", 3.15, 1.35, 0.42, 0.58, 1.25, 0.04, M["wood_light"])
for i, (dx, dy) in enumerate([(-0.24, -0.55), (0.24, -0.55), (-0.24, 0.55), (0.24, 0.55)]):
    cbox(f"Lounge_Coffee_Table_Leg_{i + 1}", 3.15 + dx, 1.35 + dy, 0, 0.04, 0.04, 0.42, M["black"])
cbox("Lounge_Bench_Red_Right", 3.95, 1.35, 0, 0.6, 1.75, 0.44, M["red_leather"])
cbox("Lounge_Bench_White_Right", 4.55, 1.35, 0, 0.6, 1.75, 0.44, M["white"])
cbox("Lounge_Cube_Red_Front", 4.15, 0.2, 0, 0.55, 0.55, 0.44, M["red_leather"])
# (회색 협탁은 삭제)
# 회색 패브릭 2인 부스 소파 2개 — 등받이·옆날개가 높고 깊게 파여 있음, 가운데 둥근 테이블을 두고 대칭으로 마주봄
BOOTH_Y1, BOOTH_Y2 = 2.2, 3.65  # 북쪽 원목 벽(산타 양말)에 붙음
for i, (back_x, face) in enumerate([(4.95, 1), (6.92, -1)]):  # 서쪽 부스(동쪽을 봄) · 동쪽 부스(서쪽을 봄)
    bx0, bx1 = (back_x, back_x + 0.72) if face > 0 else (back_x - 0.72, back_x)
    seat_x0, seat_x1 = (back_x + 0.16, back_x + 0.72) if face > 0 else (back_x - 0.72, back_x - 0.16)
    box(f"Lounge_Booth_Sofa_{i + 1}_Seat", seat_x0, BOOTH_Y1 + 0.08, 0, seat_x1, BOOTH_Y2 - 0.08, 0.45, M["cushion_gray"])
    box(f"Lounge_Booth_Sofa_{i + 1}_Back", min(back_x, back_x + face * 0.16), BOOTH_Y1, 0,
        max(back_x, back_x + face * 0.16), BOOTH_Y2, 1.4, M["cushion_gray"])
    for j, (wy0, wy1) in enumerate([(BOOTH_Y1, BOOTH_Y1 + 0.08), (BOOTH_Y2 - 0.08, BOOTH_Y2)]):
        box(f"Lounge_Booth_Sofa_{i + 1}_Wing_{j + 1}", bx0, wy0, 0, bx1, wy1, 1.4, M["cushion_gray"])
    for k in range(4):  # 등받이 누빔 줄
        box(f"Lounge_Booth_Sofa_{i + 1}_Quilt_{k + 1}", back_x + face * 0.16 - 0.005, BOOTH_Y1 + 0.1, 0.65 + k * 0.2,
            back_x + face * 0.16 + 0.005, BOOTH_Y2 - 0.1, 0.665 + k * 0.2, M["charcoal"])
cyl("Lounge_Round_Side_Table_Top", 5.94, 2.93, 0.6, 0.24, 0.03, M["white"], 20)
for i, a in enumerate([0.3, 2.4, 4.5]):  # 원목 삼각 다리
    leg = cbox(f"Lounge_Round_Side_Table_Leg_{i + 1}", 5.94 + 0.1 * math.cos(a), 2.93 + 0.1 * math.sin(a), 0, 0.03, 0.03, 0.6,
               M["wood_light"])
box("Lounge_Floor_Red_Line", 0.0, -2.32, 0, 4.1, -2.28, 0.006, M["text_red"])

# =====================================================================
#  7) 카페테리아 (사진 7·8 · 실사) — 안내데스크 대리석 벽 바로 뒤(동쪽) · X 4.5~9.4, Y -10~-3.3
#     출입: 북쪽 벽 검정 자동문 (탕비실 제빙기 바로 옆) · 남쪽은 건물 정면 유리창
# =====================================================================
wall("Cafe_North_Wall", 4.5, -3.3, 9.4, -3.3, M["charcoal"], openings=[(0.45, 1.65, 2.45)])  # 문 X 4.95~6.15
wall("Cafe_East_Wall", 9.4, -10, 9.4, -3.3, M["white"])  # 사물함 복도 동쪽 벽과 일직선
# 자동문 (좌우로 열림) + 카페테리아 표지판
box("AutoDoor_Cafe_L", 4.95, -3.32, 0, 5.55, -3.28, 2.45, M["glass"])  # 투명 유리 자동문
box("AutoDoor_Cafe_R", 5.55, -3.32, 0, 6.15, -3.28, 2.45, M["glass"])
for side, xc in (("L", 5.25), ("R", 5.85)):
    T(f"AutoDoorLogo_Cafe_{side}_N", "LG U+", xc, -3.265, 1.35, 0.45, 0.12, M["magenta"], "N", extrude=0.01)
    T(f"AutoDoorLogo_Cafe_{side}_S", "LG U+", xc, -3.335, 1.35, 0.45, 0.12, M["magenta"], "S", extrude=0.01)
cbox("Cafe_Door_Sign_Plate", 6.35, -3.2, 2.45, 0.32, 0.03, 0.36, M["white"])
T("Cafe_Door_Sign_Text", "카페테리아", 6.35, -3.18, 2.5, 0.28, 0.07, M["text_dark"], "N", fallback="Cafeteria")
T("Cafe_Door_Sign_Cup", "☕", 6.35, -3.18, 2.62, 0.16, 0.14, M["text_dark"], "N", fallback="CAFE")
# (사진 DSC04489) 북쪽 벽 서→동: 출입문 → 소화기 → 노래방 기기 → 노란 벽(분리수거함·전자레인지·커피머신·선반) → 정수기 → 냉장고
ext_stand("Cafe_Door_Extinguisher", 6.4, -3.62)
cbox("Cafe_Karaoke_Speaker", 6.9, -3.7, 0, 0.58, 0.6, 0.76, M["charcoal"])
cbox("Cafe_Karaoke_Amp_Rack", 6.9, -3.7, 0.76, 0.54, 0.56, 0.38, M["steel"])
cbox("Cafe_Karaoke_Monitor", 6.9, -3.6, 1.14, 0.5, 0.36, 0.34, M["neon"])
box("Cafe_Yellow_Wall_North", 7.3, -3.42, 0.85, 9.32, -3.38, 2.75, M["cafe_yellow"])
box("Cafe_Yellow_Wall_East", 9.28, -4.2, 0.85, 9.32, -3.4, 2.75, M["cafe_yellow"])
for i, sz in enumerate([1.45, 1.85, 2.25]):
    box(f"Cafe_Yellow_Wood_Shelf_{i + 1}", 7.35, -3.68, sz, 8.4, -3.42, sz + 0.04, M["wood_light"])
cbox("Cafe_4Bin_White_Counter", 7.85, -3.7, 0, 1.0, 0.6, 0.9, M["white"])
for i in range(4):
    bx = 7.47 + i * 0.25
    box(f"Cafe_Bin_Slot_{i + 1}", bx - 0.09, -4.015, 0.74, bx + 0.09, -4.0, 0.8, M["panel_white"])
    cbox(f"Cafe_Bin_Icon_{i + 1}", bx, -4.008, 0.35, 0.1, 0.01, 0.1, M["text_dark"])
cbox("Cafe_White_Microwave", 7.65, -3.68, 0.9, 0.46, 0.36, 0.28, M["white"])
cbox("Cafe_Black_Espresso", 8.12, -3.65, 0.9, 0.3, 0.38, 0.42, M["black"])
cbox("Cafe_Water_Purifier", 8.55, -3.62, 0, 0.36, 0.42, 1.3, M["white"])
cbox("Cafe_Silver_Fridge", 9.02, -3.75, 0, 0.58, 0.7, 1.84, M["steel"])
# 원형 테이블 3 + 민트·흰·검정 의자 + 파란 의자 (출입문 쪽)
for i, (tx, ty) in enumerate([(5.6, -5.4), (6.9, -6.9), (5.7, -8.4)]):
    cyl(f"Cafe_Round_Table_{i + 1}_Top", tx, ty, 0.72, 0.4, 0.04, M["white"], 28)
    for j, a in enumerate([0.4, 2.5, 4.6]):
        cbox(f"Cafe_Round_Table_{i + 1}_Leg_{j + 1}", tx + 0.15 * math.cos(a), ty + 0.15 * math.sin(a), 0, 0.04, 0.04,
             0.72, M["wood_light"])
    chair(f"Cafe_Shell_Chair_{i + 1}_A", tx - 0.6, ty, M["mint"])
    chair(f"Cafe_Shell_Chair_{i + 1}_B", tx + 0.6, ty, [M["white"], M["black"], M["mint"]][i])
chair("Cafe_Blue_Seat_Chair", 5.15, -4.45, M["blue_seat"])
# 동쪽 벽: 대형 TV + 원목 하이 바 테이블 + 바 스툴 4
tv("Cafe_Large_Wall_TV", 9.31, -5.6, 1.45, 1.55, 0.88, "W", on=False)
cbox("Cafe_Wood_Bar_Table", 8.55, -5.6, 1.0, 0.62, 2.1, 0.05, M["wood_light"])
for i, dy in enumerate([-0.95, 0.95]):
    cbox(f"Cafe_Bar_Table_Leg_{i + 1}", 8.55, -5.6 + dy, 0, 0.5, 0.06, 1.0, M["black"])
for i, by in enumerate([-6.35, -5.85, -5.35, -4.85]):
    cyl(f"Cafe_Bar_Stool_Seat_{i + 1}", 7.95, by, 0.68, 0.17, 0.05, M["white"] if i % 2 else M["black"], 16)
    cyl(f"Cafe_Bar_Stool_Leg_{i + 1}", 7.95, by, 0, 0.03, 0.68, M["wood_light"], 8)
# 남쪽 정면 유리창 우드 블라인드
for i in range(14):
    box(f"Cafe_Wood_Blind_Slat_{i + 1}", 5.0, -9.93, 1.75 + i * 0.06, 9.0, -9.89, 1.77 + i * 0.06, M["blind"])
# 건강관리 코너(동쪽 벽 남쪽): 자동 혈압계 + 회전 스툴 + 인바디 + 안내 포스터
cbox("Cafe_BP_Monitor_Stand", 9.05, -7.3, 0, 0.48, 0.42, 0.76, M["white"])
cbox("Cafe_BP_Monitor_Body", 9.05, -7.3, 0.76, 0.38, 0.32, 0.24, M["white"])
cyl("Cafe_BP_Lime_Cuff", 8.9, -7.25, 0.82, 0.09, 0.16, M["lime"], 16).rotation_euler.y = math.pi / 2
cyl("Cafe_BP_Black_Stool", 8.55, -7.3, 0, 0.18, 0.45, M["black"], 16)
cbox("Cafe_InBody_Base", 9.0, -8.5, 0, 0.55, 0.45, 0.08, M["charcoal"])
cbox("Cafe_InBody_Column", 9.17, -8.5, 0.08, 0.12, 0.08, 0.95, M["white"])
cbox("Cafe_InBody_Head", 9.17, -8.5, 1.03, 0.2, 0.3, 0.08, M["white"])
box("Cafe_InBody_Poster", 9.3, -9.0, 1.3, 9.32, -8.45, 2.0, M["banner_white"])
T("Cafe_InBody_Poster_Text", "인바디검사", 9.29, -8.72, 1.88, 0.45, 0.07, M["text_dark"], "W", fallback="InBody")
for i in range(3):  # 레일 조명 (천장)
    box(f"Ceiling_Cafe_Track_Light_{i + 1}", 5.0, -8.6 + i * 2.0, 3.1, 8.9, -8.55 + i * 2.0, 3.15, M["black"])

# =====================================================================
#  8) 교육 복도 (사진 9·10) — 불투명 유리 회의실 · 보안 유리문(LG U+) · TV · 매립 벤치 니치
# =====================================================================
# 서쪽 끝: 그린월 복도로 통하는 LG U+ 보안 유리문
wall("Security_Glass_Wall", 0, 4.45, 0, 6.8, M["frosted"], t=0.06, openings=[(0.25, 1.85, 2.5)])
# 자동문 (좌우로 열림): 이름 AutoDoor_<그룹>_* → 게임에서 사람이 다가가면 양쪽으로 미끄러져 열림
box("AutoDoor_Edu_L", -0.03, 4.7, 0, 0.03, 5.5, 2.45, M["frosted"])
box("AutoDoor_Edu_R", -0.03, 5.5, 0, 0.03, 6.3, 2.45, M["frosted"])
for side, (yc, fx) in {"L": (5.1, "E"), "R": (5.9, "E")}.items():
    T(f"AutoDoorLogo_Edu_{side}_E", "LG U+", 0.045, yc, 1.35, 0.55, 0.14, M["magenta"], "E", extrude=0.01)
    T(f"AutoDoorLogo_Edu_{side}_W", "LG U+", -0.045, yc, 1.35, 0.55, 0.14, M["magenta"], "W", extrude=0.01)
cbox("Security_Card_Reader", 0.08, 6.5, 1.15, 0.03, 0.1, 0.15, M["black"])
# 북쪽: 불투명 유리 회의실 2칸 (검은 프레임)
wall("MeetingRoom_Glass_Wall", 0, 6.6, 7.1, 6.6, M["frosted"], t=0.06, openings=[(1.0, 1.95, 2.3), (4.4, 5.35, 2.3)])
for i, x in enumerate([0.15, 1.0, 1.95, 3.55, 4.4, 5.35, 7.0]):
    cbox(f"MeetingRoom_Black_Frame_{i + 1}", x, 6.6, 0, 0.1, 0.1, WALL_H, M["charcoal"])
for i in range(6):  # 유리 사선 패턴
    o = cbox(f"MeetingRoom_Glass_Pattern_{i + 1}", 0.6 + i * 1.1, 6.56, 1.0, 1.0, 0.005, 0.01, M["panel_white"])
    o.rotation_euler.y = 0.35
wall("MeetingRoom_Divider", 3.55, 6.6, 3.55, 10.45, M["frosted"], t=0.06)
wall("MeetingRoom_Back_Wall", 0, 10.45, 7.1, 10.45, M["wall_white"])
wall("MeetingRoom_West_Wall", 0, 6.8, 0, 10.45, M["wall_white"])
cbox("MeetingRoom_Door_1_Open", 1.48, 7.1, 0, 0.05, 0.92, 2.25, M["frosted"])
cbox("MeetingRoom_Door_2_Open", 4.88, 7.1, 0, 0.05, 0.92, 2.25, M["frosted"])
for i, cx in enumerate([1.8, 5.3]):
    cbox(f"MeetingRoom_Table_{i + 1}", cx, 9.1, 0, 2.0, 0.9, 0.74, M["white"])
    for j in range(3):
        chair(f"MeetingRoom_Chair_{i + 1}_{j + 1}", cx - 0.6 + j * 0.6, 8.35, M["black"])
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
# (복도 남쪽 끝 벽은 없애고 카페테리아 북쪽 벽까지 늘림 → 동쪽 벽이 카페 동쪽 벽과 한 줄)
wall("Locker_Corridor_East_Wall", 9.4, -3.3, 9.4, 4.45, M["panel_white"], openings=[(0.15, 1.05, 2.3)])  # 전산2 문 (전산1 문은 북측 복도로 옮겨 벽)
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
# (교육 복도 끝선 Y 4.45 부터 전산강의장2 문 조금 앞 Y -1.6 까지)
box("Locker_Bench_Charcoal_Surround", 9.12, -1.6, 0, 9.4, 4.45, 2.7, M["charcoal"])
box("Locker_Bench_Seat_Cushion", 8.85, -1.55, 0, 9.12, 4.4, 0.45, M["cushion_gray"])
for i, ry in enumerate([-1.05, -0.06, 0.93, 1.92, 2.91, 3.9]):
    for j, cz in enumerate([0.75, 1.35, 1.95]):
        cbox(f"Locker_Bench_Fabric_Tile_{i}_{j}", 9.1, ry, cz - 0.28, 0.04, 0.9, 0.56, M["cushion_gray"])
for i, cy in enumerate([-1.25, -0.98, 0.3, 1.5, 1.77, 2.05, 3.6]):
    cbox(f"Locker_Bench_BW_Pillow_{i + 1}", 8.97, cy, 0.45, 0.2, 0.3, 0.3, M["white"] if i % 2 else M["black"], rot_z=0.15)
plant("Locker_End_Lucky_Bamboo", 7.45, -3.0, 1.7)
box("Sign_CompRoom2_Plate", 9.31, -3.05, 2.35, 9.33, -2.45, 2.58, M["white"])
T("Sign_CompRoom2_Text", "전산강의장2", 9.3, -2.75, 2.46, 0.52, 0.1, M["text_dark"], "W", fallback="PC Room 2")
# (사물함 맞은편 작은 강의장은 삭제 → 전산강의장2 가 이 자리부터 시작, 문은 사물함 복도 쪽)

# 교육 복도 동쪽 끝(분기점): 4구 분리수거함 + TV + 화분
wall("Junction_East_Wall", 9.4, 4.45, 9.4, 6.6, M["panel_white"])
# (사진 4490) 교육 복도 끝 벽: 복도 진입선(Y 4.45)부터 전산강의장1 문 앞까지 — 분리수거함 + TV + 정수기
cbox("Junction_End_4Bin_Cabinet", 9.12, 5.55, 0, 0.5, 2.1, 0.9, M["white"])
cbox("Junction_End_Cabinet_Top", 9.1, 5.55, 0.9, 0.54, 2.12, 0.03, M["white"])
for i, label in enumerate(["일반 쓰레기", "PET/캔/유리병", "종이/비닐", "음식물"]):
    by = 6.33 - i * 0.52  # 복도에서 볼 때 왼쪽(북)부터
    box(f"Junction_Bin_Slot_{i + 1}", 8.855, by - 0.15, 0.72, 8.87, by + 0.15, 0.8, M["panel_white"])
    T(f"Junction_Bin_Label_{i + 1}", label, 8.86, by, 0.6, 0.38, 0.05, M["text_dark"], "W", fallback="Bin")
    cbox(f"Junction_Bin_Icon_{i + 1}", 8.86, by, 0.32, 0.01, 0.14, 0.14, M["text_dark"])
    if i:
        box(f"Junction_Bin_Gap_{i}", 8.855, by + 0.255, 0.05, 8.865, by + 0.265, 0.88, M["panel_white"])
tv("Junction_End_TV", 9.33, 5.55, 1.45, 0.9, 0.52, "W")
cbox("Junction_Water_Purifier", 9.13, 6.88, 0, 0.45, 0.4, 1.35, M["white"])
cbox("Junction_Water_Purifier_Niche", 8.9, 6.88, 0.85, 0.01, 0.26, 0.3, M["steel"])
for i, (fx, fy) in enumerate([(9.12, 5.0), (9.12, 6.1)]):
    leaf_ball(f"Junction_Cabinet_Flower_{i + 1}", fx, fy, 1.0, 0.07, M["red_flower"])

# =====================================================================
#  10) 북측 강의장 복도 — 상담사 액자 · 끝에서 서쪽=강사실, 북쪽=실습실, 동쪽=일반강의장
#      동쪽 방 (남→북): 전산강의장2 · 전산강의장1 · 일반강의장
# =====================================================================
def seat(name, x, y, face="N", color=None):
    """의자: face = 앉은 사람이 바라보는 방향"""
    c = color or M["black"]
    cbox(f"{name}_Seat", x, y, 0.42, 0.46, 0.46, 0.05, c)
    off = {"N": (0, -0.21, 0.46, 0.04), "S": (0, 0.21, 0.46, 0.04), "E": (-0.21, 0, 0.04, 0.46), "W": (0.21, 0, 0.04, 0.46)}[face]
    cbox(f"{name}_Back", x + off[0], y + off[1], 0.47, off[2], off[3], 0.45, c)
    cbox(f"{name}_Post", x, y, 0, 0.06, 0.06, 0.42, M["steel"])


def pc_desk(name, cx, cy, face="N", w=1.2, d=0.6):
    """모니터 + PC 본체가 있는 책상 (face = 앉은 사람이 보는 방향)"""
    sx, sy = (w, d) if face in ("N", "S") else (d, w)
    cbox(f"{name}_Top", cx, cy, 0, sx, sy, 0.74, M["white"])
    dx, dy = {"N": (0, 0.18), "S": (0, -0.18), "E": (0.18, 0), "W": (-0.18, 0)}[face]
    mw = (0.55, 0.04) if face in ("N", "S") else (0.04, 0.55)
    cbox(f"{name}_Monitor", cx + dx, cy + dy, 0.8, mw[0], mw[1], 0.34, M["black"])
    cbox(f"{name}_Monitor_Stand", cx + dx, cy + dy, 0.74, 0.08, 0.08, 0.06, M["black"])
    px, py = (cx + sx / 2 - 0.15, cy) if face in ("N", "S") else (cx, cy + sy / 2 - 0.15)
    cbox(f"{name}_PC_Tower", px, py, 0.74, 0.18, 0.4, 0.4, M["charcoal"]) if face in ("N", "S") else cbox(
        f"{name}_PC_Tower", px, py, 0.74, 0.4, 0.18, 0.4, M["charcoal"])
    sdx, sdy = {"N": (0, -0.6), "S": (0, 0.6), "E": (-0.6, 0), "W": (0.6, 0)}[face]
    seat(f"{name}_Chair", cx + sdx, cy + sdy, face)


def lecture_front(prefix, x1, x2, y_wall):
    """북쪽 벽: 스크린 + 교수대(LG U+) + 강사 책상 (교육생은 북쪽을 봄)"""
    mid = (x1 + x2) / 2
    box(f"{prefix}_Front_Wood_Wall", x1, y_wall - 0.04, 0, x2, y_wall, 2.9, M["wood_panel"])
    box(f"{prefix}_Whiteboard", x1 + 0.5, y_wall - 0.06, 0.9, x2 - 0.5, y_wall - 0.04, 2.2, M["white"])
    box(f"{prefix}_Projector_Screen", mid - 1.2, y_wall - 0.09, 0.95, mid + 1.2, y_wall - 0.07, 2.45, M["white"])
    box(f"{prefix}_Screen_Case", mid - 1.3, y_wall - 0.15, 2.45, mid + 1.3, y_wall - 0.05, 2.55, M["charcoal"])
    cbox(f"{prefix}_Lectern", mid + 1.9, y_wall - 1.0, 0, 0.6, 0.45, 1.1, M["wood_panel"])
    T(f"{prefix}_Lectern_Logo", "LG U+", mid + 1.9, y_wall - 1.235, 0.85, 0.4, 0.09, M["magenta"], "S")
    cbox(f"{prefix}_Teacher_Desk", x2 - 1.0, y_wall - 0.9, 0, 1.4, 0.7, 0.74, M["white"])
    cbox(f"{prefix}_Teacher_Monitor", x2 - 1.0, y_wall - 0.7, 0.74, 0.55, 0.05, 0.35, M["black"])
    seat(f"{prefix}_Teacher_Chair", x2 - 1.0, y_wall - 0.25, "S")
    cbox(f"{prefix}_Projector", mid, y_wall - 3.0, 2.75, 0.35, 0.3, 0.15, M["white"])


def east_blinds(prefix, y1, y2):
    n = max(1, int((y2 - y1 - 0.4) // 1.1))
    w = (y2 - y1 - 0.4) / n
    for i in range(n):
        box(f"{prefix}_Roller_Blind_{i + 1}", 17.52, y1 + 0.2 + i * w + 0.05, 0.6, 17.55, y1 + 0.2 + (i + 1) * w - 0.05, 2.8, M["roller"])


# 복도 벽: 서쪽(회의실 뒤 ~ 강사실, 강사실 문), 동쪽(전산2·전산1·일반강의장 문), 끝벽(실습실 문)
wall("North_Corr_West_Wall", 7.1, 6.6, 7.1, 14.35, M["panel_white"], openings=[(6.3, 7.2, 2.3)])  # 강사실 문
wall("North_Corr_East_Wall", 9.4, 6.6, 9.4, 14.35, M["panel_white"],
     openings=[(0.6, 1.5, 2.3), (2.4, 3.3, 2.3)])  # 경계벽 바로 아래 = 전산강의장1 문 · 바로 위 = 일반강의장 문
wall("North_Corr_End_Wall", 7.1, 14.35, 9.4, 14.35, M["panel_white"], openings=[(0.7, 1.6, 2.3)])  # 실습실 문
for i, py in enumerate([7.6, 8.8, 10.0, 11.2]):
    s = 0.95 if i == 0 else 0.72
    box(f"Consultant_Acrylic_Photo_{i + 1}", 7.18, py - s / 2, 1.58 - s / 2, 7.2, py + s / 2, 1.58 + s / 2, M["photo"][i + 2])
    cbox(f"Consultant_Photo_Headset_{i + 1}", 7.205, py, 1.52, 0.005, s * 0.45, s * 0.45, M["pot"])
T("Consultant_Photo_Quote", "미소는 친절이라는 나무의 뿌리입니다", 7.215, 7.6, 1.9, 0.85, 0.07, M["white"], "E",
  fallback="Smile is the root of kindness")
box("North_Corr_Fire_Alarm", 9.31, 8.4, 1.2, 9.33, 8.56, 1.55, M["text_red"])
plant("North_Corr_Fiddle_Leaf", 9.0, 12.35, 1.4)
for i, (y, label) in enumerate([(7.65, "전산강의장1"), (10.4, "일반강의장")]):
    box(f"North_Corr_Door_Sign_{i + 1}", 9.31, y - 0.75, 2.35, 9.33, y - 0.15, 2.58, M["white"])
    T(f"North_Corr_Door_Sign_Text_{i + 1}", label, 9.3, y - 0.45, 2.46, 0.52, 0.1, M["text_dark"], "W", fallback="Room")
box("Instructor_Door_Sign", 7.17, 13.05, 2.35, 7.19, 13.65, 2.58, M["white"])
T("Instructor_Door_Sign_Text", "강사실", 7.2, 13.35, 2.46, 0.4, 0.1, M["text_dark"], "E", fallback="Staff")
box("Practice_Door_Sign", 7.2, 14.27, 2.35, 7.75, 14.29, 2.58, M["white"])
T("Practice_Door_Sign_Text", "실습실", 7.47, 14.26, 2.46, 0.4, 0.1, M["text_dark"], "S", fallback="Practice")
exit_sign("North_Corr_Exit_Sign", 8.25, 14.27, 2.62, "S")


# ── 여닫이문 (진한 회색) ──
#  이름 SwingDoor_<id>_H<min|max>_O<p|n> → 게임에서 사람이 다가가면 경첩(H) 쪽을 축으로 90도 열림
#  H = 벽 방향 좌표의 작은 쪽(min)/큰 쪽(max)에 경첩, O = 벽에 수직인 좌표의 +(p)/-(n) 쪽(방 안)으로 열림
#  손잡이 등 붙은 부품은 SwingDoorPart_<id>_* (문짝과 같이 움직임)
def swing_door(did, axis, line, a, b, hinge, opens, h=2.25):
    """axis="x": 벽이 X 방향(가로 벽, Y=line), axis="y": 벽이 Y 방향(세로 벽, X=line). a~b = 문 구멍"""
    name = f"SwingDoor_{did}_H{hinge}_O{'p' if opens > 0 else 'n'}"
    free = a if hinge == "max" else b  # 손잡이 쪽 끝
    hx = free + (0.12 if hinge == "max" else -0.12)
    t = 0.05
    if axis == "x":
        box(name, a + 0.01, line - t / 2, 0, b - 0.01, line + t / 2, h, M["door_gray"])
        for k, sgn in (("A", 1), ("B", -1)):
            cbox(f"SwingDoorPart_{did}_Handle_{k}", hx, line + sgn * 0.05, 0.98, 0.14, 0.04, 0.04, M["steel"])
    else:
        box(name, line - t / 2, a + 0.01, 0, line + t / 2, b - 0.01, h, M["door_gray"])
        for k, sgn in (("A", 1), ("B", -1)):
            cbox(f"SwingDoorPart_{did}_Handle_{k}", line + sgn * 0.05, hx, 0.98, 0.04, 0.14, 0.04, M["steel"])


swing_door("Comp2", "y", 9.4, -3.15, -2.25, "max", +1)      # 전산강의장2 (사물함 복도)
swing_door("Comp1", "y", 9.4, 7.2, 8.1, "min", +1)          # 전산강의장1
swing_door("Lecture", "y", 9.4, 9.0, 9.9, "max", +1)        # 일반강의장
swing_door("Instructor", "y", 7.1, 12.9, 13.8, "max", -1)   # 강사실
swing_door("Practice", "x", 14.35, 7.8, 8.7, "max", +1)     # 실습실

# 동쪽 방 공통 벽
wall("East_Rooms_South_Wall", 9.4, -10, 17.6, -10, M["panel_white"])  # 건물 정면 벽 선
wall("CompRoom2_CompRoom1_Divider", 9.4, -2.2, 17.6, -2.2, M["wood_panel"])
wall("CompRoom1_Lecture_Divider", 9.4, 8.6, 17.6, 8.6, M["wood_panel"])
wall("Lecture_North_Wall", 9.4, 18.2, 17.6, 18.2, M["wood_panel"])
wall("Practice_North_Wall", 0, 18.2, 9.4, 18.2, M["wood_panel"])  # 일반강의장 북쪽 벽과 같은 선
wall("East_Rooms_East_Wall", 17.6, -10, 17.6, 18.2, M["panel_white"])
wall("Practice_Room_East_Wall", 9.4, 14.35, 9.4, 18.2, M["panel_white"])

# =====================================================================
#  11) 전산강의장2 · 전산강의장1 — 상담석처럼 모니터·PC 가 있는 좌석 (북쪽 스크린을 봄)
# =====================================================================
for pre, y0, y1, rows in (("CompRoom2", -10.0, -2.2, [-8.7, -7.35, -6.0]),
                          ("CompRoomN1", -2.2, 8.6, [-0.5, 1.05, 2.6, 4.15, 5.7])):  # 전산1: 5줄 (뒤쪽까지 채움)
    lecture_front(pre, 9.4, 17.6, y1)
    east_blinds(pre, y0, y1)
    for r, ry in enumerate(rows):  # 줄 × 2분단(분단당 3석)
        for g, gx in enumerate([11.8, 15.6]):
            for k in range(3):
                pc_desk(f"{pre}_PC_{r}_{g}_{k}", gx - 1.0 + k * 1.0, ry, "N", w=1.0)
    cyl(f"{pre}_Air_Purifier", 17.2, y0 + 0.45, 0, 0.18, 0.8, M["white"], 20)  # 뒤쪽 동쪽 구석 (문 앞 비움)

# =====================================================================
#  12) 일반강의장 — 이론 교육: 모니터 없는 흰 책상(2인용) · 원목 앞벽 · 스크린 · LG U+ 교수대
# =====================================================================
lecture_front("Lecture", 9.4, 17.6, 18.2)
east_blinds("Lecture", 8.6, 18.2)
box("Ceiling_Lecture_Wood_Soffit", 9.4, 17.0, 2.9, 17.6, 18.2, 3.2, M["wood_panel"])
for r, ry in enumerate([11.35, 12.6, 13.85, 15.1, 16.35]):  # 5줄 (문 앞 비움) × 3분단 (2인용 책상) = 30석
    for g, gx in enumerate([11.0, 13.6, 16.2]):
        cbox(f"Lecture_Desk_{r}_{g}", gx, ry, 0.72, 1.5, 0.5, 0.04, M["white"])
        for k, lx in enumerate((-0.68, 0.68)):
            cbox(f"Lecture_Desk_Leg_{r}_{g}_{k}", gx + lx, ry, 0, 0.04, 0.4, 0.72, M["white"])
            seat(f"Lecture_Chair_{r}_{g}_{k}", gx + lx * 0.55, ry - 0.5, "N")
plant("Lecture_Corner_Plant", 9.85, 17.6, 1.3)
cyl("Lecture_Air_Purifier", 9.8, 16.9, 0, 0.18, 0.8, M["white"], 20)

# =====================================================================
#  13) 실습실 — 상담석과 같은 구조 (위 2줄 마주보기 4석씩 · 아래 1줄 4석) · 동쪽 스크린 · 강사 책상
# =====================================================================
wall("Practice_West_Wall", 0, 10.45, 0, 18.2, M["wall_white"])
wall("Practice_Instructor_Divider", 0, 14.35, 7.1, 14.35, M["panel_white"])
# 교육생 좌석: 모두 동쪽 스크린을 바라봄 (5석씩, 서쪽 벽부터)
#   북쪽 벽에 붙은 2인 나란히 줄 2개 + 가운데 통로 + 남쪽 벽에 붙은 1인 줄 1개 = 15석
PRACTICE_X = [1.0, 2.25, 3.5, 4.75, 6.0]
for c, cx in enumerate(PRACTICE_X):
    for r, cy in enumerate([17.65, 16.75]):
        pc_desk(f"Practice_Pair_{c}_{r}", cx, cy, "E", w=0.9)
    pc_desk(f"Practice_Single_{c}", cx, 14.9, "E", w=0.9)
box("Practice_Pair_Partition", 0.6, 16.28, 0.74, 6.4, 16.31, 1.15, M["blue_partition"])
box("Practice_Single_Partition", 0.6, 15.34, 0.74, 6.4, 15.37, 1.15, M["blue_partition"])
box("Practice_Screen", 9.33, 15.3, 0.95, 9.35, 17.7, 2.45, M["white"])
box("Practice_Screen_Case", 9.25, 15.2, 2.45, 9.38, 17.8, 2.55, M["charcoal"])
pc_desk("Practice_Teacher_Desk", 8.25, 16.9, "W", w=1.4, d=0.7)  # 관리자석: 출입문과 같은 선
plant("Practice_Corner_Plant", 7.4, 17.85, 1.3)

# =====================================================================
#  14) 강사실 — 파티션 책상 · 책장 (문: 복도 서쪽 벽 끝)
# =====================================================================
# 강사실 (Y 10.45~14.35): 서쪽 세로 팀장석 1 + 북쪽 벽 줄 3석 + 남쪽 벽 줄 3석 (마주봄) · 문: 복도 서쪽 벽
pc_desk("Instructor_Leader_Desk", 0.95, 12.4, "E", w=1.6, d=0.7)   # 팀장석: 세로 책상, 방 쪽(동쪽)을 바라봄
cbox("Instructor_Leader_Nameplate", 1.32, 12.4, 0.74, 0.04, 0.3, 0.08, M["wood_panel"])
for i, x in enumerate([2.15, 3.35, 4.55]):
    pc_desk(f"Instructor_Desk_N_{i + 1}", x, 13.95, "N", w=1.15)   # 북쪽 벽 줄
    pc_desk(f"Instructor_Desk_S_{i + 1}", x, 10.85, "S", w=1.15)   # 남쪽 벽 줄
box("Instructor_North_Partition", 1.55, 13.62, 0.74, 5.15, 13.65, 1.15, M["blue_partition"])
box("Instructor_South_Partition", 1.55, 11.15, 0.74, 5.15, 11.18, 1.15, M["blue_partition"])
cbox("Instructor_Back_Bookshelf", 6.25, 10.73, 0, 1.4, 0.4, 2.2, M["wood_panel"])
for i in range(3):
    for j, bz in enumerate([0.5, 1.2, 1.9]):
        cbox(f"Instructor_Books_{i}_{j}", 5.8 + i * 0.45, 10.98, bz, 0.35, 0.05, 0.28, M["book"][(i + j) % 6])
cyl("Instructor_Air_Purifier", 5.85, 13.95, 0, 0.18, 0.75, M["white"], 20)
plant("Instructor_Corner_Plant", 0.4, 13.95, 1.4)

# =====================================================================
#  천장 (게임에서는 Ceiling_ 이름이라 자동으로 숨김)
# =====================================================================
box("Ceiling_Lobby", -8.7, -10, 3.25, 7.8, -2.3, 3.3, M["white"])
box("Ceiling_Corridor", -2.45, -2.3, 3.25, 0, 6.8, 3.3, M["white"])
box("Ceiling_Office_Wing", 0, 4.45, 3.25, 17.6, 18.2, 3.3, M["white"])

# =====================================================================
#  마무리: 내보내기
# =====================================================================
bpy.context.view_layer.update()


# ---------------------------------------------------------------------
#  계단실 (비상구 문 안쪽): 문 바로 안쪽 계단참 + 오르는 계단 · 내려가는 계단 두 줄 + 가운데 벽
#  (x0, y0)~(x1, y1) = 계단실 범위, land = 계단참이 있는 쪽(N/S/E/W), walls = 새로 세울 벽(엘리베이터 홀 쪽 벽은 이미 있음)
#  게임에서는 계단참의 초록 원 위에 서면 '층간 이동' 버튼이 뜸 (서버 STAIRS)
# ---------------------------------------------------------------------
def stair_room(pre, x0, y0, x1, y1, land, floor_label, walls, LAND=1.4):
    if "N" in walls:
        wall(f"{pre}_North_Wall", x0, y1, x1, y1, M["panel_white"])
    if "S" in walls:
        wall(f"{pre}_South_Wall", x0, y0, x1, y0, M["panel_white"])
    if "W" in walls:
        wall(f"{pre}_West_Wall", x0, y0, x0, y1, M["panel_white"])
    if "E" in walls:
        wall(f"{pre}_East_Wall", x1, y0, x1, y1, M["panel_white"])
    horiz = land in ("N", "S")  # 계단이 남북으로 놓임
    if land == "N":
        lr, a0, a1 = (x0, y1 - LAND, x1, y1), y1 - LAND, y0
    elif land == "S":
        lr, a0, a1 = (x0, y0, x1, y0 + LAND), y0 + LAND, y1
    elif land == "W":
        lr, a0, a1 = (x0, y0, x0 + LAND, y1), x0 + LAND, x1
    else:
        lr, a0, a1 = (x1 - LAND, y0, x1, y1), x1 - LAND, x0
    box(f"{pre}_Landing_Floor", lr[0], lr[1], -0.02, lr[2], lr[3], 0.0, M["steel"])
    c0, c1 = (x0, x1) if horiz else (y0, y1)  # 계단 폭 방향
    cm = (c0 + c1) / 2
    lanes = (("Up", c0 + 0.05, cm - 0.08), ("Down", cm + 0.08, c1 - 0.05))

    def R(name, along1, along2, cross1, cross2, z1, z2, mat):
        a_lo, a_hi = min(along1, along2), max(along1, along2)
        if horiz:
            return box(name, cross1, a_lo, z1, cross2, a_hi, z2, mat)
        return box(name, a_lo, cross1, z1, a_hi, cross2, z2, mat)

    n = 10
    step = (a1 - a0) / n
    for lane, q0, q1 in lanes:
        for k in range(n):
            s1, s2 = a0 + k * step, a0 + (k + 1) * step
            m = M["steel"] if k % 2 else M["charcoal"]
            if lane == "Up":
                R(f"{pre}_Up_Step_{k + 1}", s1, s2, q0, q1, 0, 0.17 * (k + 1), m)
            else:
                R(f"{pre}_Down_Step_{k + 1}", s1, s2, q0, q1, -1.9, -0.17 * (k + 1), m)
    R(f"{pre}_Down_Pit_Floor", a0, a1, cm + 0.08, c1 - 0.05, -2.0, -1.9, M["charcoal"])
    R(f"{pre}_Center_Wall", a0, a1, cm - 0.08, cm + 0.08, 0, 1.1, M["panel_white"])
    R(f"{pre}_Down_Rail", a0 - 0.04, a0 + 0.04, cm + 0.08, c1 - 0.05, 0, 1.0, M["steel"])
    R(f"{pre}_Down_Rail_Top", a0 - 0.06, a0 + 0.06, cm + 0.08, c1 - 0.05, 1.0, 1.06, M["black"])
    # 초록 안내선 (계단참 가운데)
    lx, ly = (lr[0] + lr[2]) / 2, (lr[1] + lr[3]) / 2
    if horiz:
        box(f"{pre}_Glow_Line", lx - 0.6, ly - 0.05, 0, lx + 0.6, ly + 0.05, 0.01, M["tape_green"])
    else:
        box(f"{pre}_Glow_Line", lx - 0.05, ly - 0.6, 0, lx + 0.05, ly + 0.6, 0.01, M["tape_green"])
    # 계단 끝 벽: 층 표시 + 위/아래 안내 (계단참 쪽을 바라봄)
    face = {"N": "N", "S": "S", "W": "W", "E": "E"}[land]
    ea = a1 + (0.03 if a1 > a0 else -0.03) * -1
    up_c, dn_c = (c0 + cm) / 2, (cm + c1) / 2
    for nm, cc, txt, w in (("Floor_Number", cm, floor_label, 0.7), ("Up_Text", up_c, "▲ 위층", 0.6), ("Down_Text", dn_c, "▼ 아래층", 0.7)):
        z = 2.25 if nm == "Floor_Number" else 1.75
        h = 0.35 if nm == "Floor_Number" else 0.16
        tx, ty = (cc, ea) if horiz else (ea, cc)
        T(f"{pre}_{nm}", txt, tx, ty, z, w, h, M["text_dark"], face, fallback=txt)


stair_room("Stair_1F", -11.2, -8.5, -8.7, -4.6, "N", "1F", walls=("N", "S", "W"))  # 엘리베이터 홀 서쪽 벽 검은 문 안쪽 (문 = 계단참)

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
