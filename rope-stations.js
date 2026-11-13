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
  const L = 8.5, HANDS = 1.9, RETURN_SECONDS = .6, LAND_MARGIN = .6;
  const V_ENTRY_MIN = 4, V_MAX = 13, PUMP = .6, MAX_ANGLE = 75 * Math.PI / 180, MAX_SECONDS = 9;
  const KICK = { x: 3, y: 3 };
  const GRAB = { r: 3.4, dyLow: 1.2, dyHigh: 2, maxFall: 1.5 }; // maxFall: 落ちながら通りかかっただけ（フックの到着後など）ではつかまない
  const GRIP_SECONDS = 8, GRIP_REGEN = .25, GRIP_MIN = .3;
  const STATIONS = [
    { id: 3, px: -42, pz: 8, fs: 4.4, dx: -1, dz: 0, alpha: 12, pu: 1.767, py: 16.114, mast: { x: -43.77, z: 6.2, base: 15 }, land: { f: 6.2, edge: 11.1, end: 15 } },
    { id: 4, px: -31, pz: 13, fs: 2.8, dx: 0, dz: -1, alpha: 12, pu: 1.767, py: 14.514, mast: { x: -29.2, z: 11.23, base: 0 }, land: { f: 5.5, edge: 8.1, end: 14 } },
    { id: 5, px: -30, pz: -8, fs: 4.2, dx: 0.2588, dz: 0.9659, alpha: 12, pu: 1.767, py: 15.914, mast: { x: -31.28, z: -5.83, base: 13.3 }, land: { f: 6.4, edge: 7.3, end: 13.4 } },
    { id: 6, px: -34, pz: -22, fs: 0, dx: 0.866, dz: 0.5, alpha: 12, pu: 1.767, py: 11.714, mast: { x: -33.37, z: -19.56, base: 0 }, land: { f: 4.2, edge: 9.1, end: 14.4 } },
    { id: 7, px: -53, pz: 0, fs: 3.4, dx: 1, dz: 0, alpha: 38, pu: 5.233, py: 13.498, mast: { x: -47.77, z: 1.8, base: 6.2 }, land: { f: 5.5, edge: 19, end: 23.9 } },
    { id: 8, px: -21, pz: 0, fs: 0, dx: 0, dz: 1, alpha: 25, pu: 3.592, py: 11.104, mast: { x: -22.8, z: 3.59, base: 0 }, land: { f: 4.2, edge: 12.6, end: 17.7 } },
    { id: 10, px: -55, pz: 10, fs: 4.6, dx: -1, dz: 0, alpha: 12, pu: 1.767, py: 16.314, mast: { x: -56.77, z: 8.2, base: 6.2 }, land: { f: 6.5, edge: 11.1, end: 15 } },
  ];
  for (const s of STATIONS) { s.parkY = s.fs + 1.5; s.nx = -s.dz; s.nz = s.dx; s.th0 = -s.alpha * Math.PI / 180; }
  const hand = (s, th) => ({ u: s.pu + L * Math.sin(th), y: s.py - L * Math.cos(th) });
  const feet = (s, th) => { const h = hand(s, th); return { u: h.u, y: h.y - HANDS }; };
  const world = (s, u) => ({ x: s.px + s.dx * u, z: s.pz + s.dz * u });
  function releaseVelocity(th, w) {
    const sign = w >= 0 ? 1 : -1, v = w * L;
    return { u: v * Math.cos(th) + sign * KICK.x, y: v * Math.sin(th) + KICK.y };
  }
  // 支点（柱の先）の真下の点。ロープはここを通る任意の向きの縦の面で振れる。
  const anchor = s => ({ x: s.px + s.dx * s.pu, z: s.pz + s.dz * s.pu });
  const feetAt = (s, e, th) => { const A = anchor(s); return { x: A.x + e.x * L * Math.sin(th), y: s.py - L * Math.cos(th) - HANDS, z: A.z + e.z * L * Math.sin(th) }; };
  // いま離したときの落下先を、実際の当たり判定（oe）で予測する。ok = 今の足場より MIN_GAIN 以上高い所に、縁から LAND_MARGIN 以上奥へ降りる。壁・天井に当たる・届かない・戻る飛びは false。
  const MIN_GAIN = 1.7; // 1段上がるだけの低い屋根では緑にしない（空中の道へ戻るためのロープ）
  function landing(s, th, w, gravity = 20, e = { x: s.dx, z: s.dz }) {
    const I = window.__skyInternals, free = (x, y, z) => I.oe(x, y + .012, z, I.c.r, 1.75);
    const f = feetAt(s, e, th), v = releaseVelocity(th, w), dt = 1 / 60;
    if (v.u <= 0) return { ok: false, why: 'back' };
    let x = f.x, y = f.y, z = f.z, vy = v.y;
    for (let t = 0; t < 4; t += dt) {
      const nvy = vy - gravity * dt, nx = x + e.x * v.u * dt, ny = y + nvy * dt, nz = z + e.z * v.u * dt;
      if (!free(nx, ny, nz)) {
        if (!free(nx, y, nz)) return { ok: false, why: 'wall', u: (x - f.x) * e.x + (z - f.z) * e.z, y };
        if (nvy > 0) return { ok: false, why: 'ceil', u: (x - f.x) * e.x + (z - f.z) * e.z, y };
        let lo = ny, hi = y; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (free(nx, m, nz)) hi = m; else lo = m; } // 地面の高さ
        const gy = hi, u = (nx - f.x) * e.x + (nz - f.z) * e.z, ground = I.c.lastGround ? I.c.lastGround.y : 0;
        const held = !free(nx - e.x * (LAND_MARGIN + .35), gy - .1, nz - e.z * (LAND_MARGIN + .35)) && !free(nx, gy - .1, nz);
        const ok = held && gy >= ground + MIN_GAIN;
        return { ok, why: !held ? 'edge' : gy < ground + MIN_GAIN ? 'low' : 'ok', u, y: gy, x: nx, z: nz };
      }
      x = nx; y = ny; z = nz; vy = nvy;
      if (y < -3) break;
    }
    return { ok: false, why: 'fall' };
  }
  function swingStep(th, w, dt, gravity = 20) { w += -(gravity / L) * Math.sin(th) * dt; return { th: th + w * dt, w }; }
  window.SKY_ROPE_STATIONS = { L, HANDS, STATIONS, GRAB, KICK, V_MAX, PUMP, MAX_SECONDS, RETURN_SECONDS, LAND_MARGIN, GRIP_SECONDS, GRIP_REGEN, GRIP_MIN };
  window.skyRopeStations = { hand, feet, world, anchor, feetAt, releaseVelocity, landing, swingStep };

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
      // 跳ぶ位置の印（もとの向きに固定）と、ロープ・取っ手（支点の真下を通る面の中で、つかんだ向きへ振れる）。
      const g = new Group(); g.position.set(s.px, 0, s.pz); g.rotation.y = -Math.atan2(s.dz, s.dx); group.add(g);
      const rg = new Group(); rg.position.set(px, 0, pz); group.add(rg); n.rg = rg; n.yaw = Math.atan2(s.dz, s.dx); n.yaw0 = n.yaw;
      n.rope = new Mesh(new Box(.05, 1, .05), ropeMat); n.handle = new Mesh(new Torus(.27, .055, 8, 20), n.mat); rg.add(n.rope); rg.add(n.handle);
      // 跳ぶ位置の印（橙）。
      const y = s.fs + .03, mark = (w, d, u, v) => { const m = new Mesh(new Box(w, .03, d), orange); m.position.set(u, y, v); g.add(m); };
      mark(.14, 1.8, -.4, 0); mark(4, .1, -2.2, -.85); mark(4, .1, -2.2, .85);
      for (const u of [-1.6, -2.8, -4]) for (const sd of [-1, 1]) { const m = new Mesh(new Box(.7, .03, .1), orange); m.position.set(u, y, sd * .22); m.rotation.y = sd * .6; g.add(m); }
      n.draw = th => { const hx = L * Math.sin(th), hy = s.py - L * Math.cos(th), len = Math.hypot(hx, hy - s.py); n.th = th; rg.rotation.y = -n.yaw;
        n.rope.scale.y = len; n.rope.position.set(hx / 2, (hy + s.py) / 2, 0); n.rope.rotation.z = th; n.handle.position.set(hx, hy - .27, 0); };
      n.setDir = e => { n.yaw = Math.atan2(e.z, e.x); };
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

    // 鉄棒と同じく、ロープの周り（水平 3.4 m）で空中にいればどの位置・向きからでもつかめる。つかんだら目標の台の向きへ振れる。
    const inGrab = (s, p) => Math.hypot(p.x - s.px, p.z - s.pz) <= GRAB.r && p.y >= s.parkY - GRAB.dyLow && p.y <= s.parkY + GRAB.dyHigh;
    // つかんだ位置から支点の真下を通り抜ける向きへ振れる（真下に近いときは、進んでいた向き→もとの向き）。
    function dirFor(s, p) {
      const A = anchor(s), dx = A.x - p.x, dz = A.z - p.z, d = Math.hypot(dx, dz);
      if (d > .7) return { x: dx / d, z: dz / d };
      const sp = Math.hypot(c.vel.x, c.vel.z); return sp > 1.5 ? { x: c.vel.x / sp, z: c.vel.z / sp } : { x: s.dx, z: s.dz };
    }
    // 振れの通り道が壁や床にめり込まないか、少し先まで確かめる（漕いで大きくなる分も見込む）。
    function arcFree(s, e, th, w) {
      const cap = V_MAX / L; let t = th, v = w;
      for (let k = 0; k < 21; k++) { // 離せる頃合い（約0.7秒）まで。それ以降は、ぶつかったらその場で離れる
        const nx = swingStep(t, v, 1 / 30, U.gravity); t = nx.th; v = Math.min(cap, nx.w + Math.sign(nx.w) * PUMP / 30);
        const f = feetAt(s, e, t); if (k >= 5 && !game.oe(f.x, f.y + .012, f.z, c.r, 1.75)) return false;
      } return true;
    }
    // 向きの候補を、つかんだ位置から支点へ向かう向きに近い順に試して、通り道が空いている最初のものを使う。
    function pick(s, p) {
      const e0 = dirFor(s, p), A = anchor(s);
      for (const deg of [0, 25, -25, 50, -50, 75, -75]) {
        const a = deg * Math.PI / 180, e = { x: e0.x * Math.cos(a) - e0.z * Math.sin(a), z: e0.x * Math.sin(a) + e0.z * Math.cos(a) };
        const u = (p.x - A.x) * e.x + (p.z - A.z) * e.z, th = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, Math.atan2(u, s.py - (p.y + HANDS))));
        const vd = c.vel.x * e.x + c.vel.z * e.z, vt = vd * Math.cos(th) + c.vel.y * Math.sin(th), w = Math.min(V_MAX, Math.max(V_ENTRY_MIN, vt)) / L;
        if (arcFree(s, e, th, w)) return { e, th, w };
      } return null;
    }
    function begin(n, pk) {
      const { e, th, w } = pk;
      n.setDir(e);
      riding = { n, e, th, w, t0: game.z.t, last: null, age: 0 };
      pressed = false;
      if (['slide', 'ledge', 'ladder'].includes(c.state)) c.state = 'normal';
      c.onGround = false; c.coyote = 0; c.jumpBuf = 0; c.edgeJump = false; c.slideT = 0; c.h = 1.75; c.crouchPressed = false;
      window.skyLandingRoll?.cancel?.(); window.skyHookLanding?.cancel?.();
      stats.ropeSwings = (stats.ropeSwings || 0) + 1;
    }
    function release(inPlace) {
      const r = riding, s = r.n.s, e = r.e, p = feetAt(s, e, r.th), v = releaseVelocity(r.th, r.w), sign = r.w >= 0 ? 1 : -1;
      if (!inPlace) { c.pos.set(p.x, p.y, p.z); c.vel.set(e.x * v.u, v.y, e.z * v.u); } // inPlace: 通り道がふさがったので、今いる所からそのまま落ちる
      c.state = 'normal'; c.onGround = false; c.coyote = 0; c.airT = 0; c.edgeJump = window.SKY_ROPE_STATIONS.jumpLike !== false; c.jumpBuf = 0; c.h = 1.75; // ジャンプと同じ扱い：飛び出した後に縁へ届けば、よじ登る・縁をつかむ
      c.yaw = Math.atan2(-sign * e.x, -sign * e.z);
      r.n.from = r.th; r.n.yawFrom = r.n.yaw; r.n.lock = RETURN_SECONDS; r.n.mat.color.setHex(0xffa21f);
      stats.ropeReleases = (stats.ropeReleases || 0) + 1;
      riding = null; pressed = false; hint.style.opacity = '0';
    }
    function cancel() {
      riding = null; pressed = false; hint.style.opacity = '0'; grip = 1; bar.style.opacity = '0';
      for (const id in nodes) { const n = nodes[id]; n.lock = 0; n.yaw = n.yaw0; n.draw(n.s.th0); n.mat.color.setHex(0xffa21f); }
    }
    function showGrip() { fill.style.width = Math.round(Math.max(0, grip) * 100) + '%'; fill.style.background = grip < .3 ? '#e24b4a' : '#ffb647'; bar.style.opacity = riding || grip < .999 ? '1' : '0'; }
    function step(dt, input) {
      if (riding && (!playing() || game.z.t < riding.t0 || (riding.last && c.pos.distanceTo(riding.last) > 1))) cancel();
      if (!riding) {
        for (const id in nodes) { const n = nodes[id]; if (n.lock > 0) { // 空のロープが元の位置へ戻る
          n.lock = Math.max(0, n.lock - dt); const f = 1 - n.lock / RETURN_SECONDS, e = f * f * (3 - 2 * f); n.yaw = n.yaw0 + (((n.yawFrom - n.yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (1 - e); n.draw(n.from + (n.s.th0 - n.from) * e); } }
        if (c.onGround && grip < 1) grip = Math.min(1, grip + GRIP_REGEN * dt);
        showGrip();
        if (!playing() || c.state !== 'normal' || c.onGround || window.skyBite?.locked || grip < GRIP_MIN) return false;
        for (const id in nodes) {
          const n = nodes[id], s = n.s;
          if (n.lock > 0 || !inGrab(s, c.pos) || c.vel.y < -GRAB.maxFall) continue;
          const pk = pick(n.s, c.pos); if (!pk) continue;
          begin(n, pk); break;
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
      const cue = landing(s, r.th, r.w, gravity, r.e);
      n.mat.color.setHex(cue.ok ? 0x7ef0aa : 0xffa21f);
      hint.style.opacity = '1'; showGrip();
      c.jumpBuf = 0;
      // 前へ押していて、進む先に登れる縁が手の届く所にあれば、ロープを離してそのままよじ登る（ジャンプ中と同じ判定へ渡す）。
      const climbable = r.age > .3 && r.th > .15 && r.w > 0 && input && (input.fwdIn || 0) > .25 && (() => { const k = window.__skyInternals, f = k?.canExitLadder; if (!f) return false;
        const sg = r.w >= 0 ? 1 : -1, q = .22 + c.r; return !!f({ x: c.pos.x - r.e.x * sg * q, z: c.pos.z - r.e.z * sg * q, nx: r.e.x * sg, nz: r.e.z * sg, y1: c.pos.y + .95 }); })();
      if (climbable) { n.draw(r.th); release(); return false; }
      if (pressed || Math.abs(r.th) > MAX_ANGLE || r.age > MAX_SECONDS || grip <= 0 || window.skyBite?.locked) { n.draw(r.th); release(); return false; }
      const e = r.e, p = feetAt(s, e, r.th), w = p;
      if (r.age > .2 && !game.oe(p.x, p.y + .012, p.z, c.r, 1.75)) { n.draw(r.th); release(true); return false; }
      const blend = Math.min(1, (game.z.t - r.t0) / .12); // つかんだ直後は、跳んだ位置から円へなめらかに寄せる
      c.pos.set(c.pos.x + (w.x - c.pos.x) * blend, c.pos.y + (p.y - c.pos.y) * blend, c.pos.z + (w.z - c.pos.z) * blend);
      const v = r.w * L; c.vel.set(e.x * v * Math.cos(r.th), v * Math.sin(r.th), e.z * v * Math.cos(r.th));
      c.yaw = Math.atan2(-e.x, -e.z); c.onGround = false; c.h = 1.75;
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
    Object.assign(window.skyRopeStations, { step, cancel, active: () => !!riding, current: () => riding && { id: riding.n.s.id, th: riding.th, w: riding.w, e: riding.e },
      ready: id => nodes[id].lock <= 0, grip: () => grip, nodes, group });
  });
})();
