const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(name, 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const storage = new Map(), tabs = [];
let denyWrites = false, writes = 0;

function makeTab() {
  const listeners = new Map();
  const context = vm.createContext({ console, Event, Math, Number, JSON, Set, Map });
  vm.runInContext('window=globalThis', context);
  context.addEventListener = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  };
  context.dispatchEvent = event => { for (const fn of listeners.get(event.type) || []) fn(event); };
  context.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) {
      if (denyWrites) throw Error('Storage denied');
      const oldValue = storage.get(key) ?? null;
      storage.set(key, value); writes++;
      if (oldValue !== value) for (const tab of tabs) if (tab !== context)
        tab.dispatchEvent({ type: 'storage', key, oldValue, newValue: value });
    },
    removeItem(key) {
      if (denyWrites) throw Error('Storage denied');
      const oldValue = storage.get(key) ?? null; storage.delete(key);
      if (oldValue !== null) for (const tab of tabs) if (tab !== context)
        tab.dispatchEvent({ type: 'storage', key, oldValue, newValue: null });
    },
  };
  tabs.push(context);
  return context;
}

function installHooks(context) {
  context.us = [[1, 4, 2], [5, 8, 6]];
  context.anchors = context.us.map(() => ({ position: { set(...v) { this.value = v; } } }));
  context.ue = { children: [], remove() {} };
  context.makeAnchor = (x, y, z) => context.anchors.push({ position: { value: [x, y, z], set(...v) { this.value = v; } } });
  const code = read('enhancements.js');
  const start = code.indexOf('const HOOK_LAYOUT_KEY');
  vm.runInContext(code.slice(start, code.indexOf('for (const ladder of mo)', start)), context);
}

function installWalls(context) { vm.runInContext(read('wall-jump-spots.js'), context); }
const frame = makeTab(), game = makeTab();
for (const tab of [frame, game]) { installHooks(tab); installWalls(tab); }
const canyon = makeTab(); canyon.skySwingCourse = {}; installHooks(canyon);
const practiceHooks = makeTab(); practiceHooks.skyPracticeMode = true; installHooks(practiceHooks);
assert.notEqual(canyon.skyHookEditor.key, game.skyHookEditor.key);
assert.notEqual(practiceHooks.skyHookEditor.key, game.skyHookEditor.key);
const defaults = plain(game.skyWallJumpEditor.defaults());
const walls = defaults.map(([x, , z, nx, nz]) => ({ type: 'mono', minY: 0, maxY: 7,
  minX: nx ? x - (nx > 0 ? 2 : 0) : x - 8, maxX: nx ? x + (nx < 0 ? 2 : 0) : x + 8,
  minZ: nz ? z - (nz > 0 ? 2 : 0) : z - 8, maxZ: nz ? z + (nz < 0 ? 2 : 0) : z + 8,
}));
const extraWall = { type: 'mono', minX: 55, maxX: 57, minY: 0, maxY: 7, minZ: -8, maxZ: 8 };
walls.push(extraWall);
frame.__game = { solids: walls, S: { hookRange: 24 } };
frame.__skyInternals = { raycast: () => null };

