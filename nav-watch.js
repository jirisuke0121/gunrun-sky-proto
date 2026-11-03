// Why do zombies stand still above the player? This module answers it from real play.
//
// 1) Stuck log: a zombie that is 2.5 m or more above a grounded player, within 25 m, and has not
//    moved 2.5 m for 5 s is "stuck". One entry per episode (at most one per 8 s, six per run) goes
//    into the run record's diagnostics (`stuck`), with the player's node, the field's target
//    nodes, the zombie's node/edge/field value, and a one-word `cause`. Nothing is sent here:
//    the run recorder owns consent, storage and transmission, as for every other diagnostic.
// 2) Dev badge (?dev=1 only): while the player stands where the nav graph has no node, and while a
//    stuck episode is open, a small badge says so. Players never see it and it costs them nothing.
//
// Background (2026-11-03): the player's navigation node is only refreshed when a node is found
// under the feet and the player is grounded (index.html wv/go). On a floor with no node the field
// keeps targeting the last node, usually the roof the player just left, and every zombie walks
// there and waits.

export const WATCH = Object.freeze({
  seconds: 5,       // standing still for this long
  radius: 2.5,      // m: a crowd jostling around one node drifts 1-2 m; walking covers more in 5 s
  above: 2.5,       // m: the zombie is at least this far above the player's feet
  reach: 25,        // m: horizontal distance within which it is "near the player"
  lapse: .6,        // s: a crowd shoving each other flickers 'on ground'; shorter gaps do not restart the count
  gap: 8,           // s between two log entries
  nodelessSeconds: .3, // the badge waits this long so a landing frame does not flash it
  maxTargets: 3, maxZombies: 3,
});

const round = v => Math.round(v * 10) / 10;
const point = p => [round(p.x), round(p.y), round(p.z)];

// One word for what is wrong. Order matters: the first three explain the rest.
export function classifyStuck({ standingNode, playerY, targets, zombieNode, zombieField, nav = 0 }) {
  if (standingNode < 0) return 'player-no-node';
  if (!nav && targets.length && targets.every(t => Math.abs(t[1] - playerY) > 1.2)) return 'target-off-floor';
  if (zombieNode < 0) return 'zombie-no-node';
  if (!Number.isFinite(zombieField)) return 'no-route';
  return 'route-exists';
}

