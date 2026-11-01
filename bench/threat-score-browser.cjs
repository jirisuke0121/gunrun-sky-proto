// Real WebGL, native terrain FIELD/raycast, zombie damage, audio graph and UI.
// Positions are controlled to isolate eligibility; this is not a human play test.
const assert = require('node:assert/strict'), fs = require('node:fs');
const {spawn} = require('node:child_process'), {chromium} = require('playwright');
const port=Number(process.env.SKY_TEST_PORT||18798),base=`http://127.0.0.1:${port}/`,out='browser-evidence/threat-score';
(async () => {
  let browser, server; const results = [];
  try {
    fs.mkdirSync(out, {recursive: true});
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {stdio: 'ignore'});
    for (let i=0;i<60;i++) { if (await fetch(base).then(r=>r.ok,()=>false)) break; await new Promise(r=>setTimeout(r,100)); }
    for(const file of ['index.html','canyon.html','threat-score.js','challenge-score.js'])
      assert.equal(await fetch(base+file).then(r=>r.text()),fs.readFileSync(file,'utf8'),'local server source: '+file);
    browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    for (const map of ['index.html','canyon.html']) for (const lang of ['ja','en']) {
      const touch = lang === 'en';
      const context = await browser.newContext({locale:lang==='ja'?'ja-JP':'en-US',
        viewport:touch?{width:844,height:390}:{width:1280,height:720}, hasTouch:touch,isMobile:touch});
      await context.addInitScript(()=>window.__hold=true);
      let posts=0;
      await context.route('https://**/*',route=>{if(route.request().method()==='POST')posts++;
        return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'});});
      const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
      page.setDefaultTimeout(90000); await page.goto(base+map);
      await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready&&window.skyDecoy);
      const toggle=await page.locator('#langToggle').boundingBox();
      assert.ok(toggle&&toggle.y>=0&&toggle.y+toggle.height<=page.viewportSize().height,'language switch inside home viewport');
      if(touch)await page.locator('#bStart').tap();else await page.locator('#bStart').click();
      const evidence=await page.evaluate(async()=>{
        const g=__game, sky=__skyInternals, c=g.P, score=skyChallengeScore, nav=g.NAV;
        // Choose an actual straight, walkable strip, including the chaser's space.
        const start=nav.nodes.find(n=>Math.abs(n.y)<.1&&Array.from({length:37},(_,i)=>i*.5-3).every(dx=>{
          const id=g.nodeAt(n.x+dx,n.y+.1,n.z);
          return id>=0&&Math.abs(nav.nodes[id].y-n.y)<.1&&
            !sky.raycast(n.x+dx,n.y+1.1,n.z,1,0,0,.5);
        }));
        if(!start)throw Error('No native walkable strip');
        for(const e of g.zombies)sky.ue.remove(e.m.root);g.zombies.length=0;
        c.pos.set(start.x,start.y+.0001,start.z);c.vel.set(0,0,0);c.state='normal';c.invuln=0;
        const enemy=new g.Zombie(start.x-3,start.y+.0001,start.z);
        enemy.spawnT=0;enemy.rise=null;enemy.fall=null;g.zombies.push(enemy);
        let x=start.x;
        const tick=(n,{move=true,follow=true}={})=>{for(let i=0;i<n;i++){
          if(move)x+=.45;c.pos.x=x;c.node=g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z);
          if(follow){enemy.pos.set(x-3,start.y+.0001,start.z);enemy.node=g.nodeAt(enemy.pos.x,enemy.pos.y+.1,enemy.pos.z);}
          g.updateField();g.GAME.t+=.15;score.step(.15);score.sync();
        }};
        tick(24);const moving={...score.threat()},earned=score.current().survival;
        if(moving.count!==1||moving.rate<60||earned<=100)throw Error('Native pursuit did not earn');
        tick(3,{move:false});const stationary=score.current().survival;
        if(stationary!==earned||score.threat().rate!==0)throw Error('Stopped player kept earning');
        const stoppedAt=score.threat().pressureSeconds;
        for(const state of ['swing','ledge']){c.state=state;tick(1);if(score.threat().rate)throw Error(state+' earned');}
        c.state='normal';c.invuln=g.time+10;tick(1);c.invuln=0;
        if(score.threat().pressureSeconds!==stoppedAt)throw Error('Invulnerability earned');
        enemy.stun=4;tick(1);if(score.threat().count)throw Error('Stunned enemy counted');enemy.stun=0;
        c.yaw=Math.PI/2;
        if(!skyFlashbang.throw())throw Error('Flashbang unavailable');skyFlashbang.tick(.3);tick(1);
        if(!skyFlashbang.blinded(enemy)||score.threat().count)throw Error('Flashbang target counted');
        tick(14);
        if(!document.getElementById('threatFeedback').hidden&&document.getElementById('threatFeedback').textContent.startsWith('ESCAPED'))throw Error('Nearby flash-blinded enemy falsely escaped');
        if(/引き離して|pulled away/.test(document.getElementById('threatHint').textContent))throw Error('A disabled nearby enemy is not a separation');
        skyFlashbang.clear();enemy.stun=0;
        if(!skyDecoy.activate())throw Error('Decoy unavailable');tick(1);
        if(score.threat().count)throw Error('Decoy target counted');skyDecoy.clear();
        enemy.pos.y=start.y+5;tick(1,{follow:false});if(score.threat().count)throw Error('Other floor counted');
        // Real occluding terrain within the same reachable neighbourhood.
        const wallNode=nav.nodes.find(n=>Math.abs(n.y-start.y)<.1&&Math.hypot(n.x-c.pos.x,n.z-c.pos.z)>2&&
          Math.hypot(n.x-c.pos.x,n.z-c.pos.z)<15&&Number.isFinite(g.FIELD[n.id])&&g.FIELD[n.id]<26&&
          sky.raycast(n.x,n.y+1.1,n.z,(c.pos.x-n.x)/Math.hypot(n.x-c.pos.x,n.z-c.pos.z),0,
            (c.pos.z-n.z)/Math.hypot(n.x-c.pos.x,n.z-c.pos.z),Math.hypot(n.x-c.pos.x,n.z-c.pos.z)-.15));
        if(!wallNode)throw Error('No real wall scenario');
        enemy.pos.set(wallNode.x,wallNode.y,wallNode.z);enemy.node=wallNode.id;
        tick(1,{move:false,follow:false});if(score.threat().count)throw Error('Wall-separated enemy counted');
        // Start a fresh chase, then separate without killing its original chaser.
        score.reset();g.GAME.t=0;x=start.x;c.pos.set(x,start.y+.0001,start.z);tick(24);
        const beforeEscape=score.current().total;
        const ctx=sky.Ut.ctx,master=sky.Ut.master,notes=[],nativeOsc=ctx.createOscillator.bind(ctx);
        ctx.createOscillator=()=>{const o=nativeOsc();notes.push(o);return o;};
        enemy.pos.set(x-40,start.y,start.z);enemy.node=-1;tick(14,{move:false,follow:false});
        await Promise.resolve();
        const escaped=document.getElementById('threatFeedback').textContent;
        if(!escaped.startsWith('ESCAPED')||score.current().total!==beforeEscape)throw Error('Escape cue/score');
        const escapeNotes=notes.map(o=>o.frequency.value);
        if(escapeNotes.length||score.feedbackState().sounds.at(-1)?.key!=='escape')throw Error('Escape must use the ported Unity sample');
        notes.length=0;
        // Native hurt/die hooks, including capped overkill, and the actual cue graph.
        // Retain the whole event's PCM on the audio thread. A single delayed
        // main-thread analyser read can miss a short cue under rendering load.
        const workletUrl=URL.createObjectURL(new Blob([`class CuePeak extends AudioWorkletProcessor {
          constructor(){super();this.peak=0;this.port.onmessage=e=>{const p=this.peak;this.peak=0;this.port.postMessage(p)}}
          process(inputs){for(const channel of inputs[0]||[])for(const v of channel)this.peak=Math.max(this.peak,Math.abs(v));return true}
        }registerProcessor('cue-peak',CuePeak);`],{type:'text/javascript'}));
        await ctx.audioWorklet.addModule(workletUrl);URL.revokeObjectURL(workletUrl);
        const meter=new AudioWorkletNode(ctx,'cue-peak');master.connect(meter);meter.connect(ctx.destination);
        const readPeak=()=>new Promise(resolve=>{meter.port.onmessage=e=>resolve(e.data);meter.port.postMessage('read')});
        await readPeak();
        enemy.pos.set(x-3,start.y,start.z);enemy.hp=4;enemy.hurt(1,1,0,.6,0);
        const hit=document.getElementById('threatHit').textContent;
        const damageBefore=score.current().damageUnits;enemy.hurt(99,1,0,.6,0);score.sync();
        if(score.current().damageUnits-damageBefore!==3)throw Error('Overkill inflated score');
        const killNotes=notes.map(o=>o.frequency.value);
        if(killNotes.some(hz=>hz===880||hz===1320)||!score.feedbackState().sounds.some(e=>e.key==='kill'))throw Error('Kill sample mismatch: '+JSON.stringify({killNotes,feedback:score.feedbackState(),mode:g.mode,volume:sky.U.volume,ctx:ctx.state,killHook:String(sky.Tt.kill).slice(0,150)}));
        const kill=document.getElementById('threatFeedback').textContent;
        await new Promise(r=>setTimeout(r,300));const audible=await readPeak();
        master.gain.value=0;await new Promise(r=>setTimeout(r,50));await readPeak();
        score.killed();await new Promise(r=>setTimeout(r,300));const muted=await readPeak();
        if(audible<.001||muted>.00001)throw Error(`Cue volume/mute graph: audible=${audible}, muted=${muted}, context=${ctx.state}`);
        master.disconnect(meter);meter.disconnect();master.gain.value=sky.U.volume;ctx.createOscillator=nativeOsc;
        const frozen=score.current().total;tick(14,{move:false,follow:false});
        if(document.getElementById('threatFeedback').textContent.startsWith('ESCAPED')||score.current().total!==frozen)throw Error('All killed counted as escape');
        // Real capped HP loss drives the ported damage flights and medal, never
        // another score award when the animation arrives.
        for(let i=0;i<2;i++){
          const target=new g.Zombie(c.pos.x-3,start.y+.0001,c.pos.z);target.spawnT=0;target.rise=null;target.hp=4;g.zombies.push(target);
          target.hurt(99,1,0,.6,0);
        }
        const beforeFlights=score.current().total;tick(20,{move:false,follow:false});
        const feedbackState=score.feedbackState();
        if(score.current().total!==beforeFlights||feedbackState.arrivedDamage!==12||feedbackState.milestones!==1||feedbackState.activeFlights!==0)throw Error('Feedback duplicated points or lost real damage: '+JSON.stringify(feedbackState));
        const beforePause=score.current().total;g.setMode('pause');score.step(1);score.sync();
        if(score.current().total!==beforePause)throw Error('Pause earned');
        if(!document.getElementById('threatScoreHud').hidden||!document.getElementById('combatFeedback').hidden||score.feedbackState().activeVoices)throw Error('Feedback must clear and mute in pause');
        await Promise.resolve();const pause=document.getElementById('unityPauseTotal').textContent;
        g.setMode('play');g.cam(0);g.frameOnce(0);score.sync();score.killed();await Promise.resolve();
        const status=document.getElementById('threatStatus').textContent;
        return{start:[start.x,start.y,start.z],moving,earned,stationary,wallNode:wallNode.id,escaped,hit,kill,killNotes,escapeNotes,
          audible,muted,pause,status,feedbackState,total:score.current().total,score:score.current(),lang:document.documentElement.lang};
      });
      assert.equal(evidence.lang,lang);assert.match(evidence.hit,/DMG/);assert.match(evidence.kill,/KILL/);
      assert.match(evidence.status,lang==='ja'?/脅威/:/Threat/);
      assert.match(evidence.pause,lang==='ja'?/合計/:/Total/);
      assert.deepEqual(errors,[]);assert.equal(posts,0);
      assert.equal(await page.locator('#threatFeedback').isVisible(),true,'kill cue visible during the first run');
      if(await page.locator('#startGuide').count())assert.equal(await page.locator('#startGuide').isVisible(),false,'first-run guide yields to feedback');
      const feedbackLayout=await page.evaluate(()=>{
        const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
        return {stack:box('damageStack'),total:box('unityTotal'),menu:box('bSettings'),badge:box('threatFeedback')};
      });
      for(const id of ['stack','badge']){
        const b=feedbackLayout[id];assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=page.viewportSize().width&&b.y+b.height<=page.viewportSize().height,id+' inside viewport');
        for(const other of ['total','menu']){const a=feedbackLayout[other];assert.ok(b.x+b.width<=a.x||a.x+a.width<=b.x||b.y+b.height<=a.y||a.y+a.height<=b.y,id+' leaves '+other+' readable');}
      }
      await page.screenshot({path:`${out}/${map}-${lang}.png`});
      await page.evaluate(()=>{__game.endGame('caught');__game.advance(1.5);skyChallengeScore.sync();});
      await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
      assert.equal(await page.locator('#threatScoreHud').isVisible(),false,'threat HUD hidden on results');
      const result=await page.locator('#unityResultCard').getAttribute('data-score');
      assert.equal(JSON.parse(result).total,evidence.total,'result freezes the earned total');
      if(lang==='en')assert.doesNotMatch(await page.locator('#unityResultCard').innerText(),/[\u3040-\u30ff\u4e00-\u9fff]/,'result fully translated');
      assert.equal(await page.locator('.uc-breakdown>div').count(),3,'evasion, damage and kill rows survive the lobby/result merge');
      for(const id of ['unitySurvivalFormula','unityDamageFormula','unityKillFormula','unityResultEquation'])
        assert.equal(await page.locator('#'+id).isVisible(),true,'score arithmetic is visible without expanding: '+id);
      const frozen=JSON.parse(result);
      assert.equal(await page.locator('#unityResultEquation').innerText(),
        [frozen.survival,frozen.damage,frozen.kill].map(n=>n.toLocaleString('ja-JP')).join(' + ')+' = '+frozen.total.toLocaleString('ja-JP')+' pt');
      assert.equal(await page.locator('#unityScoreMath').count(),0,'core breakdown is never collapsed');
      await page.screenshot({path:`${out}/${map}-${lang}-result.png`});
      if(touch){
        await page.setViewportSize({width:844,height:320});
        await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.tiny==='true');
        for(const id of ['unityResultTotal','unityResultSurvival','unityResultDamage','unityResultKill','unitySurvivalFormula','unityDamageFormula','unityKillFormula','unityResultEquation','unityRetry','unityMenu','unityMore']){
          const box=await page.locator('#'+id).boundingBox();
          assert.ok(box&&box.y>=0&&box.y+box.height<=320,id+' remains in the tiny viewport');
        }
        await page.screenshot({path:`${out}/${map}-${lang}-tiny.png`});
      }
      results.push({map,lang,touch,...evidence,posts,errors});
      console.log('PASS',map,lang,'native threat/stop/hang/invulnerability/stun/decoy/floor/wall, HIT/KILL/ESCAPED, audio/mute and pause');
      await context.close();
    }
    fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  } finally {await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
