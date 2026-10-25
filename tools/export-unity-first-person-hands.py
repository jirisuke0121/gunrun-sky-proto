"""Bake the authorized Unity character's gripping hands for the viewmodel rig."""
import bpy, bmesh, inspect, sys, textwrap
from pathlib import Path
from mathutils import Matrix, Vector
import io_scene_fbx.import_fbx as fbx_import

source=textwrap.dedent(inspect.getsource(fbx_import.FbxImportHelperNode.link_hierarchy))
source=source.replace('(mmat, amat) = mesh.armature_setup[self]', 'if self not in mesh.armature_setup: continue\n                (mmat, amat) = mesh.armature_setup[self]')
namespace=dict(fbx_import.__dict__);exec(source,namespace)
fbx_import.FbxImportHelperNode.link_hierarchy=namespace['link_hierarchy']
root,dest=map(Path,sys.argv[-2:])
asset=root/'Assets/Apocalypse_(pack)/Characters/Character_Apocalypse'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(asset/'Animation/Character@Idle_Weapons_Up.FBX'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
body=next(o for o in bpy.data.objects if o.type=='MESH' and o.name=='Body_mesh')
bpy.context.scene.frame_set(1)
deps=bpy.context.evaluated_depsgraph_get()
image=bpy.data.images.load(str(asset/'Textures/Postapocalyptic_Textures/Postapokalipsis_Albedo.tga'))
image.scale(512,512);image.filepath_raw=str(dest.with_suffix('.jpg'));image.file_format='JPEG';image.save()
material=bpy.data.materials.new('Unity survivor hands');material.use_nodes=True
texture=material.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image
bsdf=material.node_tree.nodes.get('Principled BSDF')
material.node_tree.links.new(texture.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=.88
results=[]
for side,label in [('R','Right'),('L','Left')]:
    prefix=f'CATRig{side}Arm'
    selected={g.index for g in body.vertex_groups if g.name.startswith(prefix) and ('Palm' in g.name or 'Digit' in g.name or g.name==prefix+'22')}
    keep={v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in selected)>.45}
    mesh=bpy.data.meshes.new_from_object(body.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in keep],context='VERTS')
    bm.to_mesh(mesh);bm.free()
    wrist=rig.matrix_world@rig.pose.bones[prefix+'22'].matrix.translation
    palm=rig.matrix_world@rig.pose.bones[prefix+'Palm'].matrix.translation
    index=rig.matrix_world@rig.pose.bones[prefix+'Digit21'].matrix.translation
    pinky=rig.matrix_world@rig.pose.bones[prefix+'Digit51'].matrix.translation
    forward=(palm-wrist).normalized()
    lateral=(pinky-index).normalized()
    z=-forward
    x=(lateral-z*lateral.dot(z)).normalized()
    y=z.cross(x).normalized()
    # Both meshes share wrist-at-origin, fingers-toward-minus-Z coordinates.
    basis=Matrix((x,y,z))
    for vertex in mesh.vertices:
        vertex.co=basis@(body.matrix_world@vertex.co-wrist)
    obj=bpy.data.objects.new(f'Unity_{label}_Hand',mesh);bpy.context.collection.objects.link(obj)
    obj.data.materials.clear();obj.data.materials.append(material);results.append(obj)
    print('HAND',label,len(mesh.vertices),len(mesh.polygons))
for obj in bpy.data.objects:obj.select_set(obj in results)
bpy.context.view_layer.objects.active=results[0]
bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_animations=False,export_image_format='JPEG',export_yup=False)
dest.with_suffix('.jpg').unlink(missing_ok=True)
print('EXPORTED',dest,dest.stat().st_size)
