const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8879/',out='browser-evidence/player-clarity';
fs.mkdirSync(out,{recursive:true});
const jp=/[\u3040-\u30ff\u4e00-\u9fff]/;
const maps=(process.env.CLARITY_MAPS||'index.html,canyon.html').split(',');
(async()=>{for(let i=0;i<50;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:process.platform==='darwin'?['--no-sandbox']:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const results=process.env.CLARITY_MAPS&&fs.existsSync(out+'/results.json')?JSON.parse(fs.readFileSync(out+'/results.json')).filter(r=>!maps.some(m=>r.id.startsWith(m.split('.')[0]+'-'))):[];
try{for(const map of maps)for(const lang of ['ja','en'])for(const layout of [{id:'phone',width:844,height:390,touch:true},{id:'small',width:640,height:320,touch:true},{id:'desktop',width:1280,height:720,touch:false}]){
 if(process.env.CLARITY_SMOKE&&(lang!=='ja'||layout.id!=='phone'))continue;
 if(process.env.CLARITY_LAYOUTS&&!process.env.CLARITY_LAYOUTS.split(',').includes(layout.id))continue;
 const id=`${map.split('.')[0]}-${lang}-${layout.id}`,errors=[];
 const ctx=await browser.newContext({locale:lang==='ja'?'ja-JP':'en-US',viewport:{width:layout.width,height:layout.height},isMobile:layout.touch,hasTouch:layout.touch});
 await ctx.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-name','Clarity test');localStorage.setItem('gunrun-quality-check-v1','done')});let posts=0;
 await ctx.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0}'})});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
 const press=async selector=>{if(!layout.touch){await p.keyboard.press({'#tDecoy':'2','#tFlash':'1','#tRescue':'v','#tAutoFire':'x'}[selector]);return}const r=await p.locator(selector).boundingBox();assert.ok(r);await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2)};
 const clearView=async()=>{
  const boxes=await p.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};return{messages:[...document.querySelectorAll('#runResponsibility,#actionFeedback,#supplyFeedback,#weaponSupplyStatus')].filter(e=>e.checkVisibility({visibilityProperty:true})).map(e=>({id:e.id,...box(e)})),life:box(document.querySelector('.hud-tl')),labels:[...document.querySelectorAll('#skillDock [data-action-state],#tFlash small')].map(e=>({text:e.textContent,...box(e),button:box(e.closest('button'))}))}});
  assert.ok(boxes.messages.length<=1,`${id}: duplicate HUD explanations`);
  for(const r of boxes.messages){assert.ok(r.x>=0&&r.x+r.w<=layout.width*.33&&r.y>=boxes.life.y+boxes.life.h&&r.y+r.h<layout.height*.68,`${id}: ${r.id} covers the central play view or life HUD: ${JSON.stringify(boxes)}`)}
  for(const r of boxes.labels){const b=r.button;assert.ok(r.x>=b.x-1&&r.x+r.w<=b.x+b.w+1&&r.y>=b.y&&r.y+r.h<=b.y+b.h,`${id}: skill caption outside its button: ${JSON.stringify(r)}`);if(lang==='en')assert.ok(!jp.test(r.text),r.text)}
  return boxes;
 };
 await p.goto(base+map+`?lang=${lang}&controlpick=0&hookGuide=0&guides=0`);
 await p.waitForFunction(()=>skyStartReadiness?.ready&&window.skyPlayerClarity,null,{timeout:120000});
 const hasRescue=await p.evaluate(()=>!!window.skyRescue);assert.equal(hasRescue,map==='index.html','rescue remains available only on its existing map');
 const home=await p.locator('.home-scene-copy p').innerText();assert.match(home,lang==='ja'?/移動.*自動/:/You move.*automatically/);
 await p.evaluate(()=>document.getElementById('bIntro').click());
 await p.evaluate(()=>{const g=__game,s=__skyInternals,c=g.P;g.S.sendLog=false;c.invuln=Infinity;g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=Infinity;
  for(const z of g.zombies){z.dead=true;z.remove=true;z.m.root.visible=false}
  const n=g.NAV.nodes.find(n=>g.freeAt(n.x,n.y+.03,n.z,.3,1.75)&&g.solids.some(b=>b.solid&&!b.off&&b.type!=='mono'&&Math.abs(b.maxY-n.y)<.08&&n.x-.26>=b.minX&&n.x+.26<=b.maxX&&n.z-.26>=b.minZ&&n.z+.26<=b.maxZ));
  if(!n)throw Error('No supported footprint');window.clarityFoot=[n.x,n.y+.01,n.z];
  window.clarityPlace=()=>{skySwing.reset();c.pos.fromArray(clarityFoot);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.ledge=c.ladder=c.zip=c.hook=c.doorAction=null;c.jumpBuf=c.slideBuf=0;skyFollowCamera.reset()};
  window.clarityTick=n=>{for(let i=0;i<n;i++)g.advance(1/60);g.frameOnce(0);skyPlayerClarity.render()};clarityPlace();g.frameOnce(0);skyPlayerClarity.render();
 });
 assert.equal(await p.locator('#runResponsibility').isVisible(),true);await clearView();await p.screenshot({path:`${out}/${id}-roles.png`});
 const shotReasons=await p.evaluate(map=>{const s=__skyInternals,g=__game,c=g.P,rows=[];
  for(const state of ['reload','ledge','ladder','swing',...(map==='index.html'?['door']:[])]){
   clarityPlace();s.Et.reloadT=state==='reload'?.8:0;c.state=['ledge','ladder','swing'].includes(state)?state:'normal';c.doorAction=state==='door'?{}:null;
   const before=g.stats.shots||0;g.fire();skyPlayerClarity.render();rows.push({state,blocked:s.gunBlockReason(),before,after:g.stats.shots||0,text:document.getElementById('gunState').textContent});
  }
  clarityPlace();s.Et.reloadT=0;s.U.reserveAmmo=24;s.Et.ammo=s.Et.reserve=0;g.fire();skyPlayerClarity.render();return{rows,empty:document.getElementById('gunState').textContent};
 },map);
 for(const row of shotReasons.rows){assert.equal(row.blocked,row.state);assert.equal(row.before,row.after);assert.ok(row.text.length>4);if(lang==='en')assert.ok(!jp.test(row.text),row.text)}
 assert.match(shotReasons.empty,lang==='ja'?/弾切れ.*補給/:/Out of ammo.*refill/);await p.screenshot({path:`${out}/${id}-empty.png`});
 await p.evaluate(()=>{const s=__skyInternals;s.Et.ammo=s.Et.mag;s.Et.reserve=24;s.Et.reloadT=0;skyPlayerClarity.render()});
 await press('#tAutoFire');await p.waitForFunction(()=>!__game.S.autoFire);await p.evaluate(()=>skyPlayerClarity.render());
 assert.match(await p.locator('#gunState').innerText(),lang==='ja'?/停止中.*再開/:/Stopped.*resume/i);
 await press('#tAutoFire');await p.waitForFunction(()=>__game.S.autoFire);await p.evaluate(()=>{__game.S.autoFire=false;skyPlayerClarity.render()});
 // The real skill button consumes once; rejected repeated presses consume nothing.
 await press('#tDecoy');assert.equal(await p.evaluate(()=>skyDecoy.stats.used),1);
 await press('#tDecoy');await p.evaluate(()=>skyPlayerClarity.render());
 const active=await p.locator('#actionFeedback').innerText();assert.match(active,lang==='ja'?/分身発動中/:/Decoy active/);assert.equal(await p.evaluate(()=>skyDecoy.stats.used),1);
 await p.evaluate(()=>clarityTick(380));
 await press('#tDecoy');await p.evaluate(()=>skyPlayerClarity.render());
 const cooldown=await p.locator('#actionFeedback').innerText();assert.match(cooldown,lang==='ja'?/再使用待ち.*秒/:/recharging.*s left/);
 const view=await clearView();
 await p.screenshot({path:`${out}/${id}-cooldown.png`});
 const rects=await p.evaluate(()=>{const ids=['actionFeedback','toast','tJump','tSlide','tAutoFire','ammoBox','skyMinimap','tFlash','tDecoy','tRescue'];return Object.fromEntries(ids.map(id=>{const e=document.getElementById(id),r=e?.getBoundingClientRect();return[id,r?{x:r.x,y:r.y,w:r.width,h:r.height,visible:e.checkVisibility()&&+getComputedStyle(e).opacity>.01}:{visible:false}]}))});
 const overlaps=(a,b)=>a.x<b.x+b.w-.5&&a.x+a.w>b.x+.5&&a.y<b.y+b.h-.5&&a.y+a.h>b.y+.5;
 for(const name of ['toast','tJump','tSlide','tAutoFire','ammoBox','skyMinimap'])if(rects[name].visible)assert.equal(overlaps(rects.actionFeedback,rects[name]),false,`${id}: feedback overlaps ${name} ${JSON.stringify(rects)}`);
 for(const name of ['tAutoFire','actionFeedback'])assert.ok(rects[name].x>=0&&rects[name].y>=0&&rects[name].x+rects[name].w<=layout.width+1&&rects[name].y+rects[name].h<=layout.height+1,`${id}: ${name} outside viewport`);
 for(const name of ['skyMinimap','tJump','tSlide'])if(rects[name].visible)assert.equal(overlaps(rects.tAutoFire,rects[name]),false,`${id}: fire control overlaps ${name}`);
 await p.evaluate(()=>{skyDecoy.clear();clarityPlace()});
 await press('#tFlash');const charges=await p.evaluate(()=>skyFlashbang.charges);assert.equal(charges,0);
 await press('#tFlash');await p.evaluate(()=>skyPlayerClarity.render());const emptyFlash=await p.locator('#actionFeedback').innerText();assert.match(emptyFlash,lang==='ja'?/残り0個.*補充/:/No flashbangs.*refill/);assert.equal(await p.evaluate(()=>skyFlashbang.charges),0);
 await clearView();await p.screenshot({path:`${out}/${id}-flash.png`});
 // There is no higher platform 200m above the map; the failed rescue costs no charge.
 let rescue=null;
 if(hasRescue){
  rescue=await p.evaluate(()=>{const c=__game.P;clarityPlace();c.pos.y=200;c.onGround=false;const before=skyRescue.charges,ok=skyRescue.activate();skyPlayerClarity.render();return{ok,before,after:skyRescue.charges,text:document.getElementById('actionFeedback').textContent}});
  assert.equal(rescue.ok,false);assert.equal(rescue.before,rescue.after);assert.match(rescue.text,lang==='ja'?/高台がありません/:/No safe higher platform/);
  await p.evaluate(()=>{__game.P.state='hook'});await press('#tRescue');await p.evaluate(()=>skyPlayerClarity.render());
  assert.match(await p.locator('#actionFeedback').innerText(),lang==='ja'?/移動技の終了後/:/after this move/);
  if(lang==='ja'&&layout.id==='phone'){
   const legal=await p.evaluate(()=>{const g=__game,c=g.P;clarityPlace();for(const n of g.NAV.nodes.filter(n=>n.y<1).slice(0,100)){c.pos.set(n.x,n.y+.01,n.z);if(skyRescue.chooseTarget())return{position:c.pos.toArray(),charges:skyRescue.charges}}return null});
   assert.ok(legal,'a legal native rescue launch exists');await press('#tRescue');
   const launched=await p.evaluate(()=>({state:__game.P.state,charges:skyRescue.charges,text:document.getElementById('actionFeedback').textContent}));
   assert.equal(launched.state,'hook');assert.equal(launched.charges,legal.charges-1);assert.match(launched.text,/自動移動中.*到着後/);rescue.launched=launched;
  }
 }
 await p.evaluate(()=>{clarityPlace();__game.setMode('pause');skyPlayerClarity.render()});assert.equal(await p.locator('#actionFeedback').isVisible(),false);
 await p.evaluate(()=>{__game.setMode('play');clarityPlace();clarityTick(400);skyWeaponDrops.frame();skyPlayerClarity.render()});
 const drops=await p.evaluate(()=>JSON.parse(document.body.dataset.skyWeaponDrops));assert.ok(drops.spawned>=1,JSON.stringify(drops));
 const status=await p.locator('#weaponSupplyStatus').innerText();assert.match(status,lang==='ja'?/触れて武器・弾を補充/:/Touch to equip and refill/);
 await clearView();await p.screenshot({path:`${out}/${id}-supply-target.png`});
 const pickup=await p.evaluate(()=>{const g=__game,s=__skyInternals,d=JSON.parse(document.body.dataset.skyWeaponDrops).items[0];clarityPlace();g.P.pos.fromArray(d.position);g.P.pos.y+=.01;s.Et.ammo=1;s.Et.reserve=0;const before=g.stats.weaponPickups||0;skyWeaponDrops.step(.01);skyWeaponDrops.frame();g.frameOnce(0);skyPlayerClarity.render();return{before,after:g.stats.weaponPickups,ammo:s.Et.ammo,reserve:s.Et.reserve,mag:s.wpc().mag,text:document.getElementById('supplyFeedback').textContent}});
 assert.equal(pickup.after,pickup.before+1);assert.equal(pickup.ammo,pickup.mag);assert.ok(pickup.reserve>0);assert.match(pickup.text,lang==='ja'?/装填.*予備.*逃げよう/:/Loaded.*reserve.*Keep moving/);await p.screenshot({path:`${out}/${id}-supply-collected.png`});
 const marker=await p.evaluate(()=>{const g=__game,m=g.MARK,site=g.MARK_SITES.find(n=>g.freeAt(n[0],n[1]+.03,n[2],.3,1.75));m.off=false;m.i=g.MARK_SITES.indexOf(site);m.goal=null;g.P.pos.set(site[0],site[1]+.01,site[2]);g.P.onGround=true;const before=m.reached;clarityTick(2);return{before,after:m.reached,action:document.getElementById('markAction').textContent}});
 assert.ok(marker.after>marker.before);assert.match(marker.action,lang==='ja'?/逃げ道の候補/:/Suggested escape route/);
 await p.evaluate(()=>{__game.GAME.t=75;__game.endGame('caught');__game.advance(1.5)});await p.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
 await p.screenshot({path:`${out}/${id}-intro-result.png`});
 await p.locator('#introNext').click();await p.waitForFunction(()=>__game.mode==='play'&&skyChallenge.id==='easy'&&!skyChallenge.isIntroRun);
 const next=await p.evaluate(()=>({mode:__game.mode,difficulty:skyChallenge.id,intro:skyChallenge.isIntroRun,life:__game.P.life}));assert.equal(next.life,8);
 if(lang==='en')for(const text of [active,cooldown,emptyFlash,rescue?.text||'',status,pickup.text,marker.action])assert.ok(!jp.test(text),text);
 assert.equal(posts,0);assert.deepEqual(errors,[]);results.push({id,home,shotReasons,active,cooldown,emptyFlash,rescue,rects,view,drops,pickup,marker,next,posts,errors});fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log('PASS',id,'roles, native shot blocks, skill denial/no spend, supplies, route marker, direct intro-to-Easy, clear central view and no uploads');await ctx.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
