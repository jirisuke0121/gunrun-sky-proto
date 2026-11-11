// Real game, old town. Runs straight at every short roof-to-roof jump the map's own navigation graph lists
// (one per take-off spot and direction, 3 m run-up, thumb held forward) and presses jump 0.5 / 0.25 / 0.05 m
// before the lip - the natural, late timing. Compares the landing assist (edge-assist.js, default) with
// ?landAssist=0. Without it the usual failure is not falling short: the jump clears the gap, flies over a
// landing 1-2 m deep and comes down a level lower. LANDING_SPOTS limits the spots (default: every second one).
// Not a person: the thumb never lets go or pulls back in the air.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(await fs.promises.readFile(name));}catch{res.writeHead(404);res.end();}});
async function open(browser,base,query=''){const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});await ctx.addInitScript(()=>{window.__hold=true});const errors=[];
 await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 const p=await ctx.newPage();p.setDefaultTimeout(120000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+`index.html?camera=after&lang=ja&controlpick=0&hookGuide=0&dev=1${query}`);
 await p.waitForFunction(()=>window.skyStartReadiness?.ready&&document.body.dataset.skyHumanLoaded==='true');await p.locator('#bStart').tap();return{ctx,p,errors};}
const launch=()=>chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const PRESS=[.5,.25,.05],EVERY=Number(process.env.LANDING_EVERY||2);
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;let browser;const summary={};
try{browser=await launch();
 for(const mode of['off','on']){const {ctx,p,errors}=await open(browser,base,mode==='off'?'&landAssist=0':'');
  await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,'jump-landing-scenario.js'),'utf8')});
  assert.equal(await p.evaluate(()=>skyEdgeAssist.landingAssist),mode==='on');
  const all=await p.evaluate(()=>{window.GAP_MIN=0;return gapLinks(5.7,3)});const seen=new Set(),spots=[];
  for(const l of all.sort((a,b)=>a.d-b.d||a.from[0]-b.from[0]||a.from[2]-b.from[2])){const k=[l.from.map(v=>v.toFixed(0)),Math.round(Math.atan2(l.ux,l.uz)*4/Math.PI)].join();if(!seen.has(k)){seen.add(k);spots.push(l)}}
  const rows=[];for(const l of spots.filter((_,i)=>i%EVERY===0)){const by={};for(const pr of PRESS)by[pr]=(await p.evaluate(a=>runGapJump(...a),[l,pr])).why;rows.push(by)}
  const grabbed=rows.filter(r=>Object.values(r).some(w=>w==='grabbed bar/zip'||w==='ladder')),plain=rows.filter(r=>!grabbed.includes(r));
  const fails={};for(const r of plain)for(const w of Object.values(r))if(w!=='landed')fails[w]=(fails[w]||0)+1;
  summary[mode]={spots:rows.length,ofSpots:spots.length,barOrZip:grabbed.length,plain:plain.length,landsAtEveryLatePress:plain.filter(r=>Object.values(r).every(w=>w==='landed')).length,lateFailures:fails,trims:await p.evaluate(()=>skyEdgeAssist.landingTrims)};
  assert.deepEqual(errors,[],'no page errors');await ctx.close();}
 console.log(JSON.stringify(summary,null,1));const {on,off}=summary;
 assert.equal(off.trims,0,'switched off, no jump is shortened');assert.ok(on.trims>0,'the assist shortens some jumps');
 assert.equal(on.barOrZip,off.barOrZip,'jumps that reach a bar or a zip line still reach it');
 assert.ok(on.landsAtEveryLatePress>=off.landsAtEveryLatePress+Math.max(2,Math.floor(off.plain*.08)),'more take-off spots land at every late press');
 assert.ok((on.lateFailures.short||0)<=(off.lateFailures.short||0),'no jump is made to fall short');
 assert.ok(on.landsAtEveryLatePress>=on.plain*.85,'at least 85% of the take-off spots land at every late press');
 console.log('PASS landing assist: late-pressed jumps come down on the roof they pass over');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
