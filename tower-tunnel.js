// 塔のトンネル（旧市街・中央の塔）。東の長い斜面を滑り降りると塔の屋上の縁から穴へ入り、
// 塔の中をU字に抜けて、屋上の穴から真上へ打ち上がる。打ち上がった先でマップ全体が見渡せる（頂点 約23 m）。
//
// 屋内通路を壊さない掘り方（2026-11-07）:
//   * 掘るのは東面の屋根の帯 z -10.0〜-7.5 だけ。東の回廊（x 11〜13・床 y 4）は残し、
//     その真上に薄い滑り台の殻（厚さ0.3 m）を被せる。殻の下端は y 6.5 以上なので天井高 2.5 m 以上が残る。
//   * 回廊の梁（z -7.5〜-6.5）は帯の外。触らない。
//   * 芯（x -11〜11 の塊）は帯の中だけ掘る。外側の回廊・階段・扉は変えない。
//   * 屋根は入口の坑（x 7.2〜14）と出口の穴（x -3.0〜-1.4）だけ開ける。間の x -1.4〜7.2 は屋根が残るのでトンネルになる。
// 射出は見える仕掛け: U字の内面に橙の帯、出口の穴に光の柱。ここを通ると決まった速度で打ち上がる（ジャンプ台と同じ考え方）。
// 入口の制限（2026-11-07）: 長い斜面を滑り降りて入口（x=14）を速く通った人だけが「入場券」を得る。券と速さが底まで残ったときだけ打ち上がる。
//   歩いて入る・横や穴から落ちる・助走なしで滑るだけでは発動しない（誰でも即発動する乱用を防ぐ）。
// 出口は西へ流れる角度（77°）。屋上の西の広場の床（x≈-19）に降りる。
(() => {
  const Z0 = -10, Z1 = -7.5;               // 帯（トンネルの幅 2.5 m）
  const XB = 2.07, YB = 3.43;              // 滑り台の底＝U字の始点
  const XT = 14, YT = 8;                   // 滑り台の上端（塔の屋上の縁）
  const XC = 11;                           // ここより東は回廊の上（殻だけ）
  const R = 5.1, TH = 77 * Math.PI / 180;  // U字の半径と出口の角度
  const SHELL = .3, FILL0 = 3.2, ROOF_Y = 7.6;
  const HOLE_E = -1.4;                     // 出口の穴の東端（頭が屋根の縁に触れない余裕）
  const HOLE_W = -3.6;                     // 出口の穴の西端（西へ流れる体が壁に触れない余裕）
  const LIP_X = XB - R * Math.sin(TH), LIP_Y = YB + R * (1 - Math.cos(TH));
  const EXIT_SPEED = 25.5, EXIT_VZ = 1;   // vz: 広場の床（z -8〜8）の内側に降りる（入った位置が帯の北端でも床の外に出ない）
  const ENTRY_SPEED = 12.5;                // 入口（x=14）をこれ以上の速さで滑り降りて通ると入場券を得る。実測: x31より上から約2秒以上滑ると届く（x28で11.3、x34で13.2、x38で14.5）
  const MIN_SPEED = 11;                    // 底でもこれ以上の速さが残っていること
  const TICKET_SECONDS = 6;                // 券の有効時間（入口から底まで約1.3秒。余裕を見た上限）
  const T = { Z0, Z1, XB, YB, XT, YT, XC, R, TH, SHELL, FILL0, ROOF_Y, HOLE_E, HOLE_W, LIP_X, LIP_Y, EXIT_SPEED, EXIT_VZ, ENTRY_SPEED, MIN_SPEED, TICKET_SECONDS,
    arcLength: R * TH, grade: (YT - YB) / (XT - XB) };

  const surfaceY = x => YB + (YT - YB) * (x - XB) / (XT - XB);
  const arcPoint = th => ({ x: XB - R * Math.sin(th), y: YB + R * (1 - Math.cos(th)) });
  function exitVelocity() { return { x: -Math.cos(TH) * EXIT_SPEED, y: Math.sin(TH) * EXIT_SPEED, z: EXIT_VZ }; }
  function flight(gravity = 20) {
    const v = exitVelocity(), apexT = v.y / gravity, apex = LIP_Y + v.y * v.y / (2 * gravity);
    const over = h => { const d = Math.sqrt(Math.max(0, v.y * v.y - 2 * gravity * (h - LIP_Y))); return [(v.y - d) / gravity, (v.y + d) / gravity]; };
    const [t20a, t20b] = over(20);
    // 着地は広場の床（y=0）。
    const landT = (v.y + Math.sqrt(v.y * v.y + 2 * gravity * LIP_Y)) / gravity;
    return { v, apex, apexT, landT, landX: LIP_X + v.x * landT, landZ: v.z * landT, above20: t20b - t20a };
  }

  // --- 掘削（箱の引き算） ---
  function subtract(b, v) {
    const x0 = Math.max(b.minX, v.minX), x1 = Math.min(b.maxX, v.maxX), y0 = Math.max(b.minY, v.minY),
      y1 = Math.min(b.maxY, v.maxY), z0 = Math.max(b.minZ, v.minZ), z1 = Math.min(b.maxZ, v.maxZ);
    if (x1 - x0 <= 1e-6 || y1 - y0 <= 1e-6 || z1 - z0 <= 1e-6) return null;
    const out = [], mk = (a, b0, c, d, e, f) => { if (d - a > 1e-6 && e - b0 > 1e-6 && f - c > 1e-6) out.push({ ...b, minX: a, minY: b0, minZ: c, maxX: d, maxY: e, maxZ: f }); };
    mk(b.minX, b.minY, b.minZ, x0, b.maxY, b.maxZ); mk(x1, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
    mk(x0, b.minY, b.minZ, x1, b.maxY, z0); mk(x0, b.minY, z1, x1, b.maxY, b.maxZ);
    mk(x0, b.minY, z0, x1, y0, z1); mk(x0, y1, z0, x1, b.maxY, z1);
    return out;
  }
  function cut(jn, vol, pick) {
    let removed = 0;
    for (let i = jn.length - 1; i >= 0; i--) {
      const b = jn[i];
      if (b.hidden || !pick(b)) continue;
      const rest = subtract(b, vol);
      if (!rest) continue;
      jn.splice(i, 1, ...rest); removed++;
    }
    return removed;
  }

  function build({ ne, jn, Ja, hd }) {
    const lane = { minZ: Z0, maxZ: Z1 };
    const isCore = b => b.type === 'mono';
    const isRoof = b => b.type === 'slab' && b.minY >= ROOF_Y - .05 && b.maxY <= 8.05;
    // 1. 芯と東の外壁を、帯の中だけ y 3.2 より上を取り除く（下は残す）。
    cut(jn, { minX: HOLE_W, maxX: XT, minY: FILL0, maxY: 8.5, ...lane }, isCore);
    // 2. 屋根を開ける: 入口の坑と出口の穴。
    cut(jn, { minX: 7.2, maxX: XT, minY: 7, maxY: 8.5, ...lane }, isRoof);
    cut(jn, { minX: HOLE_W, maxX: HOLE_E, minY: 7, maxY: 8.5, ...lane }, isRoof);
    // 3. 滑り台。芯の中（x<11）は下を詰める。回廊の上（11〜13）は薄い殻だけ。東の外壁（13〜14）は殻の下を詰める。
    const made = [];
    const chute = (x0, x1, y0, y1) => {
      const before = jn.length;
      hd('x', x0, x1, Z0, Z1, y0, y1, SHELL);
      for (const s of jn.slice(before)) made.push(s);
    };
    chute(XB, XC, YB, surfaceY(XC));
    chute(XC, XT, surfaceY(XC), YT);
    for (const s of made) {
      if (s.maxX <= XC + 1e-6) ne(s.minX, FILL0, Z0, s.maxX, s.maxY - .12, Z1, 'mono').tunnel = 'fill';
      else if (s.minX >= 13 - 1e-6) ne(s.minX, FILL0, Z0, s.maxX, s.maxY - SHELL + .04, Z1, 'mono').tunnel = 'fill';
    }
    // 4. U字。当たり判定は曲線の下に詰めた細い柱、見た目は曲線に沿う薄い板。
    const N = 24, d = TH / N, zc = (Z0 + Z1) / 2;
    for (let i = 0; i < N; i++) {
      const a = arcPoint(i * d), b = arcPoint((i + 1) * d);
      ne(b.x, FILL0, Z0, a.x, Math.max(a.y, FILL0 + .05), Z1, 'mono').tunnel = 'arc';
      const dx = a.x - b.x, dy = a.y - b.y, len = Math.hypot(dx, dy) + .06;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, cx = XB, cy = YB + R;
      const nx = (cx - mx) / R, ny = (cy - my) / R;   // 空洞側（曲線の中心向き）
      Ja.push({ x: mx - nx * .15, y: my - ny * .15, z: zc, w: len, h: .3, d: Z1 - Z0, rx: 0, ry: 0, rz: Math.atan2(dy, dx), solidLook: true });
    }
    // 出口の縁の手前（穴の西端〜縁）は、縁の高さまで詰める。
    ne(HOLE_W, FILL0, Z0, LIP_X, LIP_Y, Z1, 'mono').tunnel = 'arc';
    return { made: made.length };
  }

  window.SKY_TOWER_TUNNEL = T;
  window.buildTowerTunnel = build;
  window.skyTowerTunnel = { T, surfaceY, arcPoint, exitVelocity, flight, subtract, cut, build };

  // --- 実行時: 見た目の目印と、底から打ち上げる処理 ---
  addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game || !window.skyOldTownSwingCourse || window.skyPracticeMode) return;
    const { c, U } = game, stats = window.__game.stats;
    const { Box, Mesh, Group, Basic } = game.Geom;
    const zc = (Z0 + Z1) / 2;

    // 目印（当たり判定なし）: U字と滑り台の橙の帯、出口の穴の縁、打ち上がる先を示す光の柱。
    const stripe = new Basic({ color: 0xffa21f });
    const beam = new Basic({ color: 0xff9a1f, transparent: true, opacity: .26, depthWrite: false });
    const group = new Group(); group.name = 'Tower tunnel marks';
    const put = (geometry, material, x, y, z, rz = 0) => { const m = new Mesh(geometry, material); m.position.set(x, y, z); m.rotation.z = rz; group.add(m); return m; };
    for (let deg = 12; deg < TH * 180 / Math.PI - 1; deg += 12) {
      const th = deg * Math.PI / 180, p = arcPoint(th);
      put(new Box(.16, .03, Z1 - Z0 - .2), stripe, p.x - Math.sin(th) * .0, p.y + .03, zc, -th);
    }
    const slope = Math.atan2(YT - YB, XT - XB);
    for (const x of [13.2, 11.6, 9.8, 7.8, 5.6, 3.4]) put(new Box(.3, .03, Z1 - Z0 - .2), stripe, x, surfaceY(x) + .03, zc, slope);
    const rimY = 8.03, hx = (HOLE_W + HOLE_E) / 2, hw = HOLE_E - HOLE_W;
    put(new Box(hw + .3, .05, .15), stripe, hx, rimY, Z0 - .075);
    put(new Box(hw + .3, .05, .15), stripe, hx, rimY, Z1 + .075);
    put(new Box(.15, .05, Z1 - Z0), stripe, HOLE_W - .075, rimY, zc);
    put(new Box(.15, .05, Z1 - Z0), stripe, HOLE_E + .075, rimY, zc);
    const shaft = put(new Box(hw, 15, Z1 - Z0 - .2), beam, hx, 8 + 7.5, zc);
    game.ue.add(group);
    const pulse = () => { beam.opacity = .22 + .08 * Math.sin(performance.now() / 400); requestAnimationFrame(pulse); };
    requestAnimationFrame(pulse);

    // 入口（x=14）を ENTRY_SPEED 以上で滑り降りて通った人だけが入場券を得る。底でも券と MIN_SPEED が残っていれば、
    // U字を回って出口の穴から打ち上がる。操作は効かない（見える仕掛け）。
    let riding = null, ticket = null, prevX = null;
    const playing = () => game.modeRef() === 'play' && !game.z.over;
    function begin() {
      const speed = Math.hypot(c.vel.x, c.vel.z);
      riding = { s: 0, v0: Math.min(15, Math.max(9, speed)), z: Math.min(Z1 - .4, Math.max(Z0 + .4, c.pos.z)), t0: game.z.t, last: null };
      ticket = null;
      if (['slide', 'ledge', 'ladder'].includes(c.state)) c.state = 'normal';
      c.onGround = false; c.coyote = 0; c.jumpBuf = 0; c.edgeJump = false; c.slideT = 0; c.h = .9; c.crouchPressed = false;
      window.skyLandingRoll?.cancel?.();
    }
    function release() {
      const v = exitVelocity();
      c.pos.set(LIP_X, LIP_Y + .05, riding.z);
      c.vel.set(v.x, v.y, v.z);
      c.state = 'normal'; c.onGround = false; c.coyote = 0; c.airT = 0; c.edgeJump = false; c.jumpBuf = 0; c.slideCD = .4; c.h = 1.75;
      c.yaw = Math.atan2(-v.x, -v.z); c.shake = Math.max(c.shake || 0, .4);
      stats.towerTunnel = (stats.towerTunnel || 0) + 1;
      riding = null;
    }
    function updateTicket(p, speed) {
      const inLane = p.z > Z0 + .05 && p.z < Z1 - .05;
      // 入口の線を、斜面から西向きに、速く、滑りながら通った瞬間だけ券が出る。
      if (prevX !== null && prevX > XT && p.x <= XT && inLane && p.y >= YT - .6 && speed >= ENTRY_SPEED && c.state === 'slide' && c.vel.x < -.8 * speed) {
        ticket = { t: game.z.t };
        stats.towerTickets = (stats.towerTickets || 0) + 1;
      }
      if (ticket && (p.x > XT + .6 || !inLane && p.x > XB - 1 || game.z.t < ticket.t || game.z.t - ticket.t > TICKET_SECONDS)) ticket = null;
      prevX = p.x;
    }
    function step(dt) {
      if (riding && (!playing() || game.z.t < riding.t0 || (riding.last && c.pos.distanceTo(riding.last) > .6))) riding = null;
      if (!riding) {
        if (!playing()) { ticket = null; prevX = null; return false; }
        const p = c.pos, speed = Math.hypot(c.vel.x, c.vel.z);
        updateTicket(p, speed);
        if (!ticket || !['normal', 'slide'].includes(c.state) || window.skyBite?.locked) return false;
        if (p.z < Z0 + .05 || p.z > Z1 - .05 || p.x > XB + .05 || p.x < XB - .7 || Math.abs(p.y - YB) > .6 ||
            speed < MIN_SPEED || c.vel.x > -.8 * speed) return false;
        begin();
      }
      const f = Math.min(1, riding.s / T.arcLength), v = riding.v0 + (EXIT_SPEED - riding.v0) * f;
      riding.s += v * dt;
      if (riding.s >= T.arcLength) { release(); return false; }
      const th = riding.s / R, p = arcPoint(th);
      c.pos.set(p.x, p.y, riding.z); c.vel.set(-Math.cos(th) * v, Math.sin(th) * v, 0);
      c.yaw = Math.PI / 2; c.onGround = false; c.h = .9;
      riding.last = c.pos.clone();
      return true;
    }
    window.skyTowerTunnel.step = step;
    window.skyTowerTunnel.active = () => !!riding;
    window.skyTowerTunnel.hasTicket = () => !!ticket;
    window.skyTowerTunnel.shaft = shaft;
  });
})();
