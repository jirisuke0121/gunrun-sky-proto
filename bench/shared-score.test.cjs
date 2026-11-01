const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const rules = require('../ranked-rules.js');

function policyFixture(practice = false) {
  const nodes = new Map(), values = new Map(); let mode = 'menu', saved;
  function element() { return { value:'', checked:false, disabled:false, hidden:false, dataset:{}, handlers:{},
    classList:{toggle(){}}, parentElement:{prepend(){}}, closest(){return this;},
    add(){}, addEventListener(type, fn){(this.handlers[type] ||= []).push(fn);},
    click(){for(const fn of this.handlers.click||[])fn({target:this});},
    change(){for(const fn of this.handlers.change||[])fn({target:this});} }; }
  const get = id => {if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const win = {skyRankedRules:rules,skyPracticeMode:practice,installSkyStartReadiness:()=>({sync:()=>true})};
  const context = {window:win,document:{getElementById:get,body:{classList:{toggle(){}}},dispatchEvent(){}},
    localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},
    location:{search:''},URLSearchParams,Option:function(){},CustomEvent:function(){},MutationObserver:class{observe(){}}};
  vm.runInNewContext(fs.readFileSync('challenge-difficulty.js','utf8'),context);
  const policy = win.skyChallenge;
  assert.equal(policy.settingsForStorage(),undefined,'early migrations may save before attach');
  const U={...rules.settings,jumpVel:10,gravity:12,reserveAmmo:99,volume:.4,sensitivity:1.7,autoFire:false};
  const game={U,Jn:{...rules.settings},z:{},Jt:[],modeRef:()=>mode,nl(){},refreshChallengeBest(){},Ua(){saved={...policy.settingsForStorage()};}};
  get('bStart').addEventListener('click',()=>{policy.begin();mode='play';});
  get('bReset').addEventListener('click',()=>{Object.assign(U,game.Jn);game.Ua();});
  policy.attach(game);
  return {policy,U,game,get,win,home:()=>{mode='menu';},saved:()=>saved};
}

