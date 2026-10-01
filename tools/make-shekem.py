# Builds a small IDF canteen stall, in metres, and writes assets/models/shekem.glb.
import bpy
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'models', 'shekem.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
col = bpy.context.collection

def mat(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m

def assign(obj, m):
    obj.data.materials.append(m)

def box(name, loc, size, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    assign(o, m)
    return o

def cyl(name, loc, radius, depth, m, verts=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    o = bpy.context.active_object
    o.name = name
    assign(o, m)
    return o

wood = mat('wood', (0.38, 0.24, 0.12), 0.75)
olive = mat('olive', (0.28, 0.33, 0.18), 0.7)
canvas = mat('canvas', (0.22, 0.30, 0.18), 0.9)
steel = mat('steel', (0.55, 0.56, 0.54), 0.35, 0.7)
tin = mat('tin', (0.75, 0.76, 0.72), 0.3, 0.55)
juice = mat('juice', (0.72, 0.28, 0.12), 0.4)
soda = mat('soda', (0.1, 0.32, 0.22), 0.35, 0.1)
white = mat('white', (0.9, 0.88, 0.8), 0.5)
signc = mat('sign', (0.12, 0.16, 0.1), 0.6)
gold = mat('gold', (0.78, 0.64, 0.28), 0.4, 0.3)

# Counter body and top. Blender Z is up, Y is the customer direction (+Y = front).
box('counter', (0, 0, 0.52), (2.4, 0.78, 1.0), wood)
box('front', (0, 0.38, 0.55), (2.28, 0.04, 0.86), olive)
box('stripe', (0, 0.41, 0.95), (2.3, 0.02, 0.06), white)
box('top', (0, 0, 1.04), (2.5, 0.86, 0.05), steel)
box('shelf', (0, -0.02, 0.28), (2.15, 0.55, 0.04), wood)
for x in (-0.7, 0.45):
    box(f'crate{x}', (x, -0.02, 0.42), (0.38, 0.3, 0.22), olive)

# Frame and a sagging canvas roof.
for x, y in ((-1.15, 0.35), (1.15, 0.35), (-1.15, -0.35), (1.15, -0.35)):
    cyl(f'leg{x}{y}', (x, y, 1.15), 0.035, 2.2, steel)
for i in range(6):
    t = i / 5
    z = 2.22 - math.sin(t * math.pi) * 0.06
    y = -0.45 + t * 1.15
    o = box(f'awn{i}', (0, y, z), (2.55, 0.26, 0.02), canvas if i % 2 == 0 else olive)
    o.rotation_euler[0] = (0.5 - t) * 0.18
box('hem', (0, 0.78, 2.02), (2.5, 0.04, 0.1), white)

def bottle(name, x, y, color):
    cyl(name, (x, y, 1.18), 0.04, 0.2, color, 8)
    cyl(name + 'n', (x, y, 1.3), 0.016, 0.06, color, 8)
    cyl(name + 'c', (x, y, 1.34), 0.018, 0.02, steel, 8)

bottle('b0', -0.85, 0.05, juice)
bottle('b1', -0.7, -0.1, soda)
bottle('b2', -0.55, 0.08, juice)
for i, x in enumerate((-0.15, -0.05, 0.05, 0.15)):
    cyl(f'can{i}', (x, 0.0, 1.12), 0.035, 0.12, tin, 10)
box('tray', (0.7, 0.0, 1.14), (0.4, 0.28, 0.1), olive)

# Sign facing the customers (+Y).
box('sign', (0, 0.48, 1.86), (1.55, 0.04, 0.46), signc)
bpy.ops.object.text_add(location=(0, 0.52, 1.86))
txt = bpy.context.active_object
txt.data.body = 'SHEKEM'
txt.data.align_x = 'CENTER'
txt.data.align_y = 'CENTER'
txt.data.size = 0.16
txt.data.extrude = 0.012
txt.rotation_euler = (math.pi / 2, 0, 0)
assign(txt, gold)
bpy.ops.object.convert(target='MESH')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
)
print('wrote', OUT)
