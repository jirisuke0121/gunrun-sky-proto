import { installGuidedChoice } from './guided-choice.js?v=20261108-auto-follow-v2';
import { installGuidedCoach } from './guided-coach.js?v=20261106-paused-v1';
import { describeLesson } from './guided-prompts.js?v=20261106-parity-v1';
import { createLessons } from './guided-lessons.js?v=20261106-swing-landing-v1';
// A real input trial followed by a physical course. No action is fired on the player's behalf.
(() => {
 const params=new URLSearchParams(location.search),$=id=>document.getElementById(id);
 const en=()=>window.skyI18n?.lang==='en'||params.get('lang')==='en';
 const text=(ja,english)=>en()?english:ja;
 const storage={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
 const carryTrial=u=>{const trial=params.get('cameraTrial');if(['fixed','hybrid','follow','follow-legacy'].includes(trial))u.searchParams.set('cameraTrial',trial);return u;};
 const courseURL=()=>{const u=new URL('canyon.html',location.href);u.search=new URLSearchParams({learn:'1',camera:window.skyFollowCamera?.mode||'after',controlpick:'0',hookGuide:'0',guides:'0',lang:en()?'en':'ja',return:location.pathname.endsWith('canyon.html')?'canyon':'town'});return carryTrial(u).href;};
 if(!window.skyGuidedMode){
  if(window.skyPracticeMode||window.skyOwnerReplay||params.has('replay'))return;
  window.skyGuidedEntry=params.get('guidedEntry')==='1'||params.get('learned')==='1';
  document.addEventListener('click',event=>{const b=event.target.closest?.('#bGuidedIntro,#bIntro');if(!b)return;if(b.id==='bIntro'&&navigator.webdriver&&params.get('guidedEntry')!=='1')return;if(b.disabled)return;event.preventDefault();event.stopImmediatePropagation();location.assign(courseURL());},true);
  if(params.get('learned')==='1'){
   const start=()=>{if(!window.skyStartReadiness?.ready){requestAnimationFrame(start);return;}const custom=$('challengeCustom');if(custom?.checked)custom.click();const choice=$('challengeDifficulty');choice.value='easy';choice.dispatchEvent(new Event('change'));$('bStart').click();};start();
  }
  return;
 }
 const g = window.__game, sky = window.__skyInternals, practice = window.skyPractice, c = g.P;
 if (!practice) return;
 const course = window.skyPracticeCourse;
 const progress = { stats: {}, flash: 0, lured: false, path: 0, reloadSeen:false, kickReady:false };
 const { lessons, goal, near } = createLessons(sky, g, practice, progress);
 const chapters = [['はじめの一歩','First steps'],['屋上を渡る','Across the rooftops'],['追手をかわす','Shake off pursuers'],['本番へ','Ready to run']];
 let index = -1, trial = true, started = false, finished = false, trialReached = false, trialJumps = 0;
 let copyKey = '', lastStage = '', retryUntil = 0;
 const lesson = () => lessons[index];
 const defense = () => !trial && ['flash', 'decoy'].includes(lesson()?.id);
 const combat = () => !trial && ['stomp','kick','flash','decoy','shoot'].includes(lesson()?.id);
 let coaching=null;
 document.body.classList.add('guided-intro');
 document.title = text('屋上で操作を試す','Try your controls on the rooftops');
 const ui = document.createElement('section'); ui.id = 'learnUI'; ui.setAttribute('aria-label',text('操作を試して覚える','Try the controls'));
 ui.innerHTML = `<header id="learnHeader"><p id="learnChapter"></p><h2 id="learnTitle"></h2><p id="learnHint" role="status" aria-live="polite"></p><div id="learnProgress" aria-hidden="true"><i></i><i></i><i></i><i></i></div></header>
   <div id="learnTrialBar"><button id="learnBack" type="button"></button><button id="learnGo" type="button"></button></div><div id="learnTarget" hidden></div>
   <div id="learnKeys" aria-hidden="true">W A S D</div><div id="learnMoveCue" aria-hidden="true"></div><div id="learnJumpCue" aria-hidden="true"></div><div id="learnPressCue" hidden></div><div id="learnLookCue" aria-hidden="true"><span>↔</span><small></small></div>`;
 $('app').append(ui);
 const go=$('learnGo'),target=$('learnTarget');
 let choice,coach;
 function clearInput() {
   Object.keys(g.keys).forEach(k => g.keys[k] = false);
   Object.assign(sky.inputState, {on:false,x:0,y:0,id:null,lookId:null}); c.jumpBuf = c.slideBuf = 0;
   window.skyFollowCamera.reset();
 }
 function targets(active) {
   practice.targets.forEach((e,j) => {
     e.dead = e.remove = !active; e.m.root.visible = active;
     if (!active) return;
     const at = lesson()?.id==='shoot'?course.shootPositions[j]:defense() ? [Math.min(180,c.pos.x+3+j*2),0,(j-.5)*.8] : course.targetPositions[j];
     e.pos.fromArray(at);e.m.root.position.copy(e.pos);e.vel.set(0,0,0);e.hp=lesson()?.id==='shoot'?4:1e6;e.practiceFloor=at[1];e.spawnT=0;e.rise=e.act=e.fall=null;e.stun=0;
     e.flank=e.dropper=e.stalker=false;e.speedMul=1;e.sideT=0;e.guard=0;e.navT=0;e.onGround=true;
   });
 }
 function enter(i) {
   index = i; progress.stats = {...g.stats}; progress.path = 0; progress.lured = false;progress.reloadSeen=false;progress.kickReady=false;
   const current = lesson(); practice.checkpoint(current.checkpoint);
   targets(combat());
   if (defense()) {window.skyFlashbang.reset();window.skyDecoy.reset();progress.flash=window.skyFlashbang.stats.affected;}
   if(current.id==='shoot'){sky.U.gunOn=true;sky.U.weapon=0;g.G.ammo=1;g.G.reserve=24;sky.nl();}
   if (current.id === 'rescue') window.skyRescue?.reset();
   if (current.id === 'blast') {sky.U.gunOn=true;sky.U.weapon=0;sky.nl();}
   document.body.dataset.learnStage=current.id;
   document.dispatchEvent(new CustomEvent('sky-learn-stage',{detail:{id:current.id,index:i}}));
 }
 function finish() {
   if (finished) return; finished=true;
   storage.set('gunrun-guided-intro-v1','complete'); storage.set('gunrun-onboarding-v1',JSON.stringify({phase:'complete',at:new Date().toISOString()}));
   const u = new URL(params.get('return') === 'canyon' ? 'canyon.html' : 'index.html',location.href);
   u.search=new URLSearchParams({learned:'1',camera:window.skyFollowCamera.mode,controlpick:'0',lang:en()?'en':'ja',});
   location.assign(carryTrial(u).href);
 }
 const originalTick = practice.tick;
 practice.tick = function(dt) {
   originalTick(dt); if (!started || g.mode !== 'play'){render(false);return;}
   sky.U.sendLog=false;g.RL.on=false;g.RL.sealed=true;
   if (trial) {if(near(course.trialGoal,1.4))trialReached=true;render(false);return;}
   const current=lesson();if(!current||finished)return;
   if(current.id==='shoot'&&g.G.reloadT>0)progress.reloadSeen=true;
   if(current.id==='kick'&&!progress.kickReady&&c.onGround&&c.state==='normal'){progress.kickReady=true;const e=practice.targets[1];e.pos.set(c.pos.x+1.2,0,c.pos.z);e.vel.set(0,0,0);e.m.root.position.copy(e.pos);practice.targets[0].dead=practice.targets[0].remove=true;practice.targets[0].m.root.visible=false;}
   if(current.id==='decoy'){if(window.skyDecoy.lured.size>0)progress.lured=true;if(!window.skyDecoy.active&&window.skyDecoy.cooldown>0)window.skyDecoy.reset();}
   if(current.id==='flash'&&window.skyFlashbang.charges===0&&!window.skyFlashbang.grenades.length&&window.skyFlashbang.stats.affected<=progress.flash)window.skyFlashbang.reset();
   if(current.path?.[progress.path]&&near(current.path[progress.path],1))progress.path++;
   if(current.retryIf?.()){practice.retry();return;}
   if(current.done()){if(index===lessons.length-1)finish();else enter(index+1);}
   render(false);
 };
 function setText(node,value){if(node.textContent!==value)node.textContent=value;}
 function render(schedule=true) {
   if(!started&&g.mode==='play'){started=true;trialJumps=g.stats.jumps||0;targets(false);document.body.dataset.learnStage='controls';choice.start();}
   ui.hidden=!started||g.mode!=='play';
   if(ui.hidden){if(schedule)requestAnimationFrame(()=>render());return;}
   const touch=window.skyFollowCamera.touchDevice, english=en(), key=String(english)+touch;
   choice.sync();if(trial)coach.sync();$('learnTrialBar').hidden=!trial||choice.phase!=='try';
   if(key!==copyKey){
     copyKey=key;go.innerHTML=text('この操作にする','Use these controls')+'<span aria-hidden="true">→</span>';setText($('learnBack'),text('選択画面に戻る','Back to choices'));
     setText($('learnMoveCue'),text(touch?'左で移動':'W A S D で移動',touch?'Move with your left thumb':'W A S D to move'));
     setText($('learnJumpCue'),text(touch?'タップでジャンプ':'Spaceでジャンプ',touch?'Tap to jump':'Space to jump'));
     setText($('learnLookCue').querySelector('small'),text('右で見回す','Drag here to look'));
   }
   const current=lesson();coaching=trial?null:describeLesson(current,{game:g,sky,practice,progress,goal,near,english});
   let heading=trial?text('お試し：'+(window.skyFollowCamera.mode==='after'?'視点操作なし':'自分で視点操作'),'Try: '+(window.skyFollowCamera.mode==='after'?'No camera input':'Control the view')):coaching.title;
   let hint=trial?text(touch?'左の丸を上へずらす → 離すと止まる':'WASDで移動。Spaceでジャンプ。',touch?'Slide the left stick up. Release to stop.':'WASD to move. Space to jump.'):coaching.hint;
   if(!trial&&g.GAME.t<retryUntil)hint=text('もう一度。','Try again. ')+hint;
   setText($('learnChapter'),trial?text('操作を試す','Try the controls'):chapters[current.chapter][english?1:0]);
   setText($('learnTitle'),heading);setText($('learnHint'),hint);
   $('learnProgress').hidden=trial;
   $('learnProgress').querySelectorAll('i').forEach((e,i)=>e.dataset.on=String(!trial&&i<=current.chapter));
   $('learnMoveCue').hidden=false;if(!trial)setText($('learnMoveCue'),coaching.motion==='stop'?text(touch?'移動を離す':'移動キーを離す',touch?'Release movement':'Release move keys'):coaching.motion==='forward'?text(touch?'前へ押し続ける':'Wを押し続ける',touch?'Keep pushing forward':'Keep holding W'):text(touch?'マークへ移動':'WASDでマークへ',touch?'Move to the marker':'WASD toward the marker')); $('learnJumpCue').hidden=!trial;
   $('learnLookCue').hidden=!trial||!touch||window.skyFollowCamera.mode!=='before';
   const id=trial?'controls':current.id;
   lastStage=id;document.body.dataset.learnAction=trial?(trialReached&&(g.stats.jumps||0)<=trialJumps?'tJump':''):coaching.action;ui.dataset.cue=trial?'trial':coaching.cue;ui.dataset.motion=trial?'toward':coaching.motion;
   const at=trial?course.trialGoal:coaching.at;
   const press=$('learnPressCue'),button=!trial&&coaching.action?$(coaching.action):null;press.hidden=!button||button.id==='tJump'||!coaching.press||!button.getClientRects().length||getComputedStyle(button).visibility==='hidden';
   if(!press.hidden){const r=button.getBoundingClientRect(),a=$('app').getBoundingClientRect(),left=['tJump','tSlide'].includes(button.id);press.dataset.side=left?'left':'top';press.style.left=(r.left-a.left+(left?-8:r.width/2))+'px';press.style.top=(r.top-a.top+(left?r.height/2:-8))+'px';setText(press,coaching.press);}
   window.skyGuidedPresentation?.target(at,id,trial&&trialReached);
   const v=new sky.Geom.Vector3(at[0],at[1]+.25,at[2]).project(sky.Se),w=$('app').clientWidth,h=$('app').clientHeight;
   const visible=v.z>-1&&v.z<1&&Math.abs(v.x)<.88&&Math.abs(v.y)<.8;
   target.hidden=!visible||(trial&&trialReached)||['hook','blast'].includes(id);
   if(!target.hidden){target.style.left=(v.x+1)*w/2+'px';target.style.top=(1-v.y)*h/2+'px';setText(target,trial?text('ここまで','This way'):'');}
   const snapshot=JSON.stringify({stage:trial?'controls':id,index,trial,completed:lessons.slice(0,Math.max(0,index)).map(s=>s.id),retries:practice.retries,goal:at});if(document.body.dataset.skyGuided!==snapshot)document.body.dataset.skyGuided=snapshot;
   if(!trial)coach.beforeFrame();
   if(schedule)requestAnimationFrame(()=>render());
 }
 function startCourse(){if(!trial)return;clearInput();window.skyFollowCamera.setMode(window.skyFollowCamera.mode);trial=false;course.gates.forEach(b=>{b.off=true;b.mesh.visible=false;});enter(0);render(false);$('c').focus();}
 choice=installGuidedChoice({game:g,sky,english:en,clearInput,adopt:startCourse,reset:()=>{practice.place(course.start);trialReached=false;},exit:()=>location.assign(new URL(params.get('return')==='canyon'?'canyon.html':'index.html',location.href).href)});
 coach=installGuidedCoach({game:g,sky,english:en,active:()=>!trial&&!finished,lesson:()=>lesson()?.id,cue:()=>coaching});
 go.onclick=()=>choice.confirm();$('learnBack').onclick=()=>{clearInput();practice.place(course.start);trialReached=false;choice.show();};
 addEventListener('keydown',e=>{if(trial&&['KeyQ','KeyB','KeyV','KeyZ','KeyC','Digit1','Digit2'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}},true);
 $('bMenu').addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();location.assign(new URL(params.get('return')==='canyon'?'canyon.html':'index.html',location.href).href);},true);
 const skip=document.createElement('button');skip.id='learnSkip';skip.textContent=text('練習を終えて本番へ','Leave practice and play');skip.onclick=finish;$('bResume').after(skip);
 for(const node of [$('learnTrialBar')])for(const type of ['pointerdown','pointerup','touchstart','touchend'])node.addEventListener(type,e=>e.stopPropagation());
 window.skyGuidedIntro={beforeFrame(){if(!started&&g.mode==='play')render(false);if(trial)return choice.blocked;render(false);return coach.blocked;},get blocked(){return trial?choice.blocked:coach.blocked},get choice(){return choice.phase},get pausedTarget(){return coach.target},get pauseSequence(){return coach.sequence},get total(){return lessons.length},get finished(){return finished},get trial(){return trial},get stage(){return trial?'controls':lesson()?.id},get defense(){return defense()},get cue(){return coaching},get completed(){return lessons.slice(0,Math.max(0,index)).map(s=>s.id)},
   retrying(){coach.reset();retryUntil=g.GAME.t+2;progress.lured=false;progress.reloadSeen=false;progress.kickReady=false;if(lesson()?.id==='flash')window.skyFlashbang.reset();if(lesson()?.id==='decoy')window.skyDecoy.reset();if(lesson()?.id==='walljump')progress.path=lesson().path.length;},
   restored(){progress.stats={...g.stats};targets(combat());if(lesson()?.id==='shoot'){g.G.ammo=1;g.G.reserve=24;} },finish};
 render();
})();
