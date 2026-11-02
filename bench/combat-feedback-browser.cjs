// Real WebGL, native terrain FIELD/raycast, zombie damage, audio graph and UI.
// Positions are controlled to isolate eligibility; this is not a human play test.
const assert = require('node:assert/strict'), fs = require('node:fs');
const {spawn} = require('node:child_process'), {chromium} = require('playwright');
const port=Number(process.env.SKY_TEST_PORT||18798),base=`http://127.0.0.1:${port}/`,out='browser-evidence/combat-feedback';
(async () => {
  let browser, server; const results = [];
  try {
    fs.mkdirSync(out, {recursive: true});
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {stdio: 'ignore'});
    for (let i=0;i<60;i++) { if (await fetch(base).then(r=>r.ok,()=>false)) break; await new Promise(r=>setTimeout(r,100)); }
    for(const file of ['index.html','canyon.html','survival-score.js','challenge-score.js'])
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
        tick(24);const moving={...score.pursuit()};if(moving.count!==1)throw Error('Native pursuit was not detected');
        const beforeEscape=score.current().damage+score.current().kill;
        const ctx=sky.Ut.ctx,master=sky.Ut.master,notes=[],nativeOsc=ctx.createOscillator.bind(ctx);
        ctx.createOscillator=()=>{const o=nativeOsc();notes.push(o);return o;};
        enemy.pos.set(x-40,start.y,start.z);enemy.node=-1;tick(14,{move:false,follow:false});
        await Promise.resolve();
        const escaped=document.getElementById('threatFeedback').textContent;
        if(!escaped.startsWith('ESCAPED')||score.current().damage+score.current().kill!==beforeEscape)throw Error('Escape cue/score');
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
        const frozen=score.current().damage+score.current().kill;tick(14,{move:false,follow:false});
        if(document.getElementById('threatFeedback').textContent.startsWith('ESCAPED')||score.current().damage+score.current().kill!==frozen)throw Error('All killed counted as escape');
        // Real capped HP loss drives the ported damage flights and medal, never
        // another score award when the animation arrives.
        for(let i=0;i<2;i++){
          const target=new g.Zombie(c.pos.x-3,start.y+.0001,c.pos.z);target.spawnT=0;target.rise=null;target.hp=4;g.zombies.push(target);
          target.hurt(99,1,0,.6,0);
        }
        const beforeFlights=score.current().damage+score.current().kill;tick(20,{move:false,follow:false});
        const feedbackState=score.feedbackState();
        if(score.current().damage+score.current().kill!==beforeFlights||feedbackState.arrivedDamage!==12||feedbackState.milestones!==1||feedbackState.activeFlights!==0)throw Error('Feedback duplicated points or lost real damage: '+JSON.stringify(feedbackState));
        const beforePause=score.current().total;g.setMode('pause');score.step(1);score.sync();
        if(score.current().total!==beforePause)throw Error('Pause earned');
        if(!document.getElementById('combatFeedback').hidden||score.feedbackState().activeVoices)throw Error('Feedback must clear and mute in pause');
        await Promise.resolve();const pause=document.getElementById('unityPauseTotal').textContent;
        g.setMode('play');g.cam(0);g.frameOnce(0);score.sync();score.killed();await Promise.resolve();
        const status=document.getElementById('unityTimeFactor').textContent;
        return{start:[start.x,start.y,start.z],moving,escaped,hit,kill,killNotes,escapeNotes,
          audible,muted,pause,status,feedbackState,total:score.current().total,score:score.current(),lang:document.documentElement.lang};
      });
      assert.equal(evidence.lang,lang);assert.match(evidence.hit,/DMG/);assert.match(evidence.kill,/KILL/);
      assert.equal(evidence.status,lang==='ja'?'+495/30秒':'+495 / 30 s');
      assert.match(evidence.pause,lang==='ja'?/合計/:/Total/);
      assert.deepEqual(errors,[]);assert.equal(posts,0);
      assert.equal(await page.locator('#threatFeedback').isVisible(),true,'kill cue visible during the first run');
      if(await page.locator('#startGuide').count())assert.equal(await page.locator('#startGuide').isVisible(),false,'first-run guide yields to feedback');
      const feedbackLayout=await page.evaluate(()=>{
        const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
        return {stack:box('damageStack'),total:box('unityTotal'),menu:box('bSettings'),map:box('skyMinimap'),badge:box('threatFeedback')};
      });
      for(const id of ['stack','badge']){
        const b=feedbackLayout[id];assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=page.viewportSize().width&&b.y+b.height<=page.viewportSize().height,id+' inside viewport');
        for(const other of ['total','menu','map']){const a=feedbackLayout[other];assert.ok(b.x+b.width<=a.x||a.x+a.width<=b.x||b.y+b.height<=a.y||a.y+a.height<=b.y,id+' leaves '+other+' readable');}
      }
      await page.screenshot({path:`${out}/${map}-${lang}.png`});
      if(touch){
        await page.setViewportSize({width:390,height:844});
        await page.waitForFunction(()=>document.documentElement.classList.contains('rot'));
        const portrait=await page.evaluate(()=>{
          const g=__game,s=skyChallengeScore,c=g.P,target=new g.Zombie(c.pos.x+3,c.pos.y,c.pos.z);
          target.spawnT=0;target.rise=null;target.hp=4;g.zombies.push(target);target.hurt(99,1,0,.6,0);
          for(let i=0;i<34;i++)g.advance(1/60);s.sync();
          const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
          return {total:s.current().total,stack:box('damageStack'),badge:box('threatFeedback'),map:box('skyMinimap')};
        });
        evidence.total=portrait.total;evidence.portrait=portrait;
        for(const id of ['stack','badge']){const b=portrait[id],m=portrait.map;
          assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=390.1&&b.y+b.height<=844.1,id+' inside portrait viewport');
          assert.ok(b.x+b.width<=m.x||m.x+m.width<=b.x||b.y+b.height<=m.y||m.y+m.height<=b.y,id+' leaves portrait minimap readable');
        }
        await page.screenshot({path:`${out}/${map}-${lang}-portrait.png`});
        await page.setViewportSize({width:844,height:390});
      }
      await page.evaluate(()=>{__game.endGame('caught');__game.advance(1.5);skyChallengeScore.sync();});
      await page.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
      assert.equal(await page.locator('#combatFeedback').isVisible(),false,'feedback hidden on results');
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
      console.log('PASS',map,lang,'Infection damage flights/medal, KILL/ESCAPED, audio/mute, pause, minimap coexistence and results');
      await context.close();
    }
    fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  } finally {await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
