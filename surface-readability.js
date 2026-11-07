// Surface roles: calm grey vertical faces, pale two-metre paving, and coping
// inside the existing walkable outline. No collision boxes are added.
export function installSurfaceReadability(game) {
  if(window.skyGuidedScene||new URLSearchParams(location.search).get('wallView')==='classic')return;
  const {CanvasTexture,Standard,BufferGeometry,Float32Attribute,Mesh}=game.Geom;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#aa9f89';ctx.fillRect(0,0,256,256);
  ctx.fillStyle='#d8cfb9';ctx.fillRect(4,4,248,248);
  const paving=new CanvasTexture(canvas);paving.wrapS=paving.wrapT=1000;paving.colorSpace='srgb';
  const copies=new Map();
  function roleMaterial(original){
    if(!original?.isMeshStandardMaterial||!original.map)return original;
    if(copies.has(original))return copies.get(original);
    const material=original.clone(),prepare=original.onBeforeCompile;
    material.onBeforeCompile=function(shader,renderer){
      prepare.call(this,shader,renderer);shader.uniforms.skyRolePaving={value:paving};
      shader.vertexShader='varying float vSkyRoleUp;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvSkyRoleUp=normal.y;');
      shader.fragmentShader='varying float vSkyRoleUp;\nuniform sampler2D skyRolePaving;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        if(vSkyRoleUp>.5)diffuseColor.rgb=texture2D(skyRolePaving,vMapUv).rgb;
        else diffuseColor.rgb=mix(vec3(.30,.33,.32),diffuseColor.rgb*.65,.18);`);
    };
    material.customProgramCacheKey=()=>original.customProgramCacheKey()+'|surface-roles-v1';
    copies.set(original,material);return material;
  }
  let surfaces=0;
  for(const box of game.jn){
    if(box.hidden||box.tint!=null||box.shape||!box.mesh?.isMesh||!['mono','slab','beam'].includes(box.type))continue;
    box.mesh.material=Array.isArray(box.mesh.material)?box.mesh.material.map(roleMaterial):roleMaterial(box.mesh.material);surfaces++;
  }
  // The pictured roof edges and the small houses share these existing bounds.
  // Stairs keep their individual treads; outlining every step would add noise.
  const roofs=location.pathname.endsWith('canyon.html')?[]:[
    [-42,-12,-36.5,-5,2.6],[-31.5,-12,-22,-6.5,4.2],[-34,-1,-29,5,5.5],[-29,-1,-24,5,6.4],
    [-32,12,-25,18,2.8],[-20,3,-16,8,7],[-70,-12,-64,-3,3],[-61,-12,-55,-5.5,4.2],
    [-52,-12,-47,-5.5,4.4],[-38,12,-34.5,18,4],[-45,13.5,-41,18,4.4],[-51,11,-48,18,5],
    [-58,12,-53.5,18,4.4],[-63,11,-60,18,5.5],[-70,8,-66,18,6.5],[-70,0,-65,5,4.4],
    [-60,-1,-52,6,3.4],[-49,.5,-45,5.5,6.2],
  ];
  const positions=[],normals=[];
  function quad(a,b,c,d){
    const u=b.map((v,i)=>v-a[i]),v=d.map((v,i)=>v-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;
    for(const q of[a,b,c,a,c,d]){positions.push(...q);normals.push(...n.map(x=>x/len));}
  }
  function rim(x0,z0,x1,z1,y0,y1=y0,lift=.065){
    const y=x=>y0+(y1-y0)*(x-x0)/(x1-x0),w=.11;
    const point=(x,z)=>[x,y(x)+lift,z];
    quad(point(x0,z0),point(x0,z1),point(x0+w,z1),point(x0+w,z0));
    quad(point(x1-w,z0),point(x1-w,z1),point(x1,z1),point(x1,z0));
    quad(point(x0,z0),point(x0+w,z0+w),point(x1-w,z0+w),point(x1,z0));
    quad(point(x0,z1-w),point(x0,z1),point(x1,z1),point(x1,z1-w));
  }
  for(const [x0,z0,x1,z1,top]of roofs)rim(x0,z0,x1,z1,top);
  if(roofs.length){
    rim(-44,-.5,-34,4.5,2.4,5.5,.065);
    rim(-24,1,-14,1.8,6.4,8,.025);
  }
  if(positions.length){
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32Attribute(new Float32Array(positions),3));geometry.setAttribute('normal',new Float32Attribute(new Float32Array(normals),3));
    geometry.computeBoundingSphere();const mesh=new Mesh(geometry,new Standard({color:0xe4d6b1,roughness:1,side:2}));
    mesh.name='Walkable roof and beam coping';mesh.receiveShadow=true;game.ue.add(mesh);
  }
  window.skySurfaceReadability={revision:'opaque-surface-roles-v1',surfaces,roofRims:roofs.length+ (roofs.length?2:0)};
}
