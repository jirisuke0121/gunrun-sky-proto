// ジャンプ台（旧市街）。台の近くに立つと目印が出て、タップ／Bキーで高台へ大ジャンプする補助式。
// 動きは通常の物理（初速を与えるだけ）。ドカンの爆破ジャンプと同じ軌道式で、着地先の屋根の少し上を通って降りる。
// 置き場所は tools/escape-sites.cjs で候補を出し、tools/jump-pad-verify.cjs で実物理の着地を確認したものだけ。
(() => {
  window.SKY_JUMP_PADS = [
    { at: [-47, 0, 7], land: [-55, 6.4, 3], name: '西の路地' }, // 倉庫の上階通路へ（実物理で着地確認済み）
  ];
  addEventListener('load', () => {
    const game = window.__skyInternals;
    if (!game || !window.skyOldTownSwingCourse || window.skyPracticeMode) return;
    const pads = window.SKY_JUMP_PADS, stats = window.__game.stats;
    const { Standard, Cylinder, Torus, Mesh, Group, Vector3 } = game.Geom;
    const RANGE = 2, isTouch = () => document.documentElement.classList.contains('touch');

    // 台の見た目（当たり判定なし）: 黄色い円盤と、ゆっくり明滅する輪。
    const discMaterial = new Standard({ color: 0xffc943, emissive: 0x6b3900, emissiveIntensity: .5, roughness: .5 });
    const ringMaterial = new Standard({ color: 0xfff4d6, emissive: 0xffd37c, emissiveIntensity: .8, roughness: .4, transparent: true, opacity: .8 });
    for (const pad of pads) {
      const group = new Group(); group.name = 'Jump pad';
      const disc = new Mesh(new Cylinder(.85, .85, .12, 28), discMaterial); disc.position.y = .06;
      const ring = new Mesh(new Torus(.95, .06, 6, 32), ringMaterial); ring.rotation.x = Math.PI / 2; ring.position.y = .16;
      group.add(disc, ring); group.position.set(pad.at[0], pad.at[1], pad.at[2]); game.ue.add(group); pad.group = group;
    }

    const mark = document.createElement('div'); mark.id = 'padMark';
    Object.assign(mark.style, { position: 'absolute', width: '52px', height: '52px', margin: '-26px', boxSizing: 'border-box',
      border: '3px solid #fff4d6', borderRadius: '50%', background: 'rgba(240,160,30,.94)', boxShadow: '0 0 14px #f0a01ecc',
      color: '#2b1a00', font: 'bold 12px sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: '0', pointerEvents: 'none', transition: 'opacity .12s', zIndex: '21' });
    const markHost = document.getElementById('hookMark');
    (markHost?.parentElement || document.body).appendChild(mark);
    const hint = document.createElement('div');
    Object.assign(hint.style, { position: 'fixed', left: '50%', top: '118px', transform: 'translateX(-50%)', zIndex: '21', pointerEvents: 'none',
      padding: '4px 10px', borderRadius: '8px', background: 'rgba(24,20,14,.6)', color: '#ffe4a1', font: 'bold 12px sans-serif',
      textAlign: 'center', whiteSpace: 'nowrap', display: 'none' });
    document.body.appendChild(hint);
    const projected = new Vector3();

    // ドカンと同じ式: 着地する屋根の1.1m上を通り、降りながら着く。
    function arc(from, land) {
      const gravity = Math.abs(game.U?.gravity ?? 20), rise = land[1] - from.y;
      const up = Math.min(17.5, Math.max(11, Math.sqrt(2 * gravity * Math.max(.5, rise + 1.1))));
      const time = (up + Math.sqrt(Math.max(up * up - 2 * gravity * rise, 0))) / gravity;
      return { x: (land[0] - from.x) / time, y: up, z: (land[2] - from.z) / time, time };
    }
    function launch(pad) {
      const player = game.c;
      if (!pad || game.z.over || player.state === 'hook') return false;
      if (['ledge', 'ladder', 'slide'].includes(player.state)) player.state = 'normal';
      player.ledge = null; player.ladder = null;
      const v = arc(player.pos, pad.land);
      player.state = 'normal'; player.onGround = false; player.coyote = 0; player.airT = 0; player.edgeJump = false; player.jumpBuf = 0;
      player.vel.set(v.x, v.y, v.z);
      player.yaw = Math.atan2(-(pad.land[0] - player.pos.x), -(pad.land[2] - player.pos.z));
      stats.padJumps = (stats.padJumps || 0) + 1;
      return true;
    }
    function assistTarget() {
      const player = game.c;
      if (game.modeRef() !== 'play' || game.z.over || player.state !== 'normal' || !player.onGround) return null;
      game.Se.updateMatrixWorld();
      for (const pad of pads) {
        if (Math.hypot(pad.at[0] - player.pos.x, pad.at[2] - player.pos.z) > RANGE || Math.abs(pad.at[1] - player.pos.y) > .7) continue;
        projected.set(pad.at[0], pad.at[1] + .8, pad.at[2]).project(game.Se);
        // 台の真上に立つと画面の外になるので、そのときは画面の下寄りの中央に目印を出す。
        const onScreen = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
        return { pad, sx: onScreen ? (projected.x + 1) / 2 * window.__VW() : window.__VW() / 2,
                 sy: onScreen ? (1 - projected.y) / 2 * window.__VH() : window.__VH() * .72 };
      }
      return null;
    }
    const guide = () => {
      ringMaterial.opacity = .55 + .3 * Math.sin(performance.now() / 260);
      const assist = assistTarget();
      if (assist) {
        mark.style.left = assist.sx + 'px'; mark.style.top = assist.sy + 'px'; mark.textContent = isTouch() ? '跳ぶ' : 'B'; mark.style.opacity = '1';
        hint.textContent = isTouch() ? 'ジャンプ台をタップで高台へ！' : 'ジャンプ台をクリック／Bキーで高台へ！'; hint.style.display = 'block';
      } else { mark.style.opacity = '0'; hint.style.display = 'none'; }
      requestAnimationFrame(guide);
    };
    requestAnimationFrame(guide);

    function tapAt(clientX, clientY, touch = false) {
      const assist = assistTarget(); if (!assist) return false;
      const radius = touch ? Math.min(128, Math.max(104, Math.min(window.__VW(), window.__VH()) * .26)) : 70;
      return Math.hypot(assist.sx - clientX, assist.sy - clientY) <= radius && launch(assist.pad);
    }
    const canvas = document.getElementById('c');
    canvas.addEventListener('mousedown', event => {
      if (event.button !== 0 || !tapAt(event.clientX, event.clientY)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !tapAt(event.clientX, event.clientY, true)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.code !== 'KeyB' || event.repeat || event.ctrlKey || event.metaKey || window.skyBite?.locked ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '')) return;
      const assist = assistTarget(); if (assist) launch(assist.pad);
    });
    window.skyJumpPads = { pads, arc, launch, assistTarget, tapAt };
  });
})();
