const $=id=>document.getElementById(id),frame=$('game');
const names={legacy:'以前の探索',current:'現行の探索',shadow:'以前の探索・影なし',resolution:'以前の探索・倍率50%',after:'以前の探索・後'};
let cancelled=false,running=false,result=null,trial=0,invalidated=null;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const status=text=>{$('status').textContent=text};
const round=n=>Math.round(n*1000)/1000;
function instrument(source,base){
  const begin=source.indexOf('function so(n,t,e,i){'),end=source.indexOf('var c={pos:',begin);
  if(begin<0||end<0)throw Error('対応する探索処理が見つかりません');
  const search=source.slice(begin,end);
  if(!search.includes('f=Math.fround(r+t(l));'))throw Error('探索修正が入ったゲームを読み込めませんでした');
  const current=search.replace('function so(','function benchCurrent(');
  const legacy=search.replace('function so(','function benchLegacy(').replace('f=Math.fround(r+t(l));','f=r+t(l);');
  const wrapper='function so(...args){const t=performance.now();try{return(window.__benchPolicy==="current"?benchCurrent:benchLegacy)(...args)}finally{window.__benchSearch?.(performance.now()-t)}}';
  source=source.slice(0,begin)+current+legacy+wrapper+source.slice(end);
  source=source.replace('window.__skyInternals={','window.__skyInternals={bench:{models:()=>zMeshy,nodeFor:dn},');
  source=source.replace(/RECORD_URL="[^"]*"/,'RECORD_URL=""');
  // Keep all experiment storage inside the iframe; block record/ranking traffic.
  const init=`window.__hold=true;const memoryStorage=()=>{const m=new Map;return{getItem:k=>m.get(String(k))??null,setItem:(k,v)=>m.set(String(k),String(v)),removeItem:k=>m.delete(String(k)),clear:()=>m.clear(),key:n=>[...m.keys()][n]??null,get length(){return m.size}}};Object.defineProperty(window,'localStorage',{value:memoryStorage()});Object.defineProperty(window,'sessionStorage',{value:memoryStorage()});const originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>new URL(typeof url==='string'?url:url.url,${JSON.stringify(base)}).origin===${JSON.stringify(new URL(base).origin)}?originalFetch(url,options):Promise.resolve(new Response('{}',{status:403}));`;
  return source.replace('<head>','<head><base href="'+base+'"><script>'+init+'<\/script>');
}
async function load(source,condition){
  const previous=frame.contentWindow?.__game?.debug?.renderer;
  if(previous){previous.dispose();previous.getContext().getExtension('WEBGL_lose_context')?.loseContext()}
  const token=++trial;
  frame.srcdoc=source.replace('<head>','<head><script>window.__benchTrial='+token+';<\/script>');
  const until=performance.now()+60000;
  while(performance.now()<until){
    if(cancelled)throw Error('中止しました');
    const w=frame.contentWindow,i=w?.__skyInternals;
    if(w?.__benchTrial===token&&i?.bench?.models().length>=4&&w.__staticMerge&&w.__skyUpgrade?.loaded?.mg&&!w.document.getElementById('bStart').disabled){
      w.__benchPolicy=condition==='current'?'current':'legacy';return w;
    }
    await pause(100);
  }
  throw Error('ゲームの読み込みが完了しませんでした');
}
function setup(w,condition){
  const g=w.__game,r=g.debug.renderer;let seed=0x68ab1204;
  w.Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  Object.assign(g.S,{weapon:3,gunOn:true,aimAuto:false,aimAssist:false,autoFire:false,sendLog:false,showBody:true,maxZombies:10,stalkerOn:false});
  w.document.getElementById('bStart').click();for(let n=0;g.zombies.length<10&&n<40;n++)g.spawnZombie(30);
  if(g.mode!=='play'||g.zombies.length!==10)throw Error('敵10体を配置できませんでした');
  const positions=[[7,-1],[8,2],[9,5],[10,8],[12,0],[11,4],[13,7],[15,1],[16,6],[14,9]];
  g.zombies.forEach((z,n)=>{z.pos.set(positions[n][0],.05,positions[n][1]);z.hp=100000;z.m.root.position.copy(z.pos)});
  g.SCR.off=true;g.PACE.off=true;g.MARK.off=true;g.GAME.spawnT=1e9;
  if(condition==='shadow'){r.shadowMap.enabled=false;w.__skyInternals.ue.traverse(o=>{if(o.isLight)o.castShadow=false;if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true})}
  if(condition==='resolution')r.setPixelRatio(r.getPixelRatio()*.5);
  const gl=r.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
  return{buffer:[r.domElement.width,r.domElement.height],pixelRatio:r.getPixelRatio(),css:[w.innerWidth,w.innerHeight],gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
}
async function segment(w,seconds){
  const g=w.__game,i=w.__skyInternals,r=g.debug.renderer,frames=[],size=[r.domElement.width,r.domElement.height];let first=null,previous=null,nextShot=0,shots=0,index=0,current=null;
  w.__benchSearch=ms=>{if(current)current.searchMs+=ms};
  return await new Promise(resolve=>{
    function step(now){
      if(first===null){first=now;previous=now}
      const t=(now-first)/1000,ms=now-previous,dt=Math.min(.05,Math.max(.001,ms/1000));previous=now;
      const invalid=cancelled?'中止':invalidated||((document.hidden||w.document.hidden)?'タブ移動':r.domElement.width!==size[0]||r.domElement.height!==size[1]?'画面サイズ変更':g.mode!=='play'?'ゲーム状態変更':null);
      if(invalid||t>=seconds){w.__benchSearch=null;resolve({frames,shots,invalid,elapsed:t});return}
      current={ms:round(ms),searchMs:0};
      g.P.pos.set(1.25,8.05,4+Math.sin(t*Math.PI/5)*5);g.P.vel.set(0,0,Math.cos(t*Math.PI/5)*Math.PI);
      Object.assign(g.P,{yaw:-Math.PI/2,pitch:-.70,life:3,shake:0,state:'normal',onGround:true});g.P.node=i.bench.nodeFor(g.P.pos.x,g.P.pos.y+.1,g.P.pos.z);g.GAME.t=5;g.G.recoil=0;
      for(const z of g.zombies)z.hp=100000;
      const before=g.stats.shots||0;
      if(t>=nextShot){g.G.ammo=g.G.mag;g.G.reloadT=0;g.G.fireCD=0;g.fire();nextShot+=.105}
      shots+=(g.stats.shots||0)-before;r.shadowMap.needsUpdate=(index++%2)===0;
      const start=performance.now();g.frameOnce(dt);current.cpuMs=round(performance.now()-start);current.searchMs=round(current.searchMs);current.enemies=g.zombies.length;
      if(ms>0)frames.push(current);current=null;requestAnimationFrame(step);
    }requestAnimationFrame(step);
  });
}
function summarize(part,seconds){
  const a=part.frames,intervals=a.map(f=>f.ms).sort((a,b)=>a-b),avg=key=>a.reduce((n,f)=>n+(f[key]||0),0)/a.length;
  return{fps:round(1000/avg('ms')),p99:intervals[Math.floor(intervals.length*.99)],over50:round(100*intervals.filter(n=>n>50).length/intervals.length),searchMs:round(avg('searchMs')),cpuMs:round(avg('cpuMs')),shots:part.shots,invalid:part.invalid||(a.some(f=>f.enemies!==10)?'敵数変更':part.shots<seconds/.105*.85?'発射数不足':null)};
}
async function run(){
  if(running)return;
  if(navigator.maxTouchPoints>0&&innerHeight>innerWidth){status('iPhoneを横向きにしてから開始してください');return}
  running=true;cancelled=false;invalidated=null;$('start').disabled=true;$('export').disabled=true;$('rows').replaceChildren();document.body.classList.add('running');
  const seconds=Number($('duration').value),repeats=Number($('repeats').value),base=new URL('../',location.href).href;
  result={schema:1,build:'2026-10-26-distance-rounding-v1',createdAt:new Date().toISOString(),userAgent:navigator.userAgent,seconds,repeats,notes:['Synthetic traversal, 10 zombies, MG reload omitted, game time held at 5 seconds.','Only current condition uses the fixed search; the other conditions use the previous search.','No benchmark record or score is sent or saved outside this result.'],trials:[]};
  try{
    status('ゲームを読み込み中');const response=await fetch(new URL('canyon.html',base),{cache:'no-store'});if(!response.ok)throw Error('ゲームを取得できませんでした');const source=instrument(await response.text(),base);
    for(let repeat=1;repeat<=repeats;repeat++)for(const condition of ['legacy','current','shadow','resolution','after']){
      if(cancelled)throw Error('中止しました');status(`${repeat}/${repeats}組・${names[condition]}を読み込み中`);
      const w=await load(source,condition),fixture=setup(w,condition);
      status(`${repeat}/${repeats}組・${names[condition]}の準備`);const warmup=await segment(w,2);if(warmup.invalid)throw Error(warmup.invalid);
      status(`${repeat}/${repeats}組・${names[condition]}を${seconds}秒測定中`);const part=await segment(w,seconds),summary=summarize(part,seconds);
      result.trials.push({repeat,condition,fixture,summary,...part});const row=document.createElement('tr');
      for(const value of [`${repeat}・${names[condition]}`,summary.invalid?'無効: '+summary.invalid:summary.fps,summary.p99,summary.over50,summary.searchMs,summary.shots]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell)}$('rows').append(row);
      if(summary.invalid)throw Error(summary.invalid);
    }
    status('計測完了。結果JSONを保存してください');
  }catch(error){status(String(error.message||error));result.error=String(error.message||error)}
  finally{running=false;document.body.classList.remove('running');$('start').disabled=false;$('export').disabled=!result.trials.length;window.__pathBenchmarkResult=result;const r=frame.contentWindow?.__game?.debug?.renderer;if(r){r.dispose();r.getContext().getExtension('WEBGL_lose_context')?.loseContext()}frame.srcdoc='';}
}
$('start').addEventListener('click',run);$('stop').addEventListener('click',()=>{cancelled=true;status('中止しています')});
document.addEventListener('visibilitychange',()=>{if(running&&document.hidden)invalidated='タブ移動'});
window.addEventListener('resize',()=>{if(running)invalidated='画面サイズ変更'});
$('export').addEventListener('click',()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='gunrun-path-performance-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)});
