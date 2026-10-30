// Explicit diagnostic page only; never imported by a game page.
const $ = id => document.getElementById(id), frame = $('game');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const quantile = (values, p) => { const a = [...values].sort((a,b) => a-b); return a.length ? a[Math.min(a.length-1, Math.floor(a.length*p))] : null; };
const round = value => value == null ? null : +value.toFixed(3);
const summary = a => ({ median: round(quantile(a,.5)), p95: round(quantile(a,.95)), p99: round(quantile(a,.99)), max: a.length ? round(Math.max(...a)) : null });
let busy = false, stopped = false, invalid = null, result, activeWindow, loadToken=0;
const status = text => $('status').textContent = text;
const progress = async () => {
  $('result').textContent = JSON.stringify({...result,trials:result.trials.map(({frames,gpuMs,...trial})=>({...trial,frameSamples:frames.length,gpuSampleCount:gpuMs.length}))}, null, 2);
  // Optional local review server; normal static hosting only uses JSON download.
  if (location.hostname === '127.0.0.1') try { await fetch('/__crowd/json/progress', { method:'POST', body:JSON.stringify(result) }); } catch {}
};
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2,'0')).join('');

async function load(map) {
  const previous = activeWindow?.__game?.debug?.renderer;
  if (previous) { previous.dispose(); previous.getContext().getExtension('WEBGL_lose_context')?.loseContext(); }
  const base = new URL($('build').value==='baseline'?'../../gunrun-render-baseline/':'../', location.href).href;
  let source = await fetch(base+map, {cache:'no-store'}).then(r => { if (!r.ok) throw Error('ゲーム取得失敗'); return r.text(); });
  const hash = await digest(source);
  const token=++loadToken;
  for(const [name,key,args='n'] of [['Da','simulation'],['gd','player'],['xp','presentation'],['bd','camera'],['jv','hud'],['Av','hudCore'],['Rv','hook','']]) {
    const declaration=`function ${name}(${args}){`, renamed=`__crowd_${name}`;
    if(source.split(declaration).length!==2)throw Error(`CPU区間の計測対象が一致しません: ${name}`);
    source=source.replace(declaration,`function ${name}(${args}){const t=performance.now();try{return ${renamed}(${args})}finally{if(window.__crowdSections)window.__crowdSections.${key}+=performance.now()-t}}function ${renamed}(${args}){`);
  }
  const guard = `window.__crowdToken=${token};window.__hold=true;const m=new Map;const storage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()};Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});const net=window.fetch.bind(window);window.fetch=(u,o)=>new URL(typeof u==='string'?u:u.url,${JSON.stringify(base)}).origin===${JSON.stringify(location.origin)}?net(u,o):Promise.resolve(new Response('{}',{status:403}));navigator.sendBeacon=()=>true;`;
  source = source.replace('<head>', `<head><base href="${base}"><script>${guard}<\/script>`).replace(/RECORD_URL="[^"]*"/, 'RECORD_URL=""');
  frame.srcdoc = source;
  const until = performance.now()+60000;
  while (performance.now()<until) {
    if (stopped) throw Error('中止');
    const w = frame.contentWindow, g = w?.__game, s = w?.__skyInternals;
    if (w?.__crowdToken===token && g && s && w.skyHumanView && w.document.getElementById('humanStatus')?.textContent.includes('Unityアニメーション') && ($('build').value==='baseline'||w.skyHumanView.aimWork?.revision==='rotation-cache-v2') && w.__skyUpgrade?.loaded && ['hg','sg','smg','mg','glove','knife','ladder','hook','anchor','trolley','flashbang'].every(key=>w.__skyUpgrade.loaded[key]) && w.skyRenderQuality?.snapshot().buffer && w.__staticMerge && !g.debug.renderer.getContext().isContextLost() && !w.document.getElementById('bStart').disabled && s.zombieModels().some(m => m.kind==='unity-standard')) {
      activeWindow = w; g.runlogUse(null); g.RL.on = false;
      return { w, g, s, hash };
    }
    await wait(100);
  }
  throw Error('モデル読込が完了しませんでした');
}

