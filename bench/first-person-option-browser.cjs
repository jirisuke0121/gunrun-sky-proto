// 一人称視点のおまけ（first-person-option.js）：操作設定の末尾に出る任意の選択肢。
//  既定は三人称／選ぶと一人称になり保存される／ホームから普通に開始できる／一人称で遊んだランは記録を送らない／
//  次のラン開始で戻る／入門コースは三人称のまま／英語でも訳が出る。PC・スマホ、両マップ。
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=Number(process.env.SKY_TEST_PORT||18815),base=`http://127.0.0.1:${port}/`;
(async()=>{let browser,server;try{
 server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const touch of [false,true])for(const map of ['index.html','canyon.html']){
  const tag=`${map} ${touch?'touch':'pc'}`;
  const ctx=await browser.newContext({locale:'ja-JP',viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  await ctx.addInitScript(()=>window.__hold=true);
  let posts=0;await ctx.route('https://**/*',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true,"recordProtocol":2}'})});
  const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(120000);p.on('pageerror',e=>errors.push(e.message));
  const open=async q=>{await p.goto(base+map+'?controlpick=0&hookGuide=0&guides=0'+(q||''));await p.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready&&window.skyFirstPersonOption)};
  const tap=async sel=>{if(touch)await p.locator(sel).tap();else await p.locator(sel).click()};
  const view=()=>p.evaluate(()=>({view:skyHumanView.view,choice:skyHumanView.choice,body:document.body.dataset.skyHumanView,run:skyHumanView.firstPersonRun}));
  await open();
  assert.deepEqual((await view()).view,'third',`${tag}: 既定は三人称`);
  // ホームの設定 → 操作タブ。おまけは操作タブの末尾にだけ出る。
  assert.equal(await p.locator('#firstPersonOption').isVisible(),false,`${tag}: ホームには出ない`);
  await tap('#homeSettings');await tap('#pauseTab_controls');
  const box=p.locator('#pausePane_controls #firstPersonOption');
  assert.equal(await box.isVisible(),true,`${tag}: 操作タブに出る`);
  assert.equal(await p.locator('#firstPersonToggle').isChecked(),false);
  assert.match(await box.innerText(),/一人称視点（おまけ・試作）[\s\S]*送信されません/);
  const last=await p.evaluate(()=>{const pane=document.getElementById('pausePane_controls');return pane.lastElementChild.id});
  assert.equal(last,'firstPersonOption',`${tag}: 操作タブの末尾`);
  const fit=await box.evaluate(el=>{const r=el.getBoundingClientRect(),pane=el.closest('.ps-panes').getBoundingClientRect();return{w:r.width,inW:r.right<=innerWidth+1&&r.left>=-1}});assert.ok(fit.inW&&fit.w>100,`${tag}: 画面の幅に収まる ${JSON.stringify(fit)}`);
  await p.locator('#firstPersonToggle').check();
  assert.equal((await view()).view,'first',`${tag}: 選ぶと一人称`);
  assert.equal(await p.evaluate(()=>localStorage.getItem('gunrun-first-person-v1')),'1','保存される');
  await tap('#bResume');
  // ホームから普通に開始できる（開始ボタンは人物の読み込みを待つだけで、一人称でもエラー扱いにならない）。
  assert.equal(await p.evaluate(()=>skyStartReadiness.state.phase),'ready',`${tag}: 一人称でも開始できる`);
  await tap('#bStart');await p.waitForFunction(()=>__game.mode==='play');
  await p.evaluate(()=>{__game.P.invuln=Infinity;for(let i=0;i<30;i++)__game.advance(1/60);__game.frameOnce(1/60)});
  let v=await view();assert.deepEqual([v.view,v.body,v.run],['first','first',true],`${tag}: 遊んでいる間も一人称で、このランは印が付く`);
  // 手を使う技（はしご）：銃をしまい、一人称の両手で掴む。古い腕（ナイフを持った手）は出さない。
  const grip=await p.evaluate(()=>{const g=__game,c=g.P;for(const L of g.LADDERS){const nx=L.nx||0,nz=L.nz||0,sx=L.x-nx*2,sz=L.z-nz*2;if(!g.freeAt(sx,L.y1+.05,sz,.32,1.75))continue;
    skySwing.reset();c.pos.set(sx,L.y1+.001,sz);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.vel.set(0,0,0);c.state='normal';c.onGround=true;c.h=1.75;c.yaw=Math.atan2(-nx,-nz);g.keys.KeyW=true;
    for(let t=0;t<200&&c.state!=='ladder';t++)g.advance(1/60);if(c.state==='ladder')break}
   for(let i=0;i<3;i++){g.advance(1/60);g.frameOnce(1/60)}g.keys.KeyW=false;
   return{state:c.state,fp:JSON.parse(document.body.dataset.skyFirstPerson),oldArms:__skyInternals.mr.some(h=>h.root.visible)}});
  assert.equal(grip.state,'ladder',`${tag}: はしごに掴まる`);assert.equal(grip.fp.grip,'ladder');assert.equal(grip.fp.weaponVisible,false);assert.equal(grip.oldArms,false,`${tag}: 古い腕（ナイフ）は出ない`);
  await p.evaluate(()=>{const g=__game,c=g.P;skySwing.reset();c.state='normal';c.ladder=null;g.placeAt({x:c.pos.x,y:c.pos.y,z:c.pos.z,yaw:c.yaw});for(let i=0;i<3;i++){g.advance(1/60);g.frameOnce(1/60)}});
  const muzzle=await p.evaluate(()=>JSON.parse(document.body.dataset.skyFirstPerson).muzzle);
  if(muzzle){if(touch)assert.ok(muzzle[0]>.19,`${tag}: スマホは銃を右へ寄せる（変更前は0.15） ${muzzle}`);else assert.ok(muzzle[0]<.2,`${tag}: PCは従来の位置 ${muzzle}`);}
  // 背後の追手：一人称では下の光を太くする
  const edge=await p.evaluate(()=>{const g=__game,c=g.P,yaw=c.yaw,e=new g.Zombie(c.pos.x+Math.sin(yaw)*4,c.pos.y+.003,c.pos.z+Math.cos(yaw)*4);Object.assign(e,{spawnT:0,onGround:true,stun:99});g.zombies.push(e);
    const bar=document.querySelector('#threatEdge i[data-side=b]');return new Promise(res=>setTimeout(()=>{res({tier:bar.dataset.tier,w:getComputedStyle(bar).getPropertyValue('--w').trim()});const s=__skyInternals;s.ue.remove(e.m.root);g.zombies.splice(g.zombies.indexOf(e),1)},700))});
  assert.equal(edge.tier,'3',`${tag}: 背後4 mの追手で下の光が最大 ${JSON.stringify(edge)}`);assert.equal(edge.w,'72px',`${tag}: 一人称では太い光`);
  // 自己ベストとゴーストは保存しない（時間切れまで逃げ切って点が入っても）
  const saved=()=>p.evaluate(()=>JSON.stringify(Object.keys(localStorage).filter(k=>/best|ghost/i.test(k)).sort().map(k=>[k,localStorage.getItem(k)])));
  const storeBefore=await saved();
  const before=posts;
  await p.evaluate(()=>{__game.GAME.t=119.95;__game.advance(.2);__game.advance(1.5)});
  await p.waitForFunction(()=>document.getElementById('unityResultCard').dataset.complete==='true');
  assert.equal(await p.evaluate(()=>__game.GAME.pb),false,`${tag}: 自己ベストにしない`);
  assert.ok(await p.evaluate(()=>(__game.GAME.final?.total||0)>0),'点は入っている');
  assert.equal(await saved(),storeBefore,`${tag}: 自己ベスト・ゴーストを保存しない`);
  await p.waitForTimeout(800);
  assert.equal(posts,before,`${tag}: 一人称のランは記録を送らない`);
  assert.match(await p.evaluate(()=>document.querySelector('#recordDeliveryResult small')?.textContent||''),/一人称視点（おまけ）：ランキング対象外・記録送信なし/,`${tag}: 理由が出る`);
  // もう一度（一人称のまま）→ 戻して次のラン：印が外れる。
  await p.evaluate(()=>skyHumanView.setFirstPerson(false));
  await p.evaluate(()=>{document.getElementById('bMenu')?.click?.()});
  await p.evaluate(()=>{__game.setMode('menu')});
  await p.waitForFunction(()=>__game.mode==='menu');
  await p.evaluate(()=>__game.startGame());await p.waitForFunction(()=>__game.mode==='play');
  await p.evaluate(()=>{for(let i=0;i<20;i++)__game.advance(1/60)});
  v=await view();assert.deepEqual([v.view,v.run],['third',false],`${tag}: 戻すと三人称で、次のランの印は外れる`);
  // 保存は再読み込みでも残る
  await p.evaluate(()=>skyHumanView.setFirstPerson(true));await open();
  assert.equal((await view()).view,'first',`${tag}: 再読み込みしても一人称`);
  assert.equal(await p.locator('#firstPersonToggle').isChecked(),true);
  assert.equal(await p.evaluate(()=>skyStartReadiness.state.phase),'ready');
  await p.evaluate(()=>skyHumanView.setFirstPerson(false));
  assert.deepEqual(errors,[],tag);
  console.log('PASS',tag,'既定三人称・操作タブ末尾・選択と保存・開始・掴む手・銃の位置・背後の光・記録/自己ベスト/ゴーストを残さない・戻す・再読み込み');
  await ctx.close();
 }
 // 固定カメラ（?cameraTrial=fixed）は三人称のまま。設定の項目も出さない。
 for(const touch of [false,true]){
  const ctx=await browser.newContext(touch?{locale:'ja-JP',viewport:{width:844,height:390},hasTouch:true,isMobile:true}:{locale:'ja-JP',viewport:{width:1280,height:720}});
  await ctx.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-first-person-v1','1')});
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(120000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'index.html?camera=after&cameraTrial=fixed&controlpick=0&hookGuide=0&guides=0&lang=ja');
  await p.waitForFunction(()=>window.__game&&window.skyStartReadiness?.ready&&window.skyFixedCamera&&window.skyFirstPersonOption);
  assert.equal(await p.evaluate(()=>skyFirstPersonOption.box.hidden),true,'固定カメラでは項目を出さない');
  await p.evaluate(()=>document.getElementById('bStart').click());await p.waitForFunction(()=>__game.mode==='play');
  await p.evaluate(()=>{for(let i=0;i<20;i++)__game.advance(1/60);__game.frameOnce(1/60)});
  assert.deepEqual(await p.evaluate(()=>[skyHumanView.view,skyHumanView.firstPersonRun]),['third',false],'固定カメラは三人称のまま');
  assert.deepEqual(errors,[]);console.log('PASS 固定カメラは三人称のまま',touch?'touch':'pc');await ctx.close();
 }
 // 入門コースは三人称のまま（保存が一人称でも）。
 {
  const ctx=await browser.newContext({locale:'ja-JP',viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{window.__hold=true;localStorage.setItem('gunrun-first-person-v1','1')});
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(120000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'canyon.html?learn=1&camera=before&controlpick=0&hookGuide=0&guides=0&lang=ja');
  await p.waitForFunction(()=>window.skyGuidedIntro&&__game.mode==='play'&&window.skyHumanView);
  await p.evaluate(()=>{for(let i=0;i<10;i++)__game.advance(1/60)});
  assert.equal(await p.evaluate(()=>skyHumanView.view),'third','入門コースは三人称のまま');
  assert.equal(await p.evaluate(()=>skyHumanView.firstPersonRun),false);
  assert.deepEqual(errors,[]);console.log('PASS 入門コースは三人称のまま');await ctx.close();
 }
 // 英語・タイ語でも訳が出る。
 for(const lang of ['en','th','es']){
  const ctx=await browser.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>window.__hold=true);
  await ctx.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(120000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+`index.html?lang=${lang}&controlpick=0&hookGuide=0&guides=0`);await p.waitForFunction(()=>window.skyStartReadiness?.ready&&window.skyFirstPersonOption);
  await p.waitForTimeout(600);
  await p.locator('#homeSettings').click();await p.locator('#pauseTab_controls').click();
  const text=await p.locator('#firstPersonOption').innerText();
  assert.equal(/[぀-ヿ一-鿿]/.test(text),false,`${lang}: 日本語が残らない ${text}`);
  assert.ok(text.length>40,`${lang}: ${text}`);
  assert.deepEqual(errors,[]);console.log('PASS',lang,text.split('\n')[0]);await ctx.close();
 }
}finally{await browser?.close();server?.kill()}})().catch(e=>{console.error(e);process.exit(1)});
