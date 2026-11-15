// Short side-view demos for the コツ (tips) screen and the 2nd-run game-over card. Presentation only: no game state is read or changed.
// Captions are plain Japanese strings that i18n.js translates when they reach the DOM; text drawn on the canvas goes through skyI18n.tr.
(() => {
  const W = 380, H = 150;
  const lerp = (a, b, u) => a + (b - a) * u, cl = u => Math.max(0, Math.min(1, u));
  const S = (t0, t1, f, pose) => ({ t0, t1, f, pose });
  const run = (x0, y0, x1, y1) => u => [lerp(x0, x1, u), lerp(y0, y1, u)];
  const arc = (x0, y0, x1, y1, h) => u => [lerp(x0, x1, u), lerp(y0, y1, u) - 4 * h * u * (1 - u)];
  const hold = (x, y) => () => [x, y];
  const GOLD = '#EF9F27', RED = '#E24B4A', TEAL = '#35c79a', GREEN = '#8fcf4a';
  const BG = 'rgba(255,255,255,.05)', FILL = 'rgba(150,170,190,.30)', LINE = 'rgba(190,205,218,.9)', FG = '#e8eef2';
  const tr = s => (window.skyI18n && window.skyI18n.tr) ? window.skyI18n.tr(s) : s;
  let g;
  const rope = { a: [190, 8], L: 100 };
  const ropeP = u => { const a = -Math.cos(Math.PI * u); return [rope.a[0] + rope.L * Math.sin(a), rope.a[1] + rope.L * Math.cos(a) + 34]; };
  const zy = x => 30 + (x - 50) * 0.207 + 34;
  const burst = (t, t0, t1, x, y, c) => { if (t < t0 || t > t1) return; const u = (t - t0) / (t1 - t0); g.strokeStyle = c; g.globalAlpha = 1 - u; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 6 + 34 * u, 0, 7); g.stroke(); g.globalAlpha = 1; };

  const SC = {
    wallrun: { name: '壁走り', dur: 4.4, plat: [[0, 110, 80, 40], [300, 110, 80, 40], [90, 40, 200, 40]],
      segs: [S(0, 0.8, run(18, 110, 72, 110), 'run'), S(0.8, 1.2, arc(72, 110, 100, 82, 22), 'air'), S(1.2, 2.6, run(100, 82, 258, 82), 'run'), S(2.6, 3.3, arc(258, 82, 318, 110, 34), 'air'), S(3.3, 4.2, run(318, 110, 364, 110), 'run')],
      marks: [[0.4, 1.2, 86, 60, '壁ぎわで前＋ジャンプ'], [2.2, 2.65, 262, 64, '金色で跳ぶ']],
      steps: [[0, '青緑の矢印がある壁へ'], [1.3, '壁沿いに前へ進む'], [2.4, '金色の合図で跳び出す']],
      draw: t => { g.fillStyle = 'rgba(150,170,190,.2)'; g.fillRect(90, 40, 200, 40); const o = (t * 40) % 20; g.strokeStyle = TEAL; g.lineWidth = 2; for (let x = 80 + o; x < 250; x += 20) { if (x < 100) continue; g.beginPath(); g.moveTo(x, 70); g.lineTo(x + 7, 74); g.lineTo(x, 78); g.stroke(); } g.fillStyle = GOLD; g.beginPath(); g.moveTo(262, 70); g.lineTo(272, 74); g.lineTo(262, 78); g.fill(); } },
    items: { name: 'アイテム', dur: 4.2, noGhost: true, plat: [],
      steps: [[0, '閃光玉：近くのゾンビを数秒止める'], [1.4, '分身：追手をおびき寄せる'], [2.8, '救済：安全な高台へ自動で逃げる']],
      draw: t => { const cx = [80, 190, 300], cs = [GOLD, TEAL, GREEN], nm = ['閃光玉', '分身', '救済'], a = Math.floor(Math.min(t, 4.19) / 1.4); g.font = '500 12px sans-serif'; g.textAlign = 'center';
        for (let i = 0; i < 3; i++) { const on = i === a; g.lineWidth = on ? 4 : 2; g.strokeStyle = cs[i]; g.globalAlpha = on ? 1 : .45; g.beginPath(); g.arc(cx[i], 62, on ? 30 + 2 * Math.sin(t * 9) : 26, 0, 7); g.stroke(); g.fillStyle = cs[i];
          if (i === 0) { g.beginPath(); g.moveTo(cx[i] + 4, 48); g.lineTo(cx[i] - 8, 66); g.lineTo(cx[i], 66); g.lineTo(cx[i] - 4, 78); g.lineTo(cx[i] + 8, 58); g.lineTo(cx[i], 58); g.fill(); }
          if (i === 1) { g.beginPath(); g.arc(cx[i] - 8, 60, 6, 0, 7); g.arc(cx[i] + 8, 60, 6, 0, 7); g.fill(); g.fillRect(cx[i] - 13, 67, 10, 9); g.fillRect(cx[i] + 3, 67, 10, 9); }
          if (i === 2) { g.beginPath(); g.moveTo(cx[i], 46); g.lineTo(cx[i] - 11, 60); g.lineTo(cx[i] - 4, 60); g.lineTo(cx[i] - 4, 78); g.lineTo(cx[i] + 4, 78); g.lineTo(cx[i] + 4, 60); g.lineTo(cx[i] + 11, 60); g.fill(); }
          g.globalAlpha = 1; g.fillStyle = FG; g.fillText(tr(nm[i]), cx[i], 118); }
        g.textAlign = 'left'; } },
    rope: { name: 'ロープ振り', dur: 4.6, plat: [[0, 110, 70, 40], [310, 110, 70, 40]],
      segs: [S(0, 0.8, run(18, 110, 62, 110), 'run'), S(0.8, 1.2, u => { const e = ropeP(0); return [lerp(62, e[0], u), lerp(110, e[1], u) - 4 * 18 * u * (1 - u)]; }, 'air'), S(1.2, 2.9, ropeP, 'hang'), S(2.9, 3.6, arc(274, 95, 330, 110, 24), 'air'), S(3.6, 4.4, run(330, 110, 372, 110), 'run')],
      marks: [[2.4, 2.95, 274, 60, 'ジャンプで離す']],
      steps: [[0.2, 'ロープへ跳びつく'], [1.6, '前に振れたら…'], [2.6, 'ジャンプで離して向こう岸へ']],
      draw: (t, p) => { g.strokeStyle = LINE; g.lineWidth = 2; g.fillStyle = LINE; g.beginPath(); g.arc(190, 8, 4, 0, 7); g.fill(); if (t >= 0.8 && t <= 2.9) { g.beginPath(); g.moveTo(190, 8); g.lineTo(p[0], p[1] - 34); g.stroke(); } else if (t < 0.8) { g.beginPath(); g.moveTo(190, 8); g.lineTo(ropeP(0)[0], ropeP(0)[1] - 34); g.stroke(); } } },
    zip: { name: 'ジップライン', dur: 4.6, plat: [[0, 110, 70, 40], [300, 100, 80, 50]],
      segs: [S(0, 0.8, run(16, 110, 56, 110), 'run'), S(0.8, 1.3, arc(56, 110, 72, zy(72), 24), 'air'), S(1.3, 3.0, u => { const x = lerp(72, 300, u); return [x, zy(x)]; }, 'hang'), S(3.0, 3.7, arc(300, zy(300), 346, 100, 28), 'air'), S(3.7, 4.4, run(346, 100, 372, 100), 'run')],
      marks: [[0.4, 0.85, 56, 70, 'ジャンプ'], [2.5, 3.05, 300, 64, 'ジャンプで距離UP']],
      steps: [[0.2, 'ロープの下でジャンプ'], [1.6, 'あとは自動で渡る'], [2.8, '降りるときもジャンプで遠くへ']],
      draw: () => { g.strokeStyle = LINE; g.lineWidth = 2; g.beginPath(); g.moveTo(50, 30); g.lineTo(320, 86); g.stroke(); g.fillStyle = LINE; g.fillRect(47, 28, 5, 82); g.fillRect(317, 84, 5, 16); } },
    blast: { name: '爆破ジャンプ', dur: 4.2, plat: [[0, 110, 150, 40], [250, 62, 130, 88]],
      segs: [S(0, 1.3, run(20, 110, 116, 110), 'run'), S(1.3, 1.7, hold(116, 110), 'stand'), S(1.7, 2.7, arc(116, 110, 272, 62, 72), 'air'), S(2.7, 3.8, run(272, 62, 350, 62), 'run')],
      marks: [[1.0, 1.75, 140, 92, 'ドラム缶をタップ']],
      steps: [[0, '赤いドラム缶に近づく'], [1.2, 'ドラム缶をタップ'], [1.8, '爆風で高い屋上へ']],
      draw: t => { if (t < 1.75) { g.fillStyle = RED; g.fillRect(132, 96, 16, 14); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(132, 101, 16, 3); } burst(t, 1.7, 2.3, 140, 100, RED); } },
    jumpgun: { name: 'ジャンプガン', dur: 4.4, plat: [[0, 110, 230, 40], [262, 50, 118, 100]],
      segs: [S(0, 1.0, run(20, 110, 92, 110), 'run'), S(1.0, 1.7, run(92, 110, 170, 110), 'run'), S(1.7, 1.9, hold(170, 110), 'stand'), S(1.9, 2.9, arc(170, 110, 286, 50, 78), 'air'), S(2.9, 3.9, run(286, 50, 356, 50), 'run')],
      marks: [[1.3, 1.95, 170, 84, '足元に撃つ']],
      steps: [[0.3, '金色のJUMPを拾う'], [1.5, '足元に撃つ（ボタン／4キー）'], [2.1, '大ジャンプで高台へ']],
      draw: t => { if (t < 1.0) { g.fillStyle = GOLD; g.fillRect(84, 92, 16, 14); g.fillStyle = 'rgba(0,0,0,.45)'; g.font = '500 9px sans-serif'; g.fillText('JUMP', 85, 102); } burst(t, 1.9, 2.5, 170, 112, GOLD); } },
    bar: { name: '鉄棒つかみ直し', dur: 4.4, plat: [[0, 40, 90, 110], [290, 92, 90, 58]],
      segs: [S(0, 0.8, run(16, 40, 84, 40), 'run'), S(0.8, 1.6, u => [lerp(84, 160, u), lerp(40, 104, u * u)], 'air'), S(1.6, 2.4, u => [160, 104 + 3 * Math.sin(u * 6)], 'hang'), S(2.4, 3.1, arc(160, 104, 300, 92, 40), 'air'), S(3.1, 4.0, run(300, 92, 360, 92), 'run')],
      marks: [[2.0, 2.45, 160, 64, 'ジャンプ']],
      steps: [[0.3, '縁から飛び降りる'], [1.1, '鉄棒の高さを通ると自動でつかむ'], [2.3, 'ジャンプで先へ']],
      draw: () => { g.strokeStyle = LINE; g.lineWidth = 3; g.beginPath(); g.moveTo(130, 70); g.lineTo(195, 70); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(130, 70); g.lineTo(130, 150); g.moveTo(195, 70); g.lineTo(195, 150); g.stroke(); } }
  };
  // Order of importance (provisional): what to teach first when a move has never been used.
  const ORDER = ['wallrun', 'items', 'rope', 'zip', 'blast', 'jumpgun', 'bar'];

  function ghost(x, y, pose, t) {
    g.strokeStyle = TEAL; g.fillStyle = TEAL; g.globalAlpha = .9; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y - 27, 5, 0, 7); g.fill(); g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x, y - 11); g.stroke();
    const ph = Math.sin(t * 14); g.beginPath();
    if (pose === 'run') { g.moveTo(x, y - 11); g.lineTo(x + ph * 7, y); g.moveTo(x, y - 11); g.lineTo(x - ph * 7, y); g.moveTo(x, y - 20); g.lineTo(x - ph * 6, y - 12); }
    else if (pose === 'air') { g.moveTo(x, y - 11); g.lineTo(x + 6, y - 5); g.moveTo(x, y - 11); g.lineTo(x - 4, y - 3); g.moveTo(x, y - 20); g.lineTo(x + 7, y - 26); }
    else if (pose === 'hang') { g.moveTo(x, y - 11); g.lineTo(x - 1, y); g.moveTo(x, y - 11); g.lineTo(x + 2, y); g.moveTo(x, y - 20); g.lineTo(x - 4, y - 34); g.moveTo(x, y - 20); g.lineTo(x + 4, y - 34); }
    else { g.moveTo(x, y - 11); g.lineTo(x - 3, y); g.moveTo(x, y - 11); g.lineTo(x + 3, y); }
    g.stroke(); g.globalAlpha = 1;
  }
  function at(sc, t) {
    const s = sc.segs; if (t <= s[0].t0) return { p: s[0].f(0), pose: s[0].pose };
    for (const q of s) if (t >= q.t0 && t <= q.t1) return { p: q.f(cl((t - q.t0) / (q.t1 - q.t0))), pose: q.pose };
    const l = s[s.length - 1]; return { p: l.f(1), pose: l.pose };
  }
  function renderScene(sc, t, marks) {
    g.clearRect(0, 0, W, H); g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.fillStyle = FILL; g.strokeStyle = LINE; g.lineWidth = 2;
    for (const p of sc.plat) { g.fillRect(p[0], p[1], p[2], p[3]); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + p[2], p[1]); g.stroke(); }
    let pos = null;
    if (!sc.noGhost) { pos = at(sc, t); for (let k = 6; k >= 1; k--) { const q = at(sc, Math.max(0, t - k * .07)); g.globalAlpha = .07 * (7 - k); g.fillStyle = TEAL; g.beginPath(); g.arc(q.p[0], q.p[1] - 14, 4, 0, 7); g.fill(); } g.globalAlpha = 1; }
    sc.draw && sc.draw(t, pos ? pos.p : null);
    if (pos) ghost(pos.p[0], pos.p[1], pos.pose, t);
    if (marks) for (const m of sc.marks || []) if (t >= m[0] && t <= m[1]) {
      g.strokeStyle = GOLD; g.lineWidth = 3; g.beginPath(); g.arc(m[2], m[3], 11 + 3 * Math.sin(t * 10), 0, 7); g.stroke();
      g.fillStyle = FG; g.font = '500 12px sans-serif'; const label = tr(m[4]), w = g.measureText(label).width, tx = Math.max(4, Math.min(W - w - 4, m[2] - w / 2)); g.fillText(label, tx, m[3] - 18);
    }
    let k = 0; sc.steps.forEach((s, i) => { if (t >= s[0]) k = i; }); return k;
  }

  // One player per canvas. show(id) restarts the loop for that tip; onStep(text, index, total) fires when the caption changes.
  function createPlayer(canvas, opts = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const marks = opts.marks !== false;
    let id = null, t0 = 0, last = -1, dead = false;
    function frame(now) {
      if (dead || !canvas.isConnected) return;
      if (id && canvas.offsetParent !== null) {
        g = ctx; const sc = SC[id], t = Math.min(((now - t0) / 1000) % (sc.dur + 0.9), sc.dur), k = renderScene(sc, t, marks);
        if (k !== last) { last = k; opts.onStep && opts.onStep(sc.steps[k][1], k, sc.steps.length); }
        requestAnimationFrame(frame);
      } else setTimeout(() => requestAnimationFrame(frame), 250);
    }
    return {
      show(next) { if (!SC[next]) return; id = next; t0 = performance.now(); last = -1; requestAnimationFrame(frame); },
      destroy() { dead = true; }
    };
  }
  window.skyTips = { ORDER, names: Object.fromEntries(Object.entries(SC).map(([k, v]) => [k, v.name])), createPlayer,
    steps: Object.fromEntries(Object.entries(SC).map(([k, v]) => [k, v.steps.map(s => s[1])])) };
})();
