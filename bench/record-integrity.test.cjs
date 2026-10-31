const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const {createRunRecords}=await import('../run-records.js'),{default:worker}=await import('../server/worker.js');
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('server/schema.sql','utf8'));
 const DB={prepare(query){let args=[];return{bind(...a){args=a;return this},async run(){return sql.prepare(query).run(...args)},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}}}}};
 const request=(url,options)=>worker.fetch(new Request(url,options),{DB},{}),count=()=>sql.prepare('SELECT count(*) AS n FROM runs').get().n;
 const storage=()=>{const values=new Map();return{values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};
 const run=(extra={})=>({clientRunId:crypto.randomUUID(),v:3,at:new Date().toISOString(),kind:'map',channel:'production',build:'record-contract-test',mapKey:'old-town',reason:'time',t:120,score:{total:396},challenge:{id:'normal',version:'corridor-crowd6-v6'},...extra});
 let disk=storage(),events=[],records=createRunRecords({storage:disk,fetcher:request,emit:e=>events.push(e)}),a=run();
 const receipt=await records.submit(a);assert.equal(receipt.ranking,'confirmed');assert.equal(records.history[0].state,'saved');assert.equal(records.pending,0);
 assert.equal(sql.prepare('SELECT id FROM runs WHERE id=?').get(a.clientRunId).id,a.clientRunId);
 const before=count();await records.submit(a);assert.equal(count(),before,'same logical run cannot be uploaded twice');
 const duplicate=await request('https://fixture/runs',{method:'POST',body:JSON.stringify({...a,player:records.player})});assert.equal(duplicate.status,200);assert.equal(count(),before);
 const conflict=await request('https://fixture/runs',{method:'POST',body:JSON.stringify({...a,player:records.player,score:{total:999}})});assert.equal(conflict.status,409);assert.equal(count(),before);
 // A response can be lost after the DB commit. Reload and retry the same ID.
 disk=storage();let lose=true,posts=0;
 const losing=async(url,options)=>{const response=await request(url,options);if(options?.method==='POST'){posts++;if(lose){lose=false;throw Error('connection lost after commit')}}return response};
 records=createRunRecords({storage:disk,fetcher:losing});a=run();const prior=count();await records.submit(a);
 assert.equal(count(),prior+1);assert.equal(records.history[0].state,'pending');assert.equal(records.pending,1);
 records=createRunRecords({storage:disk,fetcher:losing});await records.retry();assert.equal(count(),prior+1);assert.equal(records.pending,0);assert.ok(records.history[0].receiptId);assert.equal(posts,2);
 // Old deployed protocol: a reload must not blindly duplicate uncertain runs.
 disk=storage();posts=0;
 const legacy=async(url,options)=>{if(options?.method==='POST'){posts++;throw Error('offline')}return Response.json({ok:true,service:'gunrun-runs'})};
 records=createRunRecords({storage:disk,fetcher:legacy});await records.submit(run());records=createRunRecords({storage:disk,fetcher:legacy});await records.retry();assert.equal(posts,1);assert.match(records.history[0].error,/二重登録/);
 // A known bad replay rejection safely retries only the result, preserving score.
 disk=storage();posts=0;const bodies=[];
 records=createRunRecords({storage:disk,fetcher:async(url,options)=>{if(options?.method==='POST'){posts++;bodies.push(JSON.parse(options.body));if(posts===1)return Response.json({error:'bad_ghost'},{status:400})}return request(url,options)}});
 a=run({ghost:{broken:true}});await records.submit(a);assert.equal(posts,2);assert.equal(bodies[1].ghost,null);assert.equal(bodies[1].score.total,396);assert.equal(records.history[0].state,'saved');
 const bad=await request('https://fixture/runs',{method:'POST',body:JSON.stringify({...run({ghost:{broken:true}}),player:'replay-error'})});assert.equal(bad.status,200);assert.equal((await bad.json()).receipt.replay,false);
 // Sending off still records a local result, with no network transmission.
 disk=storage();let calls=0;records=createRunRecords({storage:disk,allowed:()=>false,fetcher:()=>{calls++;throw Error('must not send')}});await records.submit(run());assert.equal(calls,0);assert.equal(records.history[0].state,'excluded');assert.equal(records.pending,0);
 // Storage quota failure strips optional detail before ever losing a result.
 disk=storage();const save=disk.setItem;disk.setItem=(k,v)=>{if(v.length>1500)throw Error('quota');save(k,v)};
 records=createRunRecords({storage:disk,fetcher:async()=>{throw Error('offline')}});a=run({diagnostics:{text:'x'.repeat(5000)}});await records.submit(a);assert.equal(records.history[0].localStored,true);
 const pending=JSON.parse(disk.values.get('gunrun-run-outbox-v1'));assert.equal(pending[a.clientRunId].score.total,396);assert.equal(pending[a.clientRunId].diagnostics,undefined);
 // Optional diagnostic failures must not prevent a completed result submission.
 for(const file of ['index.html','canyon.html']){
  const html=fs.readFileSync(file,'utf8'),captured=[],Z={on:true,sealed:false,runId:crypto.randomUUID(),pend:[],zone:{}};
  const transitions=[],lifecycle={window:{skyTelemetryProbe:{reset(){}}},crypto:{randomUUID:()=> 'new-run'},Z:{on:true,sealed:false,runId:'old-run'},z:{t:12,over:false},ho(){transitions.push(this.Z.runId)},hp(){}};
  vm.createContext(lifecycle);vm.runInContext(html.slice(html.indexOf('function UM(){'),html.indexOf('function ps(',html.indexOf('function UM(){'))),lifecycle);
  lifecycle.ho=()=>transitions.push(lifecycle.Z.runId);lifecycle.UM();assert.deepEqual(transitions,['old-run']);assert.equal(lifecycle.Z.runId,'new-run');
  const resetStart=html.indexOf('Object.assign(z,{t:0,final:null'),resetEnd=html.indexOf('),$e.off',resetStart)+1;
  assert.ok(resetStart>0&&resetEnd>resetStart);const reset={z:{final:{total:999},stars:3,pb:true}};
  vm.runInNewContext(html.slice(resetStart,resetEnd),reset);assert.equal(reset.z.final,null);assert.equal(reset.z.stars,0);assert.equal(reset.z.pb,false);
  const env={window:{skyChallenge:{debug:false},skyReplay:{snapshot(){throw Error('replay broken')}},skyTelemetryProbe:{snapshot(){throw Error('diagnostics broken')}}},Z,on:false,z:{t:120,final:{total:396},stars:1,challenge:{id:'normal',version:'corridor-crowd6-v6'}},Jn:{},U:{sendLog:true},ft:{},c:{life:3},Vi:1,jn:[],Hn:false,__VW:()=>100,__VH:()=>100,Ct:n=>n,co:[],ve:{log:[]},pp(){throw Error('path detail broken')},dp(){},Fh(){},sendRec:a=>{captured.push(a);return Promise.resolve()}};
  vm.createContext(env);vm.runInContext(html.slice(html.indexOf('function recordSafe('),html.indexOf('async function sendRec(')),env);
  vm.runInContext(html.slice(html.indexOf('function ho(n){'),html.indexOf('function Fh(){')),env);env.ho('time');
  assert.equal(captured[0].score.total,396);assert.equal(captured[0].diagnostics,null);assert.equal(captured[0].ghost,null);assert.match(captured[0].diagnosticError,/path detail/);assert.equal(Z.sealed,true);
  // Visiting practice and changing volume cannot persist its forced sendLog=false.
  const values=new Map(),settings={sendLog:true,volume:.7},context={window:{},U:settings,sd:'settings',localStorage:{setItem:(k,v)=>values.set(k,v)}};
  vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function Ua(){'),html.indexOf('function w_(){')),context);context.Ua();context.window.skyPracticeMode=true;settings.sendLog=false;settings.volume=.3;context.Ua();assert.equal(JSON.parse(values.get('settings')).sendLog,true);
 }
 sql.close();console.log('PASS durable results, reload/retry, commit-response loss/idempotency, legacy retry guard, bad replay/size fallback, opt-out, quota, diagnostic failures and practice settings isolation');
})().catch(error=>{console.error(error);process.exitCode=1});
