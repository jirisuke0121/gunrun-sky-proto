const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');

// Use the game's actual bundled GLTFLoader and actual downloaded human asset.
// Images are removed only in this Node fixture; production keeps its textures.
async function loadHuman() {
  const html = fs.readFileSync('index.html', 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.startsWith('var T2='));
  assert.ok(script, 'bundled Three loader');
  const context = vm.createContext({ console, TextDecoder, TextEncoder, URL, Blob, fetch, setTimeout, clearTimeout });
  vm.runInContext(script + '\nthis.loader = new T2.GLTFLoader();', context);
  const source = zlib.gunzipSync(fs.readFileSync('assets/human-gunrun-animated.glb.gz'));
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + jsonLength));
  json.images = []; json.textures = [];
  json.materials = [{ pbrMetallicRoughness: { baseColorFactor: [.5, .6, .7, 1] } }];
  const text = JSON.stringify(json), padded = Buffer.from(text + ' '.repeat((4 - Buffer.byteLength(text) % 4) % 4));
  const binary = source.subarray(20 + jsonLength), header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + binary.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const buffer = Buffer.concat([header, padded, binary]);
  // The loader checks the ArrayBuffer realm when deciding GLB vs JSON.
  context.bytes = [...buffer];
  return new Promise((resolve, reject) => {
    context.resolve = resolve; context.reject = reject;
    vm.runInContext('loader.parse(new Uint8Array(bytes).buffer, "", resolve, reject)', context);
  });
}

async function fixture() {
  const gltf = await loadHuman(), motion = JSON.parse(fs.readFileSync('assets/human-gunrun-animated.json'));
  return { gltf, motion };
}

if (require.main === module) (async () => {
  const { addParkourRun, sampleClip, strideAdvance, runningBlend, runningVertex } = await import('../human-running.js');
  assert.ok(Math.abs(strideAdvance(.2, 0) - .2) < 1e-9);
  assert.ok(Math.abs(strideAdvance(.2, 3.36) - .2) < 1e-9);
  let p = 0; for (let i = 0; i < 60; i++) p = strideAdvance(p, 6 / 60);
  let q = 0; for (let i = 0; i < 30; i++) q = strideAdvance(q, 6 / 30);
  assert.ok(Math.abs(p - q) < 1e-9, 'same distance gives same foot phase at 30/60 FPS');
  assert.equal(runningBlend(4.6, 4.6, 6), 0); assert.equal(runningBlend(6, 4.6, 6), 1);
  const { gltf, motion } = await fixture(), meshes = [];
  gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const body = meshes.find(o => o.name.startsWith('Body_mesh'));
  const originalNames = Object.keys(body.morphTargetDictionary);
  const positions = body.geometry.morphAttributes.position.map(a => Array.from(a.array));
  const start = performance.now();
  assert.equal(addParkourRun(gltf.scene, motion, body.geometry.attributes.position.constructor), true);
  const elapsed = performance.now() - start;
  const clip = motion.clips.parkourRun;
  assert.equal(clip.frames.length, 25); assert.equal(clip.duration, .56);
  for (const mesh of meshes) {
    const geometry = mesh.geometry, names = mesh.morphTargetDictionary;
    assert.equal(geometry.morphAttributes.position.length, geometry.morphAttributes.normal.length);
    for (const name of clip.frames) {
      assert.ok(Number.isInteger(names[name]), `${mesh.name}: named run target ${name}`);
      const a = geometry.morphAttributes.position[names[name]];
      assert.equal(a.count, geometry.attributes.position.count);
      assert.ok(a.array.every(Number.isFinite), `${mesh.name}: finite vertices`);
    }
    const first = geometry.morphAttributes.position[names[clip.frames[0]]].array;
    const last = geometry.morphAttributes.position[names[clip.frames.at(-1)]].array;
    assert.ok(first.every((value, i) => Math.abs(value - last[i]) < .0001), `${mesh.name}: seamless loop`);
    assert.ok(geometry.morphAttributes.normal.every(a => a.array.every(Number.isFinite)));
  }
  for (let i = 0; i < originalNames.length; i++) {
    assert.equal(body.morphTargetDictionary[originalNames[i]], i, 'jump/slide/ladder targets keep their original indices');
    assert.deepEqual(Array.from(body.geometry.morphAttributes.position[i].array), positions[i], 'existing motion vertices unchanged');
  }
  const grips = motion.grips.parkourRun;
  assert.ok(Math.max(...grips.map(p => p[2])) - Math.min(...grips.map(p => p[2])) > .6, 'hand swings forward and back');
  assert.ok(grips.every(p => p.every(Number.isFinite)));
  assert.ok(sampleClip(clip, 1).hi === 24);
  const head = runningVertex([0, 2.3, 0], [0, 2.3, 0], 0);
  assert.ok(head[2] > .35 && head[1] < 2.3, 'head leans forward without scaling the body');
  console.log(`PASS real human asset: ${meshes.length} meshes, 25 run poses, continuous loop, moving grip, forward lean, original clips retained; generation ${elapsed.toFixed(0)} ms`);
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { fixture };
