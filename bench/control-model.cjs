// Compares touch control mappings with simulated thumbs instead of scripted input lists.
// A scripted list ("up 45 frames, left 40, up 35") only proves the mapping does what its
// author expects. Here a simple player model watches the picture and pushes the thumb
// toward where the next goal appears on screen, with reaction delay and tremor.
//
//   node bench/control-model.cjs                 -> table for the shipped follow-camera.js
//   FOLLOW_CAMERA_SOURCE=old.js node bench/control-model.cjs
//   node bench/control-model.cjs --search "?cameraTrial=follow-turn"
//
// Players:  pointer  = keeps pointing at the goal's screen direction (0.2 s behind, 7° tremor)
//           holder   = re-aims only every 0.45 s and holds in between (4° tremor)
// Courses:  corner (L corridor, 2.4 m wide) / slalom (roof-to-roof side steps) /
//           uturn (goal straight behind) / straight (20 m; aimErr = heading wobble a jump would inherit) /
//           offset (a 1.5 m wide landing 14° off line: can a small correction be made?)
// Walking off an edge is already prevented in the game (edge-assist.js), so no beam course.
// Flat kinematics only: no terrain, jumps, enemies. It measures the mapping, not the game.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const SOURCE = process.env.FOLLOW_CAMERA_SOURCE || path.join(__dirname, '..', 'follow-camera.js');
const SEARCH = arg('--search', '');
const RUNS = Number(arg('--runs', 200));
const DT = 1 / 60, SPEED = 8;
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));

function fixture() {
  let now = 0;
  const node = () => ({ value: '', textContent: '', dataset: {}, setAttribute() {}, prepend() {}, after() {},
    addEventListener() {}, querySelector() { return this.select ||= node(); } });
  const nodes = new Map();
  const document = { body: { dataset: {} }, hidden: false,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    querySelectorAll() { return []; }, createElement: node, addEventListener() {} };
  const c = { yaw: 0, pitch: 0, state: 'normal', onGround: true, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, eye: 1.6 };
  const inputState = { on: false, id: null, lookId: null, x: 0, y: 0 };
  const game = { c, inputState, keys: {}, z: { over: false }, U: { groundAccel: 40, groundBrake: 32 }, modeRef: () => 'play', demoActive: () => false };
  const window = { __skyInternals: game, addEventListener() {} };
  const location = { search: SEARCH, href: 'https://fixture.test/index.html' + SEARCH };
  vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), { window, document, location, URL, URLSearchParams, Math, Number,
    performance: { now: () => now }, localStorage: { getItem: () => null, setItem() {} },
    history: { state: null, replaceState() {} }, matchMedia: q => ({ matches: q.includes('coarse') }) });
  return { api: window.skyFollowCamera, c, inputState, tick: () => { now += DT * 1000; } };
}

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ s >>> 15, 0x2c1b3c6d) + 0x9e3779b9 | 0, (s ^ s >>> 13) >>> 0) / 4294967296); }
const gauss = r => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

// Each course: goals to reach in order, optional walkable rectangles (leaving them = wall or fall).
const COURSES = {
  corner: { goals: [[0, -8], [-10, -8]], reach: 1.1, floor: [[-1.2, -9.2, 1.2, 0.5], [-11, -9.2, 1.2, -6.8]], wall: true, ideal: 18 },
  slalom: { goals: [[4, -8], [-4, -16], [4, -24], [-4, -32]], reach: 1.2, ideal: 4 * Math.hypot(8, 8) - 4 },
  uturn: { goals: [[0, 10]], reach: 1.2, ideal: 10 },
  straight: { goals: [[0, -20]], reach: 1.0, ideal: 20 },
  offset: { goals: [[3, -12]], reach: .75, ideal: Math.hypot(3, 12) },
};
const inside = (floor, x, z) => floor.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);

