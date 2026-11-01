// Each building stays closed to enemies until the human enters it this round.
// Use the map's interior volumes; walking on a roof does not count as entry.
window.createSkyIndoorAccess = function (volumes) {
  const rooms = volumes.map((bounds, id) => ({ ...bounds, id, entered: false }));
  const edgeRooms = new WeakMap();
  let revision = 0;
  const inside = (p, b, inset = 0) => p.x > b.minX + inset && p.x < b.maxX - inset &&
    p.z > b.minZ + inset && p.z < b.maxZ - inset && p.y >= b.minY && p.y < b.maxY - .05;
  function intersects(from, to, b, radius = 0) {
    let first = 0, last = 1;
    for (const axis of ['x', 'y', 'z']) {
      const padding = axis === 'y' ? 0 : radius;
      const min = b['min' + axis.toUpperCase()] - padding;
      const max = b['max' + axis.toUpperCase()] + padding - (axis === 'y' ? .05 : 0);
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 1e-9) {
        if (from[axis] <= min || from[axis] >= max) return false;
      } else {
        const a = (min - from[axis]) / delta, c = (max - from[axis]) / delta;
        first = Math.max(first, Math.min(a, c)); last = Math.min(last, Math.max(a, c));
        if (first >= last) return false;
      }
    }
    return true;
  }
  function observe(point) {
    for (const room of rooms) if (!room.entered && inside(point, room, room.entryInset || 0)) {
      room.entered = true; revision++;
    }
  }
  const allows = point => rooms.every(room => room.entered || !inside(point, room));
  const allowsMove = (from, to, radius = 0) => rooms.every(room => room.entered || !intersects(from, to, room, radius));
  function edgeAllowed(edge, nav) {
    let crossed = edgeRooms.get(edge);
    if (!crossed) {
      crossed = rooms.filter(room => intersects(nav.nodes[edge.from], nav.nodes[edge.to], room));
      edgeRooms.set(edge, crossed);
    }
    return crossed.every(room => room.entered);
  }
  function doorAllowed(bounds) {
    return rooms.every(room => room.entered || !(bounds.maxX > room.minX && bounds.minX < room.maxX &&
      bounds.maxZ > room.minZ && bounds.minZ < room.maxZ && bounds.minY < room.maxY && bounds.maxY > room.minY));
  }
  function updateZombie(enemy, dt) {
    const { x, y, z } = enemy.pos;
    enemy.update(dt);
    if (enemy.dead || enemy.remove || allowsMove({ x, y, z }, enemy.pos)) return;
    enemy.pos.set(x, y, z); enemy.vel.set(0, 0, 0);
    enemy.act = enemy.fall = enemy.rise = null;
    enemy.edge = -1; enemy.navT = 0; enemy.atkT = 0;
    enemy.anim(0);
  }
  return {
    observe, allows, allowsMove, edgeAllowed, doorAllowed, updateZombie,
    reset(point) { for (const room of rooms) room.entered = false; revision++; if (point) observe(point); },
    snapshot() { return rooms.map(room => ({ ...room })); },
    get revision() { return revision; },
  };
};
