const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const ready of [false,true]){
 let clicks=0,focus=0,frames=[],changed=0;const button={click(){clicks++},focus(){focus++}},choice={value:'normal',dispatchEvent(){changed++}};
 const window={skyStartReadiness:{ready},skyFollowCamera:{mode:'after'}},document={getElementById:id=>id==='bStart'?button:id==='challengeDifficulty'?choice:null,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('guided-intro.js','utf8').replace(/^import .*;\n/gm,''),{window,document,location:{search:'?learned=1',pathname:'/index.html'},navigator:{webdriver:false},URLSearchParams,URL,Event:class{},requestAnimationFrame:fn=>frames.push(fn)});
 if(!ready){assert.equal(focus,0);window.skyStartReadiness.ready=true;frames.shift()();}
 assert.equal(clicks,0,'returning from the course must not start without a genuine gesture');assert.equal(focus,1);assert.equal(choice.value,'easy');assert.equal(changed,1);
 button.click();assert.equal(clicks,1,'the normal start button remains usable');
}
console.log('PASS tutorial return selects Easy and waits for the actual start tap, including delayed asset readiness');
