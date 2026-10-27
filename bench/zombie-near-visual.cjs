const fs=require('node:fs'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
(async()=>{let server,browser;try{
 server=spawn('python3',['-m','http.server','8776','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){if(await fetch('http://127.0.0.1:8776/').then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:800,height:650}});await context.addInitScript(()=>{window.__hold=true;});
 await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:8776/')?route.continue():route.fulfill({status:200,contentType:'application/json',body:'{}'}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:8776/index.html');await page.waitForFunction(()=>Object.keys(window.skyZombieNear?.results||{}).length===4,null,{timeout:60000});
 await page.evaluate(()=>{
  const sky=window.__skyInternals,g=window.__game,T=sky.Geom;
  for(const o of [...sky.ue.children])if(!o.isLight)o.visible=false;
  const ground=new T.Mesh(new T.Box(10,.03,10),new T.Standard({color:0xc3c3c3}));ground.position.y=-.02;sky.ue.add(ground);
  document.getElementById('ovStart').hidden=true;document.getElementById('hud').hidden=true;document.getElementById('touch').hidden=true;
  let z;
  window.__pose=(model,pose,mode,distance)=>{
   if(z)sky.ue.remove(z.m.root);
   const sources=sky.zombieModels(),wanted=sources[model],random=Math.random;Math.random=()=>((model+.05)/sources.length);z=new sky.ri(0,0,0);Math.random=random;z.spawnT=0;
   sky.ue.add(z.m.root);const m=z.m;const clip=m.src.clips[pose==='walk'?'Limping_Walk_1':pose==='attack'?'Attack':'Dead'];if(!clip)throw Error('clip unavailable '+pose);
   m.mx.stopAllAction();m.mx.clipAction(clip).play();m.mx.setTime(pose==='walk'?.45:pose==='attack'?.35:.6);m.root.position.set(0,0,0);m.root.rotation.y=Math.PI;
   m.root.traverse(o=>{if(o.isSkinnedMesh){o.geometry=mode==='near'?m.src.nearHi:m.src.originalHi;o.frustumCulled=false;}});
   sky.Se.fov=45;sky.Se.aspect=800/650;sky.Se.position.set(.35,1.05,distance);sky.Se.lookAt(0,.9,0);sky.Se.updateProjectionMatrix();sky.Se.updateMatrixWorld(true);
   g.debug.renderer.clear();g.debug.renderer.render(sky.ue,sky.Se);const error=g.debug.renderer.getContext().getError();if(error)throw Error('GL '+error);
   return {model:m.src.url,pose,mode,triangles:(mode==='near'?m.src.nearHi:m.src.originalHi).index.count/3};
  };
 });
 fs.mkdirSync('near-evidence',{recursive:true});const rows=[];
 for(let model=0;model<4;model++)for(const pose of ['walk','attack','dead'])for(const distance of [2.8,5])for(const mode of ['original','near']){
  rows.push(await page.evaluate(args=>window.__pose(...args),[model,pose,mode,distance]));await page.screenshot({path:`near-evidence/model-${model}-${pose}-${distance}-${mode}.png`});
 }
 fs.writeFileSync('near-evidence/visual.json',JSON.stringify(rows));console.log('PASS 4 models × walking/attack/death × 2 distances × original/near; 48 rendered comparisons');
 }finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
