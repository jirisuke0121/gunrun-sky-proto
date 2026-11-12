// 風（見た目と音をひとつの仕組みにする、2026-11-13）。
//   見た目: 画面に貼りついた放射状の縞（CSS）は弱め、代わりに「世界の側を流れる風の筋」を出す。
//           カメラの前方・周辺に細い筋の粒を置き、実際の速度ベクトルの向きに流す（走る＝後ろへ、落下＝上へ、スイング＝弧に沿って）。
//           粒は画面の中央を避け（プレイヤーと足場が見える）、長さ・太さ・間隔はばらつく。1メッシュ・約30粒。
//   音:     突風（ランダム。スイングでは掴んだとき・最下点・離したときに必ず）を、見た目の粒の密度と風音の音量・周波数に同時に流す。
//           風音は3層: 中域の風（既存）＋低域のうなり＋高域の笛（速いときだけ、突風で左右に抜ける）。
//   どちらも速さを変えない。止まっていれば無音・無表示。?windFx=0 で従来どおり。
(() => {
  const sky = window.__skyInternals, game = window.__game;
  if (!sky || !game || window.skyWind) return;
  const params = new URLSearchParams(location.search), enabled = params.get('windFx') !== '0';
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const { c, z } = sky, camera = sky.Se, { Mesh, BufferGeometry, Float32Attribute, Basic, Vector3 } = sky.Geom;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = (from, to, dt, rate) => from + (to - from) * (1 - Math.exp(-dt * rate));

  // ---- 風の強さと突風 ----
  const GUST = { attack: .3, decay: 1.1 };
  let level = 0, gust = 0, gustPeak = 0, gustAge = 99, gustPan = 0, gustTimer = 2.5, speedNow = 0;
  let wasRiding = false, lastSign = 0, forced = null, auto = true; // forced: 検査用に突風を固定する。auto: ランダムな突風（検査で切る）
  function triggerGust(power = 1) { gustPeak = clamp(power, .2, 1); gustAge = 0; gustPan = (Math.random() * 2 - 1) * .7; }

  // ---- 見た目: 風の筋（カメラ座標。-z が前、x 右、y 上） ----
  const N = reduced ? 14 : 30;
  const positions = new Float32Array(N * 9), geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32Attribute(positions, 3)); geometry.setDrawRange(0, 0);
  const material = new Basic({ color: 0xe4f2ff, transparent: true, opacity: .45, depthWrite: false, depthTest: false, side: 2 });
  const mesh = new Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 998; mesh.visible = false;
  const particles = Array.from({ length: N }, () => ({ x: 0, y: 0, z: -5, age: 9, life: 1, size: 1 }));
  const vel = new Vector3(), inverse = camera.quaternion.clone();
  if (enabled) camera.add(mesh);
  const halfHeight = d => d * Math.tan((camera.fov || 70) * Math.PI / 360);
  function spawn(p) {
    const d = 2.5 + Math.random() * 10, h = halfHeight(d), w = h * (camera.aspect || 1.78), a = Math.random() * Math.PI * 2, r = .46 + Math.random() * .8; // 中央を避ける
    p.x = Math.cos(a) * r * w; p.y = Math.sin(a) * r * h; p.z = -d; p.age = 0; p.life = .4 + Math.random() * .4; p.size = .6 + Math.random() * .9;
  }
  for (const p of particles) { spawn(p); p.age = Math.random() * p.life; }
  let shown = 0;
  function drawParticles(dt, vis) {
    const active = Math.round(N * smooth(.04, 1, vis));
    if (!enabled || active === 0 || speedNow < 3) { mesh.visible = false; geometry.setDrawRange(0, 0); return; }
    inverse.copy(camera.quaternion); (inverse.invert || inverse.inverse).call(inverse);
    vel.set(c.vel.x, c.vel.y, c.vel.z).applyQuaternion(inverse);
    const s = vel.length(); if (s < 1) { mesh.visible = false; geometry.setDrawRange(0, 0); return; }
    const dx = vel.x / s, dy = vel.y / s, dz = vel.z / s, baseLength = clamp(s * .26, 1.6, 6);
    let at = 0;
    for (let i = 0; i < active; i++) {
      const p = particles[i]; p.age += dt;
      if (p.age >= p.life) spawn(p); else { p.x -= vel.x * dt; p.y -= vel.y * dt; p.z -= vel.z * dt; } // 世界は速度と逆へ流れる
      if (p.z > -.6) { spawn(p); continue; }
      const env = Math.sin(Math.PI * p.age / p.life), len = baseLength * p.size * env, dist = Math.hypot(p.x, p.y, p.z);
      // 筋の幅の向き: 速度方向と視線の外積（画面上でほぼ一定の太さ）。
      let px = dy * p.z - dz * p.y, py = dz * p.x - dx * p.z, pz = dx * p.y - dy * p.x; const pl = Math.hypot(px, py, pz) || 1;
      const wid = dist * .0065 * (.7 + .5 * p.size) / pl; px *= wid; py *= wid; pz *= wid;
      positions[at++] = p.x + px; positions[at++] = p.y + py; positions[at++] = p.z + pz;       // 先頭（太い）
      positions[at++] = p.x - px; positions[at++] = p.y - py; positions[at++] = p.z - pz;
      positions[at++] = p.x + dx * len; positions[at++] = p.y + dy * len; positions[at++] = p.z + dz * len; // 尾（細く消える）
    }
    geometry.attributes.position.needsUpdate = true; geometry.setDrawRange(0, at / 3);
    material.opacity = (reduced ? .3 : .45) + .2 * clamp(vis);
    mesh.visible = at > 0; shown = at / 9;
  }

  // ---- 毎フレーム ----
  function frame(dt) {
    const playing = sky.modeRef() === 'play' && !z.over;
    speedNow = playing ? Math.hypot(c.vel.x, c.vel.y * .7, c.vel.z) : 0;
    // スイング: 掴んだとき・最下点・離したときに、決まって突風を起こす（音と筋が同時に強まる）。
    const rope = window.skyRopeSwing, st = rope?.state?.() || null;
    if (st && !wasRiding) { triggerGust(.9); lastSign = Math.sign(st.th); }
    else if (st && Math.sign(st.th) !== lastSign && Math.abs(st.th) > .02) { triggerGust(1); lastSign = Math.sign(st.th); }
    else if (!st && wasRiding) triggerGust(.8);
    wasRiding = !!st;
    const target = playing ? smooth(5.2, 15, speedNow) : 0;
    level = ease(level, target, dt, target > level ? 4 : 2.2);
    gustAge += dt;
    const env = gustAge < GUST.attack ? smooth(0, GUST.attack, gustAge) : Math.exp(-(gustAge - GUST.attack) / GUST.decay);
    gust = forced !== null ? forced : gustPeak * env;
    if (auto && playing && speedNow > 4.5) { // ふだんのランダムな突風（速いほど頻繁）
      gustTimer -= dt;
      if (gustTimer <= 0) { triggerGust(.45 + Math.random() * .55); gustTimer = (2.2 + Math.random() * 3.6) / (1 + level); }
    }
    drawParticles(dt, level + .35 * gust * smooth(4, 10, speedNow));
  }

  // ---- 音: 低域のうなり＋高域の笛を、既存の風（Ut.wind の手前）に足す ----
  let layers = null;
  function ensureLayers(Ut) {
    if (layers || !Ut.ctx || !Ut.wind) return layers;
    const ctx = Ut.ctx, sr = ctx.sampleRate, length = Math.floor(sr * 5), buffer = ctx.createBuffer(1, length, sr), data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // ピンクノイズ（Paul Kellet）
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1; b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
      b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
    }
    const fade = Math.floor(sr * .4); // ループの継ぎ目を消す（末尾を頭へ重ねる）
    for (let i = 0; i < fade; i++) { const t = i / fade; data[i] = data[i] * t + data[length - fade + i] * (1 - t); }
    const loopEnd = (length - fade) / sr;
    const source = (rate) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.loopEnd = loopEnd; s.playbackRate.value = rate; return s; };
    const rumble = source(.5), rumbleFilter = ctx.createBiquadFilter(), rumbleGain = ctx.createGain();
    rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = 170; rumbleFilter.Q.value = .6; rumbleGain.gain.value = 0;
    rumble.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(Ut.wind); rumble.start();
    const whistle = source(1.25), whistleFilter = ctx.createBiquadFilter(), whistleGain = ctx.createGain(), pan = ctx.createStereoPanner?.() || null;
    whistleFilter.type = 'bandpass'; whistleFilter.frequency.value = 1800; whistleFilter.Q.value = 5; whistleGain.gain.value = 0;
    whistle.connect(whistleFilter); whistleFilter.connect(whistleGain); if (pan) { whistleGain.connect(pan); pan.connect(Ut.wind); } else whistleGain.connect(Ut.wind); whistle.start(Math.random() * 3);
    layers = { rumbleGain, rumbleFilter, whistleGain, whistleFilter, pan, wander: 0, wanderT: 0 };
    return layers;
  }
  const GAINS = { rumble: .62, whistle: .3 };
  function audio(Ut, speed, air, play) {
    if (!enabled || !Ut.ctx) return;
    const L = ensureLayers(Ut); if (!L) return;
    const t = Ut.ctx.currentTime, e = clamp((speed - 2) / 6, 0, 1.6), fast = smooth(.55, 1.35, e);
    L.wanderT -= 1 / 60; if (L.wanderT <= 0) { L.wander = (Math.random() * 2 - 1) * 260; L.wanderT = .3 + Math.random() * .5; }
    Ut.windF.frequency.setTargetAtTime(240 + e * 620 + gust * 320 + (air ? 220 : 0), t, .2);
    L.rumbleGain.gain.setTargetAtTime(play ? GAINS.rumble * (.9 + .25 * gust) : 0, t, .25);
    L.rumbleFilter.frequency.setTargetAtTime(130 + 90 * clamp(e, 0, 1.2) + 90 * gust, t, .3);
    L.whistleGain.gain.setTargetAtTime(play ? GAINS.whistle * fast * (.2 + .8 * gust) : 0, t, .12);
    L.whistleFilter.frequency.setTargetAtTime(1500 + 900 * clamp(e, 0, 1.4) + 700 * gust + L.wander, t, .15);
    L.pan?.pan.setTargetAtTime(gustPan * gust, t, .2);
  }

  window.skyWind = { frame, audio, triggerGust,
    get gain() { return enabled ? 1 + .12 * gust * smooth(3, 9, speedNow) : 1; }, // cv() の風音量に掛ける
    get cssScale() { return enabled ? .4 : 1; },                                   // 画面の縞（CSS）を弱める倍率
    get state() { return { level, gust, shown, enabled, particles: N, speed: speedNow, layers: !!layers }; },
    get nodes() { return layers; }, get mesh() { return mesh; }, get positions() { return positions; },
    set randomGusts(v) { auto = !!v; }, set forceGust(v) { forced = v; gust = v ?? gust; }, set level(v) { level = v; } };
  document.body.dataset.skyWindReady = 'true';
})();
