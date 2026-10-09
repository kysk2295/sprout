# 49 · 꿈틀 정원 친구들 3D 스프라이트 생성기 (Blender 5.2, 헤드리스)
#
#   blender -b --factory-startup -P scripts/characters3d/kk3d.py -- <job.json>
#
# job.json = {"out": "dir", "size": 768, "samples": 96, "items": [{"kind": "char"|"seed"|"scene", ...}]}
#   char : {"species": "snail|frog|bee|worm", "stage": 1..5, "mood": "default|happy", "layer": "full|body|face|acc", "acc": "scarf", "name": "file"}
#   seed : {"seed": 0..3, "turn": 0..359, "crack": 0..3, "name": "file"}
#   scene: {"scene": "garden", "time": "day|dusk", "w": 1170, "h": 2000, "name": "file"}
#
# 그림은 전부 이 파일의 절차적 모델(메타볼 + 곡선 + 기본 도형)에서 나온다. 외부 모델·텍스처·남의 그림은 쓰지 않는다.
# 화풍(49 §2): 무광 비닐 인형 — 넓고 흐린 왼쪽 위 빛, 속살 빛(subsurface), 접촉 그림자, 작은 점 눈 + 가는 입, 볼 번짐 없음.
# 좌표: 바닥 z=0, 캐릭터는 -Y(카메라) 쪽을 본다. 정사영 카메라, 위에서 10°, 오른쪽으로 14° 돌아간 자리.
# 레이어(49 §4.3): full = 몸+얼굴 / body = 얼굴 없는 몸 / face = 얼굴만(몸은 그림자 받는 투명면) / acc = 옷만(몸·얼굴은 그림자 받는 투명면).
import bpy, bmesh, json, math, sys, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

# ───────── 색 ─────────
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)

PAL = {
    'snail': {'body': '#E6CDB0', 'belly': '#F1E2CC', 'shell': '#D27F62', 'shell2': '#C9775E', 'acc': '#8DB36B'},
    'frog':  {'body': '#78B68D', 'belly': '#DCE8C8', 'shell': '#7DB590', 'acc': '#F2B9C2'},
    'bee':   {'body': '#F2CB6B', 'belly': '#F7E3A6', 'shell': '#5E4B45', 'acc': '#FFFFFF'},
    'worm':  {'body': '#B9D98A', 'belly': '#E9F0C9', 'shell': '#8DB86A', 'acc': '#7C8CC8'},
}
INK = '#2B2420'
HUSK = '#C99063'
LEAF = '#5FA35A'
SEEDS = [  # 씨앗 고르기 4개(49 §5.2) — 껍질 색 · 무늬 색
    ('#C99063', '#E7C49B'), ('#B9876E', '#E9C7B8'), ('#A9A26F', '#DCD6A6'), ('#8E9AB4', '#CDD4E3')]

# ───────── 장면 기본 ─────────
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    # Metal은 재질 조합마다 커널을 새로 컴파일해서(첫 장 수 분) 작은 스프라이트는 CPU가 더 빠르다
    sc.cycles.device = 'CPU'
    sc.render.threads_mode = 'AUTO'
    sc.cycles.use_denoising = True
    # AgX는 밝은 파스텔을 회색으로 빼서 비닐 인형 색이 바랜다 → Standard + 약간 낮춘 노출(49 §2 색)
    sc.view_settings.view_transform = os.environ.get('KK_VIEW', 'Standard')
    sc.view_settings.exposure = float(os.environ.get('KK_EXPOSURE', '-0.35'))
    return sc

MATS = {}
def mat(name, hexc, rough=0.5, sss=0.18, sss_r=(1.0, 0.6, 0.45), coat=0.0, sheen=0.0, trans=0.0, ior=1.45, spec=0.35, emis=None):
    key = (name, hexc, rough, sss, coat, sheen, trans)
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(name)
    nt = m.node_tree if m.node_tree else None
    if nt is None:
        m.use_nodes = True; nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = lin(hexc)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Subsurface Weight'].default_value = sss
    p.inputs['Subsurface Radius'].default_value = sss_r
    p.inputs['Subsurface Scale'].default_value = 0.12
    p.inputs['Specular IOR Level'].default_value = spec
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = 0.25
    p.inputs['Sheen Weight'].default_value = sheen
    p.inputs['Sheen Roughness'].default_value = 0.4
    p.inputs['Transmission Weight'].default_value = trans
    p.inputs['IOR'].default_value = ior
    if emis:
        p.inputs['Emission Color'].default_value = lin(emis[0]); p.inputs['Emission Strength'].default_value = emis[1]
    MATS[key] = m
    return m

def banded(c1, c2, bands, rough=0.5, sss=0.22):
    """높이(물체 좌표 z)에 따라 띠 색이 바뀌는 비닐 재질 — 꿀벌 줄무늬"""
    m = mat('band' + c1 + c2, c1, rough=rough, sss=sss, sheen=0.25)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    els = ramp.color_ramp.elements; els[0].position = 0; els[0].color = lin(c1); els[1].position = 1; els[1].color = lin(c1)
    for lo, hi in bands:
        for pos, c in ((lo - 0.012, c1), (lo + 0.012, c2), (hi - 0.012, c2), (hi + 0.012, c1)):
            e = els.new(pos); e.color = lin(c)
    nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    return m

def vinyl(hexc, rough=0.52, sss=0.22):
    return mat('vinyl', hexc, rough=rough, sss=sss, sheen=0.25)

def link(o, coll=None):
    (coll or bpy.context.scene.collection).objects.link(o); return o

def smooth(o, subdiv=1):
    for p in o.data.polygons: p.use_smooth = True
    if subdiv:
        md = o.modifiers.new('sub', 'SUBSURF'); md.levels = subdiv; md.render_levels = subdiv
    return o

