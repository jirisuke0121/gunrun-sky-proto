// A small, opaque-edged cutaway reveals the runner and the next foothold.
// Keep the current floor, scenery behind the runner, and the rest of each
// building solid; do not expose a stack of translucent floors.
export function createCameraCutaway(sky) {
  const {c,Geom,ue:world}=sky;
  const v=()=>new Geom.Vector3();
  const uniforms={skyCutOn:{value:0},skyCutCamera:{value:v()},skyCutFocus:{value:v()},
    skyCutFloor:{value:0},skyCutNextFloor:{value:0},skyCutHead:{value:{x:0,y:0}},
    skyCutFeet:{value:{x:0,y:0}},skyCutNext:{value:{x:0,y:0}},skyCutRadius:{value:0}};
  const head=v(),feet=v(),next=v(),copies=new Map();let installed=false;
  function material(source){
    if(copies.has(source))return copies.get(source);
    const copy=source.clone(),prepare=source.onBeforeCompile;
    copy.customProgramCacheKey=()=>source.customProgramCacheKey()+'|camera-cutaway-v1';
    copy.onBeforeCompile=function(shader,renderer){
      prepare.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
      shader.vertexShader='varying vec3 vSkyCutWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvSkyCutWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=`varying vec3 vSkyCutWorld;
        uniform float skyCutOn,skyCutFloor,skyCutNextFloor,skyCutRadius;
        uniform vec3 skyCutCamera,skyCutFocus;
        uniform vec2 skyCutHead,skyCutFeet,skyCutNext;
        float skyCutSegment(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),.001),0.0,1.0));}
        `+shader.fragmentShader.replace('#include <alphatest_fragment>',`
        if(skyCutOn>.5&&vSkyCutWorld.y>skyCutFloor+.12){
          vec3 axis=skyCutFocus-skyCutCamera;
          float depth=dot(vSkyCutWorld-skyCutCamera,axis)/max(dot(axis,axis),.01);
          float windowDistance=min(skyCutSegment(gl_FragCoord.xy,skyCutHead,skyCutFeet),skyCutSegment(gl_FragCoord.xy,skyCutFeet,skyCutNext));
          // Keep a reachable raised landing surface as well as the floor at
          // our feet. Vertical wall fragments still reveal the cut boundary.
          bool landing=abs(vSkyCutWorld.y-skyCutNextFloor)<.035;
          if(depth>0.0&&depth<.995&&!landing){
            if(windowDistance<skyCutRadius)discard;
            if(windowDistance<skyCutRadius+3.0)diffuseColor.rgb*=.45;
          }
        }
        #include <alphatest_fragment>`);
    };
    copies.set(source,copy);return copy;
  }
  function install(){
    const physical=new Set(sky.jn.filter(b=>b.solid&&!b.off&&!['door','prop'].includes(b.type)&&!b.shape).map(b=>b.mesh));
    world.traverse(mesh=>{
      if(!mesh.isMesh||mesh.isSkinnedMesh||!mesh.geometry||!mesh.material)return;
      let tagged=!!mesh.userData.skyStaticBatch;
      for(let q=mesh.parent;q&&q!==world;q=q.parent)if(q.userData.skyStaticBatch)tagged=true;
      if(!physical.has(mesh)&&!tagged&&(mesh.parent!==world||mesh.matrixAutoUpdate))return;
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(material):material(mesh.material);
    });installed=true;
  }
  function update(camera){
    const renderer=window.__game.debug.renderer;
    if(!installed)install();uniforms.skyCutOn.value=1;
    const floor=c.onGround?c.pos.y:Math.min(c.pos.y,c.lastGround?.y??c.pos.y);
    uniforms.skyCutFloor.value=floor;uniforms.skyCutCamera.value.copy(camera.position);
    uniforms.skyCutFocus.value.set(c.pos.x,c.pos.y+.8,c.pos.z);
    const speed=Math.hypot(c.vel.x,c.vel.z),dx=speed>.15?c.vel.x/speed:-Math.sin(c.yaw),dz=speed>.15?c.vel.z/speed:-Math.cos(c.yaw);
    let nextFloor=floor;const nx=c.pos.x+dx*1.7,nz=c.pos.z+dz*1.7;
    for(const b of sky.near(nx-.1,nz-.1,nx+.1,nz+.1))if(b.solid&&!b.off&&nx>b.minX&&nx<b.maxX&&nz>b.minZ&&nz<b.maxZ&&b.maxY<=c.pos.y+.65&&b.maxY>=floor-2.5&&sky.oe(nx,b.maxY+.02,nz,.3,1.7))nextFloor=Math.max(nextFloor,b.maxY);
    uniforms.skyCutNextFloor.value=nextFloor;
    head.set(c.pos.x,c.pos.y+1.65,c.pos.z).project(camera);
    feet.set(c.pos.x,floor+.05,c.pos.z).project(camera);
    next.set(nx,nextFloor+.05,nz).project(camera);
    const width=renderer.domElement.width,height=renderer.domElement.height;
    for(const [key,point]of[['skyCutHead',head],['skyCutFeet',feet],['skyCutNext',next]]){
      uniforms[key].value.x=(point.x*.5+.5)*width;uniforms[key].value.y=(point.y*.5+.5)*height;
    }
    uniforms.skyCutRadius.value=Math.min(height*.12,130*renderer.getPixelRatio());
    document.body.dataset.skyCutaway='true';
  }
  function disable(){uniforms.skyCutOn.value=0;document.body.dataset.skyCutaway='false';}
  return {update,disable,get materials(){return copies.size}};
}
