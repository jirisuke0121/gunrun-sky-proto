// Perspective view of the old town's live collision boxes. No separate map
// model is needed: the editor and the game use the same solids and hook list.
const $ = (id) => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), iframe = $('source');
const FOV = Math.PI / 3;
let game, api, wallApi, internals, solids = [], layout = [], selected = -1;
let wallJumps = [], selectedWallJump = -1, mode = 'hook', selectedCandidate = -1;
let tool = 'add', viewPan = false, dirty = {hook:false,walljump:false}, drag = null, hover = null, booted = false;
let launch = {x: -42, y: 0, z: 8};
let saveTimer;
const camera = {target: {x: 0, y: 4, z: 0}, distance: 180, yaw: Math.PI / 4, pitch: 0.67};
// Keep the clipping plane proportional to the view distance so close-up views
// remain visible without imposing a fixed zoom stop.
const nearClip = () => Math.max(1e-7, camera.distance * 1e-4);

function status(message, bad = false) {
  $('status').textContent = message;
  $('status').className = bad ? 'status danger' : 'status';
}
function finitePoint(p) {
  return Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(p[0]) <= 150 && p[1] >= -20 && p[1] <= 100 && Math.abs(p[2]) <= 150;
}
function finiteWallJump(p) {
  return Array.isArray(p) && p.length === 5 && p.slice(0,3).every(Number.isFinite) &&
    Math.abs(p[0]) <= 150 && p[1] >= -20 && p[1] <= 100 && Math.abs(p[2]) <= 150 &&
    ((Math.abs(p[3]) === 1 && p[4] === 0) || (p[3] === 0 && Math.abs(p[4]) === 1));
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
  if (depth <= nearClip()) return null;
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
  const clip=nearClip();
  return near>clip?near:far>clip?far:null;
}
function pick(sx,sy) {
  const {origin,dir}=ray(sx,sy);
  let best=Infinity,solid=null;
  for (const b of visibleSolids()) {
    const distance=boxDistance(origin,dir,b);
    if (distance!==null&&distance<best) {best=distance;solid=b;}
  }
  if (!solid) {
    if (Math.abs(dir.y)<1e-10) return null;
    const t=(0-origin.y)/dir.y;
    if (!Number.isFinite(t)||t<=nearClip()) return null;
    best=t;
  }
  return {x:origin.x+dir.x*best,y:origin.y+dir.y*best,z:origin.z+dir.z*best,solid};
}
function wallJumpPoint(hit) {
  const b=hit?.solid;
  if(!b||b.type!=='mono'||b.wr===false||hit.y<b.minY+.05||hit.y>b.maxY-.05)return null;
  const faces=[
    {d:Math.abs(hit.x-b.minX),x:-1,z:0},
    {d:Math.abs(hit.x-b.maxX),x:1,z:0},
    {d:Math.abs(hit.z-b.minZ),x:0,z:-1},
    {d:Math.abs(hit.z-b.maxZ),x:0,z:1},
  ].sort((a,c)=>a.d-c.d);
  const face=faces[0];
  if(face.d>.08)return null;
  const x=face.x<0?b.minX:face.x>0?b.maxX:hit.x;
  const z=face.z<0?b.minZ:face.z>0?b.maxZ:hit.z;
  return [+x.toFixed(2),+hit.y.toFixed(2),+z.toFixed(2),face.x,face.z];
}
function wallJumpPointAt(x,y,z,normal) {
  let best=null,distance=.08;
  for(const b of visibleSolids()){
    if(b.type!=='mono'||b.wr===false||y<b.minY+.05||y>b.maxY-.05)continue;
    const faces=[
      {d:Math.abs(x-b.minX),x:b.minX,z,nx:-1,nz:0,inside:z>=b.minZ-.08&&z<=b.maxZ+.08},
      {d:Math.abs(x-b.maxX),x:b.maxX,z,nx:1,nz:0,inside:z>=b.minZ-.08&&z<=b.maxZ+.08},
      {d:Math.abs(z-b.minZ),x,y,z:b.minZ,nx:0,nz:-1,inside:x>=b.minX-.08&&x<=b.maxX+.08},
      {d:Math.abs(z-b.maxZ),x,y,z:b.maxZ,nx:0,nz:1,inside:x>=b.minX-.08&&x<=b.maxX+.08},
    ];
    for(const face of faces)if(face.inside&&face.d<distance&&(!normal||(face.nx===normal[0]&&face.nz===normal[1]))){distance=face.d;best=[+face.x.toFixed(2),+y.toFixed(2),+face.z.toFixed(2),face.nx,face.nz];}
  }
  return best;
}
function polygon(points,b,fill,stroke) {
  // Clip faces against the near plane instead of dropping an entire building
  // face when a close camera crosses one of its corners.
  const clip=nearClip();
  const vertices=points.map(p=>{const relative={x:p.x-b.eye.x,y:p.y-b.eye.y,z:p.z-b.eye.z};return{x:dot(relative,b.right),y:dot(relative,b.up),depth:dot(relative,b.forward)};});
  const visible=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[(i+vertices.length-1)%vertices.length],c=vertices[i];
    const ain=a.depth>=clip,cin=c.depth>=clip;
    if(ain!==cin){const t=(clip-a.depth)/(c.depth-a.depth);visible.push({x:a.x+(c.x-a.x)*t,y:a.y+(c.y-a.y)*t,depth:clip});}
    if(cin)visible.push(c);
  }
  if(visible.length<3)return;
  ctx.beginPath();ctx.moveTo(canvas.clientWidth/2+visible[0].x*b.focal/visible[0].depth,canvas.clientHeight/2-visible[0].y*b.focal/visible[0].depth);
  for(let i=1;i<visible.length;i++)ctx.lineTo(canvas.clientWidth/2+visible[i].x*b.focal/visible[i].depth,canvas.clientHeight/2-visible[i].y*b.focal/visible[i].depth);
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
  const y0=Math.max(-2,minY),c=color(box),p=(x,y,z)=>({x,y,z});
  // Draw the two side faces looking toward the camera, then the roof or underside.
  const xNear=b.eye.x>(x0+x1)/2?x1:x0, zNear=b.eye.z>(z0+z1)/2?z1:z0;
  if (y1-y0>.04) {
    polygon([p(xNear,y1,z0),p(xNear,y1,z1),p(xNear,y0,z1),p(xNear,y0,z0)],b,shade(c,xNear===x1?.62:.7),'#14202880');
    polygon([p(x0,y1,zNear),p(x1,y1,zNear),p(x1,y0,zNear),p(x0,y0,zNear)],b,shade(c,zNear===z1?.77:.67),'#14202880');
  }
  if (b.eye.y>y1) polygon([p(x0,y1,z0),p(x1,y1,z0),p(x1,y1,z1),p(x0,y1,z1)],b,c,'#142028aa');
  if (b.eye.y<y0) polygon([p(x0,y0,z0),p(x1,y0,z0),p(x1,y0,z1),p(x0,y0,z1)],b,shade(c,.5),'#142028aa');
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
  layout.forEach(([x,y,z],i)=>{const p=project(x,y,z,b);if(!p)return;ctx.beginPath();ctx.arc(p.x,p.y,mode==='hook'&&i===selected?12:8,0,Math.PI*2);ctx.fillStyle=mode==='hook'&&i===selected?'#ffdb84':'#e9a745';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#40260b';ctx.stroke();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px system-ui';ctx.fillStyle='#292218';ctx.fillText(String(i+1),p.x,p.y);});
  wallJumps.forEach(([x,y,z,nx,nz],i)=>{const p=project(x,y,z,b);if(!p)return;const tip=project(x+nx*1.8,y,z+nz*1.8,b);ctx.beginPath();ctx.arc(p.x,p.y,mode==='walljump'&&i===selectedWallJump?12:8,0,Math.PI*2);ctx.fillStyle=mode==='walljump'&&i===selectedWallJump?'#a8f4ed':'#52d6c7';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#083b3a';ctx.stroke();if(tip){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(tip.x,tip.y);ctx.strokeStyle='#b8fff4';ctx.lineWidth=2;ctx.stroke();}ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px system-ui';ctx.fillStyle='#073432';ctx.fillText(String(i+1),p.x,p.y);});
  if(mode==='walljump')drawCandidates(b);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
  if(hover&&tool!=='testPoint'){const p=project(hover.x,hover.y+1.5,hover.z,b);if(p){ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.strokeStyle='#a6f3c3';ctx.lineWidth=2;ctx.stroke();}}
}
// Verdicts from wall-jump-candidates.js: green circle = enable a wall-run jump here, red square = checked, not recommended.
const candidates=()=>Array.isArray(window.skyWallJumpCandidates)?window.skyWallJumpCandidates:[];
const candidateSpots=c=>[c.at,...(c.also||[])];
function candidateColor(c){return c.status==='ok'?{fill:'#58e08a',edge:'#0d3b1d',line:'#9dffbf',text:'#06240f'}:{fill:'#ef6a5e',edge:'#4a1410',line:'#ffb0a8',text:'#2c0a07'};}
function drawCandidates(b){
  candidates().forEach((c,i)=>{
    const col=candidateColor(c),sel=i===selectedCandidate;
    if(c.span){const s0=project(...c.span[0],b),s1=project(...c.span[1],b);if(s0&&s1){ctx.beginPath();ctx.moveTo(s0.x,s0.y);ctx.lineTo(s1.x,s1.y);ctx.strokeStyle=col.fill+'99';ctx.lineWidth=sel?8:6;ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';}}
    if(c.path&&c.path.length>1){
      ctx.save();ctx.setLineDash([7,5]);ctx.lineWidth=sel?3:2;ctx.strokeStyle=col.line;ctx.beginPath();let started=false;
      for(const q of c.path){const p=project(q[0],q[1],q[2],b);if(!p){started=false;continue;}if(!started){ctx.moveTo(p.x,p.y);started=true;}else ctx.lineTo(p.x,p.y);}
      ctx.stroke();ctx.restore();
      const end=project(...c.path[c.path.length-1],b);if(end){ctx.beginPath();ctx.arc(end.x,end.y,4,0,Math.PI*2);ctx.fillStyle=col.line;ctx.fill();}
    }
    for(const spot of candidateSpots(c)){
      const p=project(spot[0],spot[1],spot[2],b);if(!p)continue;
      const r=sel?15:12;ctx.beginPath();
      if(c.status==='ok')ctx.arc(p.x,p.y,r,0,Math.PI*2);else ctx.rect(p.x-r*.8,p.y-r*.8,r*1.6,r*1.6);
      ctx.fillStyle=col.fill;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=col.edge;ctx.stroke();
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 12px system-ui';ctx.fillStyle=col.text;ctx.fillText(c.label,p.x,p.y);
    }
  });
}
function hitCandidate(x,y){let best=-1,depth=Infinity;candidates().forEach((c,i)=>{for(const s of candidateSpots(c)){const p=project(s[0],s[1],s[2]);if(p&&Math.hypot(x-p.x,y-p.y)<16&&p.depth<depth){best=i;depth=p.depth;}}});return best;}
function selectCandidate(i){const c=candidates()[i];if(!c)return;selectedCandidate=i;focus({x:c.at[0],y:c.at[1],z:c.at[2]});status(`${c.label} ${c.title}：${c.reason}`,c.status!=='ok');refresh();}
function renderCandidates(){
  const panel=$('candidatePanel'),list=candidates();
  panel.hidden=mode!=='walljump'||!list.length;if(panel.hidden)return;
  const ok=list.filter(c=>c.status==='ok').length;
  $('candCount').textContent=`緑 ${ok}／赤 ${list.length-ok}`;$('adoptCandidates').disabled=!ok;
  $('candidates').replaceChildren(...list.map((c,i)=>{
    const button=document.createElement('button'),head=document.createElement('span'),note=document.createElement('em');
    button.className='point cand'+(i===selectedCandidate?' selected':'');button.style.borderLeft=`5px solid ${candidateColor(c).fill}`;
    head.textContent=`${c.label} ${c.title}`;note.textContent=c.reason;button.append(head,note);button.onclick=()=>selectCandidate(i);return button;
  }));
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
function zoom(ratio,sx=canvas.clientWidth/2,sy=canvas.clientHeight/2){
  const before=pick(sx,sy),next=camera.distance*ratio;
  if(!Number.isFinite(next)||next<=1e-7)return;
  camera.distance=next;
  if(before){
    // Hold the picked point beneath the cursor at every camera angle.
    const b=basis(),{origin,dir}=ray(sx,sy,b);
    const distance=dot({x:before.x-origin.x,y:before.y-origin.y,z:before.z-origin.z},b.forward)/dot(dir,b.forward);
    if(Number.isFinite(distance)&&distance>nearClip()){
      camera.target.x+=before.x-(origin.x+dir.x*distance);
      camera.target.y+=before.y-(origin.y+dir.y*distance);
      camera.target.z+=before.z-(origin.z+dir.z*distance);
    }
  }
  draw();
}
function hitMarker(x,y){let best=-1,depth=Infinity;const points=mode==='hook'?layout:wallJumps;points.forEach((q,i)=>{const p=project(q[0],q[1],q[2]);if(p&&Math.hypot(x-p.x,y-p.y)<15&&p.depth<depth){best=i;depth=p.depth;}});return best;}
function pointFromEvent(e){const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};}
function setTool(value){tool=value;for(const id of ['add','move','testPoint','focusPoint'])$(id).classList.toggle('active',id===value);draw();}
function setViewPan(value){viewPan=value;$('viewPan').classList.toggle('active',viewPan);$('viewPan').setAttribute('aria-pressed',String(viewPan));canvas.classList.toggle('pan-mode',viewPan);}
function setMode(value){mode=value;tool='add';$('hookMode').classList.toggle('active',mode==='hook');$('wallJumpMode').classList.toggle('active',mode==='walljump');$('testPoint').hidden=mode==='walljump';refresh();setTool('add');}
function flushSave() {
  clearTimeout(saveTimer);
  let ok = true;
  for (const kind of ['hook', 'walljump']) {
    if (!dirty[kind]) continue;
    const saved = (kind === 'hook' ? api : wallApi)?.apply(kind === 'hook' ? layout : wallJumps, true);
    if (saved) dirty[kind] = false;
    else ok = false;
  }
  refresh();
  status(ok ? '自動保存済み。同じブラウザの旧市街に反映しました。' : '自動保存できませんでした。未保存の変更があります。「保存を再試行」を押してください。', !ok);
  return ok;
}
function queueSave(kind) {
  dirty[kind] = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 180);
  refresh();
}
function preview(){dirty.hook=true;if(!api.apply(layout)){clearTimeout(saveTimer);refresh();return status('座標または配置数が有効な範囲を外れています。',true);}queueSave('hook');}
function markWallJumpDirty(){dirty.walljump=true;if(!wallApi.apply(wallJumps)){clearTimeout(saveTimer);refresh();return status('壁ジャンプ地点の座標または配置数が有効な範囲を外れています。',true);}queueSave('walljump');}
function refresh(){
  draw();renderCandidates();const isWall=mode==='walljump',points=isWall?wallJumps:layout,index=isWall?selectedWallJump:selected,p=points[index];
  $('selectedTitle').textContent=isWall?'選択中の壁ジャンプ地点':'選択中のフック';$('pointsTitle').firstChild.textContent=isWall?'壁ジャンプ地点 ':'配置済み ';$('count').textContent=`${points.length}個`;
  $('reset').textContent='標準配置に戻す';$('saveNote').textContent='追加・移動・削除すると自動保存され、同じブラウザで開いている旧市街にも反映されます。';
  $('normalField').style.display=isWall?'block':'none';$('mapnote').textContent=isWall?'緑●＝壁走りジャンプ推奨、赤■＝非推奨（理由は右の一覧）。壁走りできる縦の壁面をクリックして地点を登録。番号をドラッグして移動。「視点移動」をONにしてドラッグするとマップを平行移動、OFFでは回転します。':'壁をクリックしてフックを配置、番号をドラッグして移動。「視点移動」をONにしてドラッグするとマップを平行移動、OFFでは回転します。右ドラッグでも移動できます。';
  $('handoffNote').textContent='JSONの読み込みも自動保存されます。別の端末へはJSONで受け渡せます。全プレイヤー向けの標準配置にする場合は、ソースへの反映が必要です。';
  $('loadState').textContent=(dirty[mode]?'未保存の変更あり / ':'自動保存 / ')+`地形 ${solids.length} 箱 / ${isWall?'壁ジャンプ地点':'フック'} ${points.length} 個`;$('save').disabled=!dirty.hook&&!dirty.walljump;
  for(const [k,i] of [['x',0],['y',1],['z',2]])$(k).value=p?Number(p[i].toFixed(2)):'';
  if(isWall&&p)$('normal').value=`${p[3]},${p[4]}`;
  $('remove').disabled=!p;$('move').disabled=!p;$('focusSelected').disabled=!p;
  $('points').replaceChildren(...points.map((q,i)=>{const button=document.createElement('button');button.className='point'+(i===index?' selected':'');const suffix=isWall?` / ${q[3]===1?'東':q[3]===-1?'西':q[4]===1?'南':'北'}面`:'';button.innerHTML=`<span>● ${i+1}</span><em>${q.slice(0,3).map(n=>n.toFixed(1)).join(' / ')}${suffix}</em>`;button.onclick=()=>{if(isWall)selectedWallJump=i;else selected=i;refresh();};return button;}));
  if(!p){$('reach').textContent=isWall?'壁ジャンプ地点を選択してください。':'フックを選択してください。';return;}
  if(isWall){$('reach').textContent=`壁の向き：${p[3]===1?'東':p[3]===-1?'西':p[4]===1?'南':'北'}向き。ゲーム内の壁ジャンプは現在、壁走り中の入力で発生します。`;return;}
  const start=[launch.x,launch.y+1.6,launch.z],d=[p[0]-start[0],p[1]-start[1],p[2]-start[2]],range=Math.hypot(...d),max=game.S.hookRange;let label=range<2.5?'近すぎます':range>max?'射程外':`射程内（${range.toFixed(1)} / ${max}）`;if(range>=2.5&&range<=max&&internals?.raycast){const block=internals.raycast(...start,...d.map(v=>v/range),range-.6);label+=block?'・途中に障害物あり':'・見通しあり';}$('reach').textContent='試射地点から：'+label+'。実際の使用には照準合わせも必要です。';
}
canvas.addEventListener('pointerdown',e=>{if(!api)return;const p=pointFromEvent(e),marker=hitMarker(p.x,p.y);canvas.setPointerCapture(e.pointerId);if(marker>=0){if(mode==='hook')selected=marker;else selectedWallJump=marker;}const kind=marker>=0&&e.button===0?'marker':viewPan||e.button===2||e.shiftKey?'pan':'orbit';drag={kind,x:p.x,y:p.y,moved:false,startYaw:camera.yaw,startPitch:camera.pitch,startTarget:{...camera.target}};canvas.classList.toggle('is-panning',kind==='pan');if(marker>=0)refresh();});
canvas.addEventListener('pointermove',e=>{if(!api)return;const p=pointFromEvent(e);if(!drag){hover=pick(p.x,p.y);draw();return;}const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(!drag.moved)return;hover=null;
  if(drag.kind==='marker'){const hit=pick(p.x,p.y);if(!hit)return;if(mode==='hook'){layout[selected]=[+hit.x.toFixed(2),+(hit.y+1.5).toFixed(2),+hit.z.toFixed(2)];preview();}else{const point=wallJumpPoint(hit);if(!point)return;wallJumps[selectedWallJump]=point;markWallJumpDirty();}}
  else if(drag.kind==='orbit'){camera.yaw=drag.startYaw-dx*.007;camera.pitch=drag.startPitch+dy*.007;draw();}
  else {const b=basis(),scale=camera.distance*2*Math.tan(FOV/2)/canvas.clientHeight;camera.target={x:drag.startTarget.x+(-b.right.x*dx+b.up.x*dy)*scale,y:drag.startTarget.y+(-b.right.y*dx+b.up.y*dy)*scale,z:drag.startTarget.z+(-b.right.z*dx+b.up.z*dy)*scale};draw();}
});
canvas.addEventListener('pointerup',e=>{if(!drag||!api)return;const p=pointFromEvent(e),moved=drag.moved,kind=drag.kind;drag=null;canvas.classList.remove('is-panning');if(dirty.hook||dirty.walljump)flushSave();camera.yaw%=Math.PI*2;camera.pitch%=Math.PI*2;if(moved||kind==='marker'||kind==='pan'||e.button!==0)return;const hit=pick(p.x,p.y);if(!hit)return;if(tool==='focusPoint'){focus(hit);return;}if(mode==='hook'&&tool==='testPoint'){launch={x:hit.x,y:hit.y,z:hit.z};refresh();return;}if(mode==='walljump'){const cand=hitCandidate(p.x,p.y);if(cand>=0){selectCandidate(cand);return;}const point=wallJumpPoint(hit);if(!point)return status('壁ジャンプ地点は壁走りできる縦の壁面に置いてください。',true);if(tool==='move'&&selectedWallJump>=0)wallJumps[selectedWallJump]=point;else{wallJumps.push(point);selectedWallJump=wallJumps.length-1;}markWallJumpDirty();return;}const point=[+hit.x.toFixed(2),+(hit.y+1.5).toFixed(2),+hit.z.toFixed(2)];if(tool==='move'&&selected>=0)layout[selected]=point;else{layout.push(point);selected=layout.length-1;}preview();});
canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('is-panning');if(dirty.hook||dirty.walljump)flushSave();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();const p=pointFromEvent(e);zoom(e.deltaY<0?.81:1.23,p.x,p.y);},{passive:false});
for(const id of ['add','move','testPoint','focusPoint'])$(id).onclick=()=>setTool(id);
$('hookMode').onclick=()=>setMode('hook');$('wallJumpMode').onclick=()=>setMode('walljump');
$('adoptCandidates').onclick=()=>{let added=0;for(const c of candidates()){if(c.status!=='ok')continue;const [x,y,z]=c.at,[nx,nz]=c.normal;if(wallJumps.some(w=>Math.hypot(w[0]-x,w[2]-z)<1&&w[3]===nx&&w[4]===nz))continue;wallJumps.push([x,y,z,nx,nz]);added++;}
  if(added){selectedWallJump=wallJumps.length-1;markWallJumpDirty();status(`緑の候補${added}か所を追加しました。自動保存しています。`);}
  else status('追加できる緑の候補はありません（すべて登録済みです）。');};
$('viewPan').onclick=()=>setViewPan(!viewPan);
$('fit').onclick=fit;$('zoomIn').onclick=()=>zoom(.75);$('zoomOut').onclick=()=>zoom(1.33);
$('topView').onclick=()=>{camera.pitch=1.52;draw();};$('obliqueView').onclick=()=>{camera.pitch=.67;draw();};
$('focusSelected').onclick=()=>{const p=mode==='hook'?layout[selected]:wallJumps[selectedWallJump];if(p)focus({x:p[0],y:p[1],z:p[2]});};
for(const [k,i] of [['x',0],['y',1],['z',2]])$(k).addEventListener('change',()=>{const index=mode==='hook'?selected:selectedWallJump,points=mode==='hook'?layout:wallJumps;if(index<0)return;const value=Number($(k).value);if(!Number.isFinite(value))return;if(mode==='hook'){points[index][i]=value;preview();return;}const next=points[index].slice(0,3);next[i]=value;const wall=wallJumpPointAt(...next);if(!wall){refresh();return status('壁ジャンプ地点は縦の壁面上に置いてください。',true);}wallJumps[index]=wall;markWallJumpDirty();});
$('normal').addEventListener('change',()=>{
  if(mode!=='walljump'||selectedWallJump<0)return;
  const normal=$('normal').value.split(',').map(Number),point=wallJumps[selectedWallJump];
  const wall=wallJumpPointAt(...point.slice(0,3),normal);
  if(!wall){refresh();return status('選択した向きの壁面がありません。壁面上へ移動してください。',true);}
  wallJumps[selectedWallJump]=wall;markWallJumpDirty();
});
$('remove').onclick=()=>{if(mode==='hook'){if(selected<0)return;layout.splice(selected,1);selected=Math.min(selected,layout.length-1);preview();}else{if(selectedWallJump<0)return;wallJumps.splice(selectedWallJump,1);selectedWallJump=Math.min(selectedWallJump,wallJumps.length-1);markWallJumpDirty();}};
$('save').onclick=flushSave;
$('reset').onclick=()=>{
  const isWall=mode==='walljump',registry=isWall?wallApi:api;
  if(!registry.reset())return status('標準配置に戻せませんでした。ブラウザの保存設定を確認してください。',true);
  if(isWall){wallJumps=registry.current();selectedWallJump=-1;}else{layout=registry.current();selected=-1;}
  dirty[mode]=false;refresh();status('最新の標準配置に戻し、ゲームにも反映しました。');
};
$('export').onclick=()=>{const isWall=mode==='walljump',data=isWall?{format:'gunrun-old-town-walljumps-v1',map:'old-town',wallJumps:wallJumps.map(([x,y,z,nx,nz])=>({at:[x,y,z],normal:[nx,nz]}))}:{format:'gunrun-old-town-hooks-v1',map:'old-town',hooks:layout};const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=isWall?'gunrun-old-town-walljumps.json':'gunrun-old-town-hooks.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status(isWall?'壁ジャンプ地点JSONを書き出しました。':'フック配置JSONを書き出しました。');};
$('import').onclick=()=>$('importFile').click();$('importFile').onchange=async()=>{const file=$('importFile').files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(mode==='hook'){if(data.format!=='gunrun-old-town-hooks-v1'||data.map!=='old-town'||!Array.isArray(data.hooks)||data.hooks.length>64||!data.hooks.every(finitePoint))throw Error('形式または座標が正しくありません');layout=data.hooks.map(p=>[...p]);selected=-1;preview();}else{if(data.format!=='gunrun-old-town-walljumps-v1'||data.map!=='old-town'||!Array.isArray(data.wallJumps)||data.wallJumps.length>128||!data.wallJumps.every(p=>Array.isArray(p?.at)&&Array.isArray(p?.normal)&&finiteWallJump([...p.at,...p.normal])))throw Error('形式または座標が正しくありません');const next=data.wallJumps.map(p=>[...p.at,...p.normal]);if(!next.every(p=>wallJumpPointAt(...p.slice(0,3),p.slice(3))))throw Error('壁走りできる壁面上にない地点があります');wallJumps=next;selectedWallJump=-1;markWallJumpDirty();}status('JSONを読み込みました。自動保存しています。');}catch(e){status('読み込めませんでした：'+e.message,true);}finally{$('importFile').value='';}};
new ResizeObserver(resize).observe(canvas);
async function boot(){
  if(booted)return;booted=true;
  try{
    const w=iframe.contentWindow;
    for(let i=0;i<250&&(!w.skyHookEditor||!w.skyWallJumpEditor);i++)await new Promise(r=>setTimeout(r,80));
    api=w.skyHookEditor;wallApi=w.skyWallJumpEditor;game=w.__game;internals=w.__skyInternals;
    if(!api||!wallApi||!game?.solids)throw Error('ゲームの地形を読み込めませんでした');
    w.__hold=true;solids=game.solids;layout=api.current();wallJumps=wallApi.current();
    fit();resize();refresh();status('配置の変更は自動保存され、同じブラウザの旧市街に反映されます。');
  }catch(e){status(e.message,true);$('loadState').textContent='読み込みに失敗しました。HTTPまたは公開URLで開いてください。';}
}
window.addEventListener('storage',event=>{
  if(!api||!wallApi)return;
  for(const kind of ['hook','walljump']){
    const registry=kind==='hook'?api:wallApi;
    if((event.key!==registry.key&&event.key!==null)||dirty[kind])continue;
    try{
      const next=event.newValue===null?registry.defaults():JSON.parse(event.newValue);
      if(!registry.apply(next))continue;
      if(kind==='hook'){layout=registry.current();selected=Math.min(selected,layout.length-1);}
      else{wallJumps=registry.current();selectedWallJump=Math.min(selectedWallJump,wallJumps.length-1);}
      refresh();
    }catch{/* Ignore incomplete or invalid updates from another tab. */}
  }
});
for(const name of ['pagehide','beforeunload'])window.addEventListener(name,()=>{if(dirty.hook||dirty.walljump)flushSave();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(dirty.hook||dirty.walljump))flushSave();});
if(iframe.contentDocument?.readyState==='complete')boot();else iframe.addEventListener('load',boot,{once:true});
