// Explain the native actions without choosing targets, spending items or moving the player.
export function installPlayerClarity(sky,game) {
  const $=id=>document.getElementById(id), tr=text=>window.skyI18n?.tr(text)||text;
  const write=(node,text)=>{text=tr(text);if(node&&node.textContent!==text)node.textContent=text;};
  const make=(id,parent,cls='')=>{const node=document.createElement('div');node.id=id;node.className=cls;parent.append(node);return node;};
  const role=make('runResponsibility',$('hud'));
  const gun=make('gunState',$('tAutoFire'));
  $('tAutoFire').setAttribute('aria-describedby','gunState');
  const feedback=make('actionFeedback',$('skillDock'));
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const supplies=make('supplyFeedback',$('hud'));
  supplies.setAttribute('role','status');
  const mark=make('markAction',$('markMark'));
  let explanation=null,supply=null,lastFrame=-Infinity,lastClock=0,lastReached=game.MARK?.reached||0;
  const playing=()=>sky.modeRef()==='play'&&!sky.z.over&&!sky.demoActive();
  const responsibility=()=>!sky.U.gunOn?'移動・逃げ道選びは自分で。銃は装備していません。'
    :sky.U.autoFire&&sky.U.aimAuto?'移動・逃げ道選びは自分で。銃は自動で狙い撃ちます。'
    :sky.U.autoFire?'移動・逃げ道選びと照準は自分で。敵に向けると自動射撃。'
    :'移動・逃げ道選びは自分で。自動射撃は停止中です。';
  function gunText(){
    const {Et,U,c}=sky;
    const blocked=sky.gunBlockReason?.();
    if(blocked==='reload')return `装填中 · あと${Et.reloadT.toFixed(1)}秒`;
    if(blocked==='door')return 'ドアを開けている間は撃てません';
    if(blocked==='bite')return 'つかまれ中 · 振りほどくと射撃再開';
    if(blocked==='movement')return '移動技の終了後に射撃再開';
    if(blocked==='ladder')return 'はしご中は撃てません';
    if(blocked==='swing')return '鉄棒を離すと射撃再開';
    if(blocked==='ledge')return '縁を登り終えると射撃再開';
    if(Et.ammo<=0)return U.reserveAmmo>=99||Et.reserve>0?'弾切れ · 自動装填を待とう':'弾切れ · 光る武器箱で補給';
    if(!U.autoFire)return window.skyFollowCamera?.touchDevice?'停止中 · 押すと再開':'停止中 · Xキーで再開';
    if(!U.aimAuto)return '照準は自分で · 敵に向けると射撃';
    const target=sky.aimLock?.();
    return target&&!target.dead&&!target.remove?'自動照準・射撃ON':'撃てる敵を待機中';
  }
  function explain(id,text){
    if(!playing()||!text)return;
    explanation={id,text,until:sky.z.t+2.8};render();
  }
  function supplyNotice(text){supply={text,until:sky.z.t+4};render();}
  function skill(id,text){
    const button=$(id);if(!button)return;
    let label=button.querySelector('[data-action-state]');
    if(!label){label=document.createElement('small');label.dataset.actionState='';button.append(label);}
    write(label,text);
  }
  function render(){
    const on=playing(),clock=sky.z.t;
    if(clock<lastClock||sky.modeRef()==='menu'){explanation=supply=null;lastReached=game.MARK?.reached||0;}
    lastClock=clock;
    role.hidden=!on||clock>=8||!!window.skyPracticeMode||!!sky.z.mission;
    write(role,responsibility());
    const home=document.querySelector('.home-scene-copy p');if(home)write(home,responsibility());
    if(gun.parentElement!==$('tAutoFire'))$('tAutoFire').append(gun);
    gun.hidden=!on||!sky.U.gunOn||!!sky.wpc().jumpGun;
    if(!gun.hidden){write(gun,gunText());gun.dataset.empty=String(sky.Et.ammo<=0&&sky.U.reserveAmmo<99&&sky.Et.reserve<=0);}
    const decoy=window.skyDecoy;
    if(decoy)skill('tDecoy',decoy.active?'発動中':decoy.cooldown>0?'再使用待ち':'追手を引きつける');
    const rescue=window.skyRescue;
    if(rescue)skill('tRescue',rescue.charges<=0?'残り0回':!rescue.available()?'移動終了を待つ':'高台へ自動退避');
    feedback.hidden=!on||!explanation||clock>=explanation.until;
    if(!feedback.hidden){write(feedback,explanation.text);feedback.dataset.action=explanation.id;}
    for(const id of ['tFlash','tDecoy','tRescue'])if($(id))$(id).dataset.reasonShown=String(!feedback.hidden&&explanation.id===id);
    supplies.hidden=!on||!supply||clock>=supply.until;
    if(!supplies.hidden)write(supplies,supply.text);
    document.body.dataset.supplyFeedback=String(!supplies.hidden);
    const route=on&&!sky.z.mission&&!window.skyPracticeMode;
    mark.hidden=!route;write(mark,'逃げ道の候補 · 光の輪に近づくだけ');
    if(route&&game.MARK.reached>lastReached&&(!supply||clock>=supply.until))supply={text:'目印に到着 · 別の足場へ進んで追手を離そう',until:clock+4};
    lastReached=game.MARK?.reached||0;
  }
  // No simulation clocks or action gates are changed by this presentation loop.
  function frame(now){if(now-lastFrame>=80){lastFrame=now;render();}requestAnimationFrame(frame);}
  window.skyPlayerClarity={explain,supplyNotice,responsibility,gunText,render};
  render();requestAnimationFrame(frame);
}
