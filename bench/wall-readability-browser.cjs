// Photo-2 fixture, rendered A/B comparison, and a real south-stair traversal.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'browser-evidence/wall-readability');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.gz':'application/gzip','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav','.woff':'font/woff'};
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error('path');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.promises.readFile(file));}catch{res.writeHead(404);res.end();}});
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const rows=[];
try{browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});
for(const map of ['index.html','canyon.html'])for(const fixed of [true,false]){
 let baseline;
 for(const classic of [true,false]){
  const ctx=await browser.newContext({viewport:{width:1280,height:591},isMobile:true,hasTouch:true,locale:'ja-JP'});let posts=0;
  await ctx.addInitScript(()=>window.__hold=true);
  await ctx.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'});});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await p.goto(`http://127.0.0.1:${server.address().port}/${map}?camera=after&${fixed?'cameraTrial=fixed&':''}wallReadability=${classic?'classic':'revised'}&onboarding=0&controlpick=0&hookGuide=0&dev=1&lang=ja`);
  await p.waitForFunction(()=>window.skyStartReadiness?.ready&&(location.pathname.endsWith('canyon.html')||window.skyLookInfo),null,{timeout:120000});
  await p.locator('#bStart').click();await p.waitForFunction(()=>__game.mode==='play');
  const structure=await p.evaluate(()=>{const g=__game;g.S.sendLog=g.S.autoFire=false;g.GAME.spawnT=g.GAME.surgeT=Infinity;g.P.invuln=Infinity;g.zombies.forEach(e=>{__skyInternals.ue.remove(e.m.root);if(e.pool)__skyInternals.ue.remove(e.pool)});g.zombies.length=0;g.SCR.off=g.PACE.off=g.MARK.off=true;
   return{solids:g.solids.map(b=>[b.minX,b.minY,b.minZ,b.maxX,b.maxY,b.maxZ,b.type,b.solid,b.off,b.hidden]),nodes:g.NAV.nodes.map(n=>[n.x,n.y,n.z]),edges:g.NAV.E.length,revision:window.skyWallReadability||null};});
  const hash=crypto.createHash('sha256').update(JSON.stringify([structure.solids,structure.nodes,structure.edges])).digest('hex');
  if(classic)baseline=hash;else assert.equal(hash,baseline,'all collision boxes and navigation nodes stay unchanged');
  const label=map.replace('.html','')+'-'+(fixed?'fixed':'follow')+'-'+(classic?'before':'after');
  async function fixture(at){return p.evaluate(at=>{const g=__game,c=g.P;skySwing.reset();c.pos.set(...at);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.yaw=c.pitch=0;skyFollowCamera.reset();g.frameOnce(0);return{camera:g.debug.camera.position.toArray(),position:c.pos.toArray(),calls:g.debug.renderer.info.render.calls,triangles:g.debug.renderer.info.render.triangles,gl:g.debug.renderer.getContext().getError(),faded:window.skyFixedCamera?.fadedCount||0,shaderErrors:g.debug.renderer.info.programs.filter(x=>x.diagnostics?.runnable===false).length}},at);}
  const scene=await fixture(map==='index.html'?[-5,6,18]:[0,8,0]);assert.equal(scene.gl,0);assert.equal(scene.shaderErrors,0);
  await p.screenshot({path:path.join(out,label+'.png')});
  let walking=null;
  if(map==='index.html'&&fixed){
   await p.setViewportSize({width:844,height:390});await p.waitForTimeout(350);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await fixture([-5,6,18]);await p.screenshot({path:path.join(out,label+'-phone.png')});
   await fixture([-28,0,10]);await p.screenshot({path:path.join(out,label+'-west.png')});
   await fixture([-11.1,.01,17]);await p.keyboard.down('d');
   walking=await p.evaluate(()=>{const g=__game;let frames=0;while(frames++<600&&g.P.pos.x<-.5)g.advance(1/120);g.frameOnce(0);return{position:g.P.pos.toArray(),state:g.P.state,life:g.P.life}});await p.keyboard.up('d');
   assert.ok(walking.position[0]>-.7&&Math.abs(walking.position[1]-4)<.12,'walk up the existing south stairs');
  }
  if(map==='index.html'&&!classic)assert.ok(structure.revision?.walls>0&&structure.revision?.floors>0);if(map==='canyon.html')assert.equal(structure.revision,null);
  assert.equal(posts,0);assert.deepEqual(errors,[]);rows.push({map,fixed,classic,hash,revision:structure.revision,scene,walking,errors});console.log('PASS',label,JSON.stringify({scene,walking}));await ctx.close();
 }
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
