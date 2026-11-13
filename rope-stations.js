// 西側の「復帰ロープ」12か所（2026-11-13）。建物が密集して高台へ戻れなくなる西の低い所（地面・低い屋根）から、
// 勢いを借りて空中ルートへ戻るための片道ロープ。大スイング（rope-swing.js）と同じ振り子・同じ操作で、向きだけ自由。
//   * 助走して縁の手前（橙の印）で跳ぶと取っ手をつかむ。ジャンプで離す。移動入力を押していると漕げる（上り幅は漕いだぶんだけ伸びる）。
//   * 緑の取っ手 = いま離せば向こうの台に着く。橙 = まだ（または過ぎた）。
//   * 握力は共有（使うほど減り、地面にいる間に戻る）。残りが少ないうちは新しいロープをつかめない。ゾンビは使えない。
//   * 往復はできない（片道）。使ったロープは約1.2秒で元の位置へ戻る。
// 配置は tools の探索（実マップの当たり判定で、漕いだ振りと着地を確かめたもの）から作った。座標は x 東・y 上・z 南。
// 各ロープ: park = 跳ぶ位置（足の高さ fs+1.5 でつかむ）、d = 向き（水平）、pu/py = 支点（park から d 方向に pu、高さ py）、
//          land = 着地する台（床の高さ f、park から d 方向に edge〜end の範囲）、mast = 柱の足元（見た目だけ、当たり判定なし）。
(() => {
  const L = 8.5, HANDS = 1.9, RETURN_SECONDS = 1.2, LAND_MARGIN = .6;
  const V_ENTRY_MIN = 4, V_MAX = 11.5, PUMP = .35, MAX_ANGLE = 75 * Math.PI / 180, MAX_SECONDS = 9;
  const KICK = { x: 2, y: 2.2 };
  const GRAB = { du: 1.6, dyLow: 1, dyHigh: 1, dv: .9, minSpeed: 2.5 };
  const GRIP_SECONDS = 8, GRIP_REGEN = .25, GRIP_MIN = .3;
  const STATIONS = [
    { id: 1, px: -23, pz: -7, fs: 4.2, dx: 1, dz: 0, alpha: 12, pu: 1.767, py: 15.914, mast: { x: -21.23, z: -5.2, base: 0 }, land: { f: 8, edge: 9.1, end: 15 } },
    { id: 2, px: -54, pz: -2, fs: 0, dx: -0.9659, dz: -0.2588, alpha: 25, pu: 3.592, py: 11.104, mast: { x: -57, z: -4.67, base: 3.4 }, land: { f: 3, edge: 10.4, end: 16.5 } },
    { id: 3, px: -45, pz: 8, fs: 4.4, dx: -1, dz: 0, alpha: 12, pu: 1.767, py: 16.114, mast: { x: -46.77, z: 6.2, base: 0 }, land: { f: 6.2, edge: 8.1, end: 12 } },
    { id: 4, px: -38, pz: -11, fs: 2.6, dx: 1, dz: 0, alpha: 12, pu: 1.767, py: 14.314, mast: { x: -36.23, z: -9.2, base: 2.6 }, land: { f: 6.4, edge: 13.1, end: 16 } },
    { id: 5, px: -59, pz: 11, fs: 4.6, dx: -0.9659, dz: 0.2588, alpha: 12, pu: 1.767, py: 16.314, mast: { x: -61.33, z: 9.14, base: 6 }, land: { f: 6.5, edge: 7.3, end: 11.3 } },
    { id: 6, px: -34, pz: -22, fs: 0, dx: 0.866, dz: 0.5, alpha: 12, pu: 1.767, py: 11.714, mast: { x: -33.37, z: -19.56, base: 0 }, land: { f: 4.2, edge: 9.1, end: 14.4 } },
    { id: 7, px: -35, pz: 13, fs: 4, dx: 0.7071, dz: -0.7071, alpha: 25, pu: 3.592, py: 15.104, mast: { x: -31.19, z: 11.73, base: 0 }, land: { f: 6.4, edge: 11.4, end: 15.5 } },
    { id: 8, px: -30, pz: -7, fs: 4.2, dx: 0.2588, dz: 0.9659, alpha: 12, pu: 1.767, py: 15.914, mast: { x: -31.86, z: -4.67, base: 0 }, land: { f: 6.4, edge: 6.3, end: 12.4 } },
    { id: 9, px: -22, pz: -13, fs: 4.2, dx: 0.7071, dz: 0.7071, alpha: 12, pu: 1.767, py: 15.914, mast: { x: -22.02, z: -10.48, base: 6.4 }, land: { f: 8, edge: 11.4, end: 19.7 } },
    { id: 10, px: -21, pz: 2, fs: 0, dx: 0, dz: 1, alpha: 12, pu: 1.767, py: 11.714, mast: { x: -22.8, z: 3.77, base: 0 }, land: { f: 4.2, edge: 10.6, end: 15.7 } }
  ];
  for (const s of STATIONS) { s.parkY = s.fs + 1.5; s.nx = -s.dz; s.nz = s.dx; s.th0 = -s.alpha * Math.PI / 180; }
  const hand = (s, th) => ({ u: s.pu + L * Math.sin(th), y: s.py - L * Math.cos(th) });
  const feet = (s, th) => { const h = hand(s, th); return { u: h.u, y: h.y - HANDS }; };
  const world = (s, u) => ({ x: s.px + s.dx * u, z: s.pz + s.dz * u });
  function releaseVelocity(th, w) {
    const sign = w >= 0 ? 1 : -1, v = w * L;
    return { u: v * Math.cos(th) + sign * KICK.x, y: v * Math.sin(th) + KICK.y };
  }
  // いま離したときの落下先（重力だけの予測）。ok = 着地する台の上（縁から LAND_MARGIN 以上奥）に降りる。壁に当たる・届かない・戻る飛びは false。
  function landing(s, th, w, gravity = 20) {
    const p = feet(s, th), v = releaseVelocity(th, w), dt = 1 / 120, T = s.land;
    let u = p.u, y = p.y, vu = v.u, vy = v.y;
    if (vu <= 0) return { ok: false, why: 'back' };
    for (let t = 0; t < 4; t += dt) {
      vy -= gravity * dt; u += vu * dt; y += vy * dt;
      if (u > T.edge - .4 && u < T.edge && y < T.f - .01) return { ok: false, why: 'wall', u, y };
      if (y <= T.f && vy < 0) { const inside = u - T.edge; return { ok: inside >= LAND_MARGIN && u <= T.end, why: inside < LAND_MARGIN ? 'short' : u > T.end ? 'long' : 'ok', u, y, inside }; }
      if (y < 0) break;
    }
    return { ok: false, why: 'fall' };
  }
  function swingStep(th, w, dt, gravity = 20) { w += -(gravity / L) * Math.sin(th) * dt; return { th: th + w * dt, w }; }
  window.SKY_ROPE_STATIONS = { L, HANDS, STATIONS, GRAB, KICK, V_MAX, PUMP, MAX_SECONDS, RETURN_SECONDS, LAND_MARGIN, GRIP_SECONDS, GRIP_REGEN, GRIP_MIN };
  window.skyRopeStations = { hand, feet, world, releaseVelocity, landing, swingStep };

  addEventListener('load', () => {
    const game = window.__skyInternals, base = window.skyRopeSwing;
    if (!game || !base || !window.skyOldTownSwingCourse || window.skyPracticeMode) return;
    const { c, U } = game, stats = window.__game.stats;
    const { Box, Torus, Mesh, Group, Basic, Standard } = game.Geom;
    const group = new Group(); group.name = 'Rope stations';
    const steel = new Standard({ color: 0x243c52, metalness: .6, roughness: .45 });
    const orange = new Basic({ color: 0xffa21f }), ropeMat = new Basic({ color: 0xe8dcc0 });
    const nodes = {};
    for (const s of STATIONS) {
      const n = nodes[s.id] = { s, lock: 0, from: s.th0, th: s.th0, mat: new Basic({ color: 0xffa21f }) };
      // 柱（見た目だけ）と腕。
      const px = s.px + s.dx * s.pu, pz = s.pz + s.dz * s.pu, top = s.py + .25, h = top - s.mast.base;
      const mast = new Mesh(new Box(.22, h, .22), steel); mast.position.set(s.mast.x, s.mast.base + h / 2, s.mast.z); group.add(mast);
      const armLen = Math.hypot(px - s.mast.x, pz - s.mast.z), arm = new Mesh(new Box(armLen + .3, .16, .16), steel);
      arm.position.set((px + s.mast.x) / 2, s.py + .12, (pz + s.mast.z) / 2); arm.rotation.y = -Math.atan2(pz - s.mast.z, px - s.mast.x); group.add(arm);
      // ロープと取っ手（d 方向を x 軸にした面の中で振れる）。
      const g = new Group(); g.position.set(s.px, 0, s.pz); g.rotation.y = -Math.atan2(s.dz, s.dx); group.add(g);
      n.rope = new Mesh(new Box(.05, 1, .05), ropeMat); n.handle = new Mesh(new Torus(.27, .055, 8, 20), n.mat); g.add(n.rope); g.add(n.handle);
      // 跳ぶ位置の印（橙）。
      const y = s.fs + .03, mark = (w, d, u, v) => { const m = new Mesh(new Box(w, .03, d), orange); m.position.set(u, y, v); g.add(m); };
      mark(.14, 1.8, -.4, 0); mark(4, .1, -2.2, -.85); mark(4, .1, -2.2, .85);
      for (const u of [-1.6, -2.8, -4]) for (const sd of [-1, 1]) { const m = new Mesh(new Box(.7, .03, .1), orange); m.position.set(u, y, sd * .22); m.rotation.y = sd * .6; g.add(m); }
      n.draw = th => { const hd = hand(s, th), dxp = hd.u - s.pu, dyp = hd.y - s.py, len = Math.hypot(dxp, dyp); n.th = th;
        n.rope.scale.y = len; n.rope.position.set((hd.u + s.pu) / 2, (hd.y + s.py) / 2, 0); n.rope.rotation.z = th; n.handle.position.set(hd.u, hd.y - .27, 0); };
      n.draw(s.th0);
    }
    game.ue.add(group);

    // 表示: 離す合図と握力。
    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:6px 14px;border-radius:14px;background:#23364de6;border:2px solid #ffb647;color:#fff1cd;font:700 15px/1.2 var(--font,sans-serif);pointer-events:none;opacity:0;transition:opacity .15s;z-index:12';
    hint.textContent = 'ジャンプで離す（緑のとき着地）'; document.body.appendChild(hint);
    const tr = window.skyI18n?.tr; if (tr) hint.textContent = tr(hint.textContent);
    const bar = document.createElement('div'), fill = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:50%;bottom:17%;transform:translateX(-50%);width:120px;height:8px;border-radius:5px;background:#23364dcc;border:1px solid #ffb647;pointer-events:none;opacity:0;transition:opacity .2s;z-index:12;overflow:hidden';
    fill.style.cssText = 'height:100%;width:100%;background:#ffb647'; bar.appendChild(fill); document.body.appendChild(bar);

    let riding = null, pressed = false, jumpHeld = false, touchHeld = false, grip = 1;
    const playing = () => game.modeRef() === 'play' && !game.z.over;
    addEventListener('keydown', e => { if (e.code !== 'Space' || e.repeat || jumpHeld) return; jumpHeld = true; if (riding) pressed = true; });
    addEventListener('keyup', e => { if (e.code === 'Space') jumpHeld = false; });
    const jumpButton = document.getElementById('tJump');
    jumpButton?.addEventListener('pointerdown', () => { if (!touchHeld && riding) pressed = true; touchHeld = true; });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) jumpButton?.addEventListener(name, () => { touchHeld = false; });
    addEventListener('blur', () => { jumpHeld = touchHeld = pressed = false; });

    const inGrab = (s, p) => { const rx = p.x - s.px, rz = p.z - s.pz, u = rx * s.dx + rz * s.dz, v = rx * s.nx + rz * s.nz;
      return Math.abs(u) <= GRAB.du && p.y >= s.parkY - GRAB.dyLow && p.y <= s.parkY + GRAB.dyHigh && Math.abs(v) <= GRAB.dv; };
    function begin(n) {
      const s = n.s, p = c.pos, u = (p.x - s.px) * s.dx + (p.z - s.pz) * s.dz;
      const th = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, Math.atan2(u - s.pu, s.py - (p.y + HANDS))));
      const vd = c.vel.x * s.dx + c.vel.z * s.dz, vt = vd * Math.cos(th) + c.vel.y * Math.sin(th);
      riding = { n, th, w: Math.min(V_MAX, Math.max(V_ENTRY_MIN, vt)) / L, t0: game.z.t, last: null, age: 0 };
      pressed = false;
      if (['slide', 'ledge', 'ladder'].includes(c.state)) c.state = 'normal';
      c.onGround = false; c.coyote = 0; c.jumpBuf = 0; c.edgeJump = false; c.slideT = 0; c.h = 1.75; c.crouchPressed = false;
      window.skyLandingRoll?.cancel?.();
      stats.ropeSwings = (stats.ropeSwings || 0) + 1;
    }
    function release() {
      const r = riding, s = r.n.s, p = feet(s, r.th), v = releaseVelocity(r.th, r.w), sign = r.w >= 0 ? 1 : -1, w = world(s, p.u);
      c.pos.set(w.x, p.y, w.z); c.vel.set(s.dx * v.u, v.y, s.dz * v.u);
      c.state = 'normal'; c.onGround = false; c.coyote = 0; c.airT = 0; c.edgeJump = false; c.jumpBuf = 0; c.h = 1.75;
      c.yaw = Math.atan2(-sign * s.dx, -sign * s.dz);
      r.n.from = r.th; r.n.lock = RETURN_SECONDS; r.n.mat.color.setHex(0xffa21f);
      stats.ropeReleases = (stats.ropeReleases || 0) + 1;
      riding = null; pressed = false; hint.style.opacity = '0';
    }
    function cancel() {
      riding = null; pressed = false; hint.style.opacity = '0'; grip = 1; bar.style.opacity = '0';
      for (const id in nodes) { const n = nodes[id]; n.lock = 0; n.draw(n.s.th0); n.mat.color.setHex(0xffa21f); }
    }
    function showGrip() { fill.style.width = Math.round(Math.max(0, grip) * 100) + '%'; fill.style.background = grip < .3 ? '#e24b4a' : '#ffb647'; bar.style.opacity = riding || grip < .999 ? '1' : '0'; }
    function step(dt, input) {
      if (riding && (!playing() || game.z.t < riding.t0 || (riding.last && c.pos.distanceTo(riding.last) > 1))) cancel();
      if (!riding) {
        for (const id in nodes) { const n = nodes[id]; if (n.lock > 0) { // 空のロープが元の位置へ戻る
          n.lock = Math.max(0, n.lock - dt); const f = 1 - n.lock / RETURN_SECONDS, e = f * f * (3 - 2 * f); n.draw(n.from + (n.s.th0 - n.from) * e); } }
        if (c.onGround && grip < 1) grip = Math.min(1, grip + GRIP_REGEN * dt);
        showGrip();
        if (!playing() || c.state !== 'normal' || c.onGround || window.skyBite?.locked || grip < GRIP_MIN) return false;
        for (const id in nodes) {
          const n = nodes[id], s = n.s;
          if (n.lock > 0 || !inGrab(s, c.pos) || c.vel.x * s.dx + c.vel.z * s.dz < GRAB.minSpeed) continue;
          begin(n); break;
        }
        if (!riding) return false;
      }
      const r = riding, n = r.n, s = n.s, gravity = U.gravity;
      r.age += dt; grip -= dt / GRIP_SECONDS;
      const pumping = input && Math.hypot(input.fwdIn || 0, input.strIn || 0) > .25 && Math.abs(r.w) > .15;
      for (let left = dt; left > 0; left -= 1 / 120) {
        const h = Math.min(left, 1 / 120), nx = swingStep(r.th, r.w, h, gravity); r.th = nx.th; r.w = nx.w;
        if (pumping) r.w += Math.sign(r.w) * PUMP * h;
        const cap = V_MAX / L; if (Math.abs(r.w) > cap) r.w = Math.sign(r.w) * cap;
      }
      const cue = landing(s, r.th, r.w, gravity);
      n.mat.color.setHex(cue.ok ? 0x7ef0aa : 0xffa21f);
      hint.style.opacity = '1'; showGrip();
      c.jumpBuf = 0;
      if (pressed || Math.abs(r.th) > MAX_ANGLE || r.age > MAX_SECONDS || grip <= 0 || window.skyBite?.locked) { n.draw(r.th); release(); return false; }
      const p = feet(s, r.th), w = world(s, p.u), blend = Math.min(1, (game.z.t - r.t0) / .18); // つかんだ直後は、跳んだ位置から円へなめらかに寄せる
      c.pos.set(c.pos.x + (w.x - c.pos.x) * blend, c.pos.y + (p.y - c.pos.y) * blend, c.pos.z + (w.z - c.pos.z) * blend);
      const v = r.w * L; c.vel.set(s.dx * v * Math.cos(r.th), v * Math.sin(r.th), s.dz * v * Math.cos(r.th));
      c.yaw = Math.atan2(-s.dx, -s.dz); c.onGround = false; c.h = 1.75;
      riding.last = c.pos.clone(); n.draw(r.th);
      return true;
    }
    // 大スイングの関数を包む: 先にこちらを見て、乗っていなければ元の処理へ。
    const orig = { step: base.step, cancel: base.cancel, active: base.active, state: base.state, side: base.side };
    base.step = (dt, input) => {
      if (orig.active?.()) return orig.step(dt, input);
      if (step(dt, input)) return true;
      return orig.step ? orig.step(dt, input) : false;
    };
    base.cancel = (...a) => { orig.cancel?.(...a); cancel(); };
    base.active = () => !!orig.active?.() || !!riding;
    base.state = () => riding ? { th: riding.th, w: riding.w, side: 'S' + riding.n.s.id } : orig.state?.() || null;
    base.side = () => riding ? 'S' + riding.n.s.id : orig.side?.() || null;
    Object.assign(window.skyRopeStations, { step, cancel, active: () => !!riding, current: () => riding && { id: riding.n.s.id, th: riding.th, w: riding.w },
      ready: id => nodes[id].lock <= 0, grip: () => grip, nodes, group });
  });
})();
