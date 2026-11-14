// One paused choice screen; trying a control style is optional.
export function installGuidedChoice({game,sky,english,clearInput,adopt,reset,exit}) {
  const root=document.createElement('section');root.id='learnChoice';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','learnChoiceTitle');
  root.innerHTML=`<div class="learn-choice-panel"><header><div><h2 id="learnChoiceTitle"></h2><p id="learnChoiceHelp"></p></div><button id="learnChoiceExit" type="button"></button></header><div class="learn-choice-cards">${['after','before'].map(mode=>`<article data-choice="${mode}"><h3></h3><button class="learn-preview" data-learn-mode="${mode}" type="button"><img alt=""><span class="mini-stick" aria-hidden="true"><i></i></span><span class="mini-jump" aria-hidden="true"></span><span class="mini-look" aria-hidden="true">↔<small></small></span><span class="mini-fixed" aria-hidden="true"></span><span class="mini-try"></span></button><p class="learn-choice-fact"></p><button class="learn-adopt" data-learn-adopt="${mode}" type="button"></button></article>`).join('')}</div></div>`;
  document.getElementById('app').append(root);
  let phase='choose',ready=false,copyKey='',pictures=false;
  const tr=(ja,en)=>english()?en:ja;
  function copy(){
    const touch=window.skyFollowCamera.touchDevice,key=String(english())+touch;if(key===copyKey)return;copyKey=key;
    root.querySelector('h2').textContent=tr('操作を選ぶ','Choose your controls');
    root.querySelector('#learnChoiceHelp').textContent=tr('そのまま選べます。画面をタップすると試せます。','Choose now, or tap a picture to try it.');
    root.querySelector('#learnChoiceExit').textContent=tr('ホーム','Home');
    for(const a of root.querySelectorAll('article')){
      const fixed=a.dataset.choice==='after';
      const automaticOnly=new URLSearchParams(location.search).get('cameraTrial')!=='follow-legacy';
      const title=fixed?(automaticOnly?tr('視点操作なし','No camera input'):tr('カメラに任せる','Automatic follow')):tr('自分で視点操作','Control the view');
      a.querySelector('h3').textContent=title;
      const preview=a.querySelector('.learn-preview');preview.setAttribute('aria-label',title+tr('を試す',' — try'));preview.querySelector('img').alt=title+tr('の実際のゲーム画面',' in the actual game');
      a.querySelector('.mini-jump').textContent=tr('ジャンプ','Jump');
      const fixedView=['fixed','hybrid'].includes(new URLSearchParams(location.search).get('cameraTrial'));
      a.querySelector('.mini-fixed').textContent=fixedView?tr('視点は固定','View stays fixed'):tr('視点は自動','Automatic view');
      a.querySelector('.mini-look small').textContent=tr(touch?'右で見回す':'マウスで見回す',touch?'Drag to look':'Mouse to look');
      a.querySelector('.mini-try').textContent=tr('画面をタップして試す','Tap the picture to try');
      a.querySelector('.learn-choice-fact').textContent=fixed?tr(touch?'左で移動・ボタンでジャンプ':'WASDで移動・Spaceでジャンプ',touch?'Left: move · Button: jump':'WASD: move · Space: jump'):tr(touch?'左で移動・右で視点・ボタンでジャンプ':'WASDで移動・マウスで視点・Spaceでジャンプ',touch?'Left: move · Right: look · Button: jump':'WASD: move · Mouse: look · Space: jump');
      a.querySelector('.learn-adopt').textContent=tr('この操作にする','Use these controls');
    }
  }
  function capture(){
    if(pictures)return;const fc=window.skyFollowCamera,mode=fc.mode;
    for(const m of ['after','before']){
      fc.setMode(m,false);for(let i=0;i<60;i++)game.cam(1/60);window.skyHumanView?.update(0);
      game.debug.renderer.clear();game.debug.renderer.render(sky.ue,sky.Se);
      root.querySelector(`[data-choice="${m}"] img`).src=game.debug.renderer.domElement.toDataURL('image/jpeg',.82);
    }
    fc.setMode(mode,false);for(let i=0;i<60;i++)game.cam(1/60);pictures=true;
  }
  function show(){clearInput();document.exitPointerLock?.();phase='choose';sync();}
  function sync(){copy();const hidden=!ready||game.mode!=='play'||phase!=='choose';if(root.hidden!==hidden)root.hidden=hidden;if(document.body.dataset.learnChoice!==phase)document.body.dataset.learnChoice=phase;}
  for(const button of root.querySelectorAll('[data-learn-mode]'))button.onclick=()=>{
    clearInput();reset();window.skyFollowCamera.setMode(button.dataset.learnMode,false);phase='try';sync();document.getElementById('c').focus();
  };
  // After the pick, a picture of the controls (controls-guide.js) comes first; "Got it" starts the course.
  const proceed=mode=>window.skyControlsGuide?window.skyControlsGuide.show(mode,adopt):adopt();
  for(const button of root.querySelectorAll('[data-learn-adopt]'))button.onclick=()=>{
    clearInput();window.skyFollowCamera.setMode(button.dataset.learnAdopt,false);phase='done';sync();proceed(button.dataset.learnAdopt);
  };
  root.querySelector('#learnChoiceExit').onclick=exit;
  for(const type of ['pointerdown','pointerup','touchstart','touchend'])root.addEventListener(type,e=>e.stopPropagation());
  return {get phase(){return phase},get blocked(){return ready&&phase==='choose'},start(){ready=true;capture();sync();},sync,show,confirm(){phase='done';sync();proceed(window.skyFollowCamera.mode);}};
}
