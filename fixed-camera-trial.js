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
  const fadeWalls = p.get('fixedOcclusion') !== 'zoom';
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
    if(!fadeWalls){restore();return false;}
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
  function visible(from,to){return !blockers().some(b=>!b.off&&!faded.has(b.mesh)&&intersects(from,to,b));}
  const reset = () => { moving = false; pointer = null; };
  window.skyFixedCamera = { get active() { return active(); }, pose, chase, input, step, camera, reset,
    occlusion, restore, visible, get fadedCount(){return faded.size} };
  document.documentElement.dataset.cameraTrial='fixed';
  const style=document.createElement('style');style.textContent='html[data-camera-trial=fixed] #lookNote{display:none!important}';document.head.append(style);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
})();
