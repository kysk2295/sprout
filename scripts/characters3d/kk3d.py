# 49 · 꿈틀 정원 친구들 3D 스프라이트 생성기 (Blender 5.2, 헤드리스) — 생산판
#
#   blender -b --factory-startup -P scripts/characters3d/kk3d.py -- <job.json>
#
# job.json = {"out": "dir", "size": 640, "samples": 64, "items": [...]}  — jobs.py가 만든다.
#   char  : {"kind":"char", "species", "stage":1..5, "branch":"a|b", "seed":0..3, "layer": "...", "name"}
#           layer = body        몸(얼굴·옷·칸 소품 없이)
#                   face:<mood> 얼굴만 — 몸은 그림자만 받는 투명면(shadow catcher)
#                   accfull:<id> 몸 + 기본 얼굴 + 옷을 한 번에(옷 층의 색은 여기서 가져온다 — 몸에서 튕긴 빛까지 받는다)
#                   accmask:<id> 옷만 보이고 몸·얼굴은 구멍(holdout) — 옷이 몸에 가려지는 모양(알파)
#                   propfull / propmask   칸 소품(관·가방·등불 — 같은 칸 옷을 입으면 숨는다)도 옷과 같은 방식
#   seed  : {"kind":"seed", "seed":0..3, "turn":0..359, "crack":0..2, "name"}
#   scene : {"kind":"scene", "time":"day|dawn|dusk|sunset|moon|snow", "w", "h", "band"?, "name"}
#   decor : {"kind":"decor", "id", "name"}
#
# 그림은 전부 이 파일의 절차적 모델(타원체를 녹여 붙인 덩어리 + 곡선 관 + 기본 도형)에서 나온다. 외부 모델·텍스처·남의 그림은 쓰지 않는다(49 §0).
# 화풍(49 §2): 무광 비닐 인형 — 넓고 흐린 왼쪽 위 빛, 속살 빛(subsurface), 접촉 그림자, 작은 점 눈 + 가는 입, 볼 번짐 없음.
# 좌표: 바닥 z=0, 캐릭터는 -Y(카메라) 쪽을 본다. -X = 캐릭터의 오른손 쪽(화면 왼쪽). 정사영 카메라, 위에서 10°, 오른쪽으로 14°.
# 같은 종·단계의 모든 층(몸·얼굴·옷·소품)은 같은 카메라로 굽는다 — 앱은 같은 크기 그림을 겹치기만 한다(49 §4.3).
import bpy, bmesh, json, math, sys, os, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

# ───────── 색 ─────────
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)

INK = '#2B2420'
LEAF = '#5FA35A'
SEEDS = [  # 씨앗 4개(49 §5.2) — 껍질 색 · 결 줄 색. 종은 정하지 않는다(결정 ③)
    ('#C99063', '#E7C49B'), ('#B9876E', '#E9C7B8'), ('#A9A26F', '#DCD6A6'), ('#8E9AB4', '#CDD4E3')]

# ───────── 장면 기본 ─────────
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'  # Metal은 재질 조합마다 커널을 새로 컴파일해 작은 스프라이트는 CPU가 빠르다
    sc.render.threads_mode = 'AUTO'
    sc.cycles.use_denoising = True
    sc.cycles.seed = 7
    sc.view_settings.view_transform = os.environ.get('KK_VIEW', 'Standard')  # AgX는 파스텔을 회색으로 뺀다
    sc.view_settings.exposure = float(os.environ.get('KK_EXPOSURE', '-0.35'))
    return sc

MATS = {}
def mat(name, hexc, rough=0.5, sss=0.18, sss_r=(1.0, 0.6, 0.45), coat=0.0, sheen=0.0, trans=0.0, ior=1.45, spec=0.35, emis=None, alpha=1.0):
    key = (name, hexc, rough, sss, coat, sheen, trans, alpha, emis)
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    nt = m.node_tree
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
    p.inputs['Alpha'].default_value = alpha
    if emis:
        p.inputs['Emission Color'].default_value = lin(emis[0]); p.inputs['Emission Strength'].default_value = emis[1]
    MATS[key] = m
    return m

def vinyl(hexc, rough=0.52, sss=0.22):
    return mat('vinyl', hexc, rough=rough, sss=sss, sheen=0.25)

