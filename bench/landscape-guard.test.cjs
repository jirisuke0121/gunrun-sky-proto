const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(width=844,height=390,coarse=true){
 const events={},style=()=>({setProperty(k,v){this[k]=v}}),root={dataset:{},style:style(),classList:{contains:()=>coarse}},app={style:style()};
 const document={documentElement:root,getElementById:()=>app,hidden:false,dispatchEvent(){},addEventListener:(k,f)=>{events[k]=f}};
 let locks=0;const orientation={type:'portrait-primary',lock(){locks++;return Promise.reject(Error('unsupported in this browser'))},addEventListener(){}};
 const window={visualViewport:{width,height,addEventListener(){}},addEventListener(){}};
 const env={window,document,screen:{orientation},navigator:{},innerWidth:width,innerHeight:height,devicePixelRatio:2,matchMedia:()=>({matches:coarse,addEventListener(){}}),requestAnimationFrame:()=>1,setTimeout:()=>1,clearTimeout(){},addEventListener(){},Event:class{},ResizeObserver:class{observe(){}}};
 vm.runInNewContext(fs.readFileSync('viewport-runtime.js','utf8'),env);
 let resets=0;const game={mode:'play',setMode(mode){this.mode=mode}};window.skyViewport.attach(game,()=>resets++);
 return {window,api:window.skyViewport,root,app,game,events,locks:()=>locks,resets:()=>resets};
}
(async()=>{
 const f=fixture();assert.equal(f.api.blocked,false);
 for(let i=0;i<3;i++){
  f.game.mode='play';Object.assign(f.window.visualViewport,{width:390,height:844});f.api.sync();
  assert.equal(f.api.blocked,true);assert.equal(f.game.mode,'pause');assert.equal(f.window.__VW(),844);assert.equal(f.window.__VH(),390);
  assert.equal(f.root.dataset.skyPortrait,'true');assert.equal(f.root.style['--visible-width'],'390px');assert.equal(f.root.style['--visible-height'],'844px');
  f.game.mode='play';f.api.modeChanged('play');assert.equal(f.game.mode,'pause','cannot resume through the portrait guard');
  Object.assign(f.window.visualViewport,{width:844,height:390});f.api.sync();assert.equal(f.api.blocked,false);assert.equal(f.game.mode,'pause','rotation never silently resumes the game');
 }
 f.events.click({isTrusted:false});assert.equal(f.locks(),0);f.events.click({isTrusted:true});await new Promise(r=>setImmediate(r));assert.equal(f.locks(),1,'request platform lock only during actual input');
 f.window.visualViewport.height=350;f.api.sync();assert.equal(f.window.__VH(),350,'landscape visible-viewport changes still resize the scene');
 for(const coarse of [true,false]){const p=fixture(390,844,coarse);assert.equal(p.api.blocked,true);assert.equal(p.game.mode,'pause');assert.equal(p.window.__VW(),844);assert.equal(p.window.__VH(),390);}
 console.log('PASS landscape canvas retained, portrait launch/resume rejected, physical guard bounds, rotation recovery, desktop portrait, rejected platform lock');
})().catch(e=>{console.error(e);process.exitCode=1});
