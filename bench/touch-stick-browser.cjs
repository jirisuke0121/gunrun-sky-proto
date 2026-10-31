const assert = require('node:assert/strict'), fs = require('node:fs');
const {spawn}=require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8792/';
const out = process.env.STICK_QA_OUT || 'browser-evidence/touch-stick';
fs.mkdirSync(out, { recursive: true });
(async () => {
  let server;
  if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8792','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: process.platform === 'darwin' ? ['--no-sandbox'] : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const map of ['index.html', 'canyon.html']) for (const rotation of [0, 1, -1]) {
      const id = `${map.split('.')[0]}-${rotation}`, errors = [];
      const ctx = await browser.newContext({ viewport: rotation ? {width:390,height:844} : {width:844,height:390}, isMobile:true, hasTouch:true });
      await ctx.addInitScript(dir => { window.__hold = true; localStorage.setItem('gunrun-rotdir', String(dir)); }, rotation || 1);
      await ctx.route('https://**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
      await p.goto(base + map, {waitUntil:'domcontentloaded',timeout:120000});
      await p.waitForFunction(() => window.skyDash && document.body.dataset.skyHumanLoaded === 'true', null, {timeout:120000});
      await p.locator('#bStart').click();
      await p.evaluate(() => {
        const g=__game,c=g.P;window.stickEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>stickEvents.push([type,e.pointerId,e.target.id,e.clientX,e.clientY]),true);
        g.S.sendLog=g.S.autoFire=false;c.invuln=Infinity;
        // This probes touch movement on a clear terrain lane. Randomly spawned
        // enemies can overlap that lane and push the player even during their
        // spawn delay; invulnerability does not disable those collisions.
        for (const enemy of g.zombies) { enemy.dead=true; enemy.remove=true; }
        g.GAME.spawnT=Infinity;
        let lane;
        for(const n of g.NAV.nodes){
          const floors=g.solids.filter(s=>s.solid&&!s.off&&s.type!=='mono'&&Math.abs(s.maxY-n.y)<.05);
          for(const [dx,dz] of [[1,0],[0,-1],[-1,0],[0,1]]){
            let clear=true;
            for(let d=0;d<=3;d+=.25){const x=n.x+dx*d,z=n.z+dz*d;
              if(!g.freeAt(x,n.y+.03,z,.3,1.75)||!floors.some(s=>x>s.minX+.03&&x<s.maxX-.03&&z>s.minZ+.03&&z<s.maxZ-.03)){clear=false;break;}}
            if(clear){lane={at:[n.x,n.y+.01,n.z],yaw:Math.atan2(-dx,-dz)};break;}
          }if(lane)break;
        }
        if(!lane)throw Error('No clear standing lane for touch input probe');
        window.stickSpawn=lane.at;window.stickYaw=lane.yaw;
        window.stickReset=()=>{skySwing.reset();c.pos.fromArray(stickSpawn);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.jumpBuf=c.slideBuf=0;c.edgeJump=false;c.edgeOff=null;c.lastGround.copy(c.pos);c.yaw=stickYaw;c.pitch=0;skyFollowCamera.reset();};
        window.stickTick=n=>{for(let i=0;i<n;i++)g.frameOnce(1/60);};
        stickReset();stickTick(2);g.cam(0);
      });
      const cdp = await ctx.newCDPSession(p);
      const point = async (x,y,id=1) => p.evaluate(({x,y,id})=>{
        const r=+document.documentElement.dataset.skyRotation||0;
        return {id,x:r>0?innerWidth-y:r<0?y:x,y:r>0?x:r<0?innerHeight-x:y};
      }, {x,y,id});
      const snapshot = () => p.evaluate(() => {
        const s=document.getElementById('stick'),r=s.getBoundingClientRect(),h=document.getElementById('dashStatus');
        return {on:s.classList.contains('on'),opacity:+getComputedStyle(s).opacity,pointer:getComputedStyle(s).pointerEvents,
          left:+parseFloat(s.style.left),top:+parseFloat(s.style.top),knob:document.getElementById('knob').style.transform,knobRendered:getComputedStyle(document.getElementById('knob')).transform,
          rect:{x:r.x,y:r.y,width:r.width,height:r.height},vw:innerWidth,vh:innerHeight,
          events:window.stickEvents.slice(-12),input:{...__skyInternals.inputState},status:h.textContent,underLife:h.previousElementSibling?.classList.contains('life'),position:__game.P.pos.toArray(),speed:Math.hypot(__game.P.vel.x,__game.P.vel.z),yaw:__game.P.yaw,viewYaw:skyFollowCamera.frame(0)?.yaw??__game.P.yaw};
      });
      const idle = await snapshot();
      assert.ok(!idle.on && idle.opacity > 0 && idle.opacity < .5 && idle.pointer === 'none');
      assert.equal(idle.status,'速度 +0%');assert.ok(idle.underLife);
      assert.ok(idle.rect.x>=0&&idle.rect.y>=0&&idle.rect.x+idle.rect.width<=idle.vw&&idle.rect.y+idle.rect.height<=idle.vh,JSON.stringify(idle));
      await p.screenshot({path:`${out}/${id}-idle.png`});
      assert.ok(await p.locator('#dashStatus').isVisible());
      await p.evaluate(()=>{skyDash.rewardSwing();__game.cam(0);});
      const starts = [{x:95,y:215},{x:290,y:280},{x:350,y:175}], probes = [];
      for (const start of starts) {
        await p.evaluate(()=>stickReset());
        const a=await point(start.x,start.y),b=await point(start.x,start.y-56);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});
        // Pointer moves may be coalesced until the next browser frame.
        await p.waitForFunction(()=>__skyInternals.inputState.y<=-.99,null,{timeout:3000});
        await p.evaluate(()=>stickTick(8));const active=await snapshot();
        assert.ok(active.on&&active.opacity>.8&&Math.abs(active.left-start.x)<1&&Math.abs(active.top-start.y)<1,JSON.stringify(active));
        assert.ok(active.speed>1&&active.knob.includes('-56px'),JSON.stringify(active));
        await p.screenshot({path:`${out}/${id}-active.png`});
        // A second finger looks around; releasing it leaves the movement thumb active.
        const right=await point(650,170,2),rightMoved=await point(680,170,2);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[b,right]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b,rightMoved]});
        await p.waitForFunction(()=>__skyInternals.inputState.lx===680,null,{timeout:3000});
        const look=await snapshot();assert.ok(Math.abs(look.viewYaw-active.viewYaw)>.001,JSON.stringify({id,look,active,right,rightMoved}));
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[rightMoved]});
        await p.waitForFunction(()=>__skyInternals.inputState.lookId===null,null,{timeout:3000});
        await p.evaluate(()=>stickTick(2));const oneLeft=await snapshot();assert.ok(oneLeft.on,JSON.stringify(oneLeft));
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        const released=await snapshot();assert.ok(!released.on&&released.opacity>0&&released.opacity<.5&&released.knobRendered==='none');
        probes.push({start,active,released});
      }
      const a=await point(140,260),b=await point(140,204);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});
      await p.evaluate(()=>__game.setMode('pause'));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await p.evaluate(()=>__game.setMode('play'));
      assert.ok(!(await snapshot()).on,'pause returns the visual to its waiting marker');
      await p.evaluate(()=>{skyDash.step(5);__game.cam(0);});assert.equal(await p.evaluate(()=>skyDash.swingRemaining),0);assert.ok(await p.locator('#dashStatus').isVisible());assert.equal(await p.locator('#dashStatus').innerText(),'速度 +0%');
      assert.deepEqual(errors,[]);results.push({id,idle,probes,errors});
      fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
      console.log('PASS',id,'three left-zone origins, movement, second-finger look/release, idle marker, pause, speed below life');
      await ctx.close();
    }
  } finally { await browser.close(); server?.kill(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
