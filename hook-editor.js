// Perspective view of the old town's live collision boxes. No separate map
// model is needed: the editor and the game use the same solids and hook list.
const $ = (id) => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), iframe = $('source');
const FOV = Math.PI / 3;
let game, api, wallApi, internals, solids = [], layout = [], selected = -1;
let wallJumps = [], selectedWallJump = -1, bars = [], selectedBar = -1, mode = 'hook', selectedCandidate = -1;
const DRAFT_KEY='gunrun-old-town-marker-draft-v2', DRAFT_FORMAT='gunrun-old-town-marker-draft-v2';
const SOURCE_VERSION='20261029-bars-v1';
let draft, published, storageOK=true;
let tool = 'add', viewPan = false, dirty = {hook:false,walljump:false,bar:false}, drag = null, hover = null, booted = false;
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
  if(published&&draft)for(const kind of ['hook','walljump','bar'])published[kind].forEach((q,i)=>{
    if(rows(kind).some(p=>JSON.stringify(p)===JSON.stringify(q)))return;
    const p=project(q[0],q[1],q[2],b);if(!p)return;ctx.save();ctx.setLineDash([3,3]);ctx.strokeStyle='#d6e4f2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.stroke();ctx.restore();ctx.font='10px system-ui';ctx.fillStyle='#d6e4f2';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText('標準'+(i+1),p.x+12,p.y-6);
  });
  const start=project(launch.x,launch.y+1.6,launch.z,b);
  if(start){ctx.fillStyle='#7ce4f2';ctx.beginPath();ctx.arc(start.x,start.y,7,0,Math.PI*2);ctx.fill();ctx.font='11px system-ui';ctx.fillText('試射地点',start.x+9,start.y-8);}
  layout.forEach(([x,y,z],i)=>{const p=project(x,y,z,b);if(!p)return;ctx.beginPath();ctx.arc(p.x,p.y,mode==='hook'&&i===selected?12:8,0,Math.PI*2);ctx.fillStyle=mode==='hook'&&i===selected?'#ffdb84':'#e9a745';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#40260b';ctx.stroke();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px system-ui';ctx.fillStyle='#292218';ctx.fillText(String(i+1),p.x,p.y);});
  wallJumps.forEach(([x,y,z,nx,nz],i)=>{const p=project(x,y,z,b);if(!p)return;const tip=project(x+nx*1.8,y,z+nz*1.8,b);ctx.beginPath();ctx.arc(p.x,p.y,mode==='walljump'&&i===selectedWallJump?12:8,0,Math.PI*2);ctx.fillStyle=mode==='walljump'&&i===selectedWallJump?'#a8f4ed':'#52d6c7';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#083b3a';ctx.stroke();if(tip){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(tip.x,tip.y);ctx.strokeStyle='#b8fff4';ctx.lineWidth=2;ctx.stroke();}ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px system-ui';ctx.fillStyle='#073432';ctx.fillText(String(i+1),p.x,p.y);});
  bars.forEach(([x,y,z,dx,dz,width],i)=>{
    const side=[-dz,dx],a=project(x-side[0]*width/2,y,z-side[1]*width/2,b),c=project(x+side[0]*width/2,y,z+side[1]*width/2,b),p=project(x,y,z,b),tip=project(x+dx*1.8,y,z+dz*1.8,b);
    if(!p)return;ctx.lineWidth=mode==='bar'&&selectedBar===i?7:5;ctx.strokeStyle='#ee9bf5';if(a&&c){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();}drawLine(p,tip,'#ffd0ff');ctx.beginPath();ctx.arc(p.x,p.y,mode==='bar'&&selectedBar===i?12:8,0,Math.PI*2);ctx.fillStyle='#e7a3ef';ctx.fill();ctx.fillStyle='#35213a';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px system-ui';ctx.fillText(String(i+1),p.x,p.y);
  });
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
const kinds=['hook','walljump','bar'], labels={hook:'フック',walljump:'壁ジャンプ',bar:'鉄棒'};
const clone=v=>JSON.parse(JSON.stringify(v));
const rows=kind=>kind==='hook'?layout:kind==='walljump'?wallJumps:bars;
const selection=()=>mode==='hook'?selected:mode==='walljump'?selectedWallJump:selectedBar;
function select(i){if(mode==='hook')selected=i;else if(mode==='walljump')selectedWallJump=i;else selectedBar=i;}
function assign(kind,value){if(kind==='hook')layout=value;else if(kind==='walljump')wallJumps=value;else bars=value;}
const validBar=p=>Array.isArray(p)&&p.length===6&&finitePoint(p.slice(0,3))&&finiteWallJump([...p.slice(0,5)])&&p[5]>=1.4&&p[5]<=8;
const validRows=(kind,value)=>Array.isArray(value)&&value.length<=(kind==='hook'?64:128)&&value.every(kind==='hook'?finitePoint:kind==='walljump'?finiteWallJump:validBar);
function validDraft(v){return v?.format===DRAFT_FORMAT&&v.map==='old-town'&&kinds.every(k=>validRows(k,v.baseline?.[k])&&validRows(k,v.points?.[k])&&Array.isArray(v.ids?.[k])&&v.ids[k].length===v.points[k].length&&v.ids[k].every(id=>typeof id==='string'&&id.length<100)&&new Set(v.ids[k]).size===v.ids[k].length)&&v.notes&&typeof v.notes==='object'&&!Array.isArray(v.notes)&&Object.values(v.notes).every(n=>typeof n==='string'&&n.length<=2000);}
function hitMarker(x,y){let best=-1,depth=Infinity;rows(mode).forEach((q,i)=>{const p=project(q[0],q[1],q[2]);if(p&&Math.hypot(x-p.x,y-p.y)<15&&p.depth<depth){best=i;depth=p.depth;}});return best;}
function pointFromEvent(e){const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};}
function setTool(value){tool=value;for(const id of ['add','move','testPoint','focusPoint'])$(id).classList.toggle('active',id===value);draw();}
function setViewPan(value){viewPan=value;$('viewPan').classList.toggle('active',viewPan);$('viewPan').setAttribute('aria-pressed',String(viewPan));canvas.classList.toggle('pan-mode',viewPan);}
function setMode(value){mode=value;for(const [id,k] of [['hookMode','hook'],['wallJumpMode','walljump'],['barMode','bar']])$(id).classList.toggle('active',mode===k);$('testPoint').hidden=mode!=='hook';refresh();setTool('add');}
function syncDraft(){for(const kind of kinds)draft.points[kind]=clone(rows(kind));}
function flushSave(){clearTimeout(saveTimer);if(!draft)return false;syncDraft();try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));for(const k of kinds)dirty[k]=false;storageOK=true;refresh();status('下書きを保存しました。ゲームの配置・判定は変わりません。');return true;}catch{storageOK=false;refresh();status('端末に保存できません。変更依頼文のコピーかJSON書き出しで退避してください。',true);return false;}}
function changed(){dirty[mode]=true;clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,180);refresh();}
function fmt(q,kind){if(!q)return 'なし';const xyz=`X ${q[0]} / Y ${q[1]} / Z ${q[2]}`;return xyz+(kind==='hook'?'':` / ${kind==='bar'?'飛ぶ向き':'壁面の向き'} [${q[3]}, ${q[4]}]`)+(kind==='bar'?` / 幅 ${q[5]}m`:'');}
function requestText(){if(!draft)return '';syncDraft();const lines=['旧市街の配置変更依頼',`参照版：${draft.sourceVersion||SOURCE_VERSION} / map: old-town`,'この文章は下書きです。ゲームへの反映・成立確認はまだ行っていません。'];let n=0;
  for(const kind of kinds){const baseline=draft.baseline[kind],ids=draft.ids[kind],points=rows(kind),original=new Set(baseline.map((_,i)=>`${kind}-base-${i+1}`));
    baseline.forEach((before,i)=>{const id=`${kind}-base-${i+1}`,index=ids.indexOf(id),after=index<0?null:points[index],note=draft.notes[id]||'';if(after&&JSON.stringify(before)===JSON.stringify(after)&&!note)return;n++;lines.push(``,`${n}. ${labels[kind]} ${after?'移動・調整':'削除'} (${id})`,`変更前：${fmt(before,kind)}`,`変更後：${fmt(after,kind)}`);if(note)lines.push('メモ：'+note);});
    points.forEach((after,i)=>{const id=ids[i];if(original.has(id))return;n++;lines.push('',`${n}. ${labels[kind]} 追加 (${id})`,'変更前：なし',`変更後：${fmt(after,kind)}`);if(draft.notes[id])lines.push('メモ：'+draft.notes[id]);});
  }if(!n)lines.push('変更はありません。');return lines.join('\n');}
