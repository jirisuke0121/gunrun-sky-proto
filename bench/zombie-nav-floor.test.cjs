const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['index.html','canyon.html']){
 const html=fs.readFileSync(file,'utf8'),nodeStart=html.indexOf('function dn('),nodeEnd=html.indexOf('var io=',nodeStart);
 const pickStart=html.indexOf('pickEdge(){'),pickEnd=html.indexOf('anim(t){',pickStart);
 assert.ok(nodeStart>=0&&nodeEnd>nodeStart&&pickStart>=0&&pickEnd>pickStart);
 const nodes=[{x:0,y:5.8,z:0},{x:0,y:6,z:0}],costs=[Infinity,Infinity];
 const context=vm.createContext({window:{},lt:{x0:0,z0:0,step:1,ni:1,nj:1,cols:[[0,1]],nodes,E:[],out:[[],[]]},
  Vn:costs,Ld:costs,Vd:costs,oo:()=>1,Pd:()=>1,Gd:()=>1});
 vm.runInContext(html.slice(nodeStart,nodeEnd)+'\nthis.pick=({'+html.slice(pickStart,pickEnd)+'}).pickEdge;',context);
 for(const [height,expected] of [[5.8001,0],[6.0001,1]]){
  const enemy={pos:{x:0,y:height,z:0},flank:false,lost:false};context.pick.call(enemy);
  assert.equal(enemy.node,expected,`${file}: select the standing stair layer at ${height}, not a tread 20cm above it`);
 }
 console.log('PASS '+file+': enemy navigation uses the standing floor height');
}