# 메타볼 덩어리 → 메시. elems: (kind, (x,y,z), radius, (sx,sy,sz), stiffness, negative)
def blob(name, elems, m, res=0.035, rot=None):
    mb = bpy.data.metaballs.new(name + '_mb'); mb.resolution = res; mb.render_resolution = res; mb.threshold = 0.6
    for e in elems:
        kind, co, r = e[0], e[1], e[2]
        el = mb.elements.new(type=kind)
        el.co = co; el.radius = r
        if len(e) > 3 and e[3]:
            sx, sy, sz = e[3]
            if kind in ('ELLIPSOID', 'CUBE'): el.size_x, el.size_y, el.size_z = sx, sy, sz
            elif kind == 'CAPSULE': el.size_x = sx
        if len(e) > 4 and e[4] is not None: el.stiffness = e[4]
        if len(e) > 5 and e[5]: el.use_negative = True
        if len(e) > 6 and e[6]: el.rotation = e[6]
    tmp = link(bpy.data.objects.new(name + '_tmp', mb))
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp); bpy.data.metaballs.remove(mb)
    o = link(bpy.data.objects.new(name, me))
    o.data.materials.append(m)
    smooth(o, 0)
    md = o.modifiers.new('cs', 'CORRECTIVE_SMOOTH'); md.factor = 0.6; md.iterations = 6; md.use_only_smooth = True
    if rot: o.rotation_euler = rot
    return o

def fused(name, ells, m, voxel=0.022, smooth_it=12):
    """타원체 여러 개를 한 덩어리로: 한 메시에 넣고 voxel remesh로 녹여 붙인 뒤 매끈하게(이음매가 둥근 필렛이 된다).
    ells: ((x,y,z), (rx,ry,rz)[, (rotx,roty,rotz)])"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    for e in ells:
        c, r = e[0], e[1]; rot = e[2] if len(e) > 2 else (0, 0, 0)
        g = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1.0)
        M = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((r[0], r[1], r[2], 1))
        bmesh.ops.transform(bm, matrix=M, verts=g['verts'])
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(m)
    md = o.modifiers.new('rm', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = voxel; md.use_smooth_shade = True
    md = o.modifiers.new('sm', 'SMOOTH'); md.factor = 0.8; md.iterations = smooth_it
    return o

def top_of(o, x, y=0.0):
    """위에서 아래로 쏜 광선이 닿는 표면 높이"""
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg)
    bvh = BVHTree.FromObject(ev, dg); inv = o.matrix_world.inverted()
    hit, n, i, d = bvh.ray_cast(inv @ Vector((x, y, 9)), Vector((0, 0, -1)))
    return (o.matrix_world @ hit).z if hit else None

def sphere(name, loc, scale, m, rot=(0, 0, 0), seg=48):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.location = loc; o.scale = scale; o.rotation_euler = rot
    o.data.materials.append(m); smooth(o, 1); return o

def tube(name, pts, radii, m, closed=False, res=24, caps=True):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = 8
    cu.resolution_u = res; cu.use_fill_caps = caps
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p, r in zip(sp.bezier_points, pts, radii):
        bp.co = p; bp.radius = r; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sp.use_cyclic_u = closed
    o = link(bpy.data.objects.new(name, cu)); o.data.materials.append(m); return o

def leaf(name, base, angle, length, width, m, tilt=0.35):
    """끝이 뾰족한 잎: 납작한 구를 한쪽으로 좁힌 모양"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        t = (z + 1) / 2  # 0 아래 → 1 끝
        w = math.sin(math.pi * min(1, t ** 0.8)) * (1 - 0.15 * t)
        v.co = Vector((x * width * w, y * width * 0.18 * (0.4 + w), (t) * length))
        v.co.y += (t ** 2) * length * 0.25  # 살짝 앞으로 말림
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(m); smooth(o, 1)
    o.location = base; o.rotation_euler = (tilt * 0.3, angle, 0)
    return o

def sprout(base, scale=1.0, m=None):
    m = m or vinyl(LEAF, 0.5, 0.25)
    s = scale
    objs = [tube('stem', [Vector(base), Vector(base) + Vector((0.01 * s, 0, 0.12 * s)), Vector(base) + Vector((0, 0, 0.2 * s))], [0.022 * s, 0.02 * s, 0.018 * s], m)]
    top = Vector(base) + Vector((0, 0, 0.19 * s))
    objs.append(leaf('leafL', top, -1.05, 0.2 * s, 0.085 * s, m))
    objs.append(leaf('leafR', top, 1.0, 0.24 * s, 0.095 * s, m))
    return objs

# ───────── 얼굴: 몸 표면에 붙인다(카메라 쪽 광선으로 자리 찾기) ─────────
FACE = []
BVH = {}
def surface(body, x, z, y0=-5):
    dg = bpy.context.evaluated_depsgraph_get()
    if body.name not in BVH: BVH[body.name] = BVHTree.FromObject(body.evaluated_get(dg), dg)
    bvh = BVH[body.name]
    mw = body.matrix_world; inv = mw.inverted()
    o = inv @ Vector((x, y0, z)); d = (inv.to_3x3() @ Vector((0, 1, 0))).normalized()
    hit, n, i, dist = bvh.ray_cast(o, d)
    if hit is None: return None, None
    return mw @ hit, (mw.to_3x3() @ n).normalized()

