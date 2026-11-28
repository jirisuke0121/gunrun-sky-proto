const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
// Paraglider opening (old town): plane -> glide -> (jump: let go) -> landing. Until landing the run clock and the zombies wait.
const dir=path.resolve(__dirname,'..'),port=process.argv[2]||'18851';
(async()=>{
 const server=spawn('python3',['-m','http.server',port,'--bind','127.0.0.1'],{stdio:'ignore',cwd:dir});await new Promise(r=>setTimeout(r,1200));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const open=async(url,{difficulty='normal'}={})=>{
  const ctx=await browser.newContext({viewport:{width:800,height:450}});await ctx.addInitScript(()=>window.__hold=true);
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
  const page=await ctx.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Japanese UI: the jump button text is checked as written in the code (other languages are i18n.js's job).
  await page.goto(`http://127.0.0.1:${port}/${url}${url.includes('?')?'&':'?'}lang=ja`);
  await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);
  await page.locator(`#homeDifficulty [data-difficulty="${difficulty}"]`).first().click();await page.locator('#bStart').click();
  await page.waitForFunction(()=>__game.mode==='play');return{ctx,page,errors}};
 const state=page=>page.evaluate(()=>{const I=__skyInternals,c=I.c;return{phase:skyParaglider.phase,t:I.z.t,x:c.pos.x,y:c.pos.y,z:c.pos.z,vy:c.vel.y,ground:c.onGround,
  zombies:I.Jt.filter(e=>!e.dead).map(e=>[e.pos.x,e.pos.y,e.pos.z]),drops:JSON.parse(document.body.dataset.skyWeaponDrops||'{}'),stats:skyParaglider.stats}});
 const run=(page,seconds,keys={})=>page.evaluate(([seconds,keys])=>{const I=__skyInternals;Object.assign(I.keys,keys);
  for(let i=0;i<Math.round(seconds*60)&&skyParaglider.phase!=='off';i++)__game.frameOnce(1/60);for(const k of Object.keys(keys))I.keys[k]=false},[seconds,keys]);
 const moved=(a,b)=>Math.max(0,...a.zombies.map((p,i)=>b.zombies[i]?Math.hypot(p[0]-b.zombies[i][0],p[2]-b.zombies[i][2]):0));

 // 1. Ranked difficulties start on the plane, high over the town; the clock and the zombies wait.
 for(const difficulty of ['easy','normal','hard']){
  const {ctx,page,errors}=await open('index.html?paraglider=1',{difficulty});
  const s0=await state(page);assert.equal(s0.phase,'plane',`${difficulty}: on the plane`);
  assert.equal(await page.evaluate(()=>document.getElementById('tJump').textContent),'飛び降りる','jump button reads 飛び降りる on the plane');assert.ok(s0.y>40,`${difficulty}: high (${s0.y})`);
  assert.ok(s0.zombies.length>0,`${difficulty}: zombies are already waiting`);
  await run(page,1.5);const s1=await state(page);
  assert.equal(s1.phase,'plane');assert.equal(s1.t,0,'clock waits on the plane');assert.ok(moved(s0,s1)<.01,'zombies wait on the plane');
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS plane',difficulty,s0.zombies.length,'zombies');await ctx.close();
 }
 // 2. Glide: slow sink, steering, clock and zombies still wait; opening crates sit at the dangerous spots.
 {const {ctx,page,errors}=await open('index.html?paraglider=1');
  const s0=await state(page);
  assert.ok(s0.stats.crates.length>=2,'opening crates placed');assert.equal(s0.stats.crates[0].weapon,'MG','strongest weapon at the most dangerous spot');
  await page.evaluate(()=>__game.frameOnce(1/60));const shown=(await state(page)).drops.items;
  assert.ok(shown.length>=s0.stats.crates.length&&shown.every(i=>!i.falling),'crates are already down and visible from the air');
  assert.ok(s0.stats.crates[0].danger>=s0.stats.crates.at(-1).danger,'ordered by danger');
  await run(page,3);let s1=await state(page);assert.equal(s1.phase,'glide','gliding after the plane');
  const ya=s1.y;await run(page,1);s1=await state(page);
  assert.ok(Math.abs((ya-s1.y)-5.5)<.6,`sinks about 5.5 m/s (${(ya-s1.y).toFixed(2)})`);
  const before={x:s1.x,z:s1.z};await run(page,1.5,{KeyW:true});const s2=await state(page);
  assert.ok(Math.hypot(s2.x-before.x,s2.z-before.z)>8,`steers forward (${Math.hypot(s2.x-before.x,s2.z-before.z).toFixed(1)} m)`);
  assert.equal(s2.t,0,'clock waits in the glide');assert.ok(moved(s0,s2)<.01,'zombies wait in the glide');
  assert.equal(s2.drops.elapsed,0,'weapon-drop clock waits');
  // 3. Jump lets go: falls fast, lands, then the clock and the chase start.
  await page.evaluate(()=>{__skyInternals.c.jumpBuf=.15});await run(page,.5);const s3=await state(page);
  assert.equal(s3.phase,'fall','let go of the glider');assert.ok(s3.vy<-8,`falls fast (${s3.vy.toFixed(1)})`);
  await run(page,8);const s4=await state(page);
  assert.equal(s4.phase,'off','landed');
  assert.equal(await page.evaluate(()=>document.getElementById('tJump').textContent),'ジャンプ','jump button back to ジャンプ after landing');assert.ok(s4.stats.landed,'landing recorded');assert.equal(s4.stats.rescued,false,'landed on the town');
  await page.evaluate(()=>{for(let i=0;i<180;i++)__game.frameOnce(1/60)});const s5=await state(page);
  assert.ok(s5.t>2.9&&s5.t<3.1,`clock runs from the landing (${s5.t.toFixed(2)})`);assert.ok(moved(s4,s5)>.5,'zombies chase after the landing');
  assert.ok(s5.drops.elapsed>2.9,'weapon-drop clock runs after landing');
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS glide/release/land',JSON.stringify(s4.stats.landed),JSON.stringify(s0.stats.crates.map(c=>c.weapon+':'+c.danger)));
  // 4. Retry skips the plane.
  await page.evaluate(()=>__game.startGame());const r=await state(page);assert.equal(r.phase,'glide','retry starts in the glide');
  assert.equal(r.t,0);console.log('PASS retry skips the plane');
  // 5. Without input the glide lands by itself (no fall damage, lives unchanged).
  const lives=await page.evaluate(()=>__skyInternals.c.life);await run(page,12);const r2=await state(page);
  assert.equal(r2.phase,'off','glide lands on its own');assert.equal(await page.evaluate(()=>__skyInternals.c.life),lives,'no fall damage');
  console.log('PASS glide-only landing',JSON.stringify(r2.stats.landed));await ctx.close();
 }
 // 6. The town has gaps down to the cloud sea: random headings and release times all land on the town (no rescue).
 {const {ctx,page}=await open('index.html?paraglider=1');
  const out=await page.evaluate(()=>{const I=__skyInternals,res=[];let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
   for(let r=0;r<10;r++){__game.startGame();const c=I.c;c.yaw=rnd()*Math.PI*2;const hold=rnd()*7,rel=r%2?1+rnd()*4:99;let t=0;
    while(skyParaglider.phase!=='off'&&t<20){I.keys.KeyW=t<hold;if(t>=rel&&skyParaglider.phase==='glide')c.jumpBuf=.15;__game.advance(1/60);t+=1/60}
    I.keys.KeyW=false;res.push({t,rescued:skyParaglider.stats.rescued,phase:skyParaglider.phase})}return res});
  assert.ok(out.every(r=>r.phase==='off'&&r.t<12),'every descent lands within 12 s');assert.equal(out.filter(r=>r.rescued).length,0,'no descent falls into the cloud sea');
  console.log('PASS edges',out.map(r=>r.t.toFixed(1)).join(' '));await ctx.close();}
 // 7. Jump off the plane early (still outside the town): glide starts there, heads for the town and lands on it.
 {const {ctx,page,errors}=await open('index.html?paraglider=1');
  await run(page,.3);await page.evaluate(()=>{__skyInternals.c.jumpBuf=.15});await run(page,.1);const s=await state(page);
  assert.equal(s.phase,'glide','jumped off the plane');assert.ok(s.stats.jumpedOff<.5,`early (${s.stats.jumpedOff} s)`);
  assert.ok(Math.hypot(s.x-s.stats.drop[0],s.z-s.stats.drop[2])>50,'far from the drop point');
  assert.equal(await page.evaluate(()=>document.getElementById('tJump').textContent),'飛び降りる','still 飛び降りる under the glider');
  await run(page,14);const e=await state(page);
  assert.equal(e.phase,'off','landed');assert.equal(e.stats.rescued,false,'reached the town');
  await page.evaluate(()=>__game.frameOnce(1/60));
  assert.equal(await page.evaluate(()=>document.getElementById('tJump').textContent),'ジャンプ');
  // Any moment on the plane, glide or let go: always lands on the town.
  const out=await page.evaluate(()=>{const I=__skyInternals,res=[];let seed=5;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
   for(let r=0;r<8;r++){
    // From the home screen (not a retry), so every run has the plane.
    __game.setMode('menu');__game.startGame();
    const c=I.c,off=rnd()*2.4,rel=r%2?off+1+rnd()*3:99;let t=0;
    while(skyParaglider.phase!=='off'&&t<25){if(skyParaglider.phase==='plane'&&t>=off)c.jumpBuf=.15;if(skyParaglider.phase==='glide'&&t>=rel)c.jumpBuf=.15;__game.advance(1/60);t+=1/60}
    res.push({off:+off.toFixed(2),t:+t.toFixed(1),rescued:skyParaglider.stats.rescued,phase:skyParaglider.phase})}return res});
  assert.ok(out.every(r=>r.phase==='off'),'all landed '+JSON.stringify(out));assert.equal(out.filter(r=>r.rescued).length,0,'none fell into the cloud sea '+JSON.stringify(out));
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS plane jump-off',out.map(r=>r.off+'s→'+r.t+'s').join(' '));await ctx.close();}
 // 8. Reach: from the middle, steering straight in 16 directions reaches the edge of the town in every direction
 // (gaps inside the town are crossed high up), and nobody sinks into a gap or the cloud sea.
 {const {ctx,page,errors}=await open('index.html?paraglider=1');
  const out=await page.evaluate(()=>{const I=__skyInternals,N=__game.NAV.nodes,res=[];
   for(let k=0;k<16;k++){const a=k/16*Math.PI*2,dx=Math.sin(a),dz=-Math.cos(a);let edge=0;
    for(const n of N){const rx=n.x,rz=n.z+4,along=rx*dx+rz*dz;if(Math.abs(-rx*dz+rz*dx)<4&&along>edge)edge=along}
    __game.setMode('menu');__game.startGame();const c=I.c;c.jumpBuf=.15;__game.advance(1/60);c.pos.set(0,46,-4);c.yaw=Math.atan2(-dx,-dz);
    let t=0,far=0;while(skyParaglider.phase!=='off'&&t<20){I.keys.KeyW=true;__game.advance(1/60);t+=1/60;far=Math.max(far,Math.hypot(c.pos.x,c.pos.z+4))}
    I.keys.KeyW=false;res.push({dir:k*22.5,edge:Math.round(edge),far:Math.round(far),t:+t.toFixed(1),rescued:skyParaglider.stats.rescued})}return res});
  const short=out.filter(r=>r.far<r.edge-5);assert.deepEqual(short,[],'every direction reaches the edge of the town');
  assert.equal(out.filter(r=>r.rescued).length,0,'no descent sinks into a gap '+JSON.stringify(out));assert.ok(out.every(r=>r.t<11),'lands within 11 s');
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS reach',out.map(r=>r.dir+':'+r.far+'/'+r.edge).join(' '));await ctx.close();}
 // 9. ?paraglider=0 keeps the old start.
 {const {ctx,page}=await open('index.html?paraglider=0&random_start=1');const s=await state(page);
  assert.equal(s.phase,'off');assert.ok(s.y<12,'old high-ground start');console.log('PASS paraglider=0');await ctx.close();}
 await browser.close();server.kill();console.log('paraglider opening browser: ok');
})().catch(e=>{console.error(e);process.exit(1)});
