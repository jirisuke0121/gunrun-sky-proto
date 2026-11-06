// Restore the chosen control family, and send first visits straight to the live trial.
(() => {
 const u=new URL(location.href),q=u.searchParams;
 const read=k=>{try{return localStorage.getItem(k)}catch{return null}};
 if(!q.has('cameraTrial')&&read('gunrun-fixed-controls-v1')==='1'){
  q.set('cameraTrial','fixed');history.replaceState(history.state,'',u.href);
 }
 if(navigator.webdriver&&q.get('guidedEntry')!=='1')return;
 if(['learn','learned','practice','ownerReplay','replay','qa','dev','oldtown_swing'].some(k=>q.has(k)))return;
 const traces=['gunrun-onboarding-v1','gunrun-name','gunrun-run-history-v1','gunrun-run-outbox-v1','gunrun-challenge-difficulty-v1','gunrun-follow-camera-v1','gunrun-pc-camera-v1'];
 if(!['1','reset'].includes(q.get('onboarding'))&&traces.some(k=>read(k)))return;
 const touch=matchMedia('(pointer:coarse)').matches&&!matchMedia('(pointer:fine)').matches;
 const camera=q.get('camera')||read(touch?'gunrun-follow-camera-v1':'gunrun-pc-camera-v1')||(touch?'after':'before');
 const lang=q.get('lang')||read('sky.lang')||((navigator.language||'').toLowerCase().startsWith('ja')?'ja':'en');
 const next=new URL('canyon.html',u);next.search=new URLSearchParams({learn:'1',cameraTrial:'fixed',camera,lang,controlpick:'0',guides:'0',hookGuide:'0',return:u.pathname.endsWith('canyon.html')?'canyon':'town'});
 location.replace(next.href);
})();
