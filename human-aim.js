// Aim the baked (non-skeletal) human without replacing its legs or parkour poses.
import { solveLimb, boneMap } from './human-actions.js?v=20261027-aim-v1';
import { armWeight } from './human-running.js?v=20261027-dash-v1';
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
  model.updateMatrixWorld(true);
  // These exports contain baked morph poses, so compose from the immutable base
  // each frame. Apply the same waist rotation to the body, hood, mask and bag.
  const records=[];
  model.traverse(node=>{
    if(!node.isMesh||!node.geometry.attributes.normal)return;
    const g=node.geometry,base=g.attributes.position,normal=g.attributes.normal;
    const toModel=model.matrixWorld.clone().invert().multiply(node.matrixWorld),toMesh=toModel.clone().invert();
    const unarmed=g.morphAttributes.position?.[node.morphTargetDictionary?.[motion.clips.jump.frames[0]]];
    const neutral=Array.from({length:base.count},(_,i)=>{
      const p=new Vector3(...point(base,i));if(unarmed)p.add(new Vector3(...point(unarmed,i)));return p.applyMatrix4(toModel).toArray();
    });
    records.push({node,g,base,normal,toModel,toMesh,neutral,
      original:base.array.slice(),originalNormal:normal.array.slice(),
      composed:new Float32Array(base.array.length),final:new Float32Array(base.array.length),
      torso:neutral.map(p=>smooth(1.14,1.70,p[1]))});
  });
  const body=records.find(r=>r.node===mesh),{neutral}=body;
  const weights=neutral.map(armWeight),arms=[];
  for(let i=0;i<weights.length;i++)if(weights[i]>.0001)arms.push(i);
  function nearest(goal){let best=0,d=Infinity;neutral.forEach((p,i)=>{const next=distance(p,goal);if(next<d){d=next;best=i;}});return best;}
  const shoulderMarkers=[-1,1].map(side=>({shoulder:[side*.28,1.94,-.075],index:nearest([side*.28,1.94,-.075])}));
  const landmarks=[[0,1.8,.12],[0,1.8,-.22],[-.18,1.8,-.12],[.18,1.8,-.12],[-.18,1.3,0],[.18,1.3,0]].map(nearest);
  const p=new Vector3(),pivot=new Vector3(),q=new model.quaternion.constructor(),partial=q.clone(),identity=q.clone();
  const matrix=model.matrixWorld.clone();
  function basis(points){
    const front=new Vector3(...points[0]).sub(new Vector3(...points[1])).normalize();
    const right=new Vector3(...points[3]).sub(new Vector3(...points[2]));
    right.addScaledVector(front,-right.dot(front)).normalize();
    const up=new Vector3().crossVectors(front,right).normalize();
    return q.clone().setFromRotationMatrix(matrix.makeBasis(right,up,front));
  }
  const neutralBasis=basis(landmarks.map(i=>neutral[i]));
  let active=false,prepared=false,torsoBlend=0;
  function compose(r) {
    r.composed.set(r.original);
    r.node.morphTargetInfluences?.forEach((w,j)=>{
      if(Math.abs(w)<.000001)return;
      const a=r.g.morphAttributes.position[j].array;
      for(let k=0;k<a.length;k++)r.composed[k]+=a[k]*w;
    });
    r.final.set(r.composed);
  }
  function bodyPoint(i){return p.fromArray(body.composed,i*3).applyMatrix4(body.toModel).toArray();}
  function rotate(v,weight){return v.sub(pivot).applyQuaternion(partial.slerpQuaternions(identity,q,weight)).add(pivot);}
  function prepare(target,blend,lean = 0) {
    for(const r of records)compose(r);
    const current=landmarks.map(bodyPoint);
    pivot.set(...current[4]).add(new Vector3(...current[5])).multiplyScalar(.5);
    const direction=new Vector3(...target).sub(new Vector3(...current[0]).add(new Vector3(...current[1])).multiplyScalar(.5)).toArray();
    torsoBlend=blend;
    const yaw=Math.max(-1.40,Math.min(1.40,Math.atan2(direction[0],direction[2])));
    const pitch=Math.max(-1.05,Math.min(1.05,Math.atan2(direction[1],Math.hypot(direction[0],direction[2]))*.85));
    // Remove the baked chest's lean/twist before aiming. The legs and pelvis
    // keep their movement pose; the waist smoothly distributes the correction.
    const desired=q.clone().setFromEuler(new model.rotation.constructor(-pitch+lean,yaw,0,'YXZ')).multiply(neutralBasis);
    q.copy(desired).multiply(basis(current).invert());
    for(const r of records)for(let i=0;i<r.base.count;i++){
      if(r.torso[i]<.0001)continue;
      p.fromArray(r.composed,i*3).applyMatrix4(r.toModel);rotate(p,r.torso[i]*blend).applyMatrix4(r.toMesh).toArray(r.final,i*3);
    }
    prepared=true;
    return {yaw,pitch};
  }
  function shoulders() {
    return shoulderMarkers.map(({shoulder,index})=>{
      const marker=bodyPoint(index),v=new Vector3(...shoulder.map((v,k)=>v+marker[k]-neutral[index][k]));
      return rotate(v,torsoBlend).toArray();
    });
  }
  function reset() {
    prepared=false;if(!active)return;
    for(const r of records){r.base.array.set(r.original);r.normal.array.set(r.originalNormal);r.base.needsUpdate=true;r.normal.needsUpdate=true;}
    active=false;
  }
  function apply(hands,palmDirection,blend) {
    if(blend<.0001||!prepared){reset();return null;}
    const roots=shoulders(),maps=[],errors=[];
    for(let j=0;j<2;j++){
      const side=j===0?-1:1,shoulder=[side*.28,1.94,-.075],elbow=[side*.43,1.55,-.105],hand=[side*.52495,1.19165,-.0644];
      const target=hands[j],ik=solveLimb(roots[j],target,distance(shoulder,elbow),distance(elbow,hand),[side,-.3,-.5]);
      const palmEnd=ik.end.map((v,k)=>v+palmDirection[k]);
      maps.push({upper:boneMap(shoulder,elbow,roots[j],ik.joint),lower:boneMap(elbow,hand,ik.joint,ik.end),palm:boneMap(hand,[hand[0],hand[1]-1,hand[2]],ik.end,palmEnd)});
      errors.push(distance(ik.end,target));
    }
    for(const i of arms){
      const v=neutral[i],map=maps[v[0]<0?0:1];
      let target=mix(map.upper(v),map.lower(v),1-smooth(1.48,1.67,v[1]));
      target=mix(target,map.palm(v),1-smooth(1.21,1.34,v[1]));
      p.set(...target).applyMatrix4(body.toMesh);
      for(let k=0;k<3;k++){const at=i*3+k;body.final[at]+=(p.getComponent(k)-body.final[at])*weights[i]*blend;}
    }
    for(const r of records){
      for(let k=0;k<r.final.length;k++)r.base.array[k]=r.original[k]+r.final[k]-r.composed[k];
      // GPU morph deltas stay unchanged. Offset the base normals so lighting
      // and shadows use the final, chest-rotated pose on every attached mesh.
      const saved=r.base.array;r.base.array=r.final;r.g.computeVertexNormals();r.base.array=saved;
      r.node.morphTargetInfluences?.forEach((w,j)=>{
        if(Math.abs(w)<.000001)return;
        const a=r.g.morphAttributes.normal?.[j]?.array;if(!a)return;
        for(let k=0;k<a.length;k++)r.normal.array[k]-=a[k]*w;
      });
      r.base.needsUpdate=true;r.normal.needsUpdate=true;
    }
    active=true;prepared=false;
    return Math.max(...errors);
  }
  return {prepare,shoulders,apply,reset};
}
