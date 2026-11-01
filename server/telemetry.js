const EVENTS = new Set(['boot', 'home', 'start', 'finish', 'retry', 'error']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUALITIES = new Set(['auto', 'performance', 'balanced', 'high']);
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const response = (value, status, cors) => Response.json(value, { status, headers: { ...cors, 'cache-control': 'private, no-store' } });
export function validateTelemetry(a) {
  if (!a || a.v !== 1 || !UUID.test(a.id) || !UUID.test(a.session) || !EVENTS.has(a.event)
    || typeof a.build !== 'string' || !/^[\w.-]{1,64}$/.test(a.build)
    || !['old-town', 'rock-canyon'].includes(a.map) || !['desktop', 'iphone', 'ipad', 'android'].includes(a.device)
    || !['github', 'y8', 'unknown'].includes(a.source)
    || !['easy', 'normal', 'hard', 'expert', 'master', 'ultra', 'legacy', 'unknown'].includes(a.difficulty)) return null;
  if (a.run != null && !UUID.test(a.run)) return null;
  if (['start', 'finish', 'retry'].includes(a.event) && !UUID.test(a.run)) return null;
  if (a.event === 'finish' && !['time', 'caught', 'fell', 'quit'].includes(a.reason)) return null;
  if (a.event === 'error' && !['javascript', 'resource', 'promise'].includes(a.error)) return null;
  let performance = null;
  const p = a.performance;
  if (p != null) {
    if (a.event !== 'finish' || !Number.isInteger(p.frameCount) || !number(p.frameCount, 2, 500000)
      || !Number.isInteger(p.below30Count) || !number(p.below30Count, 0, p.frameCount)
      || !number(p.durationMs, 100, 600000) || !number(p.averageFps, .1, 1000)
      || Math.abs(p.frameCount * 1000 / p.durationMs - p.averageFps) > 2
      || !number(p.maxFrameMs, 0, 1000) || !QUALITIES.has(p.quality)
      || !number(p.ratio, .25, 2) || !number(p.nativeRatio, .5, 8)
      || ![p.width, p.height, p.viewportWidth, p.viewportHeight].every(n => Number.isInteger(n) && number(n, 1, 20000))) return null;
    performance = Object.fromEntries(['frameCount', 'durationMs', 'averageFps', 'below30Count', 'maxFrameMs', 'quality', 'ratio', 'nativeRatio', 'width', 'height', 'viewportWidth', 'viewportHeight'].map(key => [key, p[key]]));
  }
  return { id: a.id, session: a.session, event: a.event, build: a.build, map: a.map, source: a.source,
    device: a.device, difficulty: a.difficulty, run: a.run ?? null,
    reason: a.event === 'finish' ? a.reason : null, error: a.event === 'error' ? a.error : null, performance };
}

export async function receiveTelemetry(req, env, cors, origin, allowed) {
  if (allowed.length && origin && !allowed.includes(origin)) return response({ error: 'origin' }, 403, cors);
  if (Number(req.headers.get('content-length')) > 16384) return response({ error: 'too_large' }, 413, cors);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 16384) return response({ error: 'too_large' }, 413, cors);
  let data; try { data = validateTelemetry(JSON.parse(text)); } catch {}
  if (!data) return response({ error: 'bad_telemetry' }, 400, cors);
  const old = await env.DB.prepare('SELECT id FROM telemetry_events WHERE id = ?').bind(data.id).first();
  if (old) return response({ ok: true }, 200, cors);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM telemetry_events WHERE session = ? AND received_at >= ?')
    .bind(data.session, Date.now() - 60000).first();
  if (recent.n >= 40) return response({ error: 'rate_limited' }, 429, cors);
  await env.DB.prepare(`INSERT OR IGNORE INTO telemetry_events
    (id,received_at,session,event,build,map,source,device,difficulty,run,reason,error,performance)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(data.id, Date.now(), data.session, data.event, data.build,
    data.map, data.source, data.device, data.difficulty, data.run, data.reason, data.error,
    data.performance ? JSON.stringify(data.performance) : null).run();
  return response({ ok: true }, 200, cors);
}

export async function telemetryOverview(env, cors, url) {
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days')) || 7));
  const filters = [], args = [Date.now() - days * 86400000];
  for (const key of ['build', 'map', 'device', 'source', 'difficulty']) {
    const value = url.searchParams.get(key);
    if (value) { if (value.length > 64) return response({ error: 'bad_filter' }, 400, cors); filters.push(`${key} = ?`); args.push(value); }
  }
  const quality = url.searchParams.get('quality');
  if (quality) { if (!QUALITIES.has(quality)) return response({ error: 'bad_filter' }, 400, cors); filters.push("json_extract(performance,'$.quality') = ?"); args.push(quality); }
  const where = `received_at >= ?${filters.length ? ' AND ' + filters.join(' AND ') : ''}`;
  const [summary, performance, errors, options] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT session) AS sessions,
      COUNT(DISTINCT CASE WHEN event = 'boot' THEN session END) AS boots,
      COUNT(DISTINCT CASE WHEN event = 'home' THEN session END) AS homes,
      COUNT(DISTINCT CASE WHEN event = 'start' THEN run END) AS starts,
      COUNT(DISTINCT CASE WHEN event = 'finish' AND reason != 'quit' THEN run END) AS finishes,
      COUNT(DISTINCT CASE WHEN event = 'finish' AND reason = 'quit' THEN run END) AS quits,
      COUNT(DISTINCT CASE WHEN event = 'retry' THEN run END) AS retries,
      SUM(CASE WHEN event = 'error' THEN 1 ELSE 0 END) AS errors
      FROM telemetry_events WHERE ${where}`).bind(...args).first(),
    env.DB.prepare(`SELECT build,map,source,device,difficulty,
      json_extract(performance,'$.quality') AS quality,
      json_extract(performance,'$.ratio') AS ratio,
      json_extract(performance,'$.width') AS width, json_extract(performance,'$.height') AS height,
      COUNT(*) AS samples, AVG(json_extract(performance,'$.averageFps')) AS averageFps,
      SUM(json_extract(performance,'$.below30Count')) * 1.0 / SUM(json_extract(performance,'$.frameCount')) AS below30Ratio,
      SUM(CASE WHEN reason = 'quit' THEN 1 ELSE 0 END) AS interrupted
      FROM telemetry_events WHERE ${where} AND event = 'finish' AND performance IS NOT NULL
      GROUP BY build,map,source,device,difficulty,quality,ratio,width,height ORDER BY samples DESC LIMIT 201`).bind(...args).all(),
    env.DB.prepare(`SELECT build,map,device,error,COUNT(*) AS count FROM telemetry_events
      WHERE ${where} AND event = 'error' GROUP BY build,map,device,error ORDER BY count DESC LIMIT 101`).bind(...args).all(),
    env.DB.prepare('SELECT DISTINCT build FROM telemetry_events WHERE received_at >= ? ORDER BY build LIMIT 101').bind(args[0]).all(),
  ]);
  return response({ days, generatedAt: new Date().toISOString(), summary, performance: performance.results.slice(0, 200),
    errors: errors.results.slice(0, 100), builds: options.results.slice(0, 100).map(r => r.build),
    truncated: performance.results.length > 200 || errors.results.length > 100 || options.results.length > 100,
    note: '記録送信がオンで受信できた計測のみ。セッション数は人数ではありません。描画設定の絞り込み時はFPS計測のある終了イベントだけが対象です。' }, 200, cors);
}
