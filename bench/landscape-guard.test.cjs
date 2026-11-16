const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(width=844,height=390,coarse=true){
 const events={},style=()=>({setProperty(k,v){this[k]=v}}),root={dataset:{},style:style(),classList:{contains:()=>coarse}},app={style:style()};
 const document={body:{style:style()},documentElement:root,getElementById:()=>app,hidden:false,dispatchEvent(){},addEventListener:(k,f)=>{events[k]=f}};
 let locks=0;const orientation={type:'portrait-primary',lock(){locks++;return Promise.reject(Error('unsupported in this browser'))},addEventListener(){}};
 const window={visualViewport:{width,height,addEventListener(){}},addEventListener(){}};
 const env={window,document,screen:{orientation},navigator:{},innerWidth:width,innerHeight:height,devicePixelRatio:2,matchMedia:()=>({matches:coarse,addEventListener(){}}),requestAnimationFrame:()=>1,setTimeout:()=>1,clearTimeout(){},addEventListener(){},Event:class{},ResizeObserver:class{observe(){}}};
 vm.runInNewContext(fs.readFileSync('viewport-runtime.js','utf8'),env);
 let resets=0;const game={mode:'play',setMode(mode){this.mode=mode}};window.skyViewport.attach(game,()=>resets++);
 return {window,api:window.skyViewport,root,app,body:document.body,game,events,locks:()=>locks,resets:()=>resets};
}
(async()=>{
 const f=fixture();assert.equal(f.api.blocked,false);
 for(let i=0;i<3;i++){
  f.game.mode='play';Object.assign(f.window.visualViewport,{width:390,height:844});f.api.sync();
  assert.equal(f.api.blocked,false);assert.equal(f.game.mode,'play');assert.equal(f.window.__VW(),844);assert.equal(f.window.__VH(),390);
  assert.equal(f.root.dataset.skyRotation,'1');assert.match(f.body.style.transform,/rotate\(90deg\)/);
  assert.equal(f.window.__CX({clientX:140,clientY:100}),100);assert.equal(f.window.__CY({clientX:140,clientY:100}),250);
  assert.equal(f.app.style['--control-inset-left'],'env(safe-area-inset-top)');
  f.api.modeChanged('play');assert.equal(f.game.mode,'play');
  Object.assign(f.window.visualViewport,{width:844,height:390});f.api.sync();assert.equal(f.game.mode,'play');assert.equal(f.body.style.transform,'none');
 }
 f.events.click({isTrusted:false});assert.equal(f.locks(),0);f.events.click({isTrusted:true});await new Promise(r=>setImmediate(r));assert.equal(f.locks(),1);
 f.window.visualViewport.height=350;f.api.sync();assert.equal(f.window.__VH(),350);
 for(const coarse of [true,false]){const p=fixture(390,844,coarse);assert.equal(p.api.blocked,false);assert.equal(p.game.mode,'play');assert.equal(p.window.__VW(),844);assert.equal(p.window.__VH(),390);}
 Object.assign(f.window.visualViewport,{width:390,height:844,offsetLeft:7,offsetTop:11});f.api.sync();assert.equal(f.window.__CX({clientX:147,clientY:111}),100);assert.equal(f.window.__CY({clientX:147,clientY:111}),250);
 console.log('PASS landscape rotation, continuous play, inverse touch coordinates, safe area mapping, offset viewport, rejected native lock');
})().catch(e=>{console.error(e);process.exitCode=1});
