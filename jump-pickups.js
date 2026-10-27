import { pickupNodes, segmentDistance } from './dash-boost.js?v=20261028-playground-v1';

export const JUMP_DROP_FIRST = 8;
export const JUMP_DROP_RESPAWN = 24;
const DROP_SECONDS = .65;

// Two reusable drops on connected floors; all timing follows the simulation.
export function createJumpPickups(sky, game) {
  const { c, z, Geom: T } = sky;
  const root = new T.Group(); root.name = 'JUMP item drops'; sky.ue.add(root);
  const amber = new T.Basic({ color: 0xffc568, transparent: true, opacity: .95, depthWrite: false });
  const ringGeometry = new T.Torus(.43, .04, 5, 24), coreGeometry = new T.Box(.25, .42, .25);
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
  const context = canvas.getContext('2d'); context.font = '700 44px system-ui'; context.textAlign = 'center';
  context.lineWidth = 7; context.strokeStyle = '#573313'; context.fillStyle = '#ffe2a2';
  context.strokeText('JUMP', 128, 56); context.fillText('JUMP', 128, 56);
  const labelMaterial = new T.SpriteMaterial({ map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false });
  const items = Array.from({ length: 2 }, (_, id) => {
    const group = new T.Group(), ring = new T.Mesh(ringGeometry, amber), core = new T.Mesh(coreGeometry, amber);
    const label = new T.Sprite(labelMaterial); label.scale.set(.95, .3, 1); label.position.y = .7;
    core.rotation.z = Math.PI / 4; group.add(ring, core, label); root.add(group); group.visible = false;
    return { id, group, ring, node: null, cooldown: JUMP_DROP_FIRST + id * 10, drop: 0 };
  });
  const rule = document.querySelector('#ovStart .rules .keys');
  if (rule) {
    const li = document.createElement('li');
    li.textContent = '金色のJUMPは定期補給。拾うと1発装備し、発射で足元を自動撃ちして跳ぶ。使用後は元の武器に戻る';
    rule.appendChild(li);
  }
  let time = 0, previous = null;
  function reset() {
    time = 0; previous = null; game.stats.jumpGunPickups = 0;
    items.forEach(item => { item.cooldown = window.skyPracticeMode ? 0 : JUMP_DROP_FIRST + item.id * 10; item.drop = 0; item.group.visible = false; });
  }
  function placePickups(position, yaw) {
    const selected = window.skyPracticeMode ? window.skyPracticeCourse.jumpPositions.map(([x,y,z],id)=>({x,y,z,id})) : pickupNodes(game.NAV, position, yaw, n =>
      !window.skyDash.pickups.some(p => Math.hypot(p.position[0] - n.x, p.position[1] - n.y, p.position[2] - n.z) < 3) &&
      [[0, 0], [.48, 0], [-.48, 0], [0, .48], [0, -.48]].every(([x, dz]) => sky.oe(n.x + x, n.y + .05, n.z + dz, .28, 3.6)), [9, 25]);
    items.forEach((item, i) => {
      item.node = selected[i] || null;
      item.group.visible = false;
    });
    previous = null;
  }
  function step(dt) {
    if (sky.modeRef() !== 'play' || z.over || z.mission) return;
    time += dt;
    const to = c.pos.toArray(), from = previous || to;
    const teleported = Math.hypot(...from.map((v, k) => v - to[k])) > 4;
    for (const item of items) {
      if (!item.node) continue;
      if (item.cooldown > 0) {
        item.cooldown = Math.max(0, item.cooldown - dt);
        if (item.cooldown === 0) item.drop = DROP_SECONDS;
        continue;
      }
      item.drop = Math.max(0, item.drop - dt);
      if (item.drop > 0 || window.skyJumpGun.carrying) continue;
      const point = [item.node.x, item.node.y + 1.05, item.node.z];
      const a = (teleported ? to : from).map((v, k) => v + (k === 1 ? .9 : 0));
      const b = to.map((v, k) => v + (k === 1 ? .9 : 0));
      if (segmentDistance(point, a, b) < 1 && window.skyJumpGun.grant()) {
        item.cooldown = window.skyPracticeMode ? 3 : JUMP_DROP_RESPAWN; item.group.visible = false;
        game.stats.jumpGunPickups = (game.stats.jumpGunPickups || 0) + 1;
        sky.Tt.mark?.();
      }
    }
    previous = to;
  }
  function frame() {
    root.visible = sky.modeRef() === 'play' && !z.over && !z.mission;
    for (const item of items) {
      item.group.visible = !!item.node && item.cooldown <= 0;
      if (!item.node) continue;
      const falling = item.drop / DROP_SECONDS;
      item.group.position.set(item.node.x, item.node.y + 1.05 + falling * falling * 2.5 + Math.sin(time * 2.4 + item.id) * .08, item.node.z);
      item.ring.rotation.y = time * 1.8;
    }
    document.body.dataset.skyJumpPickups = JSON.stringify({
      carrying: window.skyJumpGun.carrying,
      collected: game.stats.jumpGunPickups || 0,
      items: items.filter(i => i.node).map(i => ({ position: [i.node.x, i.node.y, i.node.z], cooldown: +i.cooldown.toFixed(2), dropping: i.drop > 0 }))
    });
  }
  return { step, frame, reset, placePickups,
    get pickups() { return items.filter(i => i.node).map(i => ({ position: [i.node.x, i.node.y, i.node.z] })); }
  };
}
