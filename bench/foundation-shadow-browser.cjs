// Same scene/camera/ratio, synchronous GPU completion. This is a local render
// cost comparison, not player FPS, input performance, or physical-iPhone QA.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'browser-evidence/shadow-cost');fs.mkdirSync(out,{recursive:true});
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.gz':'application/gzip','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('path');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.promises.readFile(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const results=[];
  for(const map of ['index.html','canyon.html']){
   const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:2});let posts=0;
   await context.addInitScript(()=>window.__hold=true);
   await context.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"top":[],"total":0}'});});
   const page=await context.newPage();page.on('pageerror',e=>console.error('PAGE',e.message));await page.goto(`http://127.0.0.1:${server.address().port}/${map}`);
   await page.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyFoundation,null,{timeout:90000});await page.locator('#bStart').click();
   await page.waitForFunction(()=>window.__game?.debug?.renderer,null,{timeout:30000});
   const result=await page.evaluate(async()=>{
    const g=__game,{renderer,scene,camera}=g.debug;g.cam(0);g.frameOnce(1/60);g.setMode('pause');
    const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    const gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';
    const lights=[];scene.traverse(o=>{if(o.isLight&&o.castShadow)lights.push({type:o.type,width:o.shadow?.mapSize.x,height:o.shadow?.mapSize.y});});
    function toggle(on){renderer.shadowMap.enabled=on;scene.traverse(o=>{for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[])m.needsUpdate=true;});renderer.shadowMap.needsUpdate=true;}
    const timings={on:[],off:[]};
    for(const on of [true,false,true,false]){
     toggle(on);for(let i=0;i<5;i++){renderer.render(scene,camera);gl.finish();}
     for(let i=0;i<12;i++){const start=performance.now();renderer.render(scene,camera);gl.finish();timings[on?'on':'off'].push(performance.now()-start);await new Promise(r=>requestAnimationFrame(r));}
    }
    toggle(true);
    const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
    return{gpu,lights,ratio:renderer.getPixelRatio(),buffer:[renderer.domElement.width,renderer.domElement.height],samplesPerMode:timings.on.length,onMedianMs:median(timings.on),offMedianMs:median(timings.off)};
   });
   results.push({map,...result});assert.equal(posts,0);console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