function run(courseName, player, seed) {
  const course = COURSES[courseName], f = fixture(), r = rng(seed * 7919 + 13);
  const { api, c, inputState } = f;
  c.yaw = course.startYaw || 0; api.reset();
  let goal = 0, t = 0, length = 0, touching = 0, fell = false, mismatch = 0, moving = 0;
  let tremor = 0, held = 0, nextAim = 0, wobble = 0, frames = 0;
  const delay = [];                       // reaction delay line
  const limit = course.ideal / SPEED * 4 + 2;
  while (t < limit && goal < course.goals.length) {
    const view = api.frame(DT) || c;
    const [gx, gz] = course.goals[goal];
    // Where the goal appears in the picture: 0 = straight up the screen, + = to the right.
    const seen = angle(Math.atan2(gx - c.pos.x, -(gz - c.pos.z)) + view.yaw);
    delay.push(seen);
    const aimed = delay.length > 12 ? delay.shift() : delay[0];
    tremor += (-tremor * 6 + gauss(r) * (player === 'pointer' ? .30 : .17) * Math.sqrt(60)) * DT; // OU noise, sd ~7° / ~4°
    if (player === 'holder') { if (t >= nextAim) { held = aimed; nextAim = t + .45; } }
    const thumb = (player === 'pointer' ? aimed : held) + tremor;
    const x = Math.sin(thumb), fwd = Math.cos(thumb);
    Object.assign(inputState, { on: true, id: 1, x, y: -fwd });
    const out = api.input({ strIn: x, fwdIn: fwd, tmag: 1 });
    api.step(DT, out);
    const v = SPEED * (out.motionScale ?? 1) * (out.reversing ? .275 : 1);
    const dx = (-Math.sin(c.yaw) * out.fwdIn + Math.cos(c.yaw) * out.strIn) * v * DT;
    const dz = (-Math.cos(c.yaw) * out.fwdIn - Math.sin(c.yaw) * out.strIn) * v * DT;
    let nx = c.pos.x + dx, nz = c.pos.z + dz;
    if (course.floor && !inside(course.floor, nx, nz)) {
      if (!course.wall) { fell = true; break; }
      touching += DT;                    // slide along the wall
      if (inside(course.floor, nx, c.pos.z)) nz = c.pos.z; else if (inside(course.floor, c.pos.x, nz)) nx = c.pos.x; else { nx = c.pos.x; nz = c.pos.z; }
    }
    const step = Math.hypot(nx - c.pos.x, nz - c.pos.z);
    if (step > 1e-4) {
      // Does the runner move in the picture the way the thumb points? (>60° apart = "it went the wrong way")
      const shown = angle(Math.atan2(nx - c.pos.x, -(nz - c.pos.z)) + view.yaw);
      moving++; if (Math.abs(angle(shown - thumb)) > Math.PI / 3) mismatch++;
    }
    { const want = Math.atan2(-(gx - c.pos.x), -(gz - c.pos.z)); wobble += angle(c.yaw - want) ** 2; frames++; }
    length += step; c.vel.x = (nx - c.pos.x) / DT; c.vel.z = (nz - c.pos.z) / DT; c.pos.x = nx; c.pos.z = nz;
    if (Math.hypot(gx - nx, gz - nz) < course.reach) goal++;
    t += DT; f.tick();
  }
  return { done: goal >= course.goals.length, fell, time: t, ratio: length / course.ideal, touching, mismatch: moving ? mismatch / moving : 0, aimErr: Math.sqrt(wobble / Math.max(1, frames)) * 180 / Math.PI };
}

const rows = [];
for (const course of Object.keys(COURSES)) for (const player of ['pointer', 'holder']) {
  const results = Array.from({ length: RUNS }, (_, i) => run(course, player, i + 1));
  const done = results.filter(x => x.done), mean = (list, key) => list.length ? list.reduce((a, x) => a + x[key], 0) / list.length : NaN;
  rows.push({ course, player, success: Math.round(done.length / RUNS * 100) + '%', fell: Math.round(results.filter(x => x.fell).length / RUNS * 100) + '%',
    time: mean(done, 'time').toFixed(2), path: mean(done, 'ratio').toFixed(2), wall: mean(results, 'touching').toFixed(2), wrongWay: Math.round(mean(results, 'mismatch') * 100) + '%', aimErr: course === 'straight' ? mean(results, 'aimErr').toFixed(1) + '°' : '' });
}
if (args.includes('--json')) console.log(JSON.stringify({ source: path.basename(SOURCE), search: SEARCH, runs: RUNS, rows }, null, 1));
else { console.log(`source=${path.basename(SOURCE)} search=${SEARCH || '(default)'} runs=${RUNS}`); console.table(rows); }