def knit(hexc):
    """뜨개·천: 거칠고 보송(sheen)한 재질 + 잔 결 범프"""
    m = mat('knit', hexc, rough=0.9, sss=0.06, sheen=0.7)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    if not any(n.type == 'BUMP' for n in nt.nodes):
        tc = nt.nodes.new('ShaderNodeTexCoord'); w = nt.nodes.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 26; w.inputs['Distortion'].default_value = 2
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.01
        nt.links.new(tc.outputs['Object'], w.inputs['Vector']); nt.links.new(w.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

def banded(c1, c2, bands, rough=0.5, sss=0.22):
    """높이(물체 좌표 z)에 따라 띠 색이 바뀌는 비닐 재질 — 꿀벌 줄무늬"""
    m = mat('band' + c1 + c2 + str(bands), c1, rough=rough, sss=sss, sheen=0.25)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    if any(n.type == 'VALTORGB' for n in nt.nodes): return m
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    els = ramp.color_ramp.elements; els[0].position = 0; els[0].color = lin(c1); els[1].position = 1; els[1].color = lin(c1)
    for lo, hi in bands:
        for pos, c in ((lo - 0.012, c1), (lo + 0.012, c2), (hi - 0.012, c2), (hi + 0.012, c1)):
            e = els.new(pos); e.color = lin(c)
    nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    return m

def glassm(hexc='#EAF6FF', rough=0.12, alpha=0.75, trans=0.7):
    return mat('glass', hexc, rough=rough, sss=0.0, spec=0.5, trans=trans, ior=1.25, alpha=alpha)

def link(o, coll=None):
    (coll or bpy.context.scene.collection).objects.link(o); return o

def smooth(o, subdiv=1):
    for p in o.data.polygons: p.use_smooth = True
    if subdiv:
        md = o.modifiers.new('sub', 'SUBSURF'); md.levels = subdiv; md.render_levels = subdiv
    return o

def fused(name, ells, m, voxel=0.022, smooth_it=12):
    """타원체 여러 개를 한 덩어리로: 한 메시에 넣고 voxel remesh로 녹여 붙인 뒤 매끈하게.
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

def bvh_of(o):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg)
    return BVHTree.FromObject(ev, dg)

def top_of(o, x, y=0.0):
    """위에서 아래로 쏜 광선이 닿는 표면 높이"""
    bvh = bvh_of(o); inv = o.matrix_world.inverted()
    hit, n, i, d = bvh.ray_cast(inv @ Vector((x, y, 9)), (inv.to_3x3() @ Vector((0, 0, -1))).normalized())
    return (o.matrix_world @ hit).z if hit else None

def hit_from(o, origin, direction):
    bvh = bvh_of(o); mw = o.matrix_world; inv = mw.inverted()
    hit, n, i, d = bvh.ray_cast(inv @ Vector(origin), (inv.to_3x3() @ Vector(direction)).normalized())
    if hit is None: return None, None
    return mw @ hit, (mw.to_3x3() @ n).normalized()

def sphere(name, loc, scale, m, rot=(0, 0, 0), seg=48):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.location = loc; o.scale = scale; o.rotation_euler = rot
    o.data.materials.append(m); smooth(o, 1); return o

def tube(name, pts, radii, m, closed=False, res=24, caps=True, bres=8):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = bres
    cu.resolution_u = res; cu.use_fill_caps = caps
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p, r in zip(sp.bezier_points, pts, radii):
        bp.co = p; bp.radius = r; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sp.use_cyclic_u = closed
    o = link(bpy.data.objects.new(name, cu)); o.data.materials.append(m); return o

def cyl(name, loc, r, h, m, seg=48, rot=(0, 0, 0), bevel=0.3):
    """둥근 모서리 원기둥(머그·통)"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=h)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.location = loc; o.rotation_euler = rot; o.data.materials.append(m)
    md = o.modifiers.new('bv', 'BEVEL'); md.width = min(r, h) * bevel; md.segments = 4
    smooth(o, 1)
    return o

def leaf(name, base, angle, length, width, m, tilt=0.35, curl=0.25, thick=0.18):
    """끝이 뾰족한 잎: 납작한 구를 한쪽으로 좁힌 모양"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        t = (z + 1) / 2
        w = math.sin(math.pi * min(1, t ** 0.8)) * (1 - 0.15 * t)
        v.co = Vector((x * width * w, y * width * thick * (0.4 + w), t * length))
        v.co.y += (t ** 2) * length * curl
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(m); smooth(o, 1)
    o.location = base; o.rotation_euler = (tilt * 0.3, angle, 0)
    return o

def place(o, M):
    o.matrix_world = M @ o.matrix_world
    return o

def sprout(base, scale=1.0, m=None):
    m = m or vinyl(LEAF, 0.5, 0.25)
    s = scale
    objs = [tube('stem', [Vector(base), Vector(base) + Vector((0.01 * s, 0, 0.12 * s)), Vector(base) + Vector((0, 0, 0.2 * s))], [0.022 * s, 0.02 * s, 0.018 * s], m)]
    top = Vector(base) + Vector((0, 0, 0.19 * s))
    objs.append(leaf('leafL', top, -1.05, 0.2 * s, 0.085 * s, m))
    objs.append(leaf('leafR', top, 1.0, 0.24 * s, 0.095 * s, m))
    return objs

def flower(c, r, petal, center, n=5, face=(0, -1, 0.35)):
    """작은 다섯 잎 꽃(바깥을 보는 방향 face)"""
    pm = vinyl(petal, 0.45, 0.25); cm = vinyl(center, 0.4, 0.1)
    fz = Vector(face).normalized(); ax = fz.cross(Vector((0, 0, 1)))
    if ax.length < 1e-3: ax = Vector((1, 0, 0))
    ax.normalize(); ay = fz.cross(ax).normalized()
    out = []
    for k in range(n):
        a = k / n * 2 * math.pi
        p = Vector(c) + (ax * math.cos(a) + ay * math.sin(a)) * r * 0.62
        o = sphere('petal', p, (r * 0.5, r * 0.5, r * 0.22), pm, seg=16)
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = fz.to_track_quat('Z', 'Y')
        out.append(o)
    out.append(sphere('fc', Vector(c) + fz * r * 0.12, (r * 0.34,) * 3, cm, seg=16))
    return out

# ───────── 얼굴 ─────────
BVH = {}
def surface(body, x, z, y0=-5):
    if body.name not in BVH: BVH[body.name] = bvh_of(body)
    bvh = BVH[body.name]
    mw = body.matrix_world; inv = mw.inverted()
    o = inv @ Vector((x, y0, z)); d = (inv.to_3x3() @ Vector((0, 1, 0))).normalized()
    hit, n, i, dist = bvh.ray_cast(o, d)
    if hit is None: return None, None
    return mw @ hit, (mw.to_3x3() @ n).normalized()

MOODS = ['default', 'happy', 'sleepy', 'wow', 'think']  # 49 결정 ④: 기본·웃음·졸림·놀람·생각

def face(body, cx, cz, size, mood='default'):
    """작은 유광 점 눈 둘 + 가는 입. 표정은 눈·입 모양만 바꾼다(49 §2)."""
    ink = mat('ink', INK, rough=0.22, sss=0.0, spec=0.6)
    gap = size * 0.46
    out = []
    def arc(x, z, half, lift, r):
        pts, rr = [], []
        for k in range(5):
            t = (k / 4) * 2 - 1
            q, qn = surface(body, x + t * half, z + (1 - t * t) * lift)
            if q is None: continue
            pts.append(q + qn * size * 0.012); rr.append(r)
        if len(pts) >= 3: out.append(tube('eye', pts, rr, ink))
    look = (-0.05 * size, 0.07 * size) if mood == 'think' else (0, 0)
    for sgn in (-1, 1):
        x = cx + sgn * gap
        if mood == 'happy':
            arc(x, cz - size * 0.02, size * 0.13, size * 0.075, size * 0.022)
        elif mood == 'sleepy':
            arc(x, cz - size * 0.03, size * 0.12, -size * 0.035, size * 0.019)
        else:
            k = 1.28 if mood == 'wow' else 1.0
            p, n = surface(body, x + look[0], cz + look[1] + (size * 0.01 if mood == 'wow' else 0))
            if p is None: continue
            e = sphere('eye', p - n * size * 0.012, (size * 0.062 * k, size * 0.062 * k, size * 0.085 * k), ink)
            e.rotation_mode = 'QUATERNION'; e.rotation_quaternion = (-n).to_track_quat('-Y', 'Z')
            out.append(e)
    mz = cz - size * 0.2
    if mood == 'wow':  # 작은 동그란 입
        p, n = surface(body, cx, mz - size * 0.03)
        if p is not None:
            e = sphere('mouth', p - n * size * 0.01, (size * 0.05, size * 0.05, size * 0.062), ink)
            e.rotation_mode = 'QUATERNION'; e.rotation_quaternion = (-n).to_track_quat('-Y', 'Z')
            out.append(e)
    else:
        if mood == 'think':  # 한쪽으로 비낀 짧은 선
            w, dep, off, tilt = size * 0.075, size * 0.0, size * 0.05, size * 0.025
        elif mood == 'sleepy':
            w, dep, off, tilt = size * 0.06, size * 0.02, 0, 0
        elif mood == 'happy':
            w, dep, off, tilt = size * 0.15, size * 0.075, 0, 0
        else:
            w, dep, off, tilt = size * 0.11, size * 0.045, 0, 0
        pts, rr = [], []
        for k in range(7):
            t = (k / 6) * 2 - 1
            q, qn = surface(body, cx + off + t * w, mz - (1 - t * t) * dep + t * tilt)
            if q is None: continue
            pts.append(q + qn * size * 0.008); rr.append(size * 0.017)
        if len(pts) >= 3: out.append(tube('mouth', pts, rr, ink))
    return out

# ───────── 씨앗 껍질 ─────────
def husk(base_z=0.0, r=0.62, h=0.55, col='#C99063', col2=None, top=False, turn=0):
    """씨앗 껍질 아랫단(그릇) 또는 통째 씨앗. 표면에 세로 골 + 결 줄."""
    m = mat('husk', col, rough=0.6, sss=0.08, sheen=0.2)
    me = bpy.data.meshes.new('husk'); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        k = 1.0 - 0.18 * max(0, z) ** 2
        ang = math.atan2(y, x)
        rib = 1 + 0.025 * math.cos(ang * 9)
        v.co = Vector((x * r * k * rib, y * r * k * rib, (z * 0.5 + 0.5) * (h * (2.0 if top else 1.0)) + (z ** 3) * 0.04))
    if not top:
        cut = h * 0.62
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > cut + 0.06 * math.sin(math.atan2(v.co.y, v.co.x) * 7)], context='VERTS')
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new('husk', me)); o.data.materials.append(m)
    o.location.z = base_z
    if not top:
        md = o.modifiers.new('sol', 'SOLIDIFY'); md.thickness = 0.04; md.offset = -1
    smooth(o, 1)
    o.rotation_euler.z = math.radians(turn)
    lines = []
    if col2:
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
            lines.append(tube('line', pts, rr, m2))
    return o, lines

def crack_cut(target, paths, depth=0.08):
    """진짜 깨진 틈: 표면을 따라가는 얇은 칼날 메시로 껍질을 파낸다(Boolean, 틈마다 따로 — 겹친 칼날은 EXACT가 놓친다).
    틈 안쪽 면은 칼날의 짙은 재질을 받는다(material_mode TRANSFER) → 실제로 갈라져 속이 그늘진 모양."""
    dark = mat('crackin', '#3B2A1F', rough=0.8, sss=0.0)
    for j, (pts, ws) in enumerate(paths):
        me = bpy.data.meshes.new('blade'); bm = bmesh.new()
        prev = None
        for i, (p, n) in enumerate(pts):
            if i + 1 < len(pts): t = (pts[i + 1][0] - p).normalized()
            side = n.cross(t).normalized() * ws[i]
            ring = [bm.verts.new(p + side + n * 0.05), bm.verts.new(p - side + n * 0.05), bm.verts.new(p - side * 0.3 - n * depth), bm.verts.new(p + side * 0.3 - n * depth)]
            if prev:
                for k in range(4): bm.faces.new((prev[k], prev[(k + 1) % 4], ring[(k + 1) % 4], ring[k]))
            else: bm.faces.new(ring)
            prev = ring
        bm.faces.new(list(reversed(prev)))
        bm.normal_update()
        bm.to_mesh(me); bm.free()
        blade = link(bpy.data.objects.new('blade', me)); blade.data.materials.append(dark)
        md = target.modifiers.new(f'crack{j}', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = blade; md.solver = 'EXACT'
        try: md.material_mode = 'TRANSFER'
        except Exception: pass
        blade.hide_render = True

# ───────── 캐릭터 공용 부품 ─────────
def stalks(body, hx, hy, spread, m, tip_m=None, h=0.28, r=0.045):
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

def shell(R, c, m, turns=2.4):
    """로그 나선 관을 감은 껍데기(옆에서 보이는 면 = XZ)."""
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
    o.scale = (1, 1.35, 1); o.location = (0, c[1] - c[1] * 1.35, 0)
    cap = sphere('shellc', (c[0], c[1] - 0.02, c[2]), (R * 0.12, R * 0.15, R * 0.12), m, seg=24)
    return [o, cap]

def lily(R, m, notch=True):
    """연잎: 얇고 살짝 오목한 원판 + 결 줄 + 갈라진 틈"""
    ells = [((0, 0, 0.035), (R, R * 0.8, 0.045))]
    o = fused('lily', ells, m, voxel=0.02, smooth_it=4)
    vm = vinyl('#8FC484', 0.6, 0.1)
    out = [o]
    for k in range(7):
        a = -math.pi / 2 + (k - 3) * 0.42
        p0 = Vector((0, 0, 0.083)); p1 = Vector((math.cos(a) * R * 0.86, math.sin(a) * R * 0.8 * 0.86, 0.075))
        out.append(tube('vein', [p0, (p0 + p1) / 2 + Vector((0, 0, 0.004)), p1], [0.008, 0.007, 0.004], vm, res=6, bres=3))
    return out

def husk_seed_col(seed):
    return SEEDS[seed % 4]

# 칸 소품(같은 칸 옷을 입으면 숨는다 — 43 §5.1 겹침 규칙)을 담는 그릇
class Parts:
    def __init__(self):
        self.body = []          # 늘 보이는 몸 + 단계·갈래 소품
        self.props = []         # (objs, slot)
        self.face = None        # (body_obj, x, z, size)
        self.head = None        # (x, y, z, r)
        self.neck = None        # (x, z, r) — 없으면 목 옷 없음
        self.hand = None        # 왼손(화면 왼쪽) 자리 (x, y, z)
        self.back = None        # 등 자리 (x, y, z)
        self.main = None        # 몸 덩어리(옷 맞춤 광선용)
        self.top = []           # 새싹(머리 꼭대기 메타)
        self.back_off = (0.2, 0.18, -0.02)  # 배낭 가운데를 등 자리에서 얼마나 비킬지(카메라 쪽 = +x)
        self.hat_on = None      # 모자를 얹을 겉면(없으면 main) — 개구리 아기는 물방울 알 위

# ───────── 달팽이 ─────────
def snail(st, br, seed, P):
    body_m = vinyl('#E6CDB0', 0.5, 0.3)
    shell_m = vinyl('#D27F62' if br != 'b' or st < 3 else '#E19AAB', 0.42, 0.18)
    if st == 1:
        col, col2 = husk_seed_col(seed)
        h, _ = husk(0, 0.68, 0.62, col=col)
        b = fused('body', [((0, 0, 0.66), (0.5, 0.46, 0.5))], body_m)
        P.body += [h, b] + shell(0.3, (0.36, 0.22, 0.86), shell_m, turns=1.8)
        P.body += stalks(b, 0, -0.02, 0.17, body_m, h=0.2, r=0.04)
        P.top = sprout_on(b, 0.0, 0.06, 0.8); P.body += P.top
        P.face = (b, 0.0, 0.66, 0.9 * 0.55); P.head = (0, 0, 0.66, 0.5); P.main = b
        P.hand = (-0.5, -0.32, 0.5)
        return
    L = {2: 0.8, 3: 1.0, 4: 1.06, 5: 1.1}[st]
    hr = {2: 0.42, 3: 0.44, 4: 0.44, 5: 0.44}[st]
    b = fused('body', [((-0.38, 0, 0.42 + hr), (hr, hr * 0.89, hr)),
                       ((-0.3, 0, 0.45), (0.37, 0.33, 0.42)),
                       ((0.25 * L, 0, 0.15), (0.98 * L, 0.36, 0.16)),
                       ((-0.25, 0, 0.16), (0.5, 0.38, 0.17))], body_m)
    P.body += [b]; P.main = b
    P.body += stalks(b, -0.38, -0.02, 0.17, body_m)
    R = {2: 0.5, 3: 0.64, 4: 0.7, 5: 0.72}[st]
    sc = (0.36, 0.2, {2: 0.72, 3: 0.84, 4: 0.88, 5: 0.9}[st])
    sh = shell(R, sc, shell_m); P.body += sh
    P.face = (b, -0.42, 0.42 + hr * 0.95, 0.62 * hr / 0.44)
    P.head = (-0.38, 0, 0.42 + hr, hr)
    P.neck = (-0.32, 0.5, 0.58)
    P.hand = (-0.72, -0.3, 0.42)
    P.back = (-0.62, 0.2, 0.66)  # 머리 뒤 왼쪽 — 껍데기에 가리지 않는 자리
    P.back_off = (-0.26, 0.12, -0.04)  # 오른쪽은 껍데기 — 머리 왼쪽으로 내민다
    P.top = sprout_on(b, -0.38, 0.06, 0.85); P.body += P.top
    shz = lambda x, y=0.2: (top_of(sh[0], x, y) or sc[2] + R * 0.6)
    if st == 3:
        pet, cen = ('#FBF5EA', '#F2C35B') if br != 'b' else ('#F7B6C6', '#FFF1A8')
        for (x, y) in ((0.2, 0.05), (0.5, 0.12)):
            z = shz(x, y)
            P.body += flower((x, y - 0.02, z - 0.01), 0.085, pet, cen, face=(-0.1, -0.5, 1))
        P.body += [sphere('leafbud', (0.36, 0.1, shz(0.36, 0.1) - 0.01), (0.07, 0.05, 0.035), vinyl(LEAF, 0.5, 0.2), seg=24)]
    elif st == 4:
        cz = shz(0.36) - 0.06
        if br != 'b':
            moss = vinyl('#8DB06C', 0.85, 0.12)
            P.body += [fused('moss', [((0.36, 0.2, cz - 0.02), (0.44, 0.34, 0.13)), ((0.18, 0.16, cz + 0.02), (0.2, 0.2, 0.12))], moss)]
            for (x, y) in ((0.18, 0.02), (0.56, 0.06)):
                P.body += flower((x, y, shz(x, y) + 0.04), 0.06, '#FBF5EA', '#F2C35B', face=(0, -0.4, 1))
            frame = vinyl('#9B7457', 0.6, 0.05)
        else:
            bush = vinyl('#F2A7BB', 0.6, 0.2)
            P.body += [fused('bloom', [((0.36, 0.2, cz), (0.4, 0.32, 0.14)), ((0.2, 0.14, cz + 0.05), (0.18, 0.18, 0.13)), ((0.55, 0.16, cz + 0.03), (0.17, 0.17, 0.12))], bush)]
            for (x, y) in ((0.2, 0.0), (0.42, -0.02), (0.6, 0.06)):
                P.body += flower((x, y, shz(x, y) + 0.05), 0.065, '#FFFFFF', '#F2C35B', face=(0, -0.5, 1))
            frame = vinyl('#E07A93', 0.5, 0.05)
        # 둥근 창문(껍데기 옆면)
        p, n = surface(sh[0], sc[0] + 0.08, sc[2] - 0.12)
        if p is not None:
            win = sphere('win', p + n * 0.005, (0.1, 0.1, 0.03), mat('pane', '#3E5470', rough=0.15, sss=0, spec=0.6))
            win.rotation_mode = 'QUATERNION'; win.rotation_quaternion = n.to_track_quat('Z', 'Y')
            ring = [p + n * 0.02 + (n.cross(Vector((0, 0, 1))).normalized() * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)) * 0.1 for a in [i / 16 * 2 * math.pi for i in range(16)]]
            P.body += [win, tube('frame', ring, [0.022] * 16, frame, closed=True)]
    elif st == 5:
        cz = shz(0.36) - 0.06
        if br != 'b':
            moss = vinyl('#8DB06C', 0.8, 0.12)
            P.body += [fused('moss', [((0.36, 0.2, cz - 0.04), (0.42, 0.34, 0.14)), ((0.2, 0.16, cz + 0.02), (0.2, 0.2, 0.14)), ((0.56, 0.2, cz), (0.18, 0.18, 0.12))], moss)]
            trunk = vinyl('#9B7457', 0.65, 0.05)
            P.body += [tube('trunk', [Vector((0.42, 0.2, cz)), Vector((0.44, 0.2, cz + 0.22)), Vector((0.4, 0.2, cz + 0.42))], [0.065, 0.05, 0.04], trunk)]
            canopy = vinyl('#7EAD69', 0.6, 0.2)
            P.body += [fused('canopy', [((0.4, 0.2, cz + 0.66), (0.32, 0.28, 0.27)), ((0.2, 0.2, cz + 0.55), (0.22, 0.2, 0.19)), ((0.62, 0.22, cz + 0.55), (0.22, 0.2, 0.19))], canopy)]
            for (x, y, z) in ((0.14, 0.04, cz + 0.12), (0.62, 0.08, cz + 0.1), (0.26, 0.0, cz + 0.6)):
                P.body += flower((x, y - 0.05, z), 0.07, '#FBF3EA', '#F2C35B')
        else:
            moss = vinyl('#9CBF7C', 0.85, 0.12)
            P.body += [fused('bed', [((0.38, 0.2, cz - 0.03), (0.4, 0.32, 0.12))], moss)]
            for (x, y, z, c) in ((0.26, 0.14, cz + 0.12, '#F7B6C6'), (0.48, 0.24, cz + 0.16, '#FBF5EA'), (0.38, 0.06, cz + 0.08, '#E98AA2')):
                P.body += [tube('fstem', [Vector((x, y, cz)), Vector((x, y, z))], [0.012, 0.01], vinyl(LEAF, 0.5, 0.2))]
                P.body += flower((x, y - 0.02, z + 0.02), 0.065, c, '#FFE48A', face=(0, -1, 0.6))
            dome = sphere('dome', (0.38, 0.2, cz - 0.02), (0.44, 0.36, 0.5), glassm('#EAF7FF', 0.05, 0.55, 0.85), seg=48)
            ring = [Vector((0.38 + math.cos(a) * 0.45, 0.2 + math.sin(a) * 0.37, cz)) for a in [i / 24 * 2 * math.pi for i in range(24)]]
            P.body += [dome, tube('domering', ring, [0.026] * 24, vinyl('#E07A93', 0.45, 0.05), closed=True)]
            P.body += [sphere('knob', (0.38, 0.2, cz + 0.5), (0.04,) * 3, vinyl('#E07A93', 0.45, 0.05), seg=16)]

# ───────── 개구리 ─────────
def frog(st, br, seed, P):
    body_m = vinyl('#78B68D', 0.48, 0.3)
    belly_m = vinyl('#DCE8C8', 0.5, 0.3)
    pad_m = vinyl('#7DAF74' if br != 'b' or st < 3 else '#86B07A', 0.62, 0.12)
    if st == 1:
        P.body += lily(0.95, pad_m)
        jelly = mat('jelly', '#E3F3F1', rough=0.06, sss=0.0, trans=1.0, ior=1.2, spec=0.5)
        jo = sphere('jelly', (0, 0, 0.62), (0.62, 0.6, 0.56), jelly); P.body += [jo]; P.hat_on = jo
        b = fused('body', [((0, 0, 0.58), (0.36, 0.33, 0.32)), ((0.3, 0.06, 0.5), (0.24, 0.12, 0.1))], body_m)
        P.body += [b]; P.main = b
        P.top = sprout((0, 0, 1.15), 0.75); P.body += P.top
        P.face = (b, -0.04, 0.6, 0.7 * 0.55); P.head = (0, 0, 0.62, 0.6); P.hand = (-0.62, -0.3, 0.42)
        return
    if st == 2:
        P.body += lily(1.0, pad_m)
        b = fused('body', [((0, 0, 0.5), (0.46, 0.42, 0.42)), ((0.38, 0.1, 0.36), (0.34, 0.12, 0.13)), ((0.72, 0.16, 0.42), (0.22, 0.06, 0.16), (0, 0.5, 0.3))], body_m)
        P.body += [b, sphere('belly', (0, -0.22, 0.38), (0.3, 0.2, 0.2), belly_m)]; P.main = b
        P.top = sprout_on(b, 0.0, 0.0, 0.8); P.body += P.top
        P.face = (b, -0.02, 0.56, 0.62 * 0.95); P.head = (0, 0, 0.5, 0.46); P.neck = None
        P.hand = (-0.5, -0.3, 0.32); P.back = (0, 0.3, 0.5)
        return
    if st in (3, 4):
        P.body += lily(1.05, pad_m)
        leg = 0.18 if st == 3 else 0.26
        ells = [((0, 0, 0.6), (0.68, 0.56, 0.52)),
                ((-0.3, -0.06, 1.0), (0.21, 0.2, 0.2)), ((0.3, -0.06, 1.0), (0.21, 0.2, 0.2)),
                ((-0.38, -0.3, 0.14), (leg, 0.2, 0.09)), ((0.38, -0.3, 0.14), (leg, 0.2, 0.09))]
        if st == 3: ells.append(((0.0, 0.42, 0.3), (0.16, 0.3, 0.1)))
        else: ells += [((-0.58, 0.05, 0.28), (0.26, 0.32, 0.22)), ((0.58, 0.05, 0.28), (0.26, 0.32, 0.22))]
        b = fused('body', ells, body_m)
        P.body += [b]; P.main = b
        for sgn in (-1, 1):
            P.body += [sphere('hand', (sgn * 0.44, -0.38, 0.38), (0.1, 0.1, 0.12), body_m, seg=24)]
        P.body += [sphere('belly', (0, -0.27, 0.46), (0.4, 0.26, 0.29), belly_m)]
        P.top = sprout_on(b, 0.0, 0.0, 0.8); P.body += P.top
        P.face = (b, 0.0, 0.74, 0.62); P.head = (0, 0, 0.74, 0.62)
        P.neck = (0.0, 0.5, 0.6); P.hand = (-0.44, -0.4, 0.38); P.back = (0, 0.45, 0.66)
        if st == 3:
            if br != 'b':
                for (x, y, s) in ((-0.72, -0.25, 0.11), (0.74, -0.1, 0.08)):
                    P.body += [sphere('drop', (x, y, 0.08 + s * 0.7), (s, s, s * 0.9), glassm('#D7F1FF', 0.03, 0.6, 0.9))]
            else:
                for (x, y) in ((-0.74, -0.22), (0.76, -0.08)):
                    P.body += berry((x, y, 0.15), 0.09)
        else:
            if br != 'b':
                P.body += [tube('budstem', [Vector((0.78, 0.0, 0.06)), Vector((0.8, 0.0, 0.3)), Vector((0.76, 0.0, 0.5))], [0.025, 0.022, 0.02], vinyl('#6E9C62', 0.6, 0.1))]
                P.body += [sphere('bud', (0.76, 0.0, 0.6), (0.11, 0.11, 0.16), vinyl('#F2BFC6', 0.45, 0.35))]
            else:
                P.body += berry((0.76, -0.04, 0.15), 0.1) + berry((0.86, 0.12, 0.13), 0.08)
                P.body += [leaf('bl', Vector((0.8, 0.06, 0.06)), 0.9, 0.22, 0.1, vinyl(LEAF, 0.5, 0.2))]
        return
    # 5 전설
    P.body += lily(1.3, pad_m)
    b = fused('body', [((0, 0, 0.72), (0.74, 0.6, 0.64)),
                       ((-0.34, -0.08, 1.24), (0.25, 0.23, 0.23)), ((0.34, -0.08, 1.24), (0.25, 0.23, 0.23)),
                       ((-0.62, 0.05, 0.32), (0.3, 0.36, 0.26)), ((0.62, 0.05, 0.32), (0.3, 0.36, 0.26)),
                       ((-0.52, -0.38, 0.1), (0.24, 0.24, 0.09)), ((0.52, -0.38, 0.1), (0.24, 0.24, 0.09))], body_m)
    P.body += [b]; P.main = b
    for sgn in (-1, 1):
        P.body += [sphere('hand', (sgn * 0.42, -0.5, 0.34), (0.11, 0.11, 0.14), body_m, seg=24)]
    P.body += [sphere('belly', (0, -0.36, 0.56), (0.48, 0.28, 0.4), belly_m)]
    P.top = sprout_on(b, 0.0, 0.08, 0.85); P.body += P.top
    z = top_of(b, 0, -0.1) or 1.3
    crown = lotus((0.0, -0.06, z - 0.05), 0.34) if br != 'b' else berry_crown((0.0, -0.06, z - 0.03), 0.36)
    P.props.append((crown, 'hat'))
    # 양산: 오른손(화면 오른쪽)에서 위로 — 손 칸 옷은 왼손에 들어서 겹치지 않는다
    stick = vinyl('#6E9C62', 0.6, 0.1)
    h0 = Vector((0.44, -0.52, 0.36)); h1 = Vector((0.82, -0.3, 1.9))
    P.body += [tube('stick', [h0, (h0 + h1) / 2, h1], [0.03, 0.028, 0.026], stick)]
    umc = '#86B97A' if br != 'b' else '#F2A3B9'
    P.body += [fused('umbrella', [((0.84, -0.3, 1.95), (0.62, 0.62, 0.16), (0.2, -0.3, 0))], vinyl(umc, 0.55, 0.15), smooth_it=6)]
    P.face = (b, 0.0, 0.92, 0.68); P.head = (0, 0, 0.98, 0.7)
    P.neck = (0.0, 0.6, 0.72); P.hand = (-0.42, -0.52, 0.34); P.back = (0, 0.5, 0.8)

def lotus(c, s):
    pm = vinyl('#F2BFC6', 0.45, 0.35); pm2 = vinyl('#FAE0E0', 0.45, 0.35); cm = vinyl('#EFC25E', 0.45, 0.1)
    out = []
    for ring, (n, ln, tilt, mm) in enumerate(((7, 1.0, 0.95, pm), (5, 0.78, 0.4, pm2))):
        for k in range(n):
            an = k / n * 2 * math.pi + ring * 0.45
            l = leaf('petal', Vector((0, 0, 0)), 0, s * ln, s * 0.44, mm)
            l.matrix_world = Matrix.Translation(Vector(c)) @ Matrix.Rotation(an, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
            out.append(l)
    out.append(sphere('lotusc', (c[0], c[1], c[2] + 0.04), (s * 0.2, s * 0.2, s * 0.1), cm, seg=24))
    return out

def berry(c, r):
    """산딸기: 작은 알 여러 개가 모인 둥근 열매 + 꼭지"""
    m = vinyl('#D9475E', 0.38, 0.3); out = []
    random.seed(int(abs(c[0] * 100 + c[1] * 10)))
    for k in range(14):
        a = k * 2.4; zz = (k / 13) * 2 - 1; rr = math.sqrt(1 - zz * zz)
        p = Vector(c) + Vector((math.cos(a) * rr * r * 0.78, math.sin(a) * rr * r * 0.78, zz * r * 0.85))
        out.append(sphere('drupe', p, (r * 0.36,) * 3, m, seg=16))
    out.append(sphere('core', c, (r * 0.75, r * 0.75, r * 0.85), m, seg=24))
    out.append(leaf('cal', Vector(c) + Vector((0, 0, r * 0.8)), 0.5, r * 0.6, r * 0.35, vinyl(LEAF, 0.5, 0.2)))
    return out

def berry_crown(c, s):
    out = []
    for k in range(5):
        a = k / 5 * 2 * math.pi
        out += berry((c[0] + math.cos(a) * s * 0.42, c[1] + math.sin(a) * s * 0.36, c[2] + 0.05), s * 0.18)
    for k in range(5):
        a = k / 5 * 2 * math.pi + 0.6
        out.append(leaf('cl', Vector((c[0] + math.cos(a) * s * 0.3, c[1] + math.sin(a) * s * 0.26, c[2])), a, s * 0.35, s * 0.16, vinyl(LEAF, 0.5, 0.2), tilt=1.2))
    return out

# ───────── 꿀벌 ─────────
def wing(name, root, length, width, yaw, pitch, roll, m, rim_m, thick=0.018):
    """굽은 반투명 날개: 둥근 잎 판을 살짝 오목하게 굽히고 두께를 준 뒤 테두리·맥 하나"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    N = 28; M = 8
    rows = []
    for j in range(M + 1):
        rr = j / M; row = []
        for i in range(N):
            a = i / N * 2 * math.pi
            x = (math.cos(a) * 0.5 + 0.5) * length
            y = math.sin(a) * width * 0.5 * (1 - 0.35 * ((math.cos(a) * 0.5 + 0.5)) ** 2)
            x *= rr; y *= rr
            z = 0.12 * width * (rr ** 2)  # 오목
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(M):
        for i in range(N):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % N], rows[j + 1][(i + 1) % N], rows[j + 1][i]))
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(m)
    sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = thick; sol.offset = 0
    smooth(o, 1)
    R = Matrix.Translation(Vector(root)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(pitch, 4, 'Y') @ Matrix.Rotation(roll, 4, 'X')
    o.matrix_world = R
    # 테두리
    pts = []
    for i in range(0, 28, 2):
        a = i / 28 * 2 * math.pi
        x = (math.cos(a) * 0.5 + 0.5) * length; y = math.sin(a) * width * 0.5 * (1 - 0.35 * ((math.cos(a) * 0.5 + 0.5)) ** 2)
        pts.append(R @ Vector((x, y, 0.12 * width)))
    rim = tube(name + 'rim', pts, [max(0.011, thick * 0.7)] * len(pts), rim_m, closed=True, res=6, bres=3)
    vein = tube(name + 'vein', [R @ Vector((0.02, 0, 0.0)), R @ Vector((length * 0.5, width * 0.04, 0.03 * width)), R @ Vector((length * 0.9, width * 0.02, 0.1 * width))], [0.008, 0.007, 0.005], rim_m, res=8, bres=3)
    return [o, rim, vein]

def bee(st, br, seed, P):
    stripe = vinyl('#6B564E', 0.55, 0.1)
    if st == 1:
        col, _ = husk_seed_col(seed)
        h, _ = husk(0, 0.68, 0.62, col=col)
        body_m = banded('#F2CB6B', '#6E5A50', [(0.38, 0.47)])  # 띠는 입 아래(눈 위에 오면 점 눈이 묻힌다)
        b = fused('body', [((0, 0, 0.66), (0.5, 0.46, 0.5))], body_m)
        P.body += [h, b]; P.main = b
        P.body += stalks(b, 0, -0.04, 0.17, stripe, tip_m=stripe, h=0.18, r=0.026)
        P.top = sprout_on(b, 0, 0.08, 0.75); P.body += P.top
        P.face = (b, 0.0, 0.66, 0.9 * 0.55); P.head = (0, 0, 0.66, 0.5); P.hand = (-0.5, -0.32, 0.5)
        return
    R = {2: 0.56, 3: 0.66, 4: 0.68, 5: 0.7}[st]
    bands = [(0.4, 0.55)] if st == 2 else [(0.24, 0.36), (0.5, 0.62)]
    body_m = banded('#F2CB6B', '#6E5A50', bands)
    cz = R + 0.08
    b = fused('body', [((0, 0, cz), (R, R * 0.91, R))], body_m)
    P.body += [b]; P.main = b
    for sgn in (-1, 1): P.body += [sphere('foot', (sgn * 0.24 * R / 0.66, -0.1, 0.09), (0.13, 0.15, 0.08), stripe, seg=24)]
    # 날개: 굽은 판 + 흰 테두리·맥. 투명 유리로 두면(film_transparent_glass) 배경까지 비쳐 사라진다 → 반투명 흰 판(alpha)으로
    if st == 5:
        wm = mat('wing', '#E2F3FF', rough=0.1, sss=0.0, spec=0.6, alpha=0.62, coat=0.6); rim = mat('wrim', '#BFE6FF', rough=0.2, sss=0, spec=0.6)
    else:
        wm = mat('wing', '#FFFFFF', rough=0.18, sss=0.0, spec=0.55, alpha=0.55, coat=0.4); rim = mat('wrim', '#FFFFFF', rough=0.3, sss=0.1, spec=0.5)
    big = {2: 0.4, 3: 0.82, 4: 0.82, 5: 0.95}[st]
    for sgn in (-1, 1):
        yaw = 0.3 if sgn > 0 else math.pi - 0.3
        root = (sgn * R * 0.5, R * 0.45, cz + R * 0.45)
        P.body += wing('wing', root, big, big * 0.6, yaw, -0.75, math.pi / 2, wm, rim)
        if st >= 4:
            root2 = (sgn * R * 0.55, R * 0.45, cz + R * 0.12)
            P.body += wing('wing2', root2, big * 0.66, big * 0.42, yaw, 0.15, math.pi / 2, wm, rim)
    P.body += stalks(b, 0, -0.04, 0.2, stripe, tip_m=stripe, h=0.22, r=0.03)
    P.top = sprout_on(b, 0, 0.08, 0.8); P.body += P.top
    P.face = (b, 0.0, cz + 0.06 * R / 0.66, 0.62 * R / 0.66); P.head = (0, 0, cz, R)
    P.neck = None if st == 2 else (0.0, cz - R * 0.18, R)
    P.hand = (-R - 0.1, -0.3, cz - R * 0.3); P.back = (0, R * 0.8, cz)
    if st == 3:
        if br != 'b':  # 꿀단지(옆 바닥)
            pot = vinyl('#E7A44A', 0.42, 0.12)
            P.body += [fused('pot', [((0.86, -0.1, 0.17), (0.2, 0.2, 0.17))], pot), cyl('lid', (0.86, -0.1, 0.34), 0.14, 0.05, vinyl('#C98A3E', 0.5, 0.1)), sphere('drip', (0.76, -0.24, 0.26), (0.05, 0.04, 0.07), vinyl('#F2B33F', 0.2, 0.2))]
        else:  # 꽃바구니
            P.body += [fused('basket', [((0.86, -0.1, 0.14), (0.22, 0.2, 0.14))], vinyl('#C9A06A', 0.75, 0.05))]
            for (x, y, c) in ((0.8, -0.16, '#FBF5EA'), (0.94, -0.06, '#F7B6C6'), (0.86, 0.04, '#F2D27A')):
                P.body += flower((x, y, 0.3), 0.07, c, '#F2C35B', face=(0, -0.6, 1))
    elif st == 4:
        crown = petal_crown((0, -0.02, (top_of(b, 0, -0.02) or cz + R) - 0.04), 0.3, '#F7C640' if br != 'b' else '#FFFFFF', '#8A5A2B' if br != 'b' else '#F2C35B')
        P.props.append((crown, 'hat'))
    elif st == 5:
        hx, hy, hz = P.hand
        lan = lantern((hx, hy, hz), 0.21, '#F2B33F' if br != 'b' else '#F7B6C6', glow='#FFE39A' if br != 'b' else '#FFD9E2')
        P.props.append((lan, 'hand'))

def petal_crown(c, s, petal, center):
    pm = vinyl(petal, 0.45, 0.25); out = []
    for k in range(10):
        a = k / 10 * 2 * math.pi
        l = leaf('cp', Vector((0, 0, 0)), 0, s * 0.42, s * 0.2, pm)
        l.matrix_world = Matrix.Translation(Vector(c) + Vector((math.cos(a) * s * 0.48, math.sin(a) * s * 0.4, 0))) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z') @ Matrix.Rotation(-0.35, 4, 'X')
        out.append(l)
    ring = [Vector(c) + Vector((math.cos(a) * s * 0.5, math.sin(a) * s * 0.42, 0)) for a in [i / 20 * 2 * math.pi for i in range(20)]]
    out.append(tube('cring', ring, [0.035] * 20, vinyl(center, 0.5, 0.1), closed=True))
    return out

def lantern(c, s, col, glow):
    """손에 든 둥근 등불: 막대 + 둥근 갓(빛남)"""
    out = [tube('lstick', [Vector(c) + Vector((0, 0, -0.06)), Vector(c) + Vector((0.02, -0.02, s * 2.4))], [0.02, 0.018], vinyl('#8A6A4A', 0.6, 0.05))]
    top = Vector(c) + Vector((0.1, -0.02, s * 2.4))
    out.append(tube('lhook', [Vector(c) + Vector((0.02, -0.02, s * 2.4)), top + Vector((-0.04, 0, 0.06)), top], [0.014] * 3, vinyl('#8A6A4A', 0.6, 0.05)))
    bulb = top + Vector((0, 0, -s * 0.85))
    out.append(sphere('lbulb', bulb, (s * 0.7, s * 0.7, s * 0.8), mat('paper', col, rough=0.55, sss=0.4, emis=(glow, 1.6))))
    out.append(cyl('lcap', bulb + Vector((0, 0, s * 0.78)), s * 0.32, s * 0.12, vinyl('#8A6A4A', 0.5, 0.05)))
    out.append(cyl('lbase', bulb - Vector((0, 0, s * 0.78)), s * 0.3, s * 0.1, vinyl('#8A6A4A', 0.5, 0.05)))
    return out

# ───────── 애벌레 → 나비 ─────────
def worm(st, br, seed, P):
    body_m = vinyl('#B9D98A', 0.5, 0.3)
    bob = vinyl('#7C8CC8' if br != 'b' or st < 3 else '#F09A6E', 0.45, 0.2)
    if st == 1:
        col, _ = husk_seed_col(seed)
        h, _ = husk(0, 0.68, 0.62, col=col)
        b = fused('body', [((0, 0, 0.66), (0.5, 0.46, 0.5))], body_m)
        P.body += [h, b]; P.main = b
        P.body += stalks(b, 0, -0.02, 0.17, body_m, tip_m=bob, h=0.2, r=0.03)
        P.top = sprout_on(b, 0, 0.08, 0.75); P.body += P.top
        P.face = (b, 0.0, 0.66, 0.9 * 0.55); P.head = (0, 0, 0.66, 0.5); P.hand = (-0.5, -0.32, 0.5)
        return
    if st in (2, 3):
        segs = [((-0.28, 0, 0.82), (0.5, 0.46, 0.48))]
        rest = ((0.12, 0.34, 0.33), (0.46, 0.26, 0.28)) if st == 2 else ((0.12, 0.34, 0.33), (0.46, 0.26, 0.28), (0.76, 0.22, 0.24), (1.02, 0.19, 0.2))
        for (x, z, r) in rest: segs.append(((x, 0.06, z), (r, r * 0.95, r)))
        b = fused('body', segs, body_m)
        P.body += [b]; P.main = b
        # 배 쪽 짧은 발(점)
        for (x, z, r) in rest:
            P.body += [sphere('leg', (x, -r * 0.55, 0.05), (0.06, 0.06, 0.05), vinyl('#9CC274', 0.55, 0.2), seg=16)]
        P.body += stalks(b, -0.28, -0.02, 0.18, body_m, tip_m=bob, h=0.24, r=0.035)
        P.top = sprout_on(b, -0.28, 0.08, 0.8); P.body += P.top
        P.face = (b, -0.3, 0.8, 0.59); P.head = (-0.28, 0, 0.82, 0.48)
        P.neck = (-0.22, 0.42, 0.5); P.hand = (-0.84, -0.26, 0.42); P.back = (0.1, 0.32, 0.5)
        if st == 3:
            if br != 'b':
                bag = [fused('bag', [((0.18, 0.34, 0.62), (0.2, 0.12, 0.2))], vinyl('#6FA85A', 0.6, 0.15))]
                bag.append(leaf('flap', Vector((0.18, 0.26, 0.76)), 3.14, 0.22, 0.2, vinyl('#5E9A4E', 0.6, 0.15), tilt=-0.4))
            else:
                bag = [fused('bag', [((0.18, 0.34, 0.62), (0.2, 0.12, 0.2))], vinyl('#F2A7BB', 0.55, 0.2))]
                bag += flower((0.18, 0.2, 0.66), 0.08, '#FFFFFF', '#F2C35B', face=(0.2, -1, 0.3))
            P.props.append((bag, 'back'))
        return
    if st == 4:
        cc = '#5D6DA6' if br != 'b' else '#EE9B62'
        cm = vinyl(cc, 0.62, 0.15)
        coc = fused('cocoon', [((0, 0, 0.62), (0.5, 0.46, 0.62)), ((0, 0, 0.18), (0.36, 0.34, 0.2))], cm)
        silk = vinyl('#F4EEDF' if br != 'b' else '#FFF3E0', 0.7, 0.2)
        P.body += [coc]
        for k, z in enumerate((0.34, 0.6, 0.86)):
            pts = ring_fit(coc, 0, z, 28, pad=0.006)
            if len(pts) > 6: P.body += [tube('silk', [p for p, d in pts], [0.018] * len(pts), silk, closed=True, res=4, bres=3)]
        b = fused('body', [((0, -0.02, 1.32), (0.4, 0.37, 0.38))], body_m)
        P.body += [b]; P.main = b
        P.body += stalks(b, 0, -0.02, 0.15, body_m, tip_m=bob, h=0.2, r=0.03)
        P.top = sprout_on(b, 0, 0.08, 0.75); P.body += P.top
        P.face = (b, 0.0, 1.3, 0.5); P.head = (0, -0.02, 1.32, 0.4)
        P.neck = (0.0, 1.06, 0.4); P.hand = (-0.56, -0.3, 0.6); P.back = (0, 0.46, 0.7)
        return
    # 5 나비
    bm_ = vinyl('#CFE6A6', 0.5, 0.3)
    b = fused('body', [((0, 0, 0.98), (0.44, 0.4, 0.42)), ((0, 0.04, 0.48), (0.3, 0.28, 0.36)), ((0, 0.06, 0.16), (0.2, 0.2, 0.18))], bm_)
    P.body += [b]; P.main = b
    for sgn in (-1, 1): P.body += [sphere('foot', (sgn * 0.16, -0.06, 0.06), (0.1, 0.12, 0.06), vinyl('#9CC274', 0.55, 0.2), seg=16)]
    w1, w2, dot = ('#5266B4', '#7F95DC', '#F7CF5B') if br != 'b' else ('#EE7B4C', '#F7B15A', '#FFE7A0')
    rim_m = vinyl('#3E4C7A' if br != 'b' else '#C2593A', 0.45, 0.1)
    for sgn in (-1, 1):
        yaw = 0.28 if sgn > 0 else math.pi - 0.28
        up = wing('wingU', (sgn * 0.12, 0.22, 1.0), 1.0, 0.82, yaw, -0.5, math.pi / 2, vinyl(w1, 0.45, 0.15), rim_m, thick=0.04)
        lo = wing('wingL', (sgn * 0.12, 0.24, 0.62), 0.68, 0.52, yaw, 0.55, math.pi / 2, vinyl(w2, 0.45, 0.15), rim_m, thick=0.04)
        P.body += up + lo
        for (wobj, fr, r) in ((up[0], 0.72, 0.09), (up[0], 0.45, 0.06), (lo[0], 0.6, 0.06)):
            mw = wobj.matrix_world
            tip = mw @ Vector((fr * (1.0 if wobj is up[0] else 0.68), 0, 0.0))
            p, n = hit_from(wobj, (tip.x, -3, tip.z), (0, 1, 0))
            if p is not None:
                d = sphere('dot', p + n * 0.004, (r, r, r * 0.22), vinyl(dot, 0.4, 0.1), seg=16)
                d.rotation_mode = 'QUATERNION'; d.rotation_quaternion = n.to_track_quat('Z', 'Y'); P.body += [d]
    P.body += stalks(b, 0, -0.02, 0.17, bm_, tip_m=bob, h=0.3, r=0.03)
    P.top = sprout_on(b, 0, 0.08, 0.8); P.body += P.top
    P.face = (b, 0.0, 0.96, 0.56); P.head = (0, 0, 0.98, 0.44)
    P.neck = (0.0, 0.68, 0.36); P.hand = (-0.42, -0.3, 0.5); P.back = (0, 0.36, 0.7)

SPECIES = {'snail': snail, 'frog': frog, 'bee': bee, 'worm': worm}

# ───────── 옷 맞춤 ─────────
def ring_fit(body, cx, z, n=36, pad=0.0, r=None):
    """높이 z에서 몸 둘레를 광선으로 잰 고리: [(점, 바깥 방향)].
    r(목 반지름)을 주면 축에서 바깥으로 쏘고 r×1.5 안에서만 잰다 — 옆으로 길게 이어진 몸(애벌레 마디)에서 고리가 늘어나지 않게.
    그 안에서 못 맞히면 반지름 r 자리(몸 속 = 가려짐)"""
    if body.name not in BVH: BVH[body.name] = bvh_of(body)
    bvh = BVH[body.name]; pts = []
    mw = body.matrix_world; inv = mw.inverted()
    c = Vector((cx, 0, z))
    for i in range(n):
        a = i / n * 2 * math.pi
        d = Vector((math.cos(a), math.sin(a), 0))
        if r:
            hit, nn, _, dist = bvh.ray_cast(inv @ c, (inv.to_3x3() @ d).normalized(), r * 1.5)
            pts.append(((mw @ hit) + d * pad if hit is not None else c + d * r * 0.9, d))
            continue
        hit, nn, _, _ = bvh.ray_cast(inv @ (c + d * 3), (inv.to_3x3() @ -d).normalized())
        if hit is None: continue
        pts.append((mw @ hit + d * pad, d))
    return pts

def band(name, ring, w, t, m, droop=0.0):
    """납작한 띠 고리(목도리·리본 끈): 단면이 세로로 긴 타원 → 튜브가 아니라 천처럼 보인다.
    droop = 앞쪽(카메라 쪽)이 아래로 처지는 정도"""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); K = 12
    rings = []
    for p, d in ring:
        front = max(0.0, -d.y)
        c = p + Vector((0, 0, -droop * front))
        rr = []
        for k in range(K):
            a = k / K * 2 * math.pi
            rr.append(bm.verts.new(c + d * (t * math.cos(a)) + Vector((0, 0, w * math.sin(a)))))
        rings.append(rr)
    for i in range(len(rings)):
        A, B = rings[i], rings[(i + 1) % len(rings)]
        for k in range(K): bm.faces.new((A[k], A[(k + 1) % K], B[(k + 1) % K], B[k]))
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(m); smooth(o, 2)
    return o

