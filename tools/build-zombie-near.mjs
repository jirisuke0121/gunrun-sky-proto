// MESHOPT_PACKAGE=/path/to/meshoptimizer/index.js node tools/build-zombie-near.mjs
// Offline only: runtime downloads indices, never the simplifier or another rig.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {MeshoptSimplifier:S}=await import(pathToFileURL(process.env.MESHOPT_PACKAGE).href);await S.ready;
const files=['zombie-decayed-man.glb','zombie-decayed-woman.glb','zombie-hoodie.glb','zombie-old-worker.glb'];
const output={version:1,generator:'meshoptimizer 1.3.0; attributes + skin influence; original vertices retained',models:{}};
for(const file of files){
 const bytes=fs.readFileSync('assets/'+file),len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len),prim=doc.meshes[0].primitives[0];
 function read(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},size=sizes[a.componentType],out=[];
  for(let i=0;i<a.count;i++)for(let k=0;k<n;k++){const o=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*n)+k*size;let x=({5120:()=>bin.readInt8(o),5121:()=>bin.readUInt8(o),5122:()=>bin.readInt16LE(o),5123:()=>bin.readUInt16LE(o),5125:()=>bin.readUInt32LE(o),5126:()=>bin.readFloatLE(o)})[a.componentType]();if(a.normalized)x=Math.max(-1,x/({5120:127,5121:255,5122:32767,5123:65535}[a.componentType]));out.push(x);}return out;}
 const p=Float32Array.from(read(prim.attributes.POSITION)),norm=read(prim.attributes.NORMAL),uv=read(prim.attributes.TEXCOORD_0),joints=read(prim.attributes.JOINTS_0),weights=read(prim.attributes.WEIGHTS_0),idx=Uint32Array.from(read(prim.indices)),vertices=p.length/3;
 const importance=new Map();for(let i=0;i<joints.length;i++)importance.set(joints[i],(importance.get(joints[i])||0)+weights[i]);
 const bones=[...importance].sort((a,b)=>b[1]-a[1]).slice(0,24).map(x=>x[0]),stride=5+bones.length,attrs=new Float32Array(vertices*stride),locks=new Uint8Array(vertices);
 for(let i=0;i<vertices;i++){attrs.set(norm.slice(i*3,i*3+3),i*stride);attrs.set(uv.slice(i*2,i*2+2),i*stride+3);for(let k=0;k<4;k++){const b=bones.indexOf(joints[i*4+k]);if(b>=0)attrs[i*stride+5+b]+=weights[i*4+k];}if(p[i*3+1]>.65)locks[i]=1;}
 const [reduced,error]=S.simplifyWithAttributes(idx,p,3,attrs,stride,[.1,.1,.1,.6,.6,...bones.map(()=>2)],locks,5500*3,.02,['Permissive','RegularizeLight']);
 if(reduced.length/3>6000)throw Error(file+' did not reach target: '+reduced.length/3);
 const packed=Buffer.alloc(reduced.length*2);reduced.forEach((x,i)=>packed.writeUInt16LE(x,i*2));
 output.models[file]={vertices,originalTriangles:idx.length/3,triangles:reduced.length/3,error,indices:packed.toString('base64')};
 console.log(file,idx.length/3,'->',reduced.length/3,'error',error);
}
fs.writeFileSync('assets/zombie-near-indices.json',JSON.stringify(output));