function* openFloors({g,s}) {
  const nodes = g.NAV.nodes.filter(n => n.y>=-.1);
  for (let k=0;k<nodes.length;k+=2) for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const n=nodes[k], lx=-dz, lz=dx;
    // Continuous supported floor for the player, the crowd and the approach.
    let valid = true;
    for (let forward=0;forward<=10.25 && valid;forward+=.5) for (let side=forward<6.75?-.65:-1.65;side<=(forward<6.75?.65:1.65);side+=.55) {
      const x=n.x+dx*forward+lx*side, z=n.z+dz*forward+lz*side;
      if (!s.oe(x,n.y+.03,z,.33,1.8) || !g.groundBelow(x,z,n.y,.3,.12)) { valid=false; break; }
    }
    if (valid && !s.raycast(n.x,n.y+1.3,n.z,dx,0,dz,10.25)) yield {x:n.x,y:n.y,z:n.z,dx,dz,lx,lz};
  }
}

async function chooseFloor(ctx) {
  let attempts=0;
  for(const lane of openFloors(ctx)){
    ctx.lane=lane;setup(ctx,12,'fixed',0);ctx.g.frameOnce(0);lockCamera(ctx);
    const camera=ctx.g.debug.camera;
    if(!ctx.s.oe(camera.position.x,camera.position.y-.15,camera.position.z,.15,.3))continue;
    const view=inView(ctx,true);
    if(view.projected===12&&view.clear===12)return;
    if(++attempts%8===0){status(`${ctx.map} 全12体が見える配置を探索中 ${attempts}`);await wait(0);}
    if(stopped)throw Error('中止');
  }
  throw Error('地形に隠れず12体すべてが見える配置が見つかりません');
}

function lockCamera(ctx){
  const {g,lane}=ctx,camera=g.debug.camera;
  camera.position.set(lane.x-lane.dx*3.6+lane.lx*.62,lane.y+2.3,lane.z-lane.dz*3.6+lane.lz*.62);
  camera.lookAt(lane.x+lane.dx*7,lane.y+1.05,lane.z+lane.dz*7);camera.updateMatrixWorld(true);
}

function setup(ctx, count, mode, repeat) {
  const {w,g,s} = ctx, lane = ctx.lane;
  let seed=0x512e7+repeat;
  w.Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  g.setMode('menu');
  const selector=w.document.getElementById('challengeDifficulty'); selector.value='ultra'; selector.dispatchEvent(new w.Event('change'));
  w.document.querySelector('[data-zombie="unity-standard"]')?.click();
  Object.assign(g.S,{sendLog:false,autoFire:false,aimAuto:true,aimAssist:false,volume:0,weapon:0,showBody:true});
  g.startGame(); g.runlogUse(null); g.RL.on=false;
  for(const e of g.zombies){s.ue.remove(e.m.root);if(e.pool)s.ue.remove(e.pool);}g.zombies.length=0;
  g.SCR.off=g.PACE.off=g.MARK.off=true;g.GAME.spawnT=g.GAME.safeT=g.GAME.surgeT=1e9;g.GAME.t=100;
  Object.assign(g.P,{life:3,invuln:1e9,state:'normal',onGround:true,yaw:Math.atan2(-lane.dx,-lane.dz),pitch:-.08,hookCD:0,jumpBuf:0,eye:1.62,h:1.8});
  g.P.pos.set(lane.x,lane.y+.015,lane.z);g.P.vel.set(0,0,0);g.P.node=g.nodeAt(lane.x,lane.y+.1,lane.z);g.updateField();
  const slots=Array.from({length:12},(_,i)=>({side:(i%4-1.5)*.9,forward:7.5+Math.floor(i/4)*.9}));
  ctx.positions=[];
  for(let i=0;i<count;i++){
    const p=slots[i],point={x:lane.x+lane.dx*p.forward+lane.lx*p.side,y:lane.y+.015,z:lane.z+lane.dz*p.forward+lane.lz*p.side};ctx.positions.push(point);
    const e=new s.ri(point.x,point.y,point.z);Object.assign(e,{hp:1e6,spawnT:0,onGround:true,speedMul:1,dropper:false,flank:false,atkCD:1e6});
    e.node=g.nodeAt(point.x,point.y+.1,point.z);e.navT=0;g.zombies.push(e);
  }
  const renderer=g.debug.renderer,gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const variant=$('variant').value;
  w.skyRenderQuality.select($('quality').value);
  if(variant==='no-shadow')renderer.shadowMap.enabled=false;
  if(variant==='pixel-1')renderer.setPixelRatio(1);
  renderer.info.autoReset=false;
  return {count,mode,variant,quality:w.skyRenderQuality?.snapshot(),lane,css:[w.innerWidth,w.innerHeight],buffer:[renderer.domElement.width,renderer.domElement.height],pixelRatio:renderer.getPixelRatio(),gpu:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),antialias:gl.getContextAttributes().antialias,models:g.zombies.map(e=>({kind:e.m.src?.kind||null,meshy:!!e.m.meshy})),staticMerge:w.__staticMerge,assets:{...w.__skyUpgrade.loaded},cameraAspect:g.debug.camera.aspect,aimWork:w.skyHumanView.aimWork,settings:{renderScale:g.S.renderScale,zLook:g.S.zLook,showBody:g.S.showBody,shadow:renderer.shadowMap.enabled},hash:ctx.hash};
}

