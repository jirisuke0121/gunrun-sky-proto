import { playGearSound } from './gear-audio.js?v=20261026-gear-polish-v1';
export const JUMP_GUN = Object.freeze({ up: 20, push: 10, maxUp: 24, maxPush: 14 });

export function migrateJumpGunSettings(settings, storage) {
  let changed = false;
  if (!storage.getItem('gunrun-jumpgun-power-20261026')) {
    if (settings.jumpGunUp === 11.2) { settings.jumpGunUp = JUMP_GUN.up; changed = true; }
    if (settings.jumpGunPush === 8) { settings.jumpGunPush = JUMP_GUN.push; changed = true; }
    storage.setItem('gunrun-jumpgun-power-20261026', '1');
  }
  // Upgrade the previous default once, including players already migrated above.
  if (!storage.getItem('gunrun-jumpgun-power-20261027-v2')) {
    if (settings.jumpGunUp === 16) { settings.jumpGunUp = JUMP_GUN.up; changed = true; }
    storage.setItem('gunrun-jumpgun-power-20261027-v2', '1');
  }
  return changed;
}

// A movement weapon: one floor-powered impulse per flight, rearmed on landing.
export function createJumpGun(game) {
  const { c, U, Et, z, ue, Geom } = game;
  try { if (migrateJumpGunSettings(U, localStorage)) { game.Ua(); game.nl(); } } catch {}
  const { Vector3, Mesh, Torus, Basic } = Geom;
  const material = new Basic({ color:0x7ceaff, transparent:true, opacity:0, depthWrite:false });
  const ring = new Mesh(new Torus(.20,.025,6,24),material);
  ring.rotation.x=-Math.PI/2;ring.visible=false;ue.add(ring);
  const pulsePoint=new Vector3();
  let spent=false,launchTime=-1,lastClock=0,ringLife=0;
  let previousWeapon=null, previousGunOn=true, returnPending=false;
  const fireLabel=document.getElementById('tFire').textContent;
  function cancelPickup() {
    if(previousWeapon!==null && (U.weapon|0)===12) {
      U.gunOn=previousGunOn;
      game.equipWeapon(previousWeapon);
    }
    previousWeapon=null;returnPending=false;
    document.getElementById('tFire').textContent=fireLabel;
  }
  function grant() {
    if(previousWeapon!==null || game.modeRef()!=='play' || z.over)return false;
    previousWeapon=U.weapon|0;previousGunOn=U.gunOn;
    U.gunOn=true;game.equipWeapon(12);
    spent=false;Et.ammo=1;Et.reloadT=0;Et.fireCD=.12;Et.autoReload=0;Et.held=false;Et.trigger=0;
    game.rn('JUMP取得！ 発射で足元を自動撃ち・1回使える');
    report('equipped');return true;
  }
  const report = (result, extra={}) => {
    document.body.dataset.skyJumpGun=JSON.stringify({result,ready:!spent,...extra});
  };
  function reset() {
    cancelPickup();spent=false;launchTime=-1;lastClock=0;ringLife=0;ring.visible=false;
    if(window.__game?.stats)window.__game.stats.jumpGunLaunches=0;
  }
  function blockShot() {
    if((U.weapon|0)!==12 || !spent)return false;
    Et.fireCD=.18;game.rn('着地するとジャンプガンを再使用できます');
    report('await-landing');return true;
  }
  function fire({origin,direction,raycast,particles,stats}) {
    Et.ammo=Et.mag;Et.autoReload=0;
    // Target the floor beneath the feet independently of camera/muzzle aim.
    const start=new Vector3(c.pos.x,c.pos.y+.25,c.pos.z);
    const hit=raycast(start.x,start.y,start.z,0,-1,0,3);
    const point=hit?start.clone().addScaledVector(new Vector3(0,-1,0),hit.t):null;
    const floor=point && Math.abs(point.y-hit.b.maxY)<.045;
    if(!floor) {
      game.rn('足元に床がある場所で発射すると大ジャンプ');
      report('no-floor');return {handled:true,suppressTracer:true};
    }
    spent=true;launchTime=z.t;
    const up=Number.isFinite(U.jumpGunUp)?Math.max(4,Math.min(JUMP_GUN.maxUp,U.jumpGunUp)):JUMP_GUN.up;
    const push=Number.isFinite(U.jumpGunPush)?Math.max(0,Math.min(JUMP_GUN.maxPush,U.jumpGunPush)):JUMP_GUN.push;
    c.state='normal';c.ledge=null;c.ladder=null;c.wallKey=null;
    c.edgeJump=true;c.onGround=false;c.coyote=0;c.airT=0;c.jumpBuf=0;
    c.vel.y=Math.max(c.vel.y,up);
    const moving=Math.hypot(c.vel.x,c.vel.z);
    const forwardX=moving>.5?c.vel.x/moving:-Math.sin(c.yaw);
    const forwardZ=moving>.5?c.vel.z/moving:-Math.cos(c.yaw);
    c.vel.x+=forwardX*push;c.vel.z+=forwardZ*push;
    const speed=Math.hypot(c.vel.x,c.vel.z);
    if(speed>14){c.vel.x*=14/speed;c.vel.z*=14/speed;}
    c.shake=Math.max(c.shake||0,.22);
    pulsePoint.copy(point);pulsePoint.y+=.035;
    ring.position.copy(pulsePoint);ring.scale.setScalar(1);ring.visible=true;ringLife=.42;
    particles(point.x,point.y+.06,point.z,12,'dust',2,.3);
    stats.jumpGunLaunches=(stats.jumpGunLaunches||0)+1;
    game.rn('反動ジャンプ！ 空中で進路を調整');
    returnPending=previousWeapon!==null;
    report('launched',{point:point.toArray(),velocity:c.vel.toArray(),life:c.life,up,push});
    return {handled:true,suppressTracer:true};
  }
  function tick(dt) {
    const mode=game.modeRef();
    if(returnPending || mode==='menu' || z.over)cancelPickup();
    if(mode==='menu' || z.t+.05<lastClock){
      spent=false;launchTime=-1;ringLife=0;ring.visible=false;
      if(window.__game?.stats)window.__game.stats.jumpGunLaunches=0;
    }
    lastClock=z.t;
    if(mode==='play' && !z.over) {
      if(spent && z.t-launchTime>.18 && c.onGround && c.vel.y<=.2){spent=false;report('landed');}
      ringLife=Math.max(0,ringLife-dt);
    }
    ring.visible=ringLife>0 && mode!=='menu';
    if(ring.visible){const p=1-ringLife/.42;ring.scale.setScalar(1+p*8);material.opacity=(1-p)*.85;}
    if((U.weapon|0)===12 && mode!=='menu') {
      document.getElementById('hAmmo').textContent=spent?'0':'1';
      document.getElementById('hRes').textContent=spent?'JUMP・着地待ち':'JUMP';
      document.getElementById('tFire').textContent='跳ぶ';
      document.getElementById('tReload').style.display='none';
    }
  }
  return {fire,tick,blockShot,reset,grant,cancelPickup,get carrying(){return previousWeapon!==null;},playSound(){ document.body.dataset.skyGunSound='Jump Gun pressure pulse'; return playGearSound(game,'jump'); },get ready(){return !spent;}};
}
