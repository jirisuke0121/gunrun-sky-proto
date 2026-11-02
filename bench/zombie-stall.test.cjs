const assert=require('node:assert/strict');
(async()=>{
 global.document={getElementById:()=>null};global.window=global;
 const {createZombiePursuit}=await import('../zombie-pursuit.js');
 const jammed=[];let now=100;
 const game={U:{},Jn:{},c:{pos:{x:60,z:0},node:1},ceRef:()=>now};
 const pursuit=createZombiePursuit(game,{FIELD:[],jamNavigationEdge:(e,u)=>jammed.push([e,u])});
 const enemy=(o={})=>({pos:{x:0,z:0},spawnT:0,onGround:true,act:null,rise:null,fall:null,stun:0,guard:0,bash:false,node:5,edge:-1,navT:1,dead:false,remove:false,...o});
 const run=(e,seconds,edges=[7])=>{for(let i=0;i<seconds*10;i++){now+=.1;e.edge=edges[i%edges.length];pursuit.observe(e,.1);}};
 // Ping-pong between two edges without moving: both edges are closed for 20 s and the enemy re-routes.
 let e=enemy();run(e,3.4,[7,8]);
 assert.deepEqual(jammed.map(j=>j[0]).sort(),[7,8],'every edge it bounced between is closed');
 assert.ok(jammed.every(j=>Math.abs(j[1]-(now-.3+20))<1),'for 20 s');
 assert.equal(e.navT,0,"the path is re-chosen at once");assert.equal(pursuit.stats.stalls,1);
 // Moving enemies are never touched, even slowly.
 jammed.length=0;e=enemy();for(let i=0;i<100;i++){now+=.1;e.pos.x+=.2;e.edge=3;pursuit.observe(e,.1);}assert.equal(jammed.length,0);
 // Reasons to stand still are not stalls.
 for(const patch of [{stun:1},{guard:1},{bash:true},{spawnT:1},{act:{kind:'drop'}},{onGround:false},{node:-1},{dead:true},{pos:{x:58,z:0}}]){
   jammed.length=0;e=enemy(patch);run(e,5);assert.equal(jammed.length,0,'no jam for '+JSON.stringify(patch));
 }
 window.skyFlashbang={blinded:()=>true};jammed.length=0;e=enemy();run(e,5);assert.equal(jammed.length,0,'flashbanged enemies wait');delete window.skyFlashbang;
 window.skyDecoy={targetFor:()=>({})};jammed.length=0;e=enemy();run(e,5);assert.equal(jammed.length,0,'decoy-lured enemies are not judged');delete window.skyDecoy;
 // Standing next to a closed edge only for a moment is fine.
 jammed.length=0;e=enemy();run(e,2.5);assert.equal(jammed.length,0,'under 3 s is not a stall');
 console.log('PASS stall breaker: ping-pong stall jams its edges, legitimate waiting is left alone');
})().catch(e=>{console.error(e);process.exitCode=1});
