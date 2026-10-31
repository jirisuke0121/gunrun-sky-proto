// Unity Challenge pacing, adapted to the 120-second aerial-corridor course.
// Source settings and intentional adaptations are documented in CHALLENGE_DIFFICULTY.md.
(() => {
  const version = 'corridor-parkour-v8', storage = 'gunrun-challenge-difficulty-v1';
  // Shared across the three presets. A corpse also occupies a rendered body slot.
  // This is a conservative population budget, not a device-FPS guarantee.
  const maxAlive = 6, corpseMinimum = .65;
  const levels = [
    { id: 'easy', lives: 8, spacing: 1, health: 4, name: 'イージー', note: '基本のジャンプや段差移動を使い、余裕をもって逃げる', startSpeed: 4.3, maxSpeed: 5.4, counts: [3, 4, 5], initial: 3, interval: 2.2, flank: .05, ahead: .1, drop: 0, lull: 5, quiet: 0, lead: 6, warn: 2.5 },
    { id: 'normal', lives: 5, spacing: 4, health: 8, name: 'ノーマル', note: '段差・隙間・壁走りで繰り返し追跡を引き離す。銃で逃げる時間を作る', startSpeed: 6, maxSpeed: 6.8, counts: [4, 5, 6], initial: 4, interval: 1.6, flank: .3, ahead: .35, drop: .15, lull: 4, quiet: 18, lead: 5, warn: 2.5 },
    { id: 'hard', lives: 3, spacing: 7, health: 12, name: 'ハード', note: '技を連続させ、敵の配置から着地点と逃走路を選ぶ。銃は押し落としと足止めに使う', startSpeed: 6.8, maxSpeed: 8, counts: [5, 6, 6], initial: 5, interval: 1.1, flank: .5, ahead: .5, drop: .25, lull: 3, quiet: 12, lead: 4, warn: 2.2 },
    { id: 'legacy', name: '自由調整', note: '従来の設定・追跡者・ランキング', counts: [] },
  ];
  const intro = { id: 'intro', name: '入門モード', lives: 3, unlimited: true, spacing: 0,
    health: 2, note: 'ライフ無限で、移動・ジャンプ・パルクールを試す', startSpeed: 3.5, maxSpeed: 4.5,
    counts: [3, 4, 5], initial: 3, interval: 3, flank: 0, ahead: 0, drop: 0, lull: 6, quiet: 0, lead: 6, warn: 3 };
  const presets = [intro, ...levels.filter(p => p.id !== 'legacy')];
  for (const p of presets) p.ramp = 90;
  const byId = Object.fromEntries([intro, ...levels].map(p => [p.id, p]));
  for (const p of presets) p.values = {
    zombieSpeed: p.maxSpeed, zombieHealth: p.health, maxZombies: Math.min(maxAlive, p.counts.at(-1)), flankShare: p.flank, aheadShare: p.ahead,
    dropperShare: p.drop, dropShare: p.drop, killLull: p.lull, paceGap: p.quiet,
    stalkerOn: false, stalker2: false, stalkerAt: 120, stalkerSpeed: 0, loseSight: 0,
  };
  let selected = 'normal';
  try {
    const saved = localStorage.getItem(storage);
    if (levels.some(p => p.id === saved)) selected = saved;
    else if (['expert', 'master', 'ultra'].includes(saved)) selected = 'hard';
  } catch {}
  let lastPreset = selected === 'legacy' ? 'normal' : selected;
  let active = selected, game, lastObservation = -1, launchingIntro = false, introTip = -1;
  const params = new URLSearchParams(location.search);
  const oldTownSwingPreview = params.get('oldtown_swing') === '1';
  const debug = params.get('challengeDebug') === '1' || oldTownSwingPreview;
  const level = id => byId[id] || levels[1];
  const profile = () => window.skyPracticeMode || game?.z.mission || active === 'legacy' ? null : level(active);
  const speedScale = () => (game?.U.sprintSpeed || 6) / 6;
  const range = p => ({ start: (p.startSpeed ?? p.maxSpeed - 2) * speedScale(), end: p.maxSpeed * speedScale() });
  const ladderExits = new WeakMap();
  function usableLadder(edge) {
    if (!edge.ladder) return false;
    if (!ladderExits.has(edge.ladder)) ladderExits.set(edge.ladder, game.canExitLadder(edge.ladder));
    return ladderExits.get(edge.ladder);
  }
  const currentSpeed = p => { const r = range(p); return r.start + (r.end - r.start) * Math.min(1, Math.max(0, game?.z.t || 0) / (p.ramp || 80)); };
  const key = base => (active === 'legacy' ? base : `${base}-${version}-${active}`) + (oldTownSwingPreview ? '-oldtown-swing-preview' : debug ? '-debug' : '');
  function limit(time, fallback) {
    const p = profile();
    return p ? Math.min(maxAlive, p.counts[Math.min(p.counts.length - 1, Math.floor(Math.max(0, time) / (p.counts.length === 3 ? 40 : 20)))]) : fallback;
  }
  function value(name, fallback) {
    const p = profile();
    if (!p) return fallback;
    if (name === "zombieSpeed") return range(p).end;
    return name in p.values ? p.values[name] : fallback;
  }
  function room(fallback) {
    if (!profile() || !game) return fallback;
    const alive = game.Jt.filter(e => !e.dead).length;
    const protectedCorpses = game.Jt.filter(e => e.dead && !e.remove && e.deadT < corpseMinimum).length;
    return Math.max(0, Math.min(limit(game.z.t, maxAlive) - alive, maxAlive - alive - protectedCorpses));
  }
  function reserve() {
    if (!profile() || !game) return true;
    if (room(0) <= 0) return false;
    // Preserve the initial death feedback. Reclaim the oldest eligible corpse
    // only when a live spawn needs its slot; never cull a living enemy.
    const corpses = game.Jt.filter(e => e.dead && (e.remove || e.deadT >= corpseMinimum)).sort((a,b) => b.deadT - a.deadT);
    while (game.Jt.length >= maxAlive && corpses.length) {
      const e = corpses.shift(), index = game.Jt.indexOf(e);
      game.ue.remove(e.m.root); if (e.pool) game.ue.remove(e.pool);
      e.remove = true; if (index >= 0) game.Jt.splice(index, 1);
    }
    return game.Jt.length < maxAlive;
  }
  function events(fallback) {
    if (active === 'legacy') return fallback;
    if (active === 'normal') return [{ t: 60, do: 'surge', n: 1 }, { t: 90, do: 'squeeze', front: 1, back: 1 }];
    if (active !== 'hard') return [];
    return [
      { t: 40, do: 'surge', n: 2 },
      { t: 65, do: 'squeeze', front: 1, back: 1 },
      { t: 85, do: 'surge', n: 2 },
      { t: 100, do: 'squeeze', front: 2, back: 2 },
    ];
  }
  const owned = ['zombieSpeed', 'zombieHealth', 'maxZombies', 'flankShare', 'aheadShare', 'dropperShare', 'dropShare', 'killLull', 'paceGap', 'stalkerOn', 'stalker2', 'stalkerAt', 'stalkerSpeed'];
  function sync() {
    const p = level(active), preset = active !== 'legacy';
    const selector = document.getElementById('challengeDifficulty');
    selector.value = selected !== 'legacy' ? selected : lastPreset;
    selector.disabled = selected === 'legacy';
    const custom = document.getElementById('challengeCustom');
    custom.checked = selected === 'legacy';
    custom.disabled = game.modeRef() !== 'menu';
    document.getElementById('challengeDescription').textContent = preset
      ? `${p.note}。ライフ${p.unlimited ? '無限（ランキング対象外）' : p.lives}。群れの上限 ${p.counts.join(' → ')}体、体力 ${p.health}（HGで${p.health}発）、通常追跡 ${range(p).start.toFixed(1)} → ${range(p).end.toFixed(1)}m/s。死体を含め表示は最大${maxAlive}体。引き離しても追跡は続きます。`
      : 'メニューのゾンビ調整値を使います。6体の表示制限は対象外で、数を増やすほど負荷も増えます。これまでの記録はこちら。';
    document.getElementById('challengeSettingsNote').textContent = preset
      ? `${p.name}：ゾンビ数・体力・速さ・増援は難易度に従います。個別に変える場合はホームの詳細設定で「自由調整」を有効にします。`
      : '自由調整：ゾンビ数・体力・速さ・追跡者を個別に調整できます。';
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
            if (output) output.textContent = name === 'maxZombies' ? `${p.values[name]} 体（終盤）` : name === 'zombieSpeed' ? `${range(p).end.toFixed(1)} m/s（終盤）` : name === 'zombieHealth' ? `${p.health}（HGで${p.health}発）` : String(p.values[name]);
          }
        }
      }
    }
    const badge = document.getElementById('hDifficulty');
    badge.textContent = game?.z.mission ? '技の練習' : level(active).name;
    document.getElementById('bestLine').hidden = active === 'intro';
    document.body.classList.toggle('intro-run', active === 'intro');
  }
  function begin() {
    active = launchingIntro || active === 'intro' && game.modeRef() !== 'menu' ? 'intro' : selected;
    launchingIntro = false;
    lastObservation = introTip = -1;
    game.z.challenge = { id: active, version };
    game.refreshChallengeBest();
    sync();
    document.dispatchEvent(new CustomEvent('sky-difficulty-change'));
  }
  function select(id) {
    if (!levels.some(p => p.id === id) || game.modeRef() !== 'menu') return;
    selected = active = id;
    if (id !== 'legacy') lastPreset = id;
    try { localStorage.setItem(storage, selected); } catch {}
    game.refreshChallengeBest(); game.nl(); sync();
    document.dispatchEvent(new CustomEvent('sky-difficulty-change'));
  }
  window.skyChallenge = {
    version, debug, maxAlive, maxRendered: maxAlive, corpseMinimum, levels, key, profile, limit, value, room, reserve, events, begin,
    get id() { return active; }, get selected() { return selected; },
    get name() { return level(active).name; },
    get isIntro() { return active === 'intro' && !game?.z.mission; },
    get isIntroRun() { return !game?.z.mission && game?.z.challenge?.id === 'intro'; },
    maxLives(fallback = 3) { return profile()?.lives ?? fallback; },
    damageLife() {
      if (!profile()?.unlimited) game.c.life = Math.max(0, game.c.life - 1);
      return game.c.life;
    },
    lifeLabel(life) { return profile()?.unlimited ? '∞' : String(life); },
    lifeDisplay(life, fallback = 3) {
      if (profile()?.unlimited) return '∞';
      const maximum = profile()?.lives ?? fallback;
      return '●'.repeat(Math.max(0, Math.min(maximum, life))) + '○'.repeat(Math.max(0, maximum - life));
    },
    spawnAllowed(point) {
      const spacing = profile()?.spacing || 0;
      const far = p => Math.hypot(p.x - point.x, p.z - point.z, (p.y - point.y) * 1.5) >= spacing;
      return !game || !spacing || game.Jt.every(e => e.dead || e.remove ||
        (far(e.pos) && (!(e.fall || e.rise || e.act?.emerge) || !e.spawnAnchor || far(e.spawnAnchor))));
    },
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
      if (edge.kind === 3) return edge.len / (window.skyZombieCrawlSpeed?.(speed) ?? speed * .35);
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
    initial(fallback) { return profile() ? Math.min(profile().initial, limit(0, fallback)) : fallback; },
    cap(fallback) { return profile() ? limit(game.z.t, fallback) : fallback; },
    extra(fallback) { return profile() ? 0 : fallback; },
    count(alive, ordinary) { return profile() ? alive : ordinary; },
    observe() {
      if (active === 'intro' && game.modeRef() === 'play') {
        const tips = ['移動してみよう。ライフは無限。落ちても近くから再開できます。',
          '段差を跳び、壁やはしごを使って上の通路へ移動してみよう。',
          '銃は押し返す道具にもなります。縁にいるゾンビを落としてみよう。',
          '高低差や隙間で距離を作ろう。引き離してもゾンビの追跡は続きます。'];
        const tip = Math.min(3, Math.floor(game.z.t / 30));
        if (tip !== introTip) { introTip = tip; game.rn(tips[tip]); }
      }
      if (game.z.t < lastObservation) lastObservation = -1;
      if (!debug || game.z.t < lastObservation + .5) return;
      lastObservation = game.z.t;
      const alive = game.Jt.filter(e => !e.dead);
      document.getElementById('hDifficulty').dataset.challenge = JSON.stringify({
        id: game.z.mission ? "mission" : active, t: +game.z.t.toFixed(2), cap: limit(game.z.t, game.U.maxZombies),
        alive: alive.length, rendered: game.Jt.length, corpses: game.Jt.filter(e => e.dead).length, stalkers: alive.filter(e => e.stalker).length,
        health: value('zombieHealth', game.U.zombieHealth), lives: game.c.life, maximumLives: profile()?.unlimited ? 'infinite' : profile()?.lives ?? 3,
        speed: +(profile() ? currentSpeed(profile()) : game.U.zombieSpeed).toFixed(3),
        moving: alive.filter(e => !e.act && !e.fall && !e.rise && e.onGround && e.stun <= 0 && e.atkT <= 0)
          .map(e => +Math.hypot(e.vel.x, e.vel.z).toFixed(3)),
      });
    },
    attach(internals) {
      game = internals;
      const start = document.getElementById('bStart'), introButton = document.getElementById('bIntro');
      const readiness = window.installSkyStartReadiness(game);
      introButton.addEventListener('click', () => {
        if (game.modeRef() !== 'menu' || !readiness.sync()) return;
        launchingIntro = true;
        try { start.click(); } finally { launchingIntro = false; }
      });
      const introEntry = document.getElementById('introEntry');
      introEntry.parentElement.prepend(introEntry);
      const selector = document.getElementById('challengeDifficulty');
      for (const p of levels) if (p.id !== 'legacy') selector.add(new Option(p.name, p.id));
      selector.addEventListener('change', () => select(selector.value));
      document.getElementById('challengeCustom').addEventListener('change', event => {
        select(event.target.checked ? 'legacy' : lastPreset);
        sync();
      });
      new MutationObserver(sync).observe(document.getElementById('hud'), { attributes: true, attributeFilter: ['class'] });
      for (const id of ['ovPause', 'ovStart']) new MutationObserver(() => {
        if (!document.getElementById('ovStart').hidden && active === 'intro') {
          active = selected; game.refreshChallengeBest(); document.dispatchEvent(new CustomEvent('sky-difficulty-change'));
        }
        game.nl(); sync();
      })
        .observe(document.getElementById(id), { attributes: true, attributeFilter: ['hidden'] });
      document.getElementById('setGrid').addEventListener('input', sync);
      document.getElementById('bReset').addEventListener('click', sync);
      game.refreshChallengeBest(); sync();
    },
  };
})();
