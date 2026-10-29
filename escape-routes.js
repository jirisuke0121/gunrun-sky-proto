// Escape route cues and safe, intentional ladder descent. Shared by both maps.
const game=window.__game,sky=window.__skyInternals,{c,U,Geom:T}=sky;
const oldTown=!!window.skyOldTownSwingCourse&&!window.skyPracticeMode;
const playing=()=>sky.modeRef()==='play'&&!sky.z.over;
const dot=(dx,dz)=>-Math.sin(c.yaw)*dx-Math.cos(c.yaw)*dz;
const hint=document.createElement('div');hint.id='escapeRouteHint';hint.hidden=true;
const actions=document.createElement('div');actions.id='escapeRouteActions';actions.hidden=true;
document.getElementById('app').append(hint,actions);
const style=document.createElement('style');style.textContent=`
#escapeRouteHint{position:absolute;z-index:8;left:50%;top:112px;transform:translateX(-50%);max-width:calc(100% - 300px);padding:6px 10px;border:1px solid #7de6cd;border-radius:8px;background:#142b2ce8;color:#d9fff5;font:600 12px/1.6 var(--font);text-align:center;pointer-events:none}
#escapeRouteActions{position:absolute;z-index:25;left:50%;bottom:20px;transform:translateX(-50%);display:flex;gap:10px}
#escapeRouteActions button{min-height:54px;padding:8px 15px;border:2px solid #8fead2;border-radius:10px;background:#183c3ef2;color:#e3fff8;font:700 13px/1.4 var(--font);touch-action:manipulation}
#escapeRouteActions button.selected{border-color:#ffe0a0;background:#685329f2;color:#fff4d2}
#escapeRouteHint[hidden],#escapeRouteActions[hidden]{display:none!important}
@media(max-height:500px){#escapeRouteHint{top:83px;font-size:11px;max-width:calc(100% - 310px)}#escapeRouteActions{bottom:var(--touch-bottom,16px)}#escapeRouteActions button{min-height:48px;padding:6px 12px}}
`;document.head.append(style);
// A door crossing wins over the ordinary auto-climb. Jump+forward selects the
// adjacent ladder deliberately, consuming that press on attachment.
for(const L of game.LADDERS){L.sharedDoor=(game.DOORS||[]).some(d=>Math.abs(d.b.minY-L.y0)<.2&&Math.hypot((d.b.minX+d.b.maxX)/2-L.x,(d.b.minZ+d.b.maxZ)/2-L.z)<1.3);}
const root=new T.Group();root.name='Escape route floor guides';sky.ue.add(root);
const paint={walk:[],jump:[],drop:[]};
function arrow(at,dir,kind='walk',size=.75){
 const len=Math.hypot(...dir),dx=dir[0]/len,dz=dir[1]/len,sx=-dz,sz=dx;
 const p=(x,z)=>[at[0]+sx*x*size+dx*z*size,at[1]+.035,at[2]+sz*x*size+dz*z*size];
 for(const v of [[-.32,-.10],[.32,-.10],[0,.48],[-.09,-.52],[.09,-.52],[.09,-.1],[-.09,-.52],[.09,-.1],[-.09,-.1]])paint[kind].push(...p(...v));
}
if(oldTown){
 // Advance notice before the point where a choice must be made.
 for(const x of [18.5,20])arrow([x,6.15+(20-x)*.32,3],[1,0],'jump');
 arrow([31,7,-.55],[1,0]);arrow([35.7,7,-1.6],[.45,-1],'jump');
 for(const x of [54,50,48])arrow([x,-1,3.6],[-1,0]);
 for(const x of [45,41,37])arrow([x,0,3.6],[-1,0]);
 arrow([52.4,3.6,2.5],[-1,0],'drop');arrow([49,-1,2.5],[0,1]);
 for(const z of [-3,-7,-10])arrow([60.7,3.6,z],[0,-1]);
 arrow([-42,4.4,8],[0,-1]);arrow([-42,4.4,5.4],[0,-1]);
 arrow([22,0,23.8],[1,0]);arrow([36,0,21],[0,-1],'jump');
 arrow([38.4,-3.5,19],[0,-1]);
 arrow([-53,6.4,3.5],[1,0]);arrow([-52.2,6.4,4],[0,1]);
 arrow([-35.7,15,1.5],[0,-1]);arrow([-35.6,15,-.3],[-1,0]);
}else if(!window.skyPracticeMode){
 // Crossings on different floors get distinct directions, not a false junction.
 for(const z of [-3,3])arrow([0,8,z],[0,z>0?1:-1]);
 for(const x of [-4,4])arrow([x,4,0],[x>0?1:-1,0]);
 arrow([0,8,-10.5],[0,-1],'drop');
}
for(const [kind,points]of Object.entries(paint))if(points.length){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32Attribute(new Float32Array(points),3));const mesh=new T.Mesh(geometry,new T.Basic({color:kind==='jump'?0xffd37c:kind==='drop'?0x8ecbff:0x7bf1d0,side:2,depthWrite:false}));mesh.name='Escape '+kind+' arrows';root.add(mesh);}
let transition=null,lastHint='',nearTop=null;
function clearPath(from,to){for(let i=1;i<=8;i++){const f=i/8;if(!sky.oe(from.x+(to.x-from.x)*f,from.y+(to.y-from.y)*f+.015,from.z+(to.z-from.z)*f,c.r,1.75))return false;}return true;}
function topCandidate(){
 if(c.state!=='normal'||!c.onGround||c.h<1.5)return null;
 for(const L of game.LADDERS){
  if(Math.abs(c.pos.y-L.y1)>.14)continue;
  const along=L.nx?Math.abs(c.pos.z-L.z):Math.abs(c.pos.x-L.x);
  const side=(c.pos.x-L.x)*L.nx+(c.pos.z-L.z)*L.nz;
  if(along>Math.max(.38,L.w/2-.2)||side< -1.3||side>.2)continue;
  const corner={x:L.x+L.nx*(c.r+.22),y:L.y1+.002,z:L.z+L.nz*(c.r+.22)};
  const bottom={...corner,y:L.y1-.95};
  if(clearPath(c.pos,corner)&&clearPath(corner,bottom))return{L,corner,bottom};
 }
 return null;
}
function beginDescent(candidate){
 const {L,corner,bottom}=candidate;
 transition={L,from:c.pos.clone(),corner,bottom,age:0};
 c.ladder=L;c.ladderDescending=true;c.ladderEntry=true;c.state='ladder';c.onGround=false;c.vel.set(0,0,0);c.jumpBuf=0;c.edgeJump=false;
 game.stats.ladderDescents=(game.stats.ladderDescents||0)+1;
}
function zipOptions(){return game.ZIPS.filter(zip=>Math.hypot(c.pos.x-zip.a[0],c.pos.z-zip.a[2])<=2.3&&c.pos.y<=zip.a[1]-.8&&c.pos.y>=zip.a[1]-3.4);}
function ride(zip){if(!playing()||c.state!=='normal'||!zipOptions().includes(zip))return;c.zipChoice=zip;c.jumpBuf=U.jumpBuffer;window.skyTelemetryProbe?.jumpInput({t:sky.z.t,source:'zip-choice',pos:c.pos.toArray(),state:c.state});}
const zipButtons=new Map();
for(const zip of game.ZIPS){const b=document.createElement('button');const dx=zip.b[0]-zip.a[0],dz=zip.b[2]-zip.a[2];b.textContent=Math.abs(dx)>Math.abs(dz)?dx<0?'西へジップ':'東へジップ':dz<0?'北へジップ':'南へジップ';b.addEventListener('pointerdown',e=>e.stopPropagation());b.onclick=e=>{e.preventDefault();e.stopPropagation();ride(zip)};zipButtons.set(zip,b);actions.append(b);}
function update(){
 root.visible=playing();hint.hidden=true;actions.hidden=true;
 if(!playing())return;
 const zips=c.state==='normal'?zipOptions():[];
 for(const [zip,b]of zipButtons){b.hidden=!zips.includes(zip);b.classList.toggle('selected',c.zipChoice===zip);}
 if(zips.length>1){actions.hidden=false;lastHint='行き先をタップしてジップへ。向きを選んでジャンプでも乗れます。';}
 else if(c.ladderDescending&&c.state==='ladder')lastHint='はしご下降：前進で降りる／後ろで戻る／ジャンプで離脱';
 else if((nearTop=topCandidate()))lastHint='はしご：外側へ前進すると降りる';
 else if(game.LADDERS.some(L=>L.sharedDoor&&Math.abs(c.pos.y-L.y0)<.3&&Math.hypot(c.pos.x-L.x,c.pos.z-L.z)<2))lastHint='通り抜け：前進／はしごを登る：ジャンプ＋前進';
 else if(oldTown&&c.pos.x>50&&c.pos.y>2.5&&c.pos.y<5.5&&c.pos.z>-12){lastHint=c.hookCD>0?'フック待ち '+c.hookCD.toFixed(1)+'秒 · 北は屋上／西へ跳ぶと下の復帰路':'南屋根へフック／北は屋上／西へ跳ぶと下の復帰路';}
 else if(oldTown&&c.pos.x>45&&c.pos.y<1&&c.pos.z>1&&c.pos.z<4.6)lastHint='復帰は南側の青緑の矢印へ → 段を上がって街路へ';
 else if(oldTown&&c.pos.x>17&&c.pos.x<26&&c.pos.y>4&&Math.abs(c.pos.z-1.5)<4&&!skySwing.active)lastHint='次の鉄棒で分岐：直進は3連／左は柱の縁へ';
 else if(oldTown&&c.pos.x>34&&c.pos.x<39&&c.pos.z>19&&c.pos.y>-.5)lastHint='金色の矢印からジャンプ。失敗時は下の青緑の階段へ';
 else if(!oldTown&&!window.skyPracticeMode&&Math.abs(c.pos.x)<2&&Math.abs(c.pos.z)<4&&c.pos.y>7)lastHint='青い上層は前後へ。黄色い横道は4m下';
 else return;
 hint.textContent=lastHint;hint.hidden=false;
}
function step(dt,input){
 if(!playing()){transition=null;c.ladderEntry=null;return false;}
 if(transition&&c.state!=='ladder'){transition=null;c.ladderEntry=null;}
 if(c.state!=='ladder')c.ladderDescending=false;
 if(transition){
  transition.age+=dt;const a=transition,phase=Math.min(1,a.age/.16),lower=Math.max(0,Math.min(1,(a.age-.16)/.16));
  const x=a.from.x+(a.corner.x-a.from.x)*phase,z=a.from.z+(a.corner.z-a.from.z)*phase,y=a.corner.y+(a.bottom.y-a.corner.y)*lower;
  const next={x,y,z};if(!clearPath(c.pos,next)){transition=null;c.ladderEntry=null;c.ladderDescending=false;c.state='normal';c.onGround=false;return false;}
  c.pos.set(x,y,z);c.vel.set(0,0,0);c.onGround=false;
  if(a.age>=.32){transition=null;c.ladderEntry=null;}
  update();return true;
 }
 if(input.fwdIn>.55&&!c.jumpBuf){const top=topCandidate();if(top&&dot(top.L.nx,top.L.nz)>.7){beginDescent(top);update();return true;}}
 update();return false;
}
window.skyEscapeRoutes={step,update,topCandidate,zipOptions,ride,root};
let last=0;function frame(t){requestAnimationFrame(frame);if(t-last<90)return;last=t;update();}requestAnimationFrame(frame);update();
