// Aim the baked (non-skeletal) human without replacing its legs or parkour poses.
import { solveLimb, boneMap } from './human-actions.js?v=20261027-aim-v1';
import { armWeight } from './human-running.js?v=20261027-aim-v1';
import { FIRST_PERSON_WEAPONS } from './first-person-weapons.js?v=20261025-jump-tune-portrait-v1';
const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t); };
const mix = (a,b,t) => a.map((v,k)=>v+(b[k]-v)*t);
const distance = (a,b) => Math.hypot(...a.map((v,k)=>v-b[k]));
const point = (a,i) => [a.getX(i),a.getY(i),a.getZ(i)];

export function buildHeldWeapon(source,index,T) {
  const { Group,Vector3 }=T, root=new Group(), axis=new Group(), fit=new Group();
  const clone=source.clone(true);
  clone.position.set(0,0,0);clone.rotation.set(0,0,0);clone.scale.setScalar(1);clone.visible=true;
  clone.traverse(n=>{if(n.userData.skyFlash||n.name.includes('reload magazine'))n.visible=false;});
  axis.add(clone);if(index>=4&&index<=11&&clone.children.some(n=>n.visible&&n.name.startsWith('Easy Weapons')))axis.rotation.y=Math.PI;
  root.add(fit);fit.add(axis);root.updateMatrixWorld(true);
  const vertices=[];
  clone.traverse(n=>{
    if(!n.isMesh)return;
    for(let parent=n;parent&&parent!==root;parent=parent.parent)if(!parent.visible)return;
    const a=n.geometry.attributes.position;
    for(let i=0;i<a.count;i++)vertices.push(new Vector3().fromBufferAttribute(a,i).applyMatrix4(n.matrixWorld));
  });
  const low=new Vector3(Infinity,Infinity,Infinity),high=new Vector3(-Infinity,-Infinity,-Infinity);
  for(const p of vertices){low.min(p);high.max(p);}
  const profile=FIRST_PERSON_WEAPONS[index],length=profile.length*.88;
  const scale=length/Math.max(.001,high.z-low.z);
  // Frontmost geometry gives the barrel centre, including +Z Unity exports.
  const tip=vertices.filter(p=>p.z<low.z+(high.z-low.z)*.018);
  const centre=tip.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/Math.max(1,tip.length));
  axis.position.set(-centre.x,-centre.y,-high.z);fit.scale.setScalar(scale);
  const grip=profile.grip.map((v,k)=>v*.88+(k===1?(-centre.y+high.y)*scale:0));
  const support=profile.support.map((v,k)=>v*.88+(k===1?(-centre.y+high.y)*scale:0));
  if(index===0||index===4){support[0]=-.055;support[1]=grip[1]-.015;support[2]=grip[2]-.025;}
  root.name='Unity human held weapon';root.userData.sourceChildren=source.children.length;
  return {root,length,grip,support,muzzle:new Vector3(0,0,-length),profile};
}

export function createHumanAim(model,motion,T) {
  const {Vector3}=T;
  let mesh;model.traverse(n=>{if(n.name.startsWith('Body_mesh'))mesh=n;});
  if(!mesh)return null;
  const g=mesh.geometry,base=g.attributes.position,normal=g.attributes.normal;
  const original=base.array.slice(),originalNormal=normal.array.slice();
  model.updateMatrixWorld(true);
  const toModel=model.matrixWorld.clone().invert().multiply(mesh.matrixWorld),toMesh=toModel.clone().invert();
  const unarmed=g.morphAttributes.position[mesh.morphTargetDictionary[motion.clips.jump.frames[0]]];
  const neutral=Array.from({length:base.count},(_,i)=>new Vector3(...point(base,i)).add(new Vector3(...point(unarmed,i))).applyMatrix4(toModel).toArray());
  const weights=neutral.map(armWeight),arms=[];
  for(let i=0;i<weights.length;i++)if(weights[i]>.0001)arms.push(i);
  const shoulderMarkers=[-1,1].map(side=>{
    const shoulder=[side*.28,1.94,-.075];let best=0,d=Infinity;
    neutral.forEach((p,i)=>{const next=distance(p,shoulder);if(next<d){d=next;best=i;}});
    return {side,shoulder,index:best};
  });
  let active=false;
  const composed=new Float32Array(original.length),p=new Vector3();
  function compose() {
    composed.set(original);
    mesh.morphTargetInfluences.forEach((w,j)=>{
      if(Math.abs(w)<.000001)return;
      const a=g.morphAttributes.position[j].array;
      for(let k=0;k<a.length;k++)composed[k]+=a[k]*w;
    });
  }
  function shoulders() {
    compose();
    return shoulderMarkers.map(({shoulder,index})=>{
      const q=p.fromArray(composed,index*3).applyMatrix4(toModel).toArray();
      return shoulder.map((v,k)=>v+q[k]-neutral[index][k]);
    });
  }
  function reset() {
    if(!active)return;
    base.array.set(original);normal.array.set(originalNormal);base.needsUpdate=true;normal.needsUpdate=true;active=false;
  }
  function apply(hands,palmDirection,blend) {
    if(blend<.0001){reset();return null;}
    const roots=shoulders(),maps=[],errors=[];
    for(let j=0;j<2;j++){
      const side=j===0?-1:1,shoulder=[side*.28,1.94,-.075],elbow=[side*.43,1.55,-.105],hand=[side*.52495,1.19165,-.0644];
      const target=hands[j],ik=solveLimb(roots[j],target,distance(shoulder,elbow),distance(elbow,hand),[side,-.3,-.5]);
      const palmEnd=ik.end.map((v,k)=>v+palmDirection[k]);
      maps.push({upper:boneMap(shoulder,elbow,roots[j],ik.joint),lower:boneMap(elbow,hand,ik.joint,ik.end),palm:boneMap(hand,[hand[0],hand[1]-1,hand[2]],ik.end,palmEnd)});
      errors.push(distance(ik.end,target));
    }
    base.array.set(original);normal.array.set(originalNormal);
    for(const i of arms){
      const v=neutral[i],map=maps[v[0]<0?0:1];
      let target=mix(map.upper(v),map.lower(v),1-smooth(1.48,1.67,v[1]));
      target=mix(target,map.palm(v),1-smooth(1.21,1.34,v[1]));
      p.set(...target).applyMatrix4(toMesh);
      for(let k=0;k<3;k++){
        const at=i*3+k,change=(p.getComponent(k)-composed[at])*weights[i]*blend;
        base.array[at]=original[at]+change;composed[at]+=change;
      }
    }
    // Relative GPU morph deltas are unchanged. Correct the base position/normal
    // so the final GPU pose (and its normal and shadow) matches the solved arms.
    const saved=base.array;base.array=composed;g.computeVertexNormals();base.array=saved;
    mesh.morphTargetInfluences.forEach((w,j)=>{
      if(Math.abs(w)<.000001)return;
      const a=g.morphAttributes.normal?.[j]?.array;if(!a)return;
      for(let k=0;k<a.length;k++)normal.array[k]-=a[k]*w;
    });
    base.needsUpdate=true;normal.needsUpdate=true;active=true;
    return Math.max(...errors);
  }
  return {shoulders,apply,reset};
}