function updateRequest(){$('requestText').value=requestText();}
function refresh(){if(!draft)return;draw();renderCandidates();const kind=mode,isWall=kind==='walljump',isBar=kind==='bar',points=rows(kind),index=selection(),p=points[index];
  $('selectedTitle').textContent='選択中の'+labels[kind];$('pointsTitle').firstChild.textContent=labels[kind]+' ';$('count').textContent=points.length+'個';
  $('reset').textContent='この種類の下書きを戻す';$('saveNote').textContent='マーキング専用：下書きだけを端末に自動保存します。ゲームの配置・判定には反映しません。移動・削除した場所の輪郭は標準配置です。';
  $('normalField').style.display=isWall||isBar?'block':'none';$('normalField').firstChild.textContent=isBar?'飛ぶ向き（鉄棒は直角に伸びます）':'壁の向き';
  for(const opt of $('normal').options){const names={'1,0':'東','-1,0':'西','0,1':'南','0,-1':'北'};opt.textContent=names[opt.value]+(isBar?'へ振る':'向きの壁面');}
  $('barWidthField').hidden=!isBar;$('barWidth').value=isBar&&p?p[5]:2.6;
  $('mapnote').textContent=isBar?'鉄棒の下書き：床・屋根をタップすると3m上に仮置き。高さ・飛ぶ向き・幅を調整できます。紫の線が鉄棒、細線が振る方向。番号のドラッグで移動。ゲームには反映しません。':isWall?'壁走りできる縦の壁面をタップしてマーキング。緑は推奨候補、赤は非推奨候補。番号をドラッグして移動。ゲームの標準5面は変わりません。':'壁や床をタップしてフックをマーキング。番号をドラッグして移動。ゲームの配置は変わりません。';
  $('handoffNote').textContent='3種類をまとめてJSONに保存・読み込みできます。変更依頼文をチャットへ貼って実装を依頼してください。';
  $('loadState').textContent=(kinds.some(k=>dirty[k])?'未保存の下書き / ':'下書き保存済み / ')+`地形 ${solids.length} 箱 / ${labels[kind]} 標準 ${published?.[kind].length??0}・下書き ${points.length} 個`;$('save').disabled=!kinds.some(k=>dirty[k]);
  for(const [k,i]of [['x',0],['y',1],['z',2]]){$(k).value=p?Number(p[i].toFixed(2)):'';$(k).disabled=!p;}
  if((isWall||isBar)&&p)$('normal').value=`${p[3]},${p[4]}`;
  $('pointNote').disabled=!p;$('pointNote').value=p?(draft.notes[draft.ids[kind][index]]||''):'';
  for(const id of ['remove','move','focusSelected'])$(id).disabled=!p;
  $('points').replaceChildren(...points.map((q,i)=>{const button=document.createElement('button');button.className='point'+(i===index?' selected':'');const a=document.createElement('span'),b=document.createElement('em');a.textContent=`● ${i+1}`;b.textContent=q.slice(0,3).map(n=>n.toFixed(1)).join(' / ')+(isBar?` / 幅${q[5]}m`:'');button.append(a,b);button.onclick=()=>{select(i);refresh();};return button;}));
  $('reach').textContent=!p?labels[kind]+'を選択してください。':isBar?'Yは鉄棒の中心の高さ。飛ぶ向きと直角に横棒を置きます。これは下書きで、つかみ・着地は実装後に確認します。':isWall?'壁面上の下書きです。既存の壁ジャンプ判定は変わりません。':'フックの下書きです。実際の射程・障害物・移動経路は実装後に確認します。';if(p&&kind==='hook'){
    const start=[launch.x,launch.y+1.6,launch.z],d=p.map((v,i)=>v-start[i]),range=Math.hypot(...d),max=game.S.hookRange;
    let text=range<2.5?'近すぎます':range>max?'射程外':`射程内（${range.toFixed(1)} / ${max}）`;
    if(range>=2.5&&range<=max&&internals?.raycast)text+=internals.raycast(...start,...d.map(v=>v/range),range-.6)?'・途中に障害物あり':'・見通しあり';
    $('reach').textContent='試射地点から：'+text+'。下書きなのでゲームのフックは動きません。';
  }updateRequest();
}
function newPoint(hit,old){if(mode==='walljump')return wallJumpPoint(hit);if(mode==='bar')return [+hit.x.toFixed(2),+(hit.y+3).toFixed(2),+hit.z.toFixed(2),...(old?old.slice(3):$('normal').value.split(',').map(Number).concat(Number($('barWidth').value)||2.6))];return [+hit.x.toFixed(2),+(hit.y+1.5).toFixed(2),+hit.z.toFixed(2)];}
function put(hit,moving=false){const points=rows(mode),index=selection(),p=newPoint(hit,moving?points[index]:null);if(!p)return status('壁走りできる縦の壁面を選んでください。',true);if(!validRows(mode,[p]))return status('座標・向き・幅が範囲外です。',true);if(moving&&index>=0)points[index]=p;else{if(points.length>=(mode==='hook'?64:128))return status('配置数の上限です。',true);points.push(p);draft.ids[mode].push(mode+'-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2)));select(points.length-1);}changed();}
canvas.addEventListener('pointerdown',e=>{if(!draft)return;const p=pointFromEvent(e),marker=hitMarker(p.x,p.y);canvas.setPointerCapture(e.pointerId);if(marker>=0)select(marker);const kind=marker>=0&&e.button===0?'marker':viewPan||e.button===2||e.shiftKey?'pan':'orbit';drag={kind,x:p.x,y:p.y,moved:false,startYaw:camera.yaw,startPitch:camera.pitch,startTarget:{...camera.target}};canvas.classList.toggle('is-panning',kind==='pan');if(marker>=0)refresh();});
canvas.addEventListener('pointermove',e=>{if(!draft)return;const p=pointFromEvent(e);if(!drag){hover=pick(p.x,p.y);draw();return;}const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(!drag.moved)return;hover=null;
  if(drag.kind==='marker'){const hit=pick(p.x,p.y);if(hit)put(hit,true);}
  else if(drag.kind==='orbit'){camera.yaw=drag.startYaw-dx*.007;camera.pitch=drag.startPitch+dy*.007;draw();}
  else{const b=basis(),scale=camera.distance*2*Math.tan(FOV/2)/canvas.clientHeight;camera.target={x:drag.startTarget.x+(-b.right.x*dx+b.up.x*dy)*scale,y:drag.startTarget.y+(-b.right.y*dx+b.up.y*dy)*scale,z:drag.startTarget.z+(-b.right.z*dx+b.up.z*dy)*scale};draw();}
});
canvas.addEventListener('pointerup',e=>{if(!drag||!draft)return;const p=pointFromEvent(e),{moved,kind}=drag;drag=null;canvas.classList.remove('is-panning');if(kinds.some(k=>dirty[k]))flushSave();camera.yaw%=Math.PI*2;camera.pitch%=Math.PI*2;if(moved||kind==='marker'||kind==='pan'||e.button!==0)return;const hit=pick(p.x,p.y);if(!hit)return;if(tool==='focusPoint'){focus(hit);return;}if(mode==='hook'&&tool==='testPoint'){launch={x:hit.x,y:hit.y,z:hit.z};refresh();return;}if(mode==='walljump'){const i=hitCandidate(p.x,p.y);if(i>=0){selectCandidate(i);return;}}put(hit,tool==='move');});
canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('is-panning');if(kinds.some(k=>dirty[k]))flushSave();});canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();const p=pointFromEvent(e);zoom(e.deltaY<0?.81:1.23,p.x,p.y);},{passive:false});
for(const id of ['add','move','testPoint','focusPoint'])$(id).onclick=()=>setTool(id);
$('hookMode').onclick=()=>setMode('hook');$('wallJumpMode').onclick=()=>setMode('walljump');$('barMode').onclick=()=>setMode('bar');
$('adoptCandidates').onclick=()=>{let n=0;for(const c of candidates()){if(wallJumps.length>=128)break;if(c.status!=='ok'||wallJumps.some(w=>Math.hypot(w[0]-c.at[0],w[2]-c.at[2])<1&&w[3]===c.normal[0]&&w[4]===c.normal[1]))continue;wallJumps.push([...c.at,...c.normal]);draft.ids.walljump.push('walljump-'+crypto.randomUUID());n++;}if(n){selectedWallJump=wallJumps.length-1;changed();}status(n?`${n}か所を下書きへ追加しました。`:'候補はすべて下書きにあります。');};
$('viewPan').onclick=()=>setViewPan(!viewPan);$('fit').onclick=fit;$('zoomIn').onclick=()=>zoom(.75);$('zoomOut').onclick=()=>zoom(1.33);$('topView').onclick=()=>{camera.pitch=1.52;draw();};$('obliqueView').onclick=()=>{camera.pitch=.67;draw();};$('focusSelected').onclick=()=>{const p=rows(mode)[selection()];if(p)focus({x:p[0],y:p[1],z:p[2]});};
for(const [k,i]of [['x',0],['y',1],['z',2]])$(k).addEventListener('change',()=>{const index=selection(),points=rows(mode);if(index<0)return;const p=[...points[index]];p[i]=Number($(k).value);if(!validRows(mode,[p])){refresh();return status('座標が範囲外です。',true);}if(mode==='walljump'){const wall=wallJumpPointAt(...p.slice(0,3),p.slice(3));if(!wall){refresh();return status('同じ向きの縦の壁面上に置いてください。',true);}points[index]=wall;}else points[index]=p;changed();});
$('normal').onchange=()=>{const i=selection(),points=rows(mode);if(i<0||mode==='hook')return;const direction=$('normal').value.split(',').map(Number),p=points[i];if(mode==='walljump'){const wall=wallJumpPointAt(...p.slice(0,3),direction);if(!wall){refresh();return status('選んだ向きの壁面がありません。',true);}points[i]=wall;}else points[i]=[...p.slice(0,3),...direction,p[5]];changed();};
$('barWidth').onchange=()=>{if(mode!=='bar'||selectedBar<0)return;const p=[...bars[selectedBar]];p[5]=Number($('barWidth').value);if(!validBar(p)){refresh();return status('幅は1.4〜8mです。',true);}bars[selectedBar]=p;changed();};
$('pointNote').addEventListener('input',()=>{const id=draft?.ids[mode][selection()];if(!id)return;draft.notes[id]=$('pointNote').value.slice(0,2000);dirty[mode]=true;clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,500);updateRequest();});
$('remove').onclick=()=>{const i=selection();if(i<0)return;rows(mode).splice(i,1);draft.ids[mode].splice(i,1);select(Math.min(i,rows(mode).length-1));changed();};$('save').onclick=flushSave;
$('reset').onclick=()=>{assign(mode,clone(draft.baseline[mode]));draft.ids[mode]=draft.baseline[mode].map((_,i)=>`${mode}-base-${i+1}`);for(const id of Object.keys(draft.notes))if(id.startsWith(mode+'-'))delete draft.notes[id];select(-1);changed();};
$('refreshRequest').onclick=()=>{updateRequest();status('変更依頼文を表示しました。');};
$('copyRequest').onclick=async()=>{updateRequest();const text=$('requestText').value;try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);status('変更依頼文をコピーしました。チャットへ貼り付けてください。');}catch{const field=$('requestText');field.focus();field.select();field.setSelectionRange(0,field.value.length);status('文章を選択しました。長押しして「コピー」を選んでください。',true);}};
$('export').onclick=()=>{syncDraft();const blob=new Blob([JSON.stringify(draft,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gunrun-old-town-marker-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('3種類の下書きJSONを書き出しました。');};
$('import').onclick=()=>$('importFile').click();$('importFile').onchange=async()=>{const file=$('importFile').files?.[0];if(!file)return;try{if(file.size>1024*1024)throw Error('1MB以内のJSONを選んでください');const data=JSON.parse(await file.text());if(validDraft(data)){draft=clone(data);for(const k of kinds){assign(k,clone(draft.points[k]));dirty[k]=true;}select(-1);}else{let kind,value;if(data.format==='gunrun-old-town-hooks-v1'){kind='hook';value=data.hooks;}else if(data.format==='gunrun-old-town-walljumps-v1'){kind='walljump';value=data.wallJumps?.map(p=>[...p.at,...p.normal]);}else if(data.format==='gunrun-old-town-bars-v1'){kind='bar';value=data.bars?.map(p=>[...p.at,...p.direction,p.width]);}if(data.map!=='old-town'||!kind||!validRows(kind,value))throw Error('形式または座標が正しくありません');assign(kind,clone(value));draft.ids[kind]=value.map((_,i)=>i<draft.baseline[kind].length?`${kind}-base-${i+1}`:kind+'-'+crypto.randomUUID());dirty[kind]=true;setMode(kind);select(-1);}flushSave();status('下書きとして読み込みました。ゲームの配置は変更しません。');}catch(e){status('読み込めませんでした：'+e.message,true);}finally{$('importFile').value='';}};
new ResizeObserver(resize).observe(canvas);
async function boot(){if(booted)return;booted=true;try{const w=iframe.contentWindow;for(let i=0;i<250&&(!w.skyHookEditor||!w.skyWallJumpEditor||!w.skyOldTownSwingCourse);i++)await new Promise(r=>setTimeout(r,80));api=w.skyHookEditor;wallApi=w.skyWallJumpEditor;game=w.__game;internals=w.__skyInternals;if(!api||!wallApi||!game?.solids||!w.skyOldTownSwingCourse)throw Error('地形を読み込めませんでした');w.__hold=true;solids=game.solids;
  const baseline={hook:api.defaults(),walljump:wallApi.defaults(),bar:w.skyOldTownSwingCourse.bars.map(b=>[...b.at,...b.direction,b.width])};published=clone(baseline);draft={format:DRAFT_FORMAT,map:'old-town',sourceVersion:SOURCE_VERSION,baseline:clone(baseline),points:clone(baseline),ids:Object.fromEntries(kinds.map(k=>[k,baseline[k].map((_,i)=>`${k}-base-${i+1}`)])),notes:{}};
  // Preserve older hook/wall design work, but never write back to gameplay keys.
  for(const [kind,value] of [['hook',api.current()],['walljump',wallApi.current()]]){
    if(validRows(kind,value)){draft.points[kind]=clone(value);draft.ids[kind]=value.map((_,i)=>i<baseline[kind].length?`${kind}-base-${i+1}`:kind+'-'+crypto.randomUUID());}
  }
  try{const stored=localStorage.getItem(DRAFT_KEY);if(stored){const data=JSON.parse(stored);if(!validDraft(data))throw Error('下書きデータが正しくありません');draft=data;}}catch(e){storageOK=false;status('保存済み下書きを読み込めません。標準配置を表示しています。',true);}
  for(const k of kinds)assign(k,clone(draft.points[k]));fit();resize();refresh();if(storageOK)status('マーキング専用です。追加・移動・削除はゲームへ反映しません。');
}catch(e){status(e.message,true);$('loadState').textContent='読み込み失敗。HTTPまたは公開URLで開いてください。';}}
window.addEventListener('storage',e=>{if(e.key!==DRAFT_KEY||kinds.some(k=>dirty[k]))return;try{const v=JSON.parse(e.newValue);if(!validDraft(v))return;draft=v;for(const k of kinds)assign(k,clone(v.points[k]));select(-1);refresh();status('別タブの下書きを読み込みました。');}catch{}});
for(const name of ['pagehide','beforeunload'])window.addEventListener(name,()=>{if(draft&&kinds.some(k=>dirty[k]))flushSave();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&draft&&kinds.some(k=>dirty[k]))flushSave();});
if(iframe.contentDocument?.readyState==='complete')boot();else iframe.addEventListener('load',boot,{once:true});
