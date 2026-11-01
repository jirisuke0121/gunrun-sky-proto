// Local test fixture only. Browser bootstrap replaces device media queries and
// storage/network with isolated data before the real game's scripts execute.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.PORT||8832);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.gz':'application/octet-stream','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1'),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/bench/minimap-review.html':u.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 let body=await fs.readFile(file);
 if(u.searchParams.has('minimapLab')&&/\/(index|canyon)\.html$/.test(u.pathname)){
  const touch=u.searchParams.get('touch')==='1',rotation=u.searchParams.get('rotation')==='-1'?-1:1;
  const bootstrap=`<script>
   window.__hold=true;window.__minimapLab=true;let seed=4187;
   window.__resetSeed=()=>{seed=4187};Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
   const nativeMatch=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('pointer: coarse')?{matches:${touch},addEventListener(){},removeEventListener(){}}:q.includes('pointer: fine')?{matches:${!touch},addEventListener(){},removeEventListener(){}}:nativeMatch(q);
   localStorage.setItem('gunrun-sky-proto-v1',JSON.stringify({sendLog:false}));localStorage.setItem('sky.minimap','on');localStorage.setItem('gunrun-rotdir','${rotation}');localStorage.setItem('sky.startGuideRuns','99');localStorage.setItem('sky.lang','ja');
   const nativeFetch=window.fetch.bind(window);window.__externalPosts=0;
   window.fetch=(url,opts)=>{const u=new URL(typeof url==='string'?url:url.url,location.href);if(u.origin!==location.origin){if((opts?.method||'GET')==='POST')window.__externalPosts++;return Promise.resolve(new Response(JSON.stringify({ok:true,top:[],total:0,me:null,recordProtocol:2}),{headers:{'content-type':'application/json'}}))}return nativeFetch(url,opts)};
   window.__errors=[];addEventListener('error',e=>{if(e.message)__errors.push(e.message)});
  <\/script>`;
  body=Buffer.from(body.toString().replace('<head>','<head>'+bootstrap));
 }
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
}catch(e){res.writeHead(404);res.end(e.message)}});
server.listen(port,'127.0.0.1',()=>console.log(`Minimap isolated review: http://127.0.0.1:${port}/bench/minimap-review.html`));
module.exports=server;
