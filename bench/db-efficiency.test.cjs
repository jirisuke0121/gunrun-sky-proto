const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
function database(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(fs.readFileSync('server/schema.sql','utf8'));sql.exec(fs.readFileSync('server/telemetry-schema.sql','utf8'));
 const calls=[],writes=[],batches=[];
 const DB={prepare(query){let args=[];const stmt={query,bind(...values){args=values;return this},async first(){calls.push({query,args});return sql.prepare(query).get(...args)||null},async all(){calls.push({query,args});return{results:sql.prepare(query).all(...args)}},async run(){const result=sql.prepare(query).run(...args);writes.push({query,changes:Number(result.changes)});return result}};return stmt},async batch(statements){batches.push(statements.length);sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await (/^\s*(SELECT|WITH)\b/i.test(statement.query)?statement.all():statement.run()));sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}};
 return{sql,DB,calls,writes,batches};
}
test('unchanged profiles do not rewrite, later hints merge, duplicate events and failed batches stay safe',async()=>{
 const {default:worker}=await import('../server/worker.js');const {sql,DB,writes}=database();
 const session=crypto.randomUUID();
 const event=()=>({v:1,id:crypto.randomUUID(),session,event:'boot',build:'fixture',map:'old-town',source:'github',device:'android',difficulty:'normal',environment:{os:'android',cores:8}});
 const post=async(body,country)=>{const req=new Request('https://fixture/telemetry',{method:'POST',body:JSON.stringify(body)});if(country)Object.defineProperty(req,'cf',{value:{country}});return worker.fetch(req,{DB})};
 assert.equal((await post(event(),'JP')).status,200);
 const second=event();assert.equal((await post(second,'US')).status,200);
 assert.deepEqual(writes.filter(x=>x.query.includes('telemetry_environments')).map(x=>x.changes),[1,0]);
 const before=writes.length;assert.equal((await post(second,'JP')).status,200);assert.equal(writes.length,before);
 assert.equal((await post({...event(),environment:{model:'Pixel 8'}},'US')).status,200);
 const profile=sql.prepare('SELECT * FROM telemetry_environments WHERE session=?').get(session);
 assert.equal(profile.country,'JP');assert.deepEqual(JSON.parse(profile.environment),{os:'android',cores:8,model:'Pixel 8'});
 const unknown=crypto.randomUUID();assert.equal((await post({...event(),session:unknown,environment:undefined})).status,200);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM telemetry_environments WHERE session=?').get(unknown).n,0);
 const failed=crypto.randomUUID();sql.exec("CREATE TRIGGER fail_event BEFORE INSERT ON telemetry_events WHEN NEW.build='fail' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 assert.equal((await post({...event(),session:failed,build:'fail'},'JP')).status,500);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM telemetry_environments WHERE session=?').get(failed).n,0);
 sql.close();
});
test('overview batches all panels, with indexed dates and primary-key environment joins',async()=>{
 const {default:worker}=await import('../server/worker.js');const{sql,DB,calls,batches}=database();
 const response=await worker.fetch(new Request('https://fixture/admin/overview?from=2026-11-01&to=2026-11-02',{headers:{Authorization:'Bearer test'}}),{DB,ADMIN_TOKEN:'test'});
 assert.equal(response.status,200);assert.deepEqual(batches,[7]);assert.equal(calls.length,7);const data=await response.json();assert.equal(data.summary.sessions,0);assert.deepEqual(data.performance,[]);
 for(const call of calls){
  const plan=sql.prepare('EXPLAIN QUERY PLAN '+call.query).all(...call.args).map(r=>r.detail);
  assert.ok(plan.some(x=>/SEARCH e USING (COVERING )?INDEX telemetry_received/.test(x)));
  assert.ok(!plan.some(x=>/^SCAN telemetry_events|^SCAN v/.test(x)));
 }
 sql.close();
});
test('ranking computes one indexed snapshot for top, total, self outside top 20 and tied scores',async()=>{
 const{default:worker}=await import('../server/worker.js');const{sql,DB,calls}=database();
 const add=sql.prepare('INSERT INTO runs(id,received_at,player,reason,score,t,build,json) VALUES(?,?,?,?,?,?,?,?)');
 for(let i=0;i<30;i++)add.run('id'+i,'2026-11-01T00:00:00Z','player'+i,'caught',100-i,60,'release',JSON.stringify({mapKey:'old-town',challenge:{id:'normal',version:'corridor-time-score-v11'},rankingEligible:true}));
 add.run('duplicate','2026-11-01T00:00:00Z','player0','caught',100,59,'release',JSON.stringify({mapKey:'old-town',challenge:{id:'normal',version:'corridor-time-score-v11'},rankingEligible:true}));
 const response=await worker.fetch(new Request('https://fixture/ranking?map=old-town&rules=corridor-time-score-v11&difficulty=all&me=player29'),{DB});
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,30);assert.equal(data.top.length,20);assert.equal(data.me.pos,30);assert.equal(data.top[0].runId,'id0');assert.ok(!JSON.stringify(data).includes('player29'));
 assert.equal(calls.length,1);
 const plan=sql.prepare('EXPLAIN QUERY PLAN '+calls[0].query).all(...calls[0].args).map(r=>r.detail);
 assert.equal(plan.filter(x=>/SEARCH runs USING INDEX runs_rank_scope/.test(x)).length,1);
 add.run('empty-player','2026-11-01T00:00:00Z','','caught',1,60,'release',JSON.stringify({mapKey:'old-town'}));
 assert.equal((await(await worker.fetch(new Request('https://fixture/ranking'),{DB})).json()).me,null,'omitting me never selects an empty player ID');
 const empty=await(await worker.fetch(new Request('https://fixture/ranking?map=rock-canyon&me=missing'),{DB})).json();assert.deepEqual(empty.top,[]);assert.equal(empty.total,0);assert.equal(empty.me,null);
 sql.close();
});
