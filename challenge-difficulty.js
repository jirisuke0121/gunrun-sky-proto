// Unity Challenge pacing, adapted to the 120-second aerial-corridor course.
// Source settings and intentional adaptations are documented in CHALLENGE_DIFFICULTY.md.
(() => {
  const version = 'corridor-v2', storage = 'gunrun-challenge-difficulty-v1';
  const levels = [
    { id: 'easy', name: 'Easy', note: '走って距離を取り、技を練習', startSpeed: 4.3, maxSpeed: 5.4, counts: [3, 5, 7], initial: 3, interval: 2.2, flank: .05, ahead: .1, drop: 0, lull: 5, quiet: 0, lead: 6, warn: 2.5 },
    { id: 'normal', name: 'Normal', note: '後半は走るだけでは少しずつ追いつかれる', startSpeed: 5.2, maxSpeed: 6.4, counts: [5, 8, 12], initial: 4, interval: 1.7, flank: .2, ahead: .25, drop: .1, lull: 4, quiet: 22, lead: 5, warn: 2.5 },
    { id: 'hard', name: 'Hard', note: '技で引き離し、次の逃げ道へつなぐ', startSpeed: 5.6, maxSpeed: 6.8, counts: [6, 10, 16], initial: 5, interval: 1.4, flank: .3, ahead: .3, drop: .15, lull: 3.5, quiet: 20, lead: 4.5, warn: 2.3 },
    { id: 'expert', name: 'Expert', note: '速い追跡と予告付きの包囲', startSpeed: 5.9, maxSpeed: 7.1, counts: [7, 12, 20], initial: 5, interval: 1.2, flank: .35, ahead: .35, drop: .2, lull: 3, quiet: 18, lead: 4, warn: 2.2 },
    { id: 'master', name: 'Master', note: '逃げ技とクールダウンの管理が必要', startSpeed: 6.1, maxSpeed: 7.35, counts: [8, 12, 16, 20, 22, 24], initial: 6, interval: 1, flank: .4, ahead: .4, drop: .25, lull: 2.5, quiet: 16, lead: 3.5, warn: 2 },
    { id: 'ultra', name: 'Ultra', note: '最大28体・技を続けて圧力を切る', startSpeed: 6.3, maxSpeed: 7.6, counts: [9, 14, 18, 22, 26, 28], initial: 7, interval: .85, flank: .45, ahead: .4, drop: .3, lull: 2, quiet: 14, lead: 3, warn: 1.8 },
    { id: 'legacy', name: '自由調整', note: '従来の設定・追跡者・ランキング', counts: [] },
  ];
  for (const p of levels) if (p.id !== 'legacy') p.ramp = 90;
  const byId = Object.fromEntries(levels.map(p => [p.id, p]));
  for (const p of levels) if (p.id !== 'legacy') p.values = {
    zombieSpeed: p.maxSpeed, maxZombies: p.counts.at(-1), flankShare: p.flank, aheadShare: p.ahead,
    dropperShare: p.drop, dropShare: p.drop, killLull: p.lull, paceGap: p.quiet,
    stalkerOn: false, stalker2: false, stalkerAt: 120, stalkerSpeed: 0,
  };
  let selected = 'normal';
  try { const saved = localStorage.getItem(storage); if (levels.some(p => p.id === saved)) selected = saved; } catch {}
  let active = selected, game, lastObservation = -1;
  const debug = new URLSearchParams(location.search).has('challengeDebug');
  const level = id => byId[id] || levels[1];
  const profile = () => game?.z.mission || active === 'legacy' ? null : level(active);
  const speedScale = () => (game?.U.sprintSpeed || 6) / 6;
  const range = p => ({ start: (p.startSpeed ?? p.maxSpeed - 2) * speedScale(), end: p.maxSpeed * speedScale() });
  const ladderExits = new WeakMap();
  function usableLadder(edge) {
    if (!edge.ladder) return false;
    if (!ladderExits.has(edge.ladder)) ladderExits.set(edge.ladder, game.canExitLadder(edge.ladder));
    return ladderExits.get(edge.ladder);
  }
  const currentSpeed = p => { const r = range(p); return r.start + (r.end - r.start) * Math.min(1, Math.max(0, game?.z.t || 0) / (p.ramp || 80)); };
  const key = base => (active === 'legacy' ? base : `${base}-${version}-${active}`) + (debug ? '-debug' : '');
  function limit(time, fallback) {
    const p = profile();
    return p ? p.counts[Math.min(p.counts.length - 1, Math.floor(Math.max(0, time) / (p.counts.length === 3 ? 40 : 20)))] : fallback;
  }
  function value(name, fallback) {
    const p = profile();
    if (!p) return fallback;
    if (name === "zombieSpeed") return range(p).end;
    return name in p.values ? p.values[name] : fallback;
  }
  function events(fallback) {
    const index = levels.findIndex(p => p.id === active);
    if (index === 6) return fallback;
    if (index < 2) return [];
    if (index === 2) return [{ t: 60, do: 'surge', n: 2 }];
    return [
      { t: 40, do: 'surge', n: index },
      { t: 65, do: 'squeeze', front: Math.min(index - 1, 3), back: Math.min(index - 1, 3) },
      { t: 85, do: 'surge', n: index + 1 },
      { t: 100, do: 'squeeze', front: Math.min(index, 3), back: Math.min(index, 3) },
    ];
  }
  const owned = ['zombieSpeed', 'maxZombies', 'flankShare', 'aheadShare', 'dropperShare', 'dropShare', 'killLull', 'paceGap', 'stalkerOn', 'stalker2', 'stalkerAt', 'stalkerSpeed'];
  function sync() {
    const p = level(selected), preset = selected !== 'legacy';
    document.getElementById('challengeDifficulty').value = selected;
    document.getElementById('challengeDescription').textContent = preset
      ? `${p.note}。群れの上限 ${p.counts.join(' → ')}体、通常追跡 ${range(p).start.toFixed(1)} → ${range(p).end.toFixed(1)}m/s。終盤ほど強くなる2分間。`
      : 'メニューのゾンビ調整値を使います。これまでのベスト・ゴースト・ランキングはこちら。';
    document.getElementById('challengeSettingsNote').textContent = preset
      ? `${p.name}：ゾンビ数・速さ・増援は難易度に従います。個別に変える場合はホームで「自由調整」を選択。`
      : '自由調整：ゾンビ数・速さ・追跡者を個別に調整できます。';
    for (const name of owned) {
      const input = document.getElementById('s_' + name) || document.getElementById('t_' + name);
      if (input) {
        input.disabled = preset && !game?.z.mission;
        input.closest('.sl,.tg')?.classList.toggle('challenge-locked', input.disabled);
        if (input.disabled) {
          if (input.type === 'checkbox') input.checked = !!p.values[name];
          else {
            input.value = value(name, p.values[name]);
            const output = document.getElementById('o_' + name);
            if (output) output.textContent = name === 'maxZombies' ? `${p.values[name]} 体（終盤）` : name === 'zombieSpeed' ? `${range(p).end.toFixed(1)} m/s（終盤）` : String(p.values[name]);
          }
        }
      }
    }
    const badge = document.getElementById('hDifficulty');
    badge.textContent = game?.z.mission ? '技の練習' : level(active).name;
  }
  function begin() {
    active = selected;
    lastObservation = -1;
    game.z.challenge = { id: active, version };
    game.refreshChallengeBest();
    sync();
  }
  function select(id) {
    if (!levels.some(p => p.id === id) || game.modeRef() !== 'menu') return;
    selected = active = id;
    try { localStorage.setItem(storage, selected); } catch {}
    game.refreshChallengeBest(); game.nl(); sync();
    document.dispatchEvent(new CustomEvent('sky-difficulty-change'));
  }
  window.skyChallenge = {
    version, debug, levels, key, profile, limit, value, events, begin,
    get id() { return active; }, get selected() { return selected; },
    get name() { return level(active).name; },
    speed(multiplier, fallback) {
      const p = profile();
      return p ? Math.min(range(p).end, currentSpeed(p) * (1 + (multiplier - 1) * .4)) : fallback;
    },
    warning(fallback) { return profile()?.warn ?? fallback; },
    minimumLead(fallback) { return profile()?.lead ?? fallback; },
    escapeLead(start, enemies, { nav, enemyCost, playerCost, hooks, margin, Queue }) {
      const count = nav.nodes.length, arrival = new Float64Array(count).fill(Infinity);
      let queue = new Queue();
      const threats = [...enemies, ...game.Jt.filter(e => !e.dead && e.node >= 0).map(e => [e.node, 0])];
      for (const [node, time] of threats) if (time < arrival[node]) { arrival[node] = time; queue.push(time, node); }
      while (queue.size) {
        const [time, node] = queue.pop();
        if (time > arrival[node]) continue;
        if (time > 20) break;
        for (const id of nav.out[node]) {
          const edge = nav.E[id], next = time + enemyCost(edge);
          if (next < arrival[edge.to]) { arrival[edge.to] = next; queue.push(next, edge.to); }
        }
      }
      // Track whether this route has already used its hook. A second hook is
      // deliberately excluded from this short forecast, rather than ignoring CD.
      const reached = new Float64Array(count * 2).fill(Infinity);
      queue = new Queue(); reached[start] = 0; queue.push(0, start);
      let lead = -1;
      const visit = (node, time, used) => {
        const state = node + (used ? count : 0);
        if (time < reached[state] && time < arrival[node] - margin) {
          reached[state] = time; queue.push(time, state);
        }
      };
      while (queue.size) {
        const [time, state] = queue.pop(), used = state >= count, node = state % count;
        if (time > reached[state]) continue;
        lead = Math.max(lead, Math.min(arrival[node], 30) - time);
        if (time > 8) continue;
        for (const id of nav.out[node]) {
          const edge = nav.E[id]; visit(edge.to, time + playerCost(edge), used);
        }
        if (!used && time >= game.c.hookCD) for (const hook of hooks[node] || []) visit(hook.to, time + hook.t + .8, true);
      }
      return lead;
    },
    pursuitCost(edge, fallback, ladderSpeed) {
      const p = profile();
      if (!p) return fallback;
      // Assume the fastest approach, including the short attack acceleration.
      // Slow beams and lost-sight wandering must not manufacture a safe route.
      const speed = range(p).end * 1.2, h = edge.climb || 0;
      if (edge.kind === 6) return window.skyLeapOK?.(edge) ? .28 : Infinity;
      if (edge.kind === 7) return .3 + Math.sqrt(2 * Math.max(0, edge.fall || 0) / game.U.gravity);
      if (edge.kind === 5) return h / ladderSpeed + .8;
      if (edge.kind === 1) return (.45 + .38 * h) * (h > 1.4 ? 1.8 : 1) + Math.max(0, edge.len - 1.6) / speed;
      if (edge.kind === 3) return edge.len / (speed * .35);
      return edge.len / speed;
    },
    travelCost(edge, fallback) {
      if (!profile()) return fallback;
      const u = game.U, speed = u.sprintSpeed, length = edge.len;
      if (edge.kind === 5) return usableLadder(edge) ? (edge.climb || 4) / u.ladderSpeed + .8 : Infinity;
      if (edge.kind === 1) return edge.climb > u.mantleReach ? Infinity : .3 + .11 * edge.climb + length / speed;
      if (edge.kind === 3) return length / 2.6;
      if (edge.kind === 6) return length > 2 * u.jumpVel / u.gravity * speed ? Infinity : Math.max(length / speed, 2 * u.jumpVel / u.gravity) + .15;
      if (edge.kind === 7) return Math.max(length / speed, Math.sqrt(2 * Math.max(0, edge.fall || 0) / u.gravity)) + .2;
      return length / speed;
    },
    interval(fallback) { return profile()?.interval ?? fallback; },
    initial(fallback) { return profile()?.initial ?? fallback; },
    cap(fallback) { return profile() ? limit(game.z.t, fallback) : fallback; },
    extra(fallback) { return profile() ? 0 : fallback; },
    count(alive, ordinary) { return profile() ? alive : ordinary; },
    observe() {
      if (game.z.t < lastObservation) lastObservation = -1;
      if (!debug || game.z.t < lastObservation + .5) return;
      lastObservation = game.z.t;
      const alive = game.Jt.filter(e => !e.dead);
      document.getElementById('hDifficulty').dataset.challenge = JSON.stringify({
        id: game.z.mission ? "mission" : active, t: +game.z.t.toFixed(2), cap: limit(game.z.t, game.U.maxZombies),
        alive: alive.length, stalkers: alive.filter(e => e.stalker).length,
        speed: +(profile() ? currentSpeed(profile()) : game.U.zombieSpeed).toFixed(3),
        moving: alive.filter(e => !e.act && !e.fall && !e.rise && e.onGround && e.stun <= 0 && e.atkT <= 0)
          .map(e => +Math.hypot(e.vel.x, e.vel.z).toFixed(3)),
      });
    },
    attach(internals) {
      game = internals;
      const selector = document.getElementById('challengeDifficulty');
      for (const p of levels) selector.add(new Option(p.name, p.id));
      selector.addEventListener('change', () => select(selector.value));
      new MutationObserver(sync).observe(document.getElementById('hud'), { attributes: true, attributeFilter: ['class'] });
      for (const id of ['ovPause', 'ovStart']) new MutationObserver(() => { game.nl(); sync(); })
        .observe(document.getElementById(id), { attributes: true, attributeFilter: ['hidden'] });
      document.getElementById('setGrid').addEventListener('input', sync);
      document.getElementById('bReset').addEventListener('click', sync);
      game.refreshChallengeBest(); sync();
    },
  };
})();
