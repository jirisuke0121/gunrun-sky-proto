// Real game, old town. At the top of every ladder: (1) run up and press jump 0.3 m before the lip - the runner must
// jump, not be taken down the ladder; (2) run up and keep pushing outward without jumping - the runner still steps
// onto the ladder after being held at the lip for a moment (escape-routes.js).
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
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;let browser;
try{browser=await launch();const {p,errors}=await open(browser,base);
 const rows=await p.evaluate(()=>{const g=__game,c=g.P,s=__skyInternals,U=s.U;g.S.sendLog=g.S.autoFire=false;c.invuln=Infinity;g.GAME.spawnT=g.GAME.surgeT=Infinity;g.SCR.off=g.PACE.off=g.MARK.off=true;for(const z of g.zombies){s.ue.remove(z.m.root);if(z.pool)s.ue.remove(z.pool)}g.zombies.length=0;
  const place=(at,yaw)=>{g.GAME.t=0;skySwing.reset();skyEscapeRoutes.reset();c.pos.set(...at);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.eye=1.62;c.camY=c.pos.y+c.eye;c.yaw=yaw;c.pitch=-.12;c.ledge=c.ladder=c.hook=c.zip=c.doorAction=null;c.jumpBuf=c.slideBuf=0;c.edgeJump=false;c.edgeOff=null;c.setCD=0;skyFollowCamera.reset();g.frameOnce(0)};
  const supported=(x,y,z)=>!g.freeAt(x,y-.12,z,.1,.1),rows=[];
  for(const L of g.LADDERS){const nx=L.nx||0,nz=L.nz||0;for(const back of[3,2])for(const mode of['jump','hold']){
    const sx=L.x-nx*back,sz=L.z-nz*back;if(!supported(sx,L.y1+.05,sz)||!g.freeAt(sx,L.y1+.05,sz,.32,1.75))continue;
    place([sx,L.y1+.001,sz],Math.atan2(-nx,-nz));const j0=g.stats.jumps||0;let pressed=false,ladderAt=null,t=0;
    for(let i=0;i<150;i++){Object.assign(s.inputState,{on:true,id:1,x:0,y:-1});
     if(mode==='jump'&&!pressed&&c.onGround){let lip=null;for(let q=0;q<=2.6;q+=.02)if(!supported(c.pos.x+nx*q,c.pos.y+.05,c.pos.z+nz*q)){lip=q;break}if(lip!=null&&lip<=.3){pressed=true;c.jumpBuf=U.jumpBuffer}}
     g.advance(1/60);g.cam(1/60);skyHumanView.update(1/60);t+=1/60;if(c.state==='ladder'){ladderAt=+t.toFixed(2);break}}
    Object.assign(s.inputState,{on:false,id:null,x:0,y:0});rows.push({at:[L.x,L.y1,L.z].map(v=>+v.toFixed(1)),back,mode,pressed,ladderAt,jumped:(g.stats.jumps||0)>j0})}}
  return rows});
 const jump=rows.filter(r=>r.mode==='jump'&&r.pressed),hold=rows.filter(r=>r.mode==='hold');
 console.log(JSON.stringify({ladders:new Set(rows.map(r=>r.at.join())).size,jumpRuns:jump.length,takenDown:jump.filter(r=>r.ladderAt!=null).length,jumped:jump.filter(r=>r.jumped).length,holdRuns:hold.length,steppedOn:hold.filter(r=>r.ladderAt!=null).length,after:hold.map(r=>r.ladderAt)}));
 assert.ok(jump.length>=8&&hold.length>=8,'enough ladder tops were tested');
 assert.equal(jump.filter(r=>r.ladderAt!=null).length,0,'a runner who jumps from the lip is not taken down the ladder');
 assert.ok(jump.filter(r=>r.jumped).length>=jump.length*.8,'the pressed jumps are jumps (a zip line or a vault at the same lip may take a few)');
 assert.ok(hold.every(r=>r.ladderAt!=null&&r.ladderAt<1.2),'pushing outward at the lip still steps onto the ladder within 1.2 s');
 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS ladder top: jumping from the lip jumps; holding outward at the lip still descends');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
