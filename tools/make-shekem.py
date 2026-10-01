# Field canteen in metres. The customer stands on +Y. Writes assets/models/shekem.glb.
import bpy
import bmesh
import math
import mathutils
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'models', 'shekem.glb')
PREVIEW = os.path.join(ROOT, 'tools', 'shekem-preview.png')

bpy.ops.wm.read_factory_settings(use_empty=True)

def image(name, w, h, paint):
    img = bpy.data.images.new(name, w, h)
    px = [0.0] * (w * h * 4)
    paint(px, w, h)
    img.pixels.foreach_set(px)
    img.pack()
    return img

def wood_px(px, w, h):
    for y in range(h):
        for x in range(w):
            seam = 0.55 if (x % 32) < 2 else 1.0
            grain = 0.42 + 0.16 * math.sin(x * 0.55 + math.sin(y * 0.08) * 3.0)
            dirt = 0.08 * math.sin(y * 0.2) * math.sin(x * 0.05)
            g = max(0.12, min(0.7, (grain - dirt) * seam))
            i = (y * w + x) * 4
            px[i] = g * 0.62
            px[i + 1] = g * 0.42
            px[i + 2] = g * 0.24
            px[i + 3] = 1

def paint_px(px, w, h):
    for y in range(h):
        for x in range(w):
            wear = 0.08 * math.sin(x * 0.11) * math.sin(y * 0.07)
            chip = 1.0
            if (x * 13 + y * 7) % 97 == 0:
                chip = 1.35
            plank = 0.82 if (x % 28) < 2 else 1.0
            g = max(0.2, min(0.85, (0.46 + wear) * chip * plank))
            i = (y * w + x) * 4
            px[i] = g * 0.45
            px[i + 1] = g * 0.48
            px[i + 2] = g * 0.28
            px[i + 3] = 1

def metal_px(px, w, h):
    for y in range(h):
        for x in range(w):
            v = 0.42 + 0.06 * math.sin(x * 0.4) + 0.03 * math.sin(y * 0.9)
            if (y * 5 + x) % 41 == 0:
                v += 0.12
            if (x + y) % 53 == 0:
                v -= 0.08
            v = max(0.15, min(0.75, v))
            i = (y * w + x) * 4
            px[i] = v * 0.92
            px[i + 1] = v * 0.94
            px[i + 2] = v * 0.9
            px[i + 3] = 1

def rust_px(px, w, h):
    for y in range(h):
        for x in range(w):
            v = 0.28 + 0.08 * math.sin(x * 0.3 + y * 0.2)
            i = (y * w + x) * 4
            px[i] = v * 0.85
            px[i + 1] = v * 0.55
            px[i + 2] = v * 0.32
            px[i + 3] = 1

def tex_mat(name, img, rough, metal):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    if 'Metallic' in bsdf.inputs:
        bsdf.inputs['Metallic'].default_value = metal
    return m

