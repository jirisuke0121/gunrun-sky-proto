const frame=document.getElementById('game'),status=document.getElementById('status'),output=document.getElementById('results');
const layouts={desktop:[1100,620,false],landscape:[844,390,true],portrait:[390,844,true],portraitLeft:[390,844,true]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
let loadID=0;
async function load(map,layout){
 const [width,height,touch]=layouts[layout];frame.width=width;frame.height=height;
 frame.src=`../${map}?lang=ja&minimapLab=1&touch=${touch?1:0}&rotation=${layout==='portraitLeft'?-1:1}&load=${++loadID}`;
 const requested=frame.src;
 for(let i=0;i<900;i++){await wait(100);const w=frame.contentWindow;if(w.location.href===requested&&w.__minimapLab&&w.skyMinimap&&w.skyStartReadiness?.ready){w.document.getElementById('bIntro').click();w.__game.frameOnce(1/60);return w;}}
 throw new Error(`Not ready: ${map} ${layout}`);
}
function snapshot(w){w.skyMinimap.frame(performance.now(),true);return w.skyMinimap.snapshot()}
function setVisible(w,value){const input=w.document.getElementById('skyMinimapEnabled');input.checked=value;input.dispatchEvent(new w.Event('change',{bubbles:true}))}
function overlap(a,b){return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))}
async function verify(){
 const results=[];
 for(const map of ['index.html','canyon.html'])for(const layout of Object.keys(layouts)){
  status.textContent=`検証中：${map} / ${layout}`;
  const w=await load(map,layout),g=w.__game,s=w.__skyInternals,d=w.document;
  assert(w.__minimapLab,'requires isolated review server');
  if(layout.startsWith('portrait')){assert(g.mode==='pause','portrait pauses play');assert(w.getComputedStyle(d.getElementById('rotate')).display!=='none','portrait shows rotation notice');results.push({map,layout,passed:true,portraitPaused:true});continue;}
  const initial=snapshot(w);assert(initial.count===s.Jt.filter(e=>!e.dead&&e.hp!==0&&e.remove!==true).length,'all live initial enemies');
  assert(initial.visible&&initial.boxes>100&&initial.cachedBytes>0,'cached terrain and live map');
  assert(initial.shape==='circle'&&initial.headingUp&&initial.playerLocal.yaw===0,'Unity-style circular heading-up radar');
  assert(w.getComputedStyle(d.getElementById('skyMinimap')).borderRadius==='50%','actual circular radar mask');
  // Real enemy objects, on distant opposite sides and separate elevations.
  const enemies=s.Jt.filter(e=>!e.dead).slice(0,3);assert(enemies.length===3,'intro has three enemies');
  enemies[0].pos.set(initial.bounds.minX+4,s.c.pos.y+5,initial.bounds.minZ+4);enemies[0].spawnT=.8;
  enemies[1].pos.set(initial.bounds.minX+initial.bounds.width-4,s.c.pos.y-5,initial.bounds.minZ+initial.bounds.depth-4);enemies[1].stun=4;
  let state=snapshot(w);assert(state.count===3,`${map}/${layout}: distant spawning and stunned enemies remain visible (${state.count})`);
  assert(state.markers.some(m=>m.relative==='above')&&state.markers.some(m=>m.relative==='below'),'height direction markers');
  assert(state.localSpan===40&&Math.abs(state.playerLocal.x-128)<1e-8&&Math.abs(state.playerLocal.y-128)<1e-8,'Unity-sized player-centred local map');
  assert(state.nearbyCount<state.count,'local map omits distant enemies instead of pinning them to the border');
  const originalPosition=s.c.pos.clone();s.c.pos.x=initial.bounds.minX;s.c.pos.z=initial.bounds.minZ;
  const edge=snapshot(w);assert(Math.abs(edge.playerLocal.x-128)<1e-8&&Math.abs(edge.playerLocal.y-128)<1e-8,'centred at map edge with clipped terrain');s.c.pos.copy(originalPosition);snapshot(w);
  const x=enemies[0].pos.x;enemies[0].pos.x+=2;state=snapshot(w);assert(state.markers.some(m=>m.world.x===x+2),'live position update');
  enemies[0].dead=true;state=snapshot(w);assert(state.count===2,'corpse disappears');enemies[0].dead=false;
  const copies=state.terrainCopies;for(let i=0;i<100;i++)w.skyMinimap.frame(100000+i*51);assert(snapshot(w).terrainCopies===copies,'terrain not redrawn every frame');
  const hud=d.getElementById('skyMinimap'),r=hud.getBoundingClientRect();
  const collisions=['bSettings','ammoBox','tJump','tAutoFire','skillDock','unityScoreHud'].filter(id=>{const e=d.getElementById(id);if(!e||e.hidden||!e.getClientRects().length)return false;return overlap(r,e.getBoundingClientRect())>1;});
  assert(collisions.length===0,`HUD overlap: ${map}/${layout}: ${collisions} ${JSON.stringify({map:r.toJSON(),items:collisions.map(id=>({id,rect:d.getElementById(id).getBoundingClientRect().toJSON()}))})}`);
  assert(r.left>=-1&&r.top>=-1&&r.right<=w.innerWidth+1&&r.bottom<=w.innerHeight+1,'map inside rotated viewport');
  assert(w.getComputedStyle(hud).pointerEvents==='none','radar leaves pointer/touch input to the game');
  const hit=d.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);assert(!hud.contains(hit),'camera drag passes through the actual radar area');
  w.dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyM',key:'m',bubbles:true}));assert(g.mode==='pause'&&d.getElementById('skyMapDialog').open,'M opens and pauses game');
  const frozen=g.GAME.t;g.frameOnce(.2);assert(g.GAME.t===frozen,'map freezes game clock');
  const select=d.getElementById('skyMapLevel');select.value=String(initial.levels.at(-1));select.dispatchEvent(new w.Event('change'));assert(snapshot(w).selectedLevel===initial.levels.at(-1),'manual height layer');
  d.getElementById('skyMapClose').click();assert(g.mode==='pause','closing map stays paused');
  d.getElementById('skyMapOpen').click();w.dispatchEvent(new w.KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}));
  assert(!d.getElementById('skyMapDialog').open&&g.mode==='pause','Escape closes map without resuming');
  if(g.DOORS.length){const door=g.DOORS[0].b,off=door.off;door.off=false;const closed=snapshot(w).closedDoors;door.off=true;assert(snapshot(w).closedDoors===closed-1,'dynamic door state');door.off=off;}
  setVisible(w,false);d.getElementById('bResume').click();const off=snapshot(w);assert(!off.visible,'minimap off');
  for(let i=0;i<100;i++)w.skyMinimap.frame(200000+i*51);assert(w.skyMinimap.snapshot().markerFrames===off.markerFrames,'off skips marker work');
  setVisible(w,true);assert(snapshot(w).visible,'toggle on');
  // Floor selection changes at landing, not at the apex of an ordinary jump.
  s.c.onGround=true;s.c.pos.y=8;snapshot(w);assert(w.skyMinimap.snapshot().automaticLevel===8,'high landing');
  Object.assign(s.c.lastGround,{x:s.c.pos.x,y:8,z:s.c.pos.z});s.c.state='air';s.c.onGround=false;s.c.pos.y=12;assert(snapshot(w).automaticLevel===8,'jump retains takeoff level');
  s.c.state='normal';s.c.onGround=true;s.c.pos.y=0;assert(snapshot(w).automaticLevel===0,'lower landing');
  g.setMode('menu');assert(!snapshot(w).visible,'title hides map');d.getElementById('bStart').click();assert(snapshot(w).visible,'normal start after intro');
  w.skyChallengeScore.sync();const score=w.skyChallengeScore.current();
  assert(w.getComputedStyle(d.getElementById('unityScoreHud')).display!=='none','existing score HUD remains visible');
  assert(Number(d.getElementById('unityTotal').textContent.replaceAll(',',''))===score.total,'actual score, no simplified replacement');
  assert(Number(d.getElementById('unityKills').textContent)===score.kills,'kill count preserved');
  assert(!d.getElementById('threatScoreHud'),'obsolete threat HUD is absent');
  assert(!d.getElementById('proposalScore'),'no duplicate mock score');
  const victim=s.Jt.find(e=>!e.dead);victim.spawnT=0;s.c.invuln=0;
  victim.hurt(1,1,0,.6,0);victim.hurt(999,1,0,.6,0);w.skyChallengeScore.sync();
  const earned=w.skyChallengeScore.current();assert(earned.total>score.total&&earned.kills===score.kills+1,'actual hit and kill increase score');
  assert(Number(d.getElementById('unityTotal').textContent.replaceAll(',',''))===earned.total,'nonzero earned total reaches existing HUD');
  assert(Number(d.getElementById('unityKills').textContent)===earned.kills,'nonzero kill count reaches existing HUD');
  g.setMode('pause');d.getElementById('bRestart').click();assert(snapshot(w).visible,'restart');
  assert(w.__externalPosts===0,'no external result/telemetry writes');assert(w.__errors.length===0,w.__errors.join(';'));
  results.push({map,layout,passed:true,boxes:initial.boxes,levels:initial.levels,cacheBytes:initial.cachedBytes,bakeMs:initial.bakeMs,overlap:collisions,localSpan:40,unityCircularHeadingUp:true,scoreHudPreserved:true,nonzeroScoreHud:true,threatHudRemoved:true,radarInputPassThrough:true,playerCentredAtMapEdge:true,nearbyEnemies:true,heightMarkers:true,offSkipsWork:true,externalPosts:w.__externalPosts,errors:w.__errors});
  output.textContent=JSON.stringify({partial:true,results},null,2);
 }
 return {kind:'functional',passed:results.length===8,results};
}
async function performanceTest(){
 const results=[];
 for(const map of ['index.html','canyon.html']){
  const w=await load(map,'desktop'),g=w.__game,s=w.__skyInternals;
  // Identical deterministic short run per block. Intro avoids death; the
  // actual movement, zombie AI, animation, Three.js render and HUD still run.
  const blocks=[];
  for(const enabled of [false,true,true,false,false,true]){
   status.textContent=`負荷比較：${map} / ${enabled?'オン':'オフ'} / ${blocks.length+1} / 6`;
   w.__resetSeed();g.startGame();setVisible(w,enabled);s.U.sendLog=false;
   const durations=[];let previous=null,before=null;
   await new Promise(resolve=>{let n=0;function tick(now){
    if(previous!==null&&n>60)durations.push(now-previous);previous=now;
    // Same fixed input/time and camera in every block; render loop held by fixture.
    g.keys.KeyW=n<100;g.frameOnce(1/60);if(n===60)before=w.skyMinimap.snapshot();if(++n<180)w.requestAnimationFrame(tick);else{g.keys.KeyW=false;resolve();}
   }w.requestAnimationFrame(tick)});
   const sorted=[...durations].sort((a,b)=>a-b),snap=w.skyMinimap.snapshot();
   const markerFrames=snap.markerFrames-before.markerFrames;
   blocks.push({enabled,frames:durations.length,averageFps:1000/(durations.reduce((a,b)=>a+b,0)/durations.length),p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],markerFrames,markerMeanMs:markerFrames?(snap.totalMarkerMs-before.totalMarkerMs)/markerFrames:0,markerP95Ms:enabled?snap.markerP95Ms:0,terrainCopies:snap.terrainCopies});
  }
  const snap=w.skyMinimap.snapshot(),renderer=g.debug.renderer.getContext(),debug=renderer.getExtension('WEBGL_debug_renderer_info');
  results.push({map,viewport:[w.innerWidth,w.innerHeight],renderer:debug?renderer.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable',bakeMs:snap.bakeMs,cacheBytes:snap.cachedBytes,blocks});
 }
 return {kind:'performance',results,limits:'Desktop in-app browser; six alternating 180-frame fixed-input blocks/map, first 60 frames excluded. Wall-clock duration depends on refresh rate. Short diagnostic runs, not iPhone/thermal or human game-feel evidence.'};
}
async function run(fn){for(const b of document.querySelectorAll('button'))b.disabled=true;try{const result=await fn();output.textContent=JSON.stringify(result,null,2);status.textContent='完了';}catch(e){status.textContent='失敗：'+e.message;output.textContent=e.stack;}finally{for(const b of document.querySelectorAll('button'))b.disabled=false;}}
document.getElementById('verify').onclick=()=>run(verify);
document.getElementById('performance').onclick=()=>run(performanceTest);
document.getElementById('preview').onclick=()=>run(async()=>{const w=await load(document.getElementById('map').value,document.getElementById('layout').value);w.__hold=false;return snapshot(w)});
