// Testing controls belong to this map, rather than changing saved match settings.
(() => {
  if(!window.skyPracticeMode)return;
  const sky=window.__skyInternals,g=window.__game,{c,U,z,Geom:T}=sky,course=window.skyPracticeCourse;
  document.body.classList.add('practice-mode');document.title='パルクール練習場 | 空中回廊';
  const style=document.createElement('link');style.rel='stylesheet';style.href='./practice.css?v=20261028-practice-controls-v2';document.head.append(style);
  document.querySelector('#ovStart h1').textContent='パルクール練習場';
  document.querySelector('#ovStart h1 + p').textContent='追手・制限時間なし。技を繋げて一周したり、好きな技からすぐ試せます。落ちたら直前の地点に戻ります。';
  document.getElementById('bStart').textContent='練習をはじめる';
  let section=course.sections.find(s=>s.id===new URLSearchParams(location.search).get('section'))||course.start;
  let falls=0,chain=0,lastAction=-10,blastReset=0,lastStats={},message='',messageUntil=0,autoStarted=false;
  const panel=document.createElement('section');panel.id='practicePanel';panel.hidden=true;panel.setAttribute('aria-label','練習場の操作');
  panel.innerHTML='<div class="practice-row"><strong>練習場</strong><output id="practiceSpeed">0.0 m/s</output><span id="practiceChain"></span><button id="practiceChoose" type="button">技を選ぶ</button></div><div class="practice-row"><select id="practiceSection" aria-label="試す技"></select><button id="practiceRetry" type="button">ここからやり直す</button><button id="practiceNext" type="button">次の技へ</button><a href="./index.html">ホーム</a></div><p id="practiceHint"></p>';
  const app=document.getElementById('app'),pausePlate=document.querySelector('#ovPause .plate');app.append(panel);
  const select=panel.querySelector('select'),hint=panel.querySelector('#practiceHint');
  for(const s of course.sections)select.add(new Option(s.name,s.id));select.value=section.id;
  function clearInput(){Object.keys(g.keys).forEach(k=>g.keys[k]=false);c.jumpBuf=0;c.zipWish=0;c.slideBuf=0;c.crouchPressed=false;c.hookPressed=false;}
  function place(s=section){
    section=s;select.value=s.id;clearInput();
    g.placeAt({x:s.at[0],y:s.at[1],z:s.at[2],yaw:s.yaw});
    c.state='normal';c.ledge=c.ladder=c.hook=c.zip=null;c.onGround=true;c.h=1.75;c.eye=1.62;c.camY=c.pos.y+1.62;c.pitch=-.03;c.roll=0;
    c.coyote=.15;c.catchCD=c.hookCD=c.setCD=c.slideCD=0;c.vel.set(0,0,0);c.lastGround.copy(c.pos);c.safe.copy(c.pos);c.edgeOff=null;c.life=3;c.invuln=Infinity;
    g.SLIDE.cool=0;g.KICK.cd=0;window.skyDash?.reset(true);window.skyJumpPickups?.reset();window.skyBlastBarrels?.reset();
    window.skyDash?.placePickups(c.pos,c.yaw);window.skyJumpPickups?.placePickups(c.pos,c.yaw);
    if(s.id==='jumpgun')window.skyJumpGun?.grant();
    if(s.id==='blast'){U.weapon=0;sky.nl();g.G.ammo=12;}
    chain=0;lastStats={...g.stats};message='';
    g.cam(0);window.skyHumanView?.update(0);if(g.mode==='pause')sky.Ed();document.getElementById('c').focus();
  }
  // Stationary partners use the same hit/stomp/kick targets, with no AI attacks.
  const targets=[];
  function restoreTargets(){
    const positions=[[5,0,18],[1,0,18]];
    if(!targets.length)for(const p of positions)targets.push(new sky.ri(...p));
    g.zombies.length=0;
    targets.forEach((t,i)=>{
      t.pos.set(...positions[i]);t.vel.set(0,0,0);t.hp=1e6;t.spawnT=0;t.rise=t.act=t.fall=null;t.onGround=true;t.stun=t.atkT=t.atkCD=0;t.dead=false;
      t.flank=t.dropper=t.stalker=false;t.m.root.visible=true;t.m.root.position.copy(t.pos);sky.ue.add(t.m.root);g.zombies.push(t);
    });
  }
  function begin(){
    for(const key of ['jumpVel','gravity','airAccel','mantleReach','wallRunTime','wallRunSpeed','wallRunGravity','wallJumpPush','ladderSpeed','zipSpeed','hookRange','hookSpeed','hookCooldown','momentumDecay','jumpGunUp','jumpGunPush','stompUp','kickUp','kickBack','kickPush','slideBoost','slideFriction','coyote','jumpBuffer','groundAccel','groundBrake','edgeCatch','edgeSafeR','slideCool'])U[key]=g.DEF[key];
    Object.assign(U,{sendLog:false,gunOn:true,autoFire:false,aimAuto:false,stalkerOn:false,stalker2:false,reserveAmmo:99,autoSprint:true,sprintSpeed:6,walkSpeed:4.6});
    g.RL.on=false;g.RL.saved=true;g.SCR.off=g.PACE.off=g.MARK.off=true;g.MARK.goal=null;
    z.challenge=null;z.over=false;z.mission=null;z.t=0;g.G.ammo=12;falls=0;
    restoreTargets();place(section);
  }
  function retry(){if(!['play','pause'].includes(g.mode))return;falls++;restoreTargets();place();}
  function choose(){if(g.mode!=='play')return;document.exitPointerLock?.();sky.An('pause');pausePlate.prepend(panel);panel.dataset.paused='true';select.focus();}
  panel.querySelector('#practiceChoose').addEventListener('click',choose);
  select.addEventListener('change',()=>{restoreTargets();place(course.sections.find(s=>s.id===select.value));});
  panel.querySelector('#practiceRetry').addEventListener('click',retry);
  panel.querySelector('#practiceNext').addEventListener('click',()=>{restoreTargets();place(course.sections[(course.sections.indexOf(section)+1)%course.sections.length]);});
  for(const name of ['pointerdown','pointerup','touchstart','touchend'])panel.addEventListener(name,e=>e.stopPropagation());
  addEventListener('keydown',e=>{
    if(g.mode==='play'&&e.code==='Tab'){e.preventDefault();e.stopImmediatePropagation();choose();}
    else if(g.mode==='play'&&e.code==='KeyT'&&!e.repeat){e.preventDefault();retry();}
  },true);
  function tick(dt){
    // Recognise an intentional drop to the lower return lane before checking
    // for a missed elevated platform.
    if(section.id==='zip'&&c.state==='normal'&&c.onGround&&c.pos.x<-18&&c.pos.y<4.7){section=course.sections.find(s=>s.id==='walljump');select.value=section.id;}
    if(c.onGround&&c.pos.y<.6&&c.pos.z>14){section=course.sections.find(s=>s.id===(c.pos.x>-7?'kick':'blast'));select.value=section.id;}
    for(const s of course.sections)if(s!==section&&Math.hypot(c.pos.x-s.at[0],c.pos.z-s.at[2])<2&&Math.abs(c.pos.y-s.at[1])<.65){section=s;select.value=s.id;break;}
    if(!Number.isFinite(c.pos.y)||c.pos.y<-3||Math.abs(c.pos.x)>34||Math.abs(c.pos.z)>26||(c.onGround&&c.state==='normal'&&c.pos.y<section.floor-.8)){retry();return;}
    c.invuln=Infinity;U.sendLog=false;
    if(window.skyBlastBarrels?.barrels.some(b=>!b.active)){blastReset+=dt;if(blastReset>3){const a=g.stats.blasts,b=g.stats.blastLaunches;window.skyBlastBarrels.reset();g.stats.blasts=a;g.stats.blastLaunches=b;blastReset=0;}}else blastReset=0;
    for(const t of targets){
      t.vel.y-=U.gravity*dt;t.pos.addScaledVector(t.vel,dt);
      if(t.pos.y<0){t.pos.y=0;t.vel.y=0;t.onGround=true;}else t.onGround=false;
      t.vel.x*=Math.exp(-6*dt);t.vel.z*=Math.exp(-6*dt);t.m.root.position.copy(t.pos);
      t.anim(dt);t.atkT=t.atkCD=0;t.stun=Math.max(0,t.stun-dt);
    }
    const labels={jumps:'ジャンプ',vaults:'乗り越え',mantles:'よじ登り',wallruns:'壁走り',walljumps:'壁蹴り',barGrabs:'鉄棒つかみ',barJumps:'鉄棒ジャンプ',hooks:'フック',zips:'ジップライン',slides:'スライド',stomps:'踏みつけ',kicks:'飛び蹴り',ladders:'はしご',blastLaunches:'爆破ジャンプ',dashPickups:'ダッシュ取得'};
    for(const [key,label] of Object.entries(labels))if((g.stats[key]||0)>(lastStats[key]||0)){
      chain=z.t-lastAction<3?chain+1:1;lastAction=z.t;message=label;messageUntil=z.t+1;lastStats[key]=g.stats[key];
    }
  }
  const resumeAudio=()=>{if(sky.Ut.ctx?.state==='suspended')sky.Ut.ctx.resume().catch(()=>{});};
  addEventListener('pointerdown',resumeAudio,true);addEventListener('keydown',resumeAudio,true);
  function frame(){
    panel.hidden=!['play','pause'].includes(g.mode);
    panel.dataset.paused=String(g.mode==='pause');
    // During play the panel shares the game's rotation and safe-area mapping.
    // The paused settings sheet deliberately stays in the physical viewport.
    // Selecting a section can pause and resume within one animation frame.
    // Check the actual parent so the live panel always returns to the game.
    if(g.mode==='pause'){if(panel.parentElement!==pausePlate)pausePlate.prepend(panel);}
    else if(panel.parentElement!==app)app.append(panel);
    if(!panel.hidden){panel.querySelector('#practiceSpeed').textContent=Math.hypot(c.vel.x,c.vel.z).toFixed(1)+' m/s';panel.querySelector('#practiceChain').textContent=chain>1?chain+' 連続':'';hint.textContent=(messageUntil>z.t?message+'！　':'')+section.hint+(matchMedia('(pointer:fine)').matches?'　T：再試行 / Tab：技を選ぶ':'');}
    document.body.dataset.skyPractice=JSON.stringify({section:section.id,falls,chain,targets:targets.length});
    if(!autoStarted&&g.mode==='menu'&&window.skySwing&&document.body.dataset.skyHumanLoaded==='true'&&!document.getElementById('bStart').disabled){autoStarted=true;document.getElementById('bStart').click();}
    requestAnimationFrame(frame);
  }
  // World signs and repeated floor marks help read the loop at running speed.
  const mat=new T.Basic({color:0x58e7e2}),root=new T.Group();sky.ue.add(root);
  for(const s of course.sections){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#18343ee8';ctx.fillRect(0,0,512,96);ctx.fillStyle='#cafff6';ctx.font='700 32px system-ui';ctx.textAlign='center';ctx.fillText(s.name,256,61);
    const label=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthWrite:false}));label.position.set(s.at[0],s.at[1]+2.8,s.at[2]);label.scale.set(3.5,.65,1);root.add(label);
    const mark=new T.Mesh(new T.Torus(.65,.035,5,20),mat);mark.rotation.x=Math.PI/2;mark.position.set(s.at[0],s.at[1]+.03,s.at[2]);root.add(mark);
  }
  for(let x=-28;x<20;x+=2){const m=new T.Mesh(new T.Box(.09,.02,.6),mat);m.position.set(x,2.025,-14);root.add(m);}
  const arrows=[[-24,2,-16,1,0],[-14.5,2,-16,1,0],[1,4.4,-17,1,-.5],[17,4.4,-16,.4,1],[23.5,5.2,-1,-1,0],[-23.8,4,-10.5,1,0],[-20,4,-8.8,0,1],[9,8,-5,0,1],[9,11.2,4,0,1],[9,0,22,-1,-.6],[-11,0,17,-1,0],[-21,2,10,-1,-.5],[-27,2,5.8,0,-1],[-30,8,-15,0,-1],[-30,2,-24,1,0],[-26,2,-22,0,1]];
  for(const [x,y,z0,dx,dz] of arrows){
    const arrow=new T.Group();arrow.position.set(x,y+.03,z0);arrow.rotation.y=Math.atan2(dx,dz)+Math.PI;
    for(const side of [-1,1]){const stroke=new T.Mesh(new T.Box(.09,.025,.7),mat);stroke.position.x=side*.21;stroke.rotation.y=side*.72;arrow.add(stroke);}root.add(arrow);
  }
  window.skyPractice={begin,tick,retry,place,get section(){return section;},get retries(){return falls;}};
  frame();
})();
