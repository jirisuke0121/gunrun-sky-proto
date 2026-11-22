// 跳んでいる途中に何かにぶつかる所を、実ゲームの物理で洗い出す（旧市街）。docs/MAP_POLISH_2026-11-22.md
// 追手の経路の足場点（NAV）から8方向へ、0.35秒走ってから跳び、前へ押したまま1.2秒進める。空中で横の速さが急に落ちた
// （頭・体が壁や梁に当たった）所を、当たった物ごとに数える。
//   node tools/jump-snags.cjs [出力.json] [間引き=1]     全点で約30分。間引き40なら約1分。python3 tools/jump-snags.py 出力.json
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),out=process.argv[2]||'jump-snags.json',STRIDE=+(process.argv[3]||1),query=process.argv[4]||'',PORT=8871;
const {revealHomeControl}=require(path.join(root,'bench/home-controls.cjs'));
(async()=>{const {chromium}=require('playwright');
const server=spawn('python3',['-m','http.server',String(PORT),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
for(let i=0;i<60;i++){if(await fetch(`http://127.0.0.1:${PORT}/`).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const context=await browser.newContext({locale:'ja-JP',viewport:{width:640,height:360}});
await context.addInitScript(()=>{window.__hold=true;});
await context.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
const page=await context.newPage();page.on('pageerror',e=>console.log('PAGEERR',e.message));page.setDefaultTimeout(240000);
await page.goto(`http://127.0.0.1:${PORT}/index.html?challengeDebug=1${query}`);
await page.waitForFunction(()=>window.__game&&window.skySwing&&window.SKY_ROOF_TRENCHES);
const level=page.locator('[data-difficulty=normal]').first();await revealHomeControl(page,level);await level.click();await page.locator('#bStart').click();
await page.evaluate(()=>{const g=__game,s=__skyInternals;for(const z of s.Jt){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool);}s.Jt.length=0;g.SCR.off=g.PACE.off=g.MARK.off=true;Object.assign(g.S,{sendLog:false,gunOn:false,autoFire:false,aimAuto:false,stalkerOn:false,stalker2:false,dropShare:0});
 const c=g.P,dt=1/120;const key=(code,type)=>dispatchEvent(new KeyboardEvent(type,{code}));
 window.__probe=(x,y,z,dx,dz)=>{for(const k of Object.keys(g.keys))g.keys[k]=false;key('Space','keyup');key('KeyW','keyup');window.skySwing.reset();window.skyDash?.reset?.(false);
  g.GAME.over=false;g.GAME.t=0;c.life=3;g.GAME.spawnT=g.GAME.surgeT=1e9;g.GAME.safeT=0;g.setMode('play');const yaw=Math.atan2(-dx,-dz);g.placeAt({x,y,z,yaw});
  Object.assign(c,{jumpBuf:0,coyote:0,slideBuf:0,slideCD:0,catchCD:0,hookPressed:false,crouchPressed:false,invuln:-1,edgeJump:false,edgeOff:null});
  for(let i=0;i<6;i++)g.advance(dt);const sx=c.pos.x,sy=c.pos.y,sz=c.pos.z,sg=c.onGround;key('KeyW','keydown');let jumped=false,prev=0,bump=null,air=0,peak=0;
  for(let i=0;i<120*1.55;i++){g.advance(dt);c.yaw=yaw;if(!jumped&&i>=42){key('Space','keydown');jumped=true;}else if(jumped&&i%3===0)key('Space','keyup');
   const sp=Math.hypot(c.vel.x,c.vel.z);if(jumped&&!c.onGround){air++;peak=Math.max(peak,sp);if(!bump&&air>3&&prev>4&&sp<prev*.5&&c.state!=='climb'&&c.state!=='hang')bump=[+c.pos.x.toFixed(2),+c.pos.y.toFixed(2),+c.pos.z.toFixed(2),+prev.toFixed(1),+sp.toFixed(1),c.state];}prev=sp;}
  key('KeyW','keyup');key('Space','keyup');const r=v=>Math.round(v*100)/100;return [r(sx),r(sy),r(sz),sg?1:0,r(c.pos.x),r(c.pos.y),r(c.pos.z),air,r(peak),bump,c.state];};
 window.__nodes=g.NAV.nodes.map(n=>[n.x,n.y,n.z]);window.__boxes=s.jn.filter(b=>!b.off).map(b=>({t:b.type,x0:b.minX,y0:b.minY,z0:b.minZ,x1:b.maxX,y1:b.maxY,z1:b.maxZ,tint:b.tint??null}));});
const nodes=await page.evaluate(()=>window.__nodes),boxes=await page.evaluate(()=>window.__boxes);
const t0=Date.now();const base=await page.evaluate(()=>window.__probe(-8,8,8,1,0));console.log('baseline',JSON.stringify(base),Date.now()-t0,'ms');
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];
const sel=nodes.map((n,i)=>[i,n]).filter(([i,n])=>i%STRIDE===0&&Math.abs(n[0])<75&&Math.abs(n[2])<45&&n[1]>-6);
console.log('nodes',nodes.length,'probing',sel.length);
const res=[];for(let k=0;k<sel.length;k+=40){const chunk=sel.slice(k,k+40);const r=await page.evaluate(({chunk,DIRS})=>chunk.map(([i,n])=>DIRS.map(d=>window.__probe(n[0],n[1],n[2],d[0],d[1]))),{chunk,DIRS});chunk.forEach(([i,n],j)=>res.push({i,n,r:r[j]}));if(k%40===0)console.log(k,JSON.stringify(chunk[0][1]),((Date.now()-t0)/1000|0)+'s');}
fs.writeFileSync(out,JSON.stringify({base,DIRS,boxes,res}));console.log('done',res.length,((Date.now()-t0)/1000|0)+'s');
}finally{await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exit(1);});
