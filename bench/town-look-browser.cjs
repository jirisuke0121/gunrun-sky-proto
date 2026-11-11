// Town look (look-pass.js palette + ink-outline.js), real old-town map, mobile viewport.
//  1. the palette finds buildings, recolours them, turns the terracotta tile meshes slate, and no two touching buildings share a colour
//  2. the outline is one extra mesh (a few thousand triangles), can be switched off (?outline=0), and the palette can be switched back (?look=district)
//  3. regression: with the outline on, none of the fixed views gets darker than with it off. A camera that stands next to
//     (or inside) a box once drew that box as a solid black wall; the first view is the game's own start view, where it happened.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(await fs.promises.readFile(name));}catch{res.writeHead(404);res.end();}});
// [camera x,y,z, look-at x,y,z, fov]; null = the game's own camera
const VIEWS=[null,[-20,60,70,-20,0,0,55],[-60,14,40,-40,3,0,60],[-31.4,5.5,2.9,-32.7,4.9,-7,70],[-33.6,5.5,1,-37.7,4.9,-8.2,70],[-38.3,9,-3.4,-33.5,8.4,-12.1,70],[2.3,2,5,-6.5,1.4,.3,70]];
async function open(browser,base,query){
 const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});
 await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(120000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+`index.html?camera=after&lang=ja&controlpick=0&hookGuide=0&dev=1${query}`);
 await p.waitForFunction(()=>window.skyStartReadiness?.ready&&document.body.dataset.skyHumanLoaded==='true'&&window.skyLookInfo&&(window.skyInkOutline||false));
 await p.locator('#bStart').tap();await p.waitForTimeout(2500);
 return{ctx,p,errors};
}
// fraction of near-black pixels in the next frame, optionally from a fixed camera
async function dark(p,view){
 return p.evaluate(v=>new Promise(resolve=>{
  const g=window.__skyInternals,r=window.__game.debug.renderer;
  if(!window.__townPatched){const orig=r.render.bind(r);window.__townPatched=true;
   r.render=(s,c)=>{const w=window.__townView;if(w&&c===g.Se){c.position.set(w[0],w[1],w[2]);c.lookAt(w[3],w[4],w[5]);c.fov=w[6];c.updateProjectionMatrix();}
    orig(s,c);
    if(window.__townGrab&&c===g.Se){window.__townGrab=false;const k=document.createElement('canvas');k.width=r.domElement.width>>2;k.height=r.domElement.height>>2;const x=k.getContext('2d',{willReadFrequently:true});x.drawImage(r.domElement,0,0,k.width,k.height);
     const d=x.getImageData(0,0,k.width,k.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]<40)n++;window.__townDark=n/(d.length/4);}};
  }
  window.__townView=v;window.__townDark=null;setTimeout(()=>{window.__townGrab=true;const t=setInterval(()=>{if(window.__townDark!==null){clearInterval(t);resolve(window.__townDark)}},30)},700);
 }),view);
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 const launch=()=>chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let browser;
 try{browser=await launch();const summary={};
  const on=await open(browser,base,''),off=await open(browser,base,'&outline=0'),plain=await open(browser,base,'&look=district&outline=0');
  const info=await on.p.evaluate(()=>({look:window.skyLook,info:window.skyLookInfo,ink:window.skyInkOutline,hull:(()=>{const m=window.__skyInternals.ue.children.find(c=>c.name==='Ink outline');return m?{visible:m.visible,castShadow:m.castShadow,count:m.geometry.attributes.position.count/3}:null})()}));
  summary.on=info;
  assert.equal(info.look,'town');
  assert.ok(info.info.buildings>=20,'buildings are grouped: '+info.info.buildings);
  assert.ok(info.info.recoloured>=20,'meshes recoloured: '+info.info.recoloured);
  assert.ok(info.info.tileMeshes>=1,'terracotta tile meshes turn slate');
  assert.equal(info.info.sameColourNeighbours,0,'no two touching buildings share a colour');
  assert.ok(info.hull&&info.hull.visible&&!info.hull.castShadow,'outline mesh exists and casts no shadow');
  assert.ok(info.hull.count>2000&&info.hull.count<30000,'outline triangle count is small: '+info.hull.count);
  assert.equal(await off.p.evaluate(()=>window.skyInkOutline.enabled),false,'?outline=0 turns the outline off');
  assert.equal(await off.p.evaluate(()=>window.__skyInternals.ue.children.some(c=>c.name==='Ink outline')),false,'no outline mesh when off');
  const old=await plain.p.evaluate(()=>({look:window.skyLook,info:window.skyLookInfo}));
  assert.equal(old.look,'district');assert.equal(old.info.recoloured,0,'?look=district keeps the previous tint-only look');
  // draw calls: switching the one outline mesh on and off in the same page changes the count by about one
  const calls=await on.p.evaluate(()=>new Promise(resolve=>{const hull=window.__skyInternals.ue.children.find(c=>c.name==='Ink outline'),info=window.__game.debug.renderer.info.render;
   const read=visible=>new Promise(r=>{hull.visible=visible;setTimeout(()=>r(info.calls),500)});
   read(false).then(a=>read(true).then(b=>read(false).then(c=>read(true).then(d=>resolve({without:[a,c],with:[b,d]})))));}));
  summary.calls=calls;
  const delta=Math.min(...calls.with)-Math.max(...calls.without);
  assert.ok(delta>=0&&delta<=3,'the outline costs about one draw call: '+JSON.stringify(calls));
  // regression: no view gets darker with the outline on
  summary.dark=[];
  for(const view of VIEWS){const a=await dark(off.p,view),b=await dark(on.p,view);summary.dark.push([+a.toFixed(3),+b.toFixed(3)]);
   assert.ok(b-a<.02,`outline darkens a fixed view (${JSON.stringify(view)}): ${a} -> ${b}`);}
  for(const o of [on,off,plain])assert.deepEqual(o.errors,[],'no page errors');
  console.log(JSON.stringify(summary));console.log('PASS town look: palette, slate roofs, one-mesh outline, switches, no black walls');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
