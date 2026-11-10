// Extra coaching reads the same native state that drives the player's visible cues.
const TAKEOFF_X = 119.8; // east edge of the launch pad is x=120.19
export function describeLesson(lesson, {game, sky, practice, progress, goal, near, english}) {
  const c=game.P, id=lesson.id, ground=c.onGround&&c.state==='normal';
  const text=(ja,en)=>english?en:ja;
  const changed=key=>(game.stats[key]||0)>(progress.stats[key]||0);
  const prompt={title:lesson.title[english?1:0],hint:lesson.hint[english?1:0],action:'',cue:'move',at:goal(lesson),press:'',motion:'toward'};
  const tell=(title,hint,action='',cue='move',press='')=>Object.assign(prompt,{title:text(...title),hint:text(...hint),action,cue,press:press?text(...press):''});
  if(id==='jump') {
    if(ground&&c.pos.x<20) {prompt.at=[17,2,0];if(c.pos.x<16.5)tell(['踏切の線まで進む','Move to the take-off line'],['前入力を続ける','Keep moving forward']);else tell(['ここで、ジャンプ','Jump here'],['前へ進みながらジャンプを押す','Keep moving forward and press Jump'],'tJump','jump',['今ジャンプ','Jump now']);}
    else tell(['そのまま、向こうへ','Keep going across'],['前入力を続けて着地する','Keep moving forward to land']);
  }
  if(id==='mantle') {
    if(c.state==='ledge')tell(['そのまま、登り切る','Keep climbing'],['縁をつかむと自動で登ります','Catching the edge starts the climb']);
    else if(ground&&c.pos.x<30){prompt.at=[29.1,2,0];if(c.pos.x>=28.7)tell(['段差へ、ジャンプ','Jump at the ledge'],['前へ進みながらジャンプを押す','Move forward and press Jump'],'tJump','jump',['今ジャンプ','Jump now']);}
  }
  if(id==='wallrun') {
    if(c.state==='wallrun')tell(['壁沿いに、そのまま前へ','Keep moving along the wall'],['前入力を続けて向こうの足場へ','Keep moving forward to the landing']);
    else if(ground&&c.pos.x<39){prompt.at=[37.5,4.4,-1.3];if(c.pos.x>=36.7&&Math.abs(c.pos.z+1.3)<.65)tell(['壁ぎわで、前へ＋ジャンプ','Move along the wall and jump'],['壁を横に置いて、前入力を続ける','Keep the wall beside you and move forward'],'tJump','jump',['今ジャンプ','Jump now']);else tell(['壁の横のマークへ','Move beside the wall'],['床の矢印に沿って近づく','Follow the floor arrows']);}
  }
  if(id==='hook') {
    if(c.state==='hook')tell(['フックで移動中','Travelling by hook'],['着いたら、そのまま前へ','Continue forward after landing']);
    else tell(['ひし形のマークをタップ','Tap the diamond marker'],['本編と同じフック。PCはQ','The same hook as the main game. Q on PC']);
  }
  if(id==='downhill') {
    if(c.state==='slide')tell(['滑りながら、下の足場へ','Slide to the lower landing'],['前入力を続ける','Keep moving forward']);
    else if(window.skySlopeSlide.canStart())tell(['「'+document.getElementById('tSlide').textContent+'」を押す','Press '+document.getElementById('tSlide').textContent],['斜面にいる間だけ使えます','Available while standing on this slope'],'tSlide','slide',['斜面滑り','Slide']);
    else {prompt.at=[70.5,4.98,0];tell(['斜面の上まで進む','Move onto the slope'],['ボタンが光ったら「斜面滑り」','Press Slide when its button lights up']);}
  }
  if(id==='ladder')tell([c.state==='ladder'?'そのまま、上まで':'はしごへ前入力',c.state==='ladder'?'Keep climbing':'Move into the ladder'],['前入力を続けると自動で登ります','Keep moving forward to climb automatically']);
  if(id==='zip') {
    if(c.state==='zip')tell(['ロープで移動中','Riding the zipline'],['着地したら、床の矢印へ','Follow the floor arrows after landing']);
    else if(!changed('zips')){prompt.at=[94,4,0];if(near(prompt.at,1.15))tell(['ロープの真下で、ジャンプ','Jump beneath the zipline'],['つかんだ後は自動で渡ります','The ride is automatic once attached'],'tJump','jump',['今ジャンプ','Jump now']);else tell(['ロープの下のマークへ','Move beneath the zipline'],['マークの上でジャンプする','Jump from the floor marker']);}
  }
  if(id==='walljump') {
    if(changed('walljumps'))tell(['前入力で、小さな足場へ','Move forward onto the small pad'],['着地まで前入力を続ける','Keep moving forward until you land']);
    else if(progress.path<lesson.path.length)tell(['壁の横を回って、マークへ','Go around the wall to the marker'],['矢印に沿って壁の反対側へ','Follow the arrows around the wall']);
    else if(!near([115,2.8,0],.35)&&ground){prompt.at=[115,2.8,0];tell(['壁のそばのマークへ','Move close to the wall'],['壁のそばで二度ジャンプします','Jump twice while close to the wall']);}
    else if(ground&&Math.hypot(c.vel.x,c.vel.z)>.4)tell(['移動を離して、止まる','Release movement to stop'],['止まったら、ジャンプを一回','Press Jump once after stopping'],'','wait');
    else if(ground)tell(['まず、その場でジャンプ','First, jump beside the wall'],['移動を離して、ジャンプを一回','Release movement and press Jump once'],'tJump','jump',['一回目','First jump']);
    else if(c.pos.y>3.05)tell(['もう一度、ジャンプ','Press Jump again'],['押したら前入力で、壁から離れる','Then move forward, away from the wall'],'tJump','double-jump',['もう一度','Jump again']);
  }
  if(id==='swing') {
    const active=window.skySwing.active, ready=document.getElementById('tJump').dataset.swingReady==='true';
    if(active)tell(ready?['緑。今、ジャンプ！','Green. Jump now!']:['緑になるまで待つ','Wait for the green cue'],['本編と同じ「今！」と緑の合図','Use the native NOW and green cues'],ready?'tJump':'',ready?'swing-jump':'wait',ready?['今ジャンプ','Jump now']:'');
    else if(changed('barJumps'))tell(prompt.at[0]>window.skySwing.course.bars.at(-1).at[0]?['前入力で、向こうの足場へ','Keep moving toward the landing']:['前入力で、次の鉄棒へ','Keep moving toward the next bar'],['空中で進み、足場へ着地する','Keep travelling forward and land on the roof']);
    // The first prompt freezes the game until Jump is pressed, so it must not appear at the
    // spawn point: after a retry the player would be forced into a standing jump and never reach the bar.
    else if(ground&&c.pos.x<TAKEOFF_X-.2){prompt.at=[TAKEOFF_X,4,0];tell(['踏切の線まで進む','Move to the take-off line'],['足場の端まで走って、そこでジャンプ','Run to the platform edge, then jump']);}
    else tell(['前へジャンプして、鉄棒へ','Jump forward toward the bar'],['前入力を続けると自動でつかみます','Keep moving forward to catch it'],'tJump','jump',['ジャンプ','Jump']);
  }
  if(id==='pausefire')tell(['自動射撃を、一度止める','Pause automatic fire'],['踏み台を練習するので「自動射撃を停止」','Use Stop auto fire before practising the springboard'],'tAutoFire','pause-fire',['停止する','Pause']);
  if(id==='stomp') {
    if(sky.U.autoFire)tell(['まず、自動射撃を止める','Pause automatic fire first'],['「自動射撃を停止」を押す','Press Stop auto fire'],'tAutoFire','pause-fire',['停止する','Pause']);
    else if(ground){const d=practice.targets[0].pos.x-c.pos.x;if(d<1.85&&d>.3)tell(['近づいたら、ジャンプ','Jump when close'],['前入力を続けたまま押す','Keep moving forward as you press it'],'tJump','jump',['今ジャンプ','Jump now']);else tell(['追手の手前まで、走る','Run close to the pursuer'],['近づいたらジャンプで踏み台にする','Jump from close range to spring over it']);}
  }
  if(id==='flash'||id==='decoy'||id==='jumpgun'||id==='rescue') {prompt.action=lesson.action;prompt.cue=id;prompt.press=text('使う','Use');}
  if(id==='dash') {if(!changed('dashPickups'))tell(['青いDASHを取る','Collect the blue DASH'],['触れると、しばらく速く走れます','Touch it for a temporary speed boost']);else if(ground&&c.pos.x>150)tell(['加速したまま、ジャンプ','Jump with the speed boost'],['向こうの低い屋上へ','Head to the lower roof ahead'],'tJump','jump',['ジャンプ','Jump']);}
  if(id==='shoot') {
    if(game.G.reloadT>0)tell(['装填中。少し待つ','Reloading. Wait a moment'],['弾切れで自動装填。終わると射撃再開','Empty magazines reload automatically; fire then resumes']);
    else if(!sky.U.autoFire)tell(['自動射撃を、再開する','Resume automatic fire'],['残り1発から、自動装填も体験します','Start with one round to experience automatic reload'],'tAutoFire','resume-fire',['再開する','Resume']);
    else tell(['銃に任せて、その場で待つ','Let the gun fire while you wait'],['自分は移動・逃げ道選び。照準・射撃は自動','You choose movement and escape routes. Aim and fire are automatic']);
  }
  if(['hook','zip','pausefire','flash','shoot','rescue'].includes(id))prompt.motion='stop';
  if(['jump','mantle','wallrun','downhill','ladder','swing','dash'].includes(id)&&prompt.cue!=='move')prompt.motion='forward';
  if(id==='jump'&&!ground)prompt.motion='forward';
  if(id==='wallrun'&&(c.state==='wallrun'||changed('wallruns')))prompt.motion='forward';
  if(id==='wallrun'&&prompt.cue==='jump')prompt.at=[50,4.4,-1.3];
  if(id==='walljump'&&(prompt.cue==='wait'||prompt.cue==='jump'||prompt.cue==='double-jump'||changed('walljumps')))prompt.motion=['jump','wait'].includes(prompt.cue)?'stop':'forward';
  if(id==='walljump'&&(prompt.cue==='jump'||prompt.cue==='double-jump'))prompt.at=[119,4,0];
  if(id==='zip'&&!changed('zips')&&prompt.cue==='move')prompt.motion='toward';
  if(id==='swing'){prompt.motion='forward';if(!window.skySwing.active&&!ground){prompt.action='';prompt.cue='move';prompt.press='';prompt.title=prompt.at[0]>window.skySwing.course.bars.at(-1).at[0]?text('前入力で、向こうの足場へ','Keep moving toward the landing'):text('前入力で、次の鉄棒へ','Keep moving toward the next bar');}}
  if(id==='stomp'&&prompt.cue==='jump')prompt.motion='forward';
  if(id==='stomp'&&sky.U.autoFire)prompt.motion='stop';
  if(id==='flash'&&!ground){prompt.action='';prompt.press='';prompt.cue='wait';prompt.title=text('着地してから、閃光玉','Land before using Flash');}
  if(id==='flash'&&window.skyFlashbang.grenades.length){prompt.action='';prompt.press='';prompt.cue='wait';prompt.title=text('閃光玉が届くのを待つ','Wait for the flash to reach them');}
  if(id==='decoy'&&window.skyDecoy.active){prompt.motion='toward';prompt.action='';prompt.press='';prompt.cue='move';prompt.title=text('分身に任せて、マークへ逃げる','Leave the decoy and escape to the marker');}else if(id==='decoy')prompt.motion='stop';
  if(id==='blast'){
    if(changed('blastLaunches')){prompt.motion='stop';prompt.cue='wait';prompt.title=text('上の足場へ、着地を待つ','Wait to land on the upper roof');}
    else if(window.skyBlastBarrels.sequence){prompt.motion='stop';prompt.cue='wait';prompt.title=text('爆破ジャンプ中','Launching from the barrel');}
    else if(window.skyBlastBarrels.assistTarget()){prompt.motion='stop';prompt.title=text('赤い爆破マークをタップ','Tap the red blast marker');}
    else {prompt.motion='toward';prompt.title=text('赤い缶の近くへ','Move closer to the red barrel');prompt.hint=text('赤い爆破マークが出たらタップ','Tap the red blast marker when it appears');}
  }
  if(id==='jumpgun'){if(changed('jumpGunLaunches')){prompt.motion='forward';prompt.action='';prompt.press='';prompt.cue='move';prompt.title=text('前入力で、上の屋上へ','Keep moving toward the upper roof');}else if(!window.skyJumpGun.carrying){prompt.action='';prompt.press='';prompt.cue='move';prompt.title=text('金色のJUMPを拾う','Collect the gold JUMP');}else prompt.motion='forward';}
  if(id==='rescue'&&c.state==='hook'){prompt.action='';prompt.press='';prompt.cue='wait';prompt.title=text('退避中。着地を待つ','Escaping. Wait to land');}
  return prompt;
}
