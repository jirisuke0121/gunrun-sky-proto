// The ranking shows a player's newest nickname, even when it was chosen after the best run was sent.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const rules = require('../ranked-rules.js');
const survival = require('../survival-score.js');

(async () => {
  const { default: worker } = await import('../server/worker.js');
  const db = new DatabaseSync(':memory:'); db.exec(fs.readFileSync('server/schema.sql', 'utf8'));
  const DB = { prepare(query) { let args = []; return { bind(...a) { args = a; return this; }, async run() { return db.prepare(query).run(...args); }, async first() { return db.prepare(query).get(...args) || null; }, async all() { return { results: db.prepare(query).all(...args) }; } }; } };
  DB.batch = async statements => { db.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const fetcher = (url, options) => worker.fetch(new Request(url, options), { DB }, {});
  const scope = `map=old-town&rules=${rules.version}&mode=score&difficulty=all`;
  const make = (player, id, damageUnits, extra = {}) => {
    const d = ['easy', 'normal', 'hard'].indexOf(id), score = survival.evaluate(120, 0, d, { damageUnits, gunShots: 1 });
    return { clientRunId: crypto.randomUUID(), player, at: new Date().toISOString(), t: 120, reason: 'time', kind: 'map', channel: 'production', build: 'ranking-name-fixture', mapKey: 'old-town',
      challenge: { id, version: rules.version, rankingScope: 'all', fixedSettings: { ...rules.settings } }, score, stars: 0, stats: { shots: 1 }, ...extra };
  };
  const post = async a => { const r = await fetcher('https://fixture/runs', { method: 'POST', body: JSON.stringify(a) }); assert.equal(r.status, 200); return r.json(); };
  const top = async () => (await (await fetcher(`https://fixture/ranking?${scope}`)).json()).top;

  await post(make('device-a', 'hard', 40));            // best run, sent before a name existed
  await post(make('device-b', 'normal', 20, { name: 'runner_b' }));
  let rows = await top();
  assert.equal(rows.find(r => r.tag === 'devi' && r.score === rows[0].score).name, null, 'no name yet');
  await post(make('device-a', 'easy', 1, { name: 'late_name' })); // a worse run, but it carries the new name
  rows = await top();
  const a = rows.find(r => r.tag === 'devi' && r.name === 'LATE_NAME'), b = rows.find(r => r.name === 'RUNNER_B');
  assert.ok(a && b, 'both players are listed');
  assert.equal(rows.filter(r => r.name === 'LATE_NAME').length, 1, 'one row per device');
  assert.ok(a.score > b.score, "device-a's best run is still the one ranked");
  await post(make('device-a', 'easy', 1, { name: 'newer-name' }));
  rows = await top();
  assert.ok(rows.some(r => r.name === 'NEWER-NAME') && !rows.some(r => r.name === 'LATE_NAME'), 'the newest name wins');
  console.log('PASS ranking shows the newest nickname of the device');
})().catch(e => { console.error(e); process.exit(1); });
