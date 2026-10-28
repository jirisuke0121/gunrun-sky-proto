// Paint only the faces accepted by the same registry used by player movement.
// These are visual meshes, never collision objects or extra jump permissions.
const sky = window.__skyInternals, game = window.__game;
const { c, z, Geom: T, ue, Se: camera } = sky;
const root = new T.Group(); root.name = 'Wall-run shortcut guides'; root.visible = false; ue.add(root);
const guides = [], geometries = new Map();

function panelGeometry(width, height) {
  const key = `${width},${height}`;
  if (geometries.has(key)) return geometries.get(key);
  const x = width / 2, y = height / 2, geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32Attribute(new Float32Array([-x,-y,0,x,-y,0,x,y,0,-x,-y,0,x,y,0,-x,y,0]), 3));
  geometry.setAttribute('uv', new T.Float32Attribute(new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1]), 2));
  geometries.set(key, geometry); return geometry;
}
function material(width, height, paint) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  return new T.Basic({ map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false });
}
const bands = new Map();
function bandMaterial(sign) {
  if (bands.has(sign)) return bands.get(sign);
  const mat = material(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(3,40,40,.82)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#75ffe1'; ctx.fillRect(0, 0, w, 9); ctx.fillRect(0, h - 9, w, 9);
    for (let x = 72; x < w; x += 150) {
      ctx.beginPath(); ctx.moveTo(x - sign * 30, 31); ctx.lineTo(x + sign * 5, h / 2);
      ctx.lineTo(x - sign * 30, h - 31); ctx.lineWidth = 16;
      ctx.strokeStyle = '#b3ffed'; ctx.stroke();
    }
  }); bands.set(sign, mat); return mat;
}
const jumpMaterial = material(768, 256, (ctx, w, h) => {
  ctx.fillStyle = 'rgba(44,30,5,.92)'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ffdc79'; ctx.lineWidth = 16; ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#ffdc79'; ctx.font = '900 100px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('↑ JUMP', w / 2, 127);
  ctx.fillStyle = '#fff6d9'; ctx.font = '700 50px system-ui'; ctx.fillText('ここで壁ジャンプ', w / 2, 207);
});
function addPanel(route, along, y, width, height, mat, offset) {
  const [nx, nz] = route.normal, mesh = new T.Mesh(panelGeometry(width, height), mat);
  mesh.rotation.y = Math.atan2(nx, nz);
  mesh.position.set(nx ? route.at[0] + nx * offset : along, y, nz ? route.at[2] + nz * offset : along);
  root.add(mesh); return mesh;
}
function rebuildGuides() {
  root.clear();
  guides.length = 0;
  for (const geometry of geometries.values()) geometry.dispose();
  geometries.clear();
  for (const route of window.__skyWallRunRoutes || []) {
    const [nx, nz] = route.normal, normal = { x: nx, z: nz };
    const wall = game.solids.find(wall => window.__skyCanWallRunOnFace?.(wall, normal)
      // Parallel shortcut faces can overlap along the run direction. Match this
      // route's own face plane before using a wall's dimensions for the paint.
      && Math.abs((nx ? (nx > 0 ? wall.maxX : wall.minX) : (nz > 0 ? wall.maxZ : wall.minZ)) - (nx ? route.at[0] : route.at[2])) < .05
      && (nx ? route.at[2] > wall.minZ && route.at[2] < wall.maxZ : route.at[0] > wall.minX && route.at[0] < wall.maxX)
      && route.at[1] >= wall.minY && route.at[1] < wall.maxY);
    if (!wall) continue;
    const low = (nx ? wall.minZ : wall.minX) + .08, high = (nx ? wall.maxZ : wall.maxX) - .08;
    const along = nx ? route.at[2] : route.at[0];
    const y = Math.max(wall.minY + .65, Math.min(wall.maxY - .7, route.at[1] + .85));
    const sign = Math.sign(nz * route.direction[0] - nx * route.direction[1]);
    const band = addPanel(route, (low + high) / 2, y, high - low, .64, bandMaterial(sign), .028);
    band.name = `${route.name}: wall-run arrows`;
    // The horizontal paint matches the existing +/-2 m acceptance window, clipped
    // to the actual wall face, including the short take-off at the west wall end.
    const a = Math.max(low, along - 2), b = Math.min(high, along + 2);
    const bottom = Math.max(wall.minY + .08, y + .14), top = Math.min(wall.maxY - .08, y + 1.26);
    const launch = addPanel(route, (a + b) / 2, (bottom + top) / 2, b - a, top - bottom, jumpMaterial, .042);
    launch.name = `${route.name}: jump zone`;
    guides.push({ ...route, wall, band, launch, normal });
  }
}
rebuildGuides();
window.addEventListener('sky-walljump-layout-change', rebuildGuides);

