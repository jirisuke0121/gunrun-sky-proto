const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('start-readiness.js','utf8');
function fixture(){
 const elements=new Map(),observers=[],loads=[];let mode='menu',starts=0,reloads=0;
 function element(){return{disabled:false,hidden:false,textContent:'',attrs:{},listeners:[],setAttribute(k,v){this.attrs[k]=v},addEventListener(type,fn,capture){this.listeners.push({type,fn,capture:!!capture})},click(force=false){if(this.disabled&&!force)return;const e={stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};for(const l of [...this.listeners].sort((a,b)=>Number(b.capture)-Number(a.capture))){if(l.type==='click')l.fn(e);if(e.stopped)break;}}};}
 for(const id of ['bStart','bIntro','startReadyStatus','introReadyStatus'])elements.set(id,element());
 const retry=element(),doc={readyState:'loading',body:{dataset:{}},getElementById:id=>elements.get(id),querySelectorAll:()=>[retry]};
 const win={location:{reload(){reloads++}},addEventListener(type,fn){if(type==='load')loads.push(fn)},MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}}};
 vm.runInNewContext(source,{window:win,document:doc});const api=win.installSkyStartReadiness({modeRef:()=>mode},win,doc);
 elements.get('bStart').addEventListener('click',()=>{starts++;mode='play'});
 const readyModules=()=>{win.skyHumanView={choice:'unity'};win.__skyUpgrade={loaded:{hg:false,error:''}};win.skySettings={};win.skyFollowCamera={};doc.body.dataset.skyGameExtensionsReady='true'};
 return{win,doc,api,start:elements.get('bStart'),intro:elements.get('bIntro'),retry,readyModules,change(){for(const fn of observers)fn()},load(){loads.forEach(fn=>fn())},get starts(){return starts},get mode(){return mode},get reloads(){return reloads},menu(){mode='menu'}};
}
const f=fixture();assert.equal(f.start.disabled,true);assert.equal(f.intro.disabled,true);f.start.click(true);assert.equal(f.starts,0);
f.readyModules();f.doc.body.dataset.skyHumanLoaded='true';f.change();assert.match(f.start.textContent,/銃/);assert.equal(f.start.disabled,true);
f.win.__skyUpgrade.loaded.hg=true;f.change();assert.match(f.start.textContent,/ゾンビ/);assert.equal(f.intro.disabled,true);
f.doc.body.dataset.skyZombieReady='true';f.change();assert.equal(f.api.ready,true);assert.equal(f.start.disabled,false);assert.equal(f.intro.disabled,false);assert.equal(f.start.textContent,'本番をはじめる（2分）');
f.start.click();f.start.click();assert.equal(f.starts,1,'a second tap must not restart the new run');assert.equal(f.mode,'play');
f.menu();f.win.skyPracticeMode=true;f.change();assert.equal(f.start.textContent,'練習をはじめる');
f.win.skyHumanView.choice='existing';f.change();assert.equal(f.api.state.phase,'error');assert.equal(f.start.disabled,true);assert.equal(f.start.attrs['aria-busy'],'false');assert.equal(f.retry.hidden,false);f.retry.click();assert.equal(f.reloads,1);
f.win.skyHumanView.choice='unity';f.win.__skyUpgrade.loaded.hg=false;f.win.__skyUpgrade.loaded.error='hg: HTTP 404';f.change();assert.match(f.api.state.message,/銃/);assert.equal(f.start.disabled,true);
f.win.__skyUpgrade.loaded.hg=true;f.change();assert.equal(f.api.ready,true);assert.equal(f.retry.hidden,true);
const missing=fixture();missing.load();assert.equal(missing.api.state.phase,'error','failed deferred module cannot look ready or wait forever');assert.equal(missing.retry.hidden,false);
console.log('PASS independent load order, disabled buttons and defensive click, duplicate tap, practice label, model/module failures and reload recovery');
