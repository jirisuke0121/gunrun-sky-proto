// Can the player standing on high ground actually knock the climbing pursuers off it? Real game, old town, real pursuit AI.
//   node tools/high-ground-knockoff.cjs [--diff=normal] [--secs=25] [--out=file.json] [--q=extra&query]
// For every roof the player can stand on (nav nodes 4 m or more above the street, middle of a flat area, one spot per 6 m cell),
// the player stands still with the pistol on auto-fire (invulnerable, ammo never runs out) and the normal spawning runs for
// --secs seconds of game time from a fixed seed. Counted per spot: hits, kills by the gun, zombies that fell after a hit
// (zombie-fall.js: "knocked"), falls that hurt (more than 1.5 m), kills by the fall, and the seconds a zombie stood within 1.7 m.
// Not a person: the player never moves and never aims; a floor for what the high ground gives.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),arg=k=>(process.argv.find(a=>a.startsWith('--'+k+'='))||'').split('=').slice(1).join('=');
const DIFF=arg('diff')||'normal',SECS=+(arg('secs')||25),out=arg('out'),Q=arg('q');
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.gz':'application/gzip','.png':'image/png','.flac':'audio/flac','.wav':'audio/wav','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(fs.readFileSync(name))}catch{res.writeHead(404);res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;let browser;
try{browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:{width:844,height:390},locale:'ja-JP'});
 await ctx.addInitScript(()=>{window.__hold=true;let s=0x9e3779b9;window.__seed=v=>{s=v>>>0};Math.random=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  try{localStorage.setItem('gunrun-onboarding-v1',JSON.stringify({phase:'complete',firstRunGuide:'done'}));localStorage.setItem('gunrun-quality-check-v1','done')}catch{}});
 await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 const p=await ctx.newPage();p.setDefaultTimeout(600000);p.on('pageerror',e=>console.log('pageerror',e.message.slice(0,160)));
 await p.goto(base+'index.html?lang=ja&dev=1&channel=dev'+(Q?'&'+Q:''));
 await p.waitForFunction(()=>window.skyStartReadiness?.ready&&window.__game&&window.skyZombieFall);
 await p.waitForFunction(()=>(window.__skyInternals?.zombieModels?.()||[]).filter(m=>m.kind==='existing').length>=4,null,{timeout:90000}).catch(()=>{});
 const spots=await p.evaluate(()=>{const g=__game,N=g.NAV.nodes,cell=new Map(),key=(i,j)=>i+','+j;N.forEach((n,id)=>{const k=key(n.i,n.j);if(!cell.has(k))cell.set(k,[]);cell.get(k).push(id)});
  const flat=n=>{let k=0;for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++){if(!di&&!dj)continue;if((cell.get(key(n.i+di,n.j+dj))||[]).some(o=>Math.abs(N[o].y-n.y)<.15))k++}return k>=8};
  const seen=new Map();for(const n of N){if(n.y<4||!flat(n))continue;const k=Math.floor(n.x/6)+','+Math.floor(n.z/6)+','+Math.round(n.y);if(!seen.has(k))seen.set(k,[+n.x.toFixed(2),+n.y.toFixed(2),+n.z.toFixed(2)])}return[...seen.values()]});
 console.log(`${spots.length} high spots (y >= 4 m), ${DIFF}, ${SECS} s each`);
 const rows=[];
 for(const[k,at]of spots.entries()){
  const r=await p.evaluate(([at,diff,secs,seed])=>{const g=__game,s=__skyInternals,c=g.P,U=s.U,sel=document.getElementById('challengeDifficulty');sel.value=diff;sel.dispatchEvent(new Event('change',{bubbles:true}));
   window.__seed(seed);g.startGame();for(const z of g.zombies){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool)}g.zombies.length=0;
   c.pos.set(at[0],at[1]+.01,at[2]);c.lastGround?.copy(c.pos);c.safe?.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.pitch=-.12;g.frameOnce(0);
   U.gunOn=true;U.autoFire=true;U.aimAuto=true;const F=window.skyZombieFall.stats,f0={...F},st=g.stats,h0=st.hits||0,gk0=st.gunKills||0,k0=st.kills||0;
   let near=0,falls=[];const seenFall=new Set();
   for(let i=0;i<secs*60;i++){c.invuln=9;c.life=Math.max(c.life||0,5);s.Et.res=99;Object.assign(s.inputState,{on:false,id:null,x:0,y:0});g.advance(1/60);
    if(g.mode!=='play')break;if(g.zombies.some(z=>!z.dead&&Math.hypot(z.pos.x-c.pos.x,z.pos.z-c.pos.z)<1.7&&Math.abs(z.pos.y-c.pos.y)<1.3))near+=1/60}
   return{hits:(st.hits||0)-h0,gunKills:(st.gunKills||0)-gk0,kills:(st.kills||0)-k0,knocked:F.knocked-f0.knocked,hurtFalls:F.damaged-f0.damaged,fallKills:F.killed-f0.killed,near:+near.toFixed(1),mode:g.mode}},[at,DIFF,SECS,1000+k]);
  rows.push({at,...r});console.log(`${String(k).padStart(2)} [${at.join(', ')}] hits ${r.hits} gunKills ${r.gunKills} knockedFalls ${r.knocked} hurtFalls ${r.hurtFalls} fallKills ${r.fallKills} | zombie within 1.7 m ${r.near} s`);}
 const sum=f=>rows.reduce((a,r)=>a+r[f],0),hits=sum('hits');
 console.log(`TOTAL hits ${hits}, gun kills ${sum('gunKills')}, falls after a hit ${sum('knocked')} (${(100*sum('knocked')/Math.max(1,hits)).toFixed(1)}% of hits), hurting falls ${sum('hurtFalls')}, fall kills ${sum('fallKills')}, spots with no knocked fall ${rows.filter(r=>!r.knocked).length}/${rows.length}, zombie within 1.7 m: median ${rows.map(r=>r.near).sort((a,b)=>a-b)[rows.length>>1]} s`);
 if(out)fs.writeFileSync(out,JSON.stringify({diff:DIFF,secs:SECS,rows},null,1));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