def face(body, cx, cz, size, mood='default', eye_gap=None, layer='full'):
    """작은 점 눈 둘 + 가는 입. mood: default(점 눈 + 작은 미소) · happy(감은 웃는 눈 + 조금 벌린 입) · sleepy"""
    ink = mat('ink', INK, rough=0.22, sss=0.0, spec=0.6)
    gap = eye_gap if eye_gap is not None else size * 0.46
    out = []
    for sgn in (-1, 1):
        x = cx + sgn * gap
        p, n = surface(body, x, cz)
        if p is None: continue
        if mood in ('happy', 'sleepy'):
            # 감은 눈: 표면을 따라 위로 굽은 짧은 호(∩ 모양 — 웃는 눈)
            pts, rr = [], []
            for k in range(5):
                t = (k / 4) * 2 - 1
                px = x + t * size * 0.13
                pz = cz + (1 - t * t) * size * (0.07 if mood == 'happy' else -0.02)
                q, qn = surface(body, px, pz)
                if q is None: continue
                pts.append(q + qn * size * 0.012); rr.append(size * 0.022)
            if len(pts) >= 3: out.append(tube('eye', pts, rr, ink))
        else:
            e = sphere('eye', p - n * size * 0.012, (size * 0.062, size * 0.062, size * 0.085), ink)
            e.rotation_mode = 'QUATERNION'; e.rotation_quaternion = n.to_track_quat('Y', 'Z')
            e.rotation_quaternion = (-n).to_track_quat('-Y', 'Z')
            out.append(e)
    # 입
    mz = cz - size * 0.2
    w = size * (0.15 if mood == 'happy' else 0.11)
    dep = size * (0.075 if mood == 'happy' else 0.045)
    pts, rr = [], []
    for k in range(7):
        t = (k / 6) * 2 - 1
        q, qn = surface(body, cx + t * w, mz - (1 - t * t) * dep)
        if q is None: continue
        pts.append(q + qn * size * 0.008); rr.append(size * 0.017)
    if len(pts) >= 3: out.append(tube('mouth', pts, rr, ink))
    FACE.extend(out)
    return out

# ───────── 씨앗 껍질(아기 단계 · 씨앗 고르기) ─────────
def husk(base_z=0.0, r=0.62, h=0.55, col=HUSK, col2=None, top=False, crack=0, turn=0):
    """씨앗 껍질 아랫단(그릇) 또는 통째 씨앗. 표면에 세로 골 무늬(밝은 색 줄)."""
    m = mat('husk', col, rough=0.6, sss=0.08, sheen=0.2)
    me = bpy.data.meshes.new('husk'); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        # 아래가 둥글고 위가 살짝 뾰족한 씨앗 꼴
        k = 1.0 - 0.18 * max(0, z) ** 2
        ang = math.atan2(y, x)
        rib = 1 + 0.025 * math.cos(ang * 9)
        v.co = Vector((x * r * k * rib, y * r * k * rib, (z * 0.5 + 0.5) * (h * (2.0 if top else 1.0)) + (z ** 3) * 0.04))
    if not top:  # 그릇: 위쪽 반을 자르고 지그재그 깨진 테두리
        cut = h * 0.62
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > cut + 0.06 * math.sin(math.atan2(v.co.y, v.co.x) * 7)], context='VERTS')
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('husk', me)); o.data.materials.append(m)
    o.location.z = base_z
    if not top:
        md = o.modifiers.new('sol', 'SOLIDIFY'); md.thickness = 0.04; md.offset = -1
    smooth(o, 1)
    o.rotation_euler.z = math.radians(turn)
    if col2:  # 줄무늬: 얇은 고리 몇 개
        m2 = mat('huskline', col2, rough=0.55, sss=0.05)
        for i in range(8):
            a = i / 8 * 2 * math.pi + math.radians(turn)
            pts, rr = [], []
            for k in range(9):
                t = k / 8
                zz = 0.08 + t * (h * (1.9 if top else 0.58))
                zn = (zz / (h * (2.0 if top else 1.0))) * 2 - 1
                rad = r * math.sqrt(max(0.0, 1 - zn * zn)) * (1 - 0.18 * max(0, zn) ** 2) * 1.004 + 0.006
                pts.append(Vector((math.cos(a) * rad, math.sin(a) * rad, zz + base_z))); rr.append(0.012)
            tube('line', pts, rr, m2)
    return o

# ───────── 캐릭터 ─────────
# 단계: 1 아기(씨앗에서 막 나옴) · 3 친구 · 5 전설. 2·4는 같은 부품 사이 값(49 §3 표).
def stalks(body, hx, hy, spread, m, tip_m=None, h=0.28, r=0.045):
    """머리 위 더듬이 둘(끝에 작은 공). 머리 표면 높이를 재서 붙인다(떠 보이지 않게)."""
    out = []
    for sgn in (-1, 1):
        x = hx + sgn * spread
        z0 = top_of(body, x, hy) or 1.0
        a = Vector((x, hy, z0 - 0.06)); t = a + Vector((sgn * 0.08, -0.02, h))
        out.append(tube('stalk', [a, (a + t) / 2 + Vector((sgn * 0.01, 0, 0)), t], [r, r * 0.85, r * 0.75], m))
        out.append(sphere('tip', t + Vector((0, 0, r * 0.6)), (r * 1.6,) * 3, tip_m or m))
    return out

def sprout_on(body, x, y, s=0.9):
    z = top_of(body, x, y) or 1.0
    return sprout((x, y, z - 0.04), s)

