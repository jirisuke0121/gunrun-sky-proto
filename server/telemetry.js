import { telemetryRange } from './telemetry-range.js';
const EVENTS = new Set(['boot', 'home', 'start', 'finish', 'retry', 'error']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUALITIES = new Set(['auto', 'performance', 'balanced', 'high', 'minimum']);
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const response = (value, status, cors) => Response.json(value, { status, headers: { ...cors, 'cache-control': 'private, no-store' } });
export function validateEnvironment(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [key, options] of Object.entries({os:['ios','android','windows','macos','linux'],browser:['safari','chrome','firefox','edge','samsung']})) {
    if (value[key] != null) { if (!options.includes(value[key])) return null; out[key] = value[key]; }
  }
  for (const key of ['osVersion','browserVersion']) if (value[key] != null) {
    if (typeof value[key] !== 'string' || !/^\d{1,4}(?:\.\d{1,4}){0,2}$/.test(value[key])) return null;
    out[key] = value[key];
  }
  if (value.model != null) {
    if (typeof value.model !== 'string' || value.model.length > 64 || /[\u0000-\u001f\u007f]/.test(value.model)) return null;
    if (value.model.trim()) out.model = value.model.trim();
  }
  for (const [key,min,max,integer] of [['cores',1,256,true],['memoryGb',.25,64,false],['screenWidth',1,20000,true],['screenHeight',1,20000,true],['nativeRatio',.5,8,false]]) {
    if (value[key] != null) { if (!number(value[key],min,max) || (integer && !Number.isInteger(value[key]))) return null; out[key] = value[key]; }
  }
  return out;
}
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
  const environment = validateEnvironment(a.environment);
  if (!environment) return null;
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
    if (p.shadows != null) { if (typeof p.shadows !== 'boolean') return null; performance.shadows = p.shadows; }
  }
  return { id: a.id, session: a.session, event: a.event, build: a.build, map: a.map, source: a.source,
    device: a.device, difficulty: a.difficulty, run: a.run ?? null,
    reason: a.event === 'finish' ? a.reason : null, error: a.event === 'error' ? a.error : null, performance, environment };
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
  // Geo belongs to the game's incoming request, never to the admin proxy.
  const rawCountry = req.cf?.country;
  const country = typeof rawCountry === 'string' && /^[A-Z]{2}$/.test(rawCountry) && rawCountry !== 'XX' ? rawCountry : null;
  await env.DB.prepare(`INSERT INTO telemetry_environments(session,received_at,country,environment) VALUES(?,?,?,?)
    ON CONFLICT(session) DO UPDATE SET country=COALESCE(telemetry_environments.country,excluded.country),
    environment=json_patch(telemetry_environments.environment,excluded.environment)`)
    .bind(data.session, Date.now(), country, JSON.stringify(data.environment)).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO telemetry_events
    (id,received_at,session,event,build,map,source,device,difficulty,run,reason,error,performance)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(data.id, Date.now(), data.session, data.event, data.build,
    data.map, data.source, data.device, data.difficulty, data.run, data.reason, data.error,
    data.performance ? JSON.stringify(data.performance) : null).run();
  return response({ ok: true }, 200, cors);
}

