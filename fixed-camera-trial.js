// Local prototype, opt-in only. No saved preferences or ranked rules change.
(() => {
  const p = new URLSearchParams(location.search);
  if (p.get('cameraTrial') !== 'fixed') return;
  const sky = window.__skyInternals, fc = window.skyFollowCamera;
  if (!sky || !fc) return;
  const bounded = (key, fallback, lo, hi) => p.has(key) && Number.isFinite(+p.get(key))
    ? Math.max(lo, Math.min(hi, +p.get(key))) : fallback;
  const pose = Object.freeze({ yaw: bounded('fixedYaw', window.skyGuidedScene?-Math.PI/2:0, -Math.PI, Math.PI),
    pitch: bounded('fixedPitch', -.65, -1.2, -.3) });
  const chase = Object.freeze({ distance: bounded('fixedDistance', 8, 3.6, 12), shoulder: 0, height: 0 });
  const { c, inputState: touch } = sky;
  const native = new Set(['ladder', 'zip', 'hook', 'swing', 'ledge', 'wallrun']);
  const active = () => fc.mode === 'after' && !sky.demoActive() && !['menu','replay'].includes(sky.modeRef());
  // Keep the published fade available for a same-location comparison.
  const fadeWalls = p.get('fixedOcclusion') === 'fade' || p.get('wallView') === 'classic';
  const opaque = !fadeWalls && p.get('fixedOcclusion') !== 'zoom';
  const faded = new Set(), originals = new Map(), translucent = new Map();
  const footHeight = { value: 0 };
  function fadeMaterial(material, bounds) {
    const copy=material.clone();copy.transparent=true;copy.opacity=.13;copy.depthWrite=false;
    const prepare=material.onBeforeCompile;
    copy.customProgramCacheKey=()=>material.customProgramCacheKey()+'|fixed-outline-v1';
    // A single static mesh can contain both a wall and the floor beneath us.
    // Keep its surface below the feet opaque; fade only the part above it.
    copy.onBeforeCompile=function(shader,renderer){
      prepare.call(this,shader,renderer);shader.uniforms.skyFixedFoot=footHeight;
      shader.uniforms.skyFixedMin={value:bounds.min};shader.uniforms.skyFixedMax={value:bounds.max};
      shader.uniforms.skyFixedOutline={value:p.get('wallReadability')==='classic'?0:.62};
      shader.vertexShader='varying vec3 vSkyFixedPosition;\n'+shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvSkyFixedPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader='varying vec3 vSkyFixedPosition;\nuniform float skyFixedFoot;\nuniform vec3 skyFixedMin;\nuniform vec3 skyFixedMax;\nuniform float skyFixedOutline;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>', `
        vec3 edgeDistance=min(abs(vSkyFixedPosition-skyFixedMin),abs(vSkyFixedPosition-skyFixedMax));
        vec3 edge=1.0-smoothstep(vec3(.025),vec3(.075),edgeDistance);
        float outline=max(edge.x*edge.y,max(edge.y*edge.z,edge.z*edge.x));
        diffuseColor.a=max(diffuseColor.a,skyFixedOutline*outline);
        if(vSkyFixedPosition.y<=skyFixedFoot) diffuseColor.a=1.0;
        #include <alphatest_fragment>`);
    };
    return copy;
  }
  let visuals;
  function blockers() {
    if (!visuals) {
      visuals=[];
      const physical=new Set(sky.jn.map(b=>b.mesh));
      sky.ue.updateMatrixWorld(true);
      sky.ue.traverse(mesh=>{
        if(!mesh.isMesh||mesh.isSkinnedMesh||physical.has(mesh)||!mesh.geometry||!mesh.visible)return;
        let tagged=!!mesh.userData.skyStaticBatch;
        for(let q=mesh.parent;q&&q!==sky.ue;q=q.parent)if(q.userData.skyStaticBatch)tagged=true;
        if(!tagged&&(mesh.parent!==sky.ue||mesh.matrixAutoUpdate))return;
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        const box=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        visuals.push({mesh,minX:box.min.x,minY:box.min.y,minZ:box.min.z,maxX:box.max.x,maxY:box.max.y,maxZ:box.max.z});
      });
    }
    return [...sky.jn,...visuals];
  }
  let moving = false, pointer = null;
  function input(raw) {
    const magnitude = Math.min(1, Math.hypot(raw.strIn, raw.fwdIn));
    const same = touch.on ? pointer === touch.id : pointer === 'keys';
    if (native.has(c.state)) {
      if (magnitude <= .18 || !same) moving = false;
      if(c.state==='wallrun'){const delta=pose.yaw-Math.atan2(raw.strIn,raw.fwdIn)-c.yaw;return {...raw,fwdIn:magnitude*Math.cos(delta),strIn:-magnitude*Math.sin(delta)};}
      return c.state === 'ladder' && moving ? { ...raw, fwdIn: magnitude } : raw;
    }
    pointer = touch.on ? touch.id : 'keys';
    moving = magnitude > (touch.on ? .18 : 0);
    return { ...raw, fwdIn: moving ? magnitude : 0, strIn: 0, steer: 0,
      fixed: true, heading: pose.yaw - Math.atan2(raw.strIn, raw.fwdIn),
      precise: true, motionScale: moving ? (touch.on ? Math.max(0, (magnitude - .12) / .88) : 1) : 0 };
  }
  function step(_dt, raw) {
    if (raw.fixed && ['normal', 'slide'].includes(c.state) && raw.fwdIn > 0) c.yaw = raw.heading;
  }
  function camera(camera) {
    document.documentElement.dataset.cameraTrial='fixed';
    camera.rotation.set(pose.pitch, pose.yaw, 0);
    if (camera.fov !== 65) { camera.fov = 65; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  }
  function intersects(a, z, b) {
    let lo=0, hi=1;
    for (const k of ['x','y','z']) {
      const d=z[k]-a[k], low=b['min'+k.toUpperCase()], high=b['max'+k.toUpperCase()];
      if (Math.abs(d)<1e-8) { if (a[k]<low || a[k]>high) return false; continue; }
      let t0=(low-a[k])/d, t1=(high-a[k])/d;
      if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);
      if(lo>hi)return false;
    }
    return hi>.001&&lo<.995;
  }
  function restore() {
    document.documentElement.dataset.cameraTrial='off';
    for(const mesh of faded)mesh.material=originals.get(mesh);
    faded.clear();
  }
  function occlusion(pivot, wanted) {
    if(!fadeWalls){restore();document.documentElement.dataset.cameraTrial='fixed';return opaque;}
    footHeight.value=c.pos.y+.06;
    const next=new Set();
    const points=[pivot,{x:c.pos.x,y:c.pos.y+.3,z:c.pos.z},
      {x:c.pos.x+2.5,y:c.pos.y+.5,z:c.pos.z},{x:c.pos.x-2.5,y:c.pos.y+.5,z:c.pos.z},
      {x:c.pos.x,y:c.pos.y+.5,z:c.pos.z-2.5},{x:c.pos.x,y:c.pos.y+.5,z:c.pos.z+2.5}];
    for(const box of blockers()){
      if(box.off||!box.mesh||box.maxY<=c.pos.y+.6||!points.some(t=>intersects(wanted,t,box)))continue;
      const mesh=box.mesh;if(!mesh.material)continue;
      if(!originals.has(mesh)){
        originals.set(mesh,mesh.material);
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        const bounds=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        translucent.set(mesh,Array.isArray(mesh.material)?mesh.material.map(m=>fadeMaterial(m,bounds)):fadeMaterial(mesh.material,bounds));
      }
      mesh.material=translucent.get(mesh);next.add(mesh);
    }
    for(const mesh of faded)if(!next.has(mesh))mesh.material=originals.get(mesh);
    faded.clear();for(const mesh of next)faded.add(mesh);
    return true;
  }
  function visible(from,to){return opaque?!blocked(from,to):!blockers().some(b=>!b.off&&!faded.has(b.mesh)&&intersects(from,to,b));}
  // Test actual collision boxes, not the bounding box of a whole merged city
  // mesh. A distant face in that mesh must not hide or move the camera here.
  function blocked(from,to) {
    const boxes=sky.near(Math.min(from.x,to.x),Math.min(from.z,to.z),Math.max(from.x,to.x),Math.max(from.z,to.z));
    const hit=b=>!b.off&&b.solid&&b.maxY>c.pos.y+.08&&intersects(from,to,b);
    return boxes.some(hit)||(window.skyCameraVolumes||[]).some(b=>b.maxY>c.pos.y+.15&&hit(b));
  }
  let cameraFraction=1, cameraAt=null, cameraPitch=pose.pitch;
  function cameraSafe(q){return sky.oe(q.x,q.y-.16,q.z,.16,.32)&&!(window.skyCameraVolumes||[]).some(b=>
    q.x>b.minX-.16&&q.x<b.maxX+.16&&q.z>b.minZ-.16&&q.z<b.maxZ+.16&&q.y>b.minY-.16&&q.y<b.maxY+.16);}
  function resolveCamera(pivot,wanted,dt) {
    const foot={x:c.pos.x,y:c.pos.y+.18,z:c.pos.z};
    const head={x:c.pos.x,y:c.pos.y+1.35,z:c.pos.z};
    const delta=wanted.clone().sub(pivot), length=delta.length();
    const safeAt=cameraSafe;
    let target=1, found=false, targetPitch=pose.pitch;
    // First try a closer camera with the original yaw/pitch and movement axes.
    // Never zoom into the avatar to solve a wall.
    for(let i=24;i>=8;i--){
      const t=i/24;if(t*length<2.8)continue;
      const q=pivot.clone().addScaledVector(delta,t);
      if(safeAt(q)&&!blocked(q,foot)&&!blocked(q,head)){target=t;found=true;break;}
    }
    if(!found){
      // A house can fill the entire space behind the player. In that case a
      // closer camera cannot reveal the feet: look down more steeply while
      // retaining north/up and the same screen-relative movement directions.
      for(const pitch of[-1,-1.2,-1.4,-1.5,-1.54]){
        if(pitch>=pose.pitch)continue;
        const q=pivot.clone();q.x+=Math.sin(pose.yaw)*Math.cos(pitch)*length;
        q.y-=Math.sin(pitch)*length;q.z+=Math.cos(pose.yaw)*Math.cos(pitch)*length;
        if(safeAt(q)&&!blocked(q,foot)&&!blocked(q,head)){target=1;targetPitch=pitch;found=true;break;}
      }
    }
    if(!found&&!safeAt(wanted)){
      // The old translucent view could put the camera inside a whole house.
      // Back out of that house along the same viewing axis, then show the
      // occluded body as a silhouette. Never collapse into a crate-sized view.
      target=3;
      for(let i=25;i<=72;i++){
        const q=pivot.clone().addScaledVector(delta,i/24);
        if(safeAt(q)){target=i/24;break;}
      }
    }
    const jumped=!cameraAt||cameraAt.distanceTo(c.pos)>3;
    if(jumped||dt<=0||target<cameraFraction)cameraFraction=target;
    else cameraFraction+=(target-cameraFraction)*(1-Math.exp(-4*Math.min(.05,dt)));
    if(jumped||dt<=0||targetPitch<cameraPitch)cameraPitch=targetPitch;
    else cameraPitch+=(targetPitch-cameraPitch)*(1-Math.exp(-4*Math.min(.05,dt)));
    function direction(pitch){const q=pivot.clone();q.x+=Math.sin(pose.yaw)*Math.cos(pitch)*length;
      q.y-=Math.sin(pitch)*length;q.z+=Math.cos(pose.yaw)*Math.cos(pitch)*length;return q;}
    wanted.copy(direction(cameraPitch));
    if(!safeAt(pivot.clone().lerp(wanted,cameraFraction))){cameraFraction=target;cameraPitch=targetPitch;wanted.copy(direction(cameraPitch));}
    if(!cameraAt)cameraAt=c.pos.clone();else cameraAt.copy(c.pos);
    document.body.dataset.skyOpaqueFootHidden=String(!found);
    document.body.dataset.skyOpaquePitch=cameraPitch.toFixed(3);
    return cameraFraction;
  }
  function bodyOccluded(camera){
    return [[0,.8,0],[0,1.45,0],[0,.05,0],[.28,.05,0],[-.28,.05,0],[0,.05,.28],[0,.05,-.28]]
      .some(([x,y,z])=>blocked(camera,{x:c.pos.x+x,y:c.pos.y+y,z:c.pos.z+z}));
  }
  const reset = () => { moving = false; pointer = null; cameraAt=null;cameraFraction=1;cameraPitch=pose.pitch; };
  window.skyFixedCamera = { get active() { return active(); }, pose, chase, input, step, camera, reset,
    occlusion, restore, visible, resolveCamera, bodyOccluded, cameraSafe, get pitch(){return cameraPitch}, get opaque(){return opaque}, get fadedCount(){return faded.size} };
  document.documentElement.dataset.cameraTrial='fixed';
  const style=document.createElement('style');style.textContent='html[data-camera-trial=fixed] #lookNote{display:none!important}';document.head.append(style);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
})();