def snail(st, mood, parts):
    P = PAL['snail']
    body_m = vinyl(P['body'], 0.5, 0.3)
    shell_m = vinyl(P['shell'], 0.42, 0.18)
    if st == 1:
        husk(0, 0.68, 0.62)
        b = fused('body', [((0, 0, 0.66), (0.5, 0.46, 0.5))], body_m)
        parts['body'] += [b]
        shell(0.3, (0.36, 0.22, 0.86), shell_m, turns=1.8)
        parts['body'] += stalks(b, 0, -0.02, 0.17, body_m, h=0.2, r=0.04)
        parts['top'] += sprout_on(b, 0.0, 0.06, 0.8)
        parts['face'] = (b, 0.0, 0.66, 0.9)
        parts['neck'] = (0.0, 0.4, 0.46)
        return
    L = 1.0 if st == 3 else 1.1
    b = fused('body', [((-0.38, 0, 0.86), (0.44, 0.39, 0.44)),          # 머리
                       ((-0.3, 0, 0.45), (0.37, 0.33, 0.42)),           # 목
                       ((0.25, 0, 0.15), (0.98 * L, 0.36, 0.16)),       # 배발
                       ((-0.25, 0, 0.16), (0.5, 0.38, 0.17))], body_m)
    parts['body'] += [b]
    parts['body'] += stalks(b, -0.38, -0.02, 0.17, body_m)
    sh = shell(0.64 if st == 3 else 0.72, (0.36, 0.2, 0.84 if st == 3 else 0.9), shell_m)
    parts['face'] = (b, -0.42, 0.84, 1.0)
    parts['neck'] = (-0.32, 0.5, 0.58)
    parts['top'] += sprout_on(b, -0.38, 0.06, 0.85)
    if st == 5:
        cz = (top_of(sh, 0.36, 0.2) or 1.5) - 0.06
        moss = vinyl('#8DB06C', 0.8, 0.12)
        fused('moss', [((0.36, 0.2, cz - 0.04), (0.42, 0.34, 0.14)), ((0.2, 0.16, cz + 0.02), (0.2, 0.2, 0.14)), ((0.56, 0.2, cz), (0.18, 0.18, 0.12))], moss)
        trunk = vinyl('#9B7457', 0.65, 0.05)
        tube('trunk', [Vector((0.42, 0.2, cz)), Vector((0.44, 0.2, cz + 0.22)), Vector((0.4, 0.2, cz + 0.42))], [0.065, 0.05, 0.04], trunk)
        canopy = vinyl('#7EAD69', 0.6, 0.2)
        fused('canopy', [((0.4, 0.2, cz + 0.66), (0.32, 0.28, 0.27)), ((0.2, 0.2, cz + 0.55), (0.22, 0.2, 0.19)), ((0.62, 0.22, cz + 0.55), (0.22, 0.2, 0.19))], canopy)
        fl = vinyl('#FBF3EA', 0.45, 0.2); fc = vinyl('#F2C35B', 0.4, 0.1)
        for (x, y, z) in ((0.14, 0.04, cz + 0.12), (0.62, 0.08, cz + 0.1), (0.26, 0.0, cz + 0.6)):
            for k in range(5):
                an = k / 5 * 2 * math.pi
                sphere('petal', (x + math.cos(an) * 0.045, y - 0.05, z + math.sin(an) * 0.045), (0.036, 0.02, 0.036), fl, seg=16)
            sphere('fc', (x, y - 0.07, z), (0.026, 0.02, 0.026), fc, seg=16)

def shell(R, c, m, turns=2.4):
    """로그 나선 관을 감은 껍데기(옆에서 보이는 면 = XZ). c = 나선 가운데."""
    b = 0.13
    th_max = turns * 2 * math.pi
    pts, rr = [], []
    N = 40
    for i in range(N + 1):
        th = th_max * i / N
        rad = R * math.exp(-b * th)
        a = th + math.pi * 1.1
        pts.append(Vector((c[0] + math.cos(a) * rad * 0.62, c[1], c[2] + math.sin(a) * rad * 0.62)))
        rr.append(rad * 0.42)
    o = tube('shell', pts, rr, m, res=10)
    o.scale = (1, 1.35, 1); o.location = (0, c[1] - c[1] * 1.35, 0)  # 두께만 늘리고 가운데는 그대로
    sphere('shellc', (c[0], c[1] - 0.02, c[2]), (R * 0.12, R * 0.15, R * 0.12), m, seg=24)
    return o

def lily(R, m):
    """연잎: 얇고 살짝 오목한 원판 — 뒤쪽 갈라진 틈은 빼고 결 두 줄"""
    o = fused('lily', [((0, 0, 0.035), (R, R * 0.8, 0.045))], m, voxel=0.02, smooth_it=4)
    rim = vinyl('#8CBF80', 0.6, 0.1)
    return o

