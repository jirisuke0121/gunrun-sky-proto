import { createMapModel, projectPoint, levelAt, liveMarkers, localViewport, nearbyMarkers, MAP_SIZE, LEVEL_HEIGHT, LOCAL_MAP_SPAN, LOCAL_MAP_SIZE } from './minimap-model.js?v=20261101-unity-radar-v3';

// Terrain geometry is baked once. The local view and markers follow at 20Hz; no extra
// Three.js camera, scene traversal, raycasts, pathfinding or network requests.
export function installMinimap(game, publicGame) {
  const doc = document, english = doc.documentElement.lang === 'en';
  const tr = (ja,en) => english ? en : ja;
  const model = createMapModel(game.jn), cache = new Map();
  const doors = game.jn.filter(b=>b.type==='door');
  const KEY = 'sky.minimap';
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch {}
  const layerName = n => `${n}–${n+LEVEL_HEIGHT}m`;
  const canvas = (local=false) => { const c=doc.createElement('canvas');c.width=local?LOCAL_MAP_SIZE:model.pixelWidth;c.height=local?LOCAL_MAP_SIZE:model.pixelHeight;return c; };
  const staticCanvas = canvas(true), markersCanvas = canvas(true);
  const small = doc.createElement('div');
  small.setAttribute('role','img'); small.id = 'skyMinimap'; small.hidden = true;
  small.setAttribute('aria-label',tr('周辺20mのレーダー。上が前方。全体地図はメニューまたはMキーから','Nearby radar: 20m radius, forward up. Full map: menu or M key'));
  const title = doc.createElement('span'); title.className='mm-heading';
  const caption = doc.createElement('span'); caption.className='mm-caption';
  const mapArea = doc.createElement('span');mapArea.className='mm-canvas';
  mapArea.style.aspectRatio='1';
  staticCanvas.setAttribute('aria-hidden','true');markersCanvas.setAttribute('aria-hidden','true');
  mapArea.append(staticCanvas,markersCanvas);small.append(title,mapArea,caption);
  doc.getElementById('hud').append(small);

  const dialog = doc.createElement('dialog'); dialog.id='skyMapDialog';
  dialog.setAttribute('aria-labelledby','skyMapTitle');
  dialog.innerHTML=`<div class="mm-dialog-heading"><h2 id="skyMapTitle">${tr('全体地図','Full map')}</h2><button type="button" id="skyMapClose">${tr('地図を閉じる','Close map')}</button></div>
    <div class="mm-toolbar"><label>${tr('高さ','Height')} <select id="skyMapLevel"><option value="auto">${tr('現在の高さ','Current height')}</option></select></label><span class="mm-count"></span></div>
    <div class="mm-large"></div><p class="mm-legend">${tr('▲ 自分・向き　● 全ゾンビ　△ 自分より上　▽ 自分より下','▲ You / heading · ● All zombies · △ Above you · ▽ Below you')}</p>
    <p class="mm-description">${tr('北が上。明るい面は選択した高さの足場、薄い輪郭は上の構造物。オレンジの線は上下移動の接続。敵は距離や壁に関係なく全体表示。','North up. Bright surfaces are at the selected height; faint outlines are overhead structures. Orange lines connect heights. All enemies are shown through walls at any distance.')}</p>`;
  const largeTerrain=canvas(),largeMarkers=canvas();
  largeTerrain.setAttribute('aria-hidden','true');largeMarkers.setAttribute('aria-hidden','true');
  dialog.querySelector('.mm-large').append(largeTerrain,largeMarkers);
  dialog.querySelector('.mm-large').style.aspectRatio=`${model.pixelWidth} / ${model.pixelHeight}`;
  dialog.querySelector('.mm-large').style.width=`min(100%, ${56*model.pixelWidth/model.pixelHeight}dvh)`;
  doc.body.append(dialog);
  const select=dialog.querySelector('select');
  for(const level of model.levels){const option=doc.createElement('option');option.value=level;option.textContent=layerName(level);select.append(option);}
  const controls=doc.createElement('section');controls.id='skyMapControls';
  controls.innerHTML=`<button type="button" id="skyMapOpen">${tr('全体地図を見る','View full map')} <kbd>M</kbd></button><label><input type="checkbox" id="skyMinimapEnabled"> ${tr('ミニマップを表示','Show minimap')}</label>`;
  const pause=doc.getElementById('ovPause');
  pause.querySelector('.plate > .row').after(controls);
  const toggle=controls.querySelector('input');toggle.checked=enabled;
  const metrics={bakeMs:0,markerFrames:0,terrainCopies:0,lastCount:0,totalMarkerMs:0,cost:[]};
  let lastUpdate=-Infinity,smallLevel=null,largeLevel=null,automatic=model.levels[0],lastMode='';
  let currentMarkers=[],currentPlayer=null,localMarkers=[],localPlayer=null,viewport=null,lastX=NaN,lastZ=NaN,lastYaw=NaN;
  function pixelRect(ctx,b,bounds=model.bounds,size=MAP_SIZE) {
    const a=projectPoint({x:b.minX,z:b.minZ},bounds,size),q=projectPoint({x:b.maxX,z:b.maxZ},bounds,size);
    // Sub-metre beams remain visible on a whole-map overview.
    return [a.x,a.y,Math.max(.9,q.x-a.x),Math.max(.9,q.y-a.y)];
  }
  function bake(level) {
    const c=canvas(),ctx=c.getContext('2d',{alpha:false});
    ctx.fillStyle='#111d28';ctx.fillRect(0,0,MAP_SIZE,MAP_SIZE);
    for(const b of model.boxes){
      const rect=pixelRect(ctx,b);
      if(b.maxY<level-.15){ctx.fillStyle='#263e4d';ctx.fillRect(...rect);continue;}
      if(b.maxY<level+LEVEL_HEIGHT-.15){
        ctx.fillStyle=b.stair||b.slope?'#c9aa76':'#bdc8c7';ctx.fillRect(...rect);
        ctx.strokeStyle='#ced7d2';ctx.lineWidth=.65;ctx.strokeRect(...rect);
      } else if(b.minY<=level+1.5 && b.maxY>level+1.5){
        // Solid wall at this height, rather than a falsely walkable roof.
        ctx.fillStyle='#3e535e';ctx.fillRect(...rect);ctx.strokeStyle='#6d838b';ctx.lineWidth=.65;ctx.strokeRect(...rect);
      }
    }
    // Outlines do not obscure a corridor passing underneath an upper deck.
    ctx.strokeStyle='#526773';ctx.lineWidth=.55;
    for(const b of model.boxes)if(b.minY>level+1.5 && b.maxX-b.minX>1.5 && b.maxZ-b.minZ>1.5)ctx.strokeRect(...pixelRect(ctx,b));
    ctx.setLineDash([]);
    const line=(a,b)=>{const p=projectPoint(a,model.bounds),q=projectPoint(b,model.bounds);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();};
    ctx.strokeStyle='#f3ae66';ctx.lineWidth=1.5;
    for(const l of game.mo||[])if(l.y1>=level && l.y0<level+LEVEL_HEIGHT)line({x:l.x-.3,z:l.z-.3},{x:l.x+.3,z:l.z+.3});
    for(const l of publicGame.ZIPS||[])if(l.a && l.b)line({x:l.a[0],z:l.a[2]},{x:l.b[0],z:l.b[2]});
    cache.set(level,c);
  }
  const bakeStart=performance.now();for(const level of model.levels)bake(level);metrics.bakeMs=performance.now()-bakeStart;
  function terrain(target,level,view=null,yaw=0){
    const ctx=target.getContext('2d',{alpha:false});
    ctx.fillStyle='#111d28';ctx.fillRect(0,0,target.width,target.height);
    if(view){
      const source=projectPoint({x:view.minX,z:view.minZ},model.bounds),span=view.span/model.bounds.span*MAP_SIZE;
      ctx.imageSmoothingEnabled=false;
      // drawImage clips source pixels outside the atlas while preserving the
      // destination scale. The player stays centred even beside the map edge.
      ctx.save();ctx.translate(LOCAL_MAP_SIZE/2,LOCAL_MAP_SIZE/2);ctx.rotate(yaw);
      ctx.drawImage(cache.get(level),source.x,source.y,span,span,-LOCAL_MAP_SIZE/2,-LOCAL_MAP_SIZE/2,LOCAL_MAP_SIZE,LOCAL_MAP_SIZE);ctx.restore();
    } else ctx.drawImage(cache.get(level),0,0);
    if(!view){ctx.fillStyle='#d6e1de';ctx.font='bold 12px system-ui';ctx.fillText('N ↑',8,17);}metrics.terrainCopies++;
  }
  function drawMarkers(target,markers,player,level,bounds=model.bounds,size=MAP_SIZE,heading=0) {
    const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);
    // Doors change during a run: never bake a closed door into static terrain.
    ctx.fillStyle='#f3ae66';
    ctx.save();ctx.translate(target.width/2,target.height/2);ctx.rotate(heading);ctx.translate(-target.width/2,-target.height/2);
    for(const b of doors)if(!b.off && b.minY<level+LEVEL_HEIGHT && b.maxY>level)ctx.fillRect(...pixelRect(ctx,b,bounds,size));
    ctx.restore();
    for(const marker of markers){
      const x=Math.max(6,Math.min(target.width-6,marker.x)),y=Math.max(6,Math.min(target.height-6,marker.y));
      ctx.beginPath();
      if(marker.relative==='same')ctx.arc(x,y,5.5,0,Math.PI*2);
      else {const sign=marker.relative==='above'?-1:1;ctx.moveTo(x,y+sign*6.5);ctx.lineTo(x-6,y-sign*4.5);ctx.lineTo(x+6,y-sign*4.5);ctx.closePath();}
      ctx.fillStyle=marker.stalker?'#ffb35e':'#ff6578';ctx.strokeStyle='#201b29';ctx.lineWidth=1.6;ctx.fill();ctx.stroke();
    }
    if(player){
      ctx.save();ctx.translate(Math.max(10,Math.min(target.width-10,player.x)),Math.max(10,Math.min(target.height-10,player.y)));
      ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.strokeStyle='#08edff';ctx.lineWidth=2.8;ctx.stroke();
      ctx.rotate(-player.yaw);ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(-7,8);ctx.lineTo(0,4.5);ctx.lineTo(7,8);ctx.closePath();
      ctx.fillStyle='#f6ffff';ctx.strokeStyle='#061018';ctx.lineWidth=2.3;ctx.fill();ctx.stroke();ctx.restore();
    }
  }
  function activeRun(){return !['menu','over'].includes(game.modeRef()) && !window.skySettings?.beforeRun;}
  function frame(now=performance.now(),force=false) {
    const mode=game.modeRef();
    const show=enabled && mode==='play' && !game.z.over;
    if(small.hidden===show)small.hidden=!show;
    if(doc.hidden || (!show && !dialog.open))return;
    if(!force && mode===lastMode && (now-lastUpdate<50 || mode==='pause'))return;
    const started=performance.now();lastUpdate=now;lastMode=mode;
    const active=activeRun(),p=game.c;
    // Ordinary jumps keep the take-off floor selected. A ladder, grapple or
    // mantle may move through floors; refresh to the actual height on landing.
    const foot=p.onGround||['ladder','hook','mantle','ledge','zip'].includes(p.state)?p.pos.y:(p.lastGround?.y??p.pos.y);
    automatic=levelAt(foot,model.levels);
    currentMarkers=active?liveMarkers(game.Jt,p,model.bounds):[];
    currentPlayer=active?{...projectPoint(p.pos,model.bounds),yaw:p.yaw}:null;
    viewport=localViewport(p.pos);
    const fixed=window.skyFixedCamera?.active, mapYaw=fixed?window.skyFixedCamera.pose.yaw:p.yaw;
    localMarkers=active?nearbyMarkers(currentMarkers,viewport,mapYaw):[];
    localPlayer=active?{...projectPoint(p.pos,viewport,LOCAL_MAP_SIZE),yaw:p.yaw-mapYaw}:null;
    metrics.lastCount=currentMarkers.length;
    if(show){
      if(smallLevel!==automatic || lastX!==p.pos.x || lastZ!==p.pos.z || lastYaw!==mapYaw){terrain(staticCanvas,automatic,viewport,mapYaw);smallLevel=automatic;lastX=p.pos.x;lastZ=p.pos.z;lastYaw=mapYaw;}
      drawMarkers(markersCanvas,localMarkers,localPlayer,automatic,viewport,LOCAL_MAP_SIZE,mapYaw);
      const label=fixed?tr('周辺20mのレーダー。ゲーム画面と同じ向き。全体地図はメニューまたはMキーから','Nearby radar: same orientation as the game camera. Full map: menu or M key'):tr('周辺20mのレーダー。上が前方。全体地図はメニューまたはMキーから','Nearby radar: 20m radius, forward up. Full map: menu or M key');
      if(small.getAttribute('aria-label')!==label)small.setAttribute('aria-label',label);
      const text=`${tr('周辺','NEARBY')} · ${layerName(automatic)}`;
      if(title.textContent!==text)title.textContent=text;
      const info=tr(`ゾンビ ${localMarkers.length} · ${LOCAL_MAP_SPAN}m四方`,`Zombies ${localMarkers.length} · ${LOCAL_MAP_SPAN}m square`);
      if(caption.textContent!==info)caption.textContent=info;
    }
    if(dialog.open){
      const selected=select.value==='auto'?automatic:Number(select.value);
      if(largeLevel!==selected){terrain(largeTerrain,selected);largeLevel=selected;}
      drawMarkers(largeMarkers,currentMarkers,currentPlayer,selected);
      dialog.querySelector('.mm-count').textContent=tr(`全ゾンビ ${currentMarkers.length}体`,`All zombies: ${currentMarkers.length}`);
    }
    const duration=performance.now()-started;metrics.markerFrames++;metrics.totalMarkerMs+=duration;
    metrics.cost.push(duration);if(metrics.cost.length>240)metrics.cost.shift();
  }
  function openMap(){
    if(dialog.open)return;
    document.exitPointerLock?.();
    if(game.modeRef()==='play')game.An('pause');
    select.value='auto';dialog.showModal();frame(performance.now(),true);dialog.querySelector('button').focus();
  }
  controls.querySelector('button').addEventListener('click',openMap);
  for(const target of [controls,dialog])for(const event of ['pointerdown','pointerup','pointermove','click','contextmenu'])target.addEventListener(event,e=>e.stopPropagation());
  dialog.querySelector('#skyMapClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close();});
  dialog.addEventListener('close',()=>{if(game.modeRef()==='pause')doc.getElementById('bResume').focus();});
  select.addEventListener('change',()=>frame(performance.now(),true));
  toggle.addEventListener('change',()=>{enabled=toggle.checked;try{localStorage.setItem(KEY,enabled?'on':'off');}catch{}frame(performance.now(),true);});
  window.addEventListener('keydown',e=>{
    if(dialog.open && e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();dialog.close();return;}
    if(e.code!=='KeyM'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(!['play','pause'].includes(game.modeRef()))return;
    e.preventDefault();e.stopImmediatePropagation();if(dialog.open)dialog.close();else openMap();
  },true);
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)frame(performance.now(),true);});
  return {
    frame,
    modeChanged(mode){if(!['pause','play'].includes(mode)&&dialog.open)dialog.close();frame(performance.now(),true);},
    snapshot(){const cost=[...metrics.cost].sort((a,b)=>a-b);return{
      enabled,visible:!small.hidden,expanded:dialog.open,automaticLevel:automatic,
      selectedLevel:select.value==='auto'?automatic:Number(select.value),bounds:{...model.bounds},levels:[...model.levels],
      boxes:model.boxes.length,pixelWidth:model.pixelWidth,pixelHeight:model.pixelHeight,
      cachedBytes:cache.size*model.pixelWidth*model.pixelHeight*4,bakeMs:metrics.bakeMs,
      markerFrames:metrics.markerFrames,terrainCopies:metrics.terrainCopies,count:metrics.lastCount,
      totalMarkerMs:metrics.totalMarkerMs,closedDoors:doors.filter(b=>!b.off).length,
      markers:currentMarkers.map(m=>({...m,world:{...m.world}})),player:currentPlayer?{...currentPlayer}:null,
      localSpan:LOCAL_MAP_SPAN,shape:'circle',headingUp:!window.skyFixedCamera?.active,localBounds:viewport?{...viewport}:null,nearbyCount:localMarkers.length,
      nearbyMarkers:localMarkers.map(m=>({...m,world:{...m.world}})),playerLocal:localPlayer?{...localPlayer}:null,
      markerMeanMs:cost.reduce((a,b)=>a+b,0)/(cost.length||1),markerP95Ms:cost[Math.floor(cost.length*.95)]||0,
    };},
  };
}
