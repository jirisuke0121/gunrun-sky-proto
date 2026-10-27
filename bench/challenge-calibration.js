const $ = id => document.getElementById(id), frame = $('game');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = n => Number(n.toFixed(3));
const baseline = { easy: 2.5, normal: 3, hard: 3.3, expert: 3.6, master: 3.6, ultra: 4.4 };
let result = { kind: 'controlled real-runtime measurement', maps: [] }, busy = false, loadToken = 0;
function publish() { $('results').textContent = JSON.stringify(result, null, 2); }
async function load(map) {
  $('status').textContent = `${map} 読込中`;
  const base = new URL('../', location.href).href;
  const token = ++loadToken;
  let source = await (await fetch(base + map, { cache: 'no-store' })).text();
  const init = `window.__calibrationToken=${token};window.__hold=true;const m=new Map;Object.defineProperty(window,'localStorage',{value:{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}});const net=window.fetch.bind(window);window.fetch=(u,o)=>new URL(typeof u==='string'?u:u.url,${JSON.stringify(base)}).origin===${JSON.stringify(new URL(base).origin)}?net(u,o):Promise.resolve(new Response('{}',{status:403}));`;
  source = source.replace('<head>', `<head><base href="${base}"><script>${init}<\/script>`)
    .replace(/RECORD_URL="[^"]*"/, 'RECORD_URL=""');
  const old = frame.contentWindow?.__game?.debug?.renderer;
  if (old) { old.dispose(); old.getContext().getExtension('WEBGL_lose_context')?.loseContext(); }
  frame.srcdoc = source;
  const end = performance.now() + 60000;
  while (performance.now() < end) {
    const w = frame.contentWindow;
    if (w?.__calibrationToken === token && w.__game && w.skyChallenge && w.__skyInternals && !w.document.getElementById('bStart').disabled) {
      w.__game.runlogUse(null); w.__game.RL.on = false;
      return w;
    }
    await wait(100);
  }
  throw Error('ゲーム読込が完了しませんでした');
}
function clearEnemies(w) {
  for (const e of w.__game.zombies) { w.__skyInternals.ue.remove(e.m.root); if (e.pool) w.__skyInternals.ue.remove(e.pool); }
  w.__game.zombies.length = 0;
}
function setup(w, id, phase, before = false) {
  const g = w.__game, policy = w.skyChallenge;
  // Reloaded once per map. Save current values before installing the old proposal.
  const p = policy.levels.find(p => p.id === id);
  p.calibrationOriginal ??= { startSpeed: p.startSpeed, maxSpeed: p.maxSpeed, ramp: p.ramp };
  Object.assign(p, p.calibrationOriginal);
  if (before) { p.maxSpeed = baseline[id]; p.startSpeed = p.maxSpeed - 2; p.ramp = 80; }
  let seed = 12345; w.Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  g.setMode('menu');
  const select = w.document.getElementById('challengeDifficulty'); select.value = id; select.dispatchEvent(new w.Event('change'));
  Object.assign(g.S, { sendLog: false, autoFire: false, aimAuto: false, volume: 0, human: 'existing' });
  g.startGame(); clearEnemies(w); g.RL.on = false;
  g.SCR.off = g.PACE.off = g.MARK.off = true; g.GAME.spawnT = 1e9; g.GAME.t = phase;
  Object.assign(g.P, { life: 3, invuln: g.time + 1000, state: 'normal', onGround: true, hookCD: 0, jumpBuf: 0 });
  for (const key in g.keys) g.keys[key] = false;
  return g;
}
function place(g, point, dx = 0, dz = -1) {
  g.P.pos.set(point.x, point.y + .015, point.z); g.P.vel.set(0, 0, 0);
  Object.assign(g.P, { yaw: Math.atan2(-dx, -dz), pitch: -.05, state: 'normal', onGround: true, h: 1.8, eye: 1.62, jumpBuf: 0, hookCD: 0, setCD: 0, ladder: null, ledge: null });
  g.P.node = g.nodeAt(g.P.pos.x, g.P.pos.y + .1, g.P.pos.z); g.updateField();
}
function spawn(w, point) {
  const g = w.__game, e = new g.Zombie(point.x, point.y + .015, point.z);
  Object.assign(e, { speedMul: 1, spawnT: 0, flank: false, dropper: false, onGround: true, atkCD: 1000 });
  e.node = g.nodeAt(point.x, point.y + .1, point.z); e.navT = 0; g.zombies.push(e); return e;
}
function lane(w) {
  const g = w.__game, I = w.__skyInternals;
  const candidates = g.NAV.nodes.filter(q => Math.abs(q.y) < .1 && g.NAV.out[q.id].length >= 2);
  let best = null;
  for (let k = 0; k < candidates.length; k += 3) {
    const q = candidates[k];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let length = 0;
      for (; length < 40; length += .5) {
        const x = q.x + dx * length, z = q.z + dz * length;
        if (!I.oe(x, q.y + .05, z, .35, 1.8) || !g.groundBelow(x, z, q.y, .3, .2)) break;
      }
      if (!best || length > best.length) best = { x: q.x, y: q.y, z: q.z, dx, dz, length };
      if (length >= 30) return best;
    }
  }
  if (best?.length >= 16) return best;
  throw Error(`比較できる平地が不足しています（最大${best?.length || 0}m）`);
}
function flat(w, q, id, phase, before) {
  const g = setup(w, id, phase, before), { dx, dz } = q;
  place(g, { x: q.x + dx * 8, y: q.y, z: q.z + dz * 8 }, dx, dz);
  const e = spawn(w, q); g.keys.KeyW = true;
  const start = g.P.pos.clone(), enemyStart = e.pos.clone();
  let playerSpeed = 0, enemySpeed = 0, samples = 0;
  const steps = Math.floor(Math.min(3, (q.length - 10) / g.S.sprintSpeed) * 60);
  for (let i = 0; i < steps; i++) {
    g.GAME.t = phase; g.advance(1 / 60);
    if (i >= steps * .7) { playerSpeed += Math.hypot(g.P.vel.x, g.P.vel.z); enemySpeed += Math.hypot(e.vel.x, e.vel.z); samples++; }
  }
  g.keys.KeyW = false; g.frameOnce(0);
  const ps = playerSpeed / samples, zs = enemySpeed / samples;
  return { id, phase, proposal: before ? 'before' : 'current', playerSpeed: round(ps), enemySpeed: round(zs),
    seconds: round(steps / 60), gapAtStart: 8, gapAtEnd: round(Math.hypot(g.P.pos.x - e.pos.x, g.P.pos.z - e.pos.z)),
    playerDistance: round(g.P.pos.distanceTo(start)), enemyDistance: round(e.pos.distanceTo(enemyStart)),
    sameHeight: Math.abs(g.P.pos.y - e.pos.y) < .1, playerState: g.P.state,
    estimatedSecondsToClose8m: zs - ps > .01 ? round(8 / (zs - ps)) : null };
}
function inventory(g) {
  const kinds = {}; for (const e of g.NAV.E) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  return { nodes: g.NAV.nodes.length, edges: kinds, ladders: g.LADDERS.map(l => ({ x: l.x, z: l.z, y0: l.y0, y1: l.y1, nx: l.nx, nz: l.nz })), hooks: g.HOOKS.length, zips: g.ZIPS.length };
}
async function measure() {
  if (busy) return; busy = true; $('measure').disabled = $('terrain').disabled = true;
  result = { kind: 'controlled real-runtime measurement; 8m initial gap, 3-second flat sprint, per-enemy multiplier 1; game phase held fixed', maps: [] }; publish();
  try {
    for (const map of ['index.html', 'canyon.html']) {
      const w = await load(map), q = lane(w), data = { map, inventory: inventory(w.__game), lane: q, flat: [] };
      result.maps.push(data);
      for (const id of ['easy', 'normal', 'hard', 'expert', 'master', 'ultra']) for (const phase of [0, 60, 100]) for (const before of [true, false]) {
        $('status').textContent = `${map} ${id} ${phase}秒 ${before ? '前案' : '調整後'}`;
        data.flat.push(flat(w, q, id, phase, before)); publish(); await wait(0);
      }
    }
    $('status').textContent = '直線追跡の測定完了';
  } catch (e) { result.error = String(e.stack || e); $('status').textContent = '測定エラー'; publish(); }
  finally { busy = false; $('measure').disabled = $('terrain').disabled = false; }
}
$('measure').addEventListener('click', measure);
function advance(w, seconds, phase = 80) {
  const g = w.__game;
  for (let i = 0; i < seconds * 60; i++) { g.GAME.t = phase; g.advance(1 / 60); }
}
function arrival(w, origin, target, seconds = 25) {
  const g = setup(w, 'normal', 100); place(g, target);
  const e = spawn(w, origin);
  for (let i = 0; i < seconds * 60; i++) {
    g.GAME.t = 100; g.advance(1 / 60);
    if (Math.abs(e.pos.y - target.y) < .4 && Math.hypot(e.pos.x - target.x, e.pos.z - target.z) < 1.3) return round(i / 60);
  }
  return null;
}
function jump(w, q) {
  const g = setup(w, 'normal', 100);
  place(g, { x: q.x + q.dx * 5, y: q.y, z: q.z + q.dz * 5 }, q.dx, q.dz);
  g.keys.KeyW = true; advance(w, .3, 100);
  const start = g.P.pos.clone(); g.P.jumpBuf = g.S.jumpBuffer;
  let airborne = false, peak = start.y;
  for (let i = 0; i < 120; i++) {
    g.GAME.t = 100; g.advance(1 / 60); peak = Math.max(peak, g.P.pos.y);
    if (!g.P.onGround) airborne = true;
    if (airborne && g.P.onGround) return { seconds: round(i / 60), distance: round(Math.hypot(g.P.pos.x - start.x, g.P.pos.z - start.z)), height: round(peak - start.y) };
  }
  return { error: '着地を確認できませんでした' };
}
function ladders(w) {
  const out = [];
  for (const l of w.__game.LADDERS.slice(0, 3)) {
    const origin = { x: l.x + l.nx * .9, y: l.y0, z: l.z + l.nz * .9 };
    const g = setup(w, 'normal', 100); place(g, origin, -l.nx, -l.nz); g.keys.KeyW = true;
    let entered = false, elapsed = null;
    for (let i = 0; i < 720; i++) {
      g.GAME.t = 100; g.advance(1 / 60); entered ||= g.P.state === 'ladder';
      if (entered && g.P.state !== 'ladder' && g.P.pos.y >= l.y1 - .1) { elapsed = i / 60; break; }
    }
    const target = { x: g.P.pos.x, y: g.P.pos.y, z: g.P.pos.z };
    const enemySeconds = elapsed !== null ? arrival(w, origin, target) : null;
    out.push({ rise: round(l.y1 - l.y0), origin, target, playerSeconds: elapsed === null ? null : round(elapsed), enemySeconds, gain: elapsed !== null && enemySeconds !== null ? round(enemySeconds - elapsed) : null });
  }
  return out;
}
function hooks(w) {
  const out = [], g = w.__game, I = w.__skyInternals;
  for (const anchor of g.HOOKS) {
    if (out.length >= 2) break;
    const candidates = g.NAV.nodes.filter(q => anchor[1] - q.y >= 4 && Math.hypot(anchor[0] - q.x, anchor[2] - q.z) > 8 && Math.hypot(anchor[0] - q.x, anchor[1] - q.y - 1.62, anchor[2] - q.z) < 20);
    let attempts = 0;
    for (const q of candidates) {
      const dx = anchor[0] - q.x, dy = anchor[1] - q.y - 1.62, dz = anchor[2] - q.z, distance = Math.hypot(dx, dy, dz);
      if (!I.oe(q.x, q.y + .05, q.z, .35, 1.8) || I.raycast(q.x, q.y + 1.62, q.z, dx / distance, dy / distance, dz / distance, distance - .6)) continue;
      if (++attempts > 16) break;
      setup(w, 'normal', 100); place(g, q, dx / Math.hypot(dx, dz), dz / Math.hypot(dx, dz));
      g.P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); g.cam(.1);
      if (!g.hookTap(w.innerWidth / 2, w.innerHeight / 2, anchor)) continue;
      let entered = false, elapsed = null;
      for (let i = 0; i < 360; i++) {
        g.GAME.t = 100; g.advance(1 / 60); entered ||= g.P.state === 'hook';
        if (entered && g.P.state !== 'hook' && g.P.onGround && g.P.pos.y > q.y + 2) { elapsed = i / 60; break; }
      }
      if (elapsed === null) continue;
      const target = { x: g.P.pos.x, y: g.P.pos.y, z: g.P.pos.z }, origin = { x: q.x, y: q.y, z: q.z };
      const enemySeconds = arrival(w, origin, target);
      out.push({ anchor, origin, target, playerSeconds: round(elapsed), enemySeconds, gain: enemySeconds === null ? null : round(enemySeconds - elapsed) });
      break;
    }
  }
  return out;
}
function surround(w) {
  const g = setup(w, 'expert', 80), samples = [];
  const candidates = g.NAV.nodes.filter(q => g.NAV.out[q.id].length >= 3 && w.__skyInternals.oe(q.x, q.y + .05, q.z, .35, 1.8));
  for (let j = 0; j < Math.min(candidates.length, 48); j++) {
    const q = candidates[Math.floor(j * candidates.length / 48)];
    for (const cooldown of [0, 5]) {
      place(g, q, 1, 0); g.P.hookCD = cooldown; clearEnemies(w);
      const warning = g.warnSqueeze(2, 2);
      samples.push({ node: q.id, cooldown, accepted: !!warning, lead: warning?.lead ?? null });
      g.SCR.warn = null;
    }
  }
  return samples;
}
async function terrain() {
  if (busy) return; busy = true; $('measure').disabled = $('terrain').disabled = true;
  result = { kind: 'actual runtime jump, ladder and hook; single pursuer, Normal late phase; surround uses live game forecast, not human success rate', maps: [] };
  try {
    for (const map of ['index.html', 'canyon.html']) {
      const w = await load(map), q = lane(w), data = { map }; result.maps.push(data);
      $('status').textContent = `${map} ジャンプ`; data.jump = jump(w, q); publish(); await wait(0);
      $('status').textContent = `${map} はしご`; data.ladders = ladders(w); publish(); await wait(0);
      $('status').textContent = `${map} フック`; data.hooks = hooks(w); publish(); await wait(0);
      $('status').textContent = `${map} 包囲予測`; data.surround = surround(w); publish(); await wait(0);
      w.__game.frameOnce(0);
    }
    $('status').textContent = '地形と技の測定完了';
  } catch (e) { result.error = String(e.stack || e); $('status').textContent = '測定エラー'; publish(); }
  finally { busy = false; $('measure').disabled = $('terrain').disabled = false; }
}
$('terrain').addEventListener('click', terrain);
$('forecast').addEventListener('click', async () => {
  if (busy) return; busy = true;
  result = { kind: 'live escape forecast at 48 real nodes, Expert, cooldown 0/5; excludes unusable ladders and repeated hooks', maps: [] }; publish();
  try {
    for (const map of ['index.html', 'canyon.html']) {
      const w = await load(map); $('status').textContent = `${map} 包囲予測`;
      const data = { map, ladderExits: w.__game.NAV.E.filter(e => e.kind === 5).map(e => ({ rise: e.climb, usable: w.__skyInternals.canExitLadder(e.ladder) })), surround: surround(w) };
      result.maps.push(data); publish(); await wait(0);
    }
    $('status').textContent = '包囲予測の測定完了';
  } catch (e) { result.error = String(e.stack || e); $('status').textContent = '測定エラー'; publish(); }
  finally { busy = false; }
});
