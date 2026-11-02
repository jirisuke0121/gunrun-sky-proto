import {telemetryRange} from './telemetry-range.js';
import {replayFromRecord} from '../replay-data.js';
const reply=(data,status,cors)=>Response.json(data,{status,headers:{...cors,'cache-control':'private, no-store'}});
const validId=value=>typeof value==='string' && /^[\w.-]{1,64}$/.test(value);
const cursor=value=>{try{const o=JSON.parse(atob(value));return Number.isSafeInteger(o.at)&&validId(o.id)?o:null}catch{return null}};
const encode=o=>btoa(JSON.stringify(o));
function scope(url,range,player=null){
 const conditions=['at>=?','at<?'],args=[range.fromMs,range.toExclusiveMs];
 const source=url.searchParams.get('source');
 if(source){if(!['github','y8','unknown'].includes(source))return null;conditions.push('source=?');args.push(source)}
 if(player){conditions.push('player=?');args.push(player)}
 return{sql:conditions.join(' AND '),args};
}
function playerQuery(DB,url,range,player=null){
 const selected=scope(url,range,player);if(!selected)return null;
 const q=url.searchParams.get('q')||'',completion=url.searchParams.get('completion')||'all';
 if(q.length>64||!['all','finished','unfinished'].includes(completion))return null;
 const conditions=['1'],args=[...selected.args];
 if(q){conditions.push('(instr(upper(COALESCE(name,\'\')),upper(?))>0 OR instr(upper(player),upper(?))>0)');args.push(q,q)}
 if(completion==='finished')conditions.push('finishes>0');
 if(completion==='unfinished')conditions.push('plays>0 AND finishes=0');
 if(!player&&url.searchParams.has('cursor')){const c=cursor(url.searchParams.get('cursor'));if(!c)return null;conditions.push('(lastAt<? OR (lastAt=? AND player>?))');args.push(c.at,c.at,c.id)}
 return DB.prepare(`WITH a AS MATERIALIZED (SELECT * FROM owner_activity WHERE ${selected.sql}),
 stats AS (SELECT player,MIN(at) AS periodFirstAt,MAX(at) AS lastAt,
 COUNT(DISTINCT date(at/1000+32400,'unixepoch')) AS activeDays,
 COUNT(DISTINCT CASE WHEN event='home' THEN session END) AS homes,
 COUNT(DISTINCT CASE WHEN event='start' OR kind='record' THEN run END) AS plays,
 COUNT(DISTINCT CASE WHEN event='finish' AND reason!='quit' THEN run END) AS finishes,
 COUNT(DISTINCT CASE WHEN event='finish' AND reason='quit' THEN run END) AS quits,
 COUNT(DISTINCT CASE WHEN event='retry' THEN run END) AS retries,
 SUM(event='error') AS errors,COUNT(DISTINCT CASE WHEN kind='record' THEN run END) AS savedRuns,
 MAX(score) AS bestScore,group_concat(DISTINCT source) AS sources FROM a GROUP BY player),
 latest AS (SELECT *,row_number() OVER(PARTITION BY player ORDER BY at DESC,kind DESC,id DESC) AS rn FROM a),
 measured AS (SELECT *,row_number() OVER(PARTITION BY player,run ORDER BY kind DESC,at DESC,id DESC) AS rn
 FROM a WHERE event='finish' AND performance IS NOT NULL AND run IS NOT NULL),
 fps AS (SELECT player,COUNT(*) AS samples,AVG(json_extract(performance,'$.averageFps')) AS averageFps FROM measured WHERE rn=1 GROUP BY player),
 last_measured AS (SELECT player,performance,row_number() OVER(PARTITION BY player ORDER BY at DESC) AS pos FROM measured WHERE rn=1),
 known_device AS (SELECT player,device,row_number() OVER(PARTITION BY player ORDER BY at DESC) AS pos FROM a WHERE device!='unknown'),
 combined AS (SELECT s.*,COALESCE(NULLIF(p.name,''),l.name) AS name,l.event AS lastEvent,l.reason AS lastReason,l.map,l.difficulty,
 COALESCE(d.device,'unknown') AS device,
 COALESCE(v.country,l.country) AS country,COALESCE(NULLIF(v.environment,'{}'),l.environment) AS environment,
 COALESCE(f.samples,0) AS samples,f.averageFps,
 lm.performance,
 (SELECT MIN(at) FROM (SELECT MIN(received_at) AS at FROM owner_runs WHERE player=s.player
 UNION ALL SELECT MIN(received_at) FROM telemetry_players WHERE player=s.player)) AS firstAt
 FROM stats s JOIN latest l ON l.player=s.player AND l.rn=1 LEFT JOIN fps f ON f.player=s.player LEFT JOIN last_measured lm ON lm.player=s.player AND lm.pos=1 LEFT JOIN known_device d ON d.player=s.player AND d.pos=1
 LEFT JOIN telemetry_players p ON p.session=(SELECT session FROM telemetry_players WHERE player=s.player ORDER BY received_at DESC,session LIMIT 1)
 LEFT JOIN telemetry_environments v ON v.session=p.session)
 SELECT * FROM combined WHERE ${conditions.join(' AND ')} ORDER BY lastAt DESC,player LIMIT ${player?'1':'51'}`).bind(...args);
}
const normalize=(r,range)=>({...r,environment:JSON.parse(r.environment||'{}'),performance:r.performance?JSON.parse(r.performance):null,isNew:r.firstAt>=range.fromMs});
export async function ownerPlayers(env,cors,url,detail=false){
 const range=telemetryRange(url.searchParams);if(!range)return reply({error:'bad_date_range'},400,cors);
 const player=detail?url.searchParams.get('player'):null;
 if(detail&&!validId(player))return reply({error:'bad_player'},400,cors);
 const query=playerQuery(env.DB,url,range,player);if(!query)return reply({error:'bad_filter'},400,cors);
 if(!detail){const result=await query.all(),rows=result.results,more=rows.length>50,players=rows.slice(0,50).map(r=>normalize(r,range));
  return reply({range,players,nextCursor:more?encode({at:players.at(-1).lastAt,id:players.at(-1).player}):null,
   note:'同じブラウザの匿名IDで集計します。端末変更・保存データ削除では別IDになります。初回は最初に受信した記録、終了通知の欠測は離脱確定ではありません。'},200,cors)}
 const selected=scope(url,range,player),args=[player,range.fromMs,range.toExclusiveMs],where=['player=?','received_at>=?','received_at<?'];
 if(url.searchParams.get('source')){where.push('source=?');args.push(url.searchParams.get('source'))}
 if(url.searchParams.has('cursor')){const c=cursor(url.searchParams.get('cursor'));if(!c)return reply({error:'bad_cursor'},400,cors);where.push('(received_at<? OR (received_at=? AND id>?))');args.push(c.at,c.at,c.id)}
 const [card,records,timeline]=await env.DB.batch([query,
  env.DB.prepare(`SELECT id,name,received_at AS receivedAt,played_at AS playedAt,map,difficulty,source,device,reason,t,score,replay,performance FROM owner_runs WHERE ${where.join(' AND ')} ORDER BY received_at DESC,id LIMIT 51`).bind(...args),
  env.DB.prepare(`WITH a AS (SELECT *,row_number() OVER(PARTITION BY COALESCE(run,id),event ORDER BY at DESC,kind DESC) AS rn FROM owner_activity WHERE ${selected.sql}) SELECT at,event,reason,error,map,difficulty,run FROM a WHERE rn=1 ORDER BY at DESC,id DESC LIMIT 100`).bind(...selected.args)]);
 if(!card.results.length)return reply({error:'not_found'},404,cors);
 const rows=records.results.slice(0,50).map(r=>({...r,performance:r.performance?JSON.parse(r.performance):null}));
 return reply({range,player:normalize(card.results[0],range),records:rows,timeline:timeline.results,
  recordsCursor:records.results.length>50?encode({at:rows.at(-1).receivedAt,id:rows.at(-1).id}):null,timelineLimit:100},200,cors);
}
export async function ownerReplay(env,cors,url){
 const id=url.searchParams.get('id');if(!validId(id))return reply({error:'bad_id'},400,cors);
 const row=await env.DB.prepare('SELECT r.json,r.score,r.played_at AS playedAt,r.received_at AS receivedAt FROM owner_runs o JOIN runs r ON r.id=o.id WHERE o.id=?').bind(id).first();
 if(!row)return reply({error:'not_found'},404,cors);
 const record=JSON.parse(row.json),ghost=replayFromRecord(record);
 if(!ghost)return reply({error:'unavailable'},404,cors);
 return reply({ghost,name:record.name||null,tag:'プレイヤー',score:row.score,playedAt:row.playedAt||row.receivedAt},200,cors);
}
