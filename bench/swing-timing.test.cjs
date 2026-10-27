const assert = require('node:assert/strict');
(async()=>{
 const {pendulumPoint,releaseVelocity,SWING_LENGTH}=await import('../parkour-swing.js');
 // Release must preserve the physical tangent (including its sign) plus the
 // same fixed jump push, regardless of the phase or a target's location.
 for(const angle of [-.8,0,.35,.95])for(const omega of [-3,0,3]){
  const dt=1e-6,dir=[.6,.8],before=pendulumPoint([2,9,-4],dir,angle-omega*dt),after=pendulumPoint([2,9,-4],dir,angle+omega*dt);
  const tangent=after.map((x,k)=>(x-before[k])/(2*dt));
  const launch=releaseVelocity(dir,angle,omega,7.2),push=releaseVelocity(dir,angle,0,7.2);
  launch.forEach((v,k)=>assert.ok(Math.abs(v-push[k]-tangent[k])<1e-6));
 }
 const early=releaseVelocity([1,0],-.5,3,7.2),forward=releaseVelocity([1,0],.5,3,7.2),returning=releaseVelocity([1,0],.5,-3,7.2);
 assert.ok(forward[1]>early[1]+5,'rising forward motion carries a visibly different flight');
 assert.ok(returning[0]<0&&forward[0]>0,'return swing retains backward momentum');
 assert.equal(Math.hypot(...pendulumPoint([0,0,0],[1,0],.8)),SWING_LENGTH);
 console.log('PASS: tangent momentum at 12 phases/directions, fixed jump push, early/rising/returning trajectories');
})().catch(e=>{console.error(e);process.exitCode=1;});
