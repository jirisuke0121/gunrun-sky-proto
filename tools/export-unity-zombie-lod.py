"""Blender: decimate the Unity zombie while preserving the runtime skin frame.

Run with blender --background --python tools/export-unity-zombie-lod.py --
assets/zombie-gunrun-standard.glb assets/zombie-gunrun-lo.glb [triangle_target].
Standard and evolved have identical geometry, UVs and weights, so share this LOD.
The output contains geometry and the original skin only; the runtime reuses its
already-loaded texture, skeleton and animations.
"""
import copy
import json
import struct
import sys
import tempfile
from pathlib import Path

import bpy


def read_glb(path):
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + length]), data[28 + length:]


args = sys.argv[sys.argv.index('--') + 1:]
source, destination = map(Path, args[:2])
target = int(args[2]) if len(args) > 2 else 2000
original, original_bin = read_glb(source)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
body = next(obj for obj in bpy.data.objects if obj.type == 'MESH'
            and any(mod.type == 'ARMATURE' for mod in obj.modifiers))
rig = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
for obj in bpy.data.objects:
    obj.animation_data_clear()
rig.data.pose_position = 'REST'
for obj in bpy.context.selected_objects:
    obj.select_set(False)
body.select_set(True)
bpy.context.view_layer.objects.active = body
body.data.calc_loop_triangles()
before = len(body.data.loop_triangles)
modifier = body.modifiers.new('Far zombie geometry', 'DECIMATE')
modifier.ratio = min(1.0, target / before)
modifier.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
body.data.materials.clear()
for attribute in list(body.data.color_attributes):
    body.data.color_attributes.remove(attribute)
rig.select_set(True)
body.select_set(True)

with tempfile.TemporaryDirectory(prefix='unity-zombie-lod-') as temp:
    intermediate = Path(temp) / 'decimated.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(intermediate), export_format='GLB', use_selection=True,
        export_animations=False, export_materials='NONE', export_yup=True,
        export_apply=False, export_tangents=False,
    )
    low, low_bin = read_glb(intermediate)

# Blender may reorder the skin's joints. Remap the exported JOINTS attribute to
# the source order because the game swaps only geometry on the original rig.
original_skin = original['skins'][0]
low_skin = low['skins'][0]
source_names = [original['nodes'][i]['name'] for i in original_skin['joints']]
low_names = [low['nodes'][i]['name'] for i in low_skin['joints']]
joint_map = [source_names.index(name) for name in low_names]
mesh_node = next(node for node in low['nodes'] if 'mesh' in node)
if any(key in mesh_node for key in ('matrix', 'translation', 'rotation', 'scale')):
    raise RuntimeError('LOD mesh must remain in the original identity frame')
primitive = low['meshes'][mesh_node['mesh']]['primitives'][0]
result = {
    'asset': {'version': '2.0', 'generator': 'GunRun Unity zombie geometry LOD'},
    'scene': original.get('scene', 0), 'scenes': copy.deepcopy(original['scenes']),
    'nodes': copy.deepcopy(original['nodes']), 'skins': [copy.deepcopy(original_skin)],
    'meshes': [{'name': 'Unity zombie far geometry', 'primitives': []}],
    'accessors': [], 'bufferViews': [], 'buffers': [],
}
for node in result['nodes']:
    if 'mesh' in node:
        node['mesh'] = 0
binary = bytearray()


def append_accessor(document, blob, index, remap=False):
    accessor = copy.deepcopy(document['accessors'][index])
    view = document['bufferViews'][accessor['bufferView']]
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[accessor['type']]
    fmt = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[accessor['componentType']]
    size = struct.calcsize('<' + fmt) * components
    stride = view.get('byteStride', size)
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    payload = bytearray()
    for i in range(accessor['count']):
        raw = blob[offset + i * stride:offset + i * stride + size]
        if remap:
            joints = struct.unpack('<' + fmt * components, raw)
            raw = struct.pack('<' + fmt * components, *(joint_map[j] for j in joints))
        payload.extend(raw)
    binary.extend(b'\0' * (-len(binary) % 4))
    output_view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload)}
    if 'target' in view:
        output_view['target'] = view['target']
    binary.extend(payload)
    accessor['bufferView'] = len(result['bufferViews'])
    accessor.pop('byteOffset', None)
    if remap:
        accessor.pop('min', None)
        accessor.pop('max', None)
    result['bufferViews'].append(output_view)
    result['accessors'].append(accessor)
    return len(result['accessors']) - 1


attrs = {name: append_accessor(low, low_bin, index, name == 'JOINTS_0')
         for name, index in primitive['attributes'].items()}
indices = append_accessor(low, low_bin, primitive['indices'])
result['meshes'][0]['primitives'].append({'attributes': attrs, 'indices': indices})
result['skins'][0]['inverseBindMatrices'] = append_accessor(
    original, original_bin, original_skin['inverseBindMatrices'])
result['buffers'] = [{'byteLength': len(binary)}]
json_bytes = json.dumps(result, separators=(',', ':')).encode()
json_bytes += b' ' * (-len(json_bytes) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
destination.write_bytes(
    struct.pack('<III', 0x46546c67, 2, 12 + 8 + len(json_bytes) + 8 + len(binary))
    + struct.pack('<II', len(json_bytes), 0x4e4f534a) + json_bytes
    + struct.pack('<II', len(binary), 0x004e4942) + binary)
triangles = result['accessors'][indices]['count'] // 3
print('LOD', before, '->', triangles, 'triangles;', destination.stat().st_size, 'bytes')
