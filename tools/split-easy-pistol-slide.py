#!/usr/bin/env python3
"""Split the nonindexed Easy Weapons pistol GLB into frame and moving slide.

The Unity FBX joins the slide to the frame in one mesh. Both new primitives
share the original vertex attributes and material, so the rest pose is exact.
"""
import copy
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/easy-weapons-pistol.glb'
TARGET = ROOT / 'assets/easy-weapons-pistol-slide.glb'
SLIDE_Y = 0.1  # Source-model units. Includes the upper housing and sights.


def align4(data: bytes, pad: bytes = b'\0') -> bytes:
    return data + pad * ((-len(data)) % 4)


def read_glb(path: Path):
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from('<III', raw)
    assert magic == 0x46546C67 and version == 2 and total == len(raw)
    offset = 12
    chunks = []
    while offset < total:
        size, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        chunks.append((kind, raw[offset:offset + size]))
        offset += size
    assert len(chunks) == 2 and chunks[0][0] == 0x4E4F534A and chunks[1][0] == 0x004E4942
    return json.loads(chunks[0][1]), chunks[1][1]


def main():
    gltf, binary = read_glb(SOURCE)
    primitive = gltf['meshes'][0]['primitives'][0]
    assert primitive.get('mode', 4) == 4 and 'indices' not in primitive
    accessor = gltf['accessors'][primitive['attributes']['POSITION']]
    view = gltf['bufferViews'][accessor['bufferView']]
    assert accessor['type'] == 'VEC3' and accessor['componentType'] == 5126
    assert accessor['count'] % 3 == 0 and accessor['count'] < 65536
    stride = view.get('byteStride', 12)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    frame, slide = [], []
    for first in range(0, accessor['count'], 3):
        y = [struct.unpack_from('<f', binary, start + (first + n) * stride + 4)[0] for n in range(3)]
        (slide if sum(y) / 3 > SLIDE_Y else frame).extend((first, first + 1, first + 2))
    assert frame and slide and len(frame) + len(slide) == accessor['count']

    def add_indices(values):
        nonlocal binary
        binary = align4(binary)
        offset = len(binary)
        binary += struct.pack(f'<{len(values)}H', *values)
        view_id = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(values) * 2, 'target': 34963})
        accessor_id = len(gltf['accessors'])
        gltf['accessors'].append({'bufferView': view_id, 'componentType': 5123, 'count': len(values), 'type': 'SCALAR', 'min': [min(values)], 'max': [max(values)]})
        return accessor_id

    frame_accessor = add_indices(frame)
    slide_accessor = add_indices(slide)
    gltf['meshes'][0]['name'] = 'Pistol_Frame'
    primitive['indices'] = frame_accessor
    gltf['meshes'].append({'name': 'Pistol_Slide', 'primitives': [{**copy.deepcopy(primitive), 'indices': slide_accessor}]})
    slide_node = len(gltf['nodes'])
    gltf['nodes'].append({'name': 'Pistol_Slide', 'mesh': len(gltf['meshes']) - 1})
    gltf['nodes'][0].setdefault('children', []).append(slide_node)
    gltf['buffers'][0]['byteLength'] = len(binary)
    json_chunk = align4(json.dumps(gltf, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), b' ')
    bin_chunk = align4(binary)
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    TARGET.write_bytes(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(json_chunk), 0x4E4F534A) + json_chunk + struct.pack('<II', len(bin_chunk), 0x004E4942) + bin_chunk)
    print(f'{TARGET}: frame={len(frame)//3} slide={len(slide)//3} triangles, {total} bytes')


if __name__ == '__main__':
    main()
