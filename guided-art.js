import { mergeStaticMaterialGroups } from './world-batching.js?v=20261106-rooftop-v2';
// Tutorial-only scene styling. Decorative objects never change the collision field.
(() => {
  if (!window.skyGuidedScene) return;
  const sky = window.__skyInternals, g = window.__game, T = sky.Geom, course = window.skyPracticeCourse;
  const root = new T.Group(); root.name = 'Rooftop learning district'; sky.ue.add(root);
  const colors = { roof:0xc5d0cf, side:0x3f5666, dark:0x213a4a, trim:0xe9b975, paint:0xf8f3df, active:0xefb453 };
  const matte = color => new T.Standard({color, roughness:.9, metalness:.04});
  const seam=matte(0x9cacae),windows=matte(0xa5bdc8);
  const roof = matte(colors.roof), side = matte(colors.side), dark = matte(colors.dark), trim = matte(colors.trim);
  const wall = matte(0x365a6c), gate = matte(0x577681), vent = matte(0x9dafb5);
  const paint = new T.Basic({color:colors.paint}), amber = new T.Basic({color:colors.active});
  const box = (w,h,d,x,y,z,mat,parent=root) => {const m=new T.Mesh(new T.Box(w,h,d),mat);m.position.set(x,y,z);m.userData.skyStaticBatch=parent===root||parent.parent===root;parent.add(m);return m;};
  for(const child of sky.Se.children)if(child.geometry?.parameters?.radius===500)child.visible=false;
  // An airy sky / blue haze, instead of the test map's flat beige field.
  const canvas=document.createElement('canvas');canvas.width=4;canvas.height=512;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,512);
  gradient.addColorStop(0,'#8faebf');gradient.addColorStop(.55,'#c3d4dc');gradient.addColorStop(1,'#e3e6dc');ctx.fillStyle=gradient;ctx.fillRect(0,0,4,512);
  sky.ue.background=new T.CanvasTexture(canvas);
  if(sky.ue.fog){sky.ue.fog.color.setHex(0xcbd9df);if('near' in sky.ue.fog){sky.ue.fog.near=24;sky.ue.fog.far=78;}else sky.ue.fog.density=.019;}
  sky.ue.traverse(o=>{if(o.isHemisphereLight){o.color.setHex(0xe1edf4);o.groundColor.setHex(0x7c8f96);}if(o.isDirectionalLight)o.color.setHex(0xfff1d8);});
  // Windows are generated here, not downloaded assets.
  const wc=document.createElement('canvas');wc.width=256;wc.height=256;const wctx=wc.getContext('2d');
  wctx.fillStyle='#49616f';wctx.fillRect(0,0,256,256);
  for(let y=12;y<250;y+=43)for(let x=12;x<250;x+=31){wctx.fillStyle=(x+y)%4?'#8096a1':'#bcc5bc';wctx.fillRect(x,y,12,21);}
  const windowTexture=new T.CanvasTexture(wc), facade=new T.Standard({map:windowTexture,color:0xc4d1d6,roughness:.95});
  for(const b of sky.jn){
    if(!b.mesh)continue;
    if(b.practice==='catch-street'){b.mesh.traverse(o=>{if(o.isMesh)o.material=matte(0x5e7480);});continue;}
    b.mesh.traverse(o=>{if(o.isMesh)o.material=[side,side,roof,side,side,side];});
    if(b.practice==='run-wall'||b.swingCourse==='kick-wall')b.mesh.traverse(o=>{if(o.isMesh)o.material=wall;});
    if(b.practice==='low-gate'||b.practice==='gate-post')b.mesh.traverse(o=>{if(o.isMesh)o.material=gate;});
    if(b.practice==='trial-gate')b.mesh.traverse(o=>{if(o.isMesh)o.material=trim;});
    if(b.practice==='roof-vent')b.mesh.traverse(o=>{if(o.isMesh)o.material=vent;});
    const broad=b.practice?.includes('roof')||b.practice==='gap-landing'||b.practice==='run-exit'||b.practice==='zip-landing'||b.practice==='blast-landing'||b.practice==='jumpgun-landing'||b.swingCourse==='upper-landing';
    if(broad&&b.maxX-b.minX>3&&b.maxZ-b.minZ>3){
      const w=b.maxX-b.minX,d=b.maxZ-b.minZ,y=b.minY;
      box(w,Math.max(1,y+8),d,(b.maxX+b.minX)/2,(y-8)/2,(b.maxZ+b.minZ)/2,facade);
      for(const z of [b.minZ+.09,b.maxZ-.09])box(w-.12,.025,.10,(b.minX+b.maxX)/2,b.maxY+.02,z,trim);
      for(const x of [b.minX+.08,b.maxX-.08])box(.10,.025,d-.12,x,b.maxY+.02,(b.minZ+b.maxZ)/2,trim);
    }
  }
  // BoxGeometry repeats side groups. Join equal materials within each mesh,
  // retaining separate occlusion surfaces without six draws for every roof.
  for(const b of sky.jn)b.mesh?.traverse(mesh=>{
    if(!mesh.isMesh||!Array.isArray(mesh.material))return;
    const geometry=mesh.geometry,materials=[],indices=[],groups=new Map();
    for(const group of geometry.groups){const material=mesh.material[group.materialIndex];if(!groups.has(material))groups.set(material,[]);for(let i=group.start;i<group.start+group.count;i++)groups.get(material).push(geometry.index.getX(i));}
    geometry.clearGroups();for(const [material,part] of groups){geometry.addGroup(indices.length,part.length,materials.length);indices.push(...part);materials.push(material);}
    geometry.setIndex(indices);mesh.material=materials;
  });
  // Small seams and rooftop equipment give the starting space a readable human scale.
  for(let x=-3;x<18;x+=2)box(.018,.008,6.3,x,2.012,0,seam);
  for(let z=-2.2;z<3;z+=1.7)box(21,.008,.018,7,2.013,z,seam);
  for(let i=0;i<5;i++)box(.84,.025,.04,-.85,2.81,2.79+i*.075,dark);
  box(.08,.08,5.8,6.5,2.72,0,side);
  // Ordered, low-detail skyline. Everything stays well outside the walking lane.
  let seed=14;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const cityMats=[matte(0x7894a4),matte(0x8da4af),matte(0x688595),matte(0xa8b9bd)];
  for(let x=-38;x<285;x+=13)for(const sign of [-1,1]){
    const z=sign*(16+random()*18),h=5+random()*13,w=6+random()*7,d=6+random()*7;
    const m=box(w,h,d,x+random()*4,-9+h/2,z,cityMats[Math.floor(random()*cityMats.length)]);
    box(w+.25,.35,d+.25,m.position.x,-9+h+.17,z,side);
    if(h>11)box(w*.5,1.2,d*.42,m.position.x,-9+h+.8,z,cityMats[0]);
    // Long horizontal bands read as windows at a distance, without dozens of meshes.
    for(let k=3;k<h-1;k+=3.6)box(w*.78,.45,.03,m.position.x,-9+k,z-sign*d/2,windows);
  }
  const ramp=box(Math.hypot(12,5.2),.4,4.8,76,2.4,0,[side,side,roof,side,side,side]);ramp.rotation.z=-Math.atan2(5.2,12);

  function chevron(x,y,z,material){const group=new T.Group();group.position.set(x,y+.035,z);for(const s of [-1,1]){const stroke=box(.52,.012,.085,0,0,s*.15,material,group);stroke.rotation.y=s*.6;}root.add(group);return group;}
  for(const segment of course.paint)for(let x=segment.x1;x<segment.x2;x+=1.9)chevron(x,segment.y,segment.z,paint);
  // A wall stencil points along the runnable face, never onto an ordinary wall.
  for(let x=38;x<47;x+=2){for(const s of [-1,1]){const stroke=box(.7,.10,.025,x,5.5+s*.18,-1.832,paint);stroke.rotation.z=-s*.5;}}
  window.skyGuidedArtBatch=mergeStaticMaterialGroups({...sky,ue:root},48,{force:true});
  const destination=new T.Group();sky.ue.add(destination);
  const plate=new T.Mesh(new T.Cylinder(.57,.57,.012,32),new T.Basic({color:0xf7f1d9,transparent:true,opacity:.78}));destination.add(plate);
  const outline=new T.Mesh(new T.Torus(.58,.025,5,32),amber);outline.rotation.x=Math.PI/2;outline.position.y=.012;destination.add(outline);
  for(const s of [-1,1]){const stroke=box(.42,.02,.075,.03,.025,s*.12,amber,destination);stroke.rotation.y=s*.6;}
  let target=[5.7,2,0],stage='controls',hidden=false;
  window.skyGuidedPresentation={target(at,id,done){target=at;stage=id;hidden=done;}};
  function frame(){
    destination.visible=g.mode==='play'&&!hidden&&!['hook','zip','swing'].includes(stage);
    for(const b of sky.jn)if(b.mesh&&!b.shape&&b.practice!=='trial-gate')b.mesh.visible=!b.off&&b.maxX>c.pos.x-45&&b.minX<c.pos.x+80;
    for(const mesh of root.children)if(mesh.geometry?.boundingSphere)mesh.visible=Math.abs(mesh.geometry.boundingSphere.center.x-c.pos.x)<110;
    destination.position.set(target[0],target[1]+.05,target[2]);
    requestAnimationFrame(frame);
  }
  const c=g.P;frame();
})();
