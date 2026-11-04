// Boss zombie (hard only): the big chaser that used to be an unkillable "stalker", now a normal zombie with
// five times the health. It is a slow-to-wear-down threat to shake off, not a gun sponge: the pistol carries
// far fewer rounds than 5x a hard zombie's health, so it is mostly escaped, knocked off high ground or kicked.
// It spawns from the `boss` script event (challenge-difficulty.js) as two bodies outside the ordinary-zombie budget,
// so it arrives on time even when the ordinary crowd is full; nothing living is removed to make room for it.
(function (root) {
  const CONFIG = Object.freeze({
    healthMultiplier: 5, scale: 1.4, radius: .38, height: 2.2, speedMul: .95,
    minDistance: 22, maxDistance: 48, retrySeconds: .25, riseSeconds: 1.2,
    // Light hits (pistol, knife) neither stun-lock nor shove it; a kick or a stomp still moves it.
    lightStun: 1, lightPush: 8.5, shoveLight: .2, shoveHeavy: .5, stunHeavy: .5,
  });
  const health = base => base * CONFIG.healthMultiplier;
  // Same contract as the opening wave: a pure choice among candidate nodes, `ok` adds the game's own checks.
  function pick(nodes, player, random, ok = () => true) {
    const list = nodes.filter(n => {
      const d = Math.hypot(n.x - player.x, n.z - player.z);
      return d >= CONFIG.minDistance && d <= CONFIG.maxDistance && ok(n);
    });
    return list.length ? list[Math.floor(random() * list.length)] : null;
  }
  // [stun, push] a hit lands with. Light hits do not flinch it; heavy ones (kick, stomp) do, at half strength.
  function reaction(stun, push) {
    const heavyStun = stun >= CONFIG.lightStun, heavyPush = push >= CONFIG.lightPush;
    return [heavyStun ? stun * CONFIG.stunHeavy : 0, push * (heavyPush ? CONFIG.shoveHeavy : CONFIG.shoveLight)];
  }
  // 0..1 for the HUD bar; never negative, never above full.
  const fraction = (hp, max) => max > 0 ? Math.min(1, Math.max(0, hp / max)) : 0;

  const state = { want: false, bosses: [], lastT: 0, spawns: 0, timer: 0, bar: null, previewAsked: false };

  function reset() {
    state.want = false; state.bosses = []; state.lastT = 0; state.spawns = 0; state.previewAsked = false;
    hideBar();
  }
  const begin = reset;
  // True from the moment the event fires until a spawn point has been found and the boss exists.
  const pending = () => state.want && state.spawns < 2;
  const active = () => state.bosses.some(b => !b.dead && !b.remove);
  function request() { if (state.spawns < 2) state.want = true; return state.want; }

  function ensureBar() {
    if (state.bar || typeof document === 'undefined') return state.bar;
    const hud = document.getElementById('hud');
    if (!hud) return null;
    const style = document.createElement('style');
    style.textContent = '#bossBar{position:absolute;top:calc(env(safe-area-inset-top,0px) + 58px);left:50%;transform:translateX(-50%);' +
      'display:flex;align-items:center;gap:8px;padding:3px 10px;border-radius:10px;background:rgba(20,6,6,.62);' +
      'color:#ffd9d2;font:800 12px/1 system-ui;letter-spacing:.08em;pointer-events:none;z-index:6}' +
      '#bossBar[hidden]{display:none}#bossBar i{display:block;width:min(24vw,160px);height:8px;border-radius:5px;' +
      'background:rgba(255,255,255,.18);overflow:hidden}#bossBar b{display:block;height:100%;width:100%;' +
      'background:linear-gradient(90deg,#ff5b3f,#ff9a5a);transform-origin:left}';
    document.head.append(style);
    const bar = document.createElement('div');
    bar.id = 'bossBar'; bar.hidden = true;
    bar.innerHTML = '<span>BOSS</span><i><b></b></i><i><b></b></i>';
    hud.append(bar); state.bar = bar;
    return bar;
  }
  function hideBar() { if (state.bar) state.bar.hidden = true; }
  function showBar(values) {
    const bar = ensureBar();
    if (!bar) return;
    bar.hidden = false;
    bar.querySelectorAll('b').forEach((fill, i) => { fill.style.transform = `scaleX(${values[i] || 0})`; });
  }

  // Tint a cloned material so the boss reads as "not a normal zombie" even from far away.
  function tint(boss) {
    boss.m.root.traverse(node => {
      if (!node.isMesh || !node.material) return;
      const one = material => {
        const copy = material.clone();
        if (copy.color) { copy.color.r = Math.min(1, copy.color.r * 1.25); copy.color.g *= .62; copy.color.b *= .55; }
        if (copy.emissive?.setRGB) copy.emissive.setRGB(.16, .015, .01);
        copy.userData = { ...copy.userData, boss: true };
        return copy;
      };
      node.material = Array.isArray(node.material) ? node.material.map(one) : one(node.material);
    });
  }
  function dress(zombie, baseHealth) {
    zombie.boss = true; zombie.born = 'boss'; zombie.flank = false; zombie.dropper = false;
    zombie.hp = health(baseHealth); zombie.maxHp = zombie.hp; zombie.speedMul = CONFIG.speedMul;
    zombie.r = CONFIG.radius; zombie.h = CONFIG.height; zombie.spawnT = CONFIG.riseSeconds;
    zombie.m.root.scale.setScalar(CONFIG.scale);
    const hurt = zombie.hurt;
    zombie.hurt = function (amount, dx, dz, stun, push) {
      const [s, p] = reaction(stun, push);
      return hurt.call(this, amount, dx, dz, s, p);
    };
    tint(zombie);
    return zombie;
  }

  // Place the boss on a walkable, well-connected node far from the player that its route can actually reach.
  function spawn(game = root.__game, sky = root.__skyInternals, challenge = root.skyChallenge) {
    if (!game?.NAV || !game.P || !game.Zombie || !challenge?.profile?.() || state.spawns >= 2) return false;
    const { nodes, out } = game.NAV, reach = root.skySpawnReach;
    const node = pick(nodes, game.P.pos, Math.random, n => {
      const cost = game.FIELD[n.id], straight = Math.hypot(n.x - game.P.pos.x, n.z - game.P.pos.z);
      return out[n.id].length >= 3 && cost < Infinity && (reach ? reach.reachable(cost, straight) : true) &&
        root.skyIndoorAccess?.allows?.(n) !== false && challenge.spawnAllowed({ x: n.x, y: n.y + .01, z: n.z }, 'boss');
    });
    if (!node) return false;
    const point = { x: node.x, y: node.y + .01, z: node.z };
    if (!challenge.spawnAllowed(point, 'boss') || !challenge.reserve({ boss: true })) return false;
    const base = challenge.value('zombieHealth', sky?.U?.zombieHealth ?? 6);
    const zombie = dress(new game.Zombie(point.x, point.y, point.z), base);
    zombie.bornDistance = Math.hypot(point.x - game.P.pos.x, point.z - game.P.pos.z);
    game.zombies.push(zombie);
    state.bosses.push(zombie); state.spawns++; if (state.spawns >= 2) state.want = false;
    sky?.rn?.('ボスが現れた');
    try { sky?.Tt?.roar?.(0, .95); } catch {}
    return true;
  }

  // Called a few times a second while a run is playing.
  function upkeep(game = root.__game, sky = root.__skyInternals, challenge = root.skyChallenge) {
    if (!sky || sky.modeRef?.() !== 'play') return;
    const t = sky.z.t;
    if (t < state.lastT - .5) reset();
    if (t === state.lastT) return; // paused: the game clock is not moving
    state.lastT = t;
    // Look at the boss right away: ?challengeDebug=1&boss=now (debug runs keep their own records and send nothing).
    if (!state.previewAsked && t > 1 && challenge?.debug && typeof location !== 'undefined' && new URLSearchParams(location.search).get('boss') === 'now') {
      state.previewAsked = true; request();
    }
    if (pending()) spawn(game, sky, challenge);
    for (const boss of state.bosses) {
      if (boss.dead || boss.remove) continue;
      // Keep the tall body only where there is room for it.
      if (!boss.crawl && boss.h < CONFIG.height - .01 && sky.oe?.(boss.pos.x, boss.pos.y + .05, boss.pos.z, boss.r, CONFIG.height)) boss.h = CONFIG.height;
      else if (boss.h > 1.85 && sky.oe && !sky.oe(boss.pos.x, boss.pos.y + .05, boss.pos.z, boss.r, boss.h)) boss.h = 1.8;
    }
    if (active()) showBar(state.bosses.map(b => b.dead || b.remove ? 0 : fraction(b.hp, b.maxHp)));
    else hideBar();
  }

  function start() {
    if (state.timer || typeof setInterval !== 'function') return;
    state.timer = setInterval(() => { try { upkeep(); } catch (error) { console.warn('boss upkeep', error); } }, CONFIG.retrySeconds * 1000);
  }

  const api = { CONFIG, health, pick, reaction, fraction, dress, spawn, upkeep, request, begin, reset, pending, active, start,
    get boss() { return state.bosses[0] || null; }, get bosses() { return state.bosses.slice(); }, get spawns() { return state.spawns; } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.skyBossZombie = api; if (typeof document !== 'undefined') start(); }
})(globalThis);
