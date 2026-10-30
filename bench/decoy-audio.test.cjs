const assert=require('node:assert/strict');
(async()=>{
 const {renderDecoySound,createDecoyAudio}=await import('../decoy-audio.js');
 for(const rate of [44100,48000]) {
  const cast=renderDecoySound('cast',rate),loop=renderDecoySound('loop',rate);
  assert.ok(cast.every(Number.isFinite)&&loop.every(Number.isFinite));
  assert.equal(loop.length,rate);assert.equal(cast[0],0);assert.ok(Math.abs(cast.at(-1))<.002);
  assert.ok(Math.max(...cast.map(Math.abs))>.4);assert.ok(Math.max(...cast.map(Math.abs))<1);
  assert.ok(Math.abs(loop[0]-loop.at(-1))<.01,'seamless loop boundary');
  const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
  assert.ok(rms(loop)>.04&&rms(loop)<rms(cast));
 }
 const sources=[],param=()=>({value:0,setValueAtTime(v){this.value=v},linearRampToValueAtTime(v){this.value=v},cancelScheduledValues(){}});
 const ctx={state:'running',sampleRate:48000,currentTime:0,createBuffer:(n,l,r)=>({duration:l/r,copyToChannel(){}}),createGain:()=>({gain:param(),connect(){},disconnect(){}}),createBufferSource:()=>{const s={connect(){},disconnect(){},start(t,offset){this.offset=offset},stop(){this.stopped=true;this.onended?.()}};sources.push(s);return s;}};
 const sound=createDecoyAudio({ctx,master:{}});
 sound.start();assert.equal(sources.length,2);assert.ok(sources[1].loop);assert.ok(sound.active);
 sound.sync(true,.4);assert.equal(sources.length,2,'no stacked loops each frame');
 sound.sync(false);assert.ok(sources.every(s=>s.stopped));assert.equal(sound.active,false);
 sound.sync(true,2.3);assert.ok(Math.abs(sources[2].offset-.3)<1e-8);assert.equal(sound.stats.casts,1,'resume does not replay activation');
 sound.stop();assert.equal(sound.active,false);
 console.log('PASS distinct cast/hum synthesis, seamless loop, sample rates, gain bounds, pause/resume phase and node cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
