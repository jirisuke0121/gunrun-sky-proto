import { segmentDistance } from './dash-boost.js?v=20261027-jump-items-v1';

// Unity WeaponItem.prefab / WeaponGenerator: one box every 10 seconds, cap 5.
// The 30-second clock belongs to Unity's six-participant infection mode.
export const WEAPON_DROP_INTERVAL = 10;
export const WEAPON_DROP_LIMIT = 5;
const FALL_SECONDS = 1.4, ITEM_SECONDS = 50;
const TYPES = [
  { index: 1, name: 'SG', color: 0xffaf61, height: 3.5, distance: 15 },
  { index: 2, name: 'SMG', color: 0x78e7b0, height: 5, distance: 23 },
  { index: 3, name: 'MG', color: 0xc0a0ff, height: 8, distance: 30 },
];

// Use the actual directed traversal graph in both directions. A roof must be
// reachable from the start and offer a way back, including climbs and ladders.
function reachable(graph, start, reverse = false) {
  const seen = new Uint8Array(graph.nodes.length), queue = [start]; seen[start] = 1;
  for (let i = 0; i < queue.length; i++) for (const id of (reverse ? graph.inn : graph.out)[queue[i]] || []) {
    const edge = graph.E[id], next = reverse ? edge.from : edge.to;
    if (seen[next] || edge.door && !edge.door.off) continue;
    seen[next] = 1; queue.push(next);
  }
  return seen;
}

