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
frame.skyOldTownSwingCourse = {bars:[{at:[24,8.4,1.5],direction:[1,0],width:2.6}]};
frame.__skyInternals = { raycast: () => null };

const noop = () => {};
const ctx = new Proxy({}, { get: (o, k) => o[k] ?? noop });
function element() {
  const handlers = new Map();
  return { handlers, style: {}, value: '', classList: { toggle: noop, remove: noop }, firstChild: {}, options: ['1,0','-1,0','0,1','0,-1'].map(value => ({value})),
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
    clearTimeout: token => timers.delete(token), Blob, URL, crypto: require('node:crypto').webcrypto });
  vm.runInContext(read('hook-editor.js'), context);
  return { context, get, run: code => vm.runInContext(code, context),
    flush() { for (const [key, fn] of [...timers]) { timers.delete(key); fn(); } }, docListeners };
}
const editor = makeEditor();
const { get, run } = editor;

async function main() {
  assert.deepEqual(plain(run('wallJumps')), defaults, 'editor reads five published locations');
  assert.deepEqual(plain(run('bars')), [[24,8.4,1.5,1,0,2.6]], 'editor reads published bars');
  assert.equal(writes, 0, 'opening the editor does not overwrite saved work');
  const live = () => plain({hooks:game.skyHookEditor.current(),walls:game.skyWallJumpEditor.current(),bars:frame.skyOldTownSwingCourse.bars});
  const baseline = live();
  const unchanged = () => assert.deepEqual(live(),baseline,'draft operations must not change gameplay');
  const draftKey = run('DRAFT_KEY');

  run('selected=0'); get('x').value='3'; get('x').handlers.get('change')();
  assert.equal(run('layout[0][0]'),3,'draft preview changes immediately');
  unchanged();
  for(const value of [4,5,6]) {get('x').value=String(value);get('x').handlers.get('change')();}
  editor.flush();
  assert.equal(writes,1,'rapid edits save only the final draft');
  assert.equal(JSON.parse(storage.get(draftKey)).points.hook[0][0],6);
  assert.equal(get('save').disabled,true);
  const second=makeEditor();
  assert.equal(second.run('layout[0][0]'),6,'reopened editor retains draft');
  get('remove').onclick();editor.flush();
  assert.equal(second.run('layout.length'),1,'other editor follows draft changes');
  get('reset').onclick();editor.flush();
  assert.equal(second.run('layout.length'),2,'reset restores draft baseline');
  unchanged();
  assert.equal(canyon.skyHookEditor.current()[0][0],1);
  assert.equal(practiceHooks.skyHookEditor.current()[0][0],1);

  get('wallJumpMode').onclick();run('selectedWallJump=0');
  get('x').value='32';get('x').handlers.get('change')();editor.flush();
  assert.equal(second.run('wallJumps[0][0]'),32,'wall draft synchronizes between editors');
  assert.equal(frame.skyWallRunGuides.routes[0].at[0],26);
  const player=x=>({r:.34,pos:{x,y:1.9,z:-.78}});
  assert.equal(game.__skyCanWallJumpAtSpot(player(32),()=>walls[0],{x:0,z:1}),false);
  assert.equal(game.__skyCanWallJumpAtSpot(player(26),()=>walls[0],{x:0,z:1}),true);
  get('remove').onclick();editor.flush();
  assert.equal(frame.skyWallRunGuides.root.children.length,10);
  assert.equal(game.__skyCanWallRunOnFace(walls[0],{x:0,z:1}),true);
  get('reset').onclick();editor.flush();
  assert.deepEqual(plain(run('wallJumps')),defaults);
  run("wallJumps.push([55,2,0,-1,0]);draft.ids.walljump.push('walljump-added');changed()");editor.flush();
  assert.equal(game.__skyCanWallRunOnFace(extraWall,{x:-1,z:0}),false);
  assert.equal(game.__skyCanWallRunOnFace(extraWall,{x:1,z:0}),false);
  unchanged();

  get('barMode').onclick();run('selectedBar=0');
  get('y').value='9';get('y').handlers.get('change')();
  get('pointNote').value='roof approach';get('pointNote').handlers.get('input')();editor.flush();
  const text=get('requestText').value;
  assert.match(text,/鉄棒 移動・調整/);assert.match(text,/Y 8.4/);assert.match(text,/Y 9/);assert.match(text,/roof approach/);
  let clipboard='';editor.context.navigator={clipboard:{writeText:async value=>{clipboard=value;}}};
  await get('copyRequest').onclick();assert.equal(clipboard,text);
  unchanged();

  get('hookMode').onclick();run('selected=0');denyWrites=true;
  get('x').value='10';get('x').handlers.get('change')();editor.flush();
  assert.equal(run('dirty.hook'),true);assert.equal(get('save').disabled,false);
  assert.match(get('status').textContent,/保存できません/);unchanged();
  denyWrites=false;get('save').onclick();assert.equal(run('dirty.hook'),false);
  get('x').value='11';get('x').handlers.get('change')();
  editor.context.dispatchEvent({type:'pagehide'});
  assert.equal(JSON.parse(storage.get(draftKey)).points.hook[0][0],11);
  assert.equal(makeEditor().run('layout[0][0]'),11,'reload preserves the draft only');
  unchanged();

  get('importFile').files=[{text:async()=>JSON.stringify({format:'gunrun-old-town-walljumps-v1',map:'old-town',wallJumps:[{at:[55,2,1],normal:[-1,0]}]})}];
  await get('importFile').onchange();
  assert.deepEqual(plain(run('wallJumps')),[[55,2,1,-1,0]]);
  get('importFile').files=[{text:async()=>JSON.stringify({format:'gunrun-old-town-walljumps-v1',map:'old-town',wallJumps:[{at:[900,2,900],normal:[-1,0]}]})}];
  await get('importFile').onchange();
  assert.deepEqual(plain(run('wallJumps')),[[55,2,1,-1,0]],'invalid imported coordinates preserve the draft');
  unchanged();
  run("draft.sourceVersion='previous';flushSave()");
  const previous=storage.get(draftKey);
  get('newDraft').onclick();
  assert.equal(storage.get(draftKey+'-previous'),previous,'starting fresh backs up old work');
  assert.equal(run('draft.sourceVersion'),run('SOURCE_VERSION'));
  get('restoreDraft').onclick();assert.equal(storage.get(draftKey),previous);
  editor.context.dispatchEvent({type:'storage',key:draftKey,newValue:'{bad json'});
  assert.equal(storage.get(draftKey),previous);
  unchanged();

  const practice=makeTab();installWalls(practice);practice.skyPracticeMode=true;
  practice.skyPracticeCourse={wallSpots:[{at:[55,2,0],normal:[-1,0]}]};
  practice.skySwingCourse={wall:{at:[0,0,0],normal:[0,1]}};
  const practiceRoutes=[{name:'practice'}];practice.__skyWallRunRoutes=practiceRoutes;
  game.skyWallJumpEditor.reset();
  assert.equal(practice.__skyWallRunRoutes,practiceRoutes);
  assert.equal(practice.__skyCanWallRunOnFace(extraWall,{x:-1,z:0}),true);
  console.log('PASS draft autosave: hooks/walls/bars, debounce, cross-editor drafts, copy, reload, delete/reset/import, denied storage/retry, version backup/restore, published route and game isolation');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
