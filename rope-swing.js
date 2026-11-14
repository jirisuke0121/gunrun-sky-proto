// 大スイング（旧市街、2026-11-13 作り直し）。西の台（6.4 m）と中央ブロックの屋上（8.0 m）の間の路地（10 m）に、ロープを2本かける。
//   * 東西どちらの縁からでも、跳んで取っ手をつかむ。つかんだら本物の振り子（半径 8.5 m）で振れる。
//   * ジャンプで手を離す。離したときの振りの速さがそのまま飛ぶ勢いになる（鉄棒と同じ考え方。早く離せば低く速く、上がり際なら高く遠くへ）。
//   * 移動入力を押していると、ゆるく漕げる（振りを少しずつ大きくする。速さの上限あり）。何も押さなければ素の振り子。
//   * 緑の取っ手 = いま離せば向こうの縁に着く。橙の取っ手 = まだ（または過ぎた）。
//   * 往復できる。ロープは両側の縁に1本ずつ下がっていて、使ったロープは約1.2秒で元の位置へ戻る。ゾンビは使えない。
//   * 決まった弧ではなく通常の物理（重力と振り子）。技や被弾による加速ではない。
// 座標は x 東・y 上・z 南。旧版（東塔→南屋根の自動の弧）の経緯は README の 2026-11-11 と 2026-11-13 の節。
(() => {
  const L = 8.5, HANDS = 1.9, Z = 0.1, RETURN_SECONDS = 1.2;
  // 両端の足場。edge は縁の x、floor は床の高さ、park は足の駐車位置（跳んだ頂点あたりでつかめる高さ）、dir は向こう側へ向かう x の向き。
  const SIDES = {
    A: { dir: 1, edge: -24, floor: 6.4, parkX: -23.1, parkY: 7.9, far: 'B' },
    B: { dir: -1, edge: -14, floor: 8.0, parkX: -14.9, parkY: 8.5, far: 'A' },
  };
  // 駐車位置の手が半径 L の円に載るように支点を決める（2点の垂直二等分線上）。
  function solvePivot() {
    const ha = [SIDES.A.parkX, SIDES.A.parkY + HANDS], hb = [SIDES.B.parkX, SIDES.B.parkY + HANDS];
    const mx = (ha[0] + hb[0]) / 2, my = (ha[1] + hb[1]) / 2, dx = hb[0] - ha[0], dy = hb[1] - ha[1], d = Math.hypot(dx, dy);
    const h = Math.sqrt(L * L - d * d / 4), nx = -dy / d, ny = dx / d, s = ny > 0 ? 1 : -1;
    return { x: mx + s * nx * h, y: my + s * ny * h, z: Z };
  }
  const PIVOT = solvePivot();
  const MAST = { x: -13.4, z: -1.5, w: .22, base: 8, top: PIVOT.y + .25 }; // 中央屋上の西の縁の柱（走路から1.6 m 北）
  const GRAB = { dx: 1.6, dyLow: 1, dyHigh: 1, dz: .9, minSpeed: 2.5 }; // 駐車位置を中心に、足の位置でつかめる範囲
  const V_ENTRY_MIN = 4, V_MAX = 11.5, PUMP = .35, MAX_ANGLE = 75 * Math.PI / 180, MAX_SECONDS = 9;
  const KICK = { x: 2, y: 2.2 }; // ジャンプで離すときの上乗せ（鉄棒の「速さ＋ジャンプの一押し」と同じ作り）
  const LAND_MARGIN = .6;
  const TINT = { mast: 0x243c52 };
  const angleOf = (side) => { const s = SIDES[side]; return Math.atan2(s.parkX - PIVOT.x, PIVOT.y - (s.parkY + HANDS)); };
  const hand = th => ({ x: PIVOT.x + L * Math.sin(th), y: PIVOT.y - L * Math.cos(th) });
  const feet = th => { const h = hand(th); return { x: h.x, y: h.y - HANDS, z: Z }; };
  // 手を離したときの速度。w は角速度（東向きが正）。
  function releaseVelocity(th, w) {
    const sign = w >= 0 ? 1 : -1, v = w * L;
    return { x: v * Math.cos(th) + sign * KICK.x, y: v * Math.sin(th) + KICK.y };
  }
  // 手を離したあとの落下先（通常の重力だけの予測）。side が 'A' なら B へ、'B' なら A へ向かう飛び。
  // ok = 向こうの縁を越えて床に着く（縁から LAND_MARGIN 以上奥、床の奥行きの内側）。壁に当たる・届かない・戻る飛びは false。
  function landing(side, th, w, gravity = 20) {
    const s = SIDES[side], far = SIDES[s.far], p = feet(th), v = releaseVelocity(th, w), dt = 1 / 120, depth = s.far === 'A' ? 4.6 : 10;
    let x = p.x, y = p.y, vx = v.x, vy = v.y;
    if (vx * s.dir <= 0) return { ok: false, why: 'back' };
    for (let t = 0; t < 4; t += dt) {
      vy -= gravity * dt; x += vx * dt; y += vy * dt;
      const inside = (x - far.edge) * s.dir; // 向こうの縁から奥へ入った距離（手前は負）
      if (inside > -.4 && inside < 0 && y < far.floor - .01) return { ok: false, why: 'wall', x, y };
      if (y <= far.floor && vy < 0) return { ok: inside >= LAND_MARGIN && inside <= depth, why: inside < LAND_MARGIN ? 'short' : inside > depth ? 'long' : 'ok', x, y, inside };
      if (y < 0) break;
    }
    return { ok: false, why: 'fall' };
  }
  // 素の振り子（漕ぎなし）を進める。テストと予測の共通部品。
  function swingStep(th, w, dt, gravity = 20) { w += -(gravity / L) * Math.sin(th) * dt; return { th: th + w * dt, w }; }
  function build({ ne }) {
    const mast = ne(MAST.x - MAST.w / 2, MAST.base, MAST.z - MAST.w / 2, MAST.x + MAST.w / 2, MAST.top, MAST.z + MAST.w / 2, 'beam');
    mast.tint = TINT.mast; mast.ropeSwing = 'mast';
    return { mast };
  }
  window.SKY_ROPE_SWING = { L, HANDS, Z, SIDES, PIVOT, MAST, GRAB, V_MAX, PUMP, KICK, RETURN_SECONDS, LAND_MARGIN, MAX_SECONDS };
  window.skyRopeSwing = { hand, feet, releaseVelocity, landing, swingStep, angleOf };
  window.buildRopeSwing = build;

  addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game || !window.skyOldTownSwingCourse || window.skyPracticeMode) return;
    const { c, U } = game, stats = window.__game.stats;
    const { Box, Torus, Mesh, Group, Basic, Standard } = game.Geom;
    const group = new Group(); group.name = 'Rope swing';
    const steel = new Standard({ color: 0x243c52, metalness: .6, roughness: .45 });
    const orange = new Basic({ color: 0xffa21f }), ropeMat = new Basic({ color: 0xe8dcc0 });
    const handleMats = { A: new Basic({ color: 0xffa21f }), B: new Basic({ color: 0xffa21f }) };
    // 柱の腕（当たり判定なし）。
    const armLen = Math.hypot(PIVOT.x - MAST.x, PIVOT.z - MAST.z), arm = new Mesh(new Box(armLen + .3, .16, .16), steel);
    arm.position.set((PIVOT.x + MAST.x) / 2, PIVOT.y + .12, (PIVOT.z + MAST.z) / 2); arm.rotation.y = -Math.atan2(PIVOT.z - MAST.z, PIVOT.x - MAST.x); group.add(arm);
    // ロープと取っ手（両側）。
    const ropes = {};
    for (const side of ['A', 'B']) {
      const rope = new Mesh(new Box(.05, 1, .05), ropeMat), handle = new Mesh(new Torus(.27, .055, 8, 20), handleMats[side]);
      group.add(rope); group.add(handle); ropes[side] = { rope, handle, th: angleOf(side) };
    }
    function drawRope(side, th) {
      const r = ropes[side], h = hand(th), dx = h.x - PIVOT.x, dy = h.y - PIVOT.y, len = Math.hypot(dx, dy);
      r.th = th; r.rope.scale.y = len; r.rope.position.set((h.x + PIVOT.x) / 2, (h.y + PIVOT.y) / 2, Z); r.rope.rotation.z = th; r.handle.position.set(h.x, h.y - .27, Z);
    }
    drawRope('A', angleOf('A')); drawRope('B', angleOf('B'));
    // 縁の印（橙）。跳ぶ位置の目安。
    const mark = (w, d, x, y, z) => { const m = new Mesh(new Box(w, .03, d), orange); m.position.set(x, y, z); group.add(m); return m; };
    for (const side of ['A', 'B']) {
      const s = SIDES[side], y = s.floor + .03, back = -s.dir; // 縁から奥へ
      mark(.14, 1.8, s.edge + back * .18, y, Z);
      mark(4.4, .1, s.edge + back * 2.4, y, Z - .85); mark(4.4, .1, s.edge + back * 2.4, y, Z + .85);
      for (const x of [2.2, 3.4, 4.6]) for (const sd of [-1, 1]) { const m = mark(.7, .1, s.edge + back * x, y, Z + sd * .22); m.rotation.y = sd * s.dir * .6; }
    }
    game.ue.add(group);

    // 操作の表示（離すときの合図）。
    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:6px 14px;border-radius:14px;background:#23364de6;border:2px solid #ffb647;color:#fff1cd;font:700 15px/1.2 var(--font,sans-serif);pointer-events:none;opacity:0;transition:opacity .15s;z-index:12';
    hint.textContent = 'ジャンプで離す（緑のとき着地）'; document.body.appendChild(hint);
    const tr = window.skyI18n?.tr; if (tr) hint.textContent = tr(hint.textContent);

    let riding = null, pressed = false, jumpHeld = false, touchHeld = false;
    const lock = { A: 0, B: 0 }, from = { A: angleOf('A'), B: angleOf('B') };
    const playing = () => game.modeRef() === 'play' && !game.z.over;
    addEventListener('keydown', e => { if (e.code !== 'Space' || e.repeat || jumpHeld) return; jumpHeld = true; if (riding) pressed = true; });
    addEventListener('keyup', e => { if (e.code === 'Space') jumpHeld = false; });
    const jumpButton = document.getElementById('tJump');
    jumpButton?.addEventListener('pointerdown', () => { if (!touchHeld && riding) pressed = true; touchHeld = true; });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) jumpButton?.addEventListener(name, () => { touchHeld = false; });
    addEventListener('blur', () => { jumpHeld = touchHeld = pressed = false; });

    function begin(side) {
      const s = SIDES[side], p = c.pos;
      // 実際の手の位置から円へ寄せる。速さは円の接線方向の成分（向こうへ向かうぶんだけ。最低 V_ENTRY_MIN）。
      const th = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, Math.atan2(p.x - PIVOT.x, PIVOT.y - (p.y + HANDS))));
      const vt = c.vel.x * Math.cos(th) + c.vel.y * Math.sin(th);
      const speed = Math.min(V_MAX, Math.max(V_ENTRY_MIN, vt * s.dir)) * s.dir;
      riding = { side, th, w: speed / L, t0: game.z.t, last: null, age: 0 };
      pressed = false;
      c.hookPressed = false; c.hookPick = null;
      if (['slide', 'ledge', 'ladder'].includes(c.state)) c.state = 'normal';
      c.onGround = false; c.coyote = 0; c.jumpBuf = 0; c.edgeJump = false; c.slideT = 0; c.h = 1.75; c.crouchPressed = false;
      window.skyLandingRoll?.cancel?.();
      stats.ropeSwings = (stats.ropeSwings || 0) + 1;
    }
    function release(why) {
      const r = riding, p = feet(r.th), v = releaseVelocity(r.th, r.w), sign = r.w >= 0 ? 1 : -1;
      c.pos.set(p.x, p.y, Z); c.vel.set(v.x, v.y, 0);
      c.state = 'normal'; c.onGround = false; c.coyote = 0; c.airT = 0; c.edgeJump = false; c.jumpBuf = 0; c.h = 1.75;
      c.yaw = Math.atan2(-sign, 0);
      from[r.side] = r.th; lock[r.side] = RETURN_SECONDS; handleMats[r.side].color.setHex(0xffa21f);
      stats.ropeReleases = (stats.ropeReleases || 0) + 1;
      riding = null; pressed = false; hint.style.opacity = '0';
    }
    function cancel() { // やり直し・停止など。ロープをすぐ元へ戻す。
      riding = null; pressed = false; hint.style.opacity = '0';
      for (const side of ['A', 'B']) { lock[side] = 0; drawRope(side, angleOf(side)); handleMats[side].color.setHex(0xffa21f); }
    }
    const inGrab = (side, p) => { const s = SIDES[side]; return Math.abs(p.x - s.parkX) <= GRAB.dx && p.y >= s.parkY - GRAB.dyLow && p.y <= s.parkY + GRAB.dyHigh && Math.abs(p.z - Z) <= GRAB.dz; };
    function step(dt, input) {
      if (riding && (!playing() || game.z.t < riding.t0 || (riding.last && c.pos.distanceTo(riding.last) > 1))) cancel();
      if (!riding) {
        for (const side of ['A', 'B']) if (lock[side] > 0) { // 空のロープが元の位置へ戻る
          lock[side] = Math.max(0, lock[side] - dt); const f = 1 - lock[side] / RETURN_SECONDS, e = f * f * (3 - 2 * f), home = angleOf(side);
          drawRope(side, from[side] + (home - from[side]) * e);
        }
        if (!playing() || c.state !== 'normal' || c.onGround || window.skyBite?.locked) return false;
        for (const side of ['A', 'B']) {
          if (lock[side] > 0 || !inGrab(side, c.pos) || c.vel.x * SIDES[side].dir < GRAB.minSpeed) continue;
          begin(side); break;
        }
        if (!riding) return false;
      }
      // 振っている最中でもフック（Q／右クリック／マークをタップ）で移れる。先が有効なときだけ手を離して本体のフック処理へ渡す。
      if (c.hookPressed) {
        const assist = game.hookAssist?.(), pick = c.hookPick, target = assist && (pick ? (assist.valid(pick) ? pick : null) : assist.target());
        if (target && !(c.hookCD > 0)) { const yaw = c.yaw; drawRope(riding.side, riding.th); release(); c.yaw = yaw; return false; } // 向きは変えない（マークが外れないように）
        c.hookPressed = false; c.hookPick = null; c.skyHookSource = null;
      }
      const r = riding, s = SIDES[r.side], gravity = U.gravity;
      r.age += dt;
      // 振る（細かく刻んで安定させる）。移動入力を押していると、振りの向きにゆるく漕げる。
      const pumping = input && Math.hypot(input.fwdIn || 0, input.strIn || 0) > .25 && Math.abs(r.w) > .15;
      for (let left = dt; left > 0; left -= 1 / 120) {
        const h = Math.min(left, 1 / 120); const n = swingStep(r.th, r.w, h, gravity); r.th = n.th; r.w = n.w;
        if (pumping) r.w += Math.sign(r.w) * PUMP * h;
        const cap = V_MAX / L; if (Math.abs(r.w) > cap) r.w = Math.sign(r.w) * cap;
      }
      const cue = landing(r.side, r.th, r.w, gravity);
      handleMats[r.side].color.setHex(cue.ok ? 0x7ef0aa : 0xffa21f);
      hint.style.opacity = '1';
      c.jumpBuf = 0;
      if (pressed || Math.abs(r.th) > MAX_ANGLE || r.age > MAX_SECONDS || window.skyBite?.locked) { drawRope(r.side, r.th); release(); return false; }
      const p = feet(r.th), blend = Math.min(1, (game.z.t - r.t0) / .18); // つかんだ直後は、跳んだ位置から円へなめらかに寄せる
      c.pos.set(c.pos.x + (p.x - c.pos.x) * blend, c.pos.y + (p.y - c.pos.y) * blend, c.pos.z + (Z - c.pos.z) * blend);
      c.vel.set(r.w * L * Math.cos(r.th), r.w * L * Math.sin(r.th), 0);
      c.yaw = Math.atan2(-Math.sign(s.dir), 0); c.onGround = false; c.h = 1.75;
      riding.last = c.pos.clone(); drawRope(r.side, r.th);
      return true;
    }
    Object.assign(window.skyRopeSwing, { step, cancel, active: () => !!riding, side: () => riding?.side || null, state: () => riding && { th: riding.th, w: riding.w, side: riding.side },
      ready: side => lock[side] <= 0, angle: side => ropes[side].th, group, ropes });
  });
})();
