const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const read = name => fs.readFileSync(new URL('../' + name, 'file://' + __filename), 'utf8');

(async () => {
  const { default: worker } = await import('../server/worker.js');
  const db = new DatabaseSync(':memory:'); db.exec(read('server/schema.sql'));
  const DB = { prepare(sql) { let args = []; return {
    bind(...values) { args = values; return this; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return db.prepare(sql).run(...args); },
  }; } };
  let uploads = 0;
  for (const file of ['index.html', 'canyon.html']) {
    const html = read(file), events = [], z = { t: 0, over: false }, record = { on: true, saved: false, count: 0 };
    let placement, audio = 0, mode;
    const env = {
      console, AbortSignal, CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } },
      window: { skyChallenge: { debug: false, begin() { z.challenge = { id: 'normal', version: 'corridor-crowd6-v6' }; } }, skyChallengeScore: { reset() {} }, skyReplay: { start() {} } },
      z, Z: record, on: false, U: { sendLog: true }, RECORD_URL: 'https://fixture.invalid/runs',
      recPid: () => 'fixture-' + file, J: () => ({}), Xd() {}, An: m => { mode = m; }, el() {},
      wh: () => { audio++; }, ho() {}, Nh() {}, ol: at => { placement = at; z.t = 0; z.over = false; },
      document: { dispatchEvent: event => events.push(event) },
      fetch: async (url, options) => { uploads++; return worker.fetch(new Request(url, options), { DB }, {}); },
    };
    vm.createContext(env);
    vm.runInContext(html.slice(html.indexOf('function br('), html.indexOf('function xr(')), env);
    const start = { x: 45, y: 0, z: -13, yaw: Math.PI / 2 };
    env.br(start); assert.equal(audio, 1); assert.equal(mode, 'play');
    assert.equal(z.challenge.version, 'corridor-crowd6-v6');
    if (file === 'index.html') {
      assert.equal(placement, start, 'selected spot enters reset before replay and initial enemies');
      env.fs(); assert.equal(placement, start, 'retry preserves the selected start');
      env.br(); assert.equal(placement, null, 'ordinary Start returns to the default spawn');
    }
    const a = html.indexOf('async function sendRec(a){'), b = html.indexOf('J("recNote").hidden=', a);
    vm.runInContext(html.slice(a, b), env);
    const map = file === 'index.html' ? 'old-town' : 'rock-canyon';
    for (const difficulty of ['easy', 'normal', 'hard', 'expert', 'master', 'ultra']) {
      const run = { t: 120, reason: 'time', kind: 'map', channel: 'production', build: 'ranked-spots-test',
        challenge: { id: difficulty, version: 'corridor-crowd6-v6' }, score: { total: 400 },
        mapVersion: map === 'old-town' ? 'old-town-2026-10-26-side-exits' : 'rock-canyon-v1',
        ghost: { v: 1, map, mapVersion: map === 'old-town' ? 'old-town-beams-20261025' : 'rock-canyon-v1',
          samples: [[0, 45, 0, -13, 0, 0, 0, 3, 0], [120, 45, 0, -13, 0, 0, 1, 3, 0]] } };
      await env.sendRec(run);
      assert.equal(events.at(-1).type, 'sky-run-uploaded');
      const url = `https://fixture.invalid/ranking?map=${map}&rules=corridor-crowd6-v6&me=${run.player}`;
      for (const mode of ['clear', 'score']) {
        const result = await (await worker.fetch(new Request(url + `&mode=${mode}&difficulty=${difficulty}`), { DB }, {})).json();
        assert.equal(result.me.cleared, 1); assert.equal(result.me.difficulty, difficulty);
        assert.equal(result.me.score, 400); assert.equal(result.me.pos, 1);
      }
    }
    const before = uploads;
    env.U.sendLog = false; await env.sendRec({}); assert.match(record.status, /オフ/);
    env.U.sendLog = true; env.window.skyChallenge.debug = true; await env.sendRec({});
    assert.match(record.status, /対象外/); assert.equal(uploads, before, 'opt-out and debug never upload');
    env.window.skyChallenge.debug = false;
    for (const response of [new Response('{}', { status: 400 }), new Response('{"ok":true}')]) {
      env.fetch = async () => response; const previous = events.length;
      await env.sendRec({}); assert.match(record.status, /送信できません/); assert.equal(events.length, previous);
    }
  }
  function element(tag) { return { tag, children: [], dataset: {}, style: {}, setAttribute() {},
    append(...nodes) { this.children.push(...nodes); }, prepend(node) { this.children.unshift(node); }, querySelector() { return this; } }; }
  for (const preview of [false, true]) {
    const root = element('div'), callbacks = {}, starts = [], game = { startGame: at => starts.push(at) }, sky = { z: {} };
    const env = { URLSearchParams, location: { search: preview ? '?oldtown_swing=1' : '' },
      window: { __game: game, __skyInternals: sky }, addEventListener: (type, callback) => { callbacks[type] = callback; },
      document: { createElement: element, getElementById: () => root } };
    vm.runInNewContext(read('old-town-swing.js'), env);
    env.window.buildOldTownSwingCourse({ ne: () => ({}) });
    // Scramble the registry to prove the screen orders by number, not insertion.
    env.window.skyOldTownSwingCourse.routes.reverse(); callbacks.load();
    const card = root.children[0], list = card.children.find(node => node.className === 'parkour-spot-list');
    const numbers = list.children.map(node => Number(node.textContent[0].normalize('NFKC')));
    assert.deepEqual(numbers, [2, 3, 4, 4, 5, 6, 7, 8]);
    assert.equal(list.children[2].dataset.route, 'east');
    assert.equal(list.children[3].dataset.route, 'east-pillar');
    assert.equal(list.style.cssText.includes('grid-template-columns:minmax(0,1fr)'), true);
    for (const button of list.children) {
      assert.equal(button.tag, 'button'); assert.equal(button.href, undefined);
      button.onclick(); const route = env.window.skyOldTownSwingCourse.routes.find(route => route.id === button.dataset.route);
      assert.deepEqual([starts.at(-1).x, starts.at(-1).y, starts.at(-1).z], Array.from(route.approach));
    }
    assert.equal(sky.z.safeT, preview ? 5 : undefined, 'normal spot starts get no practice protection');
  }
  db.close();
  console.log('PASS ranked spot starts/audio, ordered menu, retry/default spawn, all 6 difficulties in both map rankings, upload acknowledgement/errors and opt-out');
})().catch(error => { console.error(error); process.exitCode = 1; });
