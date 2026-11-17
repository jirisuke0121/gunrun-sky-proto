const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(width=844,height=390,coarse=true){
 const events={},style=()=>({setProperty(k,v){this[k]=v}}),root={dataset:{},style:style(),classList:{contains:()=>coarse}},app={style:style()};
 const document={body:{style:style()},documentElement:root,getElementById:()=>app,hidden:false,dispatchEvent(){},addEventListener:(k,f)=>{events[k]=f}};
 let locks=0;const orientation={type:'portrait-primary',lock(){locks++;throw Error('must not rotate the screen from an input')},addEventListener(){}};
 const window={visualViewport:{width,height,addEventListener(){}},addEventListener(){}};
 const env={window,document,screen:{orientation},navigator:{},innerWidth:width,innerHeight:height,devicePixelRatio:2,matchMedia:()=>({matches:coarse,addEventListener(){}}),requestAnimationFrame:()=>1,setTimeout:()=>1,clearTimeout(){},addEventListener(){},Event:class{},ResizeObserver:class{observe(){}}};
 vm.runInNewContext(fs.readFileSync('viewport-runtime.js','utf8'),env);
 let resets=0;const game={mode:'play',setMode(mode){this.mode=mode}};window.skyViewport.attach(game,()=>resets++);
 return {window,api:window.skyViewport,root,app,body:document.body,game,events,locks:()=>locks,resets:()=>resets};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const f=fixture();assert.equal(f.api.blocked,false);
for(let i=0;i<3;i++){
 const before=f.resets();f.game.mode='play';Object.assign(f.window.visualViewport,{width:390,height:844});f.api.sync();
 const s=f.api.snapshot();assert.equal(f.api.blocked,false);assert.equal(f.game.mode,'play');assert.equal(f.window.__VW(),844);assert.equal(f.window.__VH(),390);
 assert.equal(f.root.dataset.skyRotation,'0');assert.equal(f.root.dataset.skyPortrait,'true');assert.doesNotMatch(f.body.style.transform,/rotate/);
 near(s.scale,390/844);near(s.contentTop,(844-390*s.scale)/2);assert.ok(f.resets()>before,'resizing the displayed frame resets held input');
 const point={clientX:s.contentLeft+100*s.scale,clientY:s.contentTop+250*s.scale};near(f.window.__CX(point),100);near(f.window.__CY(point),250);
 assert.match(f.app.style['--control-inset-left'],/safe-area-inset-left/,'safe-area axes are not swapped');
 let stopped=0;const event={...point,preventDefault(){stopped++},stopImmediatePropagation(){stopped++}};
 f.events.pointerdown(event);assert.equal(stopped,0);f.events.pointerdown({...event,clientY:10});assert.equal(stopped,2,'letterbox taps do not enter gameplay');
 f.api.modeChanged('play');assert.equal(f.game.mode,'play');
 Object.assign(f.window.visualViewport,{width:844,height:390});f.api.sync();assert.equal(f.game.mode,'play');assert.equal(f.body.style.transform,'none');assert.equal(f.api.snapshot().scale,1);
}
assert.equal(f.events.click,undefined,'no trusted tap can request a native rotation');assert.equal(f.locks(),0);
f.window.visualViewport.height=350;f.api.sync();assert.equal(f.window.__VH(),350);
for(const coarse of [true,false]){const p=fixture(390,844,coarse);assert.equal(p.api.blocked,false);assert.equal(p.game.mode,'play');assert.equal(p.window.__VW(),844);assert.equal(p.window.__VH(),390);assert.equal(p.root.dataset.skyRotation,'0');}
Object.assign(f.window.visualViewport,{width:390,height:844,offsetLeft:7,offsetTop:11});f.api.sync();const s=f.api.snapshot();near(f.window.__CX({clientX:s.contentLeft+100*s.scale}),100);near(f.window.__CY({clientY:s.contentTop+250*s.scale}),250);
console.log('PASS upright landscape fit, portrait startup, continuous play, scaled input, letterbox rejection, safe areas, offset viewport and no native rotation');
