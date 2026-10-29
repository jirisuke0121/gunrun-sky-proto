const assert = require('node:assert/strict'), fs = require('node:fs'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8783/';
const out = 'browser-evidence/zombie-search'; fs.mkdirSync(out, { recursive: true });
(async () => {
  let server;
  if (!process.env.RUNNING_QA_URL) {
    server = spawn('python3', ['-m', 'http.server', '8783', '--bind', '127.0.0.1'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 100)); }
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: process.platform === 'darwin' ? ['--no-sandbox'] : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const touch of [false, true]) for (const map of ['index.html', 'canyon.html']) {
      const id = `${map.split('.')[0]}-${touch ? 'touch' : 'desktop'}`, errors = [];
      const ctx = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: touch, isMobile: touch });
      await ctx.addInitScript(() => window.__hold = true);
      await ctx.route('https://**/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"top":[],"total":0,"ok":true}' }));
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + map, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.skyZombieSearch && document.body.dataset.skyHumanLoaded === 'true', null, { timeout: 120000 });
      await page.locator('#bStart').click();
      const setup = await page.evaluate(() => {
        const g = __game, s = __skyInternals, c = g.P;
        g.S.sendLog = false; g.S.autoFire = g.S.aimAuto = false; c.invuln = Infinity;
        for (const e of g.zombies) s.ue.remove(e.m.root);g.zombies.length=0;
        g.GAME.spawnT=1e6;g.SCR.off=true;g.PACE.off=true;g.MARK.off=true;g.STALK.spawned=true;
        g.S.loseSight=1;g.S.senseT=10;skyZombieSearch.reset();
        const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
        const obstruction=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y-.25,dz=b.z-a.z,len=Math.hypot(dx,dy,dz);return s.raycast(a.x,a.y+1.5,a.z,dx/len,dy/len,dz/len,len-.1);};
        const visible=(a,b)=>!obstruction(a,b);
        const nodes=g.NAV.nodes.filter(n=>s.oe(n.x,n.y+.05,n.z,.31,1.8));
        let chosen;
        for(let i=0;i<nodes.length&&!chosen;i+=Math.max(1,Math.floor(nodes.length/180))){
          const a=nodes[i],b=nodes.find(n=>dist(a,n)>4&&dist(a,n)<9&&Math.abs(a.y-n.y)<.2&&visible(a,n));
          if(!b)continue;
          const hidden=nodes.find(n=>dist(a,n)>4&&dist(a,n)<16&&dist(b,n)<10&&Math.abs(a.y-n.y)<.2&&obstruction(a,n)?.b.type!=='door'&&!visible(a,n));
          if(hidden)chosen={a,b,hidden};
        }
        if(!chosen)throw Error('No real wall occlusion setup on this map');
        const place=p=>{c.pos.set(p.x,p.y+.01,p.z);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.ledge=c.ladder=c.zip=c.hook=null;c.jumpBuf=c.slideBuf=0;c.invuln=Infinity;c.lastGround.copy(c.pos);c.safe.copy(c.pos);};
        place(chosen.b);
        const enemy=new g.Zombie(chosen.a.x,chosen.a.y+.01,chosen.a.z);enemy.spawnT=0;enemy.stun=100;enemy.onGround=true;
        enemy.yaw=Math.atan2(chosen.a.x-chosen.b.x,chosen.a.z-chosen.b.z);g.zombies.push(enemy);
        window.searchQA={g,s,enemy,chosen,place,tick(seconds){for(let i=0;i<Math.ceil(seconds*60);i++)g.advance(1/60);g.cam(0);g.frameOnce(0);return this.state();},
          state(){return{phase:skyZombieSearch.state(enemy)?.phase,last:skyZombieSearch.state(enemy)?.last,remaining:skyZombieSearch.remaining,
            position:enemy.pos.toArray(),player:c.pos.toArray(),mode:g.mode,actualMode:s.modeRef(),time:g.GAME.t,over:g.GAME.over,mission:g.GAME.mission,loseSight:g.S.loseSight,
            spawn:enemy.spawnT,rise:enemy.rise,fall:enemy.fall,dead:enemy.dead,count:g.zombies.length,
            hud:document.getElementById('zombieSearchStatus').textContent,hidden:document.getElementById('zombieSearchStatus').hidden};}};
        return {a:chosen.a,b:chosen.b,hidden:chosen.hidden};
      });
      const chase = await page.evaluate(() => searchQA.tick(.9));assert.equal(chase.phase,'chase',JSON.stringify(chase));
      const escaped = await page.evaluate(() => { searchQA.place(searchQA.chosen.hidden);return searchQA.tick(3.1); });
      assert.equal(escaped.phase,'search',JSON.stringify(escaped));assert.ok(escaped.remaining>9,JSON.stringify(escaped));
      assert.ok(Math.abs(escaped.last.x-setup.b.x)<.05&&Math.abs(escaped.last.z-setup.b.z)<.05,'last sight is frozen at the visible point');
      assert.equal(escaped.hidden,false);assert.match(escaped.hud,/追跡を振り切った/);
      await page.screenshot({path:`${out}/${id}-escaped.png`});
      const gates=await page.evaluate(()=>{const q=searchQA,g=q.g,n=g.zombies.length;g.spawnZombie();g.surge();g.postAt(q.chosen.b,2,0,'test');return{before:n,after:g.zombies.length,squeeze:g.trySqueeze(2,2),warn:g.SCR.warn};});
      assert.equal(gates.after,gates.before,'rest blocks replacements, surges and ambushes');assert.equal(gates.squeeze,null);assert.equal(gates.warn,null);
      const midway=await page.evaluate(()=>searchQA.tick(5));assert.equal(midway.phase,'search');assert.ok(midway.remaining>4);assert.match(midway.hud,/捜索中/);
      await page.screenshot({path:`${out}/${id}-search.png`});
      const pause=await page.evaluate(()=>{const q=searchQA,before=skyZombieSearch.remaining;q.g.setMode('pause');q.tick(1);return{before,after:skyZombieSearch.remaining,hidden:document.getElementById('zombieSearchStatus').hidden};});
      assert.equal(pause.after,pause.before);assert.equal(pause.hidden,true);
      const expired=await page.evaluate(()=>{searchQA.g.setMode('play');return searchQA.tick(5.1);});
      assert.equal(expired.phase,'patrol');assert.equal(expired.remaining,0);assert.equal(expired.hidden,true);
      const walking=await page.evaluate(()=>{
        const q=searchQA,e=q.enemy;e.stun=0;
        // Only the wandering motion is isolated here; hide the player behind a
        // real solid plus a far location so no re-encounter changes the probe.
        q.place({x:250,y:0,z:250});q.g.P.invuln=Infinity;
        const start=e.pos.clone();let max=0;
        for(let i=0;i<180;i++){q.g.advance(1/60);max=Math.max(max,e.pos.distanceTo(start));}
        return{...q.state(),moved:max,finite:e.pos.toArray().every(Number.isFinite)};
      });assert.ok(walking.moved>.15&&walking.finite,JSON.stringify(walking));
      // Visual confirmation must win immediately after a continuous brief cue.
      const reacquired=await page.evaluate(()=>{const q=searchQA,e=q.enemy;e.stun=100;e.pos.set(q.chosen.a.x,q.chosen.a.y+.01,q.chosen.a.z);
        q.place(q.chosen.b);e.yaw=Math.atan2(e.pos.x-q.g.P.pos.x,e.pos.z-q.g.P.pos.z);return q.tick(.9);});
      assert.equal(reacquired.phase,'chase',JSON.stringify(reacquired));
      const decoy = await page.evaluate(() => {
        const q=searchQA,e=q.enemy;e.stun=0;q.place(q.chosen.b);
        const used=skyDecoy.activate();q.place(q.chosen.hidden);q.tick(.6);
        const lured=!!skyDecoy.targetFor(e),navigationOwned=!e.lost;
        e.stun=100;e.act=e.rise=e.fall=null;e.pos.set(q.chosen.a.x,q.chosen.a.y+.01,q.chosen.a.z);e.vel.set(0,0,0);q.place(q.chosen.hidden);
        q.tick(6.1);
        return{used,lured,navigationOwned,expired:!skyDecoy.active,lost:e.lost,...q.state()};
      });
      assert.ok(decoy.used&&decoy.lured&&decoy.navigationOwned&&decoy.expired&&decoy.lost,JSON.stringify(decoy));
      assert.equal(decoy.phase,'search','decoy expiry restores visual memory rather than live player tracking');
      assert.ok(Math.abs(decoy.last.x-setup.b.x)<.05&&Math.abs(decoy.last.z-setup.b.z)<.05,'decoy does not reveal the real player after release');
      assert.equal(await page.evaluate(()=>__game.debug.renderer.getContext().getError()),0);
      assert.deepEqual(errors,[]);results.push({id,setup,chase,escaped,gates,midway,pause,expired,walking,reacquired,decoy});
      console.log('PASS',id,JSON.stringify({remaining:escaped.remaining,moved:walking.moved,errors}));await ctx.close();
    }
    fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  } finally { await browser.close(); server?.kill(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
