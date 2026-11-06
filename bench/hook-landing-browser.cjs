// Real map geometry, hook controller, air input, gravity and capsule collision.
// Fixtures use visible in-range approach nodes; no position fixes during flight.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process'), { chromium } = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8836/';
const out = 'browser-evidence/hook-landing';
(async () => {
  let browser, server;
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', '8836', '--bind', '127.0.0.1'], {stdio:'ignore'});
      for (let i=0;i<60;i++) {
        if (await fetch(base).then(r=>r.ok,()=>false)) break;
        await new Promise(r=>setTimeout(r,100));
      }
    }
    browser = await chromium.launch({headless:true,
      executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    fs.mkdirSync(out,{recursive:true});
    for (const touch of [false,true]) for (const map of ['index','canyon']) {
      const context = await browser.newContext({locale:'ja-JP',
        viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
      await context.addInitScript(()=>window.__hold=true);
      await context.route('https://**/*',r=>r.fulfill({status:200,
        contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
      const page=await context.newPage(),errors=[];
      page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+map+'.html');
      await page.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyHookLanding);
      await page.locator('#bStart').click();
      const result=await page.evaluate(({touch})=>{
        const g=__game,s=__skyInternals,c=g.P,dt=1/120,rows=[],fixtures=[];
        g.S.sendLog=false;g.GAME.spawnT=g.GAME.surgeT=1e9;
        g.SCR.off=g.PACE.off=g.MARK.off=true;
        for(const z of [...g.zombies]){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool);}
        g.zombies.length=0;
        const off=()=>{for(const k of Object.keys(g.keys))g.keys[k]=false;
          Object.assign(s.inputState,{on:false,x:0,y:0});};
        for(const [id,a] of s.us.entries()) {
          const candidates=g.NAV.nodes.filter(n=>{
            const dx=a[0]-n.x,dy=a[1]-(n.y+1.62),dz=a[2]-n.z,d=Math.hypot(dx,dy,dz);
            return d>5&&d<g.S.hookRange&&n.y<a[1]+.2&&
              !s.raycast(n.x,n.y+1.62,n.z,dx/d,dy/d,dz/d,d-.6)&&g.freeAt(n.x,n.y+.02,n.z,.32,1.75);
          });
          candidates.sort((n,m)=>Math.abs(Math.hypot(a[0]-n.x,a[2]-n.z)-12)-
            Math.abs(Math.hypot(a[0]-m.x,a[2]-m.z)-12));
          const chosen=[];
          for(const n of candidates) {
            const angle=Math.atan2(n.z-a[2],n.x-a[0]);
            if(chosen.every(x=>Math.abs(Math.atan2(Math.sin(x.angle-angle),Math.cos(x.angle-angle)))>.65)) {
              chosen.push({n,angle});fixtures.push({id,a,from:[n.x,n.y,n.z]});
              if(chosen.length>=6)break;
            }
          }
        }
        function setup(f) {
          off();skyHookLanding.cancel();skySwing.reset();g.GAME.over=false;g.GAME.t=0;g.setMode('play');
          g.placeAt({x:f.from[0],y:f.from[1]+.0001,z:f.from[2],
            yaw:Math.atan2(f.from[0]-f.a[0],f.from[2]-f.a[2])});skyFollowCamera.reset();
          Object.assign(c,{state:'hook',hook:s.us[f.id],hookT:0,onGround:false,
            jumpBuf:0,hookPressed:false,crouchPressed:false,coyote:0,edgeJump:false,
            hookCD:0,life:3,invuln:1e9,setCD:0});c.vel.set(0,0,0);
        }
        for(const f of fixtures) for(const input of ['none','forward','side']) {
          setup(f);
          if(touch)Object.assign(s.inputState,{on:input!=='none',x:input==='side'?1:0,y:input==='forward'?-1:0});
          else {g.keys.KeyW=input==='forward';g.keys.KeyD=input==='side';}
          let release=null,land=null,target=null,peakPullSpeed=0,penetration=false;
          for(let tick=0;tick<600;tick++) {
            g.advance(dt);
            if(c.state==='hook')peakPullSpeed=Math.max(peakPullSpeed,c.vel.length());
            if(!release&&c.state!=='hook')release={tick,p:c.pos.toArray(),v:c.vel.toArray()};
            if(skyHookLanding.active)target=skyHookLanding.active.floor.maxY;
            if(target!==null&&!g.freeAt(c.pos.x,c.pos.y+.02,c.pos.z,c.r,c.h-.03))penetration=true;
            if(release&&c.onGround){land={tick,p:c.pos.toArray()};break;}
            if(c.pos.y<-21||g.GAME.over)break;
          }
          const life=c.life;
          if(target!==null&&land)for(let i=0;i<60;i++)g.advance(dt);
          rows.push({id:f.id,from:f.from,input,release,land,target,peakPullSpeed,
            penetration,lifeBefore:life,lifeAfter:c.life,endGround:c.onGround,endState:c.state,end:c.pos.toArray()});
        }
        // A fresh manual release uses the real keyboard/touch jump handler.
        const f=fixtures.find(f=>f.id===0),manual=[];
        for(let trial=0;trial<2;trial++) {
          setup(f);for(let i=0;i<24;i++)g.advance(dt);
          // Include the interrupted-guidance case from a previous arrival.
          if(trial)skyHookLanding.begin(f.a);
          if(touch) {
            const b=document.getElementById('tJump');
            for(const type of ['pointerdown','pointerup'])b.dispatchEvent(new PointerEvent(type,
              {pointerId:777,pointerType:'touch',bubbles:true,cancelable:true}));
          } else for(const type of ['keydown','keyup'])dispatchEvent(new KeyboardEvent(type,{code:'Space',bubbles:true}));
          g.advance(dt);manual.push({state:c.state,vy:c.vel.y,edgeJump:c.edgeJump,active:!!skyHookLanding.active});
        }
        off();g.cam(0);g.frameOnce(0);
        return {rows,manual,fixtureCount:fixtures.length,gl:g.debug.renderer.getContext().getError()};
      },{touch});
      fs.writeFileSync(`${out}/${map}-${touch?'touch':'desktop'}.json`,JSON.stringify({result,errors},null,2));
      await page.screenshot({path:`${out}/${map}-${touch?'touch':'desktop'}.png`});
      assert.deepEqual(errors,[]);assert.equal(result.gl,0);
      const assisted=result.rows.filter(r=>r.target!==null);
      assert.ok(assisted.length>=(map==='index'?140:80),'enough automatic arrivals exercised');
      for(const r of assisted) {
        const label=JSON.stringify({map,touch,...r});
        assert.ok(r.land&&r.land.p[1]>=r.target-.1,label);
        assert.ok(r.endGround||['ledge','ladder','zip','swing'].includes(r.endState)||r.end[1]>=r.target-.45,label);
        assert.equal(r.lifeAfter,r.lifeBefore,label);assert.equal(r.penetration,false,label);
        assert.ok(r.peakPullSpeed>=17.9,'keep full hook pulling speed');
      }
      for(const m of result.manual) {
        assert.equal(m.state,'normal');assert.ok(m.vy>=5);assert.ok(m.edgeJump);assert.equal(m.active,false);
      }
      console.log(`PASS ${map} ${touch?'touch':'desktop'}: ${assisted.length} automatic landings, 3 input patterns, full pulling speed, free manual releases`);
      await context.close();
    }
  } finally {await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
