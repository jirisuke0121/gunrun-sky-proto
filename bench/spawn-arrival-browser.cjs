const {chromium}=require('playwright'),{spawn}=require('node:child_process');
// Natural respawn -> stationary invulnerable player, both maps, fixed seeds (manual bench, ~5 min).
// Guard spawns are excluded (they hold position until the player comes near), and so are the opening high-ground zombies, which are
// checked separately (they come from the central high ground on purpose).
// Guard spawns are excluded: they hold position until the player comes near. Without the spawn gate (SPAWN_GATE_OFF=1) the
// same seeds give mean 15.4 s, p90 40.7 s, 11 of 48 over 20 s.
// Usage: node bench/spawn-arrival-browser.cjs [dir] [port] [tag] [seeds]; ARRIVAL_ASSERT=1 checks the thresholds.
const path=require('node:path');
const dir=process.argv[2]||path.resolve(__dirname,'..'),port=process.argv[3]||'18830',tag=process.argv[4]||'run',seeds=(process.argv[5]||'11,22,33,44').split(',').map(Number);
(async()=>{
 const server=spawn('python3',['-m','http.server',port,'--bind','127.0.0.1'],{stdio:'ignore',cwd:dir});await new Promise(r=>setTimeout(r,1200));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const out=[];
 for(const map of (process.env.SPAWN_MAPS||'index.html,canyon.html').split(','))for(const seedBase of seeds){
  const ctx=await browser.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>window.__hold=true);
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
  const page=await ctx.newPage();page.setDefaultTimeout(150000);
  await page.goto(`http://127.0.0.1:${port}/${map}`);await page.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready);
  // Seed before the start button: the start position is drawn at click time, so the whole run is reproducible.
  await page.evaluate(([seedBase,gateOff])=>{let seed=seedBase;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);if(gateOff)window.skySpawnReach={allows:()=>true};},[seedBase,!!process.env.SPAWN_GATE_OFF]);
  await page.locator('#homeDifficulty [data-difficulty="normal"]').click();await page.locator('#bStart').click();await page.waitForFunction(()=>__game.mode==='play');
  const rows=await page.evaluate(seedBase=>{
   const g=__game,c=g.P;Object.assign(g.S,{autoFire:false,aimAuto:false,sendLog:false});c.life=9999;c.invuln=1e9;
   const track=new Map();let t=0;const TOTAL=120;
   for(let i=0;i<TOTAL*60&&!g.GAME.over;i++){
    g.advance(1/60);t+=1/60;
    for(const e of g.zombies){ if(e.dead||e.remove)continue;
     let r=track.get(e);
     if(!r){r={born:t,style:e.born||'normal',from:e.pos.toArray().map(v=>+v.toFixed(1)),straight:Math.hypot(e.pos.x-c.pos.x,e.pos.z-c.pos.z),dy:e.pos.y-c.pos.y,flank:!!e.flank,dropper:!!e.dropper,cost0:null,len:0,last:e.pos.clone(),reached:null};track.set(e,r);}
     if(r.cost0===null&&e.node>=0&&e.spawnT<=0&&!e.rise&&!e.fall&&!e.act?.emerge){r.cost0=+g.FIELD[e.node].toFixed(1);r.dy0=+(e.pos.y-c.pos.y).toFixed(1);r.straight0=+Math.hypot(e.pos.x-c.pos.x,e.pos.z-c.pos.z).toFixed(1);r.t0=t;}
     if(r.reached!==null)continue;
     r.len+=e.pos.distanceTo(r.last);r.last.copy(e.pos);
     if(Math.hypot(e.pos.x-c.pos.x,e.pos.z-c.pos.z)<1.6&&Math.abs(e.pos.y-c.pos.y)<1.5)r.reached=t-(r.t0??r.born);
    }
   }
   return [...track.values()].map(r=>({style:r.style,from:r.from,straight0:r.straight0??null,dy0:r.dy0??null,cost0:r.cost0,flank:r.flank,dropper:r.dropper,len:+r.len.toFixed(1),reached:r.reached===null?null:+r.reached.toFixed(2),age:+(TOTAL-r.born).toFixed(0)}));
  },seedBase);
  for(const r of rows)out.push({map:map.replace('.html',''),seed:seedBase,...r});
  await ctx.close();
 }
 const ok=out.filter(r=>r.cost0!==null&&r.age>=25&&r.style!=='guard'&&r.style!=='opening'),time=r=>r.reached===null?60:r.reached,ts=ok.map(time).sort((a,b)=>a-b);
 const mean=ts.reduce((a,b)=>a+b,0)/ts.length,p90=ts[Math.floor(ts.length*.9)],slow=ts.filter(x=>x>20).length;
 console.log(`${tag}: judged ${ts.length} | arrival mean ${mean.toFixed(1)}s p90 ${p90.toFixed(1)}s max ${ts.at(-1).toFixed(1)}s | over 20 s: ${slow}`);
 require('fs').writeFileSync(path.join(require('os').tmpdir(),`spawn-arrival-${tag}.json`),JSON.stringify(out));
 const opening=out.filter(r=>r.style==='opening').map(time).sort((a,b)=>a-b);
 if(opening.length)console.log(`${tag}: opening high-ground zombies ${opening.length} | arrival median ${opening[Math.floor(opening.length/2)].toFixed(1)}s max ${opening.at(-1).toFixed(1)}s`);
 if(process.env.ARRIVAL_ASSERT){const assert=require('node:assert/strict');assert.ok(ts.length>=28,'enough respawns judged');assert.ok(mean<=12,'mean arrival <= 12 s (15.4 s without the spawn gate)');assert.ok(p90<=22,'p90 <= 22 s (40.7 s without the gate)');assert.ok(!opening.length||opening.at(-1)<=30,'opening high-ground zombies arrive within 30 s (35.6 s median, up to 68 s, before)');assert.ok(slow<=4,'at most 4 respawns over 20 s (11 without the gate)');}
 await browser.close();server.kill();
})().catch(e=>{console.error(e);process.exit(1)});