const style = document.createElement('style');
style.textContent = `
#wallrunGuide{position:absolute;left:50%;top:34%;transform:translateX(-50%);max-width:calc(100% - 48px);width:max-content;padding:8px 14px;border:1px solid #75ffe1;border-radius:8px;background:#082b29ed;color:#e1fff5;text-align:center;font:600 14px/1.5 var(--font);text-shadow:none;pointer-events:none}
#wallrunGuide[hidden]{display:none}#wallrunGuide strong{display:block;color:#8fffe2;font-size:15px}#wallrunGuide[data-ready=true]{border-color:#ffdc79;background:#382a0bef}#wallrunGuide[data-ready=true] strong{color:#ffdc79}
#hud:has(#wallrunGuide:not([hidden])) .hint{opacity:0}
@media(max-height:500px){#wallrunGuide{top:30%;font-size:11px;padding:5px 10px;max-width:calc(100% - 300px)}#wallrunGuide strong{font-size:13px}}
`;
document.head.appendChild(style);
const hint = document.createElement('div'); hint.id = 'wallrunGuide'; hint.hidden = true;
const title = document.createElement('strong'), instruction = document.createElement('span');
hint.append(title, instruction); document.getElementById('hud').appendChild(hint);
const look = new T.Vector3();
const getWall = (x, y, zz) => game.solids.find(wall => !wall.off && wall.type === 'mono' && wall.wr !== false
  && x > wall.minX && x < wall.maxX && y > wall.minY && y < wall.maxY && zz > wall.minZ && zz < wall.maxZ && wall.maxY - c.pos.y > 1.6);

function update() {
  root.visible = sky.modeRef() === 'play' && !z.over;
  for (const guide of guides)
    guide.band.visible = guide.launch.visible = !!window.__skyCanWallRunOnFace?.(guide.wall, guide.normal);
  hint.hidden = true;
  if (!root.visible) return;
  const ready = c.state === 'wallrun' && window.__skyCanWallJumpAtSpot?.(c, getWall, c.wallN);
  let nearest = null, distance = Infinity;
  for (const guide of guides) {
    if (!guide.band.visible) continue;
    const { at: [x, y, zz], normal: { x: nx, z: nz } } = guide;
    if (ready) {
      if (nx !== c.wallN.x || nz !== c.wallN.z) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.y - y, c.pos.z - zz);
      if (d < distance) { nearest = guide; distance = d; }
      continue;
    }
    const outside = (c.pos.x - x) * nx + (c.pos.z - zz) * nz;
    const along = Math.abs(nx ? c.pos.z - zz : c.pos.x - x);
    if (outside < 0 || outside > 5 || along > 10 || Math.abs(c.pos.y - y) > 4) continue;
    look.set(x + nx * .08, y + 1.45, zz + nz * .08);
    const dx = look.x - camera.position.x, dy = look.y - camera.position.y, dz = look.z - camera.position.z;
    const d = Math.hypot(dx, dy, dz);
    look.project(camera);
    if (look.z < -1 || look.z > 1 || Math.abs(look.x) > 1.15 || Math.abs(look.y) > 1.15) continue;
    if (sky.raycast(camera.position.x, camera.position.y, camera.position.z, dx / d, dy / d, dz / d, Math.max(0, d - .15))) continue;
    if (d < distance) { nearest = guide; distance = d; }
  }
  if (!nearest) return;
  const touch = document.documentElement.classList.contains('touch');
  title.textContent = ready ? '今ジャンプ！ ショートカット' : `${nearest.name} · 壁走りショートカット`;
  instruction.textContent = ready ? (touch ? '「ジャンプ」をタップ' : 'Space で壁ジャンプ') : '青緑の矢印に沿って壁走り → 金枠の JUMP で跳ぶ';
  hint.dataset.ready = String(!!ready); hint.hidden = false;
}
window.skyWallRunGuides = { root, routes: guides, update };
let last = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (now - last < 80) return;
  last = now; update();
}
update(); requestAnimationFrame(tick);
