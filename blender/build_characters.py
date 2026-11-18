# =====================================================================
#  여성 상담사 캐릭터 2종 추가 스크립트 (Blender 5.x)
#
#  · 기존 characters.glb 를 불러와서
#      Character_Female_LongHair  : 긴 생머리 + 무릎 스커트 + 검정 스타킹
#      Character_Female_ShortHair : 단발 보브 + 바지
#    를 Character_Player_Consultant 와 같은 몸·관절 구조로 만들어 추가
#  · 관절 이름 규칙 유지 (…_Hip_L/R, …_Shoulder_L/R) → 게임에서 걷기 동작 그대로
#  · 가디건 재질(Cardigan_*)은 게임에서 사람마다 고른 색으로 바뀜
#
#  사용법: Blender → Scripting → Open → 이 파일 → ▶ Run Script
#          CHAR_IN 을 읽어서 CHAR_OUT 으로 내보냄 (경로는 아래에서 수정)
# =====================================================================
import bpy
import bmesh
import math
import os

PROJECT = r"C:\Users\User\company-metaverse"
CHAR_IN = os.environ.get("CHAR_IN", os.path.join(PROJECT, "glb_original", "characters.glb"))
CHAR_OUT = os.environ.get("CHAR_OUT", os.path.join(PROJECT, "client", "public", "characters.glb"))

SRC = "Player_Consultant"
SRC_ROOT = "Character_Player_Consultant"

# ---------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=CHAR_IN)
scene_col = bpy.context.scene.collection


def srgb(h):
    h = h.lstrip("#")
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def mat(name, hexcolor, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb(hexcolor), 1)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*srgb(hexcolor), 1)
    return m


M_HAIR_BROWN = mat("Hair_DarkBrown", "3b2618", 0.55)
M_HAIR_BLACK = mat("Hair_Black", "17120f", 0.5)
M_SKIRT = mat("Skirt_Navy", "1f2a44", 0.7)
M_TIGHTS = mat("Tights_Black", "1b1b1f", 0.6)
M_LIPS = mat("Lips_Rose", "d4697a", 0.5)
M_CHEEK = mat("Cheek_Pink", "f3a6a6", 0.8)
M_HAIRPIN = mat("Hairpin_Pearl", "f2efe8", 0.3)


def link_like(obj, ref):
    for c in ref.users_collection:
        c.objects.link(obj)


def dup_tree(src, parent, new_prefix):
    o = src.copy()
    if src.data:
        o.data = src.data.copy()
    o.name = src.name.replace(SRC, new_prefix)
    link_like(o, src)
    o.parent = parent
    if parent is not None:
        o.matrix_parent_inverse = src.matrix_parent_inverse.copy()
    for c in src.children:
        dup_tree(c, o, new_prefix)
    return o


def mesh_obj(name, bm, material, parent):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    link_like(o, parent)
    return o


def attach(o, parent, world_loc, rot=(0, 0, 0), scale=(1, 1, 1)):
    """월드 좌표로 놓은 뒤 부모에 붙이기 (위치 유지)"""
    o.location = world_loc
    o.rotation_euler = rot
    o.scale = scale
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.parent = parent
    o.matrix_world = mw
    return o


