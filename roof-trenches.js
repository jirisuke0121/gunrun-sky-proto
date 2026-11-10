// 中央屋上の溝（旧市街、2026-11-10）。
// 中央の屋上は約600㎡が1枚の平らな床で、横断は約5秒走るだけだった。
// 芯（中まで詰まった塊）の上だけを十字に掘り、屋上の縁の帯には低い柵を置く。
//   * 掘るのは芯の上（x -11〜11、z -11〜11 の内側）だけ。外周の回廊（屋内）と塔のトンネル（z -9.6〜-7.1）には触れない。
//   * 溝の深さは 1.8 m。落ちても、その場でよじ登って出られる（落下の罰は「数秒遅れる」だけ）。
//   * 東西の溝は幅 3 m、南北の溝は幅 4 m。同じリズムにしない。
//   * ゾンビは溝に降りて登り直す。人間は跳び越せるので、1本ごとに差が開く。
//   * 柵は高さ 1 m（乗り越え）。縁の帯をぐるっと走るだけで一周できないようにする。
(() => {
  const FLOOR = 6.2, TOP = 8;
  const TRENCHES = [
    { id: 'east-west', minX: -11, maxX: 11, minZ: 1, maxZ: 4 },
    { id: 'north-south', minX: -2, maxX: 2, minZ: -6, maxZ: 11 },
  ];
  // [x0, z0, x1, z1]。高さ 8〜9 m。
  const RAILS = [
    { id: 'west-north', box: [-14, -2.75, -11, -2.25] }, { id: 'west-south', box: [-14, 6.25, -11, 6.75] },
    { id: 'east', box: [11, 2.25, 14, 2.75] }, { id: 'east-south', box: [11, 9.25, 14, 9.75] },
    { id: 'south-west', box: [-4.75, 11, -4.25, 14] }, { id: 'south-east', box: [4.75, 11, 5.25, 14] },
    { id: 'north-east', box: [3.25, -14, 3.75, -12] },
    { id: 'north-west-yard', box: [-11, -5.75, -2.2, -5.25] }, // 北西の区画を南北に走り抜ける線（13 m）を切る
  ];
  const TINT = { floor: 0x6f8296, rail: 0xf0c53c };

  function build({ ne, jn }) {
    const tunnel = window.skyTowerTunnel;
    if (!tunnel) return null;
    const inside = (b, t, pad = 0) => b.maxX > t.minX + pad && b.minX < t.maxX - pad && b.maxZ > t.minZ + pad && b.minZ < t.maxZ - pad;
    const solidRoof = b => !b.hidden && !b.tunnel && (b.type === 'mono' || (b.type === 'slab' && b.minY >= 7.55 && b.maxY <= TOP + .05));
    let cut = 0;
    for (const t of TRENCHES)
      cut += tunnel.cut(jn, { minX: t.minX, maxX: t.maxX, minY: FLOOR - .2, maxY: TOP + .5, minZ: t.minZ, maxZ: t.maxZ }, solidRoof);
    // 溝の底。塊（mono）の天面は経路の対象外なので、屋根と同じ種類の床を張る。重なる所は1枚にまとめる。
    const floors = [
      [-11, 1, 11, 4, 'east-west'],
      [-2, -6, 2, 1, 'north-south'], [-2, 4, 2, 11, 'north-south'],
    ];
    for (const [x0, z0, x1, z1, id] of floors) {
      const f = ne(x0, FLOOR - .2, z0, x1, FLOOR, z1, 'slab');
      f.tint = TINT.floor; f.roofTrench = id;
    }
    // 屋上の小物: 溝に完全に入るものは底へ降ろす。縁にまたがるものは縁の外へ寄せる。
    for (const b of jn) {
      if (b.type !== 'prop' || b.minY < TOP - .05 || b.minY > TOP + 2) continue;
      for (const t of TRENCHES) {
        if (!inside(b, t)) continue;
        const within = b.minX >= t.minX && b.maxX <= t.maxX && b.minZ >= t.minZ && b.maxZ <= t.maxZ;
        if (within) { b.minY -= TOP - FLOOR; b.maxY -= TOP - FLOOR; }
        else if (b.maxZ > t.maxZ && b.minZ < t.maxZ) { const d = t.maxZ + .1 - b.minZ; b.minZ += d; b.maxZ += d; }
        else if (b.minZ < t.minZ && b.maxZ > t.minZ) { const d = b.maxZ - (t.minZ - .1); b.minZ -= d; b.maxZ -= d; }
        else if (b.maxX > t.maxX && b.minX < t.maxX) { const d = t.maxX + .1 - b.minX; b.minX += d; b.maxX += d; }
        else if (b.minX < t.minX && b.maxX > t.minX) { const d = b.maxX - (t.minX - .1); b.minX -= d; b.maxX -= d; }
        break;
      }
    }
    for (const r of RAILS) {
      const [x0, z0, x1, z1] = r.box, rail = ne(x0, TOP, z0, x1, TOP + 1, z1, 'beam');
      rail.tint = TINT.rail; rail.roofRail = r.id;
    }
    return { cut, floors: floors.length, rails: RAILS.length };
  }

  window.SKY_ROOF_TRENCHES = { FLOOR, TOP, TRENCHES, RAILS };
  window.buildRoofTrenches = build;
})();
