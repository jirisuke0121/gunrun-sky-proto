// 窓破りダイブ（旧市街、2026-11-11）。北西の角から、中央ブロック西面の窓へ跳び込む。
//   * 北西の階段の上（4.2 m）から東へ踏み切り台を張り出す。台の端から窓（西の壁、高さ 4〜7.2 m・幅 1.8 m）まで 3.6 m。
//   * 走って端で跳ぶ → ガラスを突き破る → 屋内の北の通路（4 m）に着地し、そのまま東へ15 m走り抜けられる。
//     足りなければ窓の下の縁につかまる。横にそれると壁に当たって路地（0 m）へ落ちる（ダメージなし、追手との差を失う）。
//   * 動きは通常の物理だけ（加速も自動操作もない）。ガラスは見た目と音だけで、当たり判定はない。1試合に1回割れる。
//   * 西→中央へ高所のまま戻る3本目の道（櫓、南西の窓に続く）。ゾンビは跳ばないので、階段で回り込む。
//   * 台は路地（0 m）から4.2 m。下からは登れない。
// 座標は x 東・y 上・z 南。
(() => {
  const WINDOW = { minX: -14, maxX: -13, minZ: -12.9, maxZ: -11.1, minY: 4, maxY: 7.2 };
  const PAD = { minX: -20.6, maxX: -17.6, minZ: -12.9, maxZ: -11.1, y: 4.2, thick: .3 };
  const PANE = { x: -14.04, minZ: WINDOW.minZ, maxZ: WINDOW.maxZ, minY: WINDOW.minY, maxY: WINDOW.maxY };
  const TINT = { pad: 0x8ea4bd, frame: 0xf0c53c };
  // 台の端で、速さ v で跳んだとき、窓の面（x = -14）での足と頭の高さ。early は端より手前で踏み切った距離。
  function entry(v = 6, jumpVel = 7.2, gravity = 20, early = 0, height = 1.75) {
    const t = (WINDOW.minX - PAD.maxX + early) / v, feet = PAD.y + jumpVel * t - .5 * gravity * t * t;
    return { seconds: t, feet, head: feet + height, sill: WINDOW.minY, lintel: WINDOW.maxY };
  }
  function build({ ne, jn }) {
    const tunnel = window.skyTowerTunnel;
    if (!tunnel) return null;
    // 窓: 西の外壁（塊）を、窓の形だけ抜く。上の 0.8 m（屋根の下）と左右の壁は残る。
    const cut = tunnel.cut(jn, WINDOW, b => b.type === 'mono' && !b.hidden && !b.tunnel && b.minX <= -13.99 && b.maxX <= -12.99 && b.maxZ <= -1);
    // 抜いた下の壁の天面（4.0 m）は塊なので、歩ける床を1枚張る（屋内の床と同じ高さ）。
    const sill = ne(WINDOW.minX, 3.8, WINDOW.minZ, WINDOW.maxX, 4, WINDOW.maxZ, 'slab'); sill.windowDive = 'sill';
    const pad = ne(PAD.minX, PAD.y - PAD.thick, PAD.minZ, PAD.maxX, PAD.y, PAD.maxZ, 'beam');
    pad.tint = TINT.pad; pad.windowDive = 'pad';
    for (const z of [WINDOW.minZ - .12, WINDOW.maxZ]) { // 窓枠の目印（窓の外側。開口は狭めない）
      const post = ne(-14.12, WINDOW.minY, z, -14, WINDOW.maxY, z + .12, 'beam'); post.tint = TINT.frame; post.windowDive = 'frame';
    }
    return { cut, pad };
  }
  window.SKY_WINDOW_DIVE = { WINDOW, PAD, PANE };
  window.skyWindowDive = { entry };
  window.buildWindowDive = build;

  addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game || !window.skyOldTownSwingCourse || window.skyPracticeMode) return;
    const { c, U } = game, stats = window.__game.stats;
    const { Box, Mesh, Group, Basic } = game.Geom;
    const group = new Group(); group.name = 'Window dive';
    const orange = new Basic({ color: 0xffa21f });
    const glassMat = new Basic({ color: 0xa9dcff, transparent: true, opacity: .34, depthWrite: false });
    const w = PANE.maxZ - PANE.minZ, h = PANE.maxY - PANE.minY, zc = (PANE.minZ + PANE.maxZ) / 2, yc = (PANE.minY + PANE.maxY) / 2;
    const pane = new Mesh(new Box(.04, h, w), glassMat); pane.position.set(PANE.x, yc, zc); group.add(pane);
    // ガラスだと分かるように、斜めの白い筋を2本。
    const streakMat = new Basic({ color: 0xffffff, transparent: true, opacity: .5, depthWrite: false });
    const streaks = [[.25, -.3], [-.2, .25]].map(([dy, dz]) => { const m = new Mesh(new Box(.045, 1.1, .07), streakMat); m.position.set(PANE.x, yc + dy, zc + dz); m.rotation.x = .6; group.add(m); return m; });
    // 台の上の印: 両脇の線と、東（窓）へ向かう矢印、端の踏み切り線。
    const mark = (wx, dz, x, z) => { const m = new Mesh(new Box(wx, .03, dz), orange); m.position.set(x, PAD.y + .02, z); group.add(m); return m; };
    mark(PAD.maxX - PAD.minX, .08, (PAD.minX + PAD.maxX) / 2, PAD.minZ + .1); mark(PAD.maxX - PAD.minX, .08, (PAD.minX + PAD.maxX) / 2, PAD.maxZ - .1);
    mark(.14, PAD.maxZ - PAD.minZ, PAD.maxX - .1, zc);
    for (const x of [-20, -19.1, -18.2]) for (const side of [-1, 1]) { const s = mark(.6, .09, x, zc + side * .2); s.rotation.y = side * .62; }
    // 破片（使い回し）。
    const shardMat = new Basic({ color: 0xd4eeff, transparent: true, opacity: .8, depthWrite: false });
    const shards = Array.from({ length: 18 }, (_, i) => { const m = new Mesh(new Box(.03, .1 + .14 * ((i * 7) % 5) / 4, .08 + .12 * ((i * 3) % 4) / 3), shardMat); m.visible = false; group.add(m); return { m, v: [0, 0, 0], spin: 0 }; });
    game.ue.add(group);

    let broken = false, flying = 0, prevX = null, lastT = 0;
    const playing = () => game.modeRef() === 'play' && !game.z.over;
    function restore() { broken = false; flying = 0; pane.visible = true; for (const s of streaks) s.visible = true; for (const s of shards) s.m.visible = false; }
    function smash(dir, y, z, speed, dive) {
      broken = true; flying = .9; pane.visible = false; for (const s of streaks) s.visible = false;
      shards.forEach((s, i) => {
        const a = i * 2.399, r = .15 + .55 * ((i * 5) % 7) / 6;
        s.m.position.set(PANE.x, Math.min(PANE.maxY - .1, Math.max(PANE.minY + .1, y + .9 + Math.sin(a) * r)), Math.min(PANE.maxZ - .1, Math.max(PANE.minZ + .1, z + Math.cos(a) * r * .8)));
        s.v = [dir * (1.5 + speed * (.25 + .5 * ((i * 3) % 5) / 4)), 1.2 + 2.2 * ((i * 7) % 6) / 5, Math.cos(a) * 1.8];
        s.spin = 6 + i % 5 * 3; s.m.visible = true;
      });
      game.Mn?.(.22, 5200, 1.1, .3, 'highpass'); game.Mn?.(.12, 2300, 3, .12, 'bandpass'); // 合成の割れる音
      c.shake = Math.max(c.shake || 0, dive ? .3 : .12);
      stats.windowBreaks = (stats.windowBreaks || 0) + 1;
      if (dive) stats.windowDives = (stats.windowDives || 0) + 1;
    }
    function step(dt) {
      if (game.z.t < lastT - .5 || (broken && !playing() && game.modeRef() !== 'pause')) restore(); // 試合のやり直し
      lastT = game.z.t;
      if (flying > 0) {
        flying -= dt;
        for (const s of shards) { if (!s.m.visible) continue; s.v[1] -= U.gravity * dt; s.m.position.x += s.v[0] * dt; s.m.position.y += s.v[1] * dt; s.m.position.z += s.v[2] * dt; s.m.rotation.x += s.spin * dt; s.m.rotation.z += s.spin * .7 * dt; if (flying <= 0 || s.m.position.y < 3.9) s.m.visible = false; }
      }
      const p = c.pos;
      if (playing() && !broken && prevX !== null && (prevX - PANE.x) * (p.x - PANE.x) < 0 && Math.abs(p.x - prevX) < 1.5 &&
          p.z > PANE.minZ - .1 && p.z < PANE.maxZ + .1 && p.y > PANE.minY - .5 && p.y < PANE.maxY) {
        // 飛び込み = 外から、空中で入った。
        smash(p.x > prevX ? 1 : -1, p.y, p.z, Math.hypot(c.vel.x, c.vel.z), p.x > prevX && !c.onGround);
      }
      prevX = p.x;
      return false;
    }
    Object.assign(window.skyWindowDive, { step, restore, broken: () => broken, group });
  });
})();
