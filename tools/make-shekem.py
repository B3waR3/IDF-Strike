# A field canteen stall, in metres. Front is +Y. Writes assets/models/shekem.glb.
import bpy
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'models', 'shekem.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, color, rough=0.55, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    if 'Metallic' in b.inputs:
        b.inputs['Metallic'].default_value = metal
    return m

def assign(obj, m):
    if obj.data.materials:
        obj.data.materials[0] = m
    else:
        obj.data.materials.append(m)

def finish(obj, m):
    assign(obj, m)
    bpy.ops.object.shade_flat()
    return obj

def box(name, loc, size, m, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new('b', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o, m)

def cyl(name, loc, radius, depth, m, verts=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    return finish(o, m)

wood = mat('wood', (0.42, 0.28, 0.16), 0.72)
wood_dark = mat('wood_dark', (0.28, 0.17, 0.09), 0.8)
olive = mat('olive', (0.34, 0.38, 0.24), 0.65)
canvas = mat('canvas', (0.55, 0.58, 0.5), 0.92)
steel = mat('steel', (0.62, 0.63, 0.6), 0.28, 0.85)
alu = mat('alu', (0.78, 0.79, 0.76), 0.22, 0.7)
tin = mat('tin', (0.8, 0.81, 0.78), 0.25, 0.6)
juice = mat('juice', (0.62, 0.22, 0.1), 0.35)
soda = mat('soda', (0.08, 0.28, 0.18), 0.3, 0.05)
cream = mat('cream', (0.86, 0.82, 0.7), 0.45)
sign_bg = mat('sign', (0.16, 0.2, 0.13), 0.55)
gold = mat('gold', (0.93, 0.86, 0.62), 0.35, 0.25)
glass = mat('glass', (0.75, 0.82, 0.78), 0.05, 0.0)

# Base and counter. +Y is the customer side.
box('plinth', (0, 0, 0.06), (2.35, 0.95, 0.12), wood_dark, 0.01)
box('body', (0, -0.02, 0.58), (2.2, 0.82, 0.9), wood, 0.008)
box('front_panel', (0, 0.4, 0.55), (2.05, 0.03, 0.72), olive, 0.004)
box('countertop', (0, 0.02, 1.06), (2.32, 0.92, 0.045), alu, 0.004)
box('lip', (0, 0.46, 1.02), (2.28, 0.03, 0.08), steel)
# Drawer fronts
for i, x in enumerate((-0.72, 0, 0.72)):
    box(f'drawer{i}', (x, 0.42, 0.42), (0.58, 0.02, 0.22), wood_dark, 0.003)
# Back wall and side returns, open at the front so the seller is visible.
box('back', (0, -0.42, 1.15), (2.2, 0.04, 1.15), wood)
box('side_l', (-1.1, -0.05, 1.25), (0.04, 0.7, 1.3), wood)
box('side_r', (1.1, -0.05, 1.25), (0.04, 0.7, 1.3), wood)

# Posts and a fabric roof with a real slope, plus a short valance.
for x in (-1.12, 1.12):
    cyl(f'post{x}', (x, 0.15, 1.7), 0.028, 1.35, steel)
for i in range(8):
    t = i / 7
    y = -0.55 + t * 1.25
    z = 2.42 - (t - 0.15) ** 2 * 0.22
    panel = box(f'roof{i}', (0, y, z), (2.4, 0.2, 0.018), canvas)
    panel.rotation_euler[0] = (0.35 - t) * 0.35
box('valance', (0, 0.72, 2.18), (2.36, 0.02, 0.16), olive)
box('valance_w', (0, 0.73, 2.08), (2.3, 0.015, 0.035), cream)

# Glass guard
guard = box('guard', (0, 0.28, 1.22), (1.5, 0.012, 0.22), glass)

def bottle(name, x, y, color, h=0.18):
    cyl(name, (x, y, 1.08 + h * 0.5), 0.032, h, color, 12)
    cyl(name + 'n', (x, y, 1.08 + h + 0.025), 0.012, 0.05, color, 8)
    cyl(name + 'c', (x, y, 1.08 + h + 0.055), 0.014, 0.018, steel, 8)

bottle('b0', -0.72, 0.08, juice, 0.2)
bottle('b1', -0.58, -0.02, soda, 0.16)
bottle('b2', -0.45, 0.1, juice, 0.18)
for i, x in enumerate((-0.12, -0.02, 0.08, 0.18)):
    cyl(f'can{i}', (x, 0.02, 1.14), 0.028, 0.11, tin, 12)
box('pack', (0.55, 0.0, 1.14), (0.28, 0.18, 0.08), cream, 0.004)
box('tray', (0.82, -0.05, 1.12), (0.22, 0.16, 0.06), olive, 0.003)

# Sign. Glyph fronts face +Y (the customers). The previous +90° X rotation showed the back of the letters.
box('signboard', (0, 0.46, 1.72), (1.35, 0.025, 0.38), sign_bg, 0.004)
bpy.ops.object.text_add(location=(0, 0.49, 1.72))
txt = bpy.context.active_object
txt.data.body = 'SHEKEM'
txt.data.align_x = 'CENTER'
txt.data.align_y = 'CENTER'
txt.data.size = 0.13
txt.data.extrude = 0.008
txt.data.bevel_depth = 0.002
txt.rotation_euler = (-math.pi / 2, 0, 0)
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