export function createWeaponDrops(sky, game) {
  const { c, z, U, Et, Geom: T } = sky;
  const root = new T.Group(); root.name = 'Parkour weapon supplies'; sky.ue.add(root);
  const geometry = new T.Box(.54, .38, .54), bandGeometry = new T.Box(.58, .09, .58);
  const ringGeometry = new T.Torus(.58, .035, 5, 28), beamGeometry = new T.Cylinder(.025, .025, 2.6, 5);
  const crateMaterial = new T.Standard({ color: 0x303b3c, roughness: .8 });
  const materials = TYPES.map(type => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext('2d'); ctx.font = '800 54px system-ui'; ctx.textAlign = 'center';
    ctx.lineWidth = 9; ctx.strokeStyle = '#1b242c'; ctx.fillStyle = `#${type.color.toString(16)}`;
    ctx.strokeText(type.name, 128, 68); ctx.fillText(type.name, 128, 68);
    return { color: new T.Basic({ color: type.color }), label: new T.SpriteMaterial({ map: new T.CanvasTexture(canvas), depthWrite: false }) };
  });
  const items = Array.from({ length: WEAPON_DROP_LIMIT }, () => {
    const body = new T.Group(), group = new T.Group(), crate = new T.Mesh(geometry, crateMaterial);
    const band = new T.Mesh(bandGeometry, materials[0].color), ring = new T.Mesh(ringGeometry, materials[0].color);
    const beam = new T.Mesh(beamGeometry, materials[0].color), label = new T.Sprite(materials[0].label);
    ring.rotation.x = -Math.PI / 2; beam.position.y = 1.3;
    label.position.y = 1; label.scale.set(1.4, .525, 1);
    body.add(crate, band, label); group.add(body, ring, beam); root.add(group); group.visible = false;
    return { group, body, band, ring, beam, label, node: null, type: 0, age: 0 };
  });
  const status = document.createElement('div'); status.id = 'weaponSupplyStatus'; status.hidden = true;
  document.getElementById('hud').append(status);
  const style = document.createElement('style');
  style.textContent = '#weaponSupplyStatus{position:absolute;top:152px;left:16px;max-width:210px;padding:7px 10px;border-left:3px solid #ffca86;background:#263235df;color:#fff3d8;font:700 12px/1.65 system-ui;pointer-events:none}#weaponSupplyStatus[hidden]{display:none}@media(max-height:500px){#weaponSupplyStatus{top:100px;left:10px;font-size:10px;max-width:170px;padding:4px 7px}}';
  document.head.append(style);
  let candidates = [], previous = null, recent = [], elapsed = 0, next = WEAPON_DROP_INTERVAL, sequence = 0;
  let spawned = 0, collected = 0;

  function reset() {
    sky.resetWeaponRun();
    elapsed = sequence = spawned = collected = 0; next = WEAPON_DROP_INTERVAL;
    previous = null; recent = []; candidates = [];
    game.stats.weaponPickups = 0;
    items.forEach(item => { item.node = null; item.group.visible = false; });
    status.hidden = true;
  }
  function placePickups(position) {
    // Called once at the round spawn; respawns do not move existing supplies.
    if (candidates.length || z.mission) return;
    const graph = game.NAV, start = game.nodeAt(position.x, position.y + .1, position.z);
    if (start < 0) return;
    const from = reachable(graph, start), back = reachable(graph, start, true);
    candidates = graph.nodes.filter(n => {
      if (!from[n.id] || !back[n.id] || n.y < 1.5 || n.id % 3) return false;
      if ((graph.out[n.id] || []).filter(id => graph.E[id].kind === 0).length < 3) return false;
      // Wide landing and headroom; reject walls, thin ledges and covered floors.
      for (const [dx, dz] of [[0, 0], [.65, 0], [-.65, 0], [0, .65], [0, -.65]]) {
        if (!sky.oe(n.x + dx, n.y + .05, n.z + dz, .28, 2.6)) return false;
        const floor = sky.raycast(n.x + dx, n.y + .2, n.z + dz, 0, -1, 0, .4);
        if (!floor || Math.abs(floor.b.maxY - n.y) > .12) return false;
      }
      const ceiling = sky.raycast(n.x, n.y + 1, n.z, 0, 1, 0, 6);
      n.weaponDropHeight = ceiling ? Math.min(6, ceiling.t - .4) : 6;
      return n.weaponDropHeight >= 2;
    });
  }
  function spawn() {
    const item = items.find(i => !i.node);
    if (!item) return;
    const type = TYPES[sequence % TYPES.length];
    const otherItems = [...(window.skyDash?.pickups || []), ...(window.skyJumpPickups?.pickups || [])];
    let pick = null, best = Infinity;
    for (const n of candidates) {
      const distance = Math.hypot(n.x - c.pos.x, n.z - c.pos.z);
      if (distance < 8 || distance > 48 || recent.some(p => Math.hypot(p.x - n.x, p.z - n.z) < 10)) continue;
      if (items.some(i => i.node && Math.hypot(i.node.x - n.x, i.node.z - n.z) < 7)) continue;
      if (otherItems.some(p => Math.hypot(p.position[0] - n.x, p.position[1] - n.y, p.position[2] - n.z) < 3)) continue;
      const score = Math.abs(distance - type.distance) + Math.abs(n.y - type.height) * 2 + Math.random() * 3;
      if (score < best) { best = score; pick = n; }
    }
    if (!pick) return;
    item.node = pick; item.type = sequence % TYPES.length; item.age = 0;
    const material = materials[item.type];
    item.band.material = item.ring.material = item.beam.material = material.color;
    item.label.material = material.label; item.group.position.set(pick.x, pick.y + 1, pick.z);
    recent.push(pick); if (recent.length > 2) recent.shift();
    sequence++; spawned++;
    sky.rn(`${type.name}補給！ 屋根・上層の光る武器箱へ`);
  }
  function collect(item) {
    const type = TYPES[item.type], profile = sky.WP[type.index];
    U.gunOn = true; sky.equipWeapon(type.index);
    Object.assign(Et, { mag: profile.mag, reloadLen: profile.rl, ammo: profile.mag,
      reserve: U.reserveAmmo >= 99 ? 99 : profile.res, reloadT: 0, autoReload: 0, fireCD: .18, held: false, trigger: 0 });
    item.node = null; item.group.visible = false; collected++;
    game.stats.weaponPickups = collected;
    sky.Tt.mark?.(); sky.rn(`${type.name}取得！ ${profile.mag}発装填・移動しながら撃てる`);
  }
  function step(dt) {
    if (sky.modeRef() !== 'play' || z.over || z.mission) return;
    elapsed += dt;
    const to = c.pos.toArray(), from = previous && Math.hypot(...to.map((v, k) => v - previous[k])) < 4 ? previous : to;
    for (const item of items) {
      if (!item.node) continue;
      item.age += dt;
      if (item.age + 1e-6 >= ITEM_SECONDS) { item.node = null; continue; }
      if (item.age < FALL_SECONDS || window.skyJumpGun?.carrying || ['ledge', 'ladder', 'swing'].includes(c.state)) continue;
      const point = [item.node.x, item.node.y + 1, item.node.z];
      const a = from.map((v, k) => v + (k === 1 ? .9 : 0)), b = to.map((v, k) => v + (k === 1 ? .9 : 0));
      if (segmentDistance(point, a, b) >= .9) continue;
      const dx = point[0] - b[0], dy = point[1] - b[1], dz = point[2] - b[2], distance = Math.hypot(dx, dy, dz);
      // Nearby items on another floor or behind a wall cannot be taken.
      if (distance > .01 && sky.raycast(b[0], b[1], b[2], dx / distance, dy / distance, dz / distance, distance)) continue;
      collect(item);
    }
    if (elapsed + 1e-6 >= next) { next += WEAPON_DROP_INTERVAL; spawn(); }
    previous = to;
  }
  function frame() {
    const playing = sky.modeRef() === 'play' && !z.over && !z.mission;
    root.visible = playing; status.hidden = !playing;
    const active = items.filter(i => i.node);
    for (const item of items) {
      item.group.visible = !!item.node;
      if (!item.node) continue;
      const fall = Math.max(0, 1 - (item.age / FALL_SECONDS) ** 2);
      item.body.position.y = fall * item.node.weaponDropHeight + Math.sin(elapsed * 2.4) * .06;
      item.body.rotation.y = elapsed * .6; item.ring.position.y = -.93;
      item.beam.visible = item.age < FALL_SECONDS || Math.sin(elapsed * 2) > -.6;
    }
    const target = active.reduce((best, item) => !best || c.pos.distanceTo(item.group.position) < c.pos.distanceTo(best.group.position) ? item : best, null);
    const wait = Math.max(0, Math.ceil(next - elapsed));
    if (target) {
      const dx = target.node.x - c.pos.x, dz = target.node.z - c.pos.z, dy = target.node.y - c.pos.y;
      const angle = Math.atan2(dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), -dx * Math.sin(c.yaw) - dz * Math.cos(c.yaw));
      const arrow = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][(Math.round(angle / (Math.PI / 4)) + 8) % 8];
      status.textContent = `${arrow} ${TYPES[target.type].name}補給 ${Math.round(Math.hypot(dx, dz))}m${dy > 1 ? `・上へ${Math.round(dy)}m` : ''}　次${wait}秒`;
    } else status.textContent = `武器補給まで${wait}秒　屋根・上層へ`;
    document.body.dataset.skyWeaponDrops = JSON.stringify({ interval: WEAPON_DROP_INTERVAL, limit: WEAPON_DROP_LIMIT,
      elapsed: +elapsed.toFixed(2), next: +next.toFixed(2), spawned, collected, candidates: candidates.length, weapon: U.weapon | 0,
      items: active.map(i => ({ weapon: TYPES[i.type].name, position: [i.node.x, i.node.y, i.node.z], age: +i.age.toFixed(2), falling: i.age < FALL_SECONDS })) });
  }
  return { reset, placePickups, step, frame };
}
