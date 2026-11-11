// 大スイング（旧市街、2026-11-11）。東塔の屋上（14.4 m）の南の縁から、ロープで南の屋根（4.4 m）へ振り下りる。
//   * 屋上の印（x 42 の帯）を南へ走り、縁で跳ぶと、縁の先に下がっている取っ手をつかむ。
//   * 半径 10 m の弧を約2秒で振り、弧の上がり際で手を離して南の屋根に降りる。高低差は約10 m。
//   * 動きは決まった弧（塔のトンネルと同じ「見える仕掛け」）。操作は効かない。技や被弾による加速ではない。
//   * 片道（屋根から塔へは戻れない）。使うとロープは約2.6秒で塔へ戻る。ゾンビは使えない。
// 座標は x 東・y 上・z 南。
(() => {
  const X = 42, PIVOT_Y = 16.9, PIVOT_Z = 4.5, L = 10, HANDS = 1.9; // 足から手までの高さ
  const TH_START = -86 * Math.PI / 180, TH_END = 24 * Math.PI / 180;
  const V_MIN = 6, V_MAX = 14, V_RELEASE = 4, RETURN_SECONDS = 2.6;
  // つかめる範囲（足の位置）。塔の縁は z = -6。南向きに、空中で入ったときだけ。
  const GRAB = { minX: X - .85, maxX: X + .85, minZ: -5.95, maxZ: -4.3, minY: 13.3, maxY: 16.2, minSpeedZ: 2 };
  const MAST = { x: 40.69, z: 5.12, w: .14, base: 4.4, top: PIVOT_Y + .25 }; // 南の屋根の北の縁に立つ柱
  const TINT = { mast: 0x243c52 };
  const hand = th => ({ y: PIVOT_Y - L * Math.cos(th), z: PIVOT_Z + L * Math.sin(th) });
  const feet = th => { const h = hand(th); return { x: X, y: h.y - HANDS, z: h.z }; };
  const arcLength = L * (TH_END - TH_START);
  // 弧の上での速さ: 下りは落差ぶん速くなり（上限あり）、上がりは離す速さまで落とす。
  function speedAt(th, gravity = 20) {
    const drop = hand(TH_START).y - hand(Math.min(th, 0)).y, down = Math.min(V_MAX, Math.sqrt(V_MIN * V_MIN + 2 * gravity * drop));
    if (th <= 0) return down;
    const f = th / TH_END; return down + (V_RELEASE - down) * f * f;
  }
  function releaseVelocity() { return { x: 0, y: Math.sin(TH_END) * V_RELEASE, z: Math.cos(TH_END) * V_RELEASE }; }
  // 離してから屋根（y = roof）に着くまで。
  function flight(roof = 4.4, gravity = 20) {
    const p = feet(TH_END), v = releaseVelocity(), t = (v.y + Math.sqrt(v.y * v.y + 2 * gravity * (p.y - roof))) / gravity;
    return { from: p, seconds: t, landZ: p.z + v.z * t, apex: p.y + v.y * v.y / (2 * gravity) };
  }
  function build({ ne }) {
    const mast = ne(MAST.x - MAST.w / 2, MAST.base, MAST.z - MAST.w / 2, MAST.x + MAST.w / 2, MAST.top, MAST.z + MAST.w / 2, 'beam');
    mast.tint = TINT.mast; mast.ropeSwing = 'mast';
    return { mast };
  }
  window.SKY_ROPE_SWING = { X, PIVOT_Y, PIVOT_Z, L, HANDS, TH_START, TH_END, V_MAX, V_RELEASE, RETURN_SECONDS, GRAB, MAST, arcLength };
  window.skyRopeSwing = { hand, feet, speedAt, releaseVelocity, flight };
  window.buildRopeSwing = build;

  addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game || !window.skyOldTownSwingCourse || window.skyPracticeMode) return;
    const { c, U } = game, stats = window.__game.stats;
    const { Box, Torus, Mesh, Group, Basic, Standard } = game.Geom;
    const group = new Group(); group.name = 'Rope swing';
    const steel = new Standard({ color: 0x243c52, metalness: .6, roughness: .45 });
    const orange = new Basic({ color: 0xffa21f }), ropeMat = new Basic({ color: 0xe8dcc0 });
    // 柱の腕（当たり判定なし）とロープ・取っ手。
    const armLen = Math.hypot(X - MAST.x, PIVOT_Z - MAST.z), arm = new Mesh(new Box(armLen + .3, .14, .14), steel);
    arm.position.set((X + MAST.x) / 2, PIVOT_Y + .12, (PIVOT_Z + MAST.z) / 2); arm.rotation.y = -Math.atan2(PIVOT_Z - MAST.z, X - MAST.x); group.add(arm);
    const rope = new Mesh(new Box(.05, 1, .05), ropeMat); group.add(rope);
    const handle = new Mesh(new Torus(.27, .055, 8, 20), orange); handle.rotation.y = Math.PI / 2; group.add(handle);
    // 屋上の印: 帯の両脇の線と、縁へ向かう矢印（南向き）。
    const mark = (w, d, x, z) => { const m = new Mesh(new Box(w, .03, d), orange); m.position.set(x, 14.42, z); group.add(m); return m; };
    mark(.1, 4.6, X - .85, -8.4); mark(.1, 4.6, X + .85, -8.4); mark(1.8, .14, X, -6.1);
    for (const z of [-10.2, -8.9, -7.6]) for (const side of [-1, 1]) { const s = mark(.1, .7, X + side * .22, z); s.rotation.y = -side * .6; }
    game.ue.add(group);
    function drawRope(th) {
      const h = hand(th), dy = h.y - PIVOT_Y, dz = h.z - PIVOT_Z, len = Math.hypot(dy, dz);
      rope.scale.y = len; rope.position.set(X, (h.y + PIVOT_Y) / 2, (h.z + PIVOT_Z) / 2); rope.rotation.x = Math.atan2(dz, dy);
      handle.position.set(X, h.y - .27, h.z);
    }
    drawRope(TH_START);

    let riding = null, back = 0, shown = TH_START;
    const playing = () => game.modeRef() === 'play' && !game.z.over;
    const ready = () => !riding && back <= 0;
    function begin() {
      riding = { th: TH_START, t0: game.z.t, last: null };
      if (['slide', 'ledge', 'ladder'].includes(c.state)) c.state = 'normal';
      c.onGround = false; c.coyote = 0; c.jumpBuf = 0; c.edgeJump = false; c.slideT = 0; c.h = 1.75; c.crouchPressed = false;
      window.skyLandingRoll?.cancel?.();
      stats.ropeSwings = (stats.ropeSwings || 0) + 1;
    }
    function release() {
      const p = feet(TH_END), v = releaseVelocity();
      c.pos.set(p.x, p.y, p.z); c.vel.set(v.x, v.y, v.z);
      c.state = 'normal'; c.onGround = false; c.coyote = 0; c.airT = 0; c.edgeJump = false; c.jumpBuf = 0; c.h = 1.75;
      c.yaw = Math.PI; riding = null; back = RETURN_SECONDS;
    }
    function step(dt) {
      if (riding && (!playing() || game.z.t < riding.t0 || (riding.last && c.pos.distanceTo(riding.last) > 1))) { riding = null; back = 0; shown = TH_START; drawRope(shown); }
      if (!riding) {
        if (back > 0) { // 空のロープが塔へ戻る
          back = Math.max(0, back - dt); const f = 1 - back / RETURN_SECONDS;
          shown = TH_END + (TH_START - TH_END) * f * f * (3 - 2 * f); drawRope(shown);
        }
        if (!playing() || !ready() || c.state !== 'normal' || c.onGround || window.skyBite?.locked) return false;
        const p = c.pos;
        if (p.x < GRAB.minX || p.x > GRAB.maxX || p.z < GRAB.minZ || p.z > GRAB.maxZ || p.y < GRAB.minY || p.y > GRAB.maxY || c.vel.z < GRAB.minSpeedZ) return false;
        begin();
      }
      riding.th += speedAt(riding.th, U.gravity) * dt / L;
      if (riding.th >= TH_END) { drawRope(TH_END); shown = TH_END; release(); return false; }
      const th = riding.th, p = feet(th), v = speedAt(th, U.gravity);
      // つかんだ直後は、跳んだ位置から弧へなめらかに寄せる。
      const blend = Math.min(1, (game.z.t - riding.t0) / .18);
      c.pos.set(c.pos.x + (p.x - c.pos.x) * blend, c.pos.y + (p.y - c.pos.y) * blend, c.pos.z + (p.z - c.pos.z) * blend);
      c.vel.set(0, Math.sin(th) * v, Math.cos(th) * v);
      c.yaw = Math.PI; c.onGround = false; c.h = 1.75;
      riding.last = c.pos.clone(); shown = th; drawRope(th);
      return true;
    }
    Object.assign(window.skyRopeSwing, { step, active: () => !!riding, ready, angle: () => shown, group });
  });
})();
