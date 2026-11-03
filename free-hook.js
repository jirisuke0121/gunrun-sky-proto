// 自由フック（救済）。追い込まれたとき、見えている高い足場へフックして上に乗る。1ランに2回まで。
// 目印が出るのは次の条件を全部満たすとき: 残り回数がある／近く(8m)にゾンビが2体以上、または2.5m以内に1体／
// 水平14m以内・+2〜+12mの立てる足場が画面に見えていて、壁にさえぎられていない。
// 動きは本編のフック（引く→乗り上げる→離す）をそのまま使い、足場の上に一時的なフックポイントを置くだけ。
(() => {
  const CFG = Object.freeze({ charges: 2, maxXZ: 14, minRise: 2, maxRise: 12, crowdRadius: 8, crowdCount: 2, closeRadius: 2.5, tapRadius: 70 });
  addEventListener('load', () => {
    const game = window.__skyInternals, G = window.__game;
    if (!game || !G || !G.NAV || window.skyPracticeMode) return;
    const { Vector3 } = game.Geom, c = game.c, stats = G.stats, nodes = G.NAV.nodes;
    const isTouch = () => document.documentElement.classList.contains('touch');
    const ANCHOR_LIFT = .8; // 足場の0.8m上にフックポイントを置く（本編の遮蔽判定が縁にさえぎられない高さ）
    let charges = CFG.charges, wasPlay = false, lastT = 0, pending = null, best = null;

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

    const mark = document.createElement('div'); mark.id = 'freeHookMark';
    Object.assign(mark.style, { position: 'absolute', width: '54px', height: '54px', margin: '-27px', boxSizing: 'border-box', border: '3px solid #d9fff5',
      borderRadius: '50%', background: 'rgba(30,150,130,.94)', boxShadow: '0 0 14px #1e9682cc', color: '#eafffa', font: 'bold 11px sans-serif', lineHeight: '1.15',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: '0', pointerEvents: 'none', transition: 'opacity .12s', zIndex: '21' });
    (document.getElementById('hookMark')?.parentElement || document.body).appendChild(mark);
    const hint = document.createElement('div');
    Object.assign(hint.style, { position: 'fixed', left: '50%', top: '146px', transform: 'translateX(-50%)', zIndex: '21', pointerEvents: 'none', padding: '4px 10px',
      borderRadius: '8px', background: 'rgba(10,30,28,.65)', color: '#c9fff1', font: 'bold 12px sans-serif', textAlign: 'center', whiteSpace: 'nowrap', display: 'none' });
    document.body.appendChild(hint);
    const projected = new Vector3(), forward = new Vector3();

    const livingZombies = () => game.Jt.filter(z => !z.dead && !z.remove && !z.rise);
    function pressed() {
      let crowd = 0, close = false;
      for (const z of livingZombies()) {
        const d = Math.hypot(z.pos.x - c.pos.x, z.pos.z - c.pos.z), dy = Math.abs(z.pos.y - c.pos.y);
        if (dy > 3) continue;
        if (d <= CFG.crowdRadius) crowd++;
        if (d <= CFG.closeRadius) close = true;
      }
      return crowd >= CFG.crowdCount || close;
    }
    const ready = () => charges > 0 && !pending && game.modeRef() === 'play' && !game.z.over && c.state === 'normal';

    function candidates() {
      const out = [];
      for (let id = 0; id < nodes.length; id++) {
        const n = nodes[id], rise = n.y - c.pos.y, xz = Math.hypot(n.x - c.pos.x, n.z - c.pos.z);
        if (interior[id] && rise >= CFG.minRise && rise <= CFG.maxRise && xz <= CFG.maxXZ && xz >= 2) out.push({ id, x: n.x, y: n.y, z: n.z });
      }
      return out;
    }
    // いちばん画面の中心に近い、見えている足場を選ぶ。
    function bestTarget() {
      game.Se.updateMatrixWorld(); game.Se.getWorldDirection(forward);
      const ex = c.pos.x, ey = c.pos.y + (c.eye || 1.6), ez = c.pos.z, found = [];
      for (let id = 0; id < nodes.length; id++) {
        const n = nodes[id], rise = n.y - c.pos.y;
        if (!interior[id] || rise < CFG.minRise || rise > CFG.maxRise) continue;
        const dx = n.x - ex, dz = n.z - ez, xz = Math.hypot(dx, dz);
        if (xz > CFG.maxXZ || xz < 2) continue;
        const dy = n.y + .6 - ey, d = Math.hypot(dx, dy, dz), dot = (dx * forward.x + dy * forward.y + dz * forward.z) / d;
        if (dot < .55) continue; // 画面の中心から約57度以内
        found.push({ id, n, d, dot });
      }
      found.sort((a, b) => b.dot - a.dot);
      for (const f of found.slice(0, 12)) {
        const { n } = f;
        projected.set(n.x, n.y + .6, n.z).project(game.Se);
        if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > .92 || Math.abs(projected.y) > .92) continue;
        const dx = n.x - ex, dy = n.y + ANCHOR_LIFT - ey, dz = n.z - ez, d = Math.hypot(dx, dy, dz);
        if (game.raycast(ex, ey, ez, dx / d, dy / d, dz / d, d - .6)) continue; // 壁にさえぎられる
        return { id: f.id, x: n.x, y: n.y, z: n.z, d: f.d, sx: (projected.x + 1) / 2 * window.__VW(), sy: (1 - projected.y) / 2 * window.__VH() };
      }
      return null;
    }

    // 足場の上に一時的なフックポイントを置き、本編のフックの入力経路(hookTap)で撃つ。
    function fire(target) {
      if (!target || !ready()) return false;
      // 引き終わりの勢い（約3m）で行き過ぎないよう、足場の手前（同じ足場の上）にフックポイントを置く。
      const dx = target.x - c.pos.x, dz = target.z - c.pos.z, len = Math.hypot(dx, dz) || 1;
      let back = 0;
      for (const k of [2.5, 2, 1.5, 1, .5]) {
        const bx = target.x - dx / len * k, bz = target.z - dz / len * k;
        if (nodes.some(n => Math.abs(n.y - target.y) < .15 && Math.hypot(n.x - bx, n.z - bz) < .6)) { back = k; break; }
      }
      const anchor = [target.x - dx / len * back, target.y + ANCHOR_LIFT, target.z - dz / len * back];
      G.HOOKS.push(anchor); c.hookCD = 0;
      if (!G.hookTap(0, 0, anchor)) { G.HOOKS.splice(G.HOOKS.indexOf(anchor), 1); return false; }
      pending = { anchor, age: 0, started: false, target }; return true;
    }
    function step(dt = 1 / 60) {
      if (game.modeRef() !== 'play') wasPlay = false;
      else if (!wasPlay || game.z.t < lastT - .5) { wasPlay = true; charges = CFG.charges; pending = null; }
      lastT = game.z.t;
      if (pending) {
        pending.age += dt;
        if (!pending.started && c.state === 'hook' && c.hook === pending.anchor) { pending.started = true; charges--; stats.freeHooks = (stats.freeHooks || 0) + 1; }
        const over = pending.started ? c.state !== 'hook' : pending.age > .5;
        if (over) { const i = G.HOOKS.indexOf(pending.anchor); if (i >= 0) G.HOOKS.splice(i, 1); pending = null; }
      }
      best = ready() && pressed() ? bestTarget() : null;
    }
    const guide = () => {
      step(1 / 60);
      if (best) {
        mark.style.left = best.sx + 'px'; mark.style.top = best.sy + 'px'; mark.innerHTML = `<span>${isTouch() ? 'フック' : 'V'}</span><span>残り${charges}</span>`; mark.style.opacity = '1';
        hint.textContent = isTouch() ? '緑の印をタップで、あの足場へフック！' : '緑の印をクリック／Vキーで、あの足場へフック！'; hint.style.display = 'block';
      } else { mark.style.opacity = '0'; hint.style.display = 'none'; }
      requestAnimationFrame(guide);
    };
    requestAnimationFrame(guide);

    function tapAt(clientX, clientY, touch = false) {
      if (!best) return false;
      const radius = touch ? Math.min(128, Math.max(104, Math.min(window.__VW(), window.__VH()) * .26)) : CFG.tapRadius;
      return Math.hypot(best.sx - clientX, best.sy - clientY) <= radius && fire(best);
    }
    const canvas = document.getElementById('c');
    canvas.addEventListener('mousedown', e => { if (e.button !== 0 || !tapAt(e.clientX, e.clientY)) return; e.preventDefault(); e.stopImmediatePropagation(); }, true);
    canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || !tapAt(e.clientX, e.clientY, true)) return; e.preventDefault(); e.stopImmediatePropagation(); }, true);
    document.addEventListener('keydown', e => {
      if (e.code !== 'KeyV' || e.repeat || e.ctrlKey || e.metaKey || window.skyBite?.locked || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      if (best) fire(best);
    });
    window.skyFreeHook = { CFG, step, bestTarget, candidates, fire, ready, pressed, interior, get charges() { return charges; }, get best() { return best; }, get pending() { return pending; }, reset() { charges = CFG.charges; pending = null; } };
  });
})();
