// Unity Challenge pacing, adapted to the 120-second aerial-corridor course.
// Source settings and intentional adaptations are documented in CHALLENGE_DIFFICULTY.md.
(() => {
  const version = 'unity-v1', storage = 'gunrun-challenge-difficulty-v1';
  const levels = [
    { id: 'easy', name: 'Easy', note: '少ない群れで技を練習', maxSpeed: 2.5, counts: [3, 6, 9], initial: 3, interval: 2, flank: .05, ahead: .1, drop: 0, lull: 5, quiet: 0 },
    { id: 'normal', name: 'Normal', note: '逃げ道を選んで生き残る', maxSpeed: 3, counts: [5, 10, 15], initial: 4, interval: 1.4, flank: .15, ahead: .2, drop: .1, lull: 4, quiet: 22 },
    { id: 'hard', name: 'Hard', note: '増援を技と射撃で切り抜ける', maxSpeed: 3.3, counts: [6, 12, 20], initial: 4, interval: 1.15, flank: .25, ahead: .25, drop: .15, lull: 3, quiet: 19 },
    { id: 'expert', name: 'Expert', note: '前後からの包囲に備える', maxSpeed: 3.6, counts: [8, 16, 24], initial: 5, interval: .9, flank: .35, ahead: .35, drop: .2, lull: 2.5, quiet: 16 },
    { id: 'master', name: 'Master', note: '20秒ごとに群れが厚くなる', maxSpeed: 3.6, counts: [8, 12, 17, 22, 27, 30], initial: 6, interval: .65, flank: .45, ahead: .4, drop: .25, lull: 2, quiet: 14 },
    { id: 'ultra', name: 'Ultra', note: '最大36体・速い追跡と連続包囲', maxSpeed: 4.4, counts: [10, 16, 22, 28, 32, 36], initial: 7, interval: .5, flank: .55, ahead: .45, drop: .3, lull: 1.5, quiet: 12 },
    { id: 'legacy', name: '自由調整', note: '従来の設定・追跡者・ランキング', counts: [] },
  ];
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
  const key = base => (active === 'legacy' ? base : `${base}-${version}-${active}`) + (debug ? '-debug' : '');
  function limit(time, fallback) {
    const p = profile();
    return p ? p.counts[Math.min(p.counts.length - 1, Math.floor(Math.max(0, time) / (p.counts.length === 3 ? 40 : 20)))] : fallback;
  }
  function value(name, fallback) {
    const p = profile();
    if (!p) return fallback;
    return name in p.values ? p.values[name] : fallback;
  }
  function events(fallback) {
    const index = levels.findIndex(p => p.id === active);
    if (index === 6) return fallback;
    if (index < 2) return [];
    if (index === 2) return [{ t: 60, do: 'surge', n: 2 }];
    return [
      { t: 40, do: 'surge', n: index },
      { t: 65, do: 'squeeze', front: index - 1, back: index - 1 },
      { t: 85, do: 'surge', n: index + 1 },
      { t: 100, do: 'squeeze', front: index, back: index },
    ];
  }
  const owned = ['zombieSpeed', 'maxZombies', 'flankShare', 'aheadShare', 'dropperShare', 'dropShare', 'killLull', 'paceGap', 'stalkerOn', 'stalker2', 'stalkerAt', 'stalkerSpeed'];
  function sync() {
    const p = level(selected), preset = selected !== 'legacy';
    document.getElementById('challengeDifficulty').value = selected;
    document.getElementById('challengeDescription').textContent = preset
      ? `${p.note}。群れの上限 ${p.counts.join(' → ')}体、通常追跡 ${(p.maxSpeed - 2).toFixed(1)} → ${p.maxSpeed.toFixed(1)}m/s。終盤ほど強くなる2分間。`
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
            input.value = p.values[name];
            const output = document.getElementById('o_' + name);
            if (output) output.textContent = name === 'maxZombies' ? `${p.values[name]} 体（終盤）` : name === 'zombieSpeed' ? `${p.maxSpeed.toFixed(1)} m/s（終盤）` : String(p.values[name]);
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
      return p ? Math.min(p.maxSpeed, (p.maxSpeed - 2 + 2 * Math.min(1, Math.max(0, game.z.t) / 80)) * multiplier) : fallback;
    },
    interval(fallback) { return profile()?.interval ?? fallback; },
    initial(fallback) { return profile()?.initial ?? fallback; },
    cap(fallback) { return profile() ? limit(game.z.t, fallback) : fallback; },
    extra(fallback) { return profile() ? 0 : fallback; },
    count(alive, ordinary) { return profile() ? alive : ordinary; },
    observe() {
      if (!debug || game.z.t < lastObservation + .5) return;
      lastObservation = game.z.t;
      const alive = game.Jt.filter(e => !e.dead);
      document.getElementById('hDifficulty').dataset.challenge = JSON.stringify({
        id: active, t: +game.z.t.toFixed(2), cap: limit(game.z.t, game.U.maxZombies),
        alive: alive.length, stalkers: alive.filter(e => e.stalker).length,
        speed: +(profile() ? Math.min(profile().maxSpeed, profile().maxSpeed - 2 + 2 * Math.min(1, game.z.t / 80)) : game.U.zombieSpeed).toFixed(3),
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
