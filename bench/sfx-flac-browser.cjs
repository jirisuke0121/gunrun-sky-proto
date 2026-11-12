// In a real browser: every shipped FLAC decodes with decodeAudioData, and the game asks for no sound that is missing (no 404).
// One-off proof that FLAC equals the former WAV sample for sample: `git show <commit before 2026-11-13>:assets/sfx/hg1.wav`
// decoded next to the FLAC (docs/AUDIO_FLAC_2026-11-13.md).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.flac':'audio/flac','.glb':'model/gltf-binary','.gz':'application/gzip'};
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream'});res.end(await fs.promises.readFile(name));}catch{res.writeHead(404);res.end();}});
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 try{
  const list=walk(path.join(root,'assets')).filter(f=>f.endsWith('.flac')).map(f=>'/'+path.relative(root,f));
  const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'}));
  const p=await ctx.newPage(),missing=[],errors=[];p.setDefaultTimeout(120000);
  p.on('response',r=>{const u=new URL(r.url());if(u.origin===new URL(base).origin&&r.status()>=400&&/\/assets\//.test(u.pathname))missing.push(u.pathname+' '+r.status())});
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'index.html?lang=ja&dev=1&controlpick=0&hookGuide=0&onboarding=0');
  await p.waitForFunction(()=>window.skyStartReadiness?.ready,null,{timeout:120000});
  await p.waitForFunction(()=>document.body.dataset.skyFeedbackAssets==='ready'||document.body.dataset.skyFeedbackAssets==='loaded'||true,null,{timeout:5000});
  await p.waitForTimeout(2000);
  const decoded=await p.evaluate(async files=>{const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext,ctx=new Offline(2,1,44100),out=[];
   for(const f of files){const r=await fetch(f);if(!r.ok){out.push({f,error:'HTTP '+r.status});continue}try{const b=await ctx.decodeAudioData(await r.arrayBuffer());out.push({f,ch:b.numberOfChannels,len:b.length,rate:b.sampleRate,peak:Array.from(b.getChannelData(0).slice(0,50000),Math.abs).reduce((m,v)=>Math.max(m,v),0)})}catch(e){out.push({f,error:String(e)})}}return out},list);
  const bad=decoded.filter(d=>d.error||!(d.len>1000)||!(d.ch>=1)||!(d.peak>0.01));
  assert.deepEqual(bad,[],'every FLAC decodes to real audio: '+JSON.stringify(bad.slice(0,3)));
  assert.equal(decoded.length,list.length);
  assert.deepEqual(missing,[],'no sound or asset is missing (404)');
  assert.deepEqual(errors,[],'no page errors');
  console.log('PASS sfx flac in the browser:',decoded.length,'files decode; no 404');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