const noop = () => {};
const ctx = new Proxy({}, { get: (o, k) => o[k] ?? noop });
function element() {
  const handlers = new Map();
  return { handlers, style: {}, value: '', classList: { toggle: noop, remove: noop }, firstChild: {},
    setAttribute: noop, replaceChildren: noop, append: noop, appendChild: noop, getContext: () => ctx,
    clientWidth: 1000, clientHeight: 700,
    addEventListener(name, fn) { handlers.set(name, fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: noop };
}
// Execute the real guide module against a small scene to check that registry
// design changes leave the published five routes and their markers intact.
class Group {
  constructor() { this.children = []; }
  add(child) { this.children.push(child); }
  remove(child) { this.children = this.children.filter(item => item !== child); }
  clear() { this.children.length = 0; }
}
class Mesh {
  constructor() { this.rotation = {}; this.position = { set(...v) { this.value = v; } }; }
}
Object.assign(frame.__skyInternals, { c: {}, z: {}, ue: new Group(), Se: {}, modeRef: () => 'menu',
  Geom: { Group, Mesh, BufferGeometry: class { setAttribute() {} dispose() {} }, Float32Attribute: class {},
    Basic: class {}, CanvasTexture: class {}, Vector3: class {} } });
frame.document = { createElement: element, head: { appendChild: noop }, getElementById: element };
frame.requestAnimationFrame = noop;
vm.runInContext(read('wallrun-guides.js'), frame);

function makeEditor() {
  const context = makeTab(), elements = new Map(), timers = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  Object.assign(get('source'), { contentWindow: frame, contentDocument: { readyState: 'complete' } });
  const docListeners = new Map();
  context.document = { getElementById: get, createElement: element, hidden: false,
    addEventListener: (name, fn) => docListeners.set(name, fn) };
  Object.assign(context, { devicePixelRatio: 1, ResizeObserver: class { observe() {} },
    setTimeout(fn) { const token = {}; timers.set(token, fn); return token; },
    clearTimeout: token => timers.delete(token), Blob, URL });
  vm.runInContext(read('hook-editor.js'), context);
  return { context, get, run: code => vm.runInContext(code, context),
    flush() { for (const [key, fn] of [...timers]) { timers.delete(key); fn(); } }, docListeners };
}
const editor = makeEditor();
const { get, run } = editor;

async function main() {
  assert.deepEqual(plain(run('wallJumps')), defaults, 'editor initially reads all five live standard locations');
  assert.equal(writes, 0, 'opening the editor does not overwrite a saved layout');

  run('selected=0'); get('x').value = '3'; get('x').handlers.get('change')();
  assert.equal(frame.skyHookEditor.current()[0][0], 3, 'preview updates immediately');
  assert.equal(game.skyHookEditor.current()[0][0], 1, 'other tabs await the debounced save');
  for (const value of [4, 5, 6]) { get('x').value = String(value); get('x').handlers.get('change')(); }
  editor.flush();
  assert.equal(writes, 1, 'drag/rapid edits persist only the last configuration');
  assert.equal(game.skyHookEditor.current()[0][0], 6, 'open game receives the new hook without reload');
  assert.equal(canyon.skyHookEditor.current()[0][0], 1, 'old-town auto-save cannot replace canyon hooks');
  assert.equal(practiceHooks.skyHookEditor.current()[0][0], 1, 'practice hooks stay independent');
  assert.equal(get('save').disabled, true);
  const second = makeEditor();
  assert.equal(second.run('layout[0][0]'), 6, 'another editor opens on the live layout');

  get('remove').onclick(); editor.flush();
  assert.equal(game.skyHookEditor.current().length, 1, 'deletions auto-save too');
  assert.equal(second.run('layout.length'), 1, 'an already open editor follows changes in another tab');
  get('reset').onclick();
  assert.equal(game.skyHookEditor.current().length, 2, 'reset restores the actual standard configuration');
  assert.equal(storage.has(game.skyHookEditor.key), false);

  get('wallJumpMode').onclick(); run('selectedWallJump=0'); get('x').value = '32'; get('x').handlers.get('change')();
  editor.flush();
  assert.equal(game.skyWallJumpEditor.current()[0][0], 32, 'wall-jump designs are saved across tabs');
  assert.equal(frame.skyWallRunGuides.routes[0].at[0], 26, 'published paint stays at the original take-off');
  const player = x => ({ r: .34, pos: { x, y: 1.9, z: -1.5 + .72 } });
  assert.equal(game.__skyCanWallJumpAtSpot(player(32), () => walls[0], { x: 0, z: 1 }), false);
  assert.equal(game.__skyCanWallJumpAtSpot(player(26), () => walls[0], { x: 0, z: 1 }), true, 'original take-off remains active after moving a design');
  get('remove').onclick(); editor.flush();
  assert.equal(frame.skyWallRunGuides.root.children.length, 10, 'deleting a design keeps all five published markers');
  assert.equal(game.__skyCanWallRunOnFace(walls[0], { x: 0, z: 1 }), true, 'deleting a design keeps the published wall permission');
  get('reset').onclick();
  assert.deepEqual(plain(game.skyWallJumpEditor.current()), defaults);

  run('wallJumps.push([55,2,0,-1,0]);markWallJumpDirty()'); editor.flush();
  assert.equal(frame.skyWallRunGuides.root.children.length, 10, 'adding a design leaves the published route markers intact');
  assert.equal(game.__skyCanWallRunOnFace(extraWall, { x: -1, z: 0 }), false, 'design additions do not replace published wall permissions');
  assert.equal(game.__skyCanWallRunOnFace(extraWall, { x: 1, z: 0 }), false, 'opposite face remains disallowed');

  get('hookMode').onclick(); run('selected=0'); denyWrites = true;
  get('x').value = '10'; get('x').handlers.get('change')(); editor.flush();
  assert.equal(run('dirty.hook'), true);
  assert.equal(get('save').disabled, false, 'failed auto-save stays retryable');
  assert.equal(game.skyHookEditor.current()[0][0], 1, 'failed writes do not change another open game');
  assert.match(get('status').textContent, /自動保存できません/);
  denyWrites = false; get('save').onclick();
  assert.equal(game.skyHookEditor.current()[0][0], 10);
  assert.equal(run('dirty.hook'), false);

  get('x').value = '11'; get('x').handlers.get('change')();
  editor.context.dispatchEvent({ type: 'pagehide' });
  assert.equal(game.skyHookEditor.current()[0][0], 11, 'leaving the page flushes pending edits');
  const reloadedGame = makeTab(); installHooks(reloadedGame); installWalls(reloadedGame);
  assert.equal(reloadedGame.skyHookEditor.current()[0][0], 11);
  assert.equal(reloadedGame.skyWallJumpEditor.current().length, 6, 'a reloaded editor keeps its saved design');

  get('wallJumpMode').onclick();
  get('importFile').files = [{ text: async () => JSON.stringify({ format: 'gunrun-old-town-walljumps-v1', map: 'old-town',
    wallJumps: [{ at: [55, 2, 1], normal: [-1, 0] }] }) }];
  await get('importFile').onchange(); editor.flush();
  assert.deepEqual(plain(game.skyWallJumpEditor.current()), [[55, 2, 1, -1, 0]], 'imported configuration is applied and saved');
  get('importFile').files = [{ text: async () => JSON.stringify({ format: 'gunrun-old-town-walljumps-v1', map: 'old-town',
    wallJumps: [{ at: [90, 2, 90], normal: [-1, 0] }] }) }];
  await get('importFile').onchange(); editor.flush();
  assert.deepEqual(plain(game.skyWallJumpEditor.current()), [[55, 2, 1, -1, 0]], 'off-wall JSON cannot replace the live layout');

  const before = plain(game.skyWallJumpEditor.current());
  assert.equal(game.skyWallJumpEditor.apply([[0, 0, 0, 1, 1]], true), false);
  assert.deepEqual(plain(game.skyWallJumpEditor.current()), before);
  game.dispatchEvent({ type: 'storage', key: game.skyWallJumpEditor.key, newValue: '{bad json' });
  assert.deepEqual(plain(game.skyWallJumpEditor.current()), before, 'corrupt updates retain the last working layout');

  const practice = makeTab(); installWalls(practice);
  practice.skyPracticeMode = true;
  practice.skyPracticeCourse = { wallSpots: [{ at: [55, 2, 0], normal: [-1, 0] }] };
  practice.skySwingCourse = { wall: { at: [0, 0, 0], normal: [0, 1] } };
  const practiceRoutes = [{ name: 'practice' }]; practice.__skyWallRunRoutes = practiceRoutes;
  game.skyWallJumpEditor.reset();
  assert.equal(practice.__skyWallRunRoutes, practiceRoutes, 'old-town synchronization leaves practice route guides alone');
  assert.equal(practice.__skyCanWallRunOnFace(extraWall, { x: -1, z: 0 }), true, 'practice permissions stay independent');
  console.log('PASS editor autosave: live hooks, saved wall-jump designs, stable published routes, debounce, delete/reset/import, reload, page exit, denied storage/retry, invalid data and practice isolation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