function resetCrowd(ctx) {
  const {g}=ctx;
  g.zombies.forEach((e,i)=>{const p=ctx.positions[i];e.pos.set(p.x,p.y,p.z);e.vel.set(0,0,0);e.act=e.rise=e.fall=null;e.edge=-1;e.node=g.nodeAt(p.x,p.y+.1,p.z);e.stun=0;e.atkT=0;e.hp=1e6;e.onGround=true;});
}

function inView(ctx,auditTerrain=true) {
  const {g,s}=ctx,camera=g.debug.camera;camera.updateMatrixWorld(true);
  let projected=0,clear=0;
  for(const e of g.zombies){
    if(e.dead||!e.m.root.visible)continue;
    const points=[.15,1.65].map(h=>new s.Geom.Vector3(e.pos.x,e.pos.y+h,e.pos.z).project(camera));
    if(!points.every(p=>p.z>=-1&&p.z<=1&&Math.abs(p.x)<.98&&Math.abs(p.y)<.98))continue;projected++;
    const p=new s.Geom.Vector3(e.pos.x,e.pos.y+1,e.pos.z),v=p.clone().sub(camera.position),d=v.length();v.multiplyScalar(1/d);
    if(!auditTerrain||!s.raycast(camera.position.x,camera.position.y,camera.position.z,v.x,v.y,v.z,Math.max(0,d-.35)))clear++;
  }
  return {projected,clear};
}

function auditDraws(ctx) {
  const {g,s}=ctx, renderer=g.debug.renderer, oldRender=renderer.render, saved=[], objects=new Map();
  const enemyRoots=new Set(g.zombies.map(enemy=>enemy.m.root));
  for(const scene of [s.ue,s.fo])scene.traverse(object=>{
    if(!object.isMesh&&!object.isLine&&!object.isPoints&&!object.isSprite)return;
    const original=object.onBeforeRender;saved.push([object,original]);
    object.onBeforeRender=function(...args){
      const [,,camera,geometry,material,group]=args;
      if(camera===g.debug.camera){
        let entry=objects.get(object.uuid);
        if(!entry){
          const parents=[];let enemy=false;
          for(let p=object;p&&p!==s.ue;p=p.parent){if(enemyRoots.has(p))enemy=true;if(p.name)parents.push(p.name);}
          const position=new s.Geom.Vector3();object.getWorldPosition(position);
          entry={name:object.name,parents,enemy,skinned:!!object.isSkinnedMesh,geometry:geometry.type,attributes:Object.keys(geometry.attributes),matrixAutoUpdate:object.matrixAutoUpdate,parentIsScene:object.parent===s.ue,multiMaterial:Array.isArray(object.material),frustumCulled:object.frustumCulled,castShadow:object.castShadow,receiveShadow:object.receiveShadow,position:position.toArray().map(round),materials:[],calls:0,triangles:0};objects.set(object.uuid,entry);
        }
        entry.calls++;entry.triangles+=(group?.count??geometry.index?.count??geometry.attributes.position?.count??0)/3;
        if(!entry.materials.some(item=>item.uuid===material.uuid))entry.materials.push({uuid:material.uuid,name:material.name,type:material.type,map:material.map?.uuid??null,transparent:material.transparent,opacity:material.opacity,side:material.side,color:material.color?.getHexString()??null});
      }
      return original.apply(this,args);
    };
  });
  renderer.render=function(...args){if(args[1]===g.debug.camera)lockCamera(ctx);return oldRender.apply(this,args);};
  try{g.frameOnce(0);}finally{renderer.render=oldRender;for(const [object,original]of saved)object.onBeforeRender=original;}
  const records=[...objects.values()],groups=new Map();
  for(const o of records){const key=[o.enemy?'enemy':o.skinned?'avatar':o.name||'unnamed',o.geometry,o.parentIsScene?'root':'nested',o.matrixAutoUpdate?'auto':'fixed',o.multiMaterial?'multi':'single'].join(' / ');let group=groups.get(key);if(!group)groups.set(key,group={key,objects:0,calls:0,triangles:0});group.objects++;group.calls+=o.calls;group.triangles+=o.triangles;}
  return {summary:{calls:records.reduce((sum,o)=>sum+o.calls,0),objects:records.length,groups:[...groups.values()].sort((a,b)=>b.calls-a.calls)},objects:records};
}

