// How much breathing room does each kind of move buy against one pursuer? Real game, old town, real pursuit AI.
//   node tools/chase-respite.cjs [--out=file.json]
// 1. Flat street: the pursuer's pace for each difficulty (the speed multiplier is fitted to the table in CHALLENGE_DIFFICULTY.md).
// 2. Roof-to-roof jumps: pursuer 3 m behind, the runner jumps (pressed 0.25 m before the lip), runs on for 0.5 s and stops.
//    Respite = seconds from landing to the first real hit.
// 3. Zip lines, bars, rope swing, window dive, tower tunnel: seconds the pursuer needs from the take-off to a player standing
//    at the landing, minus the time the move takes the player (bars: 3 s assumed).
// One pursuer, no gun, the runner stands still afterwards: a floor for the respite, not a whole run. Not a person.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=(process.argv.find(a=>a.startsWith('--out='))||'').split('=')[1];
const PACE={'easy 5.4 m/s':5.4,'normal 6.4 m/s':6.4,'hard 7.4 m/s':7.4};
const server=http.createServer(async(req,res)=>{try{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(await fs.promises.readFile(name));}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;let browser;
try{browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:'ja-JP'});await ctx.addInitScript(()=>{window.__hold=true});
 await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
 const p=await ctx.newPage();p.setDefaultTimeout(120000);await p.goto(base+'index.html?camera=after&lang=ja&controlpick=0&hookGuide=0&dev=1');
 await p.waitForFunction(()=>window.skyStartReadiness?.ready&&document.body.dataset.skyHumanLoaded==='true');await p.locator('#bStart').tap();
 await p.evaluate(()=>{const g=__game;g.S.sendLog=g.S.autoFire=false;g.GAME.spawnT=g.GAME.surgeT=Infinity;g.SCR.off=g.PACE.off=g.MARK.off=true});
 for(const f of['jump-landing-scenario.js','chase-respite-scenario.js'])await p.addScriptTag({content:fs.readFileSync(path.join(root,'bench',f),'utf8')});
 const a=await p.evaluate(()=>flatChase(.8)),b=await p.evaluate(()=>flatChase(1.2));if(!a?.zombie||!b?.zombie)throw Error('no straight street for the pace fit');
 const slope=(b.zombie-a.zombie)/.4,mul=v=>.8+(v-a.zombie)/slope,result={pace:{at08:a.zombie,at12:b.zombie},jumps:{},moves:[]};
 console.log(`pursuer pace on a flat street: ${a.zombie.toFixed(2)} m/s at x0.8, ${b.zombie.toFixed(2)} m/s at x1.2 (runner ${a.player.toFixed(2)} m/s)`);
 const links=await p.evaluate(()=>{window.GAP_MIN=0;return gapLinks(5.7,3)}),seen=new Set(),spots=[];
 for(const l of links.sort((x,y)=>x.d-y.d||x.from[0]-y.from[0]||x.from[2]-y.from[2])){const k=[l.from.map(v=>v.toFixed(0)),Math.round(Math.atan2(l.ux,l.uz)*4/Math.PI)].join();if(!seen.has(k)){seen.add(k);spots.push(l)}}
 for(const[name,v]of Object.entries(PACE)){const rows=[];for(const l of spots){const r=await p.evaluate(x=>chaseJump(...x),[l,mul(v)]);if(!r.skip&&!r.missed&&!r.caughtBefore)rows.push(r.never?15:r.respite)}
  rows.sort((x,y)=>x-y);const q=f=>rows[Math.min(rows.length-1,Math.floor(f*rows.length))];result.jumps[name]=rows;
  console.log(`${name}: ${rows.length} jumps | respite under 1.5 s: ${rows.filter(x=>x<1.5).length}, 1.5-3 s: ${rows.filter(x=>x>=1.5&&x<3).length}, 3-6 s: ${rows.filter(x=>x>=3&&x<6).length}, 6 s+: ${rows.filter(x=>x>=6).length} | median ${q(.5).toFixed(1)} s (quartiles ${q(.25).toFixed(1)}-${q(.75).toFixed(1)})`);}
 for(const m of await p.evaluate(()=>gimmickMoves())){const t=await p.evaluate(x=>pursuerTime(...x),[m.a,m.b,mul(6.4)]);result.moves.push({...m,pursuer:t});
  console.log(`${m.name}: pursuer ${t==null?'does not arrive in 40 s':t.toFixed(1)+' s'}, player ${m.player.toFixed(1)} s -> lead ${t==null?'40+':(t-m.player).toFixed(1)} s (normal pace)`);}
 if(out)fs.writeFileSync(out,JSON.stringify(result,null,1));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
