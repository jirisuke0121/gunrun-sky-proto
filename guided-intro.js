// A real input trial followed by a physical course. No action is fired on the player's behalf.
(() => {
 const params=new URLSearchParams(location.search),$=id=>document.getElementById(id);
 const en=()=>window.skyI18n?.lang==='en'||params.get('lang')==='en';
 const text=(ja,english)=>en()?english:ja;
 const storage={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
 const courseURL=()=>{const u=new URL('canyon.html',location.href);u.search=new URLSearchParams({learn:'1',cameraTrial:'fixed',camera:window.skyFollowCamera?.mode||'after',controlpick:'0',hookGuide:'0',guides:'0',lang:en()?'en':'ja',return:location.pathname.endsWith('canyon.html')?'canyon':'town'});return u.href;};
 if(!window.skyGuidedMode){
  if(navigator.webdriver&&params.get('guidedEntry')!=='1'&&params.get('learned')!=='1')return;
  if(window.skyPracticeMode||window.skyOwnerReplay||params.has('replay'))return;
  window.skyGuidedEntry=true;
  document.addEventListener('click',event=>{if(!event.target.closest?.('#bIntro'))return;event.preventDefault();event.stopImmediatePropagation();location.assign(courseURL());},true);
  if(params.get('learned')==='1'){
   const start=()=>{if(!window.skyStartReadiness?.ready){requestAnimationFrame(start);return;}const custom=$('challengeCustom');if(custom?.checked)custom.click();const choice=$('challengeDifficulty');choice.value='easy';choice.dispatchEvent(new Event('change'));$('bStart').click();};start();
  }
  return;
 }
 const g=window.__game,sky=window.__skyInternals,p=window.skyPractice,c=g.P,T=sky.Geom;
 if(!p)return;
 document.body.classList.add('guided-intro');document.title=text('操作体験と連続チュートリアル','Controls and parkour course');
 const ui=document.createElement('section');ui.id='learnUI';ui.setAttribute('aria-label',text('操作を試して覚える','Try the controls'));
 ui.innerHTML='<div id="learnModes"><button type="button" data-learn-mode="after"></button><button type="button" data-learn-mode="before"></button></div><div id="learnHint" role="status" aria-live="polite"></div><div id="learnTarget" hidden></div><button id="learnGo" type="button"></button>';
 $('app').append(ui);
 const modes=$('learnModes'),hint=$('learnHint'),target=$('learnTarget'),go=$('learnGo');
 const stage=(id,section,goal,ja,english,done,checkpoint)=>({id,section,goal,ja,english,done,checkpoint});
 const near=(at,r=1.4)=>Math.hypot(c.pos.x-at[0],c.pos.z-at[2])<r&&Math.abs(c.pos.y-at[1])<1;
 let trialReached=false,trialJumpBase=0,copyKey='',lastHint='';
 let pathIndex=0,baseline={},defBase={},index=-1,trial=true,started=false,finished=false,decoyLured=false,lastCheckpoint=null;
 const changed=key=>(g.stats[key]||0)>(baseline[key]||0);
 const landed=()=>c.onGround&&c.state==='normal';
 const stages=[
  stage('move','flow',[-26,2,-16],'光の輪へ移動。離すと止まります','Move to the ring. Release to stop',()=>near([-26,2,-16])),
  stage('vault','flow',[-19,2,-16],'低い壁へ進むと、自動で乗り越えます','Move into the low wall to vault automatically',()=>c.pos.x>-19.5&&(changed('vaults')||changed('mantles')||changed('jumps'))),
  stage('jump','flow',[-11.8,2,-16],'隙間の手前でジャンプして、向こうの足場へ','Jump before the gap to reach the next platform',()=>changed('jumps')&&c.pos.x>-12.5&&c.pos.y>1.9,{at:[-18.5,2,-16],yaw:-Math.PI/2,floor:2}),
  stage('slide','slide',[-5.5,2,-16],'低いゲートへ進む。自動でかがんで通れます','Keep moving through the low gate; crouching is automatic',()=>c.pos.x>-6&&c.pos.y>1.9),
  stage('mantle','mantle',[1,4.4,-16],'段差へジャンプして、縁を登ろう','Jump toward the ledge to climb up',()=>changed('mantles')&&c.pos.y>4.3&&c.pos.x>-2.5),
  stage('wallrun','wallrun',[17,4.4,-17.95],'壁ぎわで前へ進みながらジャンプ','Move along the wall and jump to run across',()=>changed('wallruns')&&c.pos.x>13&&c.pos.y>4.2),
  stage('hook','hook',[22,6.6,-5],'青い輪をタップ／Qで、高い足場へフック','Tap the blue ring / press Q to hook to the higher platform',()=>changed('hooks')&&c.pos.z>-8&&c.pos.y>5&&landed()),
  stage('slopeApproach','downhill',[31,8,9],'光の輪に沿って階段を上り、斜面へ','Follow the rings up the stairs to the slope',()=>near([31,8,9])),
  stage('downhill','downhill',[14,0,9],'斜面で斜面滑り／C。滑って下の足場へ','On the slope, use Slide / C to slide down',()=>changed('slides')&&c.pos.x<15.5&&c.pos.y<.5&&c.onGround),
  stage('zipApproach','zip',[23.5,5.2,-1],'光の輪から階段を上り、ロープの足場へ','Follow the ring up the stairs to the zipline',()=>near([23.5,5.2,-1])),
  stage('zip','zip',[23.5,5.2,-1],'ロープへジャンプ。つかまると自動で渡ります','Jump toward the rope to ride it automatically',()=>changed('zips')&&c.pos.x<-18&&landed()),
  stage('walljump','walljump',[-18.2,5.2,-6],'壁へジャンプ → 壁の近くでもう一度ジャンプ','Jump toward the wall, then jump again to kick off',()=>changed('walljumps')&&c.pos.x>-18.5&&c.pos.y>5),
  stage('swing','swing',[-10,8,-6],'鉄棒へジャンプ。前へ振れたらジャンプで次へ','Jump to the bars. Jump again as you swing forward',()=>((g.stats.barJumps||0)-(baseline.barJumps||0)>=2)&&c.pos.y>7.8&&landed()),
  stage('ladder','ladder',[9,11.2,-1.2],'はしごへ進み、そのまま前入力で登る','Move into the ladder and keep moving forward to climb',()=>changed('ladders')&&c.pos.y>11&&landed()),
  stage('dash','dash',[9,0,18],'青いDASHを取って走り、下の足場へ','Collect DASH, run ahead and jump down to the lower platform',()=>changed('dashPickups')&&c.pos.y<.2&&c.pos.z>14&&landed()),
  stage('stomp','kick',[3.5,0,18],'練習相手へジャンプして踏みつけよう','Jump onto a practice pursuer to stomp',()=>changed('stomps')),
  stage('kick','kick',[5,0,18],'相手へ跳び、空中でもう一度ジャンプで飛び蹴り','Jump toward a pursuer, then jump again in midair to kick',()=>changed('kicks')),
  stage('flash','kick',[5,0,18],'近づく追手へ閃光玉／1。止まっている間に離れよう','Use Flash / 1 on the approaching pursuers, then move away',()=>window.skyFlashbang.stats.affected>defBase.flash),
  stage('decoy','kick',[10,0,21],'分身／2で追手の注意をそらし、光の輪へ逃げよう','Use Decoy / 2 to distract pursuers, then escape to the ring',()=>decoyLured&&near([10,0,21],2)),
  stage('blast','blast',[-23,2,8.5],'赤い缶をタップ／B。接近と爆破ジャンプは自動','Tap the red barrel / press B for an automatic launch',()=>changed('blastLaunches')&&c.pos.x<-20&&c.pos.y>1.9&&landed()),
  stage('jumpgun','jumpgun',[-30,8,-16],'金色のJUMPを拾い、上昇ボタン／Zで高台へ','Collect the gold JUMP, then use Launch / Z to reach the high platform',()=>changed('jumpGunLaunches')&&c.pos.y>7.8&&landed()),
  stage('exit','loop',[-23,2,-16],'階段を下って出口の輪へ。そのまま本番イージーへ','Follow the stairs to the exit ring to begin a real run on Easy',()=>near([-23,2,-16])&&landed()),
 ];
 if(params.get('return')!=='canyon')stages.push(stage('rescue','flow',[-30,8,-16],'救済／Vで高台へ自動退避。到着したら本番へ','Use Rescue / V to escape upward; landing begins your real run',()=>changed('rescues')&&c.pos.y>4&&landed(),{at:[-23,2,-16],yaw:0,floor:2}));
 const paths={wallrun:[[4.4,4.4,-17.95]],ladder:[[9,8,-5.4]],slopeApproach:[[30.5,5.2,.6]],zipApproach:[[13,0,13],[36,0,13],[36,5.2,.2]]};
 const courseGoal=()=>{
  const s=stages[index];if(!s)return null;
  if(s.id==='jumpgun'&&!sky.wpc().jumpGun&&!changed('jumpGunLaunches'))return [-27,2,5.8];
  if(s.id==='blast'&&!changed('blastLaunches'))return [-17,1.12,17];
  if(s.id==='dash'&&!changed('dashPickups'))return [9,11.2,8];
  if(s.id==='swing'){
   const bars=window.skySwing.course.bars,count=(g.stats.barJumps||0)-(baseline.barJumps||0),active=window.skySwing.active;
   if(count>=2||active?.bar===bars[1])return [7.5,8,-6];
   return bars[count===1||active?.bar===bars[0]?1:0].at;
  }
  return paths[s.id]?.[pathIndex]||s.goal;
 };
 const labels={slopeApproach:['斜面へ','To the slope'],downhill:['斜面滑り','Downhill slide'],zipApproach:['ロープへ','To the zipline'],rescue:['救済','Rescue'],move:['移動','Move'],vault:['乗り越え','Vault'],jump:['ジャンプ','Jump'],slide:['低いゲート','Low gate'],mantle:['よじ登り','Climb'],wallrun:['壁走り','Wall run'],hook:['フック','Hook'],zip:['ジップライン','Zipline'],walljump:['壁蹴り','Wall jump'],swing:['鉄棒','Swing'],ladder:['はしご','Ladder'],dash:['ダッシュ','Dash'],stomp:['踏みつけ','Stomp'],kick:['飛び蹴り','Kick'],flash:['閃光玉','Flash'],decoy:['分身','Decoy'],blast:['爆破ジャンプ','Barrel launch'],jumpgun:['ジャンプガン','Jump gun'],exit:['本番へ','Into a real run']};
 const ring=new T.Mesh(new T.Torus(.7,.045,6,32),new T.Basic({color:0xddf79a}));ring.rotation.x=Math.PI/2;sky.ue.add(ring);
 function clearInput(){Object.keys(g.keys).forEach(k=>g.keys[k]=false);Object.assign(sky.inputState,{on:false,x:0,y:0,id:null,lookId:null});c.jumpBuf=c.slideBuf=0;window.skyFollowCamera.reset();}
 function enter(i){
  index=i;pathIndex=0;baseline={...g.stats};decoyLured=false;
  const s=stages[i],origin=window.skyPracticeCourse.sections.find(x=>x.id===s.section);
  lastCheckpoint={...origin,...s.checkpoint,id:s.id};
  if(s.id==='zip')lastCheckpoint.floor=4;
  if(['dash','downhill','zipApproach'].includes(s.id))lastCheckpoint.floor=0;
  if(s.id==='slopeApproach')lastCheckpoint={...lastCheckpoint,at:[23,5.2,0],floor:5.2};
  if(s.id==='downhill')lastCheckpoint={...lastCheckpoint,at:[29.3,7.65,9],floor:0};
  if(s.id==='zipApproach')lastCheckpoint={...lastCheckpoint,at:[14,0,9],floor:0};
  // Updating the checkpoint never moves the player on a successful transition.
  p.checkpoint?.(lastCheckpoint);
  if(s.id==='flash'||s.id==='decoy'){
   window.skyFlashbang.reset();window.skyDecoy.reset();
   p.targets.forEach((e,j)=>{e.dead=e.remove=false;e.hp=1e6;e.stun=0;e.pos.set(5-j*2,0,18);e.vel.set(0,0,0);e.navT=0;e.act=e.fall=null;e.flank=e.dropper=e.stalker=false;e.speedMul=1;e.sideT=0;e.guard=0;e.onGround=true;});
   defBase={flash:window.skyFlashbang.stats.affected,decoy:window.skyDecoy.stats.used};
  }
  if(s.id==='rescue')window.skyRescue?.reset();
  if(s.id==='blast'){sky.U.gunOn=true;sky.U.weapon=0;g.G.ammo=12;sky.nl();}
  document.body.dataset.learnStage=s.id;
  document.dispatchEvent(new CustomEvent('sky-learn-stage',{detail:{id:s.id,index:i}}));
 }
 function finish(){
  if(finished)return;finished=true;storage.set('gunrun-guided-intro-v1','complete');storage.set('gunrun-onboarding-v1',JSON.stringify({phase:'complete',at:new Date().toISOString()}));
  const u=new URL(params.get('return')==='canyon'?'canyon.html':'index.html',location.href);u.search=new URLSearchParams({learned:'1',camera:window.skyFollowCamera.mode,cameraTrial:'fixed',controlpick:'0',lang:en()?'en':'ja'});location.assign(u.href);
 }
 const tick=p.tick;
 p.tick=function(dt){tick(dt);if(!started||g.mode!=='play')return;sky.U.sendLog=false;g.RL.on=false;g.RL.sealed=true;
  if(trial){if(near([-31,2,-16],1.6))trialReached=true;return;}
  const s=stages[index];if(!s||finished)return;
  if(s.id==='decoy'){
   if(window.skyDecoy.lured.size>0)decoyLured=true;
   if(!window.skyDecoy.active&&window.skyDecoy.cooldown>0)window.skyDecoy.reset();
  }
  if(s.id==='flash'&&window.skyFlashbang.charges===0&&!window.skyFlashbang.grenades.length&&window.skyFlashbang.stats.affected<=defBase.flash)window.skyFlashbang.reset();
  if(paths[s.id]?.[pathIndex]&&near(paths[s.id][pathIndex],1)){pathIndex++;}
  if(s.id==='downhill'&&c.pos.x<15.5&&c.onGround&&!changed('slides')){p.retry();return;}
  if(s.done()){if(index===stages.length-1)finish();else enter(index+1);}
 };
 function render(){
  if(!started&&g.mode==='play'){started=true;trialJumpBase=g.stats.jumps||0;sky.U.gunOn=false;document.body.dataset.learnStage='controls';lastCheckpoint=window.skyPracticeCourse.start;}
  ui.hidden=!started||g.mode!=='play';if(ui.hidden){ring.visible=false;requestAnimationFrame(render);return;}
  modes.hidden=go.hidden=!trial;
  const touch=window.skyFollowCamera.touchDevice,key=(en()?'en':'ja')+touch;
  if(copyKey!==key){copyKey=key;for(const b of modes.querySelectorAll('button')){const easy=b.dataset.learnMode==='after';b.innerHTML=easy?(touch?text('スティックだけ<small>視点は自動・カメラ操作なし</small>','Stick only<small>Automatic view; no camera input</small>'):text('WASDだけ<small>視点は自動・カメラ操作なし</small>','WASD only<small>Automatic view; no camera input</small>')):text('移動＋自分で視点操作<small>右ドラッグ／マウスで見回す</small>','Move + control the view<small>Right drag / mouse to look</small>');}go.textContent=text('この操作でコースへ','Use these controls');}
  for(const b of modes.querySelectorAll('button')){const value=String(window.skyFollowCamera.mode===b.dataset.learnMode);if(b.getAttribute('aria-pressed')!==value)b.setAttribute('aria-pressed',value);}
  const s=stages[index],goal=trial?[-31,2,-16]:courseGoal();
  let copy=trial?text('<b>まず自由に試せます</b>光の輪へ移動してジャンプ。落下・追手なし。','<b>Try either control style</b>Move to the ring and jump. No pursuers; you cannot fall off this platform.'):`<b>${index+1}/${stages.length} · ${labels[s.id][en()?1:0]}</b>${text(s.ja,s.english)}`;
  if(trial&&trialReached&&(g.stats.jumps||0)>trialJumpBase)copy=text('<b>移動とジャンプを試せました</b>好きな操作で、そのままコースへ進めます。','<b>You moved and jumped</b>Choose the controls you prefer and enter the course.');
  if(trial&&!trialReached&&!touch)copy=text('<b>まず自由に試せます</b>WASDで光の輪へ移動、Spaceでジャンプ。落下・追手なし。','<b>Try either control style</b>WASD to move to the ring; Space to jump. No pursuers or falls.');
  if(copy!==lastHint){lastHint=copy;hint.innerHTML=copy;}
  ring.material.color.setHex(!trial&&s.id==='hook'?0x66d9ff:0xddf79a);target.style.borderColor=!trial&&s.id==='hook'?'#66d9ff':'';
  ring.visible=true;ring.position.set(goal[0],goal[1]+.06,goal[2]);
  const v=new T.Vector3(goal[0],goal[1]+.3,goal[2]).project(sky.Se),w=$('app').clientWidth,h=$('app').clientHeight;
  const visible=v.z>-1&&v.z<1&&Math.abs(v.x)<.85&&Math.abs(v.y)<.75;
  target.hidden=false;target.classList.toggle('edge',!visible);
  if(visible){target.style.left=(v.x+1)*w/2+'px';target.style.top=(1-v.y)*h/2+'px';target.textContent='';}
  else{const view=window.skyFollowCamera.view,dx=goal[0]-c.pos.x,dz=goal[2]-c.pos.z,a=Math.atan2(Math.sin(Math.atan2(dx,-dz)+view.yaw),Math.cos(Math.atan2(dx,-dz)+view.yaw)),dirs=['↑','↗','→','↘','↓','↙','←','↖'];target.textContent=dirs[(Math.round(a/(Math.PI/4))+8)%8]+' '+text('光の輪','Ring');target.style.left=Math.max(w*.38,Math.min(w*.70,w/2+Math.sin(a)*w*.18))+'px';target.style.top='68px';}
  document.body.dataset.skyGuided=JSON.stringify({stage:trial?'controls':s.id,index,trial,completed:stages.slice(0,Math.max(0,index)).map(s=>s.id),retries:p.retries,goal});
  requestAnimationFrame(render);
 }
 for(const b of modes.querySelectorAll('button'))b.onclick=()=>{clearInput();window.skyFollowCamera.setMode(b.dataset.learnMode,false);};
 go.onclick=()=>{if(!trial)return;clearInput();storage.set('gunrun-fixed-controls-v1','1');window.skyFollowCamera.setMode(window.skyFollowCamera.mode);trial=false;modes.hidden=go.hidden=true;enter(0);$('c').focus();};
 window.addEventListener('keydown',e=>{if(trial&&['KeyQ','KeyB','KeyV','KeyZ','KeyC','Digit1','Digit2'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}},true);
 $('bMenu').addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const u=new URL(params.get('return')==='canyon'?'canyon.html':'index.html',location.href);location.assign(u.href);},true);
 const skip=document.createElement('button');skip.id='learnSkip';skip.textContent=text('練習を終えて本番へ','Leave practice and play');skip.onclick=finish;$('bResume').after(skip);
 for(const node of [modes,go])for(const type of ['pointerdown','pointerup','touchstart','touchend'])node.addEventListener(type,e=>e.stopPropagation());
 window.skyGuidedIntro={get total(){return stages.length},cameraPivot(pivot){if(trial||!stages[index])return;const goal=courseGoal(),dx=goal[0]-c.pos.x,dz=goal[2]-c.pos.z,scale=Math.min(.5,5.5/(Math.hypot(dx,dz)||1));pivot.x+=dx*scale;pivot.z+=dz*scale;},get finished(){return finished},get trial(){return trial},get stage(){return trial?'controls':stages[index]?.id},get defense(){return !trial&&['flash','decoy'].includes(stages[index]?.id)},get completed(){return stages.slice(0,Math.max(0,index)).map(s=>s.id)},retrying(){baseline={...g.stats};decoyLured=false;if(stages[index]?.id==='flash')window.skyFlashbang.reset();if(stages[index]?.id==='decoy')window.skyDecoy.reset();},finish};
 render();
})();