function timer(renderer) {
  const gl=renderer.getContext(),ext=$('gpuProbe').value==='on'?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null,pending=[],samples=[];
  let q,disjoint=0;
  return {
    supported:!!ext,samples,get disjoint(){return disjoint},
    begin(index){if(!ext||index%4||pending.length>12)return;q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);},
    end(){if(!q)return;gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(q);q=null;},
    collect(){if(!ext)return;if(gl.getParameter(ext.GPU_DISJOINT_EXT)){disjoint++;for(const p of pending)gl.deleteQuery(p);pending.length=0;return;}while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){const p=pending.shift();samples.push(gl.getQueryParameter(p,gl.QUERY_RESULT)/1e6);gl.deleteQuery(p);}},
    close(){for(const p of pending)gl.deleteQuery(p);pending.length=0;}
  };
}

async function segment(ctx,count,mode,seconds,capture=false) {
  const {w,g,s}=ctx,renderer=g.debug.renderer,gpu=timer(renderer),frames=[];
  const size=[renderer.domElement.width,renderer.domElement.height];let previous=null,start=null,lastReset=-Infinity,nextShot=0,index=0,currentAI=0,currentRender=0,lastClear=count;
  const oldUpdates=g.zombies.map(e=>e.update),oldRender=renderer.render;
  const methods=[];
  for(const [object,name,key]of [[w.skyHumanView,'update','humanView'],[w.skyFollowCamera,'frame','followCamera'],[w.skyChallengeScore,'sync','scoreHUD'],[w.skyFirstPersonView,'update','firstPerson']]){
    if(!object?.[name])continue;const original=object[name];methods.push([object,name,original]);object[name]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{if(w.__crowdSections)w.__crowdSections[key]+=performance.now()-t;}};
  }
  g.zombies.forEach(e=>{const update=e.update;e.update=function(dt){const t=performance.now();try{return update.call(this,dt);}finally{currentAI+=performance.now()-t;}};});
  renderer.render=function(...args){const t=performance.now();try{if(args[1]===g.debug.camera)lockCamera(ctx);return oldRender.apply(this,args);}finally{currentRender+=performance.now()-t;}};
  try{return await new Promise((resolve,reject)=>{
    function step(now){
      if(start===null){start=previous=now;}
      const elapsed=(now-start)/1000,interval=now-previous,dt=Math.min(.05,Math.max(.001,interval/1000));previous=now;
      const reason=stopped?'中止':invalid||(document.hidden||w.document.hidden?'背景タブ':renderer.domElement.width!==size[0]||renderer.domElement.height!==size[1]?'描画サイズ変更':g.mode!=='play'?'ゲーム状態変更':g.zombies.length!==count?'人数変更':renderer.getContext().isContextLost()?'WebGL切断':null);
      if(reason){reject(Error(reason));return;}
      if(elapsed>=seconds){gpu.collect();resolve({frames,tailInterval:interval,gpuMs:gpu.samples,gpuSupported:gpu.supported,gpuDisjoint:gpu.disjoint,elapsed});return;}
      // Positions held for fixed crowd; short real approaches repeat every .8s
      // for chase so the requested count remains close and in the same screen.
      if(mode==='fixed'||elapsed-lastReset>=.8){resetCrowd(ctx);lastReset=elapsed;}
      const lane=ctx.lane,lateral=mode==='chase'?Math.sin(elapsed*1.2)*.45:0;
      // Preserve vertical simulation. Re-lifting the player every frame would
      // measure repeated landing/support corrections instead of grounded play.
      if(mode==='chase'){g.P.pos.x=lane.x+lane.lx*lateral;g.P.pos.z=lane.z+lane.lz*lateral;}
      g.P.invuln=1e9;g.P.life=3;g.P.yaw=Math.atan2(-lane.dx,-lane.dz);g.P.pitch=-.08;
      g.GAME.spawnT=g.GAME.safeT=g.GAME.surgeT=1e9;g.GAME.t=100;g.G.recoil=0;
      currentAI=currentRender=0;renderer.info.reset();gpu.collect();gpu.begin(index);
      w.__crowdSections={simulation:0,player:0,presentation:0,camera:0,hud:0,hudCore:0,hook:0,humanView:0,followCamera:0,scoreHUD:0,firstPerson:0};let fxMs=0;
      const before=performance.now();
      try{
        if(mode==='chase'&&elapsed>=nextShot){g.G.ammo=12;g.G.reloadT=g.G.fireCD=0;g.fire();nextShot+=.4;}
        // __hold pauses the normal rAF driver, including this separate FX loop.
        // Advance its public step too, so tracers/flash/gore expire normally.
        const fxStart=performance.now();w.__gunFx?.step?.(dt);fxMs=performance.now()-fxStart;
        g.frameOnce(dt);
      }catch(e){gpu.end();reject(e);return;}
      const cpu=performance.now()-before;gpu.end();
      // Visibility audit is outside CPU/GPU timing; still in frame pacing.
      const audit=index%15===0,view=inView(ctx,audit);if(audit)lastClear=view.clear;view.clear=lastClear;view.terrainAudit=audit;
      if(interval>0)frames.push({interval,cpu,ai:currentAI,render:currentRender,...w.__crowdSections,fxMs,grounded:g.P.onGround,playerY:g.P.pos.y,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,alive:g.zombies.filter(e=>!e.dead).length,...view});
      index++;w.requestAnimationFrame(step);
    }w.requestAnimationFrame(step);
  });}finally{
    renderer.render=oldRender;g.zombies.forEach((e,i)=>e.update=oldUpdates[i]);gpu.close();
    for(const [object,name,original]of methods)object[name]=original;
    if(capture&&location.hostname==='127.0.0.1'){g.frameOnce(0);lockCamera(ctx);renderer.clear();renderer.render(s.ue,g.debug.camera);try{await fetch(`/__crowd/image/${$('build').value}-${$('quality').value}-${ctx.map.replace('.html','')}-${mode}-${count}`,{method:'POST',body:JSON.stringify({image:renderer.domElement.toDataURL('image/png')})});}catch{}}
  }
}

