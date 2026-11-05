const assert=require('node:assert/strict'),{create,candidates,defs,STORE}=require('../context-tutorial.js');
function fixture(){let mode='play',intro=true,hook='idle',time=0;const memory=new Map();const g={c:{pos:{x:0,y:0,z:0},eye:1.6,state:'normal',onGround:true,slideCD:0,jumpBuf:0},z:{t:10,over:false,challenge:{}},keys:{},inputState:{},Et:{},Jt:[],$a:[],modeRef:()=>mode,raycast:()=>null};const stats={};const env={stats,intro:()=>intro,hookPhase:()=>hook,busy:()=>false,presentable:()=>true,usable:()=>true,wallJumpReady:()=>true,decoyReady:()=>true,flash:{charges:1,config:{radius:8},stats:{thrown:0}},decoy:{cooldown:0,active:null,stats:{used:0}}};const make=()=>create({game:g,env,storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},map:'town',show:()=>{},now:()=>time});return{g,env,stats,memory,make,setMode:v=>mode=v,setIntro:v=>intro=v,setHook:v=>hook=v,setTime:v=>time=v};}
let f=fixture();assert.equal(candidates(f.g,f.env).length,0,'idle time alone does not teach anything');
f.g.Jt=[{pos:{x:2,y:0,z:0}},{pos:{x:3,y:0,z:0}}];assert.deepEqual(candidates(f.g,f.env).map(x=>x.id),['flash','decoy']);
f.g.raycast=()=>({});assert.equal(candidates(f.g,f.env).length,0,'walls prevent false threat prompts');f.g.raycast=()=>null;
f.env.flash.charges=0;f.env.decoy.cooldown=3;f.env.rescue={available:()=>true,chooseTarget:()=>({}),charges:2};assert.deepEqual(candidates(f.g,f.env).map(x=>x.id),['rescue']);
f.env.rescue.chooseTarget=()=>null;assert.equal(candidates(f.g,f.env).length,0,'rescue needs an actual safe destination');
for(const [state,id]of [['wallrun','walljump'],['swing','swing'],['ladder','ladder']]){f.g.c.state=state;assert.equal(candidates(f.g,f.env)[0].id,id);}f.env.wallJumpReady=()=>false;f.g.c.state='wallrun';assert.equal(candidates(f.g,f.env).length,0);
f.g.c.state='normal';f.g.Jt=[];f.g.$a=[{a:[0,2,0]}];assert.equal(candidates(f.g,f.env)[0].id,'zip');f.g.c.pos.y=3;assert.equal(candidates(f.g,f.env).length,0,'do not advertise a zipline from its far/upper side');
f.g.c.pos.y=0;f.g.$a=[];f.env.slope={canStart:()=>true};assert.equal(candidates(f.g,f.env)[0].id,'slide');f.env.usable=()=>false;assert.equal(candidates(f.g,f.env).length,0,'hidden touch controls are never taught');
for(const id of Object.keys(defs)){
 f=fixture();f.g.c.state=id==='walljump'?'wallrun':id==='swing'?'swing':id==='ladder'?'ladder':'normal';
 if(['flash','decoy','rescue'].includes(id))f.g.Jt=[{pos:{x:2,y:0,z:0}},{pos:{x:3,y:0,z:0}}];
 if(id!=='flash')f.env.flash.charges=0;
 if(id==='rescue'){f.env.decoy.cooldown=3;f.env.rescue={available:()=>true,chooseTarget:()=>({}),charges:2};}
 if(id==='barrel')f.env.barrels={assistTarget:()=>({barrel:{x:1,y:0,z:0}}),sequence:null};
 if(id==='wallrun'){f.env.wallRoutes=[{at:[0,0,0],normal:[1,0],direction:[0,-1]}];f.env.wallFaceAllowed=()=>true;f.g.jn=[{type:'mono',wr:true,maxX:0}];f.g.c.yaw=0;}
 if(id==='zip')f.g.$a=[{a:[0,2,0]}];if(id==='slide')f.env.slope={canStart:()=>true};
 const t=f.make();t.beforeFrame();assert.equal(t.item.id,id);assert.ok(t.worldPaused&&t.freezePlayer);
 t.afterFrame(.1);assert.equal(t.phase,'action','a press without native success cannot complete');
 f.setMode('pause');t.beforeFrame();assert.equal(t.worldPaused,false);f.setMode('play');t.beforeFrame();assert.equal(t.phase,'action');
 const d=defs[id];if(d.stat)f.stats[d.stat]=1;else if(d.state)f.g.c.state=d.state;else if(id==='ladder')f.g.c.pos.y=.2;else if(id==='flash')f.env.flash.stats.thrown=1;else if(id==='decoy')f.env.decoy.stats.used=1;else if(id==='rescue')f.env.rescue.charges=1;else f.env.barrels.sequence={};
 t.afterFrame(.016);assert.equal(t.phase,'success',id);assert.equal(t.worldPaused,false);assert.equal(JSON.parse(f.memory.get(STORE)).town[id],true);
 f.setTime(3000);t.beforeFrame();assert.equal(t.phase,'idle');t.beforeFrame();assert.equal(t.phase,'idle','inter-guide quiet period');
}
f=fixture();f.g.c.state='ladder';const t=f.make();t.beforeFrame();f.g.keys.KeyW=true;assert.equal(t.freezePlayer,false,'native movement resumes the required player physics');f.setHook('action');f=fixture();f.setIntro(false);f.g.c.state='ladder';const ranked=f.make();ranked.beforeFrame();assert.equal(ranked.phase,'idle','ranked play unaffected');
f=fixture();f.g.c.state='ladder';f.setHook('action');const arbiter=f.make();arbiter.beforeFrame();assert.equal(arbiter.phase,'idle','no competing hook and context popups');
console.log('PASS all 10 contextual actions: spatial/LOS eligibility, unusable controls, pause, native success, persistence, spacing, arbitration and ranked isolation');
