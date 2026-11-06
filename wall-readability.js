// First visual pass at the south facade in photo 2. Collision and navigation
// stay in the original boxes; the materials are installed before static batching.
export function installWallReadability(game) {
  if (window.skyGuidedScene || location.pathname.endsWith('canyon.html') ||
      new URLSearchParams(location.search).get('wallReadability') === 'classic') return;
  const { Standard, CanvasTexture } = game.Geom;
  function texture(draw) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    draw(canvas.getContext('2d'));
    const map = new CanvasTexture(canvas);
    map.wrapS = map.wrapT = 1000; // RepeatWrapping; base world UVs are metres / 2.
    map.colorSpace = 'srgb';
    return map;
  }
  const masonry = texture(ctx => {
    ctx.fillStyle = '#686c6d'; ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) for (let col = -1; col < 2; col++) {
      const x = col * 128 + (row % 2) * 64, y = row * 64;
      const value = 141 + ((row * 7 + col * 3 + 12) % 5) * 3;
      ctx.fillStyle = `rgb(${value},${value + 1},${value - 3})`;
      ctx.fillRect(x + 1, y + 1, 126, 62);
      ctx.fillStyle = '#a8a89e'; ctx.fillRect(x + 2, y + 2, 124, 1);
    }
  });
  const paving = texture(ctx => {
    ctx.fillStyle = '#a99e88'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#d5ccb6'; ctx.fillRect(4, 4, 248, 248);
    ctx.fillStyle = '#e2d9c5'; ctx.fillRect(5, 5, 246, 2);
    // Sparse deterministic grain: avoid the old large mottled shadow patches.
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = i % 2 ? '#cfc6b0' : '#dbd2bd';
      ctx.fillRect((i * 73) % 250 + 3, (i * 109) % 250 + 3, 2, 2);
    }
  });
  const shadePaving = `
      float roof=step(7.9,vSkyPavingPosition.y);
      float rim=step(13.82,max(abs(vSkyPavingPosition.x),abs(vSkyPavingPosition.z)))*roof;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.72,.69,.59),rim);
      float contact=(1.0-smoothstep(14.0,14.35,vSkyPavingPosition.z))*(1.0-roof)*step(1.5,abs(vSkyPavingPosition.x));
      diffuseColor.rgb*=1.0-.22*contact;`;
  const floor = new Standard({ map: paving, color: 0xffffff, roughness: .98 });
  floor.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vSkyPavingPosition;\n' + shader.vertexShader.replace(
      '#include <project_vertex>', '#include <project_vertex>\nvSkyPavingPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 vSkyPavingPosition;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>', '#include <map_fragment>\n' + shadePaving);
  };
  floor.customProgramCacheKey = () => 'south-paving-readability-v1';
  const wall = new Standard({ map: masonry, color: 0xffffff, roughness: .98 });
  // The roof is exactly 8m high. Paint the coping inside the existing silhouette
  // rather than suggesting a protruding ledge the player cannot stand on.
  wall.onBeforeCompile = shader => {
    shader.vertexShader = 'varying float vSkyWallY;\n' + shader.vertexShader.replace(
      '#include <project_vertex>', '#include <project_vertex>\nvSkyWallY=(modelMatrix*vec4(transformed,1.0)).y;');
    shader.fragmentShader = 'varying float vSkyWallY;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>', `#include <map_fragment>
      float coping=step(7.82,vSkyWallY);
      float lipShadow=step(7.65,vSkyWallY)*(1.0-coping);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.72,.69,.59),coping);
      diffuseColor.rgb*=1.0-.28*lipShadow;
      diffuseColor.rgb*=mix(.7,1.0,smoothstep(0.0,.38,vSkyWallY));`);
  };
  wall.customProgramCacheKey = () => 'south-wall-readability-v1';
  const side = new Standard({ map: masonry, color: 0xffffff, roughness: .98 });
  // A single material keeps every stair tread in the existing static batches.
  side.onBeforeCompile = shader => {
    shader.uniforms.skyPavingMap = { value: paving };
    shader.vertexShader = 'varying vec3 vSkyPavingPosition;\nvarying float vSkyPavingUp;\n' + shader.vertexShader.replace(
      '#include <project_vertex>', '#include <project_vertex>\nvSkyPavingPosition=(modelMatrix*vec4(transformed,1.0)).xyz;\nvSkyPavingUp=normal.y;');
    shader.fragmentShader = 'varying vec3 vSkyPavingPosition;\nvarying float vSkyPavingUp;\nuniform sampler2D skyPavingMap;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>', `#include <map_fragment>
      if(vSkyPavingUp>.5){diffuseColor.rgb=texture2D(skyPavingMap,vMapUv).rgb;${shadePaving}}`);
  };
  side.customProgramCacheKey = () => 'south-stair-readability-v1';
  let walls = 0, floors = 0;
  for (const box of game.jn) {
    const mesh = box.mesh;
    if (!mesh?.isMesh || box.hidden || box.tint != null || box.shape || box.type === 'door') continue;
    const southWall = box.type === 'mono' && box.minZ === 13 && box.maxZ === 14 && box.minX >= -13 && box.maxX <= 13;
    const roof = box.type === 'slab' && box.minX === -14 && box.maxX === 14 && box.minZ === -14 && box.maxZ === 14 && box.maxY === 8;
    const southFloor = ['slab', 'beam'].includes(box.type) && box.minZ >= 14 && box.maxZ <= 18 && box.minX >= -14 && box.maxX <= 14;
    if (!southWall && !roof && !southFloor) continue;
    if (southFloor) { mesh.material = side; floors++; continue; }
    const materials = Array.isArray(mesh.material) ? mesh.material.slice() : Array(6).fill(mesh.material);
    if (southWall) { materials[4] = wall; walls++; }
    if (roof) { materials[4] = wall; materials[2] = floor; floors++; }
    mesh.material = materials;
  }
  window.skyWallReadability = { revision: 'south-facade-v1', walls, floors };
}