def front_of(ring):
    return min(ring, key=lambda pd: pd[1].y)

def acc_neck(P, kind):
    b = P.main; x, z, r = P.neck
    ring = ring_fit(b, x, z, 40, pad=0.03, r=r)
    if len(ring) < 8: return []
    out = []
    if kind == 'ribbon':
        m = vinyl('#D9534F', 0.45, 0.12)
        out.append(band('ribbonband', ring, 0.045, 0.022, m, 0.03))
        p, d = front_of(ring); c = p + Vector((0, -0.04, -0.03))
        for sgn in (-1, 1):
            lo = sphere('loop', c + Vector((sgn * 0.1, -0.01, 0.01)), (0.1, 0.035, 0.065), m, rot=(0, sgn * 0.35, 0))
            out.append(lo)
            out.append(leaf('tail', c + Vector((sgn * 0.02, -0.02, -0.02)), math.pi + sgn * 0.35, 0.16, 0.06, m, tilt=0.2))
        out.append(sphere('knot', c + Vector((0, -0.03, 0)), (0.04, 0.035, 0.045), m))
    elif kind == 'bandana':
        m = knit('#E9B949')
        out.append(band('bandband', ring, 0.06, 0.03, m, 0.05))
        p, d = front_of(ring)
        tri = leaf('tri', p + Vector((0.0, -0.02, -0.02)), math.pi, 0.24, 0.24, m, tilt=0.25, curl=-0.1, thick=0.12)
        out.append(tri)
        dots = vinyl('#FFF5DC', 0.6, 0.1)
        for (dx, dz) in ((-0.06, -0.08), (0.06, -0.08), (0, -0.16)):
            out.append(sphere('dot', p + Vector((dx, -0.07, -0.02 + dz)), (0.018, 0.01, 0.018), dots, seg=12))
    elif kind == 'bowtie':
        m = vinyl('#3E4C7A', 0.4, 0.1)
        out.append(band('bowband', ring, 0.02, 0.015, vinyl('#F4F1EA', 0.5, 0.1), 0.02))
        p, d = front_of(ring); c = p + Vector((0, -0.03, -0.02))
        for sgn in (-1, 1):
            out.append(fused('wing', [((c.x + sgn * 0.07, c.y, c.z), (0.08, 0.03, 0.055)), ((c.x + sgn * 0.12, c.y, c.z), (0.04, 0.03, 0.07))], m, voxel=0.01, smooth_it=6))
        out.append(sphere('knot', c + Vector((0, -0.02, 0)), (0.035, 0.03, 0.04), m))
    elif kind == 'lei':
        cols = ['#F7B6C6', '#FBF5EA', '#F2D27A', '#F09A6E']
        sel = ring[::2]
        for i, (p, d) in enumerate(sel):
            front = max(0.0, -d.y)
            c = p + Vector((0, 0, -0.03 * front)) + d * 0.02
            out += flower(c, 0.07, cols[i % 4], '#F2C35B', face=tuple(d + Vector((0, 0, 0.3))))
    elif kind == 'scarf':
        m = knit('#D9A94E')
        out.append(band('scarf', ring, 0.07, 0.045, m, 0.03))
        p, d = front_of(ring)
        out.append(tube('scarftail', [p + Vector((0.04, -0.03, -0.02)), p + Vector((0.08, -0.08, -0.16)), p + Vector((0.09, -0.07, -0.3))], [0.06, 0.055, 0.05], m))
    return out

