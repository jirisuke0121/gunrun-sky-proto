// tools/admin/index.html の「画面を使わない処理」だけを取り出して検査する。
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('tools/admin/index.html','utf8');
const a=html.indexOf('/*extract:start*/'),b=html.indexOf('/*extract:end*/');
assert.ok(a>0&&b>a,'extract markers exist');
const ctx={};vm.createContext(ctx);
vm.runInContext(html.slice(a,b)+'\nthis.api={extract,fromAny,causeCounts,stuckRows,fmtTime,esc,causeName,mapOf,CAUSE};',ctx);
const {extract,fromAny,causeCounts,stuckRows,fmtTime,esc,causeName,mapOf,CAUSE}=ctx.api;
const plain=v=>JSON.parse(JSON.stringify(v));// values made inside the vm have another Array/Object prototype

// --- 被弾・落下・死亡 --------------------------------------------------------------------
const run=(o={})=>({clientRunId:'run-aaaa-1111',build:'2026-11-03-nav-watch-v1',at:'2026-11-03T10:00:00.000Z',challenge:{id:'hard'},reason:'caught',t:95,mapKey:'old-town',...o});
const hit=(life,at=[10,4.2,-3])=>({k:'hit',t:30,at,life,place:'西の広場',state:'run',nearest:1.2,near9:4});
let r=extract([run({mistakes:[hit(1),{k:'fall',t:50,at:[0,9,0],life:0}]})]);
assert.equal(r.runs.length,1);assert.equal(r.points.length,2);
assert.equal(r.points[0].type,'hit');assert.equal(r.points[1].type,'death','the last life lost to a fall is a death');
assert.equal(r.points[1].cause,'fall');
r=extract([run({reason:'time',mistakes:[hit(0)]})]);assert.equal(r.points[0].type,'hit','life 0 but the run was survived: not a death');
// 除外：入門、-dev、壊れた点
r=extract([run({challenge:{id:'intro'},mistakes:[hit(1)]}),run({build:'2026-11-03-x-dev',mistakes:[hit(1)]}),null,'x',
  run({mistakes:[{k:'hit',at:[1,2]},{k:'hit',at:[1,NaN,3]},{k:'zzz',at:[1,2,3]},hit(1)]})]);
assert.equal(r.runs.length,1);assert.equal(r.points.length,1,'intro, -dev and malformed points are dropped');
assert.equal(mapOf({mapKey:'rock-canyon'}),'rock-canyon');assert.equal(mapOf({map:{id:'rock_canyon_v1'}}),'rock-canyon');assert.equal(mapOf({}),'old-town');

// --- 詰まり ---------------------------------------------------------------------------------
const stuck=(cause,t,over={})=>({t,cause,n:3,nav:0,player:{p:[-22.5,6.7,1.3],now:-1,kept:12,keptAt:[-30,11.9,1]},targets:[[-30,11.9,1]],
  zombies:[{p:[-30,11.9,1],node:5,f:0,edge:-1},{p:[-29,11.9,1.2],node:6,f:null,edge:3},{p:[1,1,1],node:7,f:2,edge:1},{p:[2,2,2],node:8,f:2,edge:1}],...over});
r=extract([run({diagnostics:{stuck:[stuck('player-no-node',40),stuck('no-route',70,{n:1}),{t:1,cause:'x'},null,stuck(123,80)]}})]);
const s=r.points.filter(p=>p.type==='stuck');
assert.equal(s.length,3,'entries without a player position (and null) are dropped');
assert.deepEqual([s[0].x,s[0].y,s[0].z],[-22.5,6.7,1.3],'the point is where the player stood');
assert.equal(s[0].cause,'player-no-node');assert.deepEqual(plain(s[0].kept),[-30,11.9,1]);assert.equal(s[0].now,-1);
assert.equal(s[0].zombies.length,3,'at most three zombies are kept');assert.equal(s[2].cause,'unknown','a non-string cause becomes unknown');
assert.equal(s[0].map,'old-town');assert.equal(s[0].diff,'hard');assert.equal(s[0].at,'2026-11-03T10:00:00.000Z');
assert.equal(extract([run({diagnostics:null}),run({diagnostics:{stuck:'x'}})]).points.length,0,'old records without stuck are fine');

// --- 入力の形 ------------------------------------------------------------------------------
const rec=run({mistakes:[hit(1)]});
assert.equal(fromAny([rec]).points.length,1,'array of records');
assert.equal(fromAny({runs:[{id:'row1',json:JSON.stringify(rec)}]}).points.length,1,'/runs response with json strings');
const done=extract([rec]);assert.equal(fromAny(done),done,'already-extracted data is passed through');
assert.equal(fromAny({runs:[{json:'{not json'}]}).points.length,0,'unreadable rows are skipped');

// --- 集計と表示 ------------------------------------------------------------------------------
const many=extract([run({clientRunId:'r1',at:'2026-11-03T10:00:00Z',diagnostics:{stuck:[stuck('player-no-node',40),stuck('player-no-node',90),stuck('no-route',20)]}}),
  run({clientRunId:'r2',at:'2026-11-03T12:00:00Z',diagnostics:{stuck:[stuck('player-no-node',33)]}})]).points;
const counts=causeCounts(many);
assert.deepEqual(plain(counts),[{cause:'player-no-node',n:3,runs:2},{cause:'no-route',n:1,runs:1}],'most frequent first, with how many plays');
const rows=stuckRows(many);assert.equal(rows.length,4);assert.equal(rows[0].run,'r2','newest first');
assert.deepEqual(plain(rows.slice(1).map(x=>x.t)),[20,40,90],'same play: by time');
assert.equal(stuckRows(many,'no-route').length,1);
assert.equal(fmtTime(Date.parse('2026-11-03T10:30:00Z')),'11-03 19:30','Japan time from milliseconds');
assert.equal(fmtTime('2026-11-03T10:30:00.000Z'),'11-03 19:30','Japan time from ISO text');
assert.equal(fmtTime(undefined),'—');assert.equal(fmtTime('???'),'???');
assert.equal(esc('<img src=x onerror="a()">&\''),'&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;','HTML is escaped');
assert.equal(causeName('player-no-node'),'足元にノードなし');assert.equal(causeName('weird'),'weird');assert.equal(causeName(undefined),'不明');
// nav-watch.js が出す cause はすべて説明がある
const navWatch=fs.readFileSync('nav-watch.js','utf8'),emitted=[...navWatch.matchAll(/return '([a-z-]+)'/g)].map(m=>m[1]);
assert.ok(emitted.length>=5,'found the causes nav-watch emits: '+emitted);
for(const c of emitted)assert.ok(CAUSE[c],'the admin page explains cause '+c);
console.log('PASS admin extract: points, stuck entries, causes and formatting');
