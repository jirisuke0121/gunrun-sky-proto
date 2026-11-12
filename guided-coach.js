// Freeze at a real input opportunity. Release the gate before the same native
// event reaches the real button; never synthesize a second action.
export function installGuidedCoach({game,sky,english,active,lesson,cue}) {
  const root=document.createElement('div');root.id='learnCoach';root.hidden=true;
  root.innerHTML='<div id="learnSpotlight"></div><div id="learnCoachCopy" role="status"><small></small><b></b><p></p></div>';
  document.getElementById('app').append(root);
  let paused=null,seen=new Set(),sequence=0;
  const text=(ja,en)=>english()?en:ja;const write=(selector,value)=>{const node=root.querySelector(selector);if(node.textContent!==value)node.textContent=value;};
  function candidate(){
    const q=cue(),id=lesson();if(!q)return null;
    if(id==='move'){const touch=window.skyFollowCamera.touchDevice;return {key:'move',target:touch?'stick':'learnKeys',kind:'move',title:text('左のスティックを動かす','Move the left stick'),hint:touch?text('指を置き、進みたい方向へずらす','Touch, then drag toward where you want to move'):text('進みたい方向のキーを押す','Press the key for the direction you want to move')};}
    if(q.action&&q.press&&document.getElementById(q.action))return {key:id+':'+q.cue+':'+(id==='swing'?window.skySwing.active?.bar.id||'entry':''),target:q.action,kind:'button',title:q.title,hint:q.hint};
    if(id==='hook'&&game.P.state!=='hook'&&document.getElementById('hookMark')?.classList.contains('on'))return {key:'hook',target:'hookMark',kind:'world',title:text('ひし形をタップして、フック','Tap the diamond to hook'),hint:text('光るマークをタップすると移動します','Tap the highlighted marker to travel')};
    if(id==='blast'&&!window.skyBlastBarrels.sequence&&!(game.stats.blastLaunches>0)&&window.skyBlastBarrels.assistTarget())return {key:'blast',target:'blastMark',kind:'world',title:text('赤い爆破マークをタップ','Tap the red blast marker'),hint:text('タップすると、爆破ジャンプします','Tap to launch from the barrel')};
    return null;
  }
  function resume(){if(!paused)return;seen.add(paused.key);paused=null;sync();}
  function sync(){
    const on=!!paused&&game.mode==='play'&&active();if(root.hidden===on)root.hidden=!on;if(document.body.dataset.learnPaused!==String(on))document.body.dataset.learnPaused=String(on);
    if(!on)return;
    const el=document.getElementById(paused.target),r=el?.getBoundingClientRect(),app=document.getElementById('app').getBoundingClientRect();if(!r)return;
    const ring=root.querySelector('#learnSpotlight'),box={left:r.left-app.left-6+'px',top:r.top-app.top-6+'px',width:r.width+12+'px',height:r.height+12+'px',borderRadius:/^(stick|tJump|tSlide|tFlash|tDecoy|tRescue)$/.test(paused.target)?'50%':'14px'};for(const [k,v]of Object.entries(box))if(ring.style[k]!==v)ring.style[k]=v;
    const pc=!window.skyFollowCamera.touchDevice;
    const key={tJump:'Space',tSlide:'C',tFlash:'1',tDecoy:'2',tAutoFire:'X',tJumpGun:'Z',tRescue:'V',hookMark:'Q',blastMark:'B',stick:'W A S D',learnKeys:'W A S D'}[paused.target];
    write('small',text('一時停止 · 光る場所を操作すると再開','Paused · Use the highlighted control to resume'));
    write('b',pc&&paused.kind==='move'?text('W A S D で移動する','Move with W A S D'):paused.title);
    write('p',paused.hint+(pc&&key?'  ['+key+']':''));
  }
  function beforeFrame(){
    if(!active()||game.mode!=='play'){sync();return false;}
    if(!paused){const next=candidate();if(next&&!seen.has(next.key)){paused=next;sequence++;}}
    if(paused?.kind==='move'&&(Math.hypot(sky.inputState.x||0,sky.inputState.y||0)>.2||['KeyW','KeyA','KeyS','KeyD'].some(k=>game.keys[k])))resume();
    sync();return !!paused;
  }
  const point=e=>e.changedTouches?.[0]||e;
  const swingEntry=()=>paused?.key==='swing:jump:entry'&&game.P.onGround;
  const forwardHeld=()=>game.keys.KeyW||game.keys.ArrowUp||
    (sky.inputState.on&&sky.inputState.y<-.18);
  const pressStart=e=>['pointerdown','touchstart','mousedown'].includes(e.type);
  function prepareSwingMove(e){
    if(!swingEntry()||e.target.id!=='c'||!(e.pointerType==='touch'||e.type.startsWith('touch')))return false;
    // Use the same logical coordinates as the canvas, including portrait rotation.
    return window.__CX(point(e))<window.__VW()*.45;
  }
  function inside(e){const p=point(e),r=document.getElementById(paused.target)?.getBoundingClientRect();return r&&p.clientX>=r.left&&p.clientX<=r.right&&p.clientY>=r.top&&p.clientY<=r.bottom;}
  function intercept(e){
    if(!paused||game.mode!=='play'||!active())return;
    if(e.target.closest?.('#bSettings,#ovPause'))return;
    // Preparing the left thumb must not release the pause or synthesize a jump.
    if(prepareSwingMove(e))return;
    if(paused.kind==='move'){
      if(inside(e)||sky.inputState.on||/up|end|cancel/.test(e.type))return;
    }else if(inside(e)){
      if(pressStart(e)){
        if(swingEntry()&&!forwardHeld()){e.preventDefault();e.stopImmediatePropagation();return;}
        resume();
      }return;
    }else if(/move|up|end|cancel/.test(e.type)&&sky.inputState.on)return;
    e.preventDefault();e.stopImmediatePropagation();
  }
  for(const type of ['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','mousedown','mouseup','click'])document.addEventListener(type,intercept,{capture:true,passive:false});
  document.addEventListener('keydown',e=>{
    if(!paused||game.mode!=='play'||!active()||e.repeat)return;
    const keys={tJump:['Space'],tSlide:['KeyC'],tFlash:['Digit1'],tDecoy:['Digit2'],tAutoFire:['KeyX'],tJumpGun:['KeyZ'],tRescue:['KeyV'],hookMark:['KeyQ'],blastMark:['KeyB'],stick:['KeyW','KeyA','KeyS','KeyD'],learnKeys:['KeyW','KeyA','KeyS','KeyD']};
    if(keys[paused.target]?.includes(e.code)){
      if(swingEntry()&&!forwardHeld()){e.preventDefault();e.stopImmediatePropagation();return;}
      resume();
    }else if(!['Escape','KeyW','KeyA','KeyS','KeyD','ArrowUp'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  return {beforeFrame,sync,get blocked(){return !!paused&&game.mode==='play'&&active()},get target(){return paused?.target||null},get sequence(){return sequence},reset(){paused=null;seen=new Set();sync();}};
}