function summarize(part,count){
  const f=part.frames,intervals=[...f.map(f=>f.interval),part.tailInterval].filter(n=>n>0),total=intervals.reduce((a,b)=>a+b,0),visible=f.filter(f=>f.projected===count&&f.clear===count&&f.alive===count).length;
  return {fps:round(intervals.length*1000/total),frames:f.length,elapsed:round(part.elapsed),intervalMs:summary(intervals),over33Pct:round(100*intervals.filter(n=>n>33.34).length/intervals.length),over50Pct:round(100*intervals.filter(n=>n>50).length/intervals.length),cpuMs:summary(f.map(f=>f.cpu)),aiMs:summary(f.map(f=>f.ai)),renderSubmitMs:summary(f.map(f=>f.render)),sectionsMs:Object.fromEntries(['simulation','player','presentation','camera','hud','hudCore','hook','humanView','followCamera','scoreHUD','firstPerson','fxMs'].map(key=>[key,summary(f.map(frame=>frame[key]))])),groundedPct:round(100*f.filter(frame=>frame.grounded).length/f.length),gpuMs:summary(part.gpuMs),gpuSamples:part.gpuMs.length,gpuSupported:part.gpuSupported,gpuDisjoint:part.gpuDisjoint,minProjected:Math.min(...f.map(f=>f.projected)),minUnobstructed:Math.min(...f.map(f=>f.clear)),allVisiblePct:round(100*visible/f.length),minAlive:Math.min(...f.map(f=>f.alive)),drawCalls:summary(f.map(f=>f.calls)),triangles:summary(f.map(f=>f.triangles)),valid:visible===f.length&&part.gpuDisjoint===0};
}

