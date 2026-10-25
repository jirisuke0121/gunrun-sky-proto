// Perspective view of the old town's live collision boxes. No separate map
// model is needed: the editor and the game use the same solids and hook list.
const $ = (id) => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), iframe = $('source');
const FOV = Math.PI / 3, NEAR = 0.2;
let game, api, internals, solids = [], layout = [], defaults = [], selected = -1;
let tool = 'add', dirty = false, drag = null, hover = null, booted = false;
let launch = {x: -42, y: 0, z: 8};
const camera = {target: {x: 0, y: 4, z: 0}, distance: 180, yaw: Math.PI / 4, pitch: 0.67};

function status(message, bad = false) {
  $('status').textContent = message;
  $('status').className = bad ? 'status danger' : 'status';
}
function finitePoint(p) {
  return Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(p[0]) <= 150 && p[1] >= -20 && p[1] <= 100 && Math.abs(p[2]) <= 150;
}
function visibleSolids() {
  return solids.filter(b => !b.off && b.maxY >= -6 && b.maxX-b.minX < 110 && b.maxZ-b.minZ < 110);
}
function basis() {
  const sy = Math.sin(camera.yaw), cy = Math.cos(camera.yaw);
  const sp = Math.sin(camera.pitch), cp = Math.cos(camera.pitch);
  const forward = {x:-sy*cp, y:-sp, z:-cy*cp};
  const right = {x:cy, y:0, z:-sy};
  const up = {x:-sy*sp, y:cp, z:-cy*sp};
  const eye = {
    x:camera.target.x-forward.x*camera.distance,
    y:camera.target.y-forward.y*camera.distance,
    z:camera.target.z-forward.z*camera.distance,
  };
  return {forward,right,up,eye,focal:canvas.clientHeight/(2*Math.tan(FOV/2))};
}
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
function project(x,y,z,b=basis()) {
  const relative = {x:x-b.eye.x,y:y-b.eye.y,z:z-b.eye.z};
  const depth = dot(relative,b.forward);
  if (depth <= NEAR) return null;
  return {
    x:canvas.clientWidth/2+dot(relative,b.right)*b.focal/depth,
    y:canvas.clientHeight/2-dot(relative,b.up)*b.focal/depth,
    depth,
  };
}
function ray(sx,sy,b=basis()) {
  const horizontal=(sx-canvas.clientWidth/2)/b.focal;
  const vertical=(canvas.clientHeight/2-sy)/b.focal;
  const d={x:b.forward.x+b.right.x*horizontal+b.up.x*vertical,
           y:b.forward.y+b.right.y*horizontal+b.up.y*vertical,
           z:b.forward.z+b.right.z*horizontal+b.up.z*vertical};
  const length=Math.hypot(d.x,d.y,d.z);
  return {origin:b.eye,dir:{x:d.x/length,y:d.y/length,z:d.z/length}};
}
function boxDistance(origin,dir,b) {
  let near=-Infinity,far=Infinity;
  for (const axis of ['X','Y','Z']) {
    const key=axis.toLowerCase(),d=dir[key],o=origin[key],lo=b['min'+axis],hi=b['max'+axis];
    if (Math.abs(d)<1e-9) { if (o<lo||o>hi) return null; continue; }
    let a=(lo-o)/d,c=(hi-o)/d;if(a>c)[a,c]=[c,a];
    near=Math.max(near,a);far=Math.min(far,c);
    if (near>far) return null;
  }
  return near>NEAR?near:far>NEAR?far:null;
}
function pick(sx,sy) {
  const {origin,dir}=ray(sx,sy);
  let best=Infinity,solid=null;
  for (const b of visibleSolids()) {
    const distance=boxDistance(origin,dir,b);
    if (distance!==null&&distance<best) {best=distance;solid=b;}
  }
  if (!solid) {
    const t=(0-origin.y)/dir.y;
    if (t<=NEAR) return null;
    best=t;
  }
  return {x:origin.x+dir.x*best,y:origin.y+dir.y*best,z:origin.z+dir.z*best,solid};
}
function planeHit(sx,sy,height) {
  const {origin,dir}=ray(sx,sy),t=(height-origin.y)/dir.y;
  return t>NEAR?{x:origin.x+dir.x*t,y:height,z:origin.z+dir.z*t}:null;
}
function polygon(points,fill,stroke) {
  if (points.some(p=>!p)) return;
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}
function color(b) {
  if(b.tint!=null)return '#'+Number(b.tint).toString(16).padStart(6,'0');
  return {beam:'#b7a676',slab:'#d1c59e',mono:'#9b967f',prop:'#c5875d',door:'#668991'}[b.type]||'#9daeb0';
}
function shade(hex,factor) {
  const h=hex.slice(1);
  return '#'+[0,2,4].map(i=>Math.max(0,Math.min(255,Math.round(parseInt(h.slice(i,i+2),16)*factor))).toString(16).padStart(2,'0')).join('');
}
function drawLine(a,b,color='#66818a44') {
  if(!a||!b)return;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();
}
function drawBox(box,b) {
  const {minX:x0,maxX:x1,minY,maxY:y1,minZ:z0,maxZ:z1}=box;
  const y0=Math.max(-2,minY),c=color(box),p=(x,y,z)=>project(x,y,z,b);
  // Draw the two side faces looking toward the camera, followed by the roof.
  const xNear=b.eye.x>(x0+x1)/2?x1:x0, zNear=b.eye.z>(z0+z1)/2?z1:z0;
  if (y1-y0>.04) {
    polygon([p(xNear,y1,z0),p(xNear,y1,z1),p(xNear,y0,z1),p(xNear,y0,z0)],shade(c,xNear===x1?.62:.7),'#14202880');
    polygon([p(x0,y1,zNear),p(x1,y1,zNear),p(x1,y0,zNear),p(x0,y0,zNear)],shade(c,zNear===z1?.77:.67),'#14202880');
  }
  if (b.eye.y>y1) polygon([p(x0,y1,z0),p(x1,y1,z0),p(x1,y1,z1),p(x0,y1,z1)],c,'#142028aa');
}
function draw() {
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#1b2c34';ctx.fillRect(0,0,w,h);
  if (!solids.length)return;
  const b=basis();
  for(let i=-120;i<=120;i+=10){drawLine(project(i,-2,-120,b),project(i,-2,120,b));drawLine(project(-120,-2,i,b),project(120,-2,i,b));}
  const items=visibleSolids();
  items.sort((a,c)=>{
    const da=dot({x:(a.minX+a.maxX)/2-b.eye.x,y:a.maxY-b.eye.y,z:(a.minZ+a.maxZ)/2-b.eye.z},b.forward);
    const dc=dot({x:(c.minX+c.maxX)/2-b.eye.x,y:c.maxY-b.eye.y,z:(c.minZ+c.maxZ)/2-b.eye.z},b.forward);
    return dc-da;
  });
  for(const solid of items)drawBox(solid,b);
  const start=project(launch.x,launch.y+1.6,launch.z,b);
  if(start){ctx.fillStyle='#7ce4f2';ctx.beginPath();ctx.arc(start.x,start.y,7,0,Math.PI*2);ctx.fill();ctx.font='11px system-ui';ctx.fillText('試射地点',start.x+9,start.y-8);}
  layout.forEach(([x,y,z],i)=>{const p=project(x,y,z,b);if(!p)return;ctx.beginPath();ctx.arc(p.x,p.y,i===selected?12:9,0,Math.PI*2);ctx.fillStyle=i===selected?'#ffdb84':'#e9a745';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#40260b';ctx.stroke();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px system-ui';ctx.fillStyle='#292218';ctx.fillText(String(i+1),p.x,p.y);});
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
  if(hover&&tool!=='testPoint'){const p=project(hover.x,hover.y+1.5,hover.z,b);if(p){ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.strokeStyle='#a6f3c3';ctx.lineWidth=2;ctx.stroke();}}
}
function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(canvas.clientWidth*dpr);canvas.height=Math.round(canvas.clientHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
function fit(){const items=visibleSolids();if(!items.length)return;
  const x0=Math.min(...items.map(b=>b.minX)),x1=Math.max(...items.map(b=>b.maxX));
  const z0=Math.min(...items.map(b=>b.minZ)),z1=Math.max(...items.map(b=>b.maxZ));
  camera.target={x:(x0+x1)/2,y:5,z:(z0+z1)/2};camera.yaw=Math.PI/4;camera.pitch=.67;
  const span=Math.hypot(x1-x0,z1-z0);camera.distance=Math.max(60,span/(2*Math.tan(FOV/2))*1.25);
  draw();
}
function focus(point){camera.target={x:point.x,y:point.y,z:point.z};camera.distance=Math.min(camera.distance,38);draw();}
function zoom(ratio,sx=canvas.clientWidth/2,sy=canvas.clientHeight/2){const before=pick(sx,sy);camera.distance=Math.max(8,Math.min(400,camera.distance*ratio));const after=before&&planeHit(sx,sy,before.y);if(before&&after){camera.target.x+=before.x-after.x;camera.target.z+=before.z-after.z;}draw();}
function hitMarker(x,y){let best=-1,depth=Infinity;layout.forEach((q,i)=>{const p=project(...q);if(p&&Math.hypot(x-p.x,y-p.y)<15&&p.depth<depth){best=i;depth=p.depth;}});return best;}
function pointFromEvent(e){const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};}
function setTool(value){tool=value;for(const id of ['add','move','testPoint','focusPoint'])$(id).classList.toggle('active',id===value);draw();}
function preview(){if(!api.apply(layout))return status('座標が有効な範囲を外れています。',true);dirty=true;refresh();}
function refresh(){draw();$('count').textContent=`${layout.length}個`;$('loadState').textContent=dirty?'未保存の変更があります。保存してゲームへ反映してください。':`地形 ${solids.length} 箱 / フック ${layout.length} 個を表示中`;$('save').disabled=!dirty;const p=layout[selected];for(const [k,i] of [['x',0],['y',1],['z',2]])$(k).value=p?Number(p[i].toFixed(2)):'';$('remove').disabled=!p;$('move').disabled=!p;$('focusSelected').disabled=!p;
  $('points').replaceChildren(...layout.map((q,i)=>{const button=document.createElement('button');button.className='point'+(i===selected?' selected':'');button.innerHTML=`<span>● ${i+1}</span><em>${q.map(n=>n.toFixed(1)).join(' / ')}</em>`;button.onclick=()=>{selected=i;refresh();};return button;}));
  if(!p){$('reach').textContent='フックを選択してください。';return;}const start=[launch.x,launch.y+1.6,launch.z],d=[p[0]-start[0],p[1]-start[1],p[2]-start[2]],range=Math.hypot(...d),max=game.S.hookRange;let label=range<2.5?'近すぎます':range>max?'射程外':`射程内（${range.toFixed(1)} / ${max}）`;if(range>=2.5&&range<=max&&internals?.raycast){const block=internals.raycast(...start,...d.map(v=>v/range),range-.6);label+=block?'・途中に障害物あり':'・見通しあり';}$('reach').textContent='試射地点から：'+label+'。実際の使用には照準合わせも必要です。';
}
canvas.addEventListener('pointerdown',e=>{if(!api)return;const p=pointFromEvent(e),marker=hitMarker(p.x,p.y);canvas.setPointerCapture(e.pointerId);selected=marker>=0?marker:selected;drag={kind:marker>=0&&e.button===0?'marker':e.button===2||e.shiftKey?'pan':'orbit',x:p.x,y:p.y,moved:false,startYaw:camera.yaw,startPitch:camera.pitch,startTarget:{...camera.target}};if(marker>=0)refresh();});
canvas.addEventListener('pointermove',e=>{if(!api)return;const p=pointFromEvent(e);if(!drag){hover=pick(p.x,p.y);draw();return;}const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(!drag.moved)return;hover=null;
  if(drag.kind==='marker'){const hit=pick(p.x,p.y);if(!hit)return;layout[selected]=[+hit.x.toFixed(2),+(hit.y+1.5).toFixed(2),+hit.z.toFixed(2)];preview();}
  else if(drag.kind==='orbit'){camera.yaw=drag.startYaw-dx*.007;camera.pitch=Math.max(.14,Math.min(1.52,drag.startPitch+dy*.005));draw();}
  else {const b=basis(),scale=camera.distance*2*Math.tan(FOV/2)/canvas.clientHeight;camera.target={x:drag.startTarget.x+(-b.right.x*dx+b.up.x*dy)*scale,y:drag.startTarget.y+(-b.right.y*dx+b.up.y*dy)*scale,z:drag.startTarget.z+(-b.right.z*dx+b.up.z*dy)*scale};draw();}
});
canvas.addEventListener('pointerup',e=>{if(!drag||!api)return;const p=pointFromEvent(e),moved=drag.moved,kind=drag.kind;drag=null;if(moved||kind==='marker'||e.button!==0)return;const hit=pick(p.x,p.y);if(!hit)return;if(tool==='focusPoint'){focus(hit);return;}if(tool==='testPoint'){launch={x:hit.x,y:hit.y,z:hit.z};refresh();return;}const point=[+hit.x.toFixed(2),+(hit.y+1.5).toFixed(2),+hit.z.toFixed(2)];if(tool==='move'&&selected>=0)layout[selected]=point;else{layout.push(point);selected=layout.length-1;}preview();});
canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();const p=pointFromEvent(e);zoom(e.deltaY<0?.81:1.23,p.x,p.y);},{passive:false});
for(const id of ['add','move','testPoint','focusPoint'])$(id).onclick=()=>setTool(id);
$('fit').onclick=fit;$('zoomIn').onclick=()=>zoom(.75);$('zoomOut').onclick=()=>zoom(1.33);
$('topView').onclick=()=>{camera.pitch=1.52;draw();};$('obliqueView').onclick=()=>{camera.pitch=.67;draw();};
$('focusSelected').onclick=()=>{if(selected>=0)focus({x:layout[selected][0],y:layout[selected][1],z:layout[selected][2]});};
for(const [k,i] of [['x',0],['y',1],['z',2]])$(k).addEventListener('change',()=>{if(selected<0)return;const value=Number($(k).value);if(!Number.isFinite(value))return;layout[selected][i]=value;preview();});
$('remove').onclick=()=>{if(selected<0)return;layout.splice(selected,1);selected=Math.min(selected,layout.length-1);preview();};
$('save').onclick=()=>{if(!api.apply(layout,true))return status('保存できませんでした。ブラウザの保存設定を確認してください。',true);dirty=false;refresh();status('このブラウザに保存しました。ゲームを開き直すと配置が反映されます。');};
$('reset').onclick=()=>{layout=defaults.map(p=>[...p]);selected=-1;api.reset();dirty=false;refresh();status('初期配置に戻しました。');};
$('export').onclick=()=>{const data={format:'gunrun-old-town-hooks-v1',map:'old-town',hooks:layout};const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gunrun-old-town-hooks.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('配置JSONを書き出しました。');};
$('import').onclick=()=>$('importFile').click();$('importFile').onchange=async()=>{const file=$('importFile').files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='gunrun-old-town-hooks-v1'||data.map!=='old-town'||!Array.isArray(data.hooks)||data.hooks.length>64||!data.hooks.every(finitePoint))throw Error('形式または座標が正しくありません');layout=data.hooks.map(p=>[...p]);selected=-1;preview();status('JSONを読み込みました。確認してから保存してください。');}catch(e){status('読み込めませんでした：'+e.message,true);}finally{$('importFile').value='';}};
new ResizeObserver(resize).observe(canvas);
async function boot(){if(booted)return;booted=true;try{const w=iframe.contentWindow;for(let i=0;i<250&&!w.skyHookEditor;i++)await new Promise(r=>setTimeout(r,80));api=w.skyHookEditor;game=w.__game;internals=w.__skyInternals;if(!api||!game?.solids)throw Error('ゲームの地形を読み込めませんでした');w.__hold=true;solids=game.solids;defaults=api.defaults();layout=api.current();fit();resize();refresh();status('左ドラッグで回転、ホイールで近づけます。');}catch(e){status(e.message,true);$('loadState').textContent='読み込みに失敗しました。HTTPまたは公開URLで開いてください。';}}
if(iframe.contentDocument?.readyState==='complete')boot();else iframe.addEventListener('load',boot,{once:true});
