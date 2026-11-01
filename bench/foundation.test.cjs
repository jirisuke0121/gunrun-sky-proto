const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

function quality(saved, blocked = false) {
  const values = new Map(saved ? [['gunrun-render-quality-v1', saved]] : []);
  const context = { document: { body: { dataset: {} }, getElementById() { return null; }, dispatchEvent() {} },
    devicePixelRatio: 2, localStorage: { getItem(k) { if (blocked) throw Error('blocked'); return values.get(k); },
      setItem(k,v) { if (blocked) throw Error('quota'); values.set(k,v); } }, CustomEvent: class {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('render-quality.js','utf8'), context);
  return context.skyRenderQuality;
}

test('high-quality default, saved manual choices, fixed active resolution and next-round application', () => {
  const q = quality(); assert.equal(q.mode, 'high'); assert.equal(q.pixelRatio(.75,2), 1.5);
  q.beginRound(); const actual = q.pixelRatio(); q.select('performance');
  assert.equal(q.pixelRatio(.5,1), actual, 'manual choice and resize cannot change active round');
  q.finishRound(); q.beginRound(); assert.equal(q.pixelRatio(1,2),.7);
  for (const saved of ['performance','balanced','high']) assert.equal(quality(saved).mode,saved);
  assert.equal(quality('invalid').mode,'high');
  const unavailable = quality(null,true); unavailable.select('performance'); unavailable.beginRound();
  assert.equal(unavailable.pixelRatio(),.7,'storage failure must retain session selection');
});

test('frame counters exclude pauses and distinguish actual slow frames from skipped callbacks', async () => {
  const { createFrameMetrics } = await import('../foundation-metrics.js');
  const { createAutoResolutionMonitor } = await import('../auto-resolution-monitor.js');
  const p = createFrameMetrics(); p.sample(0,true); for(let i=1;i<=60;i++)p.sample(i*1000/60,true);
  p.sample(99999,false); p.sample(100000,true); for(let i=1;i<=60;i++)p.sample(100000+i*1000/60,true);
  const sample = p.snapshot(); assert.equal(sample.frameCount,120); assert.equal(sample.averageFps,60); assert.equal(sample.below30Count,0);
  assert.equal(createFrameMetrics().snapshot(),null);
  for(const fps of [40,60]) {
    const m=createAutoResolutionMonitor(); for(let i=0;i<=120*20;i++)m.sample(i*1000/120,true,i%(120/fps)===0);
    assert.equal(m.shouldReduce,fps===40); assert.equal(m.evaluated,true);
  }
  const interrupted=createAutoResolutionMonitor();for(let i=0;i<8*40;i++)interrupted.sample(i*25,true,true);
  interrupted.sample(8000,false,false);for(let i=0;i<10*40;i++)interrupted.sample(9000+i*25,true,true);
  assert.equal(interrupted.shouldReduce,false);
});

test('telemetry API validates, deduplicates, filters, preserves missing FPS and protects admin summaries', async () => {
  const { default: worker } = await import('../server/worker.js');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync('server/schema.sql','utf8')); sqlite.exec(fs.readFileSync('server/telemetry-schema.sql','utf8'));
  const DB = { prepare(query) { let values=[]; return { bind(...a){values=a;return this},
    async first(){return sqlite.prepare(query).get(...values)||null}, async all(){return{results:sqlite.prepare(query).all(...values)}},
    async run(){return sqlite.prepare(query).run(...values)} }; } };
  const env = { DB, ADMIN_TOKEN: 'local-fixture-only', ALLOWED_ORIGINS: 'https://fixture.invalid' };
  const request = (path,options={}) => worker.fetch(new Request('https://fixture.invalid'+path,options),env,{});
  const admin = path => request('/admin/overview'+path,{headers:{Authorization:'Bearer local-fixture-only'}});
  const session=crypto.randomUUID(), run=crypto.randomUUID();
  const event=(name,extra={})=>({v:1,id:crypto.randomUUID(),session,event:name,build:'fixture-v1',map:'old-town',source:'github',device:'desktop',difficulty:'normal',...extra});
  const post = data => request('/telemetry',{method:'POST',body:JSON.stringify(data)});
  assert.equal((await request('/admin/overview')).status,401);
  assert.equal((await request('/admin/overview',{headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.equal((await (await admin('')).json()).summary.sessions,0);
  const boot=event('boot');assert.equal((await post(boot)).status,200);await post(boot);
  for(const name of ['home','start','retry'])assert.equal((await post(event(name,{run}))).status,200);
  const performance={frameCount:600,durationMs:10000,averageFps:60,below30Count:5,maxFrameMs:40,quality:'high',ratio:1.5,nativeRatio:2,width:1200,height:600,viewportWidth:800,viewportHeight:400};
  assert.equal((await post(event('finish',{run,reason:'time',performance}))).status,200);
  await post(event('finish',{run:crypto.randomUUID(),reason:'quit',performance:null}));
  await post(event('finish',{session:crypto.randomUUID(),run:crypto.randomUUID(),map:'rock-canyon',device:'android',reason:'quit',performance:{...performance,averageFps:30,durationMs:20000}}));
  await post(event('error',{error:'javascript',stack:'private text must be dropped'}));
  assert.equal((await post(event('finish',{run,reason:'time',performance:{...performance,averageFps:999}}))).status,400);
  assert.equal((await post(event('start',{run,difficulty:'intro'}))).status,400,'intro is never sent');
  assert.equal((await request('/telemetry',{method:'POST',headers:{Origin:'https://wrong.invalid'},body:JSON.stringify(boot)})).status,403);
  assert.equal((await request('/telemetry',{method:'POST',body:'x'.repeat(17000)})).status,413);
  const overview = await (await admin('')).json();
  assert.equal(overview.summary.boots,1);assert.equal(overview.summary.starts,1);assert.equal(overview.summary.finishes,1);
  assert.equal(overview.performance.length,2);assert.equal(overview.performance.reduce((n,r)=>n+r.samples,0),2,'missing FPS is not a zero-valued sample');
  assert.equal(overview.errors[0].count,1);assert.ok(!JSON.stringify(overview).includes(session));assert.ok(!JSON.stringify(overview).includes('private text'));
  const filtered = await (await admin('?map=rock-canyon&device=android')).json();assert.equal(filtered.performance.length,1);assert.equal(filtered.performance[0].averageFps,30);
  assert.equal((await (await admin('?quality=high')).json()).summary.starts,0,'quality filter explicitly targets measured finish events');
  assert.equal((await admin('?quality=invalid')).status,400);
  sqlite.close();
});

test('both maps connect the same runtime hooks without removing canyon practice guards', () => {
  for(const file of ['index.html','canyon.html']) {
    const s=fs.readFileSync(file,'utf8');
    for(const term of ['foundation-runtime.js','skyFoundation?.beginRound(Z.runId)','skyFoundation?.finishRound(n)','skyFoundation?.frame(n,ie===','skyFoundation?.attach(window.__skyInternals','performance:recordSafe(()=>window.skyFoundation?.performance())']) assert.ok(s.includes(term),`${file}: ${term}`);
  }
  assert.ok(fs.readFileSync('canyon.html','utf8').includes('function UM(){if(window.skyPracticeMode){Z.on=false;Z.sealed=true;return;}'));
});

test('home-only quality guidance respects consent, decline, manual changes and intro opt-out', async () => {
  const { createFrameMetrics } = await import('../foundation-metrics.js');
  const { createAutoResolutionMonitor } = await import('../auto-resolution-monitor.js');
  function runtime({intro=false,practice=false,optOut=false}={}) {
    const values=new Map(optOut?[['gunrun-sky-proto-v1','{"sendLog":false}']]:[]),posts=[],dialogs=[];
    const q={mode:'high',revision:0,beginRound(){},finishRound(){},select(mode){this.mode=mode;this.revision++},
      snapshot(){return{mode:this.mode,pixelRatio:1.5,nativePixelRatio:2,buffer:[1200,600]}}};
    const makeDialog=()=>{const actions={};return{style:{},setAttribute(){},querySelectorAll(){return[]},
      querySelector(id){return{addEventListener(type,fn){actions[id]=fn}}},addEventListener(type,fn){actions[type]=fn},
      showModal(){this.open=true},close(){this.open=false},remove(){},actions};};
    const context={createFrameMetrics,createAutoResolutionMonitor,crypto,
      location:{hostname:'jirisuke0121.github.io',pathname:'/index.html',search:''},navigator:{userAgent:'Desktop fixture',maxTouchPoints:0},URL,URLSearchParams,innerWidth:800,innerHeight:400,
      localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
      document:{hidden:false,hasFocus:()=>true,referrer:'',addEventListener(){},exitPointerLock(){},getElementById(){return{focus(){}}},
        createElement(){return makeDialog()},body:{append(dialog){dialogs.push(dialog)}}},
      matchMedia:()=>({matches:false}),fetch:async(url,options)=>{posts.push(JSON.parse(options.body));return Response.json({ok:true})},
      skyPracticeMode:practice,skyChallenge:{isIntroRun:intro,id:intro?'intro':'normal'},skyRenderQuality:q,addEventListener(){}};
    context.window=context;
    vm.runInNewContext(fs.readFileSync('foundation-runtime.js','utf8').replace(/^import .*\n/gm,''),context);
    const api=context.skyFoundation;api.attach({U:{sendLog:!optOut},z:{challenge:{id:intro?'intro':'normal'}}},
      {debug:{renderer:{domElement:{clientWidth:800,clientHeight:400}}}});
    const feed=fps=>{api.beginRound(crypto.randomUUID());for(let i=0;i<=fps*20;i++)api.frame(i*1000/fps,true);};
    return{api,q,posts,dialogs,values,feed};
  }
  const slow=runtime();slow.feed(40);slow.api.finishRound('caught');
  assert.equal(slow.dialogs.length,0);assert.equal(slow.q.mode,'high');slow.api.modeChanged('over');assert.equal(slow.dialogs.length,0);
  slow.api.modeChanged('menu');assert.equal(slow.dialogs.length,1);slow.dialogs[0].actions['#qualityKeep']();
  assert.equal(slow.q.mode,'high');assert.equal(slow.values.get('gunrun-quality-check-v1'),'done');
  slow.feed(40);slow.api.finishRound('time');slow.api.modeChanged('menu');assert.equal(slow.dialogs.length,1,'decline is remembered');
  const accept=runtime();accept.feed(40);accept.api.finishRound('time');accept.api.modeChanged('menu');accept.dialogs[0].actions['#qualityAccept']();assert.equal(accept.q.mode,'performance');
  const manual=runtime();manual.feed(40);manual.q.select('balanced');manual.api.finishRound('time');manual.api.modeChanged('menu');assert.equal(manual.dialogs.length,0);
  const fast=runtime();fast.feed(60);fast.api.finishRound('time');fast.api.modeChanged('menu');assert.equal(fast.dialogs.length,0);assert.equal(fast.values.get('gunrun-quality-check-v1'),'done');
  const intro=runtime({intro:true});intro.feed(40);intro.api.finishRound('time');intro.api.modeChanged('menu');assert.equal(intro.dialogs.length,1);assert.equal(intro.posts.length,0,'intro has local diagnosis only');
  const off=runtime({optOut:true});off.feed(60);off.api.finishRound('time');assert.equal(off.posts.length,0);
  const practice=runtime({practice:true});practice.feed(40);practice.api.finishRound('time');practice.api.modeChanged('menu');assert.equal(practice.dialogs.length,0);assert.equal(practice.posts.length,0);
  assert.equal(accept.posts.filter(p=>p.event==='finish').length,1);
});