def lotus(c, s):
    pm = vinyl('#F2BFC6', 0.45, 0.35); pm2 = vinyl('#FAE0E0', 0.45, 0.35); cm = vinyl('#EFC25E', 0.45, 0.1)
    for ring, (n, ln, tilt, mm) in enumerate(((7, 1.0, 0.95, pm), (5, 0.78, 0.4, pm2))):
        for k in range(n):
            an = k / n * 2 * math.pi + ring * 0.45
            l = leaf('petal', Vector((0, 0, 0)), 0, s * ln, s * 0.44, mm)
            l.matrix_world = Matrix.Translation(Vector(c)) @ Matrix.Rotation(an, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
    sphere('lotusc', (c[0], c[1], c[2] + 0.04), (s * 0.2, s * 0.2, s * 0.1), cm, seg=24)

def frog(st, mood, parts):
    P = PAL['frog']
    body_m = vinyl(P['body'], 0.48, 0.3)
    belly_m = vinyl(P['belly'], 0.5, 0.3)
    pad_m = vinyl('#7DAF74', 0.62, 0.12)
    if st == 1:
        lily(0.95, pad_m)
        jelly = mat('jelly', '#E3F3F1', rough=0.06, sss=0.0, trans=1.0, ior=1.2, spec=0.5)
        sphere('jelly', (0, 0, 0.62), (0.62, 0.6, 0.56), jelly)
        b = fused('body', [((0, 0, 0.58), (0.36, 0.33, 0.32)), ((0.3, 0.06, 0.5), (0.24, 0.12, 0.1))], body_m)
        parts['body'] += [b]
        parts['top'] += sprout((0, 0, 1.15), 0.75)
        parts['face'] = (b, -0.04, 0.6, 0.7)
        parts['neck'] = (0.0, 0.36, 0.4)
        return
    if st == 3:
        lily(1.05, pad_m)
        b = fused('body', [((0, 0, 0.6), (0.68, 0.56, 0.52)),
                           ((-0.3, -0.06, 1.0), (0.21, 0.2, 0.2)), ((0.3, -0.06, 1.0), (0.21, 0.2, 0.2)),
                           ((0.0, 0.42, 0.3), (0.16, 0.3, 0.1)),
                           ((-0.38, -0.3, 0.14), (0.18, 0.2, 0.09)), ((0.38, -0.3, 0.14), (0.18, 0.2, 0.09))], body_m)
        parts['body'] += [b]
        for sgn in (-1, 1):
            sphere('hand', (sgn * 0.44, -0.38, 0.38), (0.1, 0.1, 0.12), body_m, seg=24)
        sphere('belly', (0, -0.27, 0.46), (0.4, 0.26, 0.29), belly_m)
        parts['top'] += sprout_on(b, 0.0, 0.0, 0.8)
        parts['face'] = (b, 0.0, 0.74, 1.0)
        parts['eye_z'] = 1.0
        parts['neck'] = (0.0, 0.48, 0.6)
        return
    lily(1.3, pad_m)
    b = fused('body', [((0, 0, 0.72), (0.74, 0.6, 0.64)),
                       ((-0.34, -0.08, 1.24), (0.25, 0.23, 0.23)), ((0.34, -0.08, 1.24), (0.25, 0.23, 0.23)),
                       ((-0.62, 0.05, 0.32), (0.3, 0.36, 0.26)), ((0.62, 0.05, 0.32), (0.3, 0.36, 0.26)),
                       ((-0.52, -0.38, 0.1), (0.24, 0.24, 0.09)), ((0.52, -0.38, 0.1), (0.24, 0.24, 0.09))], body_m)
    parts['body'] += [b]
    for sgn in (-1, 1):
        sphere('hand', (sgn * 0.42, -0.5, 0.34), (0.11, 0.11, 0.14), body_m, seg=24)
    sphere('belly', (0, -0.36, 0.56), (0.48, 0.28, 0.4), belly_m)
    z = top_of(b, 0, 0) or 1.3
    lotus((0.0, 0.0, z - 0.03), 0.38)
    # 연잎 양산: 오른손에서 위로
    stick = vinyl('#6E9C62', 0.6, 0.1)
    h0 = Vector((0.44, -0.52, 0.36)); h1 = Vector((0.82, -0.3, 1.9))
    tube('stick', [h0, (h0 + h1) / 2, h1], [0.03, 0.028, 0.026], stick)
    fused('umbrella', [((0.84, -0.3, 1.95), (0.62, 0.62, 0.16), (0.2, -0.3, 0))], vinyl('#86B97A', 0.55, 0.15), smooth_it=6)
    parts['top'] += []
    parts['face'] = (b, 0.0, 0.92, 1.1)
    parts['neck'] = (0.0, 0.56, 0.72)

def bee(st, mood, parts):
    P = PAL['bee']
    body_m = vinyl(P['body'], 0.5, 0.25)
    stripe = vinyl('#6B564E', 0.55, 0.1)
    fluff = vinyl('#FBF4E6', 0.9, 0.2)
    if st == 1:  # 벌집 칸 대신 씨앗 껍질 그릇 — 아기는 모든 종이 씨앗에서 나온다(49 §3)
        husk(0, 0.68, 0.62)
        body_m = banded(P['body'], '#6E5A50', [(0.62, 0.72)])
        b = fused('body', [((0, 0, 0.66), (0.5, 0.46, 0.5))], body_m)
        parts['body'] += [b]
        parts['body'] += stalks(b, 0, -0.04, 0.17, stripe, tip_m=stripe, h=0.18, r=0.026)
        parts['top'] += sprout_on(b, 0, 0.08, 0.75)
        parts['face'] = (b, 0.0, 0.66, 0.9); parts['neck'] = (0.0, 0.4, 0.46)
        return
    body_m = banded(P['body'], '#6E5A50', [(0.24, 0.36), (0.5, 0.62)])
    b = fused('body', [((0, 0, 0.74), (0.66, 0.6, 0.66))], body_m)
    parts['body'] += [b]
    for sgn in (-1, 1): sphere('foot', (sgn * 0.24, -0.1, 0.09), (0.13, 0.15, 0.08), stripe, seg=24)
    wing = mat('wing', '#FBFDFF', rough=0.25, sss=0.1, spec=0.5); wing.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.72
    for sgn in (-1, 1):
        sphere('wing', (sgn * 0.6, 0.34, 1.12), (0.4, 0.035, 0.28), wing, rot=(0, sgn * -0.6, sgn * 0.45))
    parts['body'] += stalks(b, 0, -0.04, 0.2, stripe, tip_m=stripe, h=0.22, r=0.03)
    parts['top'] += sprout_on(b, 0, 0.08, 0.8)
    parts['face'] = (b, 0.0, 0.8, 1.0)
    parts['neck'] = (0.0, 0.62, 0.66)

def worm(st, mood, parts):
    P = PAL['worm']
    body_m = vinyl(P['body'], 0.5, 0.3)
    if st == 1:
        husk(0, 0.68, 0.62)
        b = fused('body', [((0, 0, 0.66), (0.5, 0.46, 0.5))], body_m)
        parts['body'] += [b]
        parts['body'] += stalks(b, 0, -0.02, 0.17, body_m, tip_m=vinyl('#7C8CC8', 0.45, 0.2), h=0.2, r=0.03)
        parts['top'] += sprout_on(b, 0, 0.08, 0.75)
        parts['face'] = (b, 0.0, 0.66, 0.9); parts['neck'] = (0.0, 0.4, 0.46)
        return
    segs = [((-0.28, 0, 0.82), (0.5, 0.46, 0.48))]
    for (x, z, r) in ((0.12, 0.34, 0.33), (0.46, 0.26, 0.28), (0.76, 0.22, 0.24), (1.02, 0.19, 0.2)):
        segs.append(((x, 0.06, z), (r, r * 0.95, r)))
    b = fused('body', segs, body_m)
    parts['body'] += [b]
    parts['body'] += stalks(b, -0.28, -0.02, 0.18, body_m, tip_m=vinyl('#7C8CC8', 0.45, 0.2), h=0.24, r=0.035)
    parts['top'] += sprout_on(b, -0.28, 0.08, 0.8)
    parts['face'] = (b, -0.3, 0.8, 0.95)
    parts['neck'] = (-0.22, 0.42, 0.5)

SPECIES = {'snail': snail, 'frog': frog, 'bee': bee, 'worm': worm}

# ───────── 옷: 목도리(49 §4.3 옷 층 시험) ─────────
def ring_fit(body, cx, z, n=36, pad=0.0):
    """높이 z에서 몸 둘레를 광선으로 잰 고리(바깥 → 축 방향)"""
    dg = bpy.context.evaluated_depsgraph_get()
    if body.name not in BVH: BVH[body.name] = BVHTree.FromObject(body.evaluated_get(dg), dg)
    bvh = BVH[body.name]; pts = []
    for i in range(n):
        a = i / n * 2 * math.pi
        d = Vector((math.cos(a), math.sin(a), 0))
        hit, nn, _, _ = bvh.ray_cast(Vector((cx, 0, z)) + d * 3, -d)
        if hit is None: continue
        pts.append(hit + d * pad)
    return pts

def scarf(body, neck):
    """목도리(옷 칸 '목'): 목 둘레에 맞춘 도톰한 뜨개 고리 + 앞으로 늘어진 끝 하나"""
    x, z, r = neck
    knit = mat('knit', '#D9A94E', rough=0.92, sss=0.06, sheen=0.7)
    T = 0.085
    pts = ring_fit(body, x, z, 40, pad=T * 0.55)
    o = tube('scarf', pts, [T] * len(pts), knit, closed=True)
    # 앞쪽(카메라 쪽, 오른쪽으로 비킨 자리)에서 늘어지는 끝
    front = min(pts, key=lambda p: p.y - 0.35 * (p.x - x))
    tail = tube('scarftail', [front + Vector((0, -0.02, -0.02)), front + Vector((0.05, -0.08, -0.16)), front + Vector((0.07, -0.07, -0.3))], [T * 0.95, T * 0.9, T * 0.85], knit)
    tail.data.bevel_resolution = 6
    return [o, tail]

# ───────── 빛 · 카메라 ─────────
def lights(world='#E9EEF2', strength=0.4, warm=True):
    w = bpy.data.worlds.new('w'); bpy.context.scene.world = w
    if w.node_tree is None: w.use_nodes = True
    bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = lin(world); bg.inputs[1].default_value = strength
    def area(name, loc, size, power, col='#FFFFFF', target=(0, 0, 0.7)):
        L = bpy.data.lights.new(name, 'AREA'); L.size = size; L.energy = power; L.color = lin(col)[:3]
        o = link(bpy.data.objects.new(name, L)); o.location = loc
        d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return o
    area('key', (-3.2, -3.6, 4.6), 4.5, 520, '#FFF6EC' if warm else '#FFFFFF')
    area('fill', (3.6, -2.6, 1.6), 3.5, 110, '#EAF2FF')
    area('rim', (1.6, 3.6, 3.4), 2.5, 380, '#FFFFFF')

def camera(target=(0, 0, 0.8), ortho=3.0, az=14, el=10, w=768, h=768):
    sc = bpy.context.scene
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = ortho
    o = link(bpy.data.objects.new('cam', cam)); sc.camera = o
    a, e = math.radians(az), math.radians(el)
    d = 12
    o.location = Vector(target) + Vector((math.sin(a) * math.cos(e) * d, -math.cos(a) * math.cos(e) * d, math.sin(e) * d))
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    return o

def catcher(R=6):
    me = bpy.data.meshes.new('ground'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=R); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('ground', me)); o.is_shadow_catcher = True; return o

