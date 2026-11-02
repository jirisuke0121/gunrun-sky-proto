const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const{DatabaseSync}=require('node:sqlite');
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of ['schema.sql','telemetry-schema.sql'])sql.exec(fs.readFileSync('server/'+file,'utf8'));
 const calls=[],DB={prepare(query){let args=[];return{query,bind(...values){args=values;return this},async first(){calls.push({query,args});try{return sql.prepare(query).get(...args)||null}catch(e){console.error(e.message);throw e}},async all(){calls.push({query,args});try{return{results:sql.prepare(query).all(...args)}}catch(e){console.error(e.message);throw e}},async run(){calls.push({query,args});return sql.prepare(query).run(...args)}}},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await (/^\s*(SELECT|WITH)\b/i.test(s.query)?s.all():s.run()));sql.exec('COMMIT');return result}catch(error){sql.exec('ROLLBACK');throw error}}};
 return{sql,DB,calls,env:{DB,ADMIN_TOKEN:'fixture-admin',OWNER_OVERVIEW_TOKEN:'fixture-overview-reader-01234567890'}};
}
const perf={frameCount:600,durationMs:10000,averageFps:60,below30Count:0,maxFrameMs:20,quality:'high',ratio:1.5,nativeRatio:2,width:1200,height:600,viewportWidth:800,viewportHeight:400,shadows:true};
test('player identity joins multiple sessions, de-duplicates recorded finishes, shows specs and private history without replay bodies',async()=>{
 const{default:worker}=await import('../server/worker.js');const{sql,DB,env,calls}=fixture();const player=crypto.randomUUID(),run=crypto.randomUUID(),session=crypto.randomUUID();
 const post=async(path,body)=>{const req=new Request('https://fixture'+path,{method:'POST',body:JSON.stringify(body)});Object.defineProperty(req,'cf',{value:{country:'JP'}});return worker.fetch(req,env)};
 const event=(event,extra={})=>({v:1,id:crypto.randomUUID(),session,player,name:'RUNNER',event,run,build:'fixture',map:'old-town',device:'android',source:'github',difficulty:'normal',environment:{os:'android',cores:8,memoryGb:8,model:'Pixel 8'},...extra});
 for(const kind of ['boot','home','start'])assert.equal((await post('/telemetry',event(kind))).status,200);
 assert.equal((await post('/telemetry',event('finish',{reason:'time',performance:perf}))).status,200);
 const ghost={v:1,map:'old-town',mapVersion:'old-town-beams-20261025',samples:[[0,0,0,0,0,0,0,3,0],[2,1,0,0,0,0,0,3,0]]};
 const record={clientRunId:run,player,name:'RUNNER',at:'2026-11-01T00:00:00Z',t:2,reason:'time',kind:'map',mapKey:'old-town',build:'fixture',source:'github',device:'android',score:{total:20},performance:perf,ghost,diagnostics:{secret:'never-in-owner-list'}};
 assert.equal((await post('/runs',record)).status,200);assert.equal((await post('/runs',record)).status,200);
 const second=crypto.randomUUID();assert.equal((await post('/telemetry',event('home',{session:second,run:null}))).status,200);
 const at=Date.parse('2026-11-01T00:00:00Z');sql.prepare('UPDATE telemetry_events SET received_at=?').run(at);sql.prepare('UPDATE owner_runs SET received_at=?').run(at);sql.prepare('UPDATE telemetry_players SET received_at=?').run(at-86400000);
 const get=path=>worker.fetch(new Request('https://fixture'+path,{headers:{Authorization:'Bearer '+env.OWNER_OVERVIEW_TOKEN}}),env);
 assert.equal((await worker.fetch(new Request('https://fixture/admin/players'),env)).status,401);
 const query='from=2026-11-01&to=2026-11-02';const response=await get('/admin/players?'+query);assert.equal(response.status,200);const data=await response.json();assert.equal(data.players.length,1);const p=data.players[0];
 assert.equal(p.player,player);assert.equal(p.plays,1);assert.equal(p.finishes,1);assert.equal(p.homes,2);assert.equal(p.samples,1);assert.equal(p.averageFps,60);assert.equal(p.country,'JP');assert.equal(p.environment.model,'Pixel 8');assert.equal(p.isNew,false);assert.equal(p.name,'RUNNER');
 assert.ok(!JSON.stringify(data).includes('samples\":['));assert.ok(!JSON.stringify(data).includes('never-in-owner-list'));
 assert.equal((await(await get('/admin/players?'+query+'&q=RUNN')).json()).players.length,1);
 assert.equal((await(await get('/admin/players?'+query+'&completion=unfinished')).json()).players.length,0);
 const detail=await(await get('/admin/player?'+query+'&player='+player)).json();assert.equal(detail.records.length,1);assert.equal(detail.records[0].replay,1);assert.equal(detail.timeline.filter(x=>x.event==='finish').length,1);
 const replay=await(await get('/admin/replay?id='+run)).json();assert.deepEqual(replay.ghost.samples,ghost.samples);assert.ok(!JSON.stringify(replay).includes(player));assert.ok(!JSON.stringify(replay).includes('never-in-owner-list'));
 assert.equal((await get('/runs/'+run)).status,401);assert.equal((await get('/admin/players?from=bad&to=2026-11-02')).status,400);assert.equal((await get('/admin/players?cursor=bad')).status,400);
 const queryCall=calls.find(x=>x.query.includes('combined AS'));const plan=sql.prepare('EXPLAIN QUERY PLAN '+queryCall.query).all(...queryCall.args).map(x=>x.detail);assert.ok(plan.some(x=>x.includes('telemetry_received')));assert.ok(plan.some(x=>x.includes('owner_runs_received')));assert.ok(!plan.some(x=>/^SCAN runs\b/.test(x)));
 sql.close();
});
test('keyset pages are deterministic with ties, record mirror failure rolls back the run, historical backfill is idempotent',async()=>{
 const{default:worker}=await import('../server/worker.js');const{sql,env}=fixture();
 const insert=sql.prepare("INSERT INTO owner_runs(id,player,name,received_at,map,source,device,difficulty,reason,t,score,replay,environment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
 for(let i=0;i<57;i++)insert.run('r'+i,'p'+String(i).padStart(3,'0'),'P'+i,Date.parse('2026-11-01T00:00:00Z'),'old-town','github','desktop','normal','caught',60,i,0,'{}');
 const get=async p=>worker.fetch(new Request('https://fixture'+p,{headers:{Authorization:'Bearer fixture-admin'}}),env);
 const path='/admin/players?from=2026-11-01&to=2026-11-02';const a=await(await get(path)).json(),b=await(await get(path+'&cursor='+encodeURIComponent(a.nextCursor))).json();assert.equal(a.players.length,50);assert.equal(b.players.length,7);assert.equal(new Set([...a.players,...b.players].map(x=>x.player)).size,57);
 sql.exec("CREATE TRIGGER fail_mirror BEFORE INSERT ON owner_runs BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 const body={clientRunId:crypto.randomUUID(),player:'atomic-player',at:new Date().toISOString(),t:2,reason:'caught',score:{total:1},kind:'map'};
 assert.equal((await worker.fetch(new Request('https://fixture/runs',{method:'POST',body:JSON.stringify(body)}),env)).status,500);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM runs WHERE id=?').get(body.clientRunId).n,0);sql.exec('DROP TRIGGER fail_mirror');
 assert.equal((await worker.fetch(new Request('https://fixture/runs',{method:'POST',body:JSON.stringify(body)}),env)).status,200);
 sql.exec(fs.readFileSync('server/player-backfill.sql','utf8'));sql.exec(fs.readFileSync('server/player-backfill.sql','utf8'));assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM owner_runs WHERE id=?').get(body.clientRunId).n,1);sql.close();
});

test('telemetry reuses the existing browser player ID and opt-out / owner replay send nothing',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync('foundation-runtime.js','utf8').replace(/^import .*;\n/gm,'');
 for(const mode of ['normal','off','owner']){
  const id=crypto.randomUUID(),disk=new Map([['gunrun-pid',id],['gunrun-name','RUNNER'],['gunrun-sky-proto-v1',JSON.stringify({sendLog:mode!=='off'})]]),sent=[];
  const context={URLSearchParams,Date,Math,JSON,crypto,location:{hostname:'jirisuke0121.github.io',pathname:'/gunrun-sky-proto/index.html',search:''},navigator:{userAgent:'fixture'},screen:{},devicePixelRatio:1,
   document:{referrer:'',addEventListener(){},hasFocus(){return true}},addEventListener(){},localStorage:{getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)},collectEnvironment:()=>({os:'android',cores:8}),fetch:async(url,options)=>{sent.push(JSON.parse(options.body));return{}},skyOwnerReplay:mode==='owner'};
  context.window=context;vm.runInNewContext(source,context);
  context.skyFoundation.attach({U:{sendLog:mode!=='off'},z:{}},{});
  if(mode==='normal'){assert.equal(sent.length,2);assert.ok(sent.every(x=>x.player===id&&x.name==='RUNNER'));assert.equal(context.skyFoundation.profile().environment.cores,8)}else assert.equal(sent.length,0);
  assert.equal(disk.get('gunrun-pid'),id);
 }
});
