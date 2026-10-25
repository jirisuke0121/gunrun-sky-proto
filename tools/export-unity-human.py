"""Convert the Unity challenge human into a small locally reviewable GLB."""
import bpy, sys, inspect, textwrap
from pathlib import Path
import io_scene_fbx.import_fbx as fbx_import

source = textwrap.dedent(inspect.getsource(fbx_import.FbxImportHelperNode.link_hierarchy))
source = source.replace('(mmat, amat) = mesh.armature_setup[self]', 'if self not in mesh.armature_setup: continue\n                (mmat, amat) = mesh.armature_setup[self]')
namespace = dict(fbx_import.__dict__)
exec(source, namespace)
fbx_import.FbxImportHelperNode.link_hierarchy = namespace['link_hierarchy']

root, dest = map(Path, sys.argv[-2:])
asset = root / 'Assets/Apocalypse_(pack)/Characters/Character_Apocalypse'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(asset / 'Animation/Character@Idle_Weapons_Up.FBX'))
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
hand = rig.pose.bones.get('CATRigRArmPalm')
grip = bpy.data.objects.new('GunRunRightHandGrip', None)
bpy.context.collection.objects.link(grip)
bpy.context.scene.frame_set(1)
if hand:
    grip.matrix_world = rig.matrix_world @ hand.matrix

textures = asset / 'Textures/Postapocalyptic_Textures'
image = bpy.data.images.load(str(textures / 'Postapokalipsis_Albedo.tga'))
image.scale(1024, 1024)
image.filepath_raw = str(dest.parent / 'human-albedo.jpg')
image.file_format = 'JPEG'
image.save()
mat = bpy.data.materials.new('GunRun human suit')
mat.use_nodes = True
tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
bsdf = mat.node_tree.nodes.get('Principled BSDF')
mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = .86
for mesh in meshes:
    if mesh.name in {'Gun_mesh','Hook_mesh','Shop_mesh','Shutter_mesh','Flashlight_mesh'}:
        bpy.data.objects.remove(mesh, do_unlink=True)
    else:
        mesh.data.materials.clear()
        mesh.data.materials.append(mat)

# Bake the armed pose. Blender 5's FBX glTF conversion loses this legacy
# Max rig's bind matrix, so an animated skin lands outside the camera frustum.
# A baked mesh keeps the exact Unity source silhouette and texture.
bpy.context.scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()
baked_objects = []
for obj in [o for o in bpy.data.objects if o.type == 'MESH']:
    evaluated = obj.evaluated_get(depsgraph)
    baked = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    result = bpy.data.objects.new(obj.name, baked)
    bpy.context.collection.objects.link(result)
    result.matrix_world = obj.matrix_world.copy()
    baked_objects.append(result)
for obj in list(bpy.data.objects):
    if obj not in baked_objects and obj != grip:
        bpy.data.objects.remove(obj, do_unlink=True)
for obj in bpy.data.objects:
    obj.select_set(obj in baked_objects or obj == grip)
bpy.context.view_layer.objects.active = baked_objects[0]
bpy.ops.export_scene.gltf(filepath=str(dest), export_format='GLB', use_selection=True,
    export_animations=False, export_image_format='JPEG', export_texcoords=True,
    export_normals=True, export_tangents=False, export_yup=True)
print('EXPORTED',dest,dest.stat().st_size)
(dest.parent / 'human-albedo.jpg').unlink(missing_ok=True)
