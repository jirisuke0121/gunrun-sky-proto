// First-person framing is independent of the world/third-person weapon models.
// Coordinates below use a common frame: rear at Z=0, muzzle toward -Z, rail at Y=0.
export const FIRST_PERSON_WEAPONS = [
  { length:.38, position:[.26,-.14,-.56], grip:[0,-.15,-.07], support:[-.06,-.09,-.16], kick:.045, pitch:.12, reload:'magazine' },
  { length:.95, position:[.31,-.19,-.27], grip:[0,-.11,-.34], support:[-.045,-.07,-.62], kick:.095, pitch:.19, reload:'shell' },
  { length:.66, position:[.30,-.19,-.31], grip:[0,-.13,-.28], support:[-.045,-.09,-.44], kick:.035, pitch:.075, reload:'magazine' },
  { length:1.02,position:[.34,-.20,-.30], grip:[0,-.15,-.38], support:[-.05,-.10,-.68], kick:.055, pitch:.105, reload:'belt' },
  { length:.36, position:[.26,-.14,-.56], grip:[0,-.15,-.07], support:[-.06,-.09,-.16], kick:.045, pitch:.12, reload:'magazine' },
  { length:.90, position:[.30,-.19,-.28], grip:[0,-.13,-.36], support:[-.045,-.09,-.59], kick:.085, pitch:.17, reload:'magazine' },
  { length:.88, position:[.31,-.19,-.29], grip:[0,-.13,-.36], support:[-.045,-.08,-.58], kick:.035, pitch:.075, reload:'magazine' },
  { length:.97, position:[.32,-.19,-.31], grip:[0,-.12,-.34], support:[-.045,-.07,-.63], kick:.065, pitch:.10, reload:'cell' },
  { length:.90, position:[.31,-.18,-.31], grip:[0,-.13,-.34], support:[-.045,-.07,-.60], kick:.012, pitch:.025, reload:'cell' },
  { length:.83, position:[.33,-.20,-.32], grip:[0,-.15,-.40], support:[-.06,-.09,-.54], kick:.090, pitch:.16, reload:'breech' },
  { length:1.02,position:[.37,-.15,-.30], grip:[0,-.12,-.50], support:[-.035,-.07,-.67], kick:.105, pitch:.17, reload:'rocket' },
  { length:.78, position:[.30,-.19,-.32], grip:[0,-.13,-.35], support:[-.045,-.08,-.51], kick:.085, pitch:.16, reload:'breech' },
  { length:.68, position:[.30,-.18,-.34], grip:[0,-.13,-.24], support:[-.045,-.08,-.43], kick:.14, pitch:.25, reload:'cell' },
];

const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const pulse = (p,a,b) => p<a || p>b ? 0 : Math.sin(Math.PI*(p-a)/(b-a));

