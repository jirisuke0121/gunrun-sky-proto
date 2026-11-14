// In-course instruction. Detect availability and native results; never activate a skill for the player.
(function(root){
 const STORE='gunrun-context-guides-v1', GAP=8, DANGER_RADIUS=4;
 const defs={
 wallrun:{jp:['この壁を走って渡れる。','壁に沿って前へ進みながらジャンプします。','壁走り成功！'],en:['Run along this wall.','Move along the wall and jump.','WALL RUN!'],button:'tJump',jump:true,state:'wallrun'},
 walljump:{jp:['壁を蹴って、別の足場へ。','ジャンプで壁を蹴れます。','壁ジャンプ成功！'],en:['Kick off this wall.','Jump to push off the wall.','WALL JUMP!'],button:'tJump',jump:true,stat:'walljumps'},
 zip:{jp:['このロープで向こうへ渡れる。','ジャンプでロープにつかまります。その後は自動で移動します。','ジップライン成功！'],en:['Ride this zipline.','Jump to attach. Travel is automatic.','ZIPLINE CONNECTED!'],button:'tJump',jump:true,state:'zip'},
 slide:{jp:['この斜面を滑って下れる。','斜面滑りボタン／Eキーで滑れます。','斜面滑り成功！'],en:['Slide down this slope.','Use Slide / E to slide downhill.','SLIDING!'],button:'tSlide',crouch:true,state:'slide'},
 barrel:{jp:['ドラム缶で高い場所へ跳べる。','表示されたドラム缶をタップ／Qキー。接近・爆破ジャンプは自動です。','爆破ジャンプ開始！'],en:['Launch upward with this barrel.','Tap the marked barrel / press Q. The launch sequence is automatic.','BARREL LAUNCH STARTED!'],keys:['KeyB','KeyQ']},
 flash:{jp:['追手を閃光玉で止められる。','閃光玉ボタン／1キーで使用。止まっている間に逃げよう。','閃光玉を投げた！'],en:['Stop nearby pursuers.','Use Flash / 1, then escape while they are stunned.','FLASH THROWN!'],button:'tFlash',keys:['Digit1','Numpad1']},
 decoy:{jp:['分身に追手を引きつけられる。','分身ボタン／2キーで使用。追手の注意をそらして逃げよう。','分身発動！'],en:['Distract pursuers with a decoy.','Use Decoy / 2 to draw them away.','DECOY ACTIVE!'],button:'tDecoy',keys:['Digit2','Numpad2']},
 rescue:{jp:['救済フックで高台へ逃げられる。','救済ボタン／3キー。安全な高台への移動は自動です。','救済フック発動！'],en:['Escape to higher ground.','Use Rescue / 3. The hook chooses a safe platform.','RESCUE ACTIVE!'],button:'tRescue',keys:['Digit3']}
 };
 function candidates(g,env,seen={}){
  const c=g.c,p=c.pos,out=[],add=(id,point)=>{if(!seen[id])out.push({id,point});};
  if(c.state==='wallrun'&&env.wallJumpReady?.())add('walljump',[p.x,p.y+1,p.z]);
  if(c.state!=='normal'||!c.onGround)return out;
  const near=(g.Jt||[]).filter(e=>!e.dead&&!e.remove&&!e.rise&&Math.abs(e.pos.y-p.y)<3).filter(e=>{
   const dx=e.pos.x-p.x,dy=e.pos.y+1-p.y-c.eye,dz=e.pos.z-p.z,d=Math.hypot(dx,dy,dz)||1;
   return d<=16&&!g.raycast(p.x,p.y+c.eye,p.z,dx/d,dy/d,dz/d,Math.max(0,d-.4));
  });
  const flash=env.flash,decoy=env.decoy;
  // Reuse the rescue guide's close-danger window, excluding enemies already neutralized.
  const threats=near.filter(e=>!(e.stun>0)&&!(e.fall?.wait>0)&&!flash?.blinded?.(e)&&!decoy?.targetFor?.(e));
  const danger=threats.some(e=>Math.hypot(e.pos.x-p.x,e.pos.z-p.z)<=DANGER_RADIUS);
  if(!seen.flash&&danger&&flash?.charges>0&&threats.filter(e=>Math.hypot(e.pos.x-p.x,e.pos.z-p.z)<=flash.config.radius).length>=2)add('flash');
  if(!seen.decoy&&danger&&threats.length>=2&&!decoy?.active&&decoy?.cooldown<=0&&env.decoyReady?.())add('decoy');
  if(!seen.rescue&&near.some(e=>Math.hypot(e.pos.x-p.x,e.pos.z-p.z)<4)&&!(flash?.charges>0)&&!(decoy?.cooldown<=0&&env.decoyReady?.())&&env.rescue?.available()&&env.rescue.chooseTarget())add('rescue');
  const b=!seen.barrel&&env.barrels?.assistTarget();if(b)add('barrel',[b.barrel.x,(b.barrel.y||0)+1,b.barrel.z]);
  if(env.slope?.canStart()&&env.usable('tSlide'))add('slide');
  for(const route of (seen.wallrun?[]:env.wallRoutes)||[]){const [x,y,z]=route.at,[nx,nz]=route.normal,along=Math.abs(nx?p.z-z:p.x-x),outside=(p.x-x)*nx+(p.z-z)*nz;const face=g.jn?.find(w=>!w.off&&w.type==='mono'&&w.wr!==false&&env.wallFaceAllowed(w,{x:nx,z:nz})&&Math.abs((nx?(nx>0?w.maxX:w.minX):(nz>0?w.maxZ:w.minZ))-(nx?x:z))<.1);if(face&&outside>=0&&outside<=1.8&&along<=4&&Math.abs(p.y-y)<2.5&&(-Math.sin(c.yaw)*route.direction[0]-Math.cos(c.yaw)*route.direction[1])>.5){add('wallrun',[x,y+1,z]);break;}}
  for(const z of g.$a||[]){const [x,y,zz]=z.a;if(Math.hypot(p.x-x,p.z-zz)<=2.3&&p.y<=y-.8&&p.y>=y-3.4){add('zip',z.a);break;}}
  return out;
 }
 function create({game:g,env,storage,map,forced=false,disabled=false,show=()=>{},now=()=>performance.now(),unlock=()=>{}}){
  let phase='idle',item=null,run=null,seen={},closed=new Set(),nextAt=2,baseline={},attempt=false,attemptTime=0,until=0,hookPhase='idle',autoStats={};
  const playing=()=>g.modeRef()==='play'&&!g.z.over;
  const clear=()=>{for(const k of Object.keys(g.keys))g.keys[k]=false;Object.assign(g.inputState,{on:false,id:null,lookId:null,x:0,y:0,slideHeld:false});g.c.jumpBuf=0;g.c.crouchPressed=false;g.c.hookPressed=false;g.c.hookPick=null;g.Et.held=false;g.Et.trigger=0;};
  const save=id=>{seen[id]=true;try{const all=JSON.parse(storage.getItem(STORE)||'{}');all[map]=seen;storage.setItem(STORE,JSON.stringify(all));}catch{}};
  const result=()=>{if(!item)return false;const d=defs[item.id],c=g.c;
   if(d.stat)return (env.stats[d.stat]||0)>(baseline[d.stat]||0);
   if(d.state)return c.state===d.state;
   if(item.id==='flash')return (env.flash?.stats.thrown||0)>baseline.flash;
   if(item.id==='decoy')return (env.decoy?.stats.used||0)>baseline.decoy;
   if(item.id==='rescue')return (env.rescue?.charges??2)<baseline.rescue;
   return item.id==='barrel'&&!!env.barrels?.sequence;
  };
  const render=()=>show({phase,item,paused:playing()&&phase==='action',visible:playing()&&phase!=='idle'});
  function finish(success){if(success){save(item.id);phase='success';until=now()+2200;}else{phase='idle';item=null;}clear();nextAt=g.z.t+GAP;render();}
  function beforeFrame(){
   if(run!==g.z.challenge){run=g.z.challenge;phase='idle';item=null;closed=new Set();nextAt=2;autoStats={...env.stats};try{seen=forced?{}:JSON.parse(storage.getItem(STORE)||'{}')[map]||{};}catch{seen={};}}
   if(!env.intro()||disabled||g.modeRef()==='menu'||g.z.over){phase='idle';render();return;}
   if(!playing()){render();return;}
   const hp=env.hookPhase();if(hp==='success'&&hookPhase!=='success')nextAt=g.z.t+GAP;hookPhase=hp;
   if(phase==='success'&&now()>=until){phase='idle';item=null;}
   if(phase==='action'){if(result()){finish(true);return;}render();return;}
   if(phase==='idle'&&hp==='idle'&&g.z.t>=nextAt&&!env.busy()){
    const list=candidates(g,env,seen);const next=list.find(x=>!seen[x.id]&&!closed.has(x.id)&&env.presentable(x));
    if(next){item=next;phase='action';baseline={...env.stats,flash:env.flash?.stats.thrown||0,decoy:env.decoy?.stats.used||0,rescue:env.rescue?.charges??2};attempt=false;attemptTime=0;clear();unlock();}
    // Automatic traversal has no extra input to teach: acknowledge first real use.
    else for(const [stat,id]of [['vaults','vault'],['mantles','mantle'],['wallruns','wallrun']])if(!seen[id]&&(env.stats[stat]||0)>(autoStats[stat]||0)){item={id};save(id);phase='success';until=now()+2200;nextAt=g.z.t+GAP;break;}
   }
   autoStats={...env.stats};render();
  }
  function input(){if(!item||!defs[item.id])return false;const d=defs[item.id],c=g.c,t=g.inputState;
   return (d.jump&&c.jumpBuf>0)||(d.crouch&&c.crouchPressed)|| (d.jump&&(g.keys.KeyW||(t.on&&Math.abs(t.y)>.2)));
  }
  return {beforeFrame,afterFrame(dt){if(!playing()||phase!=='action')return;if(result()){finish(true);return;}if(attempt){attemptTime+=dt;if(attemptTime>2.5||g.c.pos.y<-21)finish(false);}},skip(){if(item)closed.add(item.id);finish(false);},
   get active(){return playing()&&phase==='action';},get worldPaused(){return playing()&&phase==='action';},get freezePlayer(){if(!playing()||phase!=='action')return false;if(input())attempt=true;return !attempt;},get phase(){return phase;},get item(){return item;}};
 }
 if(typeof module==='object'&&module.exports){module.exports={create,candidates,defs,STORE};return;}
 root.addEventListener('load',()=>{
  const g=root.__skyInternals;if(!g||root.skyPracticeMode||root.skyOwnerReplay)return;
  const params=new URLSearchParams(location.search),app=document.getElementById('app')||document.body;
  const visible=id=>{const b=document.getElementById(id);return !!b&&!b.hidden&&b.getBoundingClientRect().width>0&&getComputedStyle(b).visibility!=='hidden';};
  const v=new g.Geom.Vector3();const project=p=>{if(!p||!p.every(Number.isFinite))return null;v.set(...p).project(g.Se);if(v.z< -1||v.z>1||Math.abs(v.x)>.95||Math.abs(v.y)>.9)return null;return {x:(v.x+1)*app.clientWidth/2,y:(1-v.y)*app.clientHeight/2};};
  const env={stats:root.__game.stats,intro:()=>root.skyChallenge?.isIntroRun===true,hookPhase:()=>root.skyHookTutorial?.phase||'idle',busy:()=>!!root.skyBite?.locked||g.demoActive(),usable:id=>!matchMedia('(pointer:coarse)').matches||visible(id),
   presentable:item=>{if(item.point&&!project(item.point))return false;const b=defs[item.id]?.button;return (!!b&&visible(b))||!!project(item.point)||!matchMedia('(pointer:coarse)').matches;},
   wallJumpReady:()=>root.__skyCanWallJumpAtSpot?.(g.c,(x,y,z)=>g.jn.find(w=>!w.off&&w.type==='mono'&&w.wr!==false&&x>w.minX&&x<w.maxX&&y>w.minY&&y<w.maxY&&z>w.minZ&&z<w.maxZ),g.c.wallN),
   decoyReady:()=>root.skyDecoy?.canActivate?.()===true,
   get wallRoutes(){return root.__skyWallRunRoutes||[];},wallFaceAllowed:(w,n)=>root.__skyCanWallRunOnFace?.(w,n)===true,
   get flash(){return root.skyFlashbang;},get decoy(){return root.skyDecoy;},get rescue(){return root.skyRescue;},get barrels(){return root.skyBlastBarrels;},get slope(){return root.skySlopeSlide;}};
  const plate=document.createElement('section');plate.id='contextGuide';plate.hidden=true;plate.setAttribute('role','region');plate.setAttribute('aria-live','polite');
  plate.innerHTML='<div id="contextSpot"></div><div id="contextButton"></div><div class="context-card"><header><span id="contextPhase"></span><button id="contextClose" aria-label="Close guide">×</button></header><h2 id="contextTitle"></h2><p id="contextText"></p></div>';app.append(plate);
  const $=id=>document.getElementById(id);let guide,last='',lastItem='';
  const automatic={vault:['障害物を自動で乗り越えた！','VAULTED!'],mantle:['縁をつかんで登れた！','CLIMBED UP!'],wallrun:['壁走り成功！','WALL RUN!']};
  const show=({phase,item,visible:vis,paused})=>{
   if(!vis&&last==='idle')return;
   const relayed=phase==='success'&&!!root.skyPlayerClarity?.guideNotice,newSuccess=phase==='success'&&(last!=='success'||lastItem!==item?.id);
   last=phase;lastItem=item?.id;plate.hidden=!vis||relayed;plate.dataset.phase=phase;document.body.classList.toggle('context-guide-paused',paused);if(!vis)return;
   const en=root.skyI18n?.lang==='en',d=defs[item.id],copy=d?.[en?'en':'jp'];$('contextPhase').textContent=paused?(en?'Ⅱ WORLD PAUSED':'Ⅱ 敵・時間を停止中'):'SUCCESS';
   $('contextTitle').textContent=copy?(phase==='success'?copy[2]:copy[0]):automatic[item.id]?.[en?1:0]||'';
   $('contextText').textContent=phase==='success'?(en?'Keep going!':'そのまま進もう！'):copy[1];$('contextClose').hidden=phase==='success';
   if(relayed&&newSuccess)root.skyPlayerClarity.guideNotice($('contextTitle').textContent+' '+$('contextText').textContent);
   const el=d?.button&&document.getElementById(d.button),r=el&&visible(d.button)?el.getBoundingClientRect():null,ar=app.getBoundingClientRect();const bp=r?{x:r.x-ar.x+r.width/2,y:r.y-ar.y+r.height/2}:null,wp=project(item.point),p=wp||bp;$('contextButton').hidden=!paused||!wp||!bp;if(wp&&bp){$('contextButton').style.left=bp.x+'px';$('contextButton').style.top=bp.y+'px';}$('contextSpot').hidden=!paused||!p;if(p){$('contextSpot').style.left=p.x+'px';$('contextSpot').style.top=p.y+'px';plate.querySelector('.context-card').classList.toggle('at-top',p.y>app.clientHeight*.55);}
  };
  guide=create({game:g,env,storage:{getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)},map:root.SKY_CANYON_MAP?'canyon':'town',forced:params.get('guides')==='1',disabled:params.get('guides')==='0'||(navigator.webdriver&&!params.has('guides')),show,unlock:()=>document.exitPointerLock?.()});root.skyContextTutorial=guide;
  $('contextClose').onclick=()=>guide.skip();
  for(const type of ['pointerdown','pointerup','touchstart','touchend'])plate.querySelector('.context-card').addEventListener(type,e=>e.stopPropagation());
 });
})(globalThis);