async function run(quick=false){
  if(busy)return;busy=true;stopped=false;invalid=null;document.body.classList.add('running');$('start').disabled=$('quick').disabled=true;$('stop').disabled=false;$('rows').replaceChildren();
  result={schema:3,quick,createdAt:new Date().toISOString(),scope:'Mac browser comparison, not physical iPhone performance',userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],hardwareConcurrency:navigator.hardwareConcurrency,otherGameStopped:$('otherStopped').checked,seconds:quick?2:Number($('seconds').value),repeats:quick?1:Number($('repeats').value),notes:['Production game source and assets; memory-only settings; no gameplay records sent.','All enemies must project inside the camera and have clear terrain line of sight. Other zombies may naturally overlap.','Player vertical physics is preserved; grounded state is not reset every frame. CPU section wrappers are diagnostic only.','Fixed positions run full enemy updates each frame. Chase repeats .8 second approaches with HG fire every .4s and durable enemies.','Real rAF intervals, CPU frame work and asynchronous GPU timer queries are reported separately.','Camera is held at consistent third-person framing; graphics follow the recorded quality preset. Diagnostic variants are tagged. Zombie model LOD is unchanged.','Background tabs or resizing invalidate a run.'],trials:[]};
  try{
    await wait(200);
    const selectedCounts=$('counts').value.split(',').map(Number),selectedMaps=$('maps').value==='both'?['index.html','canyon.html']:[$('maps').value],selectedModes=$('modes').value==='both'?['fixed','chase']:[$('modes').value];
    result.build=$('build').value;result.variant=$('variant').value;result.quality=$('quality').value;result.counts=selectedCounts;result.gpuProbe=$('gpuProbe').value;
    for(const map of quick?[selectedMaps[0]]:selectedMaps){
      status(`${map} 読込中`);const ctx=await load(map);ctx.map=map;await chooseFloor(ctx);
      for(let repeat=0;repeat<result.repeats;repeat++)for(const mode of quick?['fixed']:selectedModes)for(const count of (quick?[6]:repeat%3===1?[...selectedCounts].reverse():repeat%3===2?[...selectedCounts.slice(1),selectedCounts[0]]:selectedCounts)){
        status(`${map} ${mode==='fixed'?'固定密集':'接近＋HG射撃'} ${count}体 ${repeat+1}/${result.repeats} 準備`);
        const fixture=setup(ctx,count,mode,repeat);await segment(ctx,count,mode,quick?1:(repeat===0&&mode==='fixed'&&count===selectedCounts[0]?8:3));
        if(repeat===0&&mode==='fixed'&&count===(quick?6:selectedCounts[0])){const audit=auditDraws(ctx);fixture.drawAudit=audit.summary;if(location.hostname==='127.0.0.1')await fetch('/__crowd/json/draw-audit-'+$('build').value+'-'+map.replace('.html',''),{method:'POST',body:JSON.stringify(audit)});}
        status(`${map} ${mode==='fixed'?'固定密集':'接近＋HG射撃'} ${count}体 ${repeat+1}/${result.repeats} ${result.seconds}秒計測中`);
        fixture.aimWork=ctx.w.skyHumanView.aimWork;const part=await segment(ctx,count,mode,result.seconds,repeat===0),data={map,mode,count,repeat:repeat+1,fixture,summary:summarize(part,count),...part};result.trials.push(data);
        const row=document.createElement('tr');for(const value of [`${map==='index.html'?'旧市街':'渓谷'} ${mode} #${repeat+1}`,count,data.summary.fps,data.summary.intervalMs.p95,data.summary.over33Pct,data.summary.cpuMs.p95,data.summary.gpuMs.p95??($('gpuProbe').value==='on'?'非対応':'未計測'),`${data.summary.minUnobstructed}/${count}${data.summary.valid?'':' 無効'}`]){const c=document.createElement('td');c.textContent=String(value);row.append(c);}$('rows').append(row);await progress();
      }
    }
    result.complete=true;status('比較完了。結果を確認してください');
  }catch(e){result.error=String(e.stack||e);status('計測停止：'+e.message);}
  finally{busy=false;document.body.classList.remove('running');$('start').disabled=$('quick').disabled=false;$('stop').disabled=true;$('export').disabled=!result.trials.length;await progress();}
}
$('start').onclick=()=>run();$('quick').onclick=()=>run(true);$('stop').onclick=()=>{stopped=true;};
document.addEventListener('visibilitychange',()=>{if(busy&&document.hidden)invalid='背景タブ';});
window.addEventListener('resize',()=>{if(busy)invalid='画面サイズ変更';});
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gunrun-crowd-performance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
