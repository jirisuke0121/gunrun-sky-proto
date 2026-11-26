// Does the Rescue skill find somewhere to go when the player is actually cornered? Real game, old town, real pursuit AI.
//   node tools/rescue-trapped.cjs [--diff=normal] [--out=file.json] [--variants=1]
// For every low spot (nav nodes under 2 m, one per 5 m cell) the player stands still, six zombies start 10-18 m away on
// floor around him (fixed seed) and chase with the normal AI, the gun off. As soon as three are within 5 m (or after 8 s)
// the Rescue's own target search (free-hook.js chooseTarget, then the looser second pass as in activate) is asked where it would go. Counted: spots where it finds
// nothing. With --variants=1 the same moment is asked again with one condition relaxed at a time, to see which one blocks.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),arg=k=>(process.argv.find(a=>a.startsWith('--'+k+'='))||'').split('=').slice(1).join('=');
const DIFF=arg('diff')||'normal',out=arg('out'),VAR=arg('variants')==='1';
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.gz':'application/gzip','.png':'image/png','.flac':'audio/flac','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(fs.readFileSync(name))}catch{res.writeHead(404);res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;let browser;
try{browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:{width:844,height:390},locale:'ja-JP'});
 await ctx.addInitScript(()=>{window.__hold=true;let s=0x9e3779b9;window.__seed=v=>{s=v>>>0};Math.random=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  try{localStorage.setItem('gunrun-onboarding-v1',JSON.stringify({phase:'complete',firstRunGuide:'done'}));localStorage.setItem('gunrun-quality-check-v1','done')}catch{}});
 await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 const p=await ctx.newPage();p.setDefaultTimeout(600000);p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,160)));
 await p.goto(base+'index.html?lang=ja&dev=1&channel=dev');
 await p.waitForFunction(()=>window.skyStartReadiness?.ready&&window.__game&&window.skyRescue);
 await p.waitForFunction(()=>(window.__skyInternals?.zombieModels?.()||[]).filter(m=>m.kind==='existing').length>=4,null,{timeout:90000}).catch(()=>{});
 const spots=await p.evaluate(()=>{const N=__game.NAV.nodes,seen=new Map();for(const n of N){if(n.y>2||n.y<-1)continue;const k=Math.floor(n.x/5)+','+Math.floor(n.z/5);if(!seen.has(k))seen.set(k,[+n.x.toFixed(2),+n.y.toFixed(2),+n.z.toFixed(2)])}return[...seen.values()]});
 console.log(`${spots.length} low spots, ${DIFF}`);const rows=[];
 for(const[k,at]of spots.entries()){
  const r=await p.evaluate(([at,diff,seed,VAR])=>{const g=__game,s=__skyInternals,c=g.P,U=s.U,R=window.skyRescue,sel=document.getElementById('challengeDifficulty');sel.value=diff;sel.dispatchEvent(new Event('change',{bubbles:true}));
   window.__seed(seed);g.startGame();g.GAME.spawnT=g.GAME.surgeT=1e9;for(const z of g.zombies){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool)}g.zombies.length=0;U.gunOn=false;
   c.pos.set(at[0],at[1]+.01,at[2]);c.lastGround?.copy(c.pos);c.safe?.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;g.frameOnce(0);
   const cand=g.NAV.nodes.filter(n=>{const d=Math.hypot(n.x-at[0],n.z-at[2]);return d>10&&d<18&&Math.abs(n.y-at[1])<1.5});if(cand.length<6)return{skip:true};
   for(let q=0;q<6;q++){const n=cand[Math.floor(Math.random()*cand.length)];const e=new g.Zombie(n.x,n.y+.003,n.z);Object.assign(e,{spawnT:0,onGround:true});g.zombies.push(e)}
   let t=0;const close=()=>g.zombies.filter(z=>!z.dead&&Math.hypot(z.pos.x-c.pos.x,z.pos.z-c.pos.z)<5&&Math.abs(z.pos.y-c.pos.y)<2).length;
   for(;t<480&&close()<3;t++){c.invuln=9;c.life=9;Object.assign(s.inputState,{on:false,id:null,x:0,y:0});g.advance(1/60)}
   const base=R.CFG,ask=o=>!!R.chooseTarget(o),why={},ok=!!(R.chooseTarget({...base,why})||R.chooseTarget({...base,minZombieGap:3,pathGap:2,interior:false})),res={close:close(),t:+(t/60).toFixed(1),ok,why};
   if(VAR&&!ok){res.v={gap3:ask({...base,minZombieGap:3}),path2:ask({...base,pathGap:2}),xz18:ask({...base,maxXZ:18}),edge:ask({...base,interior:false}),rise1:ask({...base,minRise:1.2}),all:ask({...base,minZombieGap:3,pathGap:2,maxXZ:18,interior:false})}}
   const tg=ok&&R.chooseTarget(base);if(tg)res.to=[+tg.x.toFixed(1),+tg.y.toFixed(1),+tg.z.toFixed(1)];return res},[at,DIFF,2000+k,VAR]);
  if(r.skip)continue;rows.push({at,...r});console.log(`${String(k).padStart(3)} [${at.join(', ')}] ${r.ok?'OK  ':'NONE'} close ${r.close} after ${r.t}s why ${JSON.stringify(r.why)}${r.v?' '+JSON.stringify(r.v):''}`);}
 const fail=rows.filter(r=>!r.ok),cornered=rows.filter(r=>r.close>=3),cf=cornered.filter(r=>!r.ok);
 console.log(`TOTAL ${rows.length} spots: no target at ${fail.length} (${(100*fail.length/rows.length).toFixed(0)}%); cornered (3+ within 5 m): ${cornered.length}, no target ${cf.length} (${(100*cf.length/Math.max(1,cornered.length)).toFixed(0)}%)`);
 const W=f=>fail.filter(f).length;console.log(`  why: no high floor in range ${W(r=>!r.why.inRange)}, all in range too near a zombie ${W(r=>r.why.inRange&&!r.why.scored&&(r.why.gap||0)>=r.why.inRange)}, blocked by the path rule ${W(r=>r.why.inRange&&!r.why.scored&&(r.why.path||0)>0)}, candidates but every pull hits a wall ${W(r=>r.why.scored>0)}`);
 if(VAR&&fail.length)for(const k of Object.keys(fail[0].v))console.log(`  relax ${k}: fixes ${fail.filter(r=>r.v[k]).length}/${fail.length}`);
 if(out)fs.writeFileSync(out,JSON.stringify({diff:DIFF,rows},null,1));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
