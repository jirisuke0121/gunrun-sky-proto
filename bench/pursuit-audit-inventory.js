(()=>{const g=__game,s=__skyInternals,N=g.NAV,climb=skyZombieClimb;
const polygon=window.SKY_CANYON_MAP?.rock_walls.polygon_xy;
const playable=p=>{if(!polygon)return true;let inside=false;const x=p.x+34,z=p.z+26;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
const free=p=>playable(p)&&g.freeAt(p.x,p.y+.015,p.z,.32,1.8)&&g.near(p.x,p.z,p.x,p.z).some(b=>!b.off&&Math.abs(b.maxY-p.y)<.05&&p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ);
const at=(x,y,z)=>({x,y:y+.003,z}),arr=p=>[p.x,+(p.y-.003).toFixed(3),p.z];
const nodes=N.nodes.filter(n=>free(at(n.x,n.y,n.z)));
const groups={};for(const n of nodes){const k=[Math.floor(n.x/12),Math.floor(n.z/12),Math.floor(n.y/3)].join(':');(groups[k]||=[]).push(n);}
const fixtures=[],seen=new Set();const add=(kind,id,p,e)=>{const k=[...arr(p),...arr(e)].map(n=>Math.round(n*10)).join(':');if(!seen.has(k)&&free(p)&&free(e)){seen.add(k);fixtures.push({kind,id,p:arr(p),e:arr(e)});}};
// Authored ladders in both directions, clear of the ladder's own wall.
for(const [i,L]of g.LADDERS.entries()){
 const lo=at(L.x+L.nx*1.2,L.y0,L.z+L.nz*1.2),hi=at(L.x-L.nx*1.2,L.y1,L.z-L.nz*1.2);
 add('ladder','ladder-'+i+'-up',hi,lo);add('ladder','ladder-'+i+'-down',lo,hi);
}
// Real NAV cells distributed across every 12m region/elevation band. Test
// horizontal obstacles as well as nearest connections to higher/lower tiers.
for(const [key,ns]of Object.entries(groups)){
 const p=ns[Math.floor(ns.length/2)],point=at(p.x,p.y,p.z);
 for(const sign of [-1,0,1]){
  const choices=nodes.filter(n=>{const d=Math.hypot(n.x-p.x,n.z-p.z),dy=n.y-p.y;return d>=4&&d<=18&&(sign===0?Math.abs(dy)<.3:dy*sign>=1.5&&Math.abs(dy)<12)}).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
  if(choices.length){const e=choices[Math.min(choices.length-1,4)];add('region','region-'+key+'-'+sign,point,at(e.x,e.y,e.z));}
 }
}
// Standable solid tops omitted from NAV. Keep the same floor under the body,
// exclude boundary rock and props, and sample every surface/elevation region.
const tops=new Map();
for(const b of g.solids){if(b.off||b.canyonTier==='wall'||!['mono','slab','beam'].includes(b.type)||b.maxY<0||b.maxY>25||b.maxX-b.minX<.35||b.maxZ-b.minZ<.35)continue;
 for(const [x,z]of [[(b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2],[b.minX+.18,b.minZ+.18],[b.maxX-.18,b.maxZ-.18]]){
  const p=at(x,b.maxY,z),id=g.nodeAt(x,p.y+.1,z);if(!free(p)||id>=0&&Math.abs(N.nodes[id].y-b.maxY)<.35)continue;
  const key=[Math.floor(x/8),Math.floor(z/8),Math.floor(b.maxY/2)].join(':');if(!tops.has(key))tops.set(key,p);
 }
}
for(const [key,p]of tops){for(const sign of [-1,1]){const candidates=nodes.filter(n=>{const d=Math.hypot(n.x-p.x,n.z-p.z);return d>2&&d<18&&(n.y-p.y)*sign>.5}).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)+Math.abs(a.y-p.y)-Math.hypot(b.x-p.x,b.z-p.z)-Math.abs(b.y-p.y));
 if(candidates.length){const e=candidates[0];add('no-node','no-node-'+key+'-'+sign,p,at(e.x,e.y,e.z));}}
}
return{nodes:N.nodes.length,edges:N.E.length,groups:Object.keys(groups).length,fixtures};})()
