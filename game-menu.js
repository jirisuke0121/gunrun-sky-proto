// The same settings panel is available before a run and during play.
const game=window.__skyInternals;
const button=document.getElementById('bSettings');
const panel=document.getElementById('ovPause');
const heading=panel.querySelector('h2');
const resume=document.getElementById('bResume');
const restart=document.getElementById('bRestart');
let lastMode=game.modeRef(),returnMode='play';
function modeChanged(mode) {
  if(mode==='pause' && lastMode!=='pause')returnMode=lastMode==='menu'?'menu':'play';
  lastMode=mode;
  const pre=mode==='pause' && returnMode==='menu';
  heading.textContent=pre?'プレイ前の調整':'一時停止・調整';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label',heading.textContent);
  resume.textContent=pre?'ホームに戻る':'つづける';
  restart.hidden=pre;
  document.getElementById('bMenu').hidden=pre;
  document.getElementById('hud').hidden=mode==='menu'||pre;
  button.hidden=!['menu','play','pause'].includes(mode);
  button.setAttribute('aria-expanded',String(mode==='pause'));
  button.setAttribute('aria-label',mode==='pause'?'調整を閉じる':'メニュー・調整を開く');
  document.body.dataset.skySettings=JSON.stringify({mode,open:mode==='pause',returnMode});
}
function close() {
  if(returnMode==='play'){game.Ed();document.getElementById('c').focus();}
  else{game.An('menu');button.focus();}
}
button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();});
button.addEventListener('pointerup',event=>event.stopPropagation());
button.addEventListener('click',event=>{
  event.stopPropagation();
  if(game.modeRef()==='pause'){close();return;}
  document.exitPointerLock?.();
  game.An('pause');panel.scrollTop=0;resume.focus();
});
resume.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();close();},true);
window.addEventListener('keydown',event=>{
  if(event.code==='Escape' && game.modeRef()==='pause' && returnMode==='menu'){
    event.preventDefault();event.stopImmediatePropagation();close();
  }
},true);
window.skySettings={modeChanged,get beforeRun(){return lastMode==='pause' && returnMode==='menu';}};
modeChanged(lastMode);
