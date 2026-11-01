const assert=require('node:assert/strict');
const names=require('../player-name.js');
// Nickname rule shared by the game and the Worker (same as NIGHTLINE's racer name).
assert.equal(names.normalize('runner'),'RUNNER');
assert.equal(names.normalize('  ｒｕｎｎｅｒ_1 '),'RUNNER_1','full-width letters are normalised, spaces trimmed');
assert.equal(names.normalize('ゆうすけ'),'ゆうすけ','Japanese letters are allowed');
for(const bad of ['a','x'.repeat(15),'a b','<b>x</b>','名前!','',' ',null,undefined,42])assert.equal(names.normalize(bad),'',`rejects ${JSON.stringify(bad)}`);
assert.equal(names.normalize('ab'),'AB');assert.equal(names.normalize('x'.repeat(14)),'X'.repeat(14));
(async()=>{
 const {createRunRecords}=await import('../run-records.js');
 const store=new Map(),sent=[];
 const records=createRunRecords({storage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},uuid:()=>crypto.randomUUID(),endpoint:'https://fixture',
  fetcher:async(url,options)=>{if(options?.method==='POST')sent.push(JSON.parse(options.body));return{ok:true,status:200,json:async()=>({receipt:{id:1,ranked:false}})}}});
 const run=()=>({t:60,reason:'caught',kind:'map',channel:'production',build:'fixture',mapKey:'old-town',challenge:{id:'normal',version:'x'},score:{total:1000},at:new Date().toISOString()});
 await records.submit(run());
 assert.ok(sent.length>=1&&!('name' in sent[0]),'no nickname chosen: nothing is sent');
 store.set('gunrun-name','RUNNER');
 await records.submit(run());
 assert.equal(sent.at(-1).name,'RUNNER','the saved nickname travels with the record');
 store.delete('gunrun-name');
 await records.submit({...run(),name:'FORGED'});
 assert.ok(!('name' in sent.at(-1)),'a name the player did not set on this device is not sent');
 console.log('PASS nickname rule, record carries the saved nickname only');
})().catch(e=>{console.error(e);process.exitCode=1});