export function createFirstPersonWeapons(game, prototypes, loaded, excludedHandParts) {
  const { U, Et, c, fo, mr, za:camera } = game;
  const { Group, Vector3, Mesh, Cylinder, Sphere, Basic, Standard } = game.Geom;
  const rig = new Group();
  rig.name = 'First person weapon and hands';
  fo.add(rig);
  game.vd.visible=false;
  const weaponRoot = new Group(); rig.add(weaponRoot);
  const handsRoot = new Group(); rig.add(handsRoot);
  const sleeveMaterial = new Standard({color:0x303a37,roughness:.95});
  const sleeveGeometry = new Cylinder(.032,.046,1,10);
  // Knife and free-hand parkour keep their animated wrists, with a smaller
  // rounded sleeve instead of the original box reaching into the camera.
  for(const hand of mr) for(const part of hand.wrist.children) {
    if(part.isMesh && part.geometry?.parameters?.depth===.22) {
      part.geometry.dispose();part.geometry=new Cylinder(.035,.043,.18,10);
      part.rotation.x=Math.PI/2;part.position.z=.12;part.userData.skySleeve=true;
    }
  }
  const flash = new Group();
  const flashMaterial = new Basic({color:0xffcf79,transparent:true,opacity:.85,depthWrite:false});
  const flashCore = new Mesh(new Sphere(.035,7,5),flashMaterial);
  const flashTip = new Mesh(new Cylinder(0,.022,.12,6),flashMaterial);
  flashTip.rotation.x=-Math.PI/2; flashTip.position.z=-.05;
  flash.add(flashCore,flashTip); rig.add(flash); flash.visible=false;
  const muzzle = new Vector3(), point = new Vector3(), direction = new Vector3();
  const up = new Vector3(0,1,0);
  const rightGrip=new Vector3(),leftGrip=new Vector3(),rightElbow=new Vector3(.40,-.46,-.06),leftElbow=new Vector3(-.45,-.42,-.12);
  let signature='', model=null, animatedParts=[], hands=[], kick=0, flashT=0, shotClock=1;
  let lastShots=0, active=false, gloveLoaded=false, unityHands=null;
  new T2.GLTFLoader().load('./assets/human-first-person-hands.glb?v=20261025-fp-weapons-v1',gltf=>{
    unityHands=gltf.scene;
    loaded.firstPersonHands=true;
    document.body.dataset.skyModels=JSON.stringify(loaded);
    rebuildHands();
  },undefined,error=>console.warn('First-person hands fallback',error));

  function bounds(object) {
    object.updateMatrixWorld(true);
    const box = {min:new Vector3(Infinity,Infinity,Infinity),max:new Vector3(-Infinity,-Infinity,-Infinity)};
    object.traverse(node=>{
      if (!node.isMesh || !node.geometry) return;
      for (let parent=node; parent; parent=parent.parent) if (!parent.visible) return;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const local=node.geometry.boundingBox;
      for(const x of [local.min.x,local.max.x]) for(const y of [local.min.y,local.max.y]) for(const z of [local.min.z,local.max.z]) {
        const corner=new Vector3(x,y,z).applyMatrix4(node.matrixWorld);
        box.min.min(corner);box.max.max(corner);
      }
    });
    return box;
  }
  function rebuildHands() {
    handsRoot.clear(); hands=[];
    for (const hand of mr) {
      const wrist = new Group();
      const unity=unityHands?.getObjectByName(hand.side===1?'Unity_Right_Hand':'Unity_Left_Hand');
      if(unity) {
        const copy=unity.clone(true);copy.scale.setScalar(.35);wrist.add(copy);
      } else {
        for (const original of hand.wrist.children) {
          if (excludedHandParts.includes(original)) continue;
          if (original.userData.skySleeve || (original.isMesh && original.geometry?.parameters?.depth===.22)) continue;
          const copy=original.clone(true);
          if (hand.fingers.includes(original)) copy.rotation.x=-1.35;
          wrist.add(copy);
        }
      }
      wrist.traverse(node=>{if(node.isMesh) node.castShadow=false;});
      handsRoot.add(wrist);
      const sleeve = new Mesh(sleeveGeometry,sleeveMaterial);
      handsRoot.add(sleeve);
      hands.push({wrist,sleeve});
    }
    gloveLoaded=loaded.glove;
  }
  function build(weapon,source) {
    weaponRoot.clear(); animatedParts=[];
    const clone=source.clone(true);
    clone.position.set(0,0,0);clone.rotation.set(0,0,0);clone.scale.setScalar(1);clone.visible=true;
    clone.traverse(node=>{if(node.userData.skyFlash || node.name.includes('reload magazine')) node.visible=false;});
    const axis=new Group(); axis.add(clone);
    if(weapon>=4 && weapon<=11) axis.rotation.y=Math.PI; // Unity exports point +Z.
    const box=bounds(axis),size=new Vector3().subVectors(box.max,box.min);
    if(!Number.isFinite(size.z) || size.z<.001) return;
    const scale=FIRST_PERSON_WEAPONS[weapon].length/size.z;
    axis.position.set(-(box.min.x+box.max.x)/2,-box.max.y,-box.max.z);
    const fit=new Group();fit.scale.setScalar(scale);fit.add(axis);weaponRoot.add(fit);
    model=clone;
    for(const name of ['Pistol_Slide','M4_Magazine','shotgun_magazine']) {
      const target=clone.getObjectByName(name),original=source.getObjectByName(name);
      if(target && original) animatedParts.push({target,original});
    }
    rebuildHands();
  }
  function placeHand(hand,position,elbow,rotation) {
    hand.wrist.position.copy(position);hand.wrist.rotation.set(...rotation);
    direction.copy(elbow).sub(position);
    hand.sleeve.position.copy(position).addScaledVector(direction,.5);
    hand.sleeve.scale.y=direction.length();
    hand.sleeve.quaternion.setFromUnitVectors(up,direction.normalize());
  }
  function update(dt,thirdPerson) {
    const door = c.doorAction;
    if (!door || thirdPerson) delete document.body.dataset.skyFirstPersonDoor;
    const weapon=U.weapon|0, source=prototypes[weapon];
    const nextSignature=`${weapon}:${source.children.length}`;
    if(nextSignature!==signature) {
      signature=nextSignature;build(weapon,source);kick=0;
    }
    if(gloveLoaded!==loaded.glove) rebuildHands();
    const shots=window.__game?.stats?.shots||0;
    if(shots<lastShots) lastShots=shots;
    if(shots>lastShots) {
      kick=Math.min(1.4,kick+1);flashT=.075;shotClock=0;
    }
    lastShots=shots;shotClock+=dt;
    kick*=Math.exp(-dt*(weapon===1||weapon>=9?10:16));flashT=Math.max(0,flashT-dt);
    const freeHands=['ladder','ledge','zip','hook','swing'].includes(c.state) || !!c.swingFall || game.nn.t>0;
    active=!!model && (!!U.gunOn || !!door) && !!U.showBody && game.modeRef()!=='menu' && !window.skySettings?.beforeRun && !thirdPerson && !freeHands;
    rig.visible=active;
    for(const prototype of prototypes) prototype.visible=false;
    if(!active) {
      // With a gun equipped the knife is held by the left hand. Keep the idle
      // right arm out of the strike so its forearm cannot cover the blade.
      if(game.nn.t>0 && U.gunOn) mr[1].root.visible=false;
      flash.visible=false;
      document.body.dataset.skyFirstPerson=JSON.stringify({weapon,revision:'weapon-framing-v1',visible:false,state:c.state,thirdPerson});
      return;
    }
    // The original arm animation is retained for knife and parkour states.
    for(const hand of mr) hand.root.visible=false;
    weaponRoot.visible = !door;
    if (door) {
      rig.scale.setScalar(1); rig.position.set(0,0,0); rig.rotation.set(0,0,0);
      point.set(door.contact.x,door.contact.y,door.contact.z).applyMatrix4(game.Se.matrixWorldInverse);
      const w=door.weight;
      rightGrip.set(.32,-.34,-.34).lerp(new Vector3(clamp(point.x,-.6,.6),clamp(point.y,-.5,.12),clamp(point.z,-.9,-.42)),w);
      leftGrip.set(-.29,-.43,-.32);
      placeHand(hands[1],rightGrip,rightElbow,[.2*w,-.65*w,-Math.PI/2+.35*w]);
      placeHand(hands[0],leftGrip,leftElbow,[0,0,Math.PI/2]);
      flash.visible=false;
      document.body.dataset.skyFirstPersonDoor=JSON.stringify({kind:door.kind,phase:+door.phase.toFixed(3),hand:rightGrip.toArray().map(x=>+x.toFixed(3)),weaponVisible:false});
      return;
    }
    delete document.body.dataset.skyFirstPersonDoor;
    const profile=FIRST_PERSON_WEAPONS[weapon];
    const progress=Et.reloadT>0 && Et.reloadLen>0?clamp(1-Et.reloadT/Et.reloadLen,0,1):0;
    const reload=progress>0?Math.sin(Math.PI*progress):0;
    const speed=Math.hypot(c.vel.x,c.vel.z);
    const moving=c.onGround && c.state==='normal';
    const bob=moving?Math.sin(c.bob)*Math.min(.008,speed*.0013):0;
    const slide=c.state==='slide'?1:0, airborne=!c.onGround?.025:0;
    const aspect=camera.aspect, narrow=Math.min(1,aspect/1.45);
    rig.scale.setScalar(aspect<1.2?.86:1);
    rig.position.set(profile.position[0]*narrow+bob,profile.position[1]-.045*reload-.055*slide-airborne,profile.position[2]+profile.kick*kick);
    rig.rotation.set(.025+profile.pitch*kick+.10*reload,.10+.16*reload,.08*slide-.25*reload+(c.state==='wallrun'?.12*c.wallSide:0));
    for(const {target,original} of animatedParts) {target.position.copy(original.position);target.quaternion.copy(original.quaternion);}
    const right=rightGrip.set(...profile.grip),left=leftGrip.set(...profile.support);
    right.z+=.09;right.x+=.025;
    const pistol=weapon===0 || weapon===4;
    if(pistol) left.set(-.065,-.17,.025);
    else left.x-=.065;
    // The support hand removes/inserts a magazine, feeds shells or opens a breech.
    const reach=pulse(progress,.12,.78);
    left.y-=reach*(profile.reload==='shell'?.12:.24);
    left.z+=reach*.13;
    if(profile.reload==='rocket') {left.z+=reach*.22;left.x-=reach*.08;}
    if(weapon===1 && shotClock<.42) left.z+=Math.sin(Math.PI*shotClock/.42)*.08;
    placeHand(hands[1],right,rightElbow,[0,0,-Math.PI/2]);
    placeHand(hands[0],left,leftElbow,pistol?[0,.10,Math.PI/2]:[0,-Math.PI/2,0]);
    flash.position.set(0,-.035,-profile.length-.025);
    flash.visible=flashT>0 && game.modeRef()==='play';
    flash.scale.setScalar(weapon===8?.5:weapon>=9?1.8:1);
    rig.updateMatrixWorld(true);
    muzzle.copy(flash.position);rig.localToWorld(muzzle);point.copy(muzzle).project(camera);
    document.body.dataset.skyFirstPerson=JSON.stringify({weapon,name:game.WP[weapon].n,revision:'weapon-framing-v1',visible:true,state:c.state,length:profile.length,muzzle:[+point.x.toFixed(3),+point.y.toFixed(3)],kick:+kick.toFixed(3),reload:+progress.toFixed(3),flash:flash.visible,hands:hands.length});
  }
  function getMuzzleWorld() {
    if(!active) return null;
    // The hands camera uses a fixed FOV. Convert its screen position through the
    // world camera so the beam/projectile begins at the rendered barrel.
    muzzle.copy(flash.position);rig.localToWorld(muzzle);muzzle.project(camera);
    const ray=new Vector3(muzzle.x,muzzle.y,.5).unproject(game.Se).sub(game.Se.position).normalize();
    return game.Se.position.clone().addScaledVector(ray,.8);
  }
  return {update,getMuzzleWorld,get active(){return active;}};
}
