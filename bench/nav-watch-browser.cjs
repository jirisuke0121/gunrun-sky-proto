// Real game, real nav graph. Drop from a roof onto floors that have no nav node (the 2026-11-03
// "zombies stay on the roof" case) and onto a floor that has one, and check what is recorded.
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{let browser,server;try{
 const base='http://127.0.0.1:8821/';server=spawn('python3',['-m','http.server','8821','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const open=async(query)=>{
  const context=await browser.newContext({viewport:{width:480,height:270}}),page=await context.newPage(),posts=[],errors=[];
  await page.addInitScript(()=>window.__hold=true);page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>{if(r.request().method()==='POST')posts.push(r.request().postData());
   r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"top":[],"total":0,"recordProtocol":2}'})});
  await page.goto(base+'index.html'+query);
  await page.waitForFunction(()=>window.__game&&window.skyNavWatch&&window.skyHumanView&&!document.getElementById('bStart').disabled,null,{timeout:180000});
  return {page,posts,errors,context};
 };
 // Zombies wait on a roof, the player drops to `floor`; returns what the run recorded after `seconds`.
 const drop=(page,roof,floor,seconds)=>page.evaluate(({roof,floor,seconds})=>{
  const g=__game,s=__skyInternals,c=g.P,N=g.NAV;
  Object.assign(g.S,g.DEF,{sendLog:true,autoFire:false,aimAuto:false});g.startGame();
  for(const e of g.zombies){s.ue.remove(e.m.root);if(e.pool)s.ue.remove(e.pool)}g.zombies.length=0;
  g.GAME.spawnT=g.GAME.surgeT=1e9;g.GAME.over=false;g.SCR.off=g.PACE.off=g.MARK.off=true;g.STALK.spawned=true;
  const run=n=>{for(let i=0;i<n;i++){c.life=3;c.invuln=1e9;g.advance(1/60)}};
  g.placeAt({x:roof[0],y:roof[1]+.01,z:roof[2],yaw:0});run(30);
  const near=N.nodes.filter(m=>Math.abs(m.y-roof[1])<.3&&Math.hypot(m.x-roof[0],m.z-roof[2])>=2&&Math.hypot(m.x-roof[0],m.z-roof[2])<=5).slice(0,3);
  for(const m of near){const z=new g.Zombie(m.x,m.y+.01,m.z);z.spawnT=0;g.zombies.push(z)}
  run(60);g.placeAt({x:floor[0],y:floor[1]+.01,z:floor[2],yaw:0});run(Math.round(seconds*60));
  return {zombies:near.length,nodeUnderPlayer:g.nodeAt(c.pos.x,c.pos.y+.1,c.pos.z),stuck:window.skyTelemetryProbe.inspect().stuck,
   heights:g.zombies.map(z=>+(z.pos.y-c.pos.y).toFixed(1)),keptY:c.node>=0?N.nodes[c.node].y:null};
 },{roof,floor,seconds});

 // A) Floors with no node under a player who just left a roof (found by scanning every standable surface).
 const dev=await open('?dev=1');
 // Deliberately disable the recovery in these diagnostic-only fixtures: the
 // logger must still explain an unavailable route. Actual recovery/attacks on
 // both no-node floors are asserted by zombie-descent-browser.cjs.
 await dev.page.evaluate(()=>window.skyZombieDescent=null);
 for(const [name,roof,floor,roofY] of [['stair tread',[-30,11.9,1],[-22.5,6.7,1.25],11.9],['small slab',[31,12.1,-8],[30.75,7.4,-12.15],12.1]]){
  const r=await drop(dev.page,roof,floor,9);
  assert.equal(r.zombies,3,name+': three zombies on the roof');
  assert.equal(r.nodeUnderPlayer,-1,name+': this floor has no nav node');
  assert.ok(r.heights.every(h=>h>2.5),name+': they really are stuck on the roof '+JSON.stringify(r.heights));
  assert.ok(r.stuck.length>=1,name+': a stuck entry was recorded');
  const e=r.stuck[0];
  assert.equal(e.cause,'player-no-node',name+': '+JSON.stringify(e));
  assert.ok(Math.abs(e.player.keptAt[1]-roofY)<.6,name+': the kept node is the roof '+JSON.stringify(e));
  assert.ok(e.targets.some(t=>Math.abs(t[1]-roofY)<.6),name+': the field still targets the roof');
  assert.ok(e.n>=1&&e.zombies.length>=1);
  assert.ok(e.t>=5&&e.t<=12,name+': logged about 5 s after the drop, not before');
  console.log('PASS',name,JSON.stringify({cause:e.cause,n:e.n,kept:e.player.keptAt,targets:e.targets}));
 }
 // B) The dev badge shows it, and says why.
 await dev.page.waitForFunction(()=>{const b=document.getElementById('navWatchBadge');return b&&!b.hidden&&/ノード無し/.test(b.textContent)&&/詰まり検知/.test(b.textContent)},null,{timeout:20000});
 const badge=await dev.page.evaluate(()=>document.getElementById('navWatchBadge').textContent);
 console.log('PASS dev badge:',badge.replace(/\n/g,' / '));
 // C) The record that would be sent carries the entry (consent on).
 const sent=await dev.page.evaluate(async()=>{__game.endGame('quit');await new Promise(r=>setTimeout(r,1500));return window.skyTelemetryProbe.inspect()?.stuck?.length});
 assert.ok(sent>=1,'the probe snapshot used by the run record has the entries');
 const body=dev.posts.map(p=>{try{return JSON.parse(p)}catch{return null}}).find(b=>b?.diagnostics?.stuck?.length);
 if(body)console.log('PASS the posted record carries diagnostics.stuck',body.diagnostics.stuck.length,'entries, cause',body.diagnostics.stuck[0].cause);
 else console.log('NOTE no record POST was captured here (storage/consent gate in the test page); the probe snapshot holds',sent,'entries');
 assert.deepEqual(dev.errors,[]);await dev.context.close();

 // D) Players: nothing on screen, but the log is still collected.
 const play=await open('');
 await play.page.evaluate(()=>window.skyZombieDescent=null);
 const rp=await drop(play.page,[-30,11.9,1],[-22.5,6.7,1.25],9);
 assert.ok(rp.stuck.length>=1,'logging does not depend on developer mode');
 assert.equal(await play.page.evaluate(()=>!!document.getElementById('navWatchBadge')),false,'players never get a badge element');
 assert.deepEqual(play.errors,[]);await play.context.close();

 // E) A floor that has a node: zombies come down, nothing is logged, no badge.
 const ok=await open('?dev=1');
 const ro=await drop(ok.page,[-31,11.9,-10],[-29,4.2,-9],12);
 assert.equal(ro.zombies,3);assert.ok(ro.nodeUnderPlayer>=0,'this floor has a node');
 assert.ok(ro.heights.every(h=>h<2.5),'the zombies came down: '+JSON.stringify(ro.heights));
 assert.equal(ro.stuck.length,0,'nothing logged when nothing is wrong');
 await ok.page.waitForTimeout(500);
 assert.equal(await ok.page.evaluate(()=>{const b=document.getElementById('navWatchBadge');return !b||b.hidden}),true,'no badge');
 assert.deepEqual(ok.errors,[]);await ok.context.close();
 console.log('PASS control floor: zombies came down, no entry, no badge');
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
