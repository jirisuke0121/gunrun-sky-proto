const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');

(async () => {
  const { validateGhost, replayFromRecord, sampleReplay } = await import('../replay-data.js');
  const { formatReplayTime } = await import('../replay-time.js');
  assert.equal(formatReplayTime('2026-10-25T17:23:45Z'), '2026/10/26 02:23');
  assert.equal(formatReplayTime('2026-10-25T15:00:00Z'), '2026/10/26 00:00');
  assert.equal(formatReplayTime(null), '日時不明');
  assert.equal(formatReplayTime('bad'), '日時不明');
  const { default: worker } = await import('../server/worker.js');
  const samples = [[0, 0, 0, 0, 3.1, 0, 0, 3, 0], [1, 4, 0, 0, -3.1, 0.5, 7, 3, 0], [2, 30, 5, 0, 0, 0, 1, 2, 1]];
  const ghost = { v: 1, map: 'old-town', mapVersion: 'old-town-beams-20261025', samples };
  assert.ok(validateGhost(ghost, 'old-town', 2));
  assert.equal(validateGhost(ghost, 'rock-canyon', 2), null);
  assert.equal(validateGhost({ ...ghost, mapVersion: 'old-map' }, 'old-town', 2), null);
  assert.equal(validateGhost({ ...ghost, samples: [samples[0], samples[0]] }, 'old-town', 2), null);
  assert.equal(validateGhost({ ...ghost, samples: [samples[0], [1, NaN, 0, 0, 0, 0, 0, 3, 0]] }, 'old-town', 2), null);
  assert.equal(validateGhost(ghost, 'old-town', 1), null);
  assert.equal(sampleReplay(samples, 0.5)[1], 2);
  assert.ok(Math.abs(Math.abs(sampleReplay(samples, 0.5)[4]) - Math.PI) < 0.001);
  assert.equal(sampleReplay(samples, 1.9)[1], 4, 'respawn must not draw a path through walls');
  assert.equal(sampleReplay(samples, 2)[1], 30, 'snap at the recorded respawn timestamp');
  assert.equal(sampleReplay(samples, 100)[1], 30);
  const legacy = { t: 2, mapVersion: 'old-town-2026-10-24a', trail: [[0, 0, 0, 0, 0], [1, 2, 0, 0, 1], [2, 3, 0, 0, 0]] };
  assert.equal(replayFromRecord(legacy).source, 'legacy-trail');
  assert.equal(replayFromRecord({ ...legacy, trail: [[0, 0, 0, 0, 0], [0, 1, 0, 0, 0]] }), null);

  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../server/schema.sql', 'file://' + __filename), 'utf8'));
  const DB = { prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return sqlite.prepare(sql).run(...args); } };
  } };
  const add = (id, player, score, data, reason = 'caught', build = 'release') => {
    sqlite.prepare('INSERT INTO runs(id,received_at,player,reason,score,t,build,json) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, '2026-10-26T00:00:00Z', player, reason, score, data.t, build, JSON.stringify(data));
  };
  add('old-low', 'person-secret-1', 10, { ...legacy, ghost, input: 'touch', settings: { private: true } });
  add('old-high', 'person-secret-1', 20, { ...legacy, ghost, input: 'touch', settings: { private: true } });
  add('legacy', 'second-secret-2', 15, legacy);
  add('no-path', 'third-secret-3', 5, { t: 2 });
  add('canyon', 'person-secret-1', 100, { ...legacy, mapVersion: 'rock-canyon-v1' });
  add('dev', 'dev-secret', 999, { ...legacy, channel: 'dev' });
  add('quit', 'quit-secret', 999, legacy, 'quit');
  sqlite.prepare('UPDATE runs SET played_at = ? WHERE id = ?').run('2026-10-25T17:23:45Z', 'old-high');
  sqlite.prepare('UPDATE runs SET played_at = ? WHERE id = ?').run('bad-date', 'legacy');
  const request = path => worker.fetch(new Request('https://local.invalid' + path), { DB }, {});
  let response = await request('/ranking?map=old-town&me=person-secret-1');
  let data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.total, 3);
  assert.equal(data.me.score, 20);
  assert.equal(data.top[0].replayId, 'old-high');
  assert.equal(data.top[0].playedAt, '2026-10-25T17:23:45.000Z');
  assert.equal(data.me.playedAt, data.top[0].playedAt);
  assert.equal(data.top[1].playedAt, '2026-10-26T00:00:00.000Z', 'invalid or absent played time falls back to received time');
  assert.equal(data.top[2].replayId, null);
  data = await (await request('/ranking?map=rock-canyon')).json();
  assert.equal(data.total, 1);
  assert.equal(data.top[0].score, 100);
  response = await request('/ghosts/old-high?map=old-town');
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.score, 20);
  assert.equal(data.playedAt, '2026-10-25T17:23:45.000Z');
  assert.equal(data.ghost.source, 'recorded');
  assert.deepEqual(Object.keys(data).sort(), ['ghost', 'playedAt', 'score', 'tag']);
  assert.ok(!JSON.stringify(data).includes('person-secret'));
  assert.equal((await request('/ghosts/old-low?map=old-town')).status, 404, 'only the exact ranking run is public');
  assert.equal((await request('/ghosts/old-high?map=rock-canyon')).status, 404);
  assert.equal((await request('/ghosts/no-path')).status, 404);
  assert.equal((await request('/runs/old-high')).status, 401, 'diagnostics stay private');
  assert.equal((await request('/ranking?map=bad')).status, 400);
  assert.equal((await (await request('/ghosts/legacy')).json()).ghost.source, 'legacy-trail');
  const invalid = await worker.fetch(new Request('https://local.invalid/runs', { method: 'POST', body: JSON.stringify({ t: 2, reason: 'caught', ghost: { ...ghost, map: 'rock-canyon' } }) }), { DB }, {});
  assert.equal(invalid.status, 400);
  const upload = await worker.fetch(new Request('https://local.invalid/runs', { method: 'POST', body: JSON.stringify({ t: 2, reason: 'caught', player: 'new-player', at: '2026-10-26T02:05:00Z', kind: 'map', channel: 'production', score: { total: 30 }, ghost }) }), { DB }, {});
  assert.equal(upload.status, 200);
  const uploaded = await upload.json();
  data = await (await request('/ranking')).json();
  assert.equal(data.top[0].replayId, uploaded.id);
  assert.equal(data.top[0].playedAt, '2026-10-26T02:05:00.000Z');
  data = await (await request('/ghosts/' + uploaded.id)).json();
  assert.equal(data.score, 30);
  assert.deepEqual(data.ghost.samples, samples, 'uploaded samples match the selected ranking replay');
  sqlite.close();
  console.log('PASS ranked ghosts: interpolation, respawn cuts, legacy path, exact run, map isolation, private diagnostics, invalid upload');
})().catch(error => { console.error(error); process.exitCode = 1; });
