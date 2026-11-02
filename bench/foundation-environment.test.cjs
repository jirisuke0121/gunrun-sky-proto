const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');

test('device capabilities are coarse, optional, and do not infer an iPhone model',async()=>{
 const {environmentProfile,collectEnvironment}=await import('../environment-profile.js');
 const iphone=environmentProfile({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.0 Mobile Safari/604.1',hardwareConcurrency:6},{width:390,height:844},3);
 assert.equal(iphone.os,'ios');assert.equal(iphone.osVersion,'18.1');assert.equal(iphone.browser,'safari');assert.equal(iphone.model,null);assert.equal(iphone.memoryGb,null);
 const android={userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36',hardwareConcurrency:8,deviceMemory:8,userAgentData:{async getHighEntropyValues(){return{model:'Pixel 8'}}}};
 const profile=collectEnvironment(android,{width:412,height:915},2.6);
 assert.equal(profile.model,null);await new Promise(r=>setImmediate(r));assert.equal(profile.model,'Pixel 8');assert.equal(profile.browser,'chrome');assert.equal(profile.cores,8);
 const blocked=collectEnvironment({...android,userAgentData:{getHighEntropyValues(){throw Error('blocked')}}},{},2);
 await new Promise(r=>setImmediate(r));assert.equal(blocked.model,null);
 assert.equal(environmentProfile({userAgent:'unknown',hardwareConcurrency:NaN,deviceMemory:Infinity},null,0).cores,null);
});

test('Japanese date ranges include the whole end date, validate leap days and reject partial/reversed input',async()=>{
 const {telemetryRange}=await import('../server/telemetry-range.js');
 const range=q=>telemetryRange(new URLSearchParams(q));
 const r=range('from=2024-02-29&to=2024-02-29');
 assert.equal(r.fromMs,Date.parse('2024-02-28T15:00:00Z'));assert.equal(r.toExclusiveMs,Date.parse('2024-02-29T15:00:00Z'));
 assert.equal(range('from=2026-02-29&to=2026-03-01'),null);
 assert.equal(range('from=2026-11-03&to=2026-11-02'),null);
 assert.equal(range('from=2026-11-01'),null);
 assert.equal(range('from=2026-1-1&to=2026-11-02'),null);
 assert.equal(range('days=30').days,30);
});

test('country comes from the game request; optional specs, arbitrary dates, missing values and aggregates stay separate from raw identities',async()=>{
 const {default:worker}=await import('../server/worker.js');
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('server/telemetry-schema.sql','utf8'));
 const DB={prepare(query){let values=[];return{query,bind(...args){values=args;return this},async first(){return sql.prepare(query).get(...values)||null},async all(){return{results:sql.prepare(query).all(...values)}},async run(){return sql.prepare(query).run(...values)}}}};
 DB.batch=async statements=>{sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await (/^\s*(SELECT|WITH)\b/i.test(statement.query)?statement.all():statement.run()));sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}};
 const env={DB,ADMIN_TOKEN:'fixture-admin',ALLOWED_ORIGINS:'https://fixture.invalid'};
 const api=(path,options={})=>worker.fetch(new Request('https://fixture.invalid'+path,options),env);
 const overview=q=>api('/admin/overview?'+q,{headers:{Authorization:'Bearer fixture-admin'}});
 const session=crypto.randomUUID(),run=crypto.randomUUID();
 const environment={os:'android',osVersion:'15',browser:'chrome',browserVersion:'140',model:'Pixel 8',cores:8,memoryGb:8,screenWidth:412,screenHeight:915,nativeRatio:2.6};
 const event=(kind,extra={})=>({v:1,id:crypto.randomUUID(),session,event:kind,run,build:'fixture-env',map:'old-town',source:'github',device:'android',difficulty:'normal',environment,...extra});
 const post=async(value,country)=>{
  const req=new Request('https://fixture.invalid/telemetry',{method:'POST',headers:{'cf-ipcountry':'US'},body:JSON.stringify(value)});
  if(country)Object.defineProperty(req,'cf',{value:{country}});
  return worker.fetch(req,env);
 };
 for(const kind of ['boot','home','start'])assert.equal((await post(event(kind,{country:'US'}),'JP')).status,200);
 const perf={frameCount:600,durationMs:10000,averageFps:60,below30Count:0,maxFrameMs:20,quality:'minimum',ratio:.5,nativeRatio:2.6,width:206,height:458,viewportWidth:412,viewportHeight:915,shadows:false};
 assert.equal((await post(event('finish',{reason:'time',performance:perf}),'JP')).status,200);
 const start=Date.parse('2026-10-31T15:00:00Z'),end=Date.parse('2026-11-01T15:00:00Z');
 sql.prepare('UPDATE telemetry_events SET received_at=? WHERE session=?').run(start,session);
 const oldSession=crypto.randomUUID();
 assert.equal((await post(event('boot',{session:oldSession,run:null,environment:undefined}))).status,200);
 sql.prepare('UPDATE telemetry_events SET received_at=? WHERE session=?').run(end,oldSession);
 const data=await(await overview('from=2026-11-01&to=2026-11-01')).json();
 assert.equal(data.summary.boots,1);assert.equal(data.countries[0].country,'JP');assert.equal(data.countries[0].averageFps,60);
 assert.equal(data.environments[0].model,'Pixel 8');assert.equal(data.environments[0].cores,8);assert.equal(data.performance[0].shadows,0);
 assert.equal((await(await overview('from=2026-11-01&to=2026-11-01&country=US')).json()).summary.boots,0);
 assert.equal((await(await overview('from=2026-11-01&to=2026-11-01&cores=8&memoryGb=8&browser=chrome')).json()).performance.length,1);
 const missing=await(await overview('from=2026-11-02&to=2026-11-02&country=unknown')).json();
 assert.equal(missing.summary.boots,1);assert.equal(missing.environments[0].memoryGb,null);assert.equal(missing.countries[0].averageFps,null);
 assert.ok(!JSON.stringify(data).includes(session));assert.ok(!JSON.stringify(data).includes('cf-ipcountry'));
 assert.equal((await overview('from=bad&to=2026-11-01')).status,400);
 assert.equal((await post(event('boot',{environment:{...environment,cores:9999}}),'JP')).status,400);
 sql.exec(fs.readFileSync('server/telemetry-environment-schema.sql','utf8'));sql.exec(fs.readFileSync('server/telemetry-environment-schema.sql','utf8'));
 sql.close();
});