def acc_hat(P, kind):
    b = P.hat_on or P.main; hx, hy, hz, hr = P.head
    zt = top_of(b, hx, hy - hr * 0.05) or hz + hr
    out = []
    base = Vector((hx, hy, zt - hr * 0.22))
    if kind == 'acorn-cap':
        cm = vinyl('#8E5D35', 0.62, 0.08)
        out.append(fused('cap', [((base.x, base.y, base.z + hr * 0.08), (hr * 0.78, hr * 0.74, hr * 0.42))], cm, voxel=0.015, smooth_it=8))
        ring = [base + Vector((math.cos(a) * hr * 0.78, math.sin(a) * hr * 0.74, hr * 0.02)) for a in [i / 24 * 2 * math.pi for i in range(24)]]
        out.append(tube('rim', ring, [hr * 0.09] * 24, vinyl('#6E4A2A', 0.7, 0.05), closed=True))
        # 비늘 결: 작은 혹
        for k in range(14):
            a = k / 14 * 2 * math.pi; rr = hr * (0.55 if k % 2 else 0.4)
            p, n = hit_from(out[0], (base.x + math.cos(a) * rr, base.y + math.sin(a) * rr, base.z + 2), (0, 0, -1))
            if p is not None: out.append(sphere('scale', p, (hr * 0.08, hr * 0.08, hr * 0.04), vinyl('#A06D41', 0.6, 0.05), seg=12))
        out.append(tube('stem', [base + Vector((hr * 0.12, 0, hr * 0.46)), base + Vector((hr * 0.2, 0, hr * 0.62)), base + Vector((hr * 0.32, 0, hr * 0.66))], [hr * 0.05] * 3, vinyl('#6E4A2A', 0.7, 0.05)))
    elif kind == 'leaf-hat':
        lm = vinyl('#6FB25A', 0.5, 0.2)
        l = leaf('hatleaf', Vector((0, 0, 0)), 0, hr * 1.7, hr * 0.95, lm, tilt=0, curl=-0.12, thick=0.1)
        l.matrix_world = Matrix.Translation(base + Vector((hr * 0.7, hr * 0.1, hr * 0.32))) @ Matrix.Rotation(math.radians(-100), 4, 'Y') @ Matrix.Rotation(0.25, 4, 'X')
        out.append(l)
        out.append(tube('midrib', [base + Vector((hr * 0.7, -hr * 0.05, hr * 0.42)), base + Vector((0, -hr * 0.08, hr * 0.5)), base + Vector((-hr * 0.8, -hr * 0.05, hr * 0.3))], [hr * 0.03] * 3, vinyl('#9AD07F', 0.5, 0.1)))
        out.append(tube('stalk', [base + Vector((hr * 0.7, 0, hr * 0.32)), base + Vector((hr * 0.88, 0, hr * 0.38)), base + Vector((hr * 0.98, 0, hr * 0.5))], [hr * 0.04] * 3, lm))
    elif kind == 'straw':
        sm = mat('straw', '#E6C77E', rough=0.8, sss=0.05, sheen=0.4)
        brim = fused('brim', [((base.x, base.y, base.z + hr * 0.05), (hr * 1.35, hr * 1.25, hr * 0.06))], sm, voxel=0.015, smooth_it=6)
        crown = fused('crown', [((base.x, base.y, base.z + hr * 0.3), (hr * 0.68, hr * 0.62, hr * 0.32))], sm, voxel=0.015, smooth_it=8)
        out += [brim, crown]
        ring = [base + Vector((math.cos(a) * hr * 0.7, math.sin(a) * hr * 0.64, hr * 0.2)) for a in [i / 24 * 2 * math.pi for i in range(24)]]
        out.append(tube('band', ring, [hr * 0.07] * 24, vinyl('#D9534F', 0.5, 0.1), closed=True))
    elif kind == 'beanie':
        km = knit('#E2775F')
        dome = fused('beanie', [((base.x, base.y, base.z + hr * 0.12), (hr * 0.92, hr * 0.88, hr * 0.56))], km, voxel=0.015, smooth_it=8)
        out.append(dome)
        ring = [base + Vector((math.cos(a) * hr * 0.9, math.sin(a) * hr * 0.86, hr * 0.0)) for a in [i / 28 * 2 * math.pi for i in range(28)]]
        out.append(tube('cuff', ring, [hr * 0.13] * 28, knit('#F4E3C8'), closed=True))
        out.append(sphere('pom', base + Vector((hr * 0.35, hr * 0.25, hr * 0.7)), (hr * 0.24,) * 3, knit('#F4E3C8')))
    elif kind == 'santa':
        rm = knit('#D64545'); wm = knit('#FFFFFF')
        pts = [base + Vector((0, 0, 0)), base + Vector((0.05 * hr, 0.05 * hr, hr * 0.55)), base + Vector((hr * 0.45, 0.1 * hr, hr * 0.95)), base + Vector((hr * 0.9, 0.1 * hr, hr * 0.7))]
        out.append(tube('cone', pts, [hr * 0.86, hr * 0.55, hr * 0.22, hr * 0.06], rm, res=24))
        ring = [base + Vector((math.cos(a) * hr * 0.86, math.sin(a) * hr * 0.82, 0)) for a in [i / 28 * 2 * math.pi for i in range(28)]]
        out.append(tube('trim', ring, [hr * 0.14] * 28, wm, closed=True))
        out.append(sphere('pom', pts[-1] + Vector((0.02, 0, -0.04)), (hr * 0.16,) * 3, wm))
    return out

