// Reuse the live avatar's geometry and morph weights. GreaterDepth draws only
// the part hidden by opaque scenery; visible body pixels keep their real skin.
export function createHumanOcclusion(Geom, world, sources, doc) {
  const root=new Geom.Group();root.name='Occluded player silhouette';root.visible=false;
  const material=new Geom.Standard({color:0x5edbe7,emissive:0x5edbe7,
    emissiveIntensity:1,transparent:true,opacity:.7,depthTest:true,depthWrite:false,
    depthFunc:6 /* GreaterDepth */,fog:false,toneMapped:false});
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float rim=1.0-abs(dot(normalize(vNormal),normalize(vViewPosition)));
      diffuseColor.a=.12+.7*smoothstep(.15,.7,rim);
      outgoingLight=vec3(.18,.85,.92);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> 'occluded-player-rim-v1';
  const copies=sources.map(source=>{
    const mesh=source.clone(false);mesh.material=material;mesh.castShadow=false;mesh.receiveShadow=false;
    mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;mesh.renderOrder=50;
    if(source.morphTargetInfluences)mesh.morphTargetInfluences=source.morphTargetInfluences;
    root.add(mesh);return{source,mesh};
  });
  world.add(root);
  return{
    update(enabled){
      root.visible=enabled;
      if(enabled)for(const{source,mesh}of copies){source.updateWorldMatrix(true,false);mesh.matrix.copy(source.matrixWorld);mesh.visible=source.visible;}
      doc.body.dataset.skyHumanOccluded=String(enabled);
    },
    get visible(){return root.visible},
    dispose(){root.removeFromParent();material.dispose();}
  };
}
