const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const preferences=fs.readFileSync('guided-preferences.js','utf8');
function route(search='',saved={},touch=true,map='index.html'){
 const store=new Map(Object.entries(saved)),location={href:'https://fixture.test/'+map+search,replace(url){this.next=String(url)}};
 vm.runInNewContext(preferences,{location,URL,URLSearchParams,localStorage:{getItem:k=>store.get(k)||null,removeItem:k=>store.delete(k)},matchMedia:q=>({matches:q.includes('coarse')?touch:!touch}),navigator:{language:'ja-JP'}});
 return{location,store,next:location.next&&new URL(location.next)};
}
for(const touch of[false,true])for(const mode of['before','after']){
 const saved={'gunrun-fixed-controls-v1':'1','gunrun-follow-camera-v1':mode,'gunrun-pc-camera-v1':mode};
 const r=route('',saved,touch);assert.equal(new URL(r.location.href).searchParams.has('cameraTrial'),false);
 assert.equal(r.store.has('gunrun-fixed-controls-v1'),false);assert.equal(r.store.get('gunrun-follow-camera-v1'),mode);assert.equal(r.store.get('gunrun-pc-camera-v1'),mode);
}
for(const trial of['','follow','follow-legacy','fixed','hybrid'])for(const map of['index.html','canyon.html']){
 const r=route('?guidedEntry=1&onboarding=reset&camera=after'+(trial?'&cameraTrial='+trial:''),{},true,map);
 assert.equal(r.next.pathname,'/canyon.html');assert.equal(r.next.searchParams.get('cameraTrial'),trial||null);
 assert.equal(r.next.searchParams.get('camera'),'after');assert.equal(r.next.searchParams.get('return'),map==='index.html'?'town':'canyon');
}
const source=fs.readFileSync('guided-intro.js','utf8').replace(/^import .*;\n/gm,'');
for(const trial of['','follow','follow-legacy','fixed','hybrid']){
 let clicked;const location={href:'https://fixture.test/index.html?camera=after'+(trial?'&cameraTrial='+trial:''),get search(){return new URL(this.href).search},get pathname(){return new URL(this.href).pathname},assign(url){this.next=String(url)}};
 const window={skyFollowCamera:{mode:'after'}},document={addEventListener(type,fn){if(type==='click')clicked=fn},getElementById(){return null}};
 vm.runInNewContext(source,{window,document,location,URL,URLSearchParams,navigator:{webdriver:false},localStorage:{getItem(){return null}},});
 clicked({target:{closest:()=>({id:'bGuidedIntro',disabled:false})},preventDefault(){},stopImmediatePropagation(){}});
 const next=new URL(location.next);assert.equal(next.searchParams.get('cameraTrial'),trial||null);assert.equal(next.searchParams.get('camera'),'after');
}
console.log('PASS automatic-follow routing: obsolete fixed preference removed, modes retained, normal/tutorial entry and explicit comparisons preserved');