def flat(name, color, rough=0.55, metal=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    if 'Metallic' in b.inputs:
        b.inputs['Metallic'].default_value = metal
    if alpha < 1 and 'Alpha' in b.inputs:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else m.blend_method
    return m

wood = tex_mat('wood', image('wood', 128, 256, wood_px), 0.82, 0.0)
paint = tex_mat('paint', image('paint', 128, 128, paint_px), 0.72, 0.02)
metal = tex_mat('metal', image('metal', 128, 64, metal_px), 0.38, 0.72)
rust = tex_mat('rust', image('rust', 64, 64, rust_px), 0.7, 0.35)
canvas = flat('canvas', (0.55, 0.5, 0.38), 0.92)
cream = flat('cream', (0.78, 0.74, 0.62), 0.6)
juice = flat('juice', (0.45, 0.12, 0.06), 0.28)
soda = flat('soda', (0.08, 0.28, 0.16), 0.25, 0.15)
glass = flat('glass', (0.75, 0.82, 0.78), 0.05, 0.0, 0.35)
dark = flat('dark', (0.07, 0.06, 0.05), 0.8)
rubber = flat('rubber', (0.04, 0.04, 0.035), 0.9)

def box(name, loc, size, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    return o

def cyl(name, loc, radius, depth, m, verts=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return o

def mesh_from(name, bm, m):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o

# Steel frame. No bevels: edges stay sharp. Tall enough that the sign clears a standing soldier.
for x, y in ((-1.2, -0.62), (1.2, -0.62), (-1.2, 0.62), (1.2, 0.62)):
    cyl(f'post{x}{y}', (x, y, 1.42), 0.028, 2.84, rust, 8)
box('railF', (0, 0.62, 2.82), (2.4, 0.03, 0.03), rust)
box('railB', (0, -0.62, 2.82), (2.4, 0.03, 0.03), rust)
box('railL', (-1.2, 0.0, 2.82), (0.03, 1.27, 0.03), rust)
box('railR', (1.2, 0.0, 2.82), (0.03, 1.27, 0.03), rust)

# Cabinet and counter stay on the street side, leaving a standing bay behind them.
box('deck', (0, 0.02, 0.04), (2.4, 1.28, 0.08), dark)
box('carcass', (0, 0.4, 0.48), (2.15, 0.36, 0.8), wood)
for i, x in enumerate((-0.72, 0.0, 0.72)):
    box(f'door{i}', (x, 0.59, 0.46), (0.62, 0.018, 0.68), paint)
    cyl(f'handle{i}', (x + 0.22, 0.62, 0.46), 0.012, 0.16, metal, 8, (math.pi / 2, 0, 0))

box('counter', (0, 0.42, 0.92), (2.28, 0.42, 0.028), metal)
box('lip', (0, 0.62, 0.89), (2.24, 0.02, 0.055), metal)

# Back wall sits behind the seller. Side walls frame the booth without crossing the bay.
box('back', (0, -0.6, 1.85), (2.24, 0.02, 1.9), wood)
for i, x in enumerate((-0.55, 0.55)):
    box(f'backplank{i}', (x, -0.585, 1.85), (0.9, 0.012, 1.7), paint)
box('sideL', (-1.16, 0.0, 1.7), (0.02, 1.2, 1.5), wood)
box('sideR', (1.16, 0.0, 1.7), (0.02, 1.2, 1.5), wood)

# Corrugated roof, sloping down toward the street.
bm = bmesh.new()
nx, ny = 60, 10
grid = []
for iy in range(ny + 1):
    row = []
    fy = iy / ny
    y = -0.75 + fy * 1.7
    for ix in range(nx + 1):
        fx = ix / nx
        x = -1.32 + fx * 2.64
        z = 2.78 - fy * 0.06 + 0.028 * math.sin(ix * math.pi * 2 * 7 / nx)
        row.append(bm.verts.new((x, y, z)))
    grid.append(row)
for iy in range(ny):
    for ix in range(nx):
        bm.faces.new((grid[iy][ix], grid[iy][ix + 1], grid[iy + 1][ix + 1], grid[iy + 1][ix]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh_from('roof', bm, metal)

# Canvas awning, sagging between the front posts.
bm = bmesh.new()
nx, ny = 24, 6
grid = []
for iy in range(ny + 1):
    row = []
    fy = iy / ny
    y = 0.62 + fy * 0.55
    sag = math.sin(fy * math.pi) * 0.06
    for ix in range(nx + 1):
        fx = ix / nx
        x = -1.22 + fx * 2.44
        edge = math.sin(fx * math.pi)
        z = 2.72 - fy * 0.2 - sag * edge
        row.append(bm.verts.new((x, y, z)))
    grid.append(row)
for iy in range(ny):
    for ix in range(nx):
        bm.faces.new((grid[iy][ix], grid[iy][ix + 1], grid[iy + 1][ix + 1], grid[iy + 1][ix]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh_from('awning', bm, canvas)

# Painted board, then raised letters. Text lies in XY; a +90 X rotation turns it toward
# the street, and the 180 Z turn puts the first letter on the customer's left.
box('signback', (0, 0.4, 2.45), (1.5, 0.016, 0.24), dark)
bpy.ops.object.text_add(location=(0, 0.42, 2.45))
letters = bpy.context.active_object
letters.data.body = 'SHEKEM'
letters.data.align_x = 'CENTER'
letters.data.align_y = 'CENTER'
letters.data.size = 0.12
letters.data.extrude = 0.008
letters.data.space_character = 1.02
letters.rotation_euler = (math.pi / 2, 0, math.pi)
letters.data.materials.append(cream)
bpy.context.view_layer.objects.active = letters
bpy.ops.object.convert(target='MESH')

def bottle(name, x, y, color, h):
    base = 0.95
    cyl(name + 'b', (x, y, base + h * 0.32), 0.034, h * 0.64, color, 12)
    cyl(name + 's', (x, y, base + h * 0.72), 0.022, h * 0.16, color, 10)
    cyl(name + 'n', (x, y, base + h * 0.9), 0.012, h * 0.22, color, 8)
    cyl(name + 'c', (x, y, base + h + 0.02), 0.014, 0.02, metal, 8)

bottle('b0', -0.85, 0.32, juice, 0.22)
bottle('b1', -0.72, 0.22, soda, 0.18)
bottle('b2', -0.58, 0.34, juice, 0.2)
bottle('b3', -0.46, 0.24, soda, 0.16)
for i, x in enumerate((-0.22, -0.12, -0.02, 0.08)):
    cyl(f'can{i}', (x, 0.28, 1.0), 0.024, 0.11, metal, 10)
box('tray', (0.48, 0.3, 0.95), (0.42, 0.22, 0.012), metal)
box('pack', (0.45, 0.28, 0.99), (0.22, 0.14, 0.06), cream)
box('pack2', (0.55, 0.32, 1.05), (0.18, 0.12, 0.05), paint)
# Crate on the ground beside the stall, toward the street.
box('crate', (1.45, 0.35, 0.16), (0.32, 0.28, 0.32), wood)
box('crate2', (1.48, 0.32, 0.46), (0.28, 0.24, 0.26), wood)
# Feet mark for the seller. A tiny mesh so the exporter keeps the node; the game removes it.
bpy.ops.mesh.primitive_cube_add(size=0.04, location=(0, -0.16, 0.2))
mark = bpy.context.active_object
mark.name = 'seller'

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
)

world = bpy.data.worlds.new('preview')
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
bg.inputs[0].default_value = (0.62, 0.68, 0.74, 1)
bg.inputs[1].default_value = 0.8
bpy.ops.object.light_add(type='SUN', location=(2, 6, 8))
bpy.context.active_object.data.energy = 4
bpy.context.active_object.rotation_euler = (0.7, 0.2, 0.5)
bpy.ops.object.camera_add(location=(1.15, 4.6, 1.85))
cam = bpy.context.active_object
direction = mathutils.Vector((0, 0.05, 1.45)) - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene = bpy.context.scene
scene.camera = cam
scene.render.resolution_x = 960
scene.render.resolution_y = 640
scene.render.filepath = PREVIEW
scene.render.engine = 'BLENDER_EEVEE'
bpy.ops.render.render(write_still=True)
print('wrote', OUT)
