"""Bake Unity Apocalypse FBX clips as glTF morph frames for the browser trial."""
import bpy
import gzip
import inspect
import json
import sys
import textwrap
from pathlib import Path
from mathutils import Matrix
import io_scene_fbx.import_fbx as fbx_import

# Blender 5.2 importer assumes every legacy Max mesh has an armature_setup.
source = textwrap.dedent(inspect.getsource(fbx_import.FbxImportHelperNode.link_hierarchy))
source = source.replace('(mmat, amat) = mesh.armature_setup[self]', 'if self not in mesh.armature_setup: continue\n                (mmat, amat) = mesh.armature_setup[self]')
namespace = dict(fbx_import.__dict__)
exec(source, namespace)
fbx_import.FbxImportHelperNode.link_hierarchy = namespace['link_hierarchy']

root, dest = map(Path, sys.argv[-2:])
asset = root / 'Assets/Apocalypse_(pack)/Characters/Character_Apocalypse'
animation = asset / 'Animation'
clips = {
    'idle': animation / 'Character@Idle_Weapons_Up.FBX',
    'runForward': animation / 'Move_the_character/Character@Run_weapons_Up.FBX',
    'runBack': animation / 'Move_the_character/Character@Run_Back_Weapons_Up.FBX',
    'runLeft': animation / 'Move_the_character/Character@Run_Left_Weapons_Up.FBX',
    'runRight': animation / 'Move_the_character/Character@Run_Right_Weapons_Up.FBX',
    'walkForward': animation / 'Move_the_character/Character@Walk_weapons_up.FBX',
    'jump': animation / 'Character@Jump.FBX',
    # The pack has no dedicated slide. Its armed crouch walk provides the low
    # moving pose used while the browser game's slide physics are active.
    'slide': animation / 'Move_the_character/Character@Walk_Sit_weapons_Up.FBX',
    'shoot': animation / 'Character@shooting.FBX',
    'reload': animation / 'Character@recharge.FBX',
}
keep_names = {'Backpack_mesh', 'Body_mesh', 'Eyes_mesh', 'Gaz_mask_mesh001', 'Hood_mesh', 'Object', 'Object001'}
deform_names = {'Backpack_mesh', 'Body_mesh', 'Hood_mesh'}
bpy.ops.wm.read_factory_settings(use_empty=True)

def import_clip(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path))
    imported = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in imported if o.type == 'ARMATURE')
    # Prefer exact names: Object and Object001 are distinct source parts.
    meshes = {name: next((o for o in imported if o.type == 'MESH' and o.name == name), None)
              or next((o for o in imported if o.type == 'MESH' and o.name.startswith(name + '.')), None)
              for name in keep_names}
    return imported, rig, meshes

initial, initial_rig, initial_meshes = import_clip(clips['idle'])
bpy.context.scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()
result_meshes = {}
for name in keep_names:
    obj = initial_meshes[name]
    if obj is None: raise RuntimeError(f'Missing {name} in idle clip')
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    result = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(result)
    result.matrix_world = obj.matrix_world.copy()
    if name in deform_names: result.shape_key_add(name='Basis')
    result_meshes[name] = result

texture = asset / 'Textures/Postapocalyptic_Textures/Postapokalipsis_Albedo.tga'
image = bpy.data.images.load(str(texture))
image.scale(1024, 1024)
image.filepath_raw = str(dest.parent / 'human-animated-albedo.jpg')
image.file_format = 'JPEG'
image.save()
material = bpy.data.materials.new('GunRun human suit')
material.use_nodes = True
node = material.node_tree.nodes.new('ShaderNodeTexImage')
node.image = image
bsdf = material.node_tree.nodes.get('Principled BSDF')
material.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = .86
for obj in result_meshes.values():
    obj.data.materials.clear()
    obj.data.materials.append(material)

for obj in initial:
    bpy.data.objects.remove(obj, do_unlink=True)

metadata = {}
grips = {}
for clip_name, clip_path in clips.items():
    imported, rig, meshes = import_clip(clip_path)
    action = rig.animation_data.action if rig.animation_data else None
    if not action: raise RuntimeError(f'No armature animation: {clip_path}')
    start, end = action.frame_range
    start = max(0, int(start))
    end = int(end)
    # Keep the on-demand download small; the GPU interpolates between samples.
    target = {'idle': 10, 'walkForward': 8, 'jump': 10, 'slide': 8, 'shoot': 10, 'reload': 12}.get(clip_name, 6)
    frames = sorted({round(start + (end - start) * i / (target - 1)) for i in range(target)})
    metadata[clip_name] = {'frames': [], 'times': [], 'duration': (end - start) / 30, 'source': clip_path.name}
    grips[clip_name] = []
    root_bone = rig.pose.bones.get('CATRigHub001')
    if not root_bone: raise RuntimeError(f'No pelvis root: {clip_name}')
    bpy.context.scene.frame_set(frames[0])
    root_anchor = rig.matrix_world @ root_bone.matrix.translation
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        root_offset = (rig.matrix_world @ root_bone.matrix.translation) - root_anchor
        key_name = f'{clip_name}_{frame:03d}'
        for name in deform_names:
            src = meshes[name]
            dst = result_meshes[name]
            eval_mesh = src.evaluated_get(depsgraph).to_mesh()
            if len(eval_mesh.vertices) != len(dst.data.vertices):
                raise RuntimeError(f'Topology changed: {clip_name} {name} {frame}')
            key = dst.shape_key_add(name=key_name)
            key.value = 0.0
            inverse = dst.matrix_world.inverted()
            matrix = inverse @ Matrix.Translation(-root_offset) @ src.matrix_world
            for index, vertex in enumerate(eval_mesh.vertices):
                key.data[index].co = matrix @ vertex.co
            src.evaluated_get(depsgraph).to_mesh_clear()
        hand = rig.pose.bones.get('CATRigRArmPalm')
        if not hand: raise RuntimeError(f'No right hand: {clip_name}')
        pos = (rig.matrix_world @ hand.matrix.translation) - root_offset
        # Blender is Z-up; the glTF exporter converts this to Y-up.
        grips[clip_name].append([round(pos.x, 5), round(pos.z, 5), round(-pos.y, 5)])
        metadata[clip_name]['frames'].append(key_name)
        metadata[clip_name]['times'].append(round((frame - start) / 30, 5))
    print('CLIP', clip_name, 'range', tuple(action.frame_range), 'samples', len(frames), 'grip', grips[clip_name][0])
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)

for obj in bpy.data.objects:
    obj.select_set(obj in result_meshes.values())
bpy.context.view_layer.objects.active = result_meshes['Body_mesh']
bpy.ops.export_scene.gltf(filepath=str(dest), export_format='GLB', use_selection=True,
    export_animations=False, export_image_format='JPEG', export_texcoords=True,
    export_normals=True, export_tangents=False, export_yup=True, export_morph=True,
    export_morph_normal=False)
dest.with_suffix('.json').write_text(json.dumps({'clips': metadata, 'grips': grips}, separators=(',', ':')))
compressed = dest.with_suffix(dest.suffix + '.gz')
with dest.open('rb') as source_file, compressed.open('wb') as raw_file:
    with gzip.GzipFile(fileobj=raw_file, mode='wb', compresslevel=9, mtime=0) as gzip_file:
        gzip_file.write(source_file.read())
(dest.parent / 'human-animated-albedo.jpg').unlink(missing_ok=True)
print('EXPORTED', compressed, compressed.stat().st_size, dest.with_suffix('.json').stat().st_size)
dest.unlink()
