// Only connected stair flights bypass automatic vaulting. Walls, isolated
// blocks, airborne ledge grabs and approaches from the side still use jc.
(() => {
  const flights = [];
  function tag(steps, id) {
    if (steps.length < 2) return;
    const first = steps[0], last = steps.at(-1);
    const axis = Math.abs(last.minX-first.minX) > Math.abs(last.minZ-first.minZ) ? 'x' : 'z';
    const along = axis === 'x' ? 'X' : 'Z', across = axis === 'x' ? 'Z' : 'X';
    const flight = { id, axis,
      from: Math.min(...steps.map(b=>b['min'+along])), to: Math.max(...steps.map(b=>b['max'+along])),
      left: Math.max(...steps.map(b=>b['min'+across])), right: Math.min(...steps.map(b=>b['max'+across])),
      low: Math.min(...steps.map(b=>b.maxY)), high: Math.max(...steps.map(b=>b.maxY)), steps };
    // Keep editor/audit JSON serializable: the flight points back to its steps.
    for (const step of steps) Object.defineProperty(step, 'walkStair', { value: flight, configurable: true });
    flights.push(flight);
    return flight;
  }
  function canWalk(player, dx, dz, block) {
    if (!player.onGround || player.vel.y > 0) return false;
    // The player must already be in the flight's lane and facing along it.
    // Do not turn its tall side or its upper landing into an automatic lift.
    return flights.some(f => {
      const along = player.pos[f.axis], across = player.pos[f.axis === 'x' ? 'z' : 'x'];
      if (!(Math.abs(f.axis === 'x' ? dx : dz) >= .5 &&
      along >= f.from-player.r-.05 && along <= f.to+player.r+.05 &&
      across > f.left+.02 && across < f.right-.02 &&
      player.pos.y >= f.low-.43 && player.pos.y <= f.high+.05 &&
      f.steps.some(b => player.pos.x+player.r > b.minX && player.pos.x-player.r < b.maxX &&
        player.pos.z+player.r > b.minZ && player.pos.z-player.r < b.maxZ &&
        Math.abs(b.maxY-player.pos.y) <= .42))) return false;
      if (block.walkStair === f) return true;
      // The final tread may join an ordinary roof/landing, or another flight.
      // Exempt only a physically touching <=42cm continuation at that end.
      const axis=f.axis==='x'?'X':'Z', perpendicular=f.axis==='x'?'Z':'X';
      if (across+player.r<=block['min'+perpendicular] || across-player.r>=block['max'+perpendicular]) return false;
      return f.steps.some(b => (Math.abs(b['min'+axis]-f.from)<.001 || Math.abs(b['max'+axis]-f.to)<.001) &&
        block['min'+axis] <= b['max'+axis]+.02 && block['max'+axis] >= b['min'+axis]-.02 &&
        Math.abs(block.maxY-b.maxY)<=.42);
    });
  }
  window.skyStairWalk = { tag, canWalk, flights };
})();
