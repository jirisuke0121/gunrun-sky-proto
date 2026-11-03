// 救済スキル（画面下のスキル欄「救済 ×2」）。ボタンを押すと、ゾンビのいない方向の高台へ自動でフックして登る。1ランに2回まで。
// 狙う足場: 水平14m以内・+2〜+12mの立てる足場のうち、ゾンビから4.5m以上離れていて、そこへ向かう線がどのゾンビからも3m以上離れていて、引く動きが壁や天井で止まらないもの。ゾンビから離れる向きを優先する。
// 動きは本編のフック（引く→乗り上げる→離す）をそのまま使う。足場の手前に一時的なフックポイントを置いて引かせる。
(() => {
  const CFG = Object.freeze({ charges: 2, maxXZ: 14, minRise: 2, maxRise: 12, minZombieGap: 4.5, pathGap: 3, lockSeconds: 1, lift: .8 });
  addEventListener('load', () => {
    const game = window.__skyInternals, G = window.__game, dock = document.getElementById('skillDock');
    if (!game || !G || !G.NAV || !dock || window.skyPracticeMode) return;
    const c = game.c, stats = G.stats, nodes = G.NAV.nodes;
    let charges = CFG.charges, wasPlay = false, lastT = 0, lockUntil = 0, noteUntil = 0;

    // 足場の中ほど（縁から落ちにくい点）だけを狙う: 同じ高さの隣が6つ以上ある足場。
    const interior = new Uint8Array(nodes.length), cell = new Map(), key = (i, j) => i + ',' + j;
    nodes.forEach((n, id) => { const k = key(n.i, n.j); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(id); });
    nodes.forEach((n, id) => {
      let count = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        if ((cell.get(key(n.i + di, n.j + dj)) || []).some(o => Math.abs(nodes[o].y - n.y) < .15)) count++;
      }
      interior[id] = count >= 6 ? 1 : 0;
    });

    // スキル欄のボタン。
    const ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4v18"/><path d="M7 18a9 9 0 0 0 18 0"/><path d="M4 15l3 3 3-3M22 15l3 3 3-3"/></svg>';
    const button = document.createElement('button'); button.type = 'button'; button.id = 'tRescue'; button.className = 'player-skill';
    button.innerHTML = `${ICON}<span class="skill-value">${charges}</span><span class="skill-name">救済 <kbd>V</kbd></span>`;
    dock.append(button);
    const note = document.createElement('div');
    Object.assign(note.style, { position: 'fixed', left: '50%', bottom: '150px', transform: 'translateX(-50%)', zIndex: '26', pointerEvents: 'none', padding: '4px 10px', borderRadius: '8px',
      background: 'rgba(10,30,28,.75)', color: '#c9fff1', font: 'bold 12px sans-serif', whiteSpace: 'nowrap', display: 'none' });
    document.body.appendChild(note);
    const say = text => { note.textContent = text; note.style.display = 'block'; noteUntil = performance.now() + 1600; };

    const livingZombies = () => game.Jt.filter(z => !z.dead && !z.remove && !z.rise);
    const playing = () => game.modeRef() === 'play' && !game.z.over;
    const busy = () => ['hook', 'zip', 'swing'].includes(c.state);
    const available = () => playing() && charges > 0 && !busy() && !window.skyBite?.locked && performance.now() >= lockUntil;

    const segDist = (x, z, x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2)); return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)); };
    // 引き終わりの勢い（約3m）で行き過ぎないよう、足場の手前（同じ足場の上）にフックポイントを置く。
    function makeAnchor(t) {
      const dx = t.x - c.pos.x, dz = t.z - c.pos.z, len = Math.hypot(dx, dz) || 1; let back = 0;
      for (const k of [2.5, 2, 1.5, 1, .5]) {
        const bx = t.x - dx / len * k, bz = t.z - dz / len * k;
        if (nodes.some(n => Math.abs(n.y - t.y) < .15 && Math.hypot(n.x - bx, n.z - bz) < .6)) { back = k; break; }
      }
      return [t.x - dx / len * back, t.y + CFG.lift, t.z - dz / len * back];
    }
    // 本編の引く動き（壁に当たったら壁沿いに上へ、天井に当たったら外れる）を、体の当たり判定で先に試す。
    function dryPull(anchor) {
      const R = c.r || .3, free = (x, y, z) => game.oe(x, y + .015, z, R, 1.75); let x = c.pos.x, y = c.pos.y, z = c.pos.z;
      const tx = anchor[0], ty = anchor[1] + .6, tz = anchor[2];
      for (let t = 0; t < 3; t += 1 / 30) {
        const ex = tx - x, ey = ty - y, ez = tz - z, r = Math.hypot(ex, ey, ez) || 1; if (r < 1.6) return true;
        const step = Math.min(18, 8 + t * 30) / 30, mx = ex / r * step, my = ey / r * step, mz = ez / r * step; let hit = false, ceil = false;
        if (free(x + mx, y, z)) x += mx; else hit = true;
        if (free(x, y, z + mz)) z += mz; else hit = true;
        if (free(x, y + my, z)) y += my; else if (my > 0) ceil = true;
        if (hit && ey > .3 && !ceil) { if (free(x, y + step * 1.2, z)) y += step * 1.2; else return false; } else if (hit || ceil) return false;
      }
      return false;
    }

    // ゾンビのいない方向の高台を選ぶ（引く動きが壁や天井で止まらないことを先に確かめる）。
    function chooseTarget() {
      const zs = livingZombies(), px = c.pos.x, pz = c.pos.z;
      let ax = 0, az = 0;
      for (const z of zs) { const dx = px - z.pos.x, dz = pz - z.pos.z, d = Math.max(1, Math.hypot(dx, dz)); ax += dx / d / d; az += dz / d / d; }
      const al = Math.hypot(ax, az); if (al > 1e-6) { ax /= al; az /= al; }
      const scored = [];
      for (let id = 0; id < nodes.length; id++) {
        const n = nodes[id], rise = n.y - c.pos.y; if (!interior[id] || rise < CFG.minRise || rise > CFG.maxRise) continue;
        const dx = n.x - px, dz = n.z - pz, xz = Math.hypot(dx, dz); if (xz > CFG.maxXZ || xz < 2) continue;
        let gap = 99; for (const z of zs) gap = Math.min(gap, Math.hypot(n.x - z.pos.x, n.z - z.pos.z));
        if (gap < CFG.minZombieGap) continue;
        // 飛んでいく線がゾンビの近くを通る足場は選ばない。
        if (zs.some(z => segDist(z.pos.x, z.pos.z, px, pz, n.x, n.z) < CFG.pathGap)) continue;
        const away = al > 1e-6 ? (dx * ax + dz * az) / xz : 0;
        scored.push({ id, n, xz, gap, score: 2 * away + Math.min(gap, 15) / 10 - xz / 20 + rise * .05 });
      }
      scored.sort((a, b) => b.score - a.score);
      for (const s of scored.slice(0, 24)) {
        const target = { id: s.id, x: s.n.x, y: s.n.y, z: s.n.z, gap: s.gap, xz: s.xz }, anchor = makeAnchor(target);
        if (dryPull(anchor)) return { ...target, anchor };
      }
      return null;
    }

    function activate() {
      if (!available()) return false;
      const target = chooseTarget();
      if (!target) { say('近くに登れる高台がありません'); return false; }
      if (['ledge', 'ladder', 'slide'].includes(c.state)) { c.state = 'normal'; c.ledge = null; c.ladder = null; }
      const dx = target.x - c.pos.x, dz = target.z - c.pos.z;
      c.yaw = Math.atan2(-dx, -dz);
      c.state = 'hook'; c.hook = target.anchor; c.hookT = 0; c.wallKey = null;
      c.h = 1.75; c.onGround = false; c.jumpBuf = 0; c.hookPressed = false; c.crouchPressed = false;
      charges--; lockUntil = performance.now() + CFG.lockSeconds * 1000; stats.rescues = (stats.rescues || 0) + 1; last = target; render();
      return true;
    }
    let last = null;

    function render() {
      button.querySelector('.skill-value').textContent = charges;
      button.classList.toggle('empty', charges <= 0);
      button.disabled = false; button.setAttribute('aria-disabled', String(!available()));
    }
    function step() {
      if (game.modeRef() !== 'play') wasPlay = false;
      else if (!wasPlay || game.z.t < lastT - .5) { wasPlay = true; charges = CFG.charges; lockUntil = 0; render(); }
      lastT = game.z.t;
      if (note.style.display === 'block' && performance.now() > noteUntil) note.style.display = 'none';
    }
    const loop = () => { step(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);

    document.addEventListener('keydown', e => {
      if (e.code !== 'KeyV' || e.repeat || e.ctrlKey || e.metaKey || !playing() || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      e.preventDefault(); activate();
    });
    import('./player-skills.js?v=20261102-skill-keys-v1').then(({ bindSkillPress }) => bindSkillPress(button, available, activate));
    window.skyRescue = { CFG, step, activate, chooseTarget, dryPull, makeAnchor, available, interior, get charges() { return charges; }, get last() { return last; }, reset() { charges = CFG.charges; lockUntil = 0; render(); } };
  });
})();