def acc_hand(P, kind):
    hx, hy, hz = P.hand
    h = Vector((hx, hy, hz)); out = []
    if kind == 'pencil':
        y = vinyl('#F2C14E', 0.45, 0.1)
        a = h + Vector((0.04, -0.06, -0.18)); t = h + Vector((-0.08, -0.04, 0.24))
        out.append(tube('pbody', [a, (a + t) / 2, t], [0.045] * 3, y, res=6, bres=2))
        d = (t - a).normalized()
        out.append(tube('ptip', [t, t + d * 0.06, t + d * 0.12], [0.045, 0.024, 0.004], vinyl('#E8C9A0', 0.6, 0.05), res=6))
        out.append(sphere('lead', t + d * 0.12, (0.008,) * 3, vinyl('#3A3A3A', 0.4, 0), seg=8))
        out.append(tube('ferrule', [a - d * 0.0, a - d * 0.04], [0.047, 0.047], vinyl('#C9C9C9', 0.3, 0.0), res=4))
        out.append(tube('eraser', [a - d * 0.04, a - d * 0.1], [0.045, 0.043], vinyl('#F29BA8', 0.6, 0.1), res=4))
    elif kind == 'balloon':
        bm = mat('balloon', '#F07F8F', rough=0.18, sss=0.15, spec=0.6, coat=0.3)
        c = h + Vector((-0.12, -0.02, 0.62))
        out.append(sphere('balloon', c, (0.2, 0.19, 0.24), bm))
        out.append(sphere('knot', c + Vector((0, 0, -0.25)), (0.03, 0.03, 0.035), bm, seg=12))
        out.append(tube('string', [h, h + Vector((-0.05, -0.01, 0.18)), c + Vector((0, 0, -0.27))], [0.006] * 3, vinyl('#F4F1EA', 0.6, 0), res=8, bres=2))
    elif kind == 'mug':
        mm = vinyl('#F4F1EA', 0.35, 0.1)
        c = h + Vector((-0.02, -0.08, -0.02))
        out.append(cyl('mug', c, 0.11, 0.2, mm, bevel=0.15))
        out.append(cyl('coffee', c + Vector((0, 0, 0.085)), 0.095, 0.02, vinyl('#7A4E35', 0.2, 0.05), bevel=0.1))
        ring = [c + Vector((-0.11 - math.sin(a) * 0.06, 0, math.cos(a) * 0.06)) for a in [i / 12 * math.pi for i in range(13)]]
        out.append(tube('handle', ring, [0.018] * 13, mm))
        out.append(cyl('stripe', c + Vector((0, 0, -0.02)), 0.112, 0.04, vinyl('#E07A5F', 0.4, 0.1), bevel=0.05))
    elif kind == 'flag':
        sm = vinyl('#B08A5E', 0.6, 0.05)
        a = h + Vector((0, -0.04, -0.12)); t = h + Vector((-0.02, -0.04, 0.5))
        out.append(tube('pole', [a, t], [0.018, 0.016], sm))
        out.append(sphere('ball', t, (0.03,) * 3, vinyl('#F2C14E', 0.4, 0.1), seg=12))
        me = bpy.data.meshes.new('flag'); bm_ = bmesh.new()
        vs = [bm_.verts.new(v) for v in [t + Vector((0, 0, -0.03)), t + Vector((-0.28, -0.02, -0.1)), t + Vector((0, 0, -0.2))]]
        bm_.faces.new(vs); bm_.to_mesh(me); bm_.free()
        fo = link(bpy.data.objects.new('flag', me)); fo.data.materials.append(vinyl('#E2584F', 0.5, 0.1))
        md = fo.modifiers.new('sol', 'SOLIDIFY'); md.thickness = 0.02; smooth(fo, 1)
        out.append(fo)
    elif kind == 'songpyeon':
        cols = ['#BFD99A', '#F4F1EA', '#F2BFC6']
        lf = leaf('pine', h + Vector((0.06, -0.06, -0.1)), math.radians(-80), 0.32, 0.16, vinyl('#6FA85A', 0.6, 0.1), tilt=0, curl=0.05, thick=0.1)
        out.append(lf)
        for i, c in enumerate(cols):
            p = h + Vector((-0.12 + i * 0.1, -0.1 + i * 0.02, -0.06 + (i % 2) * 0.03))
            o = fused('song', [((p.x, p.y, p.z), (0.075, 0.05, 0.05)), ((p.x, p.y, p.z + 0.02), (0.06, 0.045, 0.04))], vinyl(c, 0.6, 0.25), voxel=0.01, smooth_it=8)
            o.rotation_euler = (0, 0.3, 0)
            out.append(o)
    elif kind == 'bok':
        bm_ = vinyl('#D9475E', 0.55, 0.15); gm = vinyl('#E8B64B', 0.35, 0.05)
        c = h + Vector((-0.04, -0.08, -0.04))
        out.append(fused('pouch', [((c.x, c.y, c.z), (0.15, 0.13, 0.14)), ((c.x, c.y, c.z + 0.13), (0.08, 0.07, 0.06))], bm_, voxel=0.012, smooth_it=8))
        ring = [c + Vector((math.cos(a) * 0.075, math.sin(a) * 0.065, 0.1)) for a in [i / 16 * 2 * math.pi for i in range(16)]]
        out.append(tube('tie', ring, [0.016] * 16, gm, closed=True))
        out.append(sphere('tassel', c + Vector((0.05, -0.06, 0.12)), (0.025, 0.02, 0.05), gm, seg=12))
        p, n = hit_from(out[0], (c.x, -3, c.z - 0.02), (0, 1, 0))
        if p is not None:
            o = sphere('emb', p + n * 0.004, (0.045, 0.045, 0.01), gm, seg=16)
            o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = n.to_track_quat('Z', 'Y'); out.append(o)
    return out

def acc_back(P, kind):
    bx, by, bz = P.back
    p, n = hit_from(P.main, (bx, by + 3, bz), (0, -1, 0))
    if p is None: p, n = Vector((bx, by, bz)), Vector((0, 1, 0))
    out = []
    if kind == 'backpack':
        # 등 뒤 + 카메라 쪽(오른쪽)으로 조금 비켜 옆모습이 보이게. 끈은 둥근 몸에서 띠처럼 보여 뺀다
        pm = vinyl('#E07A5F', 0.6, 0.1)
        c = p + Vector(P.back_off)
        out.append(fused('pack', [((c.x, c.y, c.z), (0.32, 0.2, 0.32)), ((c.x, c.y - 0.02, c.z + 0.2), (0.29, 0.17, 0.15))], pm, voxel=0.015, smooth_it=8))
        out.append(fused('pocket', [((c.x + 0.16, c.y + 0.1, c.z - 0.1), (0.14, 0.12, 0.14))], vinyl('#C96A52', 0.6, 0.1), voxel=0.012, smooth_it=6))
        out.append(fused('flap', [((c.x, c.y - 0.03, c.z + 0.3), (0.3, 0.19, 0.06))], vinyl('#C96A52', 0.6, 0.1), voxel=0.012, smooth_it=6))
        out.append(sphere('buckle', (c.x + 0.22, c.y + 0.02, c.z + 0.22), (0.035, 0.02, 0.045), vinyl('#E8C46A', 0.35, 0.05), seg=12))
    elif kind == 'wings':
        wm = mat('leafwing', '#9ED38A', rough=0.4, sss=0.3, alpha=0.92)
        for sgn in (-1, 1):
            l = leaf('lw', Vector((0, 0, 0)), 0, 0.78, 0.4, wm, tilt=0, curl=0.06, thick=0.08)
            l.matrix_world = Matrix.Translation(p + Vector((sgn * 0.08, 0.06, 0.08))) @ Matrix.Rotation(sgn * -1.05, 4, 'Y') @ Matrix.Rotation(-0.25, 4, 'X')
            out.append(l)
            tip = p + Vector((sgn * 0.08, 0.06, 0.08)) + Vector((sgn * math.sin(1.05) * 0.7, 0.0, math.cos(1.05) * 0.7))
            out.append(tube('rib', [p + Vector((sgn * 0.08, 0.04, 0.08)), (p + tip) / 2 + Vector((0, -0.02, 0.06)), tip], [0.016, 0.012, 0.006], vinyl('#6FA85A', 0.5, 0.1)))
    elif kind == 'lantern':
        # 등에 꽂은 장대가 오른쪽 위로 휘고, 끝에 초롱이 매달린다(몸 옆으로 보이게)
        wood = vinyl('#8A6A4A', 0.6, 0.05)
        top = p + Vector((0.5, 0.0, 0.85))
        out.append(tube('pole', [p + Vector((0, 0.05, -0.05)), p + Vector((0.15, 0.06, 0.55)), top], [0.025, 0.022, 0.018], wood))
        hang = top + Vector((0.08, -0.04, -0.12))
        out.append(tube('cord', [top, hang], [0.008, 0.008], wood, res=4, bres=2))
        s_ = 0.16; bulb = hang + Vector((0, 0, -s_ * 0.85))
        out.append(sphere('lbulb', bulb, (s_ * 0.75, s_ * 0.75, s_ * 0.85), mat('paper', '#F28C5B', rough=0.55, sss=0.4, emis=('#FFD9A0', 1.6))))
        out.append(cyl('lcap', bulb + Vector((0, 0, s_ * 0.82)), s_ * 0.34, s_ * 0.12, wood))
        out.append(cyl('lbase', bulb - Vector((0, 0, s_ * 0.82)), s_ * 0.3, s_ * 0.1, wood))
        out.append(sphere('tassel', bulb - Vector((0, 0, s_ * 1.05)), (0.02, 0.02, 0.05), vinyl('#E2584F', 0.5, 0.1), seg=12))
    return out

HAT = ['acorn-cap', 'leaf-hat', 'straw', 'beanie', 'santa']
NECK = ['ribbon', 'bandana', 'bowtie', 'lei']
HAND = ['pencil', 'balloon', 'mug', 'flag', 'songpyeon', 'bok']
BACK = ['backpack', 'wings', 'lantern']
# 작은 손·등 옷이 둥근 몸 뒤에서 잘 안 보였다(49 §14 다듬기) → 손·등 자리를 기준으로 키우고, 카메라 쪽으로 내밀고,
# 카메라 방향(오른쪽 14°)으로 살짝 돌려(3/4) 앞면이 보이게. 종·단계마다 몸 모양이 달라 표로 다듬는다.
#   (배율, 옮김 x·y·z, 돌림 rad) — x = 화면 오른쪽, y = 카메라 반대(뒤), z = 위
HAND_POSE = {'*': (1.32, (0.1, -0.2, 0.02), 0.32)}
HAND_POSE_SP = {
    ('snail', 1): (1.3, (0.14, -0.22, 0.0), 0.32), ('bee', 1): (1.3, (0.14, -0.22, 0.0), 0.32), ('worm', 1): (1.3, (0.14, -0.22, 0.0), 0.32),
    ('frog', 1): (1.3, (0.12, -0.2, 0.02), 0.3),
    ('snail', 2): (1.3, (0.16, -0.2, 0.04), 0.32),
    ('bee', 2): (1.32, (0.16, -0.22, 0.0), 0.32), ('bee', 3): (1.34, (0.16, -0.24, 0.0), 0.32), ('bee', 4): (1.34, (0.16, -0.24, 0.0), 0.32), ('bee', 5): (1.3, (0.16, -0.24, 0.0), 0.32),
    ('worm', 2): (1.3, (0.2, -0.2, 0.04), 0.32), ('worm', 3): (1.26, (0.2, -0.2, 0.04), 0.32),
    ('worm', 4): (1.3, (0.14, -0.24, 0.0), 0.32), ('worm', 5): (1.3, (0.1, -0.26, 0.0), 0.32),
}
BACK_POSE = {'*': (1.22, (0.16, 0.0, 0.08), 0.3)}
BACK_POSE_SP = {
    ('snail', 2): (1.2, (-0.04, -0.06, 0.08), 0.3), ('snail', 3): (1.2, (-0.04, -0.06, 0.08), 0.3),
    ('snail', 4): (1.2, (-0.04, -0.06, 0.08), 0.3), ('snail', 5): (1.2, (-0.04, -0.06, 0.08), 0.3),
    ('bee', 2): (1.25, (0.18, 0.0, 0.1), 0.3),
    ('bee', 3): (1.28, (0.24, -0.04, -0.12), 0.34), ('bee', 4): (1.28, (0.24, -0.04, -0.16), 0.34), ('bee', 5): (1.28, (0.24, -0.04, -0.16), 0.34),
    ('worm', 5): (1.15, (0.36, -0.2, -0.3), 0.4),
}