def ball(name, material, parent, loc, scale, seg=16, ring=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    return attach(mesh_obj(name, bm, material, parent), parent, loc, scale=scale)


def cube(name, material, parent, loc, size, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    return attach(mesh_obj(name, bm, material, parent), parent, loc, rot=rot, scale=size)


def cone(name, material, parent, loc, r1, r2, depth, seg=20, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth)
    return attach(mesh_obj(name, bm, material, parent), parent, loc, scale=scale)


def half_ball(name, material, parent, loc, scale):
    """위쪽 반구 (머리 덮개)"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.15], context="VERTS")
    return attach(mesh_obj(name, bm, material, parent), parent, loc, scale=scale)


def make_female(prefix, root_name, offset_x, long_hair):
    src_root = bpy.data.objects[SRC_ROOT]
    root = dup_tree(src_root, None, prefix)
    root.name = root_name
    root.location.x = src_root.location.x + offset_x
    bpy.context.view_layer.update()
    P = lambda part: bpy.data.objects[f"{prefix}_{part}"]

    # 남자 머리 제거
    for part in ("Hair_Top", "Hair_Bang"):
        o = P(part)
        bpy.data.objects.remove(o, do_unlink=True)

    head, torso = P("Head"), P("Torso")
    hx, hy, hz = head.matrix_world.translation  # 머리 중심 (Z≈1.38)

    # 몸매: 어깨 살짝 좁게
    torso.scale.x *= 0.92
    for side, sx in (("L", -1), ("R", 1)):
        P(f"Shoulder_{side}").location.x *= 0.95

    # 얼굴: 입술 · 볼터치
    cube(f"{prefix}_Lips", M_LIPS, head, (hx, hy - 0.163, hz - 0.075), (0.045, 0.012, 0.014))
    for i, sx in enumerate((-1, 1)):
        ball(f"{prefix}_Cheek_{i + 1}", M_CHEEK, head, (hx + sx * 0.095, hy - 0.135, hz - 0.03), (0.03, 0.01, 0.02))

    hair = M_HAIR_BROWN if long_hair else M_HAIR_BLACK
    # 머리 덮개 (정수리~뒤통수)
    half_ball(f"{prefix}_Hair_Cap", hair, head, (hx, hy + 0.012, hz + 0.02), (0.185, 0.18, 0.19))
    ball(f"{prefix}_Hair_Back", hair, head, (hx, hy + 0.07, hz - 0.02), (0.175, 0.13, 0.17))

    if long_hair:
        # 긴 생머리: 뒤로 등 중간까지 + 양옆 가닥 + 옆으로 넘긴 앞머리 + 진주 핀
        cube(f"{prefix}_Hair_Long_Back", hair, head, (hx, hy + 0.11, hz - 0.27), (0.32, 0.07, 0.42))
        ball(f"{prefix}_Hair_Long_Tip", hair, head, (hx, hy + 0.11, hz - 0.48), (0.16, 0.04, 0.05))
        for i, sx in enumerate((-1, 1)):
            cube(f"{prefix}_Hair_Side_Lock_{i + 1}", hair, head, (hx + sx * 0.165, hy + 0.04, hz - 0.17),
                 (0.05, 0.11, 0.36))
        cube(f"{prefix}_Hair_Bang_Swept", hair, head, (hx + 0.02, hy - 0.145, hz + 0.115), (0.27, 0.05, 0.08),
             rot=(0, 0.18, 0))
        ball(f"{prefix}_Hairpin", M_HAIRPIN, head, (hx + 0.12, hy - 0.11, hz + 0.13), (0.025, 0.012, 0.025))
        # 무릎 스커트 + 검정 스타킹 (다리는 스커트 안에서 그대로 움직임)
        cone(f"{prefix}_Skirt", M_SKIRT, torso, (root.location.x, 0, 0.56), 0.24, 0.185, 0.26, seg=24,
             scale=(1, 0.75, 1))
        for side in ("L", "R"):
            P(f"Leg_{side}").data.materials[0] = M_TIGHTS
    else:
        # 단발 보브: 턱선 길이, 옆·뒤 볼륨 + 일자 앞머리
        cube(f"{prefix}_Hair_Bob_Back", hair, head, (hx, hy + 0.1, hz - 0.1), (0.36, 0.1, 0.22))
        for i, sx in enumerate((-1, 1)):
            cube(f"{prefix}_Hair_Bob_Side_{i + 1}", hair, head, (hx + sx * 0.175, hy - 0.01, hz - 0.09),
                 (0.05, 0.2, 0.2))
            ball(f"{prefix}_Hair_Bob_Curl_{i + 1}", hair, head, (hx + sx * 0.17, hy - 0.04, hz - 0.2),
                 (0.05, 0.09, 0.035))
        cube(f"{prefix}_Hair_Bang_Straight", hair, head, (hx, hy - 0.15, hz + 0.115), (0.29, 0.045, 0.075))
    return root


make_female("Female_Long", "Character_Female_LongHair", 1.2, long_hair=True)
make_female("Female_Short", "Character_Female_ShortHair", 2.4, long_hair=False)
bpy.context.view_layer.update()
print("[characters] 루트:", [o.name for o in bpy.data.objects if o.parent is None])

if CHAR_OUT and os.path.isdir(os.path.dirname(CHAR_OUT)):
    bpy.ops.export_scene.gltf(filepath=CHAR_OUT, export_format="GLB", export_yup=True, export_apply=True,
                              export_cameras=False, export_lights=False)
    print(f"[characters] 내보내기 완료 → {CHAR_OUT}")
