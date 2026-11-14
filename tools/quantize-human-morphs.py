#!/usr/bin/env python3
"""Quantize the morph-target POSITION deltas of the animated human GLB to int16.

Why: the 348 morph targets (116 frames x 3 meshes) are ~4.8 MB of float32 and
dominate the initial download. int16 with a per-target scale is visually exact
(error <= max|delta| / 65534) and, after gzip, ~2.3x smaller.

Format written (still a valid GLB that GLTFLoader reads):
  * each target POSITION accessor becomes componentType 5122 (SHORT, not
    normalized) in a bufferView with byteStride 8 (glTF wants 4-byte aligned
    vertex elements; the 2 pad bytes are zero and vanish under gzip).
  * the per-target scale is stored in  mesh.extras.morphScale[targetIndex].
  * accessor min/max stay as the original float displacement bounds, so the
    loader's bounding-sphere maths is unchanged.
The game restores Float32 right after parsing (human-running.js
dequantizeMorphs), so every other consumer keeps reading Float32 arrays.

Usage: python3 tools/quantize-human-morphs.py [in.glb.gz] [out.glb.gz]
Defaults to rewriting assets/human-gunrun-animated.glb.gz in place. Run it on a
freshly exported (float32) file; an already quantized file is refused.
"""
import gzip, json, struct, sys
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets/human-gunrun-animated.glb.gz'
DST = sys.argv[2] if len(sys.argv) > 2 else SRC


def pad4(b, fill=b'\0'):
    return b + fill * ((4 - len(b) % 4) % 4)


raw = gzip.open(SRC).read()
magic, version, _ = struct.unpack('<III', raw[:12])
assert magic == 0x46546C67 and version == 2, 'not a GLB 2.0'
json_len = struct.unpack('<I', raw[12:16])[0]
doc = json.loads(raw[20:20 + json_len])
bin_off = 20 + json_len + 8
old_bin = raw[bin_off:bin_off + struct.unpack('<I', raw[20 + json_len:24 + json_len])[0]]

accessors, views = doc['accessors'], doc['bufferViews']
quantized = {}  # bufferView index -> int16 bytes
max_err = 0.0
for mesh in doc['meshes']:
    scales = []
    for prim in mesh['primitives']:
        for target in prim.get('targets', []):
            acc = accessors[target['POSITION']]
            assert acc['type'] == 'VEC3' and 'sparse' not in acc and not acc.get('byteOffset'), 'unsupported accessor'
            if acc['componentType'] == 5122:
                sys.exit('already quantized; re-export the float32 GLB first')
            assert acc['componentType'] == 5126
            view = views[acc['bufferView']]
            assert 'byteStride' not in view, 'interleaved target not supported'
            data = np.frombuffer(old_bin, '<f4', acc['count'] * 3, view['byteOffset']).reshape(-1, 3)
            peak = float(np.abs(data).max())
            scale = peak / 32767 if peak > 0 else 1.0
            q = np.rint(data / scale).astype('<i2')
            max_err = max(max_err, float(np.abs(q.astype('f4') * scale - data).max()))
            padded = np.zeros((acc['count'], 4), '<i2')
            padded[:, :3] = q
            quantized[acc['bufferView']] = padded.tobytes()
            acc['componentType'] = 5122
            scales.append(scale)
    if scales:
        mesh.setdefault('extras', {})['morphScale'] = scales

new_bin = bytearray()
for i, view in enumerate(views):
    chunk = quantized.get(i)
    if chunk is None:
        chunk = old_bin[view['byteOffset']:view['byteOffset'] + view['byteLength']]
    else:
        view['byteStride'] = 8
    view['byteOffset'] = len(new_bin)
    view['byteLength'] = len(chunk)
    new_bin += pad4(chunk)
doc['buffers'][0]['byteLength'] = len(new_bin)

json_chunk = pad4(json.dumps(doc, separators=(',', ':')).encode(), b' ')
bin_chunk = bytes(new_bin)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(json_chunk) + 8 + len(bin_chunk))
out += struct.pack('<II', len(json_chunk), 0x4E4F534A) + json_chunk
out += struct.pack('<II', len(bin_chunk), 0x004E4942) + bin_chunk
with gzip.GzipFile(DST, 'wb', compresslevel=9, mtime=0) as f:
    f.write(out)
print(f'{SRC}: {len(raw)/1e6:.2f} MB raw -> {len(out)/1e6:.2f} MB raw; targets={len(quantized)}; '
      f'max abs error {max_err:.3e}')