def pose(objs, pivot, spec):
    sc_, off, yaw = spec
    bpy.context.view_layer.update()  # rotation_euler·quaternion으로 놓은 것도 matrix_world에 반영된 뒤에
    pv = Vector(pivot)
    M = Matrix.Translation(pv + Vector(off)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(sc_, 4) @ Matrix.Translation(-pv)
    for o in objs: o.matrix_world = M @ o.matrix_world
    return objs

def make_acc(P, aid):
    if aid in HAT: return acc_hat(P, aid)
    if aid in NECK or aid == 'scarf': return acc_neck(P, aid) if P.neck else []
    key = (P.sp, P.st)
    if aid in HAND:
        if not P.hand: return []
        # 풍선은 이미 머리 위로 떠서 잘 보인다 — 앞으로 내밀면 큰 풍선 그림자가 얼굴에 얼룩처럼 진다(그대로 둔다)
        if aid == 'balloon': return acc_hand(P, aid)
        return pose(acc_hand(P, aid), P.hand, HAND_POSE_SP.get(key, HAND_POSE['*']))
    if aid in BACK:
        if not P.back: return []
        sc_, off, yaw = BACK_POSE_SP.get(key, BACK_POSE['*'])
        # 초롱은 장대가 이미 몸 옆으로 휘어 나온다 — 키우거나 내밀면 캔버스 밖으로 나가므로 돌림만(조금만 비킴)
        if aid == 'lantern': sc_, off = 1.0, (off[0] * 0.3, off[1] * 0.3, -0.06)
        return pose(acc_back(P, aid), P.back, (sc_, off, yaw))
    return []
SLOT_OF = {**{k: 'hat' for k in HAT}, **{k: 'neck' for k in NECK}, **{k: 'hand' for k in HAND}, **{k: 'back' for k in BACK}}

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

# 같은 크기 규칙(42 §10.6.1): 모든 종·단계가 같은 상자를 채운다 — 발밑은 아래 10%, 위 14%(모자·풍선 자리), 옆 7%
def frame_char(objs, w, h):
    lo, hi = bbox(objs)
    H = hi.z; W = max(abs(lo.x), abs(hi.x)) * 2
    s = max(H / 0.76, W / 0.86)
    cz = -s * 0.10 + s * 0.5
    return camera((0.0, 0, cz), s, w=w, h=h), s

def render(path, samples, denoise=True):
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.cycles.use_denoising = denoise
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '8'
    bpy.ops.render.render(write_still=True)

def proj(sc, cam, p):
    from bpy_extras.object_utils import world_to_camera_view
    q = world_to_camera_view(sc, cam, Vector(p)); return [round(q.x, 4), round(1 - q.y, 4)]

def screen_box(sc, cam, objs, pad=0.02):
    from bpy_extras.object_utils import world_to_camera_view
    dg = bpy.context.evaluated_depsgraph_get(); xs, ys = [], []
    for o in objs:
        if o.type not in ('MESH', 'CURVE'): continue
        for c in o.evaluated_get(dg).bound_box:
            q = world_to_camera_view(sc, cam, o.matrix_world @ Vector(c)); xs.append(q.x); ys.append(q.y)
    if not xs: return None
    return (max(0, min(xs) - pad), max(0, min(ys) - pad), min(1, max(xs) + pad), min(1, max(ys) + pad))

# ───────── 작업 ─────────
def set_border(sc, bx):
    if bx:
        sc.render.use_border = True; sc.render.use_crop_to_border = False
        sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = bx
    else:
        sc.render.use_border = False

def render_pair(sc, cam, out, name, show, hide, samples):
    """옷·칸 소품 한 벌: ① full = 몸 + 기본 얼굴 + 이것(한 번에 구운 색) ② mask = 이것만, 나머지는 holdout(가려지는 모양)"""
    for o in hide: o.hide_render = True
    for o in show: o.hide_render = False
    set_border(sc, None); sc.cycles.max_bounces = 12
    render(os.path.join(out, name + '-full.png'), samples)
    keep = set(show)
    changed = []
    for o in bpy.data.objects:
        if o.type in ('MESH', 'CURVE') and o not in keep and not o.hide_render:
            if o.name.startswith('ground'): o.hide_render = True; changed.append((o, 'h'))
            else: o.is_holdout = True; changed.append((o, 'o'))
    sc.cycles.max_bounces = 0
    set_border(sc, screen_box(sc, cam, show, 0.02))
    render(os.path.join(out, name + '-mask.png'), 16, denoise=False)
    for o, k in changed:
        if k == 'h': o.hide_render = False
        else: o.is_holdout = False
    sc.cycles.max_bounces = 12; set_border(sc, None)

def do_char(it, out, size, samples):
    """한 종·단계(·갈래)의 장면을 한 번만 짓고 여러 장을 굽는다.
    layer = body | faces(표정 5) | accs(ids 목록, 옷마다 full·mask) | props(칸 소품 full·mask)"""
    reset(); MATS.clear(); BVH.clear()
    sc = bpy.context.scene; sc.render.film_transparent = True; sc.cycles.film_transparent_glass = True; sc.cycles.film_transparent_roughness = 0.2
    P = Parts(); P.sp, P.st = it['species'], it['stage']
    SPECIES[it['species']](it['stage'], it.get('branch', 'a'), it.get('seed', 0), P)
    layer = it.get('layer', 'body')
    b, fx, fz, fs = P.face
    moods = MOODS if layer == 'faces' else ['default']
    faces = {m: face(b, fx, fz, fs, m) for m in moods}
    faceobjs = faces['default']
    propobjs = [o for objs, slot in P.props for o in objs]
    catcher(); lights()
    # 크기 맞춤은 옷 없이(옷을 입어도 몸 크기가 같게), 칸 소품은 넣는다
    cam, s = frame_char(P.body + propobjs + faceobjs, size, size)
    ground = [o for o in bpy.data.objects if o.name.startswith('ground')]
    metas = []
    base = it['name']
    if layer == 'body':
        for o in faceobjs + propobjs: o.hide_render = True
        render(os.path.join(out, base + '.png'), samples)
        hx, hy, hz, hr = P.head
        meta = {'name': base, 'scale': round(s, 4)}
        meta['head'] = proj(sc, cam, (hx, hy, hz)) + [round(hr / s, 4)]
        meta['face'] = proj(sc, cam, (fx, -0.3, fz))
        meta['top'] = proj(sc, cam, (hx, hy, max((o.matrix_world @ Vector(c)).z for o in P.top if o.type in ('MESH', 'CURVE') for c in o.bound_box) if P.top else hz + hr))
        if P.neck: meta['neck'] = proj(sc, cam, (P.neck[0], -P.neck[2] * 0.86, P.neck[1]))
        if P.hand: meta['hand'] = proj(sc, cam, P.hand)
        if P.back: meta['back'] = proj(sc, cam, P.back)
        meta['props'] = [slot for objs, slot in P.props]
        metas.append(meta)
    elif layer == 'faces':
        # 몸은 그림자만 받는 투명면 — 자기 그림자는 드리우지 않는다(층에 몸 유령이 남지 않게). 바닥 그림자는 몸 층이 맡는다
        for o in P.body + propobjs: o.is_shadow_catcher = True; o.visible_shadow = False
        for o in ground: o.hide_render = True
        for m in moods:
            for mm, objs in faces.items():
                for o in objs: o.hide_render = (mm != m)
            set_border(sc, screen_box(sc, cam, faces[m], 0.03))
            render(os.path.join(out, f'{base}-{m}.png'), max(24, samples // 2))
            metas.append({'name': f'{base}-{m}'})
    elif layer == 'accs':
        for o in propobjs: o.hide_render = True
        for aid in it['ids']:
            objs = make_acc(P, aid)
            if not objs: continue
            render_pair(sc, cam, out, f'{base}-{aid}', objs, [], samples)
            metas.append({'name': f'{base}-{aid}'})
            for o in objs: bpy.data.objects.remove(o)
    elif layer == 'props':
        render_pair(sc, cam, out, base, propobjs, [], samples)
        metas.append({'name': base})
    elif layer == 'spin':
        # 한 바퀴 회전 컷(만지기 — 공중에서 한 바퀴): 몸 + 칸 소품 + 웃는 얼굴을 함께, 바닥 그림자 없이(공중이라). 옷은 돌 때 숨긴다
        for o in ground: o.hide_render = True
        for o in faceobjs: o.hide_render = True
        happy = face(b, fx, fz, fs, 'happy')
        lo, hi = bbox(P.body)
        piv = bpy.data.objects.new('pivot', None); link(piv); piv.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0)
        movers = [o for o in bpy.data.objects if o.type in ('MESH', 'CURVE') and o not in ground and not o.hide_render and o.parent is None]
        for o in movers:
            mw = o.matrix_world.copy(); o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted(); o.matrix_world = mw
        n = it.get('frames', 12)
        for k in range(n):
            piv.rotation_euler.z = math.radians(360 * k / n)
            render(os.path.join(out, f'{base}-t{k:02d}.png'), samples)
        metas.append({'name': base, 'frames': n})
    return metas

def do_seed(it, out, size, samples):
    reset(); MATS.clear(); BVH.clear()
    sc = bpy.context.scene; sc.render.film_transparent = True
    col, col2 = SEEDS[it['seed']]
    hk, lines = husk(0, 0.5, 0.62, col=col, col2=col2, top=True, turn=it.get('turn', 0))
    crack = it.get('crack', 0)
    if crack:
        # 진짜 틈: 꼭대기 근처에서 들쭉날쭉 내려오는 선을 표면에서 파낸다. 2단계는 옆 가지 + 작은 조각이 빠진 자리
        def trace(x0, z0, steps, dz, amp, wmax):
            pts, ws = [], []
            for k in range(steps):
                x = x0 + amp[k % len(amp)]; z = z0 - k * dz
                p, n = surface(hk, x, z)
                if p is not None: pts.append((p, n)); ws.append(wmax * (0.35 + 0.65 * math.sin(math.pi * (k + 0.5) / steps)))
            return pts, ws
        # 결 줄(앞 가운데 x=0, 옆 x≈-0.25) 사이 틈으로 — 줄 위로 지나가면 줄이 틈을 덮는다
        paths = [trace(-0.12, 1.04, 16, 0.031, [0.0, 0.016, 0.03, 0.012, -0.012, -0.02, -0.004, 0.018, 0.026, 0.008, -0.014, -0.018, 0.0, 0.016, 0.02, 0.006], 0.016)]
        if crack >= 2:
            paths.append(trace(-0.1, 0.9, 5, 0.035, [0.0, 0.02, 0.04, 0.055, 0.065], 0.01))
            paths.append(trace(-0.14, 0.72, 5, 0.035, [0.0, -0.025, -0.045, -0.06, -0.07], 0.009))
        crack_cut(hk, [p for p in paths if len(p[0]) > 2])
    if it.get('sprout'): sprout((0, 0, 1.22), 0.7)
    catcher(); lights()
    camera((0, 0, 0.62), 1.75, w=size, h=size)
    render(os.path.join(out, it['name'] + '.png'), samples)
    return {'name': it['name']}

# ───────── 장면 ─────────
def turf(c1, c2):
    m = mat('turf' + c1, c1, rough=0.95, sss=0.05)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['A'].default_value = lin(c1); mix.inputs['B'].default_value = lin(c2)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); nt.links.new(nz.outputs['Fac'], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    vz = nt.nodes.new('ShaderNodeTexNoise'); vz.inputs['Scale'].default_value = 160.0; vz.inputs['Detail'].default_value = 4
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.6; bump.inputs['Distance'].default_value = 0.03
    nt.links.new(tc.outputs['Object'], vz.inputs['Vector']); nt.links.new(vz.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

def stone_mat(c1, c2):
    """돌 받침: 두 색 얼룩 + 잔 구멍 범프(매끈한 비닐 돌이 아니라 진짜 돌 결)"""
    m = mat('stone' + c1, c1, rough=0.8, sss=0.05)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.5; nz.inputs['Detail'].default_value = 6
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['A'].default_value = lin(c1); mix.inputs['B'].default_value = lin(c2)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); nt.links.new(nz.outputs['Fac'], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 14
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.02
    nt.links.new(tc.outputs['Object'], vo.inputs['Vector']); nt.links.new(vo.outputs['Distance'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

SKY = {'day': ('#86C0E0', '#EEF0E2'), 'dusk': ('#1C2440', '#4B4766'), 'dawn': ('#E9B9A6', '#F8E9D6'),
       'sunset': ('#F2A27E', '#FBE3C2'), 'moon': ('#202A4A', '#4F5A82'), 'snow': ('#BFD3E6', '#F2F5F7')}
HILLS = {'day': ['#9CC98A', '#7DB873', '#64A563', '#5A9A5A', '#6DAE5F'], 'dusk': ['#33485A', '#2C4150', '#283B47', '#22343E', '#2F4A45'],
         'dawn': ['#B4D49A', '#97C684', '#7FB472', '#73A868', '#86BC6E'], 'sunset': ['#C3C98A', '#A3BC74', '#86A863', '#7C9E5C', '#8DAE62'],
         'moon': ['#3A5064', '#324858', '#2C424F', '#263A45', '#33504A'], 'snow': ['#F4F6F8', '#E7EDF2', '#DCE5EC', '#E9EEF2', '#F3F6F8']}
# 49 §6.1 배경 고르기(2026-10-10): 비 오는 정원 · 꽃밭 · 연못 · 서재 — 밤 짝(-n)은 다크 테마에서
SKY.update({'rain': ('#8FA3B4', '#D5DDE3'), 'rain-n': ('#1A2232', '#3A4256'), 'flowers': ('#9FCBE6', '#F5EEDB'), 'flowers-n': ('#1E2644', '#4A4868'),
            'pond': ('#8CC4E2', '#EEF2E4'), 'pond-n': ('#1B2440', '#45496A'), 'study': ('#BFD8EA', '#F3EBDD'), 'study-n': ('#141C33', '#2E3550')})
HILLS.update({'rain': ['#8FAF86', '#77A06F', '#65915F', '#5E8A59', '#6A9563'], 'rain-n': ['#2C3E4A', '#263844', '#22323C', '#1E2D36', '#28403C'],
              'flowers': HILLS['day'], 'flowers-n': HILLS['dusk'], 'pond': HILLS['day'], 'pond-n': HILLS['dusk'], 'study': HILLS['day'], 'study-n': HILLS['dusk']})
NIGHT = ('dusk', 'moon', 'rain-n', 'flowers-n', 'pond-n', 'study-n')

def do_scene(it, out, samples):
    """정원 장면(배경판): 하늘 + 먼 숲 + 둥근 언덕 + 덤불 + 꽃 + 이끼 낀 돌 받침. 캐릭터는 앱에서 받침 위에 얹는다(perch)."""
    if it.get('time', 'day').startswith('study'): return do_study(it, out, samples)
    reset(); MATS.clear()
    sc = bpy.context.scene; sc.render.film_transparent = False
    t = it.get('time', 'day'); night = t in NIGHT
    theme = t.split('-')[0]
    band_ = it.get('band', False)
    sky = SKY[t]
    w = bpy.data.worlds.new('w'); sc.world = w
    if w.node_tree is None: w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = lin(sky[0]); w.node_tree.nodes['Background'].inputs[1].default_value = 0.35 if night else 0.8
    skym = bpy.data.materials.new('sky'); skym.use_nodes = True
    nt = skym.node_tree; nt.nodes.clear()
    o_ = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp.color_ramp.elements[0].color = lin(sky[1]); ramp.color_ramp.elements[1].color = lin(sky[0])
    ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[1].position = 0.8
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs[0], o_.inputs[0])
    bpy.ops.mesh.primitive_plane_add(size=1); p = bpy.context.active_object; p.scale = (70, 40, 1); p.rotation_euler = (math.radians(90), 0, 0); p.location = (0, 28, 12); p.data.materials.append(skym)
    p.visible_shadow = False; p.visible_diffuse = False
    pal = HILLS[t]
    random.seed(7)
    # 먼 숲: 언덕 뒤에 둥근 나무 줄(흐리게 — 피사계 심도)
    far = vinyl(pal[1] if t != 'snow' else '#C9D6CF', 0.85, 0.05)
    for i in range(22):  # 언덕 뒤로 고개만 내민 둥근 나무 — 크기·높이를 섞어 띠처럼 보이지 않게
        x = -15 + i * 1.45 + random.uniform(-0.5, 0.5); y = random.uniform(15.2, 17.5); r = random.uniform(0.7, 1.5)
        hz = random.uniform(0.6, 1.8)
        sphere('tree', (x, y, hz + r * 0.5), (r, r * 0.9, r * random.uniform(1.0, 1.35)), far if i % 3 else vinyl(pal[2] if t != 'snow' else '#BFCFC6', 0.85, 0.05), seg=24)
        if t == 'snow': sphere('cap', (x, y - 0.1, hz + r * 1.2), (r * 0.7, r * 0.6, r * 0.42), vinyl('#FFFFFF', 0.7, 0.2), seg=24)
    hills = [((-11, 23, -7), (15, 8, 10.5), pal[0]), ((12, 21, -8), (16, 8, 11.5), pal[0]), ((-7, 14, -5), (9, 6, 6.6), pal[1]),
             ((8, 13, -5.4), (9.5, 6, 6.9), pal[1]), ((0, 10, -6.2), (10, 6, 7.0), pal[2]), ((-6.5, 6, -3.3), (5, 4, 3.8), pal[2]), ((7, 5.5, -3.5), (5.5, 4, 4.0), pal[2])]
    for loc, s_, c in hills:
        sphere('hill', loc, s_, turf(c, HILLS[t][min(4, HILLS[t].index(c) + 1)]) if c in HILLS[t] else vinyl(c, 0.85, 0.05), seg=64)
    bpy.ops.mesh.primitive_plane_add(size=90); g = bpy.context.active_object; g.data.materials.append(turf(pal[3], pal[4]))
    bush = [vinyl(pal[1], 0.8, 0.1), vinyl(pal[2], 0.8, 0.1)]
    for i in range(22):
        x = random.uniform(-7.5, 7.5); y = random.uniform(2.0, 7.5); r = random.uniform(0.35, 0.8)
        if abs(x) < 2.2 and y < 4 and not band_: continue
        fused('bush', [((x, y, r * 0.35), (r, r * 0.9, r * 0.85)), ((x + r * 0.7, y + 0.1, r * 0.25), (r * 0.7, r * 0.65, r * 0.6)), ((x - r * 0.65, y + 0.05, r * 0.2), (r * 0.62, r * 0.6, r * 0.55))], bush[i % 2], voxel=0.04, smooth_it=6)
    if t == 'snow':
        fl = [vinyl('#FFFFFF', 0.6, 0.2), vinyl('#E6EEF5', 0.6, 0.2), vinyl('#D9475E', 0.4, 0.2)]
    elif night:
        fl = [vinyl('#E7E2F2', 0.5, 0.2), vinyl('#B9B2D6', 0.5, 0.2), vinyl('#8FA6C8', 0.5, 0.2)]
    else:
        fl = [vinyl('#FBF5EA', 0.5, 0.2), vinyl('#F4C9A8', 0.5, 0.2), vinyl('#F2D27A', 0.5, 0.1)]
    if theme == 'flowers':
        fl += [vinyl('#F2A7BB', 0.5, 0.2), vinyl('#E9826E', 0.5, 0.15), vinyl('#C9B6E8' if not night else '#8E86B8', 0.5, 0.2)]
    nfl = 320 if theme == 'flowers' else 24 if theme == 'rain' else 56
    if theme == 'pond':
        # 연못: 받침 돌이 섬이 되게 앞쪽을 물로(반짝이는 얕은 판) + 연잎·갈대
        water = mat('water', '#6FA7C4' if not night else '#22364A', rough=0.05, sss=0.0, spec=0.7, coat=0.6)
        fused('pond', [((0, 0.2, 0.012), (5.2, 3.2, 0.02))], water, voxel=0.06, smooth_it=4)
        random.seed(11)
        for i in range(14):
            a = random.uniform(0, 2 * math.pi); rr = random.uniform(1.9, 3.8)
            x, y = math.cos(a) * rr * 1.1, 0.6 + math.sin(a) * rr * 0.55
            fused('pad', [((x, y, 0.03), (0.26, 0.2, 0.02))], vinyl('#7DAF74' if not night else '#3E5E48', 0.6, 0.1), voxel=0.02, smooth_it=3)
            if i % 4 == 0: sphere('lotusb', (x, y, 0.1), (0.07, 0.07, 0.09), vinyl('#F2BFC6', 0.45, 0.3), seg=16)
        for i in range(12):
            x = random.choice([-1, 1]) * random.uniform(3.6, 5.0); y = random.uniform(1.5, 3.5)
            tube('reed', [Vector((x, y, 0)), Vector((x + 0.05, y, 0.6)), Vector((x + 0.12, y, 1.1))], [0.02, 0.016, 0.01], vinyl('#6E9C62' if not night else '#2F4A3A', 0.6, 0.1), res=6, bres=3)
            sphere('cat', (x + 0.1, y, 0.95), (0.035, 0.035, 0.12), vinyl('#8A6A4A', 0.6, 0.05), seg=12)
    if theme == 'rain':
        # 빗줄기(가늘고 긴 반투명 방울) + 물웅덩이
        rm = mat('rain', '#E8F0F6', rough=0.1, sss=0.0, spec=0.5, alpha=0.45)
        random.seed(21)
        for i in range(260):
            x = random.uniform(-6, 6); y = random.uniform(-3, 8); z = random.uniform(0.2, 7)
            sphere('drop', (x, y, z), (0.008, 0.008, 0.14), rm, seg=6)
        pm = mat('puddle', '#9DB2C2' if not night else '#2A3A4C', rough=0.04, sss=0.0, spec=0.8, coat=0.5)
        for (x, y, r) in ((-2.4, -0.6, 0.55), (2.2, -0.2, 0.42), (-1.0, 2.6, 0.5), (3.0, 2.0, 0.35)):
            fused('puddle', [((x, y, 0.006), (r * 1.4, r, 0.01))], pm, voxel=0.03, smooth_it=3)
    for i in range(nfl):
        x = random.uniform(-5.5, 5.5); y = random.uniform(-1.8, 4.5)
        if abs(x) < 1.8 and -1.4 < y < 1.6 and not band_: continue
        if theme == 'pond' and abs(x) < 4.4 and -1.8 < y < 3.0: continue
        if t == 'snow' and i % 3 != 2:
            sphere('snowlump', (x, y, 0.05), (0.16, 0.14, 0.08), fl[i % 2], seg=16); continue
        k_ = 1.8 if theme == 'flowers' else 1.0
        zz = 0.13 * (1.6 if theme == 'flowers' else 1)
        for k in range(5):
            a = k / 5 * 2 * math.pi
            sphere('fp', (x + math.cos(a) * 0.06 * k_, y + math.sin(a) * 0.06 * k_, zz), (0.05 * k_, 0.05 * k_, 0.025 * k_), fl[i % len(fl)], seg=12)
        sphere('fcen', (x, y, zz + 0.02), (0.03 * k_,) * 3, vinyl('#F2C35B', 0.4, 0.1), seg=10)
        tube('fstem', [Vector((x, y, 0)), Vector((x, y, zz - 0.01))], [0.012, 0.01], vinyl(pal[2], 0.6, 0.1), res=2, bres=2)
    if not band_:
        stone = stone_mat('#D5CEC2', '#BDB4A6') if not night else stone_mat('#7E7D8C', '#6A6978')
        if t == 'snow': stone = stone_mat('#CFCBC4', '#B8B2A8')
        fused('stone', [((0, 0, 0.2), (1.45, 1.15, 0.42)), ((0.9, -0.3, 0.12), (0.5, 0.45, 0.22))], stone, voxel=0.03, smooth_it=6)
        moss = vinyl('#7FB066' if not night else '#4E6E58', 0.95, 0.1) if t != 'snow' else vinyl('#FFFFFF', 0.75, 0.25)
        fused('moss', [((0, -0.02, 0.56), (1.18, 0.92, 0.1)), ((-0.6, -0.5, 0.5), (0.4, 0.3, 0.08))], moss, voxel=0.025, smooth_it=4)
        for (x, y) in ((-1.25, -0.7), (1.35, -0.55), (-1.5, 0.2)):
            sphere('pebble', (x, y, 0.06), (0.16, 0.13, 0.09), stone, seg=24)
    if night:
        # 별 = 하늘 판 무늬(Voronoi 점). 공으로 두면 먼 거리라 피사계 심도로 큰 흰 원이 된다
        vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 90
        mr_ = nt.nodes.new('ShaderNodeMapRange'); mr_.inputs['From Min'].default_value = 0.0; mr_.inputs['From Max'].default_value = 0.06; mr_.inputs['To Min'].default_value = 1.0; mr_.inputs['To Max'].default_value = 0.0
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs['B'].default_value = lin('#FFF2C8')
        hi = nt.nodes.new('ShaderNodeMath'); hi.operation = 'MULTIPLY'; hi.inputs[1].default_value = 1.0
        nt.links.new(tc.outputs['Generated'], vo.inputs['Vector']); nt.links.new(vo.outputs['Distance'], mr_.inputs['Value'])
        nt.links.new(sep.outputs['Y'], hi.inputs[0]); mk = nt.nodes.new('ShaderNodeMath'); mk.operation = 'MULTIPLY'
        nt.links.new(mr_.outputs['Result'], mk.inputs[0]); nt.links.new(hi.outputs[0], mk.inputs[1])
        nt.links.new(ramp.outputs['Color'], mx.inputs['A']); nt.links.new(mk.outputs[0], mx.inputs['Factor']); nt.links.new(mx.outputs['Result'], em.inputs['Color'])
        mr = 1.6 if t == 'moon' else 0.9
        sphere('moon', (6, 27, 15), (mr,) * 3, mat('moon', '#FFF4DC', emis=('#FFF1D2', 3.0 if t == 'dusk' else 4.0)))
        # 반딧불은 장면에 굽지 않는다 — 피사계 심도로 흰 원이 된다. 방 장식 '반딧불'이 맡는다
    elif t == 'sunset':
        sphere('sun', (-5, 27, 7), (2.2,) * 3, mat('sunb', '#FFE3A3', emis=('#FFD58A', 3.5)))
    elif t == 'day':
        cm = mat('cloud', '#FFFFFF', rough=0.9, sss=0.3, emis=('#FFFFFF', 0.25))
        for (x, z, s) in ((-8, 16, 1.4), (6, 18, 1.1), (11, 14, 0.9)):
            fused('cloud', [((x, 26, z), (2.2 * s, 0.8, 0.8 * s)), ((x + 1.2 * s, 26, z + 0.5 * s), (1.3 * s, 0.8, 1.0 * s)), ((x - 1.2 * s, 26, z + 0.3 * s), (1.1 * s, 0.8, 0.8 * s))], cm, voxel=0.12, smooth_it=4)
    if t == 'snow':
        sm = mat('flake', '#FFFFFF', rough=0.5, sss=0.2, emis=('#FFFFFF', 0.6))
        for i in range(90):
            sphere('flake', (random.uniform(-6, 6), random.uniform(-2, 8), random.uniform(0.4, 6)), (0.045,) * 3, sm, seg=8)
    lights(world=sky[0], strength=0.2 if night else 0.35)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 0.5 if night else (2.6 if t == 'sunset' else 3.2); sun.angle = math.radians(12)
    sun.color = lin('#AFC0FF' if night else ('#FFD7B0' if t == 'sunset' else '#FFF1DE'))[:3]
    so = link(bpy.data.objects.new('sun', sun)); so.rotation_euler = (math.radians(50 if t != 'sunset' else 70), math.radians(-28), math.radians(-20))
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name != 'sun': o.data.energy *= (0.25 if night else 0.6)
    W, H = it.get('w', 780), it.get('h', 1560)
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
    return {'name': it['name'], 'perch': [round(p.x, 4), round(1 - p.y, 4)], 'unit_px': round((q.x - p.x) * W, 1), 'w': W, 'h': H}

def do_study(it, out, samples):
    """서재·책상(공부할 때 — 49 §6.1): 나무 책상 윗면이 받침(perch = 원점 z 0.66), 뒤 벽·창문·책·스탠드·머그·화분. 밤 = 창밖 남색 + 스탠드 불빛"""
    reset(); MATS.clear()
    sc = bpy.context.scene; sc.render.film_transparent = False
    night = it.get('time', 'study').endswith('-n')
    wall = vinyl('#EFE4D2' if not night else '#4A4558', 0.85, 0.05)
    bpy.ops.mesh.primitive_plane_add(size=1); w_ = bpy.context.active_object; w_.scale = (30, 20, 1); w_.rotation_euler = (math.radians(90), 0, 0); w_.location = (0, 6, 6); w_.data.materials.append(wall)
    floor = vinyl('#C9A77E' if not night else '#4C3E3A', 0.7, 0.05)
    bpy.ops.mesh.primitive_plane_add(size=60); f_ = bpy.context.active_object; f_.location = (0, 0, -1.2); f_.data.materials.append(floor)
    # 창문: 하늘빛(밤엔 남색 + 별 무늬 없이) 판 + 나무 틀 + 커튼
    winm = mat('win', '#BFE0F2' if not night else '#1E2A4A', rough=0.5, emis=('#D6ECF8' if not night else '#26345A', 0.45 if not night else 0.5))
    win = fused('window', [((0.9, 5.95, 3.4), (1.6, 0.02, 1.4))], winm, voxel=0.05, smooth_it=2)
    wood = vinyl('#B98B5E' if not night else '#7A5B44', 0.6, 0.05)
    for (x, z, sx, sz) in ((0.9, 2.0, 1.7, 0.07), (0.9, 4.8, 1.7, 0.07), (-0.75, 3.4, 0.07, 1.45), (2.55, 3.4, 0.07, 1.45), (0.9, 3.4, 0.04, 1.4)):
        fused('frame', [((x, 5.9, z), (sx, 0.06, sz))], wood, voxel=0.03, smooth_it=2)
    cur = vinyl('#E8B7A6' if not night else '#8A6A78', 0.85, 0.15)
    for x in (-1.1, 2.9): fused('curtain', [((x, 5.85, 3.3), (0.35, 0.08, 1.8))], cur, voxel=0.05, smooth_it=4)
    # 책상: 넓은 윗판(윗면 z = 0.62) + 앞 모서리 둥글게
    desk = vinyl('#C8955F' if not night else '#8E6847', 0.55, 0.06)
    fused('desk', [((0, 0.6, 0.47), (4.2, 2.4, 0.15))], desk, voxel=0.04, smooth_it=4)
    mat_ = vinyl('#8DB06C' if not night else '#4E6E58', 0.9, 0.08)
    fused('deskmat', [((0, -0.1, 0.63), (1.25, 0.9, 0.012))], mat_, voxel=0.02, smooth_it=3)
    # 책 더미 · 스탠드 · 머그 · 화분 · 연필꽂이
    for i, (c, h) in enumerate((('#7C8CC8', 0.12), ('#E2775F', 0.1), ('#F2CB6B', 0.11))):
        fused('book', [((-1.7, 1.3, 0.68 + i * 0.12), (0.6 - i * 0.04, 0.42, h / 2))], vinyl(c, 0.6, 0.05), voxel=0.02, smooth_it=2)
    for i, c in enumerate(('#5E8A59', '#D27F62', '#7C8CC8', '#E9B949', '#B9876E')):
        fused('spine', [((-2.3 + i * 0.16, 2.4, 1.05), (0.07, 0.3, 0.42))], vinyl(c, 0.6, 0.05), voxel=0.02, smooth_it=2)
    lampm = vinyl('#3E5470' if not night else '#2A3550', 0.4, 0.05)
    cyl('lampbase', (1.9, 1.5, 0.66), 0.28, 0.06, lampm)
    tube('lamparm', [Vector((1.9, 1.5, 0.66)), Vector((1.85, 1.45, 1.5)), Vector((1.45, 1.2, 2.0))], [0.035, 0.03, 0.03], lampm)
    sphere('shade', (1.3, 1.1, 1.92), (0.36, 0.36, 0.22), lampm, rot=(0, 0.6, 0))
    sphere('bulb', (1.2, 1.05, 1.78), (0.12,) * 3, mat('bulb', '#FFF2C8', emis=('#FFE7A8', 18.0 if night else 6.0)))
    mug = vinyl('#F4F1EA', 0.35, 0.1)
    cyl('mug', (-1.25, -0.5, 0.79), 0.16, 0.3, mug, bevel=0.15)
    cyl('cup', (1.45, -0.2, 0.8), 0.13, 0.34, vinyl('#E2775F', 0.5, 0.1), bevel=0.1)
    for k, c in enumerate(('#F2C14E', '#7C8CC8', '#5E8A59')):
        tube('pen', [Vector((1.4 + k * 0.05, -0.2, 0.9)), Vector((1.35 + k * 0.1, -0.22, 1.25))], [0.02, 0.02], vinyl(c, 0.5, 0.1), res=4, bres=2)
    cyl('pot', (-2.1, 0.9, 0.86), 0.3, 0.44, vinyl('#D27F62', 0.6, 0.08), bevel=0.15)
    for k in range(6):
        a = k / 6 * 2 * math.pi
        leaf('pl', Vector((-2.1, 0.9, 1.05)), a, 0.7, 0.22, vinyl('#6FA85A', 0.5, 0.15), tilt=1.2)
    lights(world='#F3EBDD' if not night else '#1A2036', strength=0.3 if not night else 0.08)
    if not night:
        sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.4; sun.angle = math.radians(10); sun.color = lin('#FFF1DE')[:3]
        so = link(bpy.data.objects.new('sun', sun)); so.rotation_euler = (math.radians(60), math.radians(15), math.radians(160))
    else:
        L = bpy.data.lights.new('lamp', 'POINT'); L.energy = 260; L.color = lin('#FFD9A0')[:3]; L.shadow_soft_size = 0.3
        lo = link(bpy.data.objects.new('lamp', L)); lo.location = (1.15, 1.0, 1.6)
        for o in bpy.data.objects:
            if o.type == 'LIGHT' and o.name in ('key', 'fill', 'rim'): o.data.energy *= 0.18
    W, H = it.get('w', 1170), it.get('h', 2340)
    cam = bpy.data.cameras.new('cam'); cam.lens = it.get('lens', 30)
    cam.dof.use_dof = True; cam.dof.focus_distance = 9.6; cam.dof.aperture_fstop = 2.8
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
    return {'name': it['name'], 'perch': [round(p.x, 4), round(1 - p.y, 4)], 'unit_px': round((q.x - p.x) * W, 1), 'w': W, 'h': H}

# ───────── 방 장식(10 §3.2.7) — 장면 위에 얹는 작은 3D 소품 ─────────
def do_decor(it, out, size, samples):
    reset(); MATS.clear(); BVH.clear()
    sc = bpy.context.scene; sc.render.film_transparent = True
    d = it['id']; objs = []
    if d == 'pot':
        objs.append(cyl('pot', (0, 0, 0.22), 0.26, 0.44, vinyl('#D27F62', 0.6, 0.08), bevel=0.15))
        objs.append(cyl('soil', (0, 0, 0.43), 0.23, 0.04, vinyl('#6E4A3A', 0.9, 0.05), bevel=0.2))
        for (x, z, c) in ((-0.1, 0.78, '#F7B6C6'), (0.12, 0.86, '#FBF5EA'), (0.0, 0.98, '#F2D27A')):
            objs.append(tube('st', [Vector((x * 0.5, 0, 0.44)), Vector((x, 0, z))], [0.018, 0.015], vinyl(LEAF, 0.5, 0.2)))
            objs += flower((x, -0.02, z), 0.1, c, '#F2C35B')
    elif d == 'fence':
        wm = vinyl('#C9A06A', 0.7, 0.05)
        for i in range(4):
            x = -0.6 + i * 0.4
            objs.append(fused('post', [((x, 0, 0.35), (0.07, 0.05, 0.35)), ((x, 0, 0.7), (0.07, 0.05, 0.07))], wm, voxel=0.015, smooth_it=4))
        for z in (0.25, 0.52):
            objs.append(fused('rail', [((0, -0.02, z), (0.78, 0.035, 0.05))], wm, voxel=0.015, smooth_it=4))
    elif d == 'mushlamp':
        objs.append(fused('stem', [((0, 0, 0.25), (0.11, 0.11, 0.26))], vinyl('#F4EAD8', 0.6, 0.2)))
        objs.append(fused('cap', [((0, 0, 0.55), (0.34, 0.34, 0.2))], mat('mcap', '#E2775F', rough=0.5, sss=0.4, emis=('#FFB08A', 0.6))))
        for k in range(5):
            a = k * 1.3
            objs.append(sphere('spot', (math.cos(a) * 0.2, math.sin(a) * 0.2 - 0.05, 0.64), (0.04, 0.04, 0.02), vinyl('#FFF5E6', 0.5, 0.1), seg=12))
        objs.append(sphere('glow', (0, 0, 0.4), (0.12,) * 3, mat('lg', '#FFE6A8', emis=('#FFE09A', 3.0))))
    elif d == 'butterfly':
        for sgn in (-1, 1):
            objs.append(fused('w', [((sgn * 0.2, 0, 0.62), (0.2, 0.03, 0.17), (0, sgn * 0.3, 0)), ((sgn * 0.15, 0, 0.42), (0.13, 0.03, 0.1))], vinyl('#F2A7BB', 0.45, 0.15), voxel=0.01, smooth_it=4))
        objs.append(fused('b', [((0, 0, 0.52), (0.04, 0.04, 0.16))], vinyl('#5E4B45', 0.5, 0.1)))
    elif d == 'ball':
        objs.append(sphere('ball', (0, 0, 0.26), (0.26,) * 3, banded('#F2CB6B', '#E2775F', [(0.4, 0.6)])))
    elif d == 'bunting':
        objs.append(tube('rope', [Vector((-0.8, 0, 0.9)), Vector((0, 0, 0.72)), Vector((0.8, 0, 0.9))], [0.012] * 3, vinyl('#8A6A4A', 0.6, 0.05)))
        for i, c in enumerate(['#E2775F', '#F2CB6B', '#7FB066', '#7C8CC8', '#F2A7BB']):
            x = -0.6 + i * 0.3; z = 0.9 - 0.18 * (1 - (x / 0.8) ** 2)
            me = bpy.data.meshes.new('fl'); bm_ = bmesh.new()
            vs = [bm_.verts.new(v) for v in [(x - 0.13, 0, z), (x + 0.13, 0, z), (x, 0, z - 0.3)]]
            bm_.faces.new(vs); bm_.to_mesh(me); bm_.free()
            fo = link(bpy.data.objects.new('fl', me)); fo.data.materials.append(vinyl(c, 0.6, 0.1))
            md = fo.modifiers.new('s', 'SOLIDIFY'); md.thickness = 0.02; smooth(fo, 1); objs.append(fo)
        for sgn in (-1, 1): objs.append(tube('pole', [Vector((sgn * 0.82, 0, 0)), Vector((sgn * 0.82, 0, 0.95))], [0.025, 0.022], vinyl('#B08A5E', 0.6, 0.05)))
    elif d == 'tent':
        tm = vinyl('#F2E3C2', 0.75, 0.1)
        me = bpy.data.meshes.new('tent'); bm_ = bmesh.new()
        v = [bm_.verts.new(p) for p in [(-0.55, -0.4, 0), (0.55, -0.4, 0), (0, -0.4, 0.8), (-0.55, 0.5, 0), (0.55, 0.5, 0), (0, 0.5, 0.8)]]
        for f in ((0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2)): bm_.faces.new([v[i] for i in f])
        bm_.to_mesh(me); bm_.free()
        to = link(bpy.data.objects.new('tent', me)); to.data.materials.append(tm)
        md = to.modifiers.new('bv', 'BEVEL'); md.width = 0.04; md.segments = 3; objs.append(to)
        me = bpy.data.meshes.new('door'); bm_ = bmesh.new()
        vs = [bm_.verts.new(p) for p in [(-0.2, -0.41, 0), (0.2, -0.41, 0), (0, -0.41, 0.5)]]; bm_.faces.new(vs); bm_.to_mesh(me); bm_.free()
        do = link(bpy.data.objects.new('door', me)); do.data.materials.append(vinyl('#6E5A50', 0.8, 0.0)); objs.append(do)
        objs.append(sphere('flag', (0, 0.05, 0.86), (0.05, 0.05, 0.05), vinyl('#E2775F', 0.5, 0.1), seg=12))
    elif d == 'firefly':
        random.seed(3)
        for i in range(6):
            # 작은 노란 불빛 + 옅은 날개(낮 장면에서 흰 공처럼 보이지 않게)
            c = (random.uniform(-0.5, 0.5), random.uniform(-0.2, 0.2), random.uniform(0.2, 0.9))
            objs.append(sphere('ff', c, (0.022,) * 3, mat('ff', '#F2C94C', rough=0.3, sss=0.2, emis=('#F5D76E', 2.5)), seg=10))
            objs.append(sphere('ffb', (c[0] + 0.03, c[1], c[2]), (0.02, 0.012, 0.012), vinyl('#5E4B45', 0.5, 0.1), seg=8))
    elif d == 'arch':
        am = vinyl('#7FB066', 0.6, 0.15)
        pts = [Vector((-0.6, 0, 0)), Vector((-0.6, 0, 0.7)), Vector((0, 0, 1.15)), Vector((0.6, 0, 0.7)), Vector((0.6, 0, 0))]
        objs.append(tube('arch', pts, [0.05] * 5, am))
        cols = ['#F7B6C6', '#FBF5EA', '#F2D27A']
        for i in range(11):
            t_ = i / 10; a = math.pi * (1 - t_)
            p = Vector((math.cos(a) * 0.6, -0.04, 0.55 + math.sin(a) * 0.55 if 0.15 < t_ < 0.85 else 0.3 + 0.4 * (1 - abs(t_ - 0.5) * 2)))
            objs += flower(p, 0.08, cols[i % 3], '#F2C35B')
    catcher(); lights()
    lo, hi = bbox(objs)
    s = max(hi.z / 0.8, max(abs(lo.x), abs(hi.x)) * 2 / 0.86)
    camera((0, 0, -s * 0.1 + s * 0.5), s, w=size, h=size)
    render(os.path.join(out, it['name'] + '.png'), samples)
    return {'name': it['name'], 'h': round(hi.z, 3), 'w': round(hi.x - lo.x, 3)}

def main():
    job = json.load(open(ARGS[0]))
    out = job['out']; os.makedirs(out, exist_ok=True)
    mp = os.path.join(out, job.get('meta', 'meta.json'))
    old = json.load(open(mp)) if os.path.exists(mp) else {}
    for it in job['items']:
        if job.get('skip_existing') and old.get('@' + it['name']):
            print('SKIP', it['name'], flush=True); continue
        k = it.get('kind', 'char')
        if k == 'char': m = do_char(it, out, job.get('size', 640), job.get('samples', 64))
        elif k == 'seed': m = do_seed(it, out, it.get('size', job.get('size', 320)), job.get('samples', 48))
        elif k == 'scene': m = do_scene(it, out, job.get('samples', 64))
        elif k == 'decor': m = do_decor(it, out, it.get('size', 320), job.get('samples', 48))
        for mm in (m if isinstance(m, list) else [m] if m else []):
            old[mm['name']] = mm
        old['@' + it['name']] = True
        json.dump(old, open(mp, 'w'), ensure_ascii=False, indent=1)
        print('DONE', it.get('name'), flush=True)

if __name__ == '__main__':
    main()
