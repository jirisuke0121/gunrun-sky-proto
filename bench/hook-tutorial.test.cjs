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

// The first usable anchor immediately pauses and accepts the native action.
let f = fixture(); f.available(null); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
f.available({ anchor: f.anchor }); f.game.c.onGround = false; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle', 'do not interrupt a jump');
f.game.c.onGround = true; f.game.c.hookCD = 1; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle', 'do not teach an unavailable hook');
f.game.c.hookCD = 0; f.tutorial.beforeFrame();
assert.equal(f.tutorial.phase, 'action'); assert.equal(f.unlocked, 1); assert.ok(f.tutorial.worldPaused && f.tutorial.freezePlayer && f.tutorial.acceptsHook);
assert.equal(typeof f.tutorial.tryAction, 'undefined', 'there is no confirmation step');
assert.equal(f.game.keys.KeyW, false); assert.equal(f.game.inputState.on, false);
assert.equal(f.game.c.hookPressed, false); assert.equal(f.game.Et.held, false); assert.equal(f.memory.has(KEY), false);
// Merely pressing or an invalid launch does not report success.
f.game.c.hookPressed = true; f.tutorial.afterFrame(.016);
assert.equal(f.tutorial.phase, 'action'); assert.equal(f.memory.has(KEY), false);
f.game.c.hookPressed = false;
// Settings may interrupt the guide without losing it or leaving a hidden freeze.
f.setMode('pause'); f.tutorial.beforeFrame(); assert.equal(f.visible.visible, false); assert.equal(f.tutorial.worldPaused, false);
f.setMode('play'); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'action'); assert.ok(f.tutorial.acceptsHook);
// A native attachment immediately completes the guide and resumes the world,
// while the player is still hooked in midair, without waiting for a landing.
f.game.c.state = 'hook'; f.game.c.hook = f.anchor; f.game.c.onGround = false; f.tutorial.afterFrame(.016);
assert.equal(f.tutorial.phase, 'success'); assert.equal(f.tutorial.worldPaused, false); assert.equal(f.tutorial.freezePlayer, false);
assert.equal(f.game.c.state, 'hook', 'success preserves native automatic movement');
assert.equal(JSON.parse(f.memory.get(KEY))['old-town'], true);
f.setTime(3000); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
f.game.c.state = 'normal'; f.game.c.onGround = true; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle', 'learned action does not interrupt again');
f.game.z.challenge = {}; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle', 'completion survives a retry');
// Ranked runs never pause; closing a guide does not save successful learning.
f = fixture({ forced: true }); f.setIntro(false); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
f.setIntro(true); f.tutorial.beforeFrame(); f.tutorial.skip(); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
assert.equal(f.memory.has(KEY), false);
f.game.z.challenge = {}; f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'action', 'a later intro can show a closed guide again');
// Rescue uses a temporary anchor, not the highlighted map action.
f.game.c.state = 'hook'; f.game.c.hook = [99, 99, 99]; f.tutorial.afterFrame(.02);
assert.equal(f.tutorial.phase, 'idle'); assert.equal(f.memory.has(KEY), false); assert.equal(f.tutorial.worldPaused, false);
f = fixture({ disabled: true }); f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'idle');
f = fixture({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
f.tutorial.beforeFrame(); assert.equal(f.tutorial.phase, 'action', 'blocked storage does not break play');
f.game.c.state = 'hook'; f.game.c.hook = f.anchor; f.tutorial.afterFrame(.016); assert.equal(f.tutorial.phase, 'success');

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
  assert.ok(html.includes('!window.skyHookTutorial?.active&&!window.skyContextTutorial?.active&&An("pause")'), 'opening the guide must not open settings via pointer unlock');
}
console.log('PASS direct hook guide: immediately actionable, failed presses, native attachment success, immediate resume, retry/persistence, ranked isolation and both simulation dispatchers');
