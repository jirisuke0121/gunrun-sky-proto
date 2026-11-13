// フックの引き寄せを、直線ではなく「振り子のような弧」にする。
// 速さ（最大 hookSpeed）・到着の判定・着地の補助・手動のジャンプ離しは変えない。変えるのは通り道だけ。
//   横へ ±28° まで膨らんで戻り、さらに少し沈んでから上がる（遠いフックほど大きく、7 m 以下は直線のまま）。
//   進み具合 τ（0→1）に対して sin(2πτ) で振る。τ=0 と τ=1 では曲がり0なので、到着の向きと勢いは直線のときと同じ。
// 引く直前に、直線の通り道が空いているときだけ、弧の通り道を 1 度模擬して、体が地形に1点も重ならない弧を選ぶ。
// 選べなければ（狭い所・壁ぎわ）従来どおりの直線。?hookArc=0 で無効。
(() => {
  const D2R = Math.PI / 180;
  const CFG = Object.freeze({ lateral: 28, sag: 12, minRange: 7, fullRange: 16, step: 1 / 60, from: .04, to: .97, margin: .12, reach: 1.6, maxSeconds: 3 });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const off = new URLSearchParams(location.search).get('hookArc') === '0';
  const swing = tau => Math.sin(2 * Math.PI * tau);

  // 目標までのベクトル（e,i,s）と進み具合から、速さ o の速度を返す（曲がり0なら直線と同じ）。
  function velocity(e, i, s, tau, side, lat, sag, o) {
    const h = Math.hypot(e, s) || 1e-6, w = swing(tau), psi = side * lat * w, cs = Math.cos(psi), sn = Math.sin(psi);
    const hx = e / h, hz = s / h, rx = hx * cs - hz * sn, rz = hx * sn + hz * cs;
    const elev = Math.atan2(i, h) - sag * w, ce = Math.cos(elev);
    return [rx * ce * o, Math.sin(elev) * o, rz * ce * o];
  }

  // 引き始めの位置から目標まで、弧で進んだときの「体が地形に重なった点の数」。届かなければ null。
  function trial(game, c, target, r0, side, lat, sag) {
    const { oe, U } = game;
    let x = c.pos.x, y = c.pos.y, z = c.pos.z, t = 0, blocked = 0;
    for (let k = 0; k < CFG.maxSeconds / CFG.step; k++) {
      const e = target[0] - x, i = target[1] - y, s = target[2] - z, r = Math.hypot(e, i, s) || 1e-6;
      if (r < CFG.reach) return blocked;
      const tau = clamp(1 - r / r0, 0, 1), o = Math.min(U.hookSpeed, 8 + t * 30), v = velocity(e, i, s, tau, side, lat, sag, o);
      x += v[0] * CFG.step; y += v[1] * CFG.step; z += v[2] * CFG.step; t += CFG.step;
      if (tau >= CFG.from && tau <= CFG.to && !oe(x, y + .012, z, c.r + CFG.margin, c.h)) blocked++;
    }
    return null;
  }

  function plan(c, anchor) {
    const game = window.__skyInternals;
    if (!game || !api.enabled) return null;
    const target = [anchor[0], anchor[1] + .6, anchor[2]], e = target[0] - c.pos.x, i = target[1] - c.pos.y, s = target[2] - c.pos.z;
    const r0 = Math.hypot(e, i, s), k = clamp((r0 - CFG.minRange) / (CFG.fullRange - CFG.minRange), 0, 1);
    if (k <= 0) return null;
    const lat = CFG.lateral * D2R * k, sag = CFG.sag * D2R * k, h = Math.hypot(e, s) || 1;
    // 好みの向き: いま横へ動いている側。止まっていれば、フックごとに決めた側（毎回同じ向きになる）。
    const sideV = (-s / h) * c.vel.x + (e / h) * c.vel.z, index = game.us.indexOf(anchor);
    const first = Math.abs(sideV) > .6 ? Math.sign(sideV) : (((index >= 0 ? index : Math.round(anchor[0] + anchor[2])) & 1) ? 1 : -1);
    // 直線の通り道が空いている引きだけを弧にする（壁ぎわを這い上がる従来の引き方は、そのまま）。
    if (trial(game, c, target, r0, 1, 0, 0) !== 0) return null;
    for (const [side, l, g] of [[first, lat, sag], [-first, lat, sag], [first, lat, 0], [-first, lat, 0]]) {
      if (trial(game, c, target, r0, side, l, g) === 0) return { anchor, r0, side, lat: l, sag: g, t: c.hookT };
    }
    return null;
  }

  let state = null;
  const api = window.skyHookArc = {
    // index.html の hook 引き寄せから毎フレーム呼ぶ。速度を入れたら true、弧なし（直線）なら false。
    steer(c, anchor, e, i, s, r, o) {
      if (!state || state.anchor !== anchor || c.hookT < state.t) state = plan(c, anchor) || { anchor, none: true, t: c.hookT };
      state.t = c.hookT;
      if (state.none) return false;
      const v = velocity(e, i, s, clamp(1 - r / state.r0, 0, 1), state.side, state.lat, state.sag, o);
      c.vel.set(v[0], v[1], v[2]);
      return true;
    },
    last: () => state,
    velocity,
    enabled: !off,
    CFG,
  };
})();
