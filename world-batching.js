// Combine immutable, opaque material groups and explicitly marked decoration.
// Doors, animated models and transparent sorting stay separate.
export function mergeStaticMaterialGroups(game, cellSize = 32) {
  const { ue: scene, jn, Geom } = game;
  const { BufferGeometry, Float32Attribute, Mesh, Vector3 } = Geom;
  const interactive = new Set(jn.filter(box => box.type === 'door' || box.type === 'prop' || box.shape).map(box => box.mesh));
  const buckets = new Map(), victims = [], transformed = new Map(), made = [];
  const centre = new Vector3();
  scene.updateMatrixWorld(true);
  let groupsBefore = 0, triangles = 0, taggedObjects = 0;
  scene.traverse(object => {
    if (!object.isMesh || object.isSkinnedMesh || !object.visible || interactive.has(object)) return;
    let tagged = !!object.userData.skyStaticBatch;
    for (let parent = object.parent; parent && parent !== scene; parent = parent.parent) {
      if (!parent.visible) return;
      if (parent.userData.skyStaticBatch) tagged = true;
    }
    if (!tagged && (object.parent !== scene || object.matrixAutoUpdate || !Array.isArray(object.material))) return;
    const geometry = object.geometry, attributes = geometry.attributes;
    const total = geometry.index?.count ?? attributes.position?.count ?? 0;
    if (!attributes.position || !attributes.normal || !attributes.uv ||
        Object.keys(attributes).some(key => !['position', 'normal', 'uv'].includes(key)) ||
        Object.values(attributes).some(attribute => attribute.isInterleavedBufferAttribute) ||
        Object.keys(geometry.morphAttributes).length ||
        geometry.drawRange.start !== 0 || geometry.drawRange.count < total) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const groups = (Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }]).filter(group => group.count > 0);
    if (!groups.length || groups.some(group => !materials[group.materialIndex] ||
        materials[group.materialIndex].transparent || group.start < 0 ||
        group.start + group.count > total || group.count % 3)) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometry.boundingBox.getCenter(centre).applyMatrix4(object.matrixWorld);
    const cell = Math.floor(centre.x / cellSize) + ',' + Math.floor(centre.z / cellSize);
    for (const group of groups) {
      const material = materials[group.materialIndex];
      const key = [material.uuid, object.castShadow, object.receiveShadow,
        object.layers.mask, object.renderOrder, object.frustumCulled, cell].join('|');
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, bucket = { material, source: object, parts: new Map() });
      if (!bucket.parts.has(object)) bucket.parts.set(object, []);
      bucket.parts.get(object).push(group);
      groupsBefore++; triangles += group.count / 3;
    }
    victims.push(object);
    if (tagged) taggedObjects++;
  });
  try {
    for (const bucket of buckets.values()) {
      const count = [...bucket.parts.values()].flat().reduce((sum, group) => sum + group.count, 0);
      const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
      const uvs = new Float32Array(count * 2), indices = [];
      let vertices = 0;
      for (const [object, groups] of bucket.parts) {
        let geometry = transformed.get(object);
        if (!geometry) {
          geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
          transformed.set(object, geometry);
        }
        const { position, normal, uv } = geometry.attributes, remap = new Map();
        const mirrored = object.matrixWorld.determinant() < 0;
        for (const group of groups) for (let i = group.start; i < group.start + group.count; i++) {
          const corner = (i - group.start) % 3;
          const source = mirrored && corner ? i + (corner === 1 ? 1 : -1) : i;
          const original = geometry.index ? geometry.index.getX(source) : source;
          let target = remap.get(original);
          if (target === undefined) {
            target = vertices++; remap.set(original, target);
            positions.set([position.getX(original), position.getY(original), position.getZ(original)], target * 3);
            normals.set([normal.getX(original), normal.getY(original), normal.getZ(original)], target * 3);
            uvs.set([uv.getX(original), uv.getY(original)], target * 2);
          }
          indices.push(target);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32Attribute(positions.subarray(0, vertices * 3), 3));
      geometry.setAttribute('normal', new Float32Attribute(normals.subarray(0, vertices * 3), 3));
      geometry.setAttribute('uv', new Float32Attribute(uvs.subarray(0, vertices * 2), 2));
      geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, bucket.material), source = bucket.source;
      mesh.name = 'Merged static material groups'; mesh.matrixAutoUpdate = false;
      mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
      mesh.layers.mask = source.layers.mask; mesh.renderOrder = source.renderOrder;
      mesh.frustumCulled = source.frustumCulled;
      made.push(mesh);
    }
  } catch (error) {
    for (const mesh of made) mesh.geometry.dispose();
    throw error;
  } finally {
    for (const geometry of transformed.values()) geometry.dispose();
  }
  const removed = new Set(victims), unused = new Set(victims.map(object => object.geometry));
  scene.traverse(object => { if (!removed.has(object) && object.geometry) unused.delete(object.geometry); });
  for (const mesh of made) scene.add(mesh);
  for (const object of victims) object.parent.remove(object);
  for (const geometry of unused) geometry.dispose();
  const trianglesAfter = made.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
  return { revision: "material-groups-v2", objects: victims.length, taggedObjects, groupsBefore, groupsAfter: made.length, triangles, trianglesAfter, cellSize };
}
