import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const out={};
for(const page of process.argv.slice(2)){
const p = await b.newPage({viewport:{width:320,height:180}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8765/'+page);await p.waitForTimeout(6000);
out[page]=await p.evaluate(()=>{
 const G=window.__game, N=G.NAV, U=window.__skyInternals.U, nodes=N.nodes, n=nodes.length;
 const zs=U.zombieSpeed*1.05, Jc=9.2;
 const zc=e=>e.kind===6?Infinity:e.kind===7?1.4+e.len/zs:e.kind===5?(e.climb||4)/(U.zombieLadder||2)+.8:e.kind===1?.9+e.climb*.45+e.len/zs:e.kind===3?e.len/(zs*.35):e.len/zs;
 const pc=e=>e.kind===6?e.len/Jc+.15:e.kind===5?(e.climb||4)/U.ladderSpeed+.3:e.kind===1?(e.climb<=U.mantleReach?.35:.6)+e.len/Jc:e.kind===3?e.len/7:e.len/Jc;
 const zAdj=Array.from({length:n},()=>[]), pAdj=Array.from({length:n},()=>[]), pRev=Array.from({length:n},()=>[]);
 const tricks=[];
 for(const e of N.E){ const z=zc(e), c=pc(e); if(z<Infinity) zAdj[e.from].push([e.to,z]); pAdj[e.from].push([e.to,c]); pRev[e.to].push([e.from,c]);
   if(e.kind===6||e.kind===3||e.kind===5||(e.kind===7&&(e.fall||0)>=2)) tricks.push({u:e.from,v:e.to,k:e.kind,c}); }
 // ziplines as player-only edges
 const near=(x,y,z)=>{let best=-1,bd=1e9;for(const q of nodes){const d=Math.hypot(q.x-x,(q.y-y)*2,q.z-z);if(d<bd){bd=d;best=q.id}}return bd<4?best:-1};
 for(const zl of G.ZIPS||[]){const u=near(zl.a[0],zl.a[1]-1.7,zl.a[2]),v=near(zl.b[0],zl.b[1]-2.3,zl.b[2]);if(u>=0&&v>=0){const c=zl.len/U.zipSpeed+.5;pAdj[u].push([v,c]);pRev[v].push([u,c]);tricks.push({u,v,k:'zip',c});}}
 // wall kick-up (player only): ground/roof node next to a wall 2.05..3.6 m above the feet at take-off height
 if(window.__skyOldTown){const JJ=window.__skyInternals.jn.filter(b=>!b.off&&b.type!=='prop'&&b.type!=='rail');const mr=U.mantleReach;
  for(const q of nodes){for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const px=q.x+dx*0.9,pz=q.z+dz*0.9,feet=q.y+0.9;let top=-1e9;
    for(const b of JJ){if(px>b.minX&&px<b.maxX&&pz>b.minZ&&pz<b.maxZ&&b.minY<feet+1.2&&b.maxY>feet+0.4)top=Math.max(top,b.maxY)}
    const h=top-feet;if(!(h>mr+0.05&&h<=mr+1.6))continue;const v=G.nodeAt(px+dx*0.6,top+0.1,pz+dz*0.6);if(v<0||Math.abs(nodes[v].y-top)>0.3)continue;
    pAdj[q.id].push([v,1.1]);pRev[v].push([q.id,1.1]);tricks.push({u:q.id,v,k:'kick',c:1.1});}}}
 // binary heap dijkstra
 function dij(adj,srcs,limit=1e9,prev=null){const d=new Float64Array(n).fill(Infinity);const h=[];const push=(x,i)=>{h.push([x,i]);let k=h.length-1;while(k>0){const p=(k-1)>>1;if(h[p][0]<=h[k][0])break;[h[p],h[k]]=[h[k],h[p]];k=p}};const pop=()=>{const t=h[0],l=h.pop();if(h.length){h[0]=l;let k=0;for(;;){let a=2*k+1,b=a+1,m=k;if(a<h.length&&h[a][0]<h[m][0])m=a;if(b<h.length&&h[b][0]<h[m][0])m=b;if(m===k)break;[h[m],h[k]]=[h[k],h[m]];k=m}}return t};
  for(const s of srcs){d[s]=0;push(0,s)} while(h.length){const [x,i]=pop();if(x>d[i]||x>limit)continue;for(const [j,w] of adj[i]){const y=x+w;if(y<d[j]){d[j]=y;if(prev)prev[j]=i;push(y,j)}}}return d}
 // gain per trick: zombie time u->v minus player time for the trick
 const J=window.__skyInternals.jn.filter(b=>!b.off&&b.solid!==false);
 const occ=(ax,ay,az,bx,by,bz)=>{for(const b of J){let t0=0,t1=1;const o=[ax,ay,az],dd=[bx-ax,by-ay,bz-az],mn=[b.minX,b.minY,b.minZ],mx=[b.maxX,b.maxY,b.maxZ];let ok=true;for(let k=0;k<3;k++){if(Math.abs(dd[k])<1e-9){if(o[k]<mn[k]||o[k]>mx[k]){ok=false;break}}else{let ta=(mn[k]-o[k])/dd[k],tb=(mx[k]-o[k])/dd[k];if(ta>tb)[ta,tb]=[tb,ta];t0=Math.max(t0,ta);t1=Math.min(t1,tb);if(t0>t1){ok=false;break}}}if(ok&&t1>0.02&&t0<0.98)return true}return false};
 for(const t of tricks){const a=nodes[t.u],v=nodes[t.v];t.occ=occ(a.x,a.y+1.5,a.z,v.x,v.y+1.4,v.z)||Math.hypot(a.x-v.x,a.y-v.y,a.z-v.z)>40;}
 const bySrc=new Map(); for(const t of tricks){if(!bySrc.has(t.u))bySrc.set(t.u,[]);bySrc.get(t.u).push(t)}
 for(const [u,list] of bySrc){const prev=new Int32Array(n).fill(-1);const d=dij(zAdj,[u],40,prev);for(const t of list){t.gain=(d[t.v]===Infinity?99:d[t.v])-t.c;
   // walk the zombie's route; lost if it spends >=0.6s with no line of sight and >8m away
   t.lost=false; if(d[t.v]===Infinity){continue}
   const path=[];for(let k=t.v;k!==-1&&path.length<200;k=prev[k]){path.push(k);if(k===u)break}path.reverse();
   const V=nodes[t.v];const C=[[V.x,V.y,V.z]];
   for(const [ox,oz] of [[3,0],[-3,0],[0,3],[0,-3]]){const w=G.nodeAt(V.x+ox,V.y+0.1,V.z+oz);if(w>=0&&Math.abs(nodes[w].y-V.y)<0.3)C.push([nodes[w].x,nodes[w].y,nodes[w].z]);}
   for(const P of C){let hid=0,lastT=null;
    for(const k of path){const q=nodes[k],tt=d[k];const far=Math.hypot(q.x-P[0],q.y-P[1],q.z-P[2])>8;
     const blind=far&&(Math.hypot(q.x-P[0],q.z-P[2])>40||occ(q.x,q.y+1.5,q.z,P[0],P[1]+1.4,P[2]));
     if(lastT!==null){if(blind&&tt>=t.c)hid+=tt-Math.max(lastT,t.c);}
     if(!blind)hid=0; if(hid>=0.6){t.lost=true;break} lastT=tt;}
    if(t.lost)break;}
 }}
 // main area = nodes zombies can reach from a big ground node (largest component reachable)
 const start=nodes.reduce((a,q)=>Math.abs(q.y)<.1&&Math.hypot(q.x,q.z+20)<Math.hypot(a.x,a.z+20)?q:a,nodes[0]).id;
 const zr=dij(zAdj,[start]); const islands=nodes.filter(q=>zr[q.id]===Infinity);
 // best usable trick: unique (u-region) good tricks; coverage = nodes within 1.5s player time of a good trick start
 const good=tricks.filter(t=>t.lost&&t.gain>=1&&zr[t.v]<Infinity);
 const dn=dij(pRev,[...new Set(good.map(t=>t.u))]);
 const region=q=>q.x<-22?'W旧市街':q.x>22?'東':q.z<-14?'北':'中央';
 const R={};
 for(const q of nodes){const r=region(q);R[r]=R[r]||{nodes:0,cover:0,island:0,good:0,hideOnly:0,weak:0,camp:0};R[r].nodes++;if(dn[q.id]<=1.5)R[r].cover++;if(zr[q.id]===Infinity)R[r].island++;}
 const seen=new Set();
 for(const t of tricks){const q=nodes[t.u];const r=region(q);const key=r+Math.round(q.x/3)+','+Math.round(q.z/3)+','+Math.round(nodes[t.v].x/3)+','+Math.round(nodes[t.v].z/3);if(seen.has(key))continue;seen.add(key);
   if(zr[t.v]===Infinity||t.gain>=15)R[r].camp++;else if(t.lost&&t.gain>=1)R[r].good++;else R[r].weak++;}
 const hist={}; for(const t of tricks){const g=t.gain>=99?'99+':t.gain<0?'<0':String(Math.min(15,Math.floor(t.gain)));hist[g]=(hist[g]||0)+1}
 const goodList=good.map(t=>({x:nodes[t.u].x,y:nodes[t.u].y,z:nodes[t.u].z,vx:nodes[t.v].x,vy:nodes[t.v].y,vz:nodes[t.v].z,g:+t.gain.toFixed(1),k:t.k,o:t.lost}));
 const kickN=tricks.filter(t=>t.k==='kick').map(t=>[nodes[t.u].x,nodes[t.u].y,nodes[t.u].z,nodes[t.v].y,+t.gain.toFixed(1),t.lost?1:0]);const moveStarts=new Set();for(const e of N.E){if(e.kind===6||e.kind===5||e.kind===3||(e.kind===1&&e.climb>=0.5))moveStarts.add(e.from)}for(const t of tricks){if(t.k==='kick'||t.k==='zip')moveStarts.add(t.u)}const allStarts=[...moveStarts];const da=dij(pRev,allStarts);
 const dens={};for(const q of nodes){const r=region(q);dens[r]=dens[r]||{n:0,s1:0,s2:0,s3:0,sum:0};const v=Math.min(da[q.id],10);dens[r].n++;dens[r].sum+=v;if(v<=1)dens[r].s1++;if(v<=2)dens[r].s2++;if(v<=3)dens[r].s3++;}
 for(const r in dens){const o=dens[r];dens[r]={avg:+(o.sum/o.n).toFixed(2),'<=1s':Math.round(o.s1/o.n*100),'<=2s':Math.round(o.s2/o.n*100),'<=3s':Math.round(o.s3/o.n*100)}}
 // fastest-route sampling: how much of a route is plain running
 const pEdges=Array.from({length:n},()=>[]);for(const e of N.E){pEdges[e.from].push([e.to,pc(e),e.kind===6?'jump':e.kind===5?'ladder':e.kind===3?'crawl':(e.kind===1&&e.climb>=0.5)?'climb':(e.kind===7&&(e.fall||0)>=2)?'drop':null])}
 for(const t of tricks){if(t.k==='kick'||t.k==='zip')pEdges[t.u].push([t.v,t.c,t.k])}
 let sd=12345;const rnd=()=>((sd=(sd*16807)%2147483647)/2147483647);
 const RT={};const reach=nodes.filter(q=>zr[q.id]<Infinity);const hot=new Float64Array(n);
 const NR=+(window.__routeN||600);
 for(let it=0;it<NR;it++){const a=reach[Math.floor(rnd()*reach.length)];let b=null;for(let k=0;k<50;k++){const c=reach[Math.floor(rnd()*reach.length)];if(region(c)===region(a)&&Math.hypot(c.x-a.x,c.z-a.z)>=18){b=c;break}}if(!b)continue;
  const d=new Float64Array(n).fill(Infinity),pv=new Int32Array(n).fill(-1),pk=new Array(n).fill(null),pw=new Float64Array(n);
  const h=[];const push=(x,i)=>{h.push([x,i]);let k=h.length-1;while(k>0){const p=(k-1)>>1;if(h[p][0]<=h[k][0])break;[h[p],h[k]]=[h[k],h[p]];k=p}};const pop=()=>{const t=h[0],l=h.pop();if(h.length){h[0]=l;let k=0;for(;;){let x=2*k+1,y=x+1,m=k;if(x<h.length&&h[x][0]<h[m][0])m=x;if(y<h.length&&h[y][0]<h[m][0])m=y;if(m===k)break;[h[m],h[k]]=[h[k],h[m]];k=m}}return t};
  d[a.id]=0;push(0,a.id);
  while(h.length){const [x,i]=pop();if(x>d[i])continue;if(i===b.id)break;for(const [j,w,k] of pEdges[i]){const y=x+w;if(y<d[j]){d[j]=y;pv[j]=i;pk[j]=k;pw[j]=w;push(y,j)}}}
  if(d[b.id]===Infinity)continue;const seq=[];for(let k=b.id;k!==a.id;k=pv[k])seq.push(k);seq.reverse();
  let tricksN=0,flat=0,cur=0,maxFlat=0;for(const k of seq){if(pk[k]){tricksN++;maxFlat=Math.max(maxFlat,cur);cur=0}else{flat+=pw[k];cur+=pw[k];if(cur>3)hot[k]+=1}}maxFlat=Math.max(maxFlat,cur);
  const r=region(a);RT[r]=RT[r]||[];RT[r].push({T:d[b.id],tricksN,flat,maxFlat});}
 const routes={};for(const r in RT){const L=RT[r];const sum=(f)=>L.reduce((s,o)=>s+f(o),0);const med=arr=>{arr.sort((x,y)=>x-y);return arr[arr.length>>1]};
  routes[r]={n:L.length,'技の間隔(秒)':+(sum(o=>o.T)/Math.max(1,sum(o=>o.tricksN))).toFixed(1),'平地の割合%':Math.round(sum(o=>o.flat)/sum(o=>o.T)*100),'最長の平地(中央値秒)':+med(L.map(o=>o.maxFlat)).toFixed(1)}}
 const hotList=[];for(let i=0;i<n;i++)if(hot[i]>0)hotList.push([nodes[i].x,nodes[i].y,nodes[i].z,hot[i]]);
 const dmap=nodes.map(q=>[q.x,q.y,q.z,+Math.min(da[q.id],10).toFixed(2)]);
 return {hotList,routes,dens,dmap,kickN,cov:nodes.filter(q=>true).map(q=>[q.x,q.y,q.z,dn[q.id]<=1.5?1:0]),R,hist,islandN:islands.length,islands:islands.map(q=>[q.x,q.y,q.z]),goodList,zipN:(G.ZIPS||[]).length};
});
await p.close();}
fs.writeFileSync('trick.json',JSON.stringify(out));
for(const k in out){console.log(k);console.log(JSON.stringify(out[k].R));console.log('routes',JSON.stringify(out[k].routes));console.log('kick edges',out[k].kickN,'hist',JSON.stringify(out[k].hist),'islands',out[k].islandN)}
await b.close();