export async function telemetryOverview(env, cors, url) {
  const range = telemetryRange(url.searchParams);
  if (!range) return response({error:'bad_date_range'},400,cors);
  const timeWhere = 'e.received_at >= ? AND e.received_at < ?';
  const filters = [], timeArgs = [range.fromMs,range.toExclusiveMs], args = [...timeArgs];
  const from = 'FROM telemetry_events e LEFT JOIN telemetry_environments v ON v.session=e.session';
  for (const key of ['build', 'map', 'device', 'source', 'difficulty']) {
    const value = url.searchParams.get(key);
    if (value) { if (value.length > 64) return response({ error: 'bad_filter' }, 400, cors); filters.push(`e.${key} = ?`); args.push(value); }
  }
  for (const key of ['country','os','browser','cores','memoryGb','model']) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    if (value.length > 64) return response({error:'bad_filter'},400,cors);
    const expr = key === 'country' ? 'v.country' : `json_extract(v.environment,'$.${key}')`;
    filters.push(`COALESCE(CAST(${expr} AS TEXT),'unknown') = ?`); args.push(value);
  }
  const quality = url.searchParams.get('quality');
  if (quality) { if (!QUALITIES.has(quality)) return response({ error: 'bad_filter' }, 400, cors); filters.push("json_extract(performance,'$.quality') = ?"); args.push(quality); }
  const where = `${timeWhere}${filters.length ? ' AND ' + filters.join(' AND ') : ''}`;
  const [summary, performance, errors, options, countries, environments, environmentOptions] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT e.session) AS sessions,
      COUNT(DISTINCT CASE WHEN event = 'boot' THEN e.session END) AS boots,
      COUNT(DISTINCT CASE WHEN event = 'home' THEN e.session END) AS homes,
      COUNT(DISTINCT CASE WHEN event = 'start' THEN run END) AS starts,
      COUNT(DISTINCT CASE WHEN event = 'finish' AND reason != 'quit' THEN run END) AS finishes,
      COUNT(DISTINCT CASE WHEN event = 'finish' AND reason = 'quit' THEN run END) AS quits,
      COUNT(DISTINCT CASE WHEN event = 'retry' THEN run END) AS retries,
      SUM(CASE WHEN event = 'error' THEN 1 ELSE 0 END) AS errors
      ${from} WHERE ${where}`).bind(...args).first(),
    env.DB.prepare(`SELECT build,map,source,device,difficulty,
      json_extract(performance,'$.quality') AS quality,
      json_extract(performance,'$.ratio') AS ratio,
      json_extract(performance,'$.width') AS width, json_extract(performance,'$.height') AS height,
      json_extract(performance,'$.shadows') AS shadows,
      COUNT(*) AS samples, AVG(json_extract(performance,'$.averageFps')) AS averageFps,
      SUM(json_extract(performance,'$.below30Count')) * 1.0 / SUM(json_extract(performance,'$.frameCount')) AS below30Ratio,
      SUM(CASE WHEN reason = 'quit' THEN 1 ELSE 0 END) AS interrupted
      ${from} WHERE ${where} AND event = 'finish' AND performance IS NOT NULL
      GROUP BY build,map,source,device,difficulty,quality,ratio,width,height,shadows ORDER BY samples DESC LIMIT 201`).bind(...args).all(),
    env.DB.prepare(`SELECT build,map,device,error,COUNT(*) AS count ${from}
      WHERE ${where} AND event = 'error' GROUP BY build,map,device,error ORDER BY count DESC LIMIT 101`).bind(...args).all(),
    env.DB.prepare(`SELECT DISTINCT e.build ${from} WHERE ${timeWhere} ORDER BY build LIMIT 101`).bind(...timeArgs).all(),
    env.DB.prepare(`SELECT v.country,COUNT(DISTINCT e.session) AS sessions,
      COUNT(DISTINCT CASE WHEN event='start' THEN run END) AS starts,
      COUNT(DISTINCT CASE WHEN event='finish' AND reason!='quit' THEN run END) AS finishes,
      SUM(CASE WHEN event='finish' AND performance IS NOT NULL THEN 1 ELSE 0 END) AS samples,
      AVG(CASE WHEN event='finish' THEN json_extract(performance,'$.averageFps') END) AS averageFps
      ${from} WHERE ${where} GROUP BY v.country ORDER BY sessions DESC LIMIT 101`).bind(...args).all(),
    env.DB.prepare(`SELECT v.country,e.device,
      json_extract(v.environment,'$.os') AS os,json_extract(v.environment,'$.osVersion') AS osVersion,
      json_extract(v.environment,'$.browser') AS browser,json_extract(v.environment,'$.browserVersion') AS browserVersion,
      json_extract(v.environment,'$.model') AS model,json_extract(v.environment,'$.cores') AS cores,
      json_extract(v.environment,'$.memoryGb') AS memoryGb,json_extract(v.environment,'$.screenWidth') AS screenWidth,
      json_extract(v.environment,'$.screenHeight') AS screenHeight,json_extract(v.environment,'$.nativeRatio') AS nativeRatio,
      COUNT(DISTINCT e.session) AS sessions,
      SUM(CASE WHEN event='finish' AND performance IS NOT NULL THEN 1 ELSE 0 END) AS samples,
      AVG(CASE WHEN event='finish' THEN json_extract(performance,'$.averageFps') END) AS averageFps
      ${from} WHERE ${where}
      GROUP BY country,device,os,osVersion,browser,browserVersion,model,cores,memoryGb,screenWidth,screenHeight,nativeRatio
      ORDER BY sessions DESC LIMIT 201`).bind(...args).all(),
    env.DB.prepare(`SELECT DISTINCT v.country,
      json_extract(v.environment,'$.os') AS os,json_extract(v.environment,'$.browser') AS browser,
      json_extract(v.environment,'$.cores') AS cores,json_extract(v.environment,'$.memoryGb') AS memoryGb,
      json_extract(v.environment,'$.model') AS model ${from} WHERE ${timeWhere} ORDER BY country LIMIT 301`).bind(...timeArgs).all(),
  ]);
  return response({ days:range.days ?? null, range, generatedAt: new Date().toISOString(), summary, performance: performance.results.slice(0, 200),
    errors: errors.results.slice(0, 100), builds: options.results.slice(0, 100).map(r => r.build),
    countries:countries.results.slice(0,100), environments:environments.results.slice(0,200),
    environmentOptions:environmentOptions.results.slice(0,300),
    truncated: performance.results.length > 200 || errors.results.length > 100 || options.results.length > 100 || countries.results.length > 100 || environments.results.length > 200 || environmentOptions.results.length > 300,
    note: '日本時間・受信日時でイベントを集計。記録送信がオンで受信できた計測のみ。セッション数は人数ではありません。国・端末の未取得値は不明。CPUは利用可能な論理コア数、RAMは概算です。描画条件の絞り込みはFPS計測のある終了だけが対象です。' }, 200, cors);
}
