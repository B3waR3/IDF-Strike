import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const b = getBounds(scene);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  const tex = root.listTextures().map(t => `${t.getName() || '?'}:${t.getSize()?.join('x')}`);
  const skins = root.listSkins().map(s => s.listJoints().length);
  const joints = root.listSkins()[0]?.listJoints().map(j => j.getName()) ?? [];
  console.log(`\n### ${file}`);
  console.log(`size ${size} min ${b.min.map(v => v.toFixed(2))} tris ${tris} meshes ${root.listMeshes().length} mats ${root.listMaterials().length} skins ${skins} anims ${root.listAnimations().map(a => a.getName())}`);
  console.log(`materials: ${root.listMaterials().map(m => m.getName()).join(', ')}`);
  console.log(`textures(${tex.length}): ${tex.join(' ')}`);
  if (joints.length) console.log(`joints: ${joints.join(' ')}`);
  if (process.env.NODES) root.listNodes().forEach(n => console.log('  node', n.getName(), n.getMesh() ? 'mesh' : '', n.getTranslation().map(v => v.toFixed(2)), n.getScale().map(v => v.toFixed(3))));
}