export function createNavWatch(game, runtime, { probe = () => window.skyTelemetryProbe, devMode = () => window.skyDevMode } = {}) {
  const { c: player, z: run, Jt: zombies } = game;
  const stats = { logged: 0, skipped: 0, nodelessSeconds: 0 };
  const episodes = new WeakMap();
  let lastSample = -Infinity, lastLog = -Infinity, nodelessFor = 0, openUntil = -Infinity, lastEntry = null;

  const playing = () => runtime.mode === 'play' && !run.over && !run.mission && !window.skyPracticeMode && !window.skyOwnerReplay;
  const standing = () => playing() && player.onGround && (player.state === 'normal' || player.state === 'slide') && !window.skyBite?.locked;
  const standingNode = () => runtime.nodeAt(player.pos.x, player.pos.y + .1, player.pos.z);

  // Player-level state, once per game clock tick (called from every zombie update and from the badge loop).
  function sample() {
    if (run.t < lastSample) { lastSample = run.t; lastLog = -Infinity; nodelessFor = 0; openUntil = -Infinity; lastEntry = null; }
    const dt = Math.min(.25, run.t - lastSample);
    if (!(dt > 0)) return;
    lastSample = run.t;
    if (standing() && standingNode() < 0) { nodelessFor += dt; stats.nodelessSeconds += dt; } else nodelessFor = 0;
  }

  function eligible(z) {
    return !z.dead && !z.remove && !z.stalker && !z.dropper && !(z.spawnT > 0) && z.onGround && !z.act && !z.rise && !z.fall &&
      !(z.stun > 0) && !z.guard && !z.bash && !window.skyFlashbang?.blinded?.(z) && !window.skyDecoy?.targetFor?.(z);
  }

  function entryFor(z) {
    const nodes = runtime.NAV.nodes, field = runtime.FIELD, targets = [];
    for (let i = 0; i < field.length && targets.length < WATCH.maxTargets; i++) if (field[i] === 0) targets.push(point(nodes[i]));
    // Zombies that reach 5 s on this very tick (updated after this one) count too.
    const stuck = zombies.filter(o => (episodes.get(o)?.time || 0) >= WATCH.seconds - .25);
    let nav = 0;
    try { nav = (window.skyZombieClimb?.navigationTargets?.() || []).length; } catch {}
    const node = standingNode(), fieldAt = z.node >= 0 ? field[z.node] : Infinity;
    const cause = classifyStuck({ standingNode: node, playerY: player.pos.y, targets, zombieNode: z.node, zombieField: fieldAt, nav });
    return {
      t: round(run.t), cause, n: stuck.length, nav,
      player: { p: point(player.pos), now: node, kept: player.node, keptAt: player.node >= 0 ? point(nodes[player.node]) : null },
      targets,
      zombies: stuck.slice(0, WATCH.maxZombies).map(o => ({
        p: point(o.pos), node: o.node, f: o.node >= 0 && Number.isFinite(field[o.node]) ? round(field[o.node]) : null, edge: o.edge,
      })),
    };
  }

  function report(z) {
    if (run.t - lastLog < WATCH.gap) { stats.skipped++; return; }
    lastLog = run.t;
    lastEntry = entryFor(z);
    openUntil = run.t + 1;
    probe()?.stuck?.(lastEntry);
    stats.logged++;
  }

  function watch(z, dt) {
    sample();
    const ep = episodes.get(z), step = Math.min(dt, .25);
    const ok = standing() && eligible(z) && z.pos.y - player.pos.y >= WATCH.above &&
      Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z) <= WATCH.reach;
    if (!ok) {
      if (!ep) return;
      ep.lapse += step;
      if (ep.lapse > WATCH.lapse) episodes.delete(z); else ep.time += step;
      return;
    }
    if (!ep) { episodes.set(z, { x: z.pos.x, z: z.pos.z, time: 0, lapse: 0, logged: false }); return; }
    ep.lapse = 0;
    if (Math.hypot(z.pos.x - ep.x, z.pos.z - ep.z) >= WATCH.radius) { ep.x = z.pos.x; ep.z = z.pos.z; ep.time = 0; ep.logged = false; return; }
    ep.time += step;
    if (ep.time >= WATCH.seconds) { openUntil = run.t + 1; if (!ep.logged) { ep.logged = true; report(z); } }
  }

  const status = () => {
    sample();
    const kept = player.node >= 0 ? runtime.NAV.nodes[player.node] : null;
    return { nodeless: nodelessFor >= WATCH.nodelessSeconds, stuck: run.t <= openUntil, keptY: kept ? round(kept.y) : null,
      playerY: round(player.pos.y), last: lastEntry };
  };

  // Badge: created only in developer mode.
  let badge = null;
  function render() {
    const s = status();
    if (!s.nodeless && !s.stuck) { if (badge) badge.hidden = true; return; }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'navWatchBadge';
      badge.style.cssText = 'position:fixed;left:50%;top:15%;transform:translateX(-50%);z-index:60;pointer-events:none;' +
        'padding:4px 10px;border-radius:6px;background:rgba(170,24,24,.88);color:#fff;font:700 13px/1.35 system-ui,sans-serif;text-align:center;white-space:nowrap';
      document.body.appendChild(badge);
    }
    const lines = [];
    if (s.nodeless) lines.push(`ノード無し：ゾンビの目標が古いまま（自分 y=${s.playerY}／目標 y=${s.keptY ?? '—'}）`);
    if (s.stuck) lines.push(`詰まり検知：${s.last ? `${s.last.n}体・${s.last.cause}` : '…'}`);
    badge.textContent = lines.join('\n'); badge.style.whiteSpace = 'pre'; badge.hidden = false;
  }
  if (devMode()) {
    const loop = () => { try { render(); } catch {} requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  const proto = game.ri.prototype, original = proto.update;
  proto.update = function updateWithNavWatch(dt) {
    original.call(this, dt);
    watch(this, dt);
  };
  return { config: WATCH, stats, watch, sample, status, render, classify: classifyStuck };
}
