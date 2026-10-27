// Reuse the original vertices, UVs, skin weights, rig and animation clips.
const sky=window.__skyInternals;
// The reduced-triangle index data only covered the old Meshy zombies, which now live in pool/.
// The Unity zombies ship with their own LOD, so nothing is fetched here.
const data=Promise.resolve(null);
const results={};
async function attach(ent){
 if(ent.nearAttached)return;ent.nearAttached=true;
 const payload=await data,key=ent.url.split('/').at(-1).split('?')[0],record=payload?.models?.[key];
 if(!record)return;
 try{
  const source=ent.hi;
  if(source.attributes.position.count!==record.vertices||source.index.count!==record.originalTriangles*3)throw Error('source topology mismatch');
  const raw=Uint8Array.from(atob(record.indices),c=>c.charCodeAt(0)),view=new DataView(raw.buffer),indices=new Uint16Array(raw.length/2);
  for(let i=0;i<indices.length;i++){indices[i]=view.getUint16(i*2,true);if(indices[i]>=record.vertices)throw Error('invalid index');}
  if(indices.length!==record.triangles*3||record.triangles>8000||record.triangles>=record.originalTriangles)throw Error('triangle count mismatch');
  const near=new source.constructor();near.attributes={...source.attributes};near.setIndex(new source.index.constructor(indices,1));near.boundingBox=source.boundingBox;near.boundingSphere=source.boundingSphere;
  ent.originalHi=source;ent.nearHi=near;ent.hi=near;ent.nearRevision=1;
  results[key]={original:record.originalTriangles,near:record.triangles,vertices:record.vertices};
  document.body.dataset.skyZombieNear=JSON.stringify(results);
 }catch(error){console.warn('Near zombie geometry fallback',key,error);}
}
window.skyZombieNear={attach,ready:data,results};
for(const ent of sky.zombieModels())attach(ent);