def bbox(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        if o.type not in ('MESH', 'CURVE'): continue
        ev = o.evaluated_get(dg)
        for c in ev.bound_box:
            p = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
    return lo, hi

# 같은 크기 규칙(42 §10.6.1): 모든 종·단계가 같은 상자를 채운다 — 발밑은 그림 아래 10% 자리, 위·옆 여백 6%
def frame_char(objs, w, h):
    lo, hi = bbox(objs)
    H = hi.z - 0.0; W = max(abs(lo.x), abs(hi.x)) * 2
    s = max(H / 0.84, W / 0.88)
    cx = 0.0
    cz = 0.0 - s * 0.10 + s * 0.5   # 바닥이 아래 10%에 오게(정사영: 화면 가운데 높이)
    return camera((cx, 0, cz + 0.0), s, w=w, h=h), s

# ───────── 작업 ─────────
def render(path, samples):
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    bpy.ops.render.render(write_still=True)

def do_char(it, out, size, samples):
    reset(); FACE.clear(); MATS.clear(); BVH.clear()
    sc = bpy.context.scene; sc.render.film_transparent = True; sc.cycles.film_transparent_glass = True; sc.cycles.film_transparent_roughness = 0.2
    parts = {'body': [], 'top': [], 'face': None, 'neck': None}
    before = set(bpy.data.objects)
    SPECIES[it['species']](it['stage'], it.get('mood', 'default'), parts)
    allbody = [o for o in bpy.data.objects if o not in before]
    b, fx, fz, fs = parts['face']
    layer = it.get('layer', 'full')
    faceobjs = face(b, fx, fz, fs * 0.62 if it['stage'] != 1 else fs * 0.55, it.get('mood', 'default'))
    accobjs = scarf(b, parts['neck']) if it.get('acc') == 'scarf' else []
    catcher(); lights()
    # 크기 맞춤은 옷 없이(옷을 입어도 몸 크기가 같게)
    cam, s = frame_char(allbody + faceobjs, size, size)
    if layer == 'body':
        for o in faceobjs: o.hide_render = True
        for o in accobjs: o.hide_render = True
    elif layer in ('face', 'acc'):
        # 몸은 그림자만 받는 투명면 — 자기 그림자는 안 드리워야 층에 몸 유령이 남지 않는다. 바닥 그림자는 몸 층이 맡는다
        hold = allbody + (faceobjs if layer == 'acc' else [])
        for o in hold: o.is_shadow_catcher = True; o.visible_shadow = False
        for o in (accobjs if layer == 'face' else []): o.hide_render = True
        for o in bpy.data.objects:
            if o.name.startswith('ground'): o.hide_render = True
    elif layer == 'full' and not it.get('acc'):
        pass
    render(os.path.join(out, it['name'] + '.png'), samples)
    # 옷 기준점 메타데이터(49 §4.3): 목 자리(화면 비율 좌표)를 함께 적는다
    nx, nz, nr = parts['neck']
    from bpy_extras.object_utils import world_to_camera_view
    p = world_to_camera_view(sc, cam, Vector((nx, -nr * 0.86, nz)))
    top = world_to_camera_view(sc, cam, Vector((nx, 0, max(o.matrix_world.translation.z for o in parts['top']) if parts['top'] else nz)))
    return {'name': it['name'], 'neck': [round(p.x, 4), round(1 - p.y, 4)], 'top': [round(top.x, 4), round(1 - top.y, 4)], 'scale': round(s, 4)}

def do_seed(it, out, size, samples):
    reset(); MATS.clear(); BVH.clear()
    sc = bpy.context.scene; sc.render.film_transparent = True
    col, col2 = SEEDS[it['seed']]
    husk(0, 0.5, 0.62, col=col, col2=col2, top=True, turn=it.get('turn', 0))
    ink = mat('ink', INK, rough=0.3, sss=0)
    crack = it.get('crack', 0)
    hk = [o for o in bpy.data.objects if o.name.startswith('husk')][0]
    for i in range(crack):
        # 금: 꼭대기에서 아래로 내려오는 들쭉날쭉한 한 줄(둘째 금은 옆 가지)
        x0, z0 = [(0.04, 1.2), (0.1, 0.98)][i % 2]; pts = []
        amp = [0.0, 0.035, -0.03, 0.04, -0.02, 0.03, -0.035, 0.02, 0.0]
        for k in range(9):
            x = x0 + amp[k] + (k * 0.018 if i else 0)
            z = z0 - k * (0.05 if i == 0 else 0.03)
            p, n = surface(hk, x, z)
            if p is not None: pts.append(p + n * 0.004)
        if len(pts) > 2:
            for j in range(len(pts) - 1):
                tube('crack', [pts[j], pts[j + 1]], [0.011, 0.011], ink, res=2)
    sprout((0, 0, 1.22), 0.7) if it.get('sprout') else None
    catcher(); lights()
    camera((0, 0, 0.62), 1.75, w=size, h=size)
    render(os.path.join(out, it['name'] + '.png'), samples)
    return {'name': it['name']}

def turf(c1, c2):
    """보송한 잔디 바닥: 두 초록을 섞는 잔 무늬 + 짧은 결 범프(입자 없이 싸게)"""
    m = mat('turf' + c1, c1, rough=0.95, sss=0.05)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['A'].default_value = lin(c1); mix.inputs['B'].default_value = lin(c2)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); nt.links.new(nz.outputs['Fac'], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    vz = nt.nodes.new('ShaderNodeTexNoise'); vz.inputs['Scale'].default_value = 160.0; vz.inputs['Detail'].default_value = 4
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.6; bump.inputs['Distance'].default_value = 0.03
    nt.links.new(tc.outputs['Object'], vz.inputs['Vector']); nt.links.new(vz.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

def grass(R, y0, col, count=26000, length=0.16, seed=3):
    """앞쪽 풀밭: 둥근 패치 위 털(hair) 입자 — 보송한 잔디 결"""
    me = bpy.data.meshes.new('lawn'); bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=R)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('lawn', me)); o.location = (0, y0, 0.002); o.scale = (1.4, 0.75, 1)
    gm = mat('grass', col, rough=0.8, sss=0.15)
    o.data.materials.append(gm)
    ps = o.modifiers.new('hair', 'PARTICLE_SYSTEM').particle_system
    st = ps.settings; st.type = 'HAIR'; st.count = count; st.hair_length = length; st.use_advanced_hair = True
    st.root_radius = 0.012; st.tip_radius = 0.0; st.child_type = 'NONE'
    st.factor_random = 0.04; st.normal_factor = 1.0; st.brownian_factor = 0.02
    ps.seed = seed
    return o

