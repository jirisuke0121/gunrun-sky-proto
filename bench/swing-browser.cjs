const assert = require('node:assert/strict'), fs = require('node:fs'), {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8773/';
const output = 'browser-evidence/swing'; fs.mkdirSync(output, {recursive:true});
(async()=>{
  let browser, server;
  const results=[];
  try {
    if (!process.env.RUNNING_QA_URL) {
      server=spawn('python3',['-m','http.server','8773','--bind','127.0.0.1'],{stdio:'ignore'});
      for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
    }
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    for(const touch of [false,true]) {
      const ctx=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
      await ctx.addInitScript(()=>window.__hold=true);
      await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
      const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
      await p.goto(base+'canyon.html');await p.waitForFunction(()=>window.skySwing&&window.skyHumanView);
      if(await p.locator('#humanSel [data-human="unity"]').count()) await p.locator('#humanSel [data-human="unity"]').click();
      await p.waitForFunction(()=>window.skyHumanView.choice==='unity'&&document.body.dataset.skyHumanLoaded==='true',null,{timeout:90000});
      console.log('loaded',touch?'touch':'desktop');
      await p.locator('#bStart').click();
      await p.waitForFunction(()=>__game.mode==='play');
      await p.evaluate(()=>{
        const g=__game,c=g.P;g.S.sendLog=false;c.invuln=Infinity;
        window.swingQA={trace:[],frames:[]};
        window.stepSwing=(frames=1,render=true)=>{for(let f=0;f<frames;f++){
          for(let i=0;i<4;i++)g.playerStep(1/120);
          g.cam(1/30);skyHumanView.update(1/30);if(render){g.debug.renderer.clear();g.debug.renderer.render(__skyInternals.ue,__skyInternals.Se);}
          const a=skySwing.active;
          swingQA.trace.push({pos:c.pos.toArray(),state:c.state,bar:a?.bar.id,angle:a?.angle,handError:+document.body.dataset.skyHumanHandError||0,clip:document.body.dataset.skyHumanClip});
        }};
        window.startSwingQA=(at)=>{skySwing.reset();c.pos.set(...at);c.vel.set(0,0,0);c.state='normal';c.h=1.75;c.onGround=true;c.yaw=-Math.PI/2;c.pitch=0;c.camY=at[1]+1.62;c.jumpBuf=0;c.edgeOff=null;c.catchCD=0;c.crouchPressed=false;g.keys.KeyW=true;};
      });
      const jump=async()=>{if(touch)await p.locator('#tJump').tap();else await p.keyboard.press('Space');};
      // Start at the ring, then use actual keyboard/touch jump events. No
      // position changes between this first jump and the final upper landing.
      await p.evaluate(()=>{startSwingQA([-20.39,4.0001,-6]);__game.keys.KeyW=false;});
      await jump();await p.evaluate(()=>stepSwing(3));
      await jump();
      const wall=await p.evaluate(()=>{
        const c=__game.P;__game.keys.KeyW=true;
        const before=__game.stats.walljumps;stepSwing(1);const kicked=__game.stats.walljumps-before;
        let landed=false;for(let i=0;i<30;i++){stepSwing();if(c.onGround&&c.pos.x>-18&&c.pos.x<-15){landed=true;break;}}
        return{kicked,landed,pos:c.pos.toArray()};
      });
      assert.equal(wall.kicked,1,JSON.stringify(wall));assert.ok(wall.landed,JSON.stringify(wall));
      await jump();
      let captured=new Set();
      for(let f=0;f<130;f++) {
        const ready=await p.evaluate(()=>!!skySwing.active&&skySwing.active.angle>=.35&&skySwing.active.angle<.7&&skySwing.active.omega>1.1);
        if(ready)await jump();
        const state=await p.evaluate(()=>{
          stepSwing();
          return{bar:skySwing.active?.bar.id,angle:skySwing.active?.angle,ground:__game.P.onGround,pos:__game.P.pos.toArray(),handError:+document.body.dataset.skyHumanHandError||0};
        });
        if(state.bar&&!captured.has(state.bar)) {captured.add(state.bar);await p.screenshot({path:`${output}/${touch?'touch':'desktop'}-${state.bar}.png`});}
        if(captured.size===2&&state.ground&&state.pos[0]>-1.5&&state.pos[1]>7.9)break;
      }
      const route=await p.evaluate(()=>({trace:swingQA.trace,stats:__game.stats,pos:__game.P.pos.toArray(),ground:__game.P.onGround,gl:__game.debug.renderer.getContext().getError()}));
      results.push({touch,wall,...route});
      assert.equal(captured.size,2,JSON.stringify({pos:route.pos,ground:route.ground,stats:route.stats}));
      assert.ok(route.ground&&route.pos[0]>-1.5&&Math.abs(route.pos[1]-8)<.05,JSON.stringify({pos:route.pos,ground:route.ground,stats:route.stats}));
      assert.ok(route.trace.filter(x=>x.state==='swing').every(x=>x.handError<.025&&x.clip==='swing'),'hands stay on the bar while the body swings');
      assert.equal(route.gl,0);assert.deepEqual(errors,[]);
      await p.screenshot({path:`${output}/${touch?'touch':'desktop'}-landing.png`});
      console.log('route passed',touch?'touch':'desktop');
      // Holding the approach jump, including OS key repeat, never releases a
      // grip. A missed forward window comes around again after a full swing.
      await p.evaluate(()=>{startSwingQA([-16.9,5.2001,-6]);stepSwing(4);});
      let session;
      if(touch){
        const b=await p.locator('#tJump').boundingBox();session=await ctx.newCDPSession(p);
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:7}]});
      }else await p.keyboard.down('Space');
      const held=await p.evaluate(()=>{
        const bars=new Set(),angles=[];const before=__game.stats.barJumps||0;
        for(let i=0;i<135;i++){
          if(i%8===0)dispatchEvent(new KeyboardEvent('keydown',{code:'Space',repeat:true}));
          stepSwing(1,false);if(skySwing.active){bars.add(skySwing.active.bar.id);angles.push(skySwing.active.angle);}
        }
        return{bars:[...bars],active:!!skySwing.active,jumps:(__game.stats.barJumps||0)-before,min:Math.min(...angles),max:Math.max(...angles),pos:__game.P.pos.toArray()};
      });
      if(touch){await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}else await p.keyboard.up('Space');
      assert.ok(held.active&&held.bars.length===1&&held.jumps===0,JSON.stringify(held));
      assert.ok(held.min<-.5&&held.max>.5,'body swings back and forward rather than hanging still');results.at(-1).held=held;
      if(!touch)for(const phase of ['back','front']){
        await p.evaluate(phase=>{
          for(let i=0;i<100;i++){
            stepSwing(1,false);const a=skySwing.active;
            if(a&&a.omega>0&&(phase==='back'?a.angle<-.65:a.angle>.65))break;
          }
          __game.debug.renderer.clear();__game.debug.renderer.render(__skyInternals.ue,__skyInternals.Se);
        },phase);
        await p.screenshot({path:`${output}/body-${phase}.png`});
      }
      // A fresh press releases immediately on the next physics tick, even at
      // an unhelpful phase; it is never queued until a better launch angle.
      await jump();
      const released=await p.evaluate(()=>{stepSwing();return{active:!!skySwing.active,state:__game.P.state};});
      assert.equal(released.active,false);assert.notEqual(released.state,'swing');
      // Pause freezes the movement state; down input drops; reset clears it.
      const lifecycle=await p.evaluate(()=>{
        startSwingQA([-12.9,6.05,-6]);const c=__game.P;c.onGround=false;c.vel.x=5;stepSwing();
        const grabbed=!!skySwing.active;__game.setMode('pause');const before=c.pos.toArray();skySwing.step(.5,{fwdIn:1});const paused=c.pos.toArray();
        __game.setMode('play');skySwing.step(1/120,{fwdIn:-1});const dropped=c.state;
        startSwingQA([-12.9,6.05,-6]);c.onGround=false;c.vel.x=5;stepSwing();const ammo=__game.G.ammo;__skyInternals.fireWeapon();const heldAmmo=__game.G.ammo;
        skySwing.reset();return{grabbed,before,paused,dropped,reset:c.state,ammo,heldAmmo};
      });
      assert.ok(lifecycle.grabbed);assert.deepEqual(lifecycle.before,lifecycle.paused);assert.equal(lifecycle.dropped,'normal');assert.equal(lifecycle.reset,'normal');assert.equal(lifecycle.ammo,lifecycle.heldAmmo);
      const nav=await p.evaluate(()=>{
        const g=__game.NAV,nearest=p=>g.nodes.reduce((best,n)=>Math.hypot(n.x-p[0],n.y-p[1],n.z-p[2])<Math.hypot(g.nodes[best].x-p[0],g.nodes[best].y-p[1],g.nodes[best].z-p[2])?n.id:best,0);
        const visited=new Set(),q=[nearest(skySwingCourse.approach)];visited.add(q[0]);
        for(let i=0;i<q.length;i++)for(const id of g.out[q[i]]||[]){const e=g.E[id];if(!visited.has(e.to)){visited.add(e.to);q.push(e.to);}}
        return{pad:visited.has(nearest(skySwingCourse.pad)),exit:visited.has(nearest(skySwingCourse.exit))};
      });
      assert.deepEqual(nav,{pad:true,exit:true},'both waiting platforms remain accessible through zombie navigation');
      await ctx.close();
    }
    // The shared movement hook must remain inert in the old town.
    const p=await browser.newPage();await p.addInitScript(()=>window.__hold=true);await p.route('https://**/*',r=>r.abort());await p.goto(base+'index.html');await p.waitForFunction(()=>window.skySwing);
    assert.equal(await p.evaluate(()=>skySwing.course),undefined);await p.close();
    console.log('PASS: wall kick → pad → two actual bar catches/releases → upper spine, grip contact, PC/touch widths, pause/drop/reset, unchanged old town');
  } finally {
    fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
    await browser?.close();server?.kill();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
