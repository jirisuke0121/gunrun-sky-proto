import {telemetryRange} from './telemetry-range.js';

// Only position diagnostics leave this endpoint: no raw JSON, ghosts or device IDs.
export function extractHeatmap(rows) {
  const runs = [], points = [];
  for (const row of rows) {
    let r;
    try { r = typeof row.json === 'string' ? JSON.parse(row.json) : row.json; } catch { continue; }
    if (!r || r.challenge?.id === 'intro' || /-dev$/.test(r.build || '')) continue;
    const map = ['old-town','rock-canyon'].includes(r.mapKey) ? r.mapKey :
      r.map?.id === 'rock_canyon_v1' || r.mapVersion === 'rock-canyon-v1' ? 'rock-canyon' : 'old-town';
    const run = {id:row.id, map, diff:r.challenge?.id || 'legacy', build:String(r.build || 'unknown').slice(0,64),
      device:String(r.device || 'unknown').slice(0,32), at:row.received_at};
    runs.push(run);
    for (const e of Array.isArray(r.mistakes) ? r.mistakes : []) {
      if (!e || !['hit','fall'].includes(e.k) || !Array.isArray(e.at) || e.at.length < 3 ||
          !e.at.slice(0,3).every(n => Number.isFinite(n) && Math.abs(n) <= 10000) || !Number.isFinite(e.t) || e.t < 0 || e.t > 300) continue;
      points.push({run:run.id, map, diff:run.diff, build:run.build, device:run.device, cause:e.k,
        dead:e.life === 0 && ['caught','fell'].includes(r.reason), x:e.at[0], y:e.at[1], z:e.at[2], t:e.t,
        place:String(e.place || '').slice(0,100), state:String(e.state || '').slice(0,32),
        nearest:Number.isFinite(e.nearest)?e.nearest:null, near9:Number.isFinite(e.near9)?e.near9:null,
        life:Number.isFinite(e.life)?e.life:null});
    }
  }
  return {runs,points};
}

export async function ownerHeatmap(env,cors,url) {
  const headers = {...cors,'cache-control':'private, no-store'};
  const range = telemetryRange(url.searchParams), source = url.searchParams.get('source');
  if (!range || (source && !['github','y8','unknown'].includes(source))) return Response.json({error:'bad_filter'},{status:400,headers});
  const conditions = ['received_at>=?','received_at<?',"COALESCE(json_extract(json,'$.challenge.id'),'')!='intro'","build NOT LIKE '%-dev'"];
  const args = [new Date(range.fromMs).toISOString(),new Date(range.toExclusiveMs).toISOString()];
  if (source) { conditions.push("COALESCE(json_extract(json,'$.source'),'unknown')=?"); args.push(source); }
  const result = await env.DB.prepare(`SELECT id,received_at,json FROM runs WHERE ${conditions.join(' AND ')} ORDER BY received_at DESC,id LIMIT 201`).bind(...args).all();
  const data = extractHeatmap(result.results.slice(0,200));
  return Response.json({...data,range,limit:200,truncated:result.results.length>200,generatedAt:new Date().toISOString()}, {headers});
}
