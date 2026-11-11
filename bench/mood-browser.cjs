// Mood (mood.js): ?mood=dusk|dawn changes the light and sky only, and adds three small meshes.
//  1. default (noon) is unchanged: no mood meshes, the original high sun
//  2. dusk: low warm sun, sun glow + far skyline + dust motes, each costs at most one draw call; skyline stays under 2000 triangles
//  3. ?look=classic ignores the mood; the lowest render quality hides the motes
//  4. the fixed views do not become dark enough to hide the player: near-black share stays small
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(await fs.promises.readFile(name));}catch{res.writeHead(404);res.end();}});
// [camera x,y,z, look-at x,y,z, fov]; null = the game's own camera
const VIEWS=[null,[-20,60,70,-20,0,0,55],[-60,14,40,-40,3,0,60],[-31.4,5.5,2.9,-32.7,4.9,-7,70],[24,11,-12,-20,3,8,62],[-34,11,12,10,2,-10,62],[0,13,-20,-10,2,10,70],[2.3,2,5,-6.5,1.4,.3,70]];
const MOOD_MESHES=['Sun glow','Far skyline','Dust motes'];
async function open(browser,base,query){
 const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
 await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(120000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/GL Driver|Ignored attempt/.test(m.text()))errors.push(m.text())});
 await p.goto(base+`index.html?camera=after&lang=ja&controlpick=0&hookGuide=0&dev=1${query}`);
 await p.waitForFunction(()=>window.skyStartReadiness?.ready&&document.body.dataset.skyHumanLoaded==='true'&&(window.skyLookInfo||window.skyLook==='classic'));
 await p.locator('#bStart').tap();await p.waitForTimeout(2500);
 return{ctx,p,errors};
}
// share of near-black pixels from a fixed camera
async function dark(p,view){
 return p.evaluate(v=>new Promise(resolve=>{
  const g=window.__skyInternals,r=window.__game.debug.renderer;
  if(!window.__moodPatched){const orig=r.render.bind(r);window.__moodPatched=true;
   r.render=(s,c)=>{const w=window.__moodView;if(w&&c===g.Se){c.position.set(w[0],w[1],w[2]);c.lookAt(w[3],w[4],w[5]);c.fov=w[6];c.updateProjectionMatrix();}
    orig(s,c);
    if(window.__moodGrab&&c===g.Se){window.__moodGrab=false;const k=document.createElement('canvas');k.width=r.domElement.width>>2;k.height=r.domElement.height>>2;const x=k.getContext('2d',{willReadFrequently:true});x.drawImage(r.domElement,0,0,k.width,k.height);
     const d=x.getImageData(0,0,k.width,k.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]<40)n++;window.__moodDark=n/(d.length/4);}};
  }
  window.__moodView=v;window.__moodDark=null;setTimeout(()=>{window.__moodGrab=true;const t=setInterval(()=>{if(window.__moodDark!==null){clearInterval(t);resolve(window.__moodDark)}},30)},700);
 }),view);
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 const launch=()=>chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let browser;
 try{browser=await launch();const summary={};
  const noon=await open(browser,base,''),dusk=await open(browser,base,'&mood=dusk'),dawn=await open(browser,base,'&mood=dawn'),classic=await open(browser,base,'&mood=dusk&look=classic');
  const has=p=>p.evaluate(names=>names.map(n=>window.__skyInternals.ue.children.some(c=>c.name===n)),MOOD_MESHES);
  // 1. noon is unchanged
  assert.deepEqual(await has(noon.p),[false,false,false],'noon adds no mood meshes');
  const noonSun=await noon.p.evaluate(()=>({y:window.skySunDir.y,exposure:window.__game.debug.renderer.toneMappingExposure,mood:document.body.dataset.skyMood||null}));
  assert.ok(noonSun.y>.8&&noonSun.exposure===1.25&&noonSun.mood===null,'noon keeps the original sun and exposure: '+JSON.stringify(noonSun));
  // 2. dusk and dawn
  for(const [name,o,maxY] of [['dusk',dusk,.4],['dawn',dawn,.3]]){
   assert.deepEqual(await has(o.p),[true,true,true],name+' adds sun glow, skyline and motes');
   const s=await o.p.evaluate(()=>({y:window.skySunDir.y,mood:document.body.dataset.skyMood,skyline:window.skySkyline.triangles,ambient:window.skyAmbient}));
   assert.equal(s.mood,name);assert.ok(s.y>.15&&s.y<maxY,name+' sun is low: '+s.y);assert.ok(s.skyline<=2000,name+' skyline triangles: '+s.skyline);
   summary[name]=s;
  }
  // draw-call cost of each mesh, averaged over 4 frames (the shadow map refreshes every other frame)
  const cost=await dusk.p.evaluate(names=>{const g=window.__game,R=g.debug.renderer,S=window.__skyInternals;
   const meas=()=>{let c=0,t=0;for(let i=0;i<4;i++){R.info.reset();R.render(S.ue,g.debug.camera);c+=R.info.render.calls;t+=R.info.render.triangles}return[c/4,t/4]};
   const all=meas(),out={};let sum=[0,0];
   for(const n of names){const m=S.ue.children.find(c=>c.name===n);m.visible=false;const b=meas();m.visible=true;out[n]=[all[0]-b[0],all[1]-b[1]];sum=[sum[0]+all[0]-b[0],sum[1]+all[1]-b[1]]}
   return{out,sum}},MOOD_MESHES);
  summary.cost=cost;
  for(const n of MOOD_MESHES)assert.ok(cost.out[n][0]>=0&&cost.out[n][0]<=1.01,n+' costs at most one draw call: '+cost.out[n][0]);
  assert.ok(cost.sum[0]<=3.05&&cost.sum[1]<=3000,'mood costs 3 draw calls and under 3000 triangles: '+JSON.stringify(cost.sum));
  // 3. classic ignores the mood; the lowest quality hides the motes
  assert.deepEqual(await has(classic.p),[false,false,false],'?look=classic ignores the mood');
  const quality=await dusk.p.evaluate(()=>new Promise(resolve=>{const m=window.__skyInternals.ue.children.find(c=>c.name==='Dust motes'),a=m.visible;window.skyRenderQuality.select('minimum');setTimeout(()=>{const b=m.visible;window.skyRenderQuality.select('high');setTimeout(()=>resolve([a,b,m.visible]),50)},50)}));
  assert.deepEqual(quality,[true,false,true],'motes are hidden in the lowest render quality: '+JSON.stringify(quality));
  // 4. darkness: the fixed views stay readable
  summary.dark=[];
  for(const view of VIEWS){const a=await dark(noon.p,view),b=await dark(dusk.p,view),c=await dark(dawn.p,view);summary.dark.push([+a.toFixed(3),+b.toFixed(3),+c.toFixed(3)]);
   assert.ok(b<=.2&&b-a<.12,`dusk is too dark in a fixed view (${JSON.stringify(view)}): noon ${a} -> dusk ${b}`);
   assert.ok(c<=.2&&c-a<.12,`dawn is too dark in a fixed view (${JSON.stringify(view)}): noon ${a} -> dawn ${c}`);}
  for(const o of [noon,dusk,dawn,classic])assert.deepEqual(o.errors,[],'no page errors');
  console.log(JSON.stringify(summary));console.log('PASS mood: noon unchanged, dusk/dawn light, three cheap meshes, switches, readable darkness');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
