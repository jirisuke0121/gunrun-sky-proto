const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {renderGearSound}=await import('../gear-audio.js');
 const {JUMP_GUN,migrateJumpGunSettings}=await import('../jump-gun.js');
 for(const rate of [44100,48000])for(const kind of ['jump','flash']){
  const pcm=renderGearSound(kind,rate),peak=Math.max(...pcm.map(Math.abs));
  assert.ok(peak>.3&&peak<.9);assert.ok(pcm.every(Number.isFinite));assert.equal(pcm[0],0);
  assert.ok(Math.abs(pcm.at(-1))<.002);assert.ok(pcm.length>rate*.5&&pcm.length<rate*.7);
  let rms=0;for(let i=0;i<rate*.1;i++)rms+=pcm[i]*pcm[i];assert.ok(Math.sqrt(rms/(rate*.1))>.08);
 }
 assert.notDeepEqual(renderGearSound('jump').slice(0,4800),renderGearSound('flash').slice(0,4800));
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const old={jumpGunUp:11.2,jumpGunPush:8};assert.equal(migrateJumpGunSettings(old,storage),true);assert.deepEqual(old,{jumpGunUp:16,jumpGunPush:10});
 old.jumpGunUp=18;assert.equal(migrateJumpGunSettings(old,storage),false);assert.equal(old.jumpGunUp,18);
 values.clear();const custom={jumpGunUp:19.5,jumpGunPush:6};assert.equal(migrateJumpGunSettings(custom,storage),false);assert.deepEqual(custom,{jumpGunUp:19.5,jumpGunPush:6});
 assert.ok(JUMP_GUN.up**2/(2*20)>6);assert.equal(JUMP_GUN.maxUp,24);
 for(const file of ['index.html','canyon.html']){
  const s=fs.readFileSync(file,'utf8');assert.ok(s.includes('jumpGunUp:16,jumpGunPush:10'));assert.ok(/"jumpGunUp","[^"\n]+",4,24,\.2/.test(s));
 }
 const e=fs.readFileSync('enhancements.js','utf8');assert.ok(e.includes("if (weaponIndex === 12) { window.skyJumpGun.playSound(); return; }"));
 console.log('PASS original equipment audio, peak/tail/sample-rate bounds, jump default migration, custom preservation, stronger defaults and both settings UIs');
})().catch(e=>{console.error(e);process.exitCode=1});
