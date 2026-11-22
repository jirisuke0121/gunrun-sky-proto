// 意味のある物を足す（旧市街、2026-11-22）。docs/MAP_LINKS_2026-11-22.md
// 基準は撤去（map-prune.js）と同じ：その物があることで、次の行動が広がるか。
// 足場の高さの地図で調べると、中央屋上（8 m）の床から届かないのに近くにある高い足場は、東の塔の上（12 m、隙間3 m・上り4 m）だけだった。
// そこへ上がる石段を、屋上の北東に3つ置く（床からの高さが 2.0 → 3.0 → 3.4 m と上がっていく）。
//   北の箱（10 m）→ 石段1（10.0）→ 石段2（11.0）→ 石段3（11.4）→ 東の塔の上（12 m）→ ジップ・東塔・東の屋根へ。逆向きも通れる。
//   * 石段の間は2 m空いている。屋上の床を南北に走る人は、間を通り抜けられる。
//   * 石段1は床からよじ登れる（2.0 m）。石段2（3.0 m）は縁の1 m以上手前で跳ぶとつかめる。石段3（3.4 m）は床からは登れない
//     （跳んでつかめる高さは約3.2 mまで。実測）。
//   * 石段1は北の箱と同じ高さ。2.6 mにすると、上で銃を構えて止まっているだけで2分生き残れた（ノーマル6回中3回。北を箱、西を溝に
//     守られる位置のため）。2.0 mなら最長98秒で、今ある塔の上の西端（最長118秒）より短い。
//   * 追手も壁を登ってくる（3.6 mまで登れる）。安全地帯にはならない（実測）。
//   * 北の箱は、これで「登るだけの箱」から「高い道の入口」になる。
// 動きは通常の物理だけ（加速も自動操作もない）。?links=0 で足す前のマップ。
// 試して入れなかった形: 柱で支えた木の足場（下が空いている）。当たり判定つきの柱は、柱の線の上を走った人をその場で止めた。
// 柱を見た目だけにすると追手が登れず、足場の上で銃を構えて止まっているだけで2分生き残れた（ノーマル3回中3回）。
(() => {
  const OFF = new URLSearchParams(location.search).get('links') === '0';
  const ROOF = 8;
  // 石段: 東へ向かって高くなる。z の幅は、塔の上の樽（z -5.7〜-4.3）を外した着地帯に合わせる。
  const STEPS = [
    { id: 'step-1', minX: 3.6, maxX: 5.8, minZ: -4.2, maxZ: -2, top: 10 },
    { id: 'step-2', minX: 7.8, maxX: 10, minZ: -4.2, maxZ: -2, top: 11 },
    { id: 'step-3', minX: 12, maxX: 14, minZ: -4.2, maxZ: -2, top: 11.4 },
  ];
  const BOX = { minX: 2, maxX: 7, maxZ: -7, top: 10 }, TOWER = { minX: 17, minZ: -6, maxZ: -1.5, top: 12 };
  // 踏み切りの目印（橙の線。見た目だけ）: [x0, z0, x1, z1, y]
  const [S1, S2, S3] = STEPS, Z0 = S1.minZ + .1, Z1 = S1.maxZ - .1;
  const MARKS = [
    [S1.minX, BOX.maxZ - .22, S1.maxX, BOX.maxZ - .08, BOX.top],                 // 北の箱の南の縁
    [S1.minX + .1, S1.minZ + .08, S1.maxX - .1, S1.minZ + .22, S1.top],          // 石段1の北の縁
    [S1.maxX - .22, Z0, S1.maxX - .08, Z1, S1.top], [S2.minX + .08, Z0, S2.minX + .22, Z1, S2.top],
    [S2.maxX - .22, Z0, S2.maxX - .08, Z1, S2.top], [S3.minX + .08, Z0, S3.minX + .22, Z1, S3.top],
    [S3.maxX - .22, Z0, S3.maxX - .08, Z1, S3.top], [TOWER.minX + .08, Z0, TOWER.minX + .22, Z1, TOWER.top],
  ];
  const info = { ROOF, STEPS, MARKS, BOX, TOWER, off: OFF, built: false };

  function build({ ne }) {
    if (OFF) return null;
    for (const s of STEPS) {
      const step = ne(s.minX, ROOF, s.minZ, s.maxX, s.top, s.maxZ, 'slab');
      step.mapLink = s.id;
    }
    info.built = true;
    return info;
  }
  window.SKY_MAP_LINKS = info;
  window.buildMapLinks = build;

  addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game || !info.built) return;
    const { Mesh, Basic, BufferGeometry, Float32Attribute } = game.Geom;
    if (!BufferGeometry || !Float32Attribute) return;
    // 目印は1枚のメッシュにまとめる（描画1回）。
    const pos = [];
    for (const [x0, z0, x1, z1, y0] of MARKS) {
      const y = y0 + .02;
      pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    }
    const geo = new BufferGeometry(); geo.setAttribute('position', new Float32Attribute(new Float32Array(pos), 3));
    const marks = new Mesh(geo, new Basic({ color: 0xffa21f })); marks.name = 'Map link marks';
    game.ue.add(marks); info.marks = MARKS.length;
  });
})();
