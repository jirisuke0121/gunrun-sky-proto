// Exercise the actual fire routine; compare rendered barrel, ray origin,
// auto-aim target and grip contacts, then capture rear and side views.
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.RUNNING_QA_URL||'http://127.0.0.1:8772/';
fs.mkdirSync('browser-evidence',{recursive:true});
(async()=>{
 let server,browser;const results=[];
 try{
  if(!process.env.RUNNING_QA_URL){server=spawn('python3',['-m','http.server','8772','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}}
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const touch of [false,true])for(const map of ['index.html','canyon.html']){
   const id=`aim-${touch?'touch':'desktop'}-${map.split('.')[0]}`;
   const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
   await context.addInitScript(()=>{window.__hold=true;});
   await context.route('**/*',route=>{const url=route.request().url();if(new URL(url).hostname==='gunrun-runs.jirisuke0121.workers.dev')return route.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"me":null,"ok":true}'});if(new URL(url).pathname==='/favicon.ico')return route.fulfill({status:204,body:''});return url.startsWith(base)||/^(blob|data):/.test(url)?route.continue():route.abort();});
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   try{
    await page.goto(new URL(map,base).href);await page.waitForFunction(()=>window.__game&&window.skyHumanView);
    await page.locator('#humanSel [data-human="unity"]').click();await page.waitForFunction(()=>document.body.dataset.skyHumanLoaded==='true');
    // Use the real asynchronously loaded exports, including reversed Unity axes.
    await page.waitForFunction(()=>{const m=JSON.parse(document.body.dataset.skyModels||'{}');return ['hg','sg','smg','mg','unityHg','easyShotgun','easyM4','easyRail','easyBeam','easyCluster','easyRocket','easyM79'].every(k=>m[k]);},null,{timeout:60000});
    await page.locator('#bStart').click();await page.waitForFunction(()=>window.__game.mode==='play');
    await page.evaluate(async()=>{
     const sky=window.__skyInternals,g=window.__game,T=sky.Geom,c=sky.c;
     g.S.sendLog=false;g.S.gunOn=true;
     const human=sky.ue.children.find(o=>o.name==='Unity challenge human'),originals=new Map();let body;
     human.traverse(o=>{if(o.isMesh){originals.set(o,o.geometry.attributes.position.array.slice());if(o.name.startsWith('Body_mesh'))body=o;}});
     const rawPoint=(mesh,i,original=false)=>{
      const p=new T.Vector3().fromArray(original?originals.get(mesh):mesh.geometry.attributes.position.array,i*3);
      mesh.morphTargetInfluences.forEach((w,k)=>p.addScaledVector(new T.Vector3().fromBufferAttribute(mesh.geometry.morphAttributes.position[k],i),w));
      return p.applyMatrix4(mesh.matrixWorld);
     };
     // Select geometric chest/foot landmarks from the unarmed model, independently
     // of the aim solver's diagnostics. Asset target names are read from metadata.
     const meta=await fetch(new URL('assets/human-gunrun-animated.json',location.href)).then(r=>r.json());
     const unarmed=body.geometry.morphAttributes.position[body.morphTargetDictionary[meta.clips.jump.frames[0]]];
     human.updateMatrixWorld(true);
     const bodyToModel=human.children[0].matrixWorld.clone().invert().multiply(body.matrixWorld);
     const neutralPoints=Array.from({length:body.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromArray(originals.get(body),i*3).add(new T.Vector3().fromBufferAttribute(unarmed,i)).applyMatrix4(bodyToModel));
     const closest=goal=>neutralPoints.reduce((best,p,i)=>p.distanceTo(new T.Vector3(...goal))<neutralPoints[best].distanceTo(new T.Vector3(...goal))?i:best,0);
     const chestMarkers=[[0,1.8,.14],[0,1.8,-.23]].map(closest),head=closest([0,2.2,.1]),feet=neutralPoints.flatMap((p,i)=>p.y<.5?[i]:[]);
     const fire=window.__easyWeaponPort.fire;
     window.__easyWeaponPort.fire=ctx=>{window.__aimShot={origin:ctx.origin.toArray(),direction:ctx.direction.toArray()};return fire(ctx);};
     const fx=window.__gunFx.shot;window.__gunFx.shot=(m,...args)=>{window.__aimTracer=m.toArray();return fx(m,...args);};
     window.__aimCase=({weapon=0,pitch=0,yaw=0,state='normal',auto=false})=>{
      window.__gunFx.step(10); // Isolate the current shot in review images.
      g.S.weapon=weapon;g.S.aimAuto=auto;sky.Et.ammo=40;sky.Et.reloadT=0;sky.Et.fireCD=0;sky.Et.flashT=0;
      c.pos.set(0,200,0);c.vel.set(0,state==='air'?2:0,state==='run'?-6:0);c.camY=201.62;c.eye=1.62;c.yaw=yaw;c.pitch=pitch;c.roll=0;c.shake=0;c.landDip=0;
      c.state=state==='slide'?'slide':'normal';c.slideT=.4;c.onGround=state!=='air';
      for(let i=0;i<35;i++){g.cam(1/60);window.skyHumanView.update(1/60);}
      let enemy;
      if(auto){enemy={pos:new T.Vector3(-8,201,-12),dead:false,spawnT:0,hurt(){}};sky.Jt.push(enemy);}
      const before=g.stats.shots;window.__aimShot=null;window.__aimTracer=null;sky.fireWeapon();
      if(enemy)sky.Jt.splice(sky.Jt.indexOf(enemy),1);
      const ray=window.__aimShot,weaponObject=sky.ue.children.find(o=>o.name==='Unity human held weapon');
      weaponObject.updateMatrixWorld(true);
      const muzzle=window.skyHumanView.getMuzzleWorld(),bore=new T.Vector3(0,0,-1).applyQuaternion(weaponObject.quaternion);
      const record=JSON.parse(document.body.dataset.skyHumanShot||'null');
      const dot=ray?bore.dot(new T.Vector3(...ray.direction)):0;
      // Render this exact shot pose, then an independent side view for review.
      window.__gunFx.step(1/60);g.debug.renderer.clear();g.debug.renderer.render(sky.ue,sky.Se);
      human.updateMatrixWorld(true);
      const chest=chestMarkers.map(i=>rawPoint(body,i)),chestForward=chest[0].clone().sub(chest[1]).normalize();
      const targetDirection=new T.Vector3(...record.target).sub(chest[0].clone().add(chest[1]).multiplyScalar(.5)).normalize();
      const torsoDot=chestForward.dot(targetDirection),footError=Math.max(...feet.map(i=>rawPoint(body,i).distanceTo(rawPoint(body,i,true))));
      const headNow=rawPoint(body,head),headBefore=rawPoint(body,head,true);let equipmentError=0;
      for(const name of ['Eyes_mesh001','Gaz_mask_mesh001001','Hood_mesh001']){
       const item=human.getObjectByName(name);
       for(const i of [0,Math.floor(item.geometry.attributes.position.count/2),item.geometry.attributes.position.count-1])equipmentError=Math.max(equipmentError,Math.abs(rawPoint(item,i).distanceTo(headNow)-rawPoint(item,i,true).distanceTo(headBefore)));
      }
      const data={torsoDot,chestForward:chestForward.toArray(),footError,equipmentError,weapon,pitch,yaw,state,auto,shots:g.stats.shots-before,ray,record,dot,muzzleError:ray?muzzle.distanceTo(new T.Vector3(...ray.origin)):Infinity,tracerError:window.__aimTracer?muzzle.distanceTo(new T.Vector3(...window.__aimTracer)):null,gripError:+document.body.dataset.skyHumanGripError,glError:g.debug.renderer.getContext().getError(),models:JSON.parse(document.body.dataset.skyModels||'{}')};
      if(auto)data.autoError=new T.Vector3(...record.target).distanceTo(new T.Vector3(-8,202.1,-12));
      return data;
     };
     window.__aimSide=()=>{sky.Se.position.set(2.8,201.5,2.8);sky.Se.lookAt(0,201,0);sky.Se.updateMatrixWorld(true);g.debug.renderer.clear();g.debug.renderer.render(sky.ue,sky.Se);};
    });
    const cases=[{state:'normal',pitch:0},{state:'normal',pitch:1.2},{state:'normal',pitch:-1.2},{state:'run',pitch:.5,yaw:1.1},{state:'air',pitch:.6},{state:'air',pitch:-.8},{state:'slide',pitch:.4},{state:'normal',auto:true},{state:'slide',pitch:-.7},{state:'run',pitch:-.7},{state:'air',pitch:1.1},...[1,2,3,4,5,6,7,8,9,10,11,12].map(weapon=>({weapon,pitch:.35,yaw:-.4}))];
    for(let i=0;i<cases.length;i++){
     const result=await page.evaluate(config=>window.__aimCase(config),cases[i]);results.push({id,...result});
     assert.equal(result.shots,1,JSON.stringify(result));assert.ok(result.ray,JSON.stringify(result));
     assert.ok(result.dot>1-1e-7,`barrel direction ${JSON.stringify(result)}`);
     assert.ok(result.muzzleError<.0001,`shot starts at barrel ${JSON.stringify(result)}`);
     assert.ok(result.gripError<.045,`hands reach grips ${JSON.stringify(result)}`);
     if(result.tracerError!==null)assert.ok(result.tracerError<.0001,'tracer starts at muzzle');
     if(result.auto)assert.ok(result.autoError<1,`auto-aim target ${JSON.stringify(result)}`);
     assert.ok(result.torsoDot>.84,`visible chest follows target ${JSON.stringify(result)}`);
     assert.ok(result.footError<.00001,`visible feet retain movement pose ${JSON.stringify(result)}`);
     assert.ok(result.equipmentError<.001,`mask/eyes/hood stay with head ${JSON.stringify(result)}`);
     assert.equal(result.glError,0);
     if(i<11||[4,6,10,12].includes(result.weapon)){
      await page.screenshot({path:`browser-evidence/${id}-${i}-rear.png`});await page.evaluate(()=>window.__aimSide());await page.screenshot({path:`browser-evidence/${id}-${i}-side.png`});
     }
    }
    await page.keyboard.press('v');
    const first=await page.evaluate(()=>{const s=window.__skyInternals;window.__game.cam(1/60);window.skyHumanView.update(1/60);return window.skyHumanView.prepareShot(s.Se.position,new s.Geom.Vector3(0,0,-1),20);});
    assert.equal(first,null,'first-person fire path is unchanged');assert.deepEqual(errors,[]);
    console.log(`PASS ${id}: ${cases.length} actual shots; upward/downward, running, airborne, slide, auto-aim, all 13 weapon axes, visible chest/feet/head equipment, barrel/ray/muzzle/tracer/grip, first-person regression`);
   }catch(e){await page.screenshot({path:`browser-evidence/${id}-failure.png`}).catch(()=>{});throw e;}finally{await context.close();}
  }
 }finally{fs.writeFileSync('browser-evidence/aim-results.json',JSON.stringify(results,null,2));await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
