// Unity Challenge pacing, adapted to the 120-second aerial-corridor course.
// Source settings and intentional adaptations are documented in CHALLENGE_DIFFICULTY.md.
(() => {
  const { version, settings: fixedSettings } = window.skyRankedRules;
  const storage = 'gunrun-challenge-difficulty-v1';
  // Standard ordinary-zombie budget. Hard has its own eight-body budget; corpses also occupy slots.
  // This is a conservative population budget, not a device-FPS guarantee.
  const maxAlive = 6, corpseMinimum = .65;
  const levels = [
    { id: 'easy', lives: 8, spacing: 1, health: 4, name: 'イージー', note: '基本のジャンプや段差移動を使い、余裕をもって逃げる', startSpeed: 4.3, maxSpeed: 5.4, counts: [3, 4, 5], initial: 3, interval: 2.2, flank: .05, ahead: .1, drop: 0, lull: 5, quiet: 0, lead: 6, warn: 2.5 },
    { id: 'normal', lives: 5, spacing: 4, health: 8, name: 'ノーマル', note: '段差・隙間・壁走りで繰り返し追跡を引き離す。銃で逃げる時間を作る', startSpeed: 6, maxSpeed: 6.8, counts: [4, 5, 6], initial: 4, interval: 1.6, flank: .3, ahead: .35, drop: .15, lull: 4, quiet: 18, lead: 5, warn: 2.5 },
    { id: 'hard', lives: 3, spacing: 4, health: 12, name: 'ハード', note: '技を連続させ、敵の配置から着地点と逃走路を選ぶ。銃は押し落としと足止めに使う', startSpeed: 6.8, maxSpeed: 8, counts: [8, 8, 8], initial: 8, interval: .25, flank: .5, ahead: .5, drop: .25, lull: 0, quiet: 12, lead: 4, warn: 2.2 },
    // Trial tier (2026-11-12): Hard's bodies, speed, health and routing, plus zombie kinds (zombie-types.js): a fast
    // fragile runner and a slow tough brute among the ordinary ones. It is not part of the shared ranking: the Worker
    // scores only easy/normal/hard, so these runs are stored but never ranked.
    { id: 'extreme', lives: 3, spacing: 4, health: 12, name: '超ベリーハード', note: 'ハードの追跡に、足の速い個体（体力半分）と倒れにくい個体（体力2倍・押しても動きにくい）が混ざる', startSpeed: 6.8, maxSpeed: 8, counts: [8, 8, 8], initial: 8, interval: .25, flank: .5, ahead: .5, drop: .25, lull: 0, quiet: 12, lead: 4, warn: 2.2, trial: true, types: true },
    { id: 'legacy', name: '自由調整', note: '従来の設定・追跡者・ランキング', counts: [] },
  ];
  const intro = { id: 'intro', name: '入門モード', lives: 3, unlimited: true, spacing: 0,
    health: 2, note: 'ライフ無限で、移動・ジャンプ・パルクールを試す', startSpeed: 3.5, maxSpeed: 4.5,
    counts: [3, 4, 5], initial: 3, interval: 3, flank: 0, ahead: 0, drop: 0, lull: 6, quiet: 0, lead: 6, warn: 3 };
  const presets = [intro, ...levels.filter(p => p.id !== 'legacy')];
  // Hard and the trial tier above it share the eight-body budget and the scripted events.
  const hardLike = p => p?.id === 'hard' || p?.id === 'extreme';
  for (const p of presets) p.ramp = 90;
  const byId = Object.fromEntries([intro, ...levels].map(p => [p.id, p]));
  for (const p of presets) p.values = {
    zombieSpeed: p.maxSpeed, zombieHealth: p.health, maxZombies: Math.min(hardLike(p) ? 8 : maxAlive, p.counts.at(-1)), flankShare: p.flank, aheadShare: p.ahead,
    dropperShare: p.drop, dropShare: p.drop, killLull: p.lull, paceGap: p.quiet,
    stalkerOn: false, stalker2: false, stalkerAt: 120, stalkerSpeed: 0, loseSight: 0,
  };
  let selected = 'normal';
  try {
    const saved = localStorage.getItem(storage);
    if (levels.some(p => p.id === saved) && (saved !== 'legacy' || window.skyDevMode)) selected = saved;
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
  // Reused buffers and a binary heap on typed arrays for escapeLead (no allocation per ask).
  let leadState = null;
  function leadBuffers(nav) {
    if (leadState?.nav === nav && leadState.base.length === nav.nodes.length && leadState.enemy.length === nav.E.length) return leadState;
    const n = nav.nodes.length, e = nav.E.length, room = e + 2 * n + 64;
    return leadState = { nav, base: new Float64Array(n), arrival: new Float64Array(n), reached: new Float64Array(n * 2),
      enemy: new Float64Array(e), player: new Float64Array(e), keys: new Float64Array(room), values: new Int32Array(room),
      size: 0, key: 0, value: 0, frame: null, baseKey: null, enemyCost: null, playerCost: null };
  }
  function heapPush(h, key, value) {
    if (h.size === h.keys.length) {
      const keys = new Float64Array(h.size * 2), values = new Int32Array(h.size * 2);
      keys.set(h.keys); values.set(h.values); h.keys = keys; h.values = values;
    }
    const keys = h.keys, values = h.values;
    let i = h.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent]; values[i] = values[parent]; i = parent;
    }
    keys[i] = key; values[i] = value;
  }
  // Removes the smallest entry into h.key / h.value.
  function heapPop(h) {
    const keys = h.keys, values = h.values;
    h.key = keys[0]; h.value = values[0];
    const size = --h.size;
    if (!size) return;
    const key = keys[size], value = values[size];
    let i = 0;
    for (;;) {
      let child = i * 2 + 1;
      if (child >= size) break;
      if (child + 1 < size && keys[child + 1] < keys[child]) child++;
      if (keys[child] >= key) break;
      keys[i] = keys[child]; values[i] = values[child]; i = child;
    }
    keys[i] = key; values[i] = value;
  }
  const ladderExits = new WeakMap();
  function usableLadder(edge) {
    if (!edge.ladder) return false;
    if (!ladderExits.has(edge.ladder)) ladderExits.set(edge.ladder, game.canExitLadder(edge.ladder));
    return ladderExits.get(edge.ladder);
  }
  const currentSpeed = p => { const r = range(p); return r.start + (r.end - r.start) * Math.min(1, Math.max(0, game?.z.t || 0) / (p.ramp || 80)); };
  // The server's board for a difficulty. The trial tier has no board of its own; its screens show the shared one.
  const rankingDifficulty = id => ['easy', 'normal', 'hard', 'extreme'].includes(id) ? 'all' : id;
  // Local best and ghost: the trial tier keeps its own, so it never overwrites the shared-board best.
  const localScope = id => id === 'extreme' ? 'extreme' : rankingDifficulty(id);
  const key = base => (active === 'legacy' ? base : `${base}-${version}-${localScope(active)}`) + (oldTownSwingPreview ? '-oldtown-swing-preview' : debug ? '-debug' : '');
  function limit(time, fallback) {
    const p = profile();
    return p ? Math.min(hardLike(p) ? 8 : maxAlive, p.counts[Math.min(p.counts.length - 1, Math.floor(Math.max(0, time) / (p.counts.length === 3 ? 40 : 20)))]) : fallback;
  }
  function value(name, fallback) {
    const p = profile();
    if (!p) return fallback;
    if (name === "zombieSpeed") return range(p).end;
    return name in p.values ? p.values[name] : fallback;
  }
  // Hard bosses are outside the ordinary-zombie budget: they must arrive even when the
  // ordinary crowd is full, and no living enemy is removed to make space for it.
  const ordinary = list => list.filter(e => !e.boss);
  function room(fallback) {
    if (!profile() || !game) return fallback;
    const budget = hardLike(profile()) ? 8 : maxAlive;
    const bodies = ordinary(game.Jt);
    const alive = bodies.filter(e => !e.dead).length;
    const protectedCorpses = bodies.filter(e => e.dead && !e.remove && e.deadT < corpseMinimum).length;
    return Math.max(0, Math.min(limit(game.z.t, maxAlive) - alive, budget - alive - protectedCorpses));
  }
  function reserve(options) {
    if (!profile() || !game) return true;
    if (options?.boss) return true;
    if (room(0) <= 0) return false;
    // Preserve the initial death feedback. Reclaim the oldest eligible corpse
    // only when a live spawn needs its slot; never cull a living enemy.
    const budget = hardLike(profile()) ? 8 : maxAlive;
    const corpses = ordinary(game.Jt).filter(e => e.dead && (e.remove || e.deadT >= corpseMinimum)).sort((a,b) => b.deadT - a.deadT);
    while (ordinary(game.Jt).length >= budget && corpses.length) {
      const e = corpses.shift(), index = game.Jt.indexOf(e);
      game.ue.remove(e.m.root); if (e.pool) game.ue.remove(e.pool);
      e.remove = true; if (index >= 0) game.Jt.splice(index, 1);
    }
    return ordinary(game.Jt).length < budget;
  }
  function events(fallback) {
    if (active === 'legacy') return fallback;
    if (active === 'normal') return [{ t: 60, do: 'surge', n: 1 }, { t: 90, do: 'squeeze', front: 1, back: 1 }];
    if (active !== 'hard' && active !== 'extreme') return [];
    return [
      { t: 30, do: 'squeeze', front: 1, back: 1 },
      { t: 40, do: 'surge', n: 2 },
      { t: 50, do: 'boss' },
      { t: 60, do: 'squeeze', front: 1, back: 1 },
      { t: 85, do: 'surge', n: 2 },
      { t: 90, do: 'squeeze', front: 2, back: 2 },
    ];
  }
  const owned = ['zombieSpeed', 'zombieHealth', 'maxZombies', 'flankShare', 'aheadShare', 'dropperShare', 'dropShare', 'killLull', 'paceGap', 'stalkerOn', 'stalker2', 'stalkerAt', 'stalkerSpeed'];
  const fixedKeys = Object.keys(fixedSettings);
  let customSettings, fixedApplied = false;
  const snapshotSettings = source => Object.fromEntries(fixedKeys.map(key => [key, source[key]]));
  function applySettings() {
    const fixed = active !== 'legacy' && !window.skyPracticeMode && !game.z.mission;
    if (fixed && !fixedApplied) customSettings = snapshotSettings(game.U);
    if (fixed) Object.assign(game.U, fixedSettings);
    else if (fixedApplied) Object.assign(game.U, customSettings);
    fixedApplied = fixed;
  }
  function sync() {
    applySettings();
    game.nl();
    const p = level(active), preset = !!profile();
    const selector = document.getElementById('challengeDifficulty');
    selector.value = selected !== 'legacy' ? selected : lastPreset;
    selector.disabled = selected === 'legacy';
    const scoreBonus = document.getElementById('challengeScoreBonus');
    scoreBonus.hidden = !preset || active === 'intro';
    scoreBonus.textContent = level(selected).trial ? '試作：スコアはハードと同じ ×1.2 ｜ ランキング対象外' : `スコアボーナス ×${(1 + .1 * levels.indexOf(level(selected))).toFixed(1)} ｜ 生存・撃破の両方に適用`;
    const custom = document.getElementById('challengeCustom');
    custom.checked = selected === 'legacy';
    custom.disabled = game.modeRef() !== 'menu';
    document.getElementById('challengeDescription').textContent = preset
      ? `${p.note}。ライフ${p.unlimited ? '無限（ランキング対象外）' : p.lives}。群れの上限 ${p.counts.join(' → ')}体、体力 ${p.health}（HGで${p.health}発）、通常追跡 ${range(p).start.toFixed(1)} → ${range(p).end.toFixed(1)}m/s。死体を含め通常ゾンビの表示は最大${hardLike(p) ? 8 : maxAlive}体。引き離しても追跡は続きます。${p.trial ? '試作のためランキング対象外（記録は保存されます）。' : ''}`
      : 'メニューのゾンビ調整値を使います。6体の表示制限は対象外で、数を増やすほど負荷も増えます。これまでの記録はこちら。';
    document.getElementById('challengeSettingsNote').textContent = preset
      ? `${p.name}：移動・戦闘の条件は固定です。得点倍率はイージー×1.0・ノーマル×1.1・ハード×1.2。全難易度のスコアを同じランキングで競います。カメラ・感度・音量・画質は変更できます。${window.skyDevMode ? '個別に調整する場合はホームの詳細設定で「自由調整」を有効にします。' : ''}`
      : '自由調整：ゾンビ数・体力・速さ・追跡者を個別に調整できます。';
    for (const name of [...owned, ...fixedKeys]) {
      const input = document.getElementById('s_' + name) || document.getElementById('t_' + name);
      if (input) {
        input.disabled = preset && !game?.z.mission;
        input.closest('.sl,.tg')?.classList.toggle('challenge-locked', input.disabled);
        if (input.disabled) {
          if (input.type === 'checkbox') input.checked = !!(fixedSettings[name] ?? p.values[name]);
          else {
            input.value = fixedSettings[name] ?? value(name, p.values[name]);
            const output = document.getElementById('o_' + name);
            if (output && !Object.hasOwn(fixedSettings, name)) output.textContent = name === 'maxZombies' ? `${p.values[name]} 体（終盤）` : name === 'zombieSpeed' ? `${range(p).end.toFixed(1)} m/s（終盤）` : name === 'zombieHealth' ? `${p.health}（HGで${p.health}発）` : String(p.values[name]);
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
    window.skyBossZombie?.begin();
    game.z.challenge = { id: active, version, rankingScope: rankingDifficulty(active) };
    applySettings();
    if (active !== 'legacy') game.z.challenge.fixedSettings = snapshotSettings(game.U);
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
    version, debug, get maxAlive() { return hardLike(profile()) ? 8 : maxAlive; },
    get maxRendered() { return hardLike(profile()) ? 8 : maxAlive; }, get hardLike() { return hardLike(profile()); }, corpseMinimum, levels, key, profile, limit, value, room, reserve, events, begin, rankingDifficulty,
    settingsForStorage() { return game ? (fixedApplied ? { ...game.U, ...customSettings } : game.U) : undefined; },
    get id() { return active; }, get selected() { return selected; },
    get name() { return level(active).name; },
    get isIntro() { return active === 'intro' && !game?.z.mission; },
    get isIntroRun() { return !game?.z.mission && game?.z.challenge?.id === 'intro'; },
    maxLives(fallback = 3) { return profile()?.lives ?? fallback; },
    damageLife() {
      if (!profile()?.unlimited) game.c.life = Math.max(0, game.c.life - 1);
      return game.c.life;
    },
    lifeLabel(life) { return window.skyGuidedMode||profile()?.unlimited ? '∞' : String(life); },
    lifeDisplay(life, fallback = 3) {
      if (window.skyGuidedMode||profile()?.unlimited) return '∞';
      const maximum = profile()?.lives ?? fallback;
      return '●'.repeat(Math.max(0, Math.min(maximum, life))) + '○'.repeat(Math.max(0, maximum - life));
    },
    spawnAllowed(point, kind) {
      if (window.skyIndoorAccess?.allows(point) === false) return false;
      if (profile() && window.skySpawnReach?.allows(point, kind) === false) return false;
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
    // Squeeze forecast. Same answer as before (bench/escape-lead.test.cjs keeps the previous version and compares),
    // but one squeeze attempt asks up to six times in a single frame, and each ask used to run two whole-map searches
    // with a fresh queue and fresh arrays (70-250 ms frames on an iPhone, docs/HITCHES_2026-11-12.md). Now the
    // zombies already on the map are spread once per frame, each candidate pair only adds itself to that result,
    // and per-edge costs are computed once per frame.
    escapeLead(start, enemies, { nav, enemyCost, playerCost, hooks, margin }) {
      const count = nav.nodes.length, B = leadBuffers(nav), out = nav.out, E = nav.E;
      const alive = game.Jt.filter(e => !e.dead && e.node >= 0);
      const frame = game.z.t + ':' + (window.skyIndoorAccess?.revision ?? 0) + ':' + active + ':' + game.U.sprintSpeed + ':' + game.U.gravity;
      if (B.frame !== frame || B.enemyCost !== enemyCost || B.playerCost !== playerCost) {
        B.enemy.fill(NaN); B.player.fill(NaN); B.baseKey = null;
        B.frame = frame; B.enemyCost = enemyCost; B.playerCost = playerCost;
      }
      const spread = (arrival, sources) => {
        B.size = 0;
        for (const [node, time] of sources) if (time < arrival[node]) { arrival[node] = time; heapPush(B, time, node); }
        while (B.size) {
          heapPop(B);
          const time = B.key, node = B.value;
          if (time > arrival[node]) continue;
          if (time > 20) break;
          for (const id of out[node]) {
            let cost = B.enemy[id];
            if (cost !== cost) cost = B.enemy[id] = enemyCost(E[id]);
            const to = E[id].to, next = time + cost;
            if (next < arrival[to]) { arrival[to] = next; heapPush(B, next, to); }
          }
        }
      };
      const baseKey = alive.map(e => e.node).join(',');
      if (B.baseKey !== baseKey) { B.base.fill(Infinity); spread(B.base, alive.map(e => [e.node, 0])); B.baseKey = baseKey; }
      const arrival = B.arrival; arrival.set(B.base);
      spread(arrival, enemies);
      // Track whether this route has already used its hook. A second hook is
      // deliberately excluded from this short forecast, rather than ignoring CD.
      const reached = B.reached; reached.fill(Infinity);
      B.size = 0; reached[start] = 0; heapPush(B, 0, start);
      let lead = -1;
      const hookCD = game.c.hookCD;
      while (B.size) {
        heapPop(B);
        const time = B.key, state = B.value, used = state >= count, node = used ? state - count : state;
        if (time > reached[state]) continue;
        lead = Math.max(lead, Math.min(arrival[node], 30) - time);
        if (time > 8) continue;
        const offset = used ? count : 0;
        for (const id of out[node]) {
          let cost = B.player[id];
          if (cost !== cost) cost = B.player[id] = playerCost(E[id]);
          const to = E[id].to, next = time + cost, target = to + offset;
          if (next < reached[target] && next < arrival[to] - margin) { reached[target] = next; heapPush(B, next, target); }
        }
        if (!used && time >= hookCD) for (const hook of hooks[node] || []) {
          const next = time + hook.t + .8, target = hook.to + count;
          if (next < reached[target] && next < arrival[hook.to] - margin) { reached[target] = next; heapPush(B, next, target); }
        }
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
        if (tip !== introTip) { introTip = tip; if (tip > 0) game.rn(tips[tip]); }
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
      for (const p of levels) if (p.id !== 'legacy') selector.add(new Option(p.trial ? `${p.name}（試作・ランキング対象外）` : `${p.name}（スコア ×${(1 + .1 * levels.indexOf(p)).toFixed(1)}）`, p.id));
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
      document.getElementById('bReset').addEventListener('click', () => {
        if (fixedApplied) customSettings = snapshotSettings(game.Jn);
        sync(); game.Ua();
      });
      game.refreshChallengeBest(); sync();
    },
  };
})();
