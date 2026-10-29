// Per-enemy sight memory. Hidden players never supply navigation destinations.
export const ZOMBIE_SEARCH = Object.freeze({ duration: 10, scan: 0.2, recognition: 0.45,
  memoryLimit: 2.5, radius: 7, walkSpeed: 1.35, fieldCacheSize: 12 });

export function createZombieSearch(game, runtime, flashbang, random = Math.random) {
  const { c: player, z: run, U, Jt: enemies, searchNav: nav } = game;
  const { nodes, out, E: edges } = runtime.NAV;
  let tracks = new WeakMap(), fields = new Map(), quietUntil = 0, escapedAt = -Infinity;
  let hadChase = false, escaped = false, nextGraphCheck = 0, graphKey = '', serial = 0;
  const stats = { escapes: 0, reacquired: 0, searches: 0, fields: 0 };
  const enabled = () => !!U.loseSight && !run.mission;
  const playing = () => runtime.mode === 'play' && !run.over;
  const point = p => ({ x: p.x, y: p.y, z: p.z });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const nodeAt = p => runtime.nodeAt(p.x, p.y + 0.1, p.z);
  const active = e => !e.dead && !e.remove && !e.rise && !e.fall && !e.act?.emerge && e.spawnT <= 0;
  const costFor = e => e.stalker ? nav.stalkerCost : e.dropper ? nav.dropCost : nav.cost;

  // Migrate the former default, while retaining deliberate non-default values.
  U.senseT = Number.isFinite(U.senseT) && U.senseT !== 4 ? U.senseT : ZOMBIE_SEARCH.duration;
  game.Jn.senseT = ZOMBIE_SEARCH.duration;
  const duration = () => Math.max(1, Number(U.senseT) || ZOMBIE_SEARCH.duration);

  function track(enemy) {
    let state = tracks.get(enemy);
    if (!state) {
      state = { id: ++serial, phase: 'patrol', anchor: point(enemy.pos), last: null, target: -1,
        nextLook: -Infinity, nextWalk: 0, recognized: 0, wasChasing: false, observedAt: -Infinity };
      tracks.set(enemy, state);
    }
    return state;
  }
  function event(name, data = {}) { game.searchEvent?.(name, data); }
  function clearSight(enemy, state) {
    if (flashbang.blinded(enemy)) return false;
    const dx = player.pos.x - enemy.pos.x, dz = player.pos.z - enemy.pos.z;
    const dy = player.pos.y + 1.25 - (enemy.pos.y + Math.min(1.5, enemy.h - 0.1));
    const length = Math.hypot(dx, dy, dz), horizontal = Math.hypot(dx, dz);
    if (length > (U.sightR || 40)) return false;
    // A chasing zombie keeps its target in attention. Searching zombies must
    // actually turn toward it, except for unobstructed very close encounters.
    if (state.phase !== 'chase' && horizontal > 2.2 &&
        (-Math.sin(enemy.yaw) * dx - Math.cos(enemy.yaw) * dz) / (horizontal || 1) < Math.cos(80 * Math.PI / 180)) return false;
    return !game.raycast(enemy.pos.x, enemy.pos.y + Math.min(1.5, enemy.h - 0.1), enemy.pos.z,
      dx / (length || 1), dy / (length || 1), dz / (length || 1), Math.max(0, length - 0.1));
  }
  function change(enemy, state, phase) {
    if (state.phase === phase) return;
    state.phase = phase; enemy.edge = -1; enemy.navT = 0; enemy.PF = null; enemy.LF = null;
    enemy.atkT = 0; state.target = -1; state.nextWalk = 0;
  }
  function beginSearch(enemy, state) {
    change(enemy, state, 'search'); state.until = run.t + duration();
    state.anchor = point(state.last || enemy.pos);
    if (state.wasChasing) { stats.searches++; game.searchEscapeScore?.(); }
    event('zombieSearch', { enemy: state.id, seconds: duration() });
  }
  function observe(enemy, dt) {
    if (!enabled()) { enemy.lost = false; return; }
    if (!playing()) return;
    if (!active(enemy)) { enemy.lost = true; return; }
    const state = track(enemy);
    // The pillar-climb wrapper and base walking update share the same step.
    if (state.observedAt === run.t) return;
    state.observedAt = run.t;
    if (run.t >= state.nextLook) {
      const elapsed = Math.min(0.3, run.t - (state.lookAt ?? run.t));
      state.lookAt = run.t; state.nextLook = run.t + ZOMBIE_SEARCH.scan;
      const visible = clearSight(enemy, state);
      if (visible) {
        if (state.phase !== 'chase') state.recognized += elapsed;
        if (state.phase === 'chase' || state.recognized >= ZOMBIE_SEARCH.recognition) {
          const returning = state.phase !== 'chase' && state.wasChasing;
          change(enemy, state, 'chase'); state.wasChasing = true;
          state.last = point(player.pos); state.lastNode = nodeAt(state.last);
          hadChase = true;
          if (returning) {
            stats.reacquired++; event('zombieReacquired', { enemy: state.id });
            if (escaped) { game.rn('見つかった — 追跡再開'); cue(false); }
          }
          escaped = false; quietUntil = 0;
        }
      } else {
        state.recognized = 0;
        if (state.phase === 'chase') {
          change(enemy, state, 'memory'); state.hiddenAt = run.t;
          state.anchor = point(state.last || enemy.pos);
        }
      }
    }
    if (state.phase === 'memory') {
      const age = run.t - state.hiddenAt;
      if (age >= Math.max(0.6, U.loseDelay || 0) &&
          (distance(enemy.pos, state.last || state.anchor) < 1.3 || age >= ZOMBIE_SEARCH.memoryLimit)) beginSearch(enemy, state);
    } else if (state.phase === 'search' && run.t >= state.until) {
      // Expiry changes search to ordinary local patrol. It grants no knowledge
      // of the player's current position, even when the old field is stale.
      change(enemy, state, 'patrol');
    }
    enemy.lost = state.phase !== 'chase'; enemy.seen = !enemy.lost;
    enemy.hideT = enemy.lost ? Math.max(0, run.t - (state.hiddenAt || run.t)) : 0;
  }
  function field(target, enemy) {
    if (target < 0) return null;
    if (run.t >= nextGraphCheck) {
      nextGraphCheck = run.t + 0.5;
      const key = edges.map((e, i) => e.door ? `${i}:${e.door.off ? 'o' : 'c'}` : e.jamT > game.ceRef() ? `${i}:j` : '').join('|');
      if (key !== graphKey) { fields.clear(); graphKey = key; }
    }
    const key = `${enemy.stalker ? 's' : enemy.dropper ? 'd' : 'n'}:${target}`;
    if (fields.has(key)) return fields.get(key);
    const result = new Float32Array(nodes.length);
    nav.field([target], costFor(enemy), 400, result); stats.fields++;
    fields.set(key, result);
    if (fields.size > ZOMBIE_SEARCH.fieldCacheSize) fields.delete(fields.keys().next().value);
    return result;
  }
  function wander(enemy, state, source) {
    // Walk only to locally reachable nodes around the remembered location.
    // Outgoing links establish reachability before choosing a random goal.
    const center = distance(nodes[source], state.anchor) > ZOMBIE_SEARCH.radius + 1 ? nodes[source] : state.anchor;
    const visited = new Set([source]), queue = [[source, 0]], candidates = [], cost = costFor(enemy);
    for (let i = 0; i < queue.length && i < 160; i++) {
      const [id, length] = queue[i], node = nodes[id];
      if (id !== source && distance(node, center) <= ZOMBIE_SEARCH.radius &&
          distance(node, enemy.pos) > 1.2 && id !== state.target) candidates.push(id);
      for (const edgeID of out[id] || []) {
        const e = edges[edgeID], next = nodes[e.to];
        if (visited.has(e.to) || !Number.isFinite(cost(e)) || e.jamT > game.ceRef() ||
            length + e.len > 12 || distance(next, center) > ZOMBIE_SEARCH.radius + 1) continue;
        visited.add(e.to); queue.push([e.to, length + e.len]);
      }
    }
    state.target = candidates.length ? candidates[Math.floor(random() * candidates.length)] : source;
    state.nextWalk = run.t + 1.8 + random() * 1.4;
  }
  function pickEdge(enemy) {
    if (!enabled() || !enemy.lost) return false;
    const state = track(enemy), source = nodeAt(enemy.pos);
    enemy.node = source; enemy.edge = -1;
    if (source < 0) return true;
    if (state.phase === 'memory') state.target = state.lastNode ?? -1;
    else if (state.target < 0 || run.t >= state.nextWalk || distance(enemy.pos, nodes[state.target]) < 0.8) wander(enemy, state, source);
    const costs = field(state.target, enemy), edgeCost = costFor(enemy);
    if (!costs || !Number.isFinite(costs[source])) return true;
    let best = costs[source] + 0.01;
    for (const id of out[source] || []) {
      const e = edges[id], value = edgeCost(e) + costs[e.to];
      if (e.jamT > game.ceRef()) continue;
      if (value < best) { best = value; enemy.edge = id; }
    }
    return true;
  }
  function hearShot(radius) {
    if (!enabled() || !playing()) return;
    // Sound gives a single location to investigate, never live tracking. The
    // respite remains in force until an enemy confirms a visual reacquisition.
    const origin = point(player.pos);
    for (const enemy of enemies) {
      if (!active(enemy) || distance(enemy.pos, origin) > radius) continue;
      const state = track(enemy);
      if (state.phase === 'chase') continue;
      state.last = point(origin); state.lastNode = nodeAt(origin);
      state.hiddenAt = run.t; change(enemy, state, 'memory');
      enemy.lost = true; enemy.seen = false;
    }
  }
  function cue(success) {
    const audio = game.Ut;
    if (!audio?.ctx || !audio.master || audio.ctx.state !== 'running') return;
    const t = audio.ctx.currentTime;
    for (const [index, hz] of (success ? [660, 880] : [440, 330]).entries()) {
      const oscillator = audio.ctx.createOscillator(), gain = audio.ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = hz;
      const start = t + index * 0.11;
      gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.035, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain); gain.connect(audio.master); oscillator.start(start); oscillator.stop(start + 0.18);
    }
  }
  let status;
  if (typeof document !== 'undefined') {
    status = document.createElement('div'); status.id = 'zombieSearchStatus'; status.hidden = true;
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    document.getElementById('app').append(status);
    const style = document.createElement('style');
    style.textContent = `#zombieSearchStatus{position:absolute;z-index:9;top:56px;left:50%;transform:translateX(-50%);max-width:calc(100% - 32px);padding:5px 10px;border:1px solid #89dfbf;border-radius:7px;background:#102b27e8;color:#d9fff0;font:600 12px/1.4 var(--font);text-align:center;pointer-events:none}#zombieSearchStatus[hidden]{display:none!important}@media(max-height:500px){#zombieSearchStatus{top:48px;font-size:11px}}`;
    document.head.append(style);
  }
  function refreshUI() {
    if (!status) return;
    const remaining = Math.max(0, Math.ceil(quietUntil - run.t));
    status.hidden = !enabled() || !playing() || remaining <= 0;
    const label = run.t - escapedAt < 2 ? '追跡を振り切った' : `ゾンビが周辺を捜索中 · ${remaining}秒`;
    if (status.textContent !== label) status.textContent = label;
  }
  function afterStep() {
    if (!enabled() || !playing()) { refreshUI(); return; }
    const states = enemies.filter(active).map(e => tracks.get(e)).filter(Boolean);
    const pursuing = states.some(s => s.phase === 'chase' || (s.phase === 'memory' && s.wasChasing));
    if (hadChase && !escaped && !pursuing && states.some(s => s.phase === 'search' && s.wasChasing)) {
      escaped = true; escapedAt = run.t; quietUntil = run.t + duration(); stats.escapes++;
      // A prepared warning must not fire as soon as the next frame begins.
      runtime.SCR.warn = runtime.SCR.pending = null;
      game.rn('追跡を振り切った — 周辺を捜索している'); cue(true);
      event('chaseEscaped', { seconds: duration() });
    }
    refreshUI();
  }
  function reset() {
    tracks = new WeakMap(); fields.clear(); quietUntil = 0; escapedAt = -Infinity;
    hadChase = escaped = false; nextGraphCheck = 0; serial = 0;
    for (const name of Object.keys(stats)) stats[name] = 0;
    refreshUI();
  }
  const suppressSpawns = () => enabled() && run.t < quietUntil;
  return { config: ZOMBIE_SEARCH, stats, observe, pickEdge, hearShot, afterStep, reset,
    modeChanged: () => { if (status) status.hidden = true; },
    suppressSpawns, deferSpawn: e => suppressSpawns() && (!!e.rise && e.rise.t < 0 || !!e.fall && e.fall.wait > 0 || !!e.act?.emerge && e.act.wait > 0),
    speed: (e, speed) => !enabled() || !e.lost ? speed : Math.min(speed, track(e).phase === 'memory' ? 2.2 : ZOMBIE_SEARCH.walkSpeed),
    state: e => { const s = tracks.get(e); return s ? { phase: s.phase, last: s.last && point(s.last), target: s.target,
      remaining: Math.max(0, (s.until || 0) - run.t) } : null; },
    get remaining() { return Math.max(0, quietUntil - run.t); } };
}
