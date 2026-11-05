const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createController, KEY } = require('../hook-tutorial.js');

function fixture(options = {}) {
  let mode = 'play', intro = true, time = 0, unlocked = 0;
  const memory = new Map(), anchor = [8, 6, -8], other = [0, 7, -10];
  const game = { c: { pos: { x: 0, y: 0, z: 0 }, state: 'normal', onGround: true, hookCD: 0, hookPressed: true, jumpBuf: .2 },
    z: { t: 5, over: false, challenge: {} }, keys: { KeyW: true }, inputState: { on: true, x: 1, y: 1 }, Et: { held: true },
    us: [anchor, other], fallY: -22, modeRef: () => mode, demoActive: () => false };
  let available = { anchor }, visible;
  const tutorial = createController({ game, intro: () => intro, candidate: () => available,
    storage: { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) }, map: 'old-town', now: () => time,
    releasePointer: () => unlocked++, show: value => { visible = value; }, ...options });
  return { game, tutorial, anchor, other, memory, setIntro: v => intro = v, setMode: v => mode = v, setTime: v => time = v,
    available: v => available = v, get unlocked() { return unlocked; }, get visible() { return visible; } };
}

// Teach availability at a real, visible map anchor, never merely by time elapsed.
let f = fixture(); f.available(null); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
f.available({ anchor: f.anchor }); f.game.c.onGround = false; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle', 'do not interrupt a jump');
f.game.c.onGround = true; f.game.c.hookCD = 1; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle', 'do not teach an unavailable hook');
f.game.c.hookCD = 0; f.tutorial.beforeFrame();
assert.equal(f.tutorial.phase, 'explain'); assert.equal(f.unlocked, 1); assert.ok(f.tutorial.worldPaused && f.tutorial.freezePlayer);
assert.equal(f.tutorial.acceptsHook, false); assert.equal(f.game.keys.KeyW, false); assert.equal(f.game.inputState.on, false);
assert.equal(f.game.c.hookPressed, false); assert.equal(f.game.Et.held, false); assert.equal(f.memory.has(KEY), false);
// Other pause overlays can open and close without losing progress or keeping a frozen world.
f.setMode('pause'); f.tutorial.beforeFrame(); assert.equal(f.visible.visible, false); assert.equal(f.tutorial.worldPaused, false);
f.setMode('play'); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'explain');
f.tutorial.tryAction(); assert.ok(f.tutorial.acceptsHook && f.tutorial.freezePlayer);
assert.equal(f.game.c.state, 'normal', 'Try does not fake a hook, teleport or add movement');
f.game.c.state = 'hook'; f.game.c.hook = f.anchor; f.game.c.onGround = false; f.tutorial.afterFrame(.016);
assert.equal(f.tutorial.phase, 'flight'); assert.ok(f.tutorial.worldPaused); assert.equal(f.tutorial.freezePlayer, false, 'native player physics resume without a second button');
f.game.c.state = 'normal'; f.game.c.pos = { x: 8, y: 5.3, z: -8 }; f.game.c.onGround = true; f.tutorial.afterFrame(.016);
assert.equal(f.tutorial.phase, 'success'); assert.equal(f.tutorial.worldPaused, false); assert.equal(JSON.parse(f.memory.get(KEY))['old-town'], true);
f.setTime(3000); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle'); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle', 'learned action does not interrupt again');
f.game.z.challenge = {}; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle', 'completion survives a retry');

// Normal ranked runs never pause, even when explicitly replaying the tutorial.
f = fixture({ forced: true }); f.setIntro(false); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
f.setIntro(true); f.tutorial.beforeFrame(); f.tutorial.skip(); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
assert.equal(f.memory.has(KEY), false, 'skipping does not record successful learning');
f.game.z.challenge = {}; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'explain', 'skipped guide may be tried in a later intro run');
// A landing back at the start, an interrupted hook, or a rescue does not count.
f.tutorial.tryAction(); f.game.c.state = 'hook'; f.game.c.hook = f.anchor; f.tutorial.afterFrame(.02);
f.game.c.state = 'normal'; f.tutorial.afterFrame(.02); assert.equal(f.tutorial.phase, 'idle'); assert.equal(f.memory.has(KEY), false);
f.game.z.t += 4; f.tutorial.beforeFrame(); f.tutorial.tryAction(); f.game.c.state = 'hook'; f.game.c.hook = [99, 99, 99];
f.tutorial.afterFrame(.02); assert.equal(f.tutorial.phase, 'idle'); assert.equal(f.memory.has(KEY), false);
f = fixture(); f.tutorial.beforeFrame(); f.tutorial.tryAction(); f.game.c.state = 'hook'; f.game.c.hook = f.anchor; f.game.c.onGround = false; f.tutorial.afterFrame(.02);
f.game.c.pos.y = -23; f.tutorial.afterFrame(.02); assert.equal(f.tutorial.worldPaused, false, 'a failed hook must release normal fall/respawn processing');
f = fixture({ disabled: true }); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
f = fixture({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'explain', 'blocked storage does not break play');

// Execute each map's actual simulation dispatcher. Frozen instruction frames
// cannot advance enemies/time; Q still reaches the original launch handler.
for (const path of ['index.html', 'canyon.html']) {
  const html = fs.readFileSync(path, 'utf8');
  const da = html.slice(html.indexOf('function Da(n){'), html.indexOf('function xp(n){'));
  const wv = html.slice(html.indexOf('function wv(n){'), html.indexOf('function Nd(n,t){'));
  const calls = [];
  const tutorial = { beforeFrame() { calls.push('before'); }, afterFrame() { calls.push('after'); }, freezePlayer: true, acceptsHook: false, worldPaused: true };
  const c = { pos: {}, vel: { x: 0, y: 0, z: 0 }, state: 'normal', onGround: true, yaw: 0, hookPressed: true, hookPick: [1, 2, 3] };
  const sandbox = { window: { skyHookTutorial: tutorial }, ie: 'play', z: { over: false }, Oe: {}, c, on: false,
    gd() { calls.push('player'); }, dv() { calls.push('world'); }, cv() {}, W_(anchor) { calls.push(['native hook', anchor]); c.state = 'hook'; }, Math };
  vm.createContext(sandbox); vm.runInContext(da + wv, sandbox);
  sandbox.Da(.016); assert.deepEqual(calls, ['before', 'after'], path + ': explain freezes both simulation paths');
  calls.length = 0; tutorial.acceptsHook = true; sandbox.Da(.016);
  assert.deepEqual(calls, ['before', ['native hook', [1, 2, 3]], 'after']); assert.equal(c.hookPressed, false);
  calls.length = 0; tutorial.freezePlayer = false; sandbox.Da(.016);
  assert.ok(calls.includes('player')); assert.ok(!calls.includes('world'), path + ': native hook physics move the player with enemies frozen');
  assert.ok(html.includes('!window.skyHookTutorial?.active&&An("pause")'), 'opening the guide must not open settings via pointer unlock');
}
console.log('PASS contextual hook: availability, safe pause, native launch, automatic flight, landing, retries, ranked isolation, pointer unlock and both simulation dispatchers');
