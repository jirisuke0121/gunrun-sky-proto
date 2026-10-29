const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

(async () => {
  const { createZombieSearch } = await import('../zombie-search.js');
  for (const file of ['index.html', 'canyon.html']) {
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf('var ri=class'), end = html.indexOf('},zPM=', start);
    assert.ok(start >= 0 && end > start);
    let blocked = false, blind = false, lured = false, mode = 'play', searches = 0;
    const v = (x = 0, y = 0, z = 0) => ({ x, y, z, set(x,y,z){Object.assign(this,{x,y,z});return this;} });
    const nodes = Array.from({length:16}, (_, id) => ({ id, x:id*2, y:0, z:0 }));
    const edges=[], out=nodes.map(()=>[]);
    for(let i=0;i<nodes.length-1;i++)for(const [from,to] of [[i,i+1],[i+1,i]]){out[from].push(edges.length);edges.push({from,to,len:2,kind:0});}
    const U={senseT:4,loseSight:1,sightR:40,hearR:8,loseDelay:.6,loseSpeed:.75,zombieSpeed:3,stalkerSpeed:4,gravity:20,corpseTime:5};
    const player={pos:v(12,0,0),state:'normal',invuln:Infinity};
    const run={t:0,over:false,mission:null}, enemies=[], events=[];
    const runtime={NAV:{nodes,out,E:edges},SCR:{warn:{},pending:{}},get mode(){return mode;},nodeAt:(x)=>Math.max(0,Math.min(15,Math.round(x/2)))};
    const game={c:player,z:run,U,Jn:{},Jt:enemies,ceRef:()=>run.t,rn:()=>{},searchEvent:(...e)=>events.push(e),
      raycast:()=>blocked?{t:1}:null,searchNav:{decoyTarget:()=>lured?{x:8,y:0,z:0}:null,cost:()=>2,dropCost:()=>2,stalkerCost:()=>2,
        field:([target],cost,limit,field)=>{searches++;for(let i=0;i<field.length;i++)field[i]=Math.abs(i-target)*2;}}};
    const search=createZombieSearch(game,runtime,{blinded:()=>blind},()=>.35);
    assert.equal(U.senseT,10,'the previous four-second default migrates to ten');
    const sandbox={window:{skyZombieSearch:search,skyChallenge:{speed:(m,s)=>s},skyZombieCrawlSpeed:x=>x},
      c:player,z:run,U,Jt:enemies,lt:runtime.NAV,ce:0,sl:[],_M:()=>false,pv:()=>1,
      ge:(v,a,b)=>Math.max(a,Math.min(b,v)),Fa:(a,b)=>b,oe:()=>true,bi:()=>true,
      Dn:(e,x,y,z)=>{e.pos.x+=x;e.pos.z+=z;return{ground:true};},Tt:{groan(){},zstep(){}},wn:()=>0,
      ys:()=>blocked,Yd:()=>false,ce:0,Dd:()=>{throw Error('a lost enemy attacked through cover');}};
    const context=vm.createContext(sandbox);
    vm.runInContext(html.slice(start,end+1)+';this.Zombie=ri;',context);
    function enemy(x=0, kind={}) {
      const e=Object.assign(Object.create(context.Zombie.prototype),{pos:v(x),vel:v(),r:.3,h:1.8,hp:6,dead:false,deadT:0,stun:0,atkT:0,atkCD:0,
        act:null,onGround:true,node:0,edge:-1,navT:0,stuckT:0,sideT:0,sideDir:1,groanT:100,speedMul:1,spawnT:0,lastHitT:-99,reach:false,stepPh:0,yaw:-Math.PI/2,anim(){},...kind});
      enemies.push(e);return e;
    }
    const tick=(seconds,move=false)=>{for(let t=0;t<seconds-1e-8;t+=1/60){run.t+=1/60;sandbox.ce=run.t;
      for(const e of enemies)move?e.update(1/60):search.observe(e,1/60);search.afterStep();}};
    const a=enemy();tick(.8);assert.equal(search.state(a).phase,'chase');assert.equal(a.lost,false);
    blocked=true;tick(.3);const last=search.state(a).last;assert.equal(last.x,12);
    player.pos.x=28;tick(2.7);assert.equal(search.state(a).phase,'search');assert.equal(search.state(a).last.x,12);
    assert.ok(search.remaining>9,'all pursuers lost triggers a new ten-second respite');
    assert.equal(runtime.SCR.warn,null);assert.equal(runtime.SCR.pending,null);
    const until=run.t+search.remaining;tick(8);
    assert.equal(a.lost,true);assert.equal(search.suppressSpawns(),true);
    tick(until-run.t+.1);assert.equal(search.suppressSpawns(),false);assert.equal(a.lost,true,'expiry must not grant omniscient tracking');
    assert.equal(search.state(a).phase,'patrol');assert.equal(searches,0,'perception scans do not rebuild path fields');
    // Exercise the real map's Zombie.update and pickEdge, not a duplicate AI.
    a.pos.x=12;player.pos.x=12.8;blocked=true;tick(.5,true);
    assert.equal(a.lost,true,'close proximity behind cover is not live pursuit');
    assert.equal(a.touching(1.3),false,'walls cannot be attacked through while searching');
    assert.ok(searches>0&&searches<8,'walking uses bounded cached fields');
    const first=search.state(a).last.x;search.hearShot(22);assert.equal(search.state(a).last.x,12.8);
    player.pos.x=28;tick(.3,true);assert.equal(search.state(a).last.x,12.8,'gunshots capture a location, not continuous tracking');
    assert.notEqual(first,search.state(a).last.x);
    // Reacquisition needs sustained clear sight, and blindness blocks it.
    a.pos.x=10;a.yaw=-Math.PI/2;player.pos.x=14;blocked=false;blind=true;tick(1);assert.equal(a.lost,true);
    blind=false;tick(.2);assert.equal(a.lost,true);blocked=true;tick(.25);
    blocked=false;tick(.8);assert.equal(a.lost,false);assert.equal(search.state(a).phase,'chase');
    const oldEscape=search.stats.escapes;
    const b=enemy(8,{dropper:true,stalker:true});tick(.8);assert.equal(b.lost,false,'special pursuers use the same visual recognition');
    a.yaw=b.yaw=-Math.PI/2;blocked=true;tick(1);blocked=false;b.pos.x=12;a.pos.x=-20;a.yaw=Math.PI/2;tick(1);
    assert.equal(b.lost,false);assert.equal(search.stats.escapes,oldEscape,'one remaining pursuer prevents a false success');
    blocked=true;tick(3);assert.equal(search.stats.escapes,oldEscape+1);
    const rest=search.remaining;search.hearShot(50);assert.ok(search.remaining>=rest-.001,'noise alone does not cancel the respite');
    assert.equal(search.deferSpawn({rise:{t:-.5}}),true);
    assert.equal(search.deferSpawn({fall:{wait:.5}}),true);
    assert.equal(search.deferSpawn({rise:{t:.1}}),false,'visible emergence is allowed to finish');
    blocked=false;a.pos.x=10;a.yaw=-Math.PI/2;player.pos.x=14;tick(.8);
    assert.equal(search.state(a).phase,'chase');
    lured=true;player.pos.x=28;tick(3);
    assert.equal(search.state(a).phase,'search');assert.equal(a.lost,false,'decoy retains control of the navigation body');
    assert.equal(search.state(a).last.x,14,'decoy does not reveal the real player');
    lured=false;blocked=true;tick(.25);assert.equal(a.lost,true,'decoy expiry restores search, not live pursuit');
    assert.equal(search.state(a).last.x,14);
    mode='pause';const saved=search.remaining;search.observe(a,1);search.afterStep();assert.equal(search.remaining,saved);
    mode='play';search.reset();assert.equal(search.remaining,0);assert.equal(search.state(a),null);
    U.loseSight=0;search.observe(a,.1);assert.equal(a.lost,false);
    assert.ok(events.some(([e])=>e==='chaseEscaped'));assert.ok(events.some(([e])=>e==='zombieReacquired'));
    for(const hook of ['skyZombieSearch?.afterStep()','skyZombieSearch?.reset()','skyZombieSearch.hearShot','skyZombieSearch?.suppressSpawns()'])assert.ok(html.includes(hook),`${file}: ${hook}`);
    console.log(`PASS ${file}: real AI walking, snapshot memory, 10s search, no psychic expiry/close chase, sound, reacquisition, all-pursuer success, specials, flash, respite, reset`);
  }
})();