(async()=>{
  const f=policyFixture();
  assert.equal(f.U.jumpVel,7.2);assert.equal(f.U.gravity,20);assert.equal(f.U.reserveAmmo,36);
  assert.equal(f.U.volume,.4);assert.equal(f.U.autoFire,false);assert.equal(f.U.sensitivity,1.7);
  assert.equal(f.get('s_jumpVel').disabled,true);assert.equal(f.get('s_volume').disabled,false);
  f.game.Ua();assert.equal(f.saved().jumpVel,10);assert.equal(f.saved().reserveAmmo,99);
  f.get('challengeCustom').checked=true;f.get('challengeCustom').change();
  assert.equal(f.policy.id,'legacy');assert.equal(f.U.jumpVel,10);assert.equal(f.U.gravity,12);
  assert.equal(f.get('s_jumpVel').disabled,false);f.U.jumpVel=9;
  f.get('challengeCustom').checked=false;f.get('challengeCustom').change();
  assert.equal(f.U.jumpVel,7.2);assert.equal(f.policy.settingsForStorage().jumpVel,9);
  f.get('bStart').click();assert.deepEqual({...f.game.z.challenge.fixedSettings},rules.settings);
  assert.equal(f.game.z.challenge.rankingScope,'all');
  const normalKey=f.policy.key('best');f.home();f.get('challengeDifficulty').value='hard';f.get('challengeDifficulty').change();
  assert.equal(f.policy.key('best'),normalKey,'personal best spans all standard difficulties');
  f.get('bReset').click();assert.equal(f.saved().jumpVel,7.2);
  const practice=policyFixture(true);assert.equal(practice.U.jumpVel,10);assert.equal(practice.get('s_jumpVel').disabled,false);

  const scoreEnv={window:{skyThreatScore:require('../threat-score.js')},document:{},Math};
  vm.runInNewContext(fs.readFileSync('challenge-score.js','utf8'),scoreEnv);
  const evaluate=scoreEnv.window.skyChallengeScore.evaluate;
  assert.deepEqual([0,1,2].map(i=>evaluate(120,0,i,{pressureSeconds:3}).total),[360,396,432]);
  assert.deepEqual([0,1,2].map(i=>evaluate(120,1,i,{pressureSeconds:3,damageUnits:10}).total),[480,528,576]);

  const {default:worker}=await import('../server/worker.js');
  const {createRunRecords,resultOnly}=await import('../run-records.js');
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('server/schema.sql','utf8'));
  const DB={prepare(query){let args=[];return{bind(...a){args=a;return this;},async run(){return db.prepare(query).run(...args);},async first(){return db.prepare(query).get(...args)||null;},async all(){return{results:db.prepare(query).all(...args)}}};}};
  const fetcher=(url,options)=>worker.fetch(new Request(url,options),{DB},{});
  const get=async path=>(await fetcher('https://fixture'+path)).json();
  const map='old-town',scope=`map=${map}&rules=${rules.version}&mode=score&difficulty=all`;
  const make=(player,id,score,extra={})=>({clientRunId:crypto.randomUUID(),player,at:new Date().toISOString(),t:120,reason:'time',kind:'map',channel:'production',build:'shared-score-fixture',mapKey:map,
    challenge:{id,version:rules.version,rankingScope:'all',fixedSettings:{...rules.settings}},score:evaluate(extra.t ?? 120,0,['easy','normal','hard'].indexOf(id),{pressureSeconds:score/(120*(1+['easy','normal','hard'].indexOf(id)*.1))}),stars:3,...extra});
  const post=async a=>{const r=await fetcher('https://fixture/runs',{method:'POST',body:JSON.stringify(a)});assert.equal(r.status,200);return r.json();};
  const first=make('one','hard',432);await post(first);
  const ghost={v:1,map:'old-town',mapVersion:'old-town-beams-20261025',samples:[[0,0,0,0,0,0,0,8,0],[120,1,0,0,0,0,0,8,0]]};
  const winner=make('one','easy',480,{ghost});const receipt=await post(winner);
  await post(make('two','normal',462));
  await post(make('three','hard',450,{reason:'caught',t:110}));
  const ranking=await get('/ranking?'+scope+'&me=one');
  assert.equal(ranking.total,3);assert.deepEqual(ranking.top.map(r=>r.score),[480,462,450]);
  assert.equal(ranking.top[0].difficulty,'easy');assert.equal(ranking.top[0].runId,receipt.id);
  assert.ok(ranking.top.every(r=>r.stars===0));
  assert.equal(ranking.top[2].cleared,0,'uncleared runs compete on score');
  assert.equal(ranking.me.runId,receipt.id);
  const replay=await get('/ghosts/'+receipt.id+'?'+scope);
  assert.deepEqual(replay.ghost.samples,ghost.samples,'shared board opens the exact winning run');
  const lower=await fetcher('https://fixture/ghosts/'+first.clientRunId+'?'+scope);
  assert.equal(lower.status,404,'another difficulty of the same player is not the selected replay');
  assert.equal((await post(winner)).id,receipt.id,'retry does not duplicate the same run');
  for(const [key,value] of Object.entries(rules.settings)){
    const bad=make('modified-'+key,'normal',9999,{settings:{[key]:typeof value==='boolean'?!value:value+1},rankingEligible:true});
    const saved=await post(bad);assert.equal(saved.receipt.ranked,false,key+' must not enter the fixed competition');
  }
  const missing=make('missing','normal',9999);delete missing.challenge.fixedSettings;
  assert.equal((await post(missing)).receipt.ranked,false);
  assert.equal((await get('/ranking?'+scope)).total,3,'all altered results are preserved outside the ranking');
  const otherMap=make('other-map','hard',9999,{mapKey:'rock-canyon'});await post(otherMap);
  assert.equal((await get('/ranking?'+scope)).top[0].score,480);
  assert.equal((await get('/ranking?'+scope.replace('old-town','rock-canyon'))).top[0].score,9999);
  const old=make('old','normal',9999,{challenge:{id:'normal',version:'corridor-parkour-v8'}});await post(old);
  assert.equal((await get('/ranking?'+scope)).top[0].score,480);
  assert.equal((await get('/ranking?map=old-town&rules=corridor-parkour-v8&difficulty=normal')).top[0].score,9999);

  const forged=make('forged','normal',9999);forged.score.total++;
  assert.equal((await post(forged)).receipt.ranked,false,'inconsistent score arithmetic is saved outside ranking');
  const overkill=make('bad-kill-count','normal',9999);overkill.score.kills=99;
  assert.equal((await post(overkill)).receipt.ranked,false,'kill count must match run stats');
  const rounded=make('rounded','hard',500,{t:119.9,mapKey:'rock-canyon'});
  rounded.score=evaluate(119.94,0,2,{pressureSeconds:359.8});
  assert.equal((await post(rounded)).receipt.ranked,true,'record clock rounded to 0.1s does not discard a valid result');
  const v9=make('previous-shared','normal',462);v9.challenge.version='corridor-shared-score-v9';v9.score={total:462};
  assert.equal((await post(v9)).receipt.ranked,true,'old clients keep their previous shared ranking');
  const previous=await get('/ranking?map=old-town&rules=corridor-shared-score-v9&mode=score&difficulty=all');
  assert.equal(previous.top[0].score,462);assert.equal(previous.top[0].stars,0);

  // Both movement-only fallback and a real recorder receipt keep the ranking scope/contract.
  assert.deepEqual(resultOnly(winner).challenge,winner.challenge);
  const storage=new Map();let requestedAll=false;
  const records=createRunRecords({storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},uuid:()=>crypto.randomUUID(),
    endpoint:'https://fixture',fetcher:(url,options)=>{if(url.includes('/ranking?'))requestedAll ||=new URL(url).searchParams.get('difficulty')==='all';return fetcher(url,options);}});
  await records.submit(make('ignored','normal',490,{diagnostics:'x'.repeat(560000)}));
  assert.equal(records.history[0].ranking,'confirmed');assert.ok(requestedAll);assert.equal(records.pending,0);
  await records.submit(make('ignored','normal',9999,{settings:{jumpVel:11}}));
  assert.equal(records.history[0].state,'saved');assert.equal(records.history[0].ranking,'excluded');assert.equal(records.pending,0);
  db.close();
  console.log('PASS fixed settings/custom preservation, practice/input preferences, threat and combat multipliers, shared per-player score order, no stars, altered-condition exclusion, retry, old records and map isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
