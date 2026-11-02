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
  assert.equal(f.U.jumpVel,7.2);assert.equal(f.U.gravity,20);assert.equal(f.U.reserveAmmo,24);
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

  const scoreEnv={window:{skySurvivalScore:require('../survival-score.js')},document:{},Math};
  vm.runInNewContext(fs.readFileSync('challenge-score.js','utf8'),scoreEnv);
  const evaluate=scoreEnv.window.skyChallengeScore.evaluate;
  assert.deepEqual([0,1,2].map(i=>evaluate(120,0,i).total),[1800,1980,2160]);
  assert.deepEqual([0,1,2].map(i=>evaluate(120,1,i,{damageUnits:10}).total),[1850,2035,2220]);

  const {default:worker}=await import('../server/worker.js');
  const {createRunRecords,resultOnly}=await import('../run-records.js');
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('server/schema.sql','utf8'));
  const DB={prepare(query){let args=[];return{bind(...a){args=a;return this;},async run(){return db.prepare(query).run(...args);},async first(){return db.prepare(query).get(...args)||null;},async all(){return{results:db.prepare(query).all(...args)}}};}};
  DB.batch=async statements=>{db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}};
  const fetcher=(url,options)=>worker.fetch(new Request(url,options),{DB},{});
  const get=async path=>(await fetcher('https://fixture'+path)).json();
  const map='old-town',scope=`map=${map}&rules=${rules.version}&mode=score&difficulty=all`;
  const make=(player,id,score,extra={})=>({clientRunId:crypto.randomUUID(),player,at:new Date().toISOString(),t:120,reason:'time',kind:'map',channel:'production',build:'shared-score-fixture',mapKey:map,
    challenge:{id,version:rules.version,rankingScope:'all',fixedSettings:{...rules.settings}},score:evaluate(extra.t ?? 120,0,['easy','normal','hard'].indexOf(id),{damageUnits:Math.max(0,score-evaluate(extra.t??120,0,['easy','normal','hard'].indexOf(id)).survival)/(2*(1+['easy','normal','hard'].indexOf(id)*.1))}),stars:3,...extra});
  const post=async a=>{const r=await fetcher('https://fixture/runs',{method:'POST',body:JSON.stringify(a)});assert.equal(r.status,200);return r.json();};
  const first=make('one','hard',2200);await post(first);
  const ghost={v:1,map:'old-town',mapVersion:'old-town-beams-20261025',samples:[[0,0,0,0,0,0,0,8,0],[120,1,0,0,0,0,0,8,0]]};
  const winner=make('one','easy',2400,{ghost});const receipt=await post(winner);
  await post(make('two','normal',2300,{name:'runner_2'}));
  await post(make('three','hard',2250,{reason:'caught',t:110,name:'x<script>'}));
  const ranking=await get('/ranking?'+scope+'&me=one');
  assert.equal(ranking.total,3);assert.deepEqual(ranking.top.map(r=>r.score),[2400,2300,2250]);
  assert.equal(ranking.top[0].difficulty,'easy');assert.equal(ranking.top[0].runId,receipt.id);
  assert.ok(ranking.top.every(r=>r.stars===0));
  assert.equal(ranking.top[2].cleared,0,'uncleared runs compete on score');
  assert.equal(ranking.me.runId,receipt.id);
  // Nicknames are shown only when they pass the shared rule (normalised); anything else is dropped by the Worker.
  assert.deepEqual(ranking.top.map(r=>r.name),[null,'RUNNER_2',null],'valid nickname shown, invalid one dropped, none stays anonymous');
  const replay=await get('/ghosts/'+receipt.id+'?'+scope);
  assert.deepEqual(replay.ghost.samples,ghost.samples,'shared board opens the exact winning run');
  const lower=await fetcher('https://fixture/ghosts/'+first.clientRunId+'?'+scope);
  assert.equal(lower.status,404,'another difficulty of the same player is not the selected replay');
  assert.equal((await post(winner)).id,receipt.id,'retry does not duplicate the same run');
  for(const [key,value] of Object.entries(rules.settings)){
    const bad=make('modified-'+key,'normal',99999,{settings:{[key]:typeof value==='boolean'?!value:value+1},rankingEligible:true});
    const saved=await post(bad);assert.equal(saved.receipt.ranked,false,key+' must not enter the fixed competition');
  }
  const missing=make('missing','normal',99999);delete missing.challenge.fixedSettings;
  assert.equal((await post(missing)).receipt.ranked,false);
  assert.equal((await get('/ranking?'+scope)).total,3,'all altered results are preserved outside the ranking');
  const otherMap=make('other-map','hard',99999,{mapKey:'rock-canyon'});await post(otherMap);
  assert.equal((await get('/ranking?'+scope)).top[0].score,2400);
  assert.equal((await get('/ranking?'+scope.replace('old-town','rock-canyon'))).top[0].score,99999);
  const old=make('old','normal',99999,{challenge:{id:'normal',version:'corridor-parkour-v8'}});await post(old);
  assert.equal((await get('/ranking?'+scope)).top[0].score,2400);
  assert.equal((await get('/ranking?map=old-town&rules=corridor-parkour-v8&difficulty=normal')).top[0].score,99999);

  const forged=make('forged','normal',99999);forged.score.total++;
  assert.equal((await post(forged)).receipt.ranked,false,'inconsistent score arithmetic is saved outside ranking');
  const alteredDifficulty=make('bad-multiplier','normal',99999);alteredDifficulty.score.difficulty=99;
  assert.equal((await post(alteredDifficulty)).receipt.ranked,false,'difficulty multiplier is server-derived');
  const v10=make('old-threat','normal',99999,{challenge:{id:'normal',version:'corridor-threat-score-v10'}});await post(v10);
  assert.equal((await get('/ranking?'+scope)).top[0].score,2400,'old threat scores stay outside the time board');
  const overkill=make('bad-kill-count','normal',99999);overkill.score.kills=99;
  assert.equal((await post(overkill)).receipt.ranked,false,'kill count must match run stats');
  const rounded=make('rounded','hard',18000,{t:119.9,mapKey:'rock-canyon'});
  rounded.score=evaluate(119.94,0,2,{damageUnits:20});
  assert.equal((await post(rounded)).receipt.ranked,true,'record clock rounded to 0.1s does not discard a valid result');
  const v9=make('previous-shared','normal',462);v9.challenge.version='corridor-shared-score-v9';v9.score={total:462};
  assert.equal((await post(v9)).receipt.ranked,true,'old clients keep their previous shared ranking');
  const previous=await get('/ranking?map=old-town&rules=corridor-shared-score-v9&mode=score&difficulty=all');
  assert.equal(previous.top[0].score,462);assert.equal(previous.top[0].stars,0);

  const oldThreat=make('previous-threat','hard',99999);oldThreat.challenge.version='corridor-threat-score-v10';
  oldThreat.score={scoring:'threat-survival-v1',elapsed:120,difficulty:1.2,pressureSeconds:10,damageUnits:4,kills:0,survival:1440,damage:9,kill:0,total:1449};
  assert.equal((await post(oldThreat)).receipt.ranked,true,'cached v10 clients retain their own board during rollout');
  const previousThreat=await get('/ranking?map=old-town&rules=corridor-threat-score-v10&mode=score&difficulty=all');
  assert.equal(previousThreat.top[0].score,1449);assert.equal(previousThreat.top[0].stars,0);
  assert.equal((await get('/ranking?'+scope)).top[0].score,2400,'v10 and v12 never mix');
  oldThreat.clientRunId=crypto.randomUUID();oldThreat.score.pressureSeconds=999;
  assert.equal((await post(oldThreat)).receipt.ranked,false,'old threat arithmetic is still validated');

  // Cached v11 clients keep their original arithmetic and isolated score/replay board.
  const oldTime=make('previous-time','hard',753,{ghost});
  oldTime.challenge.version='corridor-time-score-v11';
  oldTime.stats={kills:1};
  oldTime.score={scoring:'time-survival-v1',elapsed:120,difficulty:1.2,damageUnits:64.1,kills:1,survival:17280,damage:153,kill:120,total:17553};
  const oldReceipt=await post(oldTime);
  assert.equal(oldReceipt.receipt.ranked,true);
  const oldScope='map=old-town&rules=corridor-time-score-v11&mode=score&difficulty=all';
  const oldBoard=await get('/ranking?'+oldScope);
  assert.equal(oldBoard.top[0].score,17553);assert.equal(oldBoard.top[0].stars,0);
  assert.equal((await get('/ghosts/'+oldReceipt.id+'?'+oldScope)).score,17553);
  assert.equal((await get('/ranking?'+scope)).top[0].score,2400,'v11 scores cannot dominate v12');
  const crossVersion=structuredClone(oldTime);crossVersion.clientRunId=crypto.randomUUID();crossVersion.challenge.version=rules.version;
  assert.equal((await post(crossVersion)).receipt.ranked,false,'v11 payload cannot enter v12');
  const forgedOld=structuredClone(oldTime);forgedOld.clientRunId=crypto.randomUUID();forgedOld.score.total++;
  assert.equal((await post(forgedOld)).receipt.ranked,false,'v11 still validates totals');
  const newAsOld=make('new-as-old','hard',753);newAsOld.challenge.version='corridor-time-score-v11';
  assert.equal((await post(newAsOld)).receipt.ranked,false,'v12 payload cannot enter v11');

  // Cached v12 (kill 100) and v13 (kill 30) clients keep their own arithmetic and boards; v14 (survival 15/s) never mixes with them.
  const v12=make('previous-balanced','hard',700);v12.challenge.version='corridor-balanced-score-v12';v12.stats={kills:10};
  v12.score={scoring:'time-survival-v2',elapsed:120,difficulty:1.2,damageUnits:106.2,kills:10,survival:480,damage:254,kill:1200,total:1934};
  const v12Receipt=await post(v12);assert.equal(v12Receipt.receipt.ranked,true,'cached v12 clients keep their own board during rollout');
  const v12Board=await get('/ranking?map=old-town&rules=corridor-balanced-score-v12&mode=score&difficulty=all');
  assert.equal(v12Board.top[0].score,1934);assert.equal(v12Board.top[0].stars,0);
  assert.equal((await get('/ranking?'+scope)).top[0].score,2400,'v12 scores (kill 100) cannot enter the v14 board');
  const v12AsNew=structuredClone(v12);v12AsNew.clientRunId=crypto.randomUUID();v12AsNew.challenge.version=rules.version;
  assert.equal((await post(v12AsNew)).receipt.ranked,false,'v12 payload cannot enter v14');
  const forgedV12=structuredClone(v12);forgedV12.clientRunId=crypto.randomUUID();forgedV12.score.total++;
  assert.equal((await post(forgedV12)).receipt.ranked,false,'v12 still validates totals');
  const v13AsOld=structuredClone(v12);v13AsOld.clientRunId=crypto.randomUUID();v13AsOld.score=evaluate(120,10,2,{damageUnits:106.2});
  assert.equal(v13AsOld.score.total,2774);assert.equal((await post(v13AsOld)).receipt.ranked,false,'v14 payload cannot enter v12');
  const v13=make('previous-kill30','hard',700);v13.challenge.version='corridor-balanced-score-v13';v13.stats={kills:10};
  v13.score={scoring:'time-survival-v3',elapsed:120,difficulty:1.2,damageUnits:106.2,kills:10,survival:480,damage:254,kill:360,total:1094};
  assert.equal((await post(v13)).receipt.ranked,true,'cached v13 clients keep their own board during rollout');
  assert.equal((await get('/ranking?map=old-town&rules=corridor-balanced-score-v13&mode=score&difficulty=all')).top[0].score,1094);
  const v13AsNew=structuredClone(v13);v13AsNew.clientRunId=crypto.randomUUID();v13AsNew.challenge.version=rules.version;
  assert.equal((await post(v13AsNew)).receipt.ranked,false,'v13 payload cannot enter v14');
  const v13Heavy=make('heavy-fight','hard',700);v13Heavy.stats={kills:10};v13Heavy.score=evaluate(120,10,2,{damageUnits:106.2});
  assert.equal((await post(v13Heavy)).receipt.ranked,true,'v14 arithmetic is validated');
  assert.equal((await get('/ranking?'+scope)).top.some(r=>r.score===2774),true);

  // Both movement-only fallback and a real recorder receipt keep the ranking scope/contract.
  assert.deepEqual(resultOnly(winner).challenge,winner.challenge);
  const storage=new Map();let requestedAll=false;
  const records=createRunRecords({storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},uuid:()=>crypto.randomUUID(),
    endpoint:'https://fixture',fetcher:(url,options)=>{if(url.includes('/ranking?'))requestedAll ||=new URL(url).searchParams.get('difficulty')==='all';return fetcher(url,options);}});
  await records.submit(make('ignored','normal',490,{diagnostics:'x'.repeat(560000)}));
  assert.equal(records.history[0].ranking,'confirmed');assert.ok(requestedAll);assert.equal(records.pending,0);
  await records.submit(make('ignored','normal',99999,{settings:{jumpVel:11}}));
  assert.equal(records.history[0].state,'saved');assert.equal(records.history[0].ranking,'excluded');assert.equal(records.pending,0);
  db.close();
  console.log('PASS fixed settings/custom preservation, practice/input preferences, time and combat multipliers, shared per-player score order, no stars, altered-condition exclusion, retry, old records and map isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