def do_scene(it, out, samples):
    """정원 장면(배경판, 49 §3.3): 하늘 + 둥근 언덕 + 덤불 + 앞 풀밭 + 이끼 낀 돌 받침. 캐릭터는 앱에서 받침 위에 얹는다(perch)."""
    reset(); MATS.clear()
    sc = bpy.context.scene; sc.render.film_transparent = False
    t = it.get('time', 'day')
    band = it.get('band', False)  # 할 일 화면 머리 띠: 받침 없이 언덕만
    sky = {'day': ('#86C0E0', '#EEF0E2'), 'dusk': ('#1C2440', '#4B4766'), 'dawn': ('#E9B9A6', '#F8E9D6')}[t]
    w = bpy.data.worlds.new('w'); sc.world = w
    if w.node_tree is None: w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = lin(sky[0]); w.node_tree.nodes['Background'].inputs[1].default_value = 0.8 if t != 'dusk' else 0.35
    skym = bpy.data.materials.new('sky'); skym.use_nodes = True
    nt = skym.node_tree; nt.nodes.clear()
    o_ = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp.color_ramp.elements[0].color = lin(sky[1]); ramp.color_ramp.elements[1].color = lin(sky[0])
    ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[1].position = 0.8
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs[0], o_.inputs[0])
    bpy.ops.mesh.primitive_plane_add(size=1); p = bpy.context.active_object; p.scale = (70, 40, 1); p.rotation_euler = (math.radians(90), 0, 0); p.location = (0, 28, 12); p.data.materials.append(skym)
    p.visible_shadow = False; p.visible_diffuse = False
    pal = {'day': ['#9CC98A', '#7DB873', '#64A563', '#5A9A5A', '#6DAE5F'], 'dusk': ['#33485A', '#2C4150', '#283B47', '#22343E', '#2F4A45'],
           'dawn': ['#B4D49A', '#97C684', '#7FB472', '#73A868', '#86BC6E']}[t]
    hills = [((-11, 23, -7), (15, 8, 10.5), pal[0]), ((12, 21, -8), (16, 8, 11.5), pal[0]), ((-7, 14, -5), (9, 6, 6.6), pal[1]),
             ((8, 13, -5.4), (9.5, 6, 6.9), pal[1]), ((0, 10, -6.2), (10, 6, 7.0), pal[2]), ((-6.5, 6, -3.3), (5, 4, 3.8), pal[2]), ((7, 5.5, -3.5), (5.5, 4, 4.0), pal[2])]
    for loc, s_, c in hills:
        sphere('hill', loc, s_, vinyl(c, 0.85, 0.05), seg=64)
    bpy.ops.mesh.primitive_plane_add(size=90); g = bpy.context.active_object; g.data.materials.append(turf(pal[3], pal[4]))
    import random; random.seed(7)
    bush = [vinyl(pal[1], 0.8, 0.1), vinyl(pal[2], 0.8, 0.1)]
    for i in range(18):
        x = random.uniform(-7.5, 7.5); y = random.uniform(2.0, 7.5); r = random.uniform(0.35, 0.8)
        if abs(x) < 2.2 and y < 4 and not band: continue
        fused('bush', [((x, y, r * 0.35), (r, r * 0.9, r * 0.85)), ((x + r * 0.7, y + 0.1, r * 0.25), (r * 0.7, r * 0.65, r * 0.6)), ((x - r * 0.65, y + 0.05, r * 0.2), (r * 0.62, r * 0.6, r * 0.55))], bush[i % 2], voxel=0.04, smooth_it=6)
    fl = [vinyl('#FBF5EA', 0.5, 0.2), vinyl('#F4C9A8', 0.5, 0.2) if t != 'dusk' else vinyl('#B9B2D6', 0.5, 0.2), vinyl('#F2D27A', 0.5, 0.1) if t != 'dusk' else vinyl('#8FA6C8', 0.5, 0.2)]
    for i in range(46):
        x = random.uniform(-5.5, 5.5); y = random.uniform(-1.8, 4.5)
        if abs(x) < 1.8 and -1.4 < y < 1.6 and not band: continue
        sphere('flower', (x, y, 0.12), (0.075, 0.075, 0.06), fl[i % 3], seg=16)
    # 받침: 둥근 돌 + 위에 이끼 방석(이어 붙임)
    stone = vinyl('#D5CEC2' if t != 'dusk' else '#7E7D8C', 0.72, 0.08)
    if not band:
        fused('stone', [((0, 0, 0.2), (1.45, 1.15, 0.42))], stone, voxel=0.03, smooth_it=6)
        moss = vinyl('#7FB066' if t != 'dusk' else '#4E6E58', 0.95, 0.1)
        fused('moss', [((0, -0.02, 0.56), (1.18, 0.92, 0.1))], moss, voxel=0.025, smooth_it=4)
    if t == 'dusk':
        for i in range(40):
            x = random.uniform(-14, 14); z = random.uniform(7, 20)
            sphere('star', (x, 27, z), (0.05, 0.05, 0.05), mat('star', '#FFF6D8', emis=('#FFF2C8', 8.0)), seg=8)
        sphere('moon', (6, 27, 15), (0.9, 0.9, 0.9), mat('moon', '#FFF4DC', emis=('#FFF1D2', 3.0)))
        for i in range(10):  # 반딧불
            sphere('fly', (random.uniform(-4, 4), random.uniform(-1, 4), random.uniform(0.6, 2.4)), (0.035,) * 3, mat('fly', '#F7F0B0', emis=('#F5EE9A', 12.0)), seg=8)
    lights(world=sky[0], strength=0.35 if t != 'dusk' else 0.2)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2 if t != 'dusk' else 0.5; sun.angle = math.radians(12)
    sun.color = lin('#FFF1DE' if t != 'dusk' else '#AFC0FF')[:3]
    so = link(bpy.data.objects.new('sun', sun)); so.rotation_euler = (math.radians(50), math.radians(-28), math.radians(-20))
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name != 'sun': o.data.energy *= (0.6 if t != 'dusk' else 0.25)
    W, H = it.get('w', 1170), it.get('h', 2000)
    cam = bpy.data.cameras.new('cam'); cam.lens = it.get('lens', 30)
    cam.dof.use_dof = True; cam.dof.focus_distance = 9.6; cam.dof.aperture_fstop = 2.0
    co = link(bpy.data.objects.new('cam', cam)); sc.camera = co
    co.location = (0, -9.4, it.get('cz', 2.6)); co.rotation_euler = (Vector((0, 2.0, it.get('tz', 1.2))) - co.location).to_track_quat('-Z', 'Y').to_euler()
    cam.sensor_fit = 'VERTICAL' if H > W else 'HORIZONTAL'
    sc.render.resolution_x = W; sc.render.resolution_y = H
    sc.cycles.samples = samples
    sc.render.filepath = os.path.join(out, it['name'] + '.png'); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
    bpy.ops.render.render(write_still=True)
    from bpy_extras.object_utils import world_to_camera_view
    p = world_to_camera_view(sc, co, Vector((0, 0, 0.66)))
    q = world_to_camera_view(sc, co, Vector((1.0, 0, 0.66)))
    return {'name': it['name'], 'perch': [round(p.x, 4), round(1 - p.y, 4)], 'unit_px': round((q.x - p.x) * W, 1)}

def main():
    job = json.load(open(ARGS[0]))
    out = job['out']; os.makedirs(out, exist_ok=True)
    meta = []
    for it in job['items']:
        k = it.get('kind', 'char')
        if k == 'char': meta.append(do_char(it, out, job.get('size', 768), job.get('samples', 96)))
        elif k == 'seed': meta.append(do_seed(it, out, it.get('size', job.get('size', 512)), job.get('samples', 64)))
        elif k == 'scene': meta.append(do_scene(it, out, job.get('samples', 64)))
        print('DONE', it.get('name'), flush=True)
    mp = os.path.join(out, job.get('meta', 'meta.json'))
    old = json.load(open(mp)) if os.path.exists(mp) else {}
    for m in meta: old[m['name']] = m
    json.dump(old, open(mp, 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
