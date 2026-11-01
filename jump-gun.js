import { playGearSound } from './gear-audio.js?v=20261026-gear-polish-v1';
import { bindSkillPress } from './player-skills.js?v=20261030-decoy-v1';
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

// Store the pickup separately; draw its movement weapon only for the launch.
// The directly selected legacy weapon still rearms on landing.
export function createJumpGun(game) {
  const { c, U, Et, z, ue, Geom } = game;
  try { if (migrateJumpGunSettings(U, localStorage)) { game.Ua(); game.nl(); } } catch {}
  const { Vector3, Mesh, Torus, Basic } = Geom;
  const material = new Basic({ color:0x7ceaff, transparent:true, opacity:0, depthWrite:false });
  const ring = new Mesh(new Torus(.20,.025,6,24),material);
  ring.rotation.x=-Math.PI/2;ring.visible=false;ue.add(ring);
  const pulsePoint=new Vector3();
  let spent=false,launchTime=-1,lastClock=0,ringLife=0;
  let carried=false, savedWeapon=null, returnAt=0, drawnAt=0;
  const button=document.createElement('button');
  button.id='tJumpGun';button.type='button';button.className='player-skill';button.hidden=true;
  button.setAttribute('aria-label','ジャンプ弾を使う');
  button.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m8 15 8-9 8 9M16 6v19M7 25h18"/></svg><span class="skill-value">1</span><span class="skill-name">ジャンプ弾 <kbd>Z</kbd></span>';
  const quantity=button.querySelector('.skill-value');let controlState='';
  const fireLabel=document.getElementById('tFire').textContent;
  function stow() {
    const wasDrawn=!!savedWeapon;
    if(savedWeapon && (U.weapon|0)===12) {
      U.gunOn=savedWeapon.gunOn;
      game.equipWeapon(savedWeapon.weapon);
      Object.assign(Et,savedWeapon.state,{fireCD:Math.max(0,savedWeapon.state.fireCD-Math.max(0,z.t-drawnAt)),held:false,trigger:0});
    }
    savedWeapon=null;returnAt=0;
    document.getElementById('tFire').textContent=fireLabel;
    if(wasDrawn)report('stowed');
  }
  function cancelPickup() { carried=false;stow();syncControl(); }
  function grant() {
    if(carried || savedWeapon || game.modeRef()!=='play' || z.over)return false;
    carried=true;spent=false;
    game.rn('ジャンプ弾取得！ Zキー・専用ボタンで使う');
    report('stored');syncControl();return true;
  }
  const report = (result, extra={}) => {
    document.body.dataset.skyJumpGun=JSON.stringify({result,ready:!spent,carrying:carried,presenting:!!savedWeapon,...extra});
  };
  const canUse=()=>carried && !savedWeapon && !spent && game.modeRef()==='play' && !z.over &&
    !c.doorAction && !['ledge','ladder','swing'].includes(c.state);
  function use() {
    if(!canUse())return false;
    if(!floorPoint()) {game.rn('足元に床がある場所で発射すると大ジャンプ');report('no-floor');return false;}
    const state={};for(const key of ['mag','reloadLen','ammo','reserve','reloadT','autoReload','fireCD'])state[key]=Et[key];
    savedWeapon={weapon:U.weapon|0,gunOn:U.gunOn,state};drawnAt=z.t;
    window.__easyWeaponPort?.cancelTrigger?.();
    U.gunOn=true;game.equipWeapon(12);
    Object.assign(Et,{ammo:1,reloadT:0,autoReload:0,fireCD:0,held:false,trigger:0});
    game.fireWeapon();
    if(!spent) {stow();syncControl();return false;}
    carried=false;returnAt=z.t+.28;syncControl();return true;
  }
  function syncControl() {
    const dock=document.getElementById('skillDock');if(dock && button.parentElement!==dock)dock.append(button);
    const hidden=!(carried || savedWeapon) || game.modeRef()!=='play' || z.over,disabled=!canUse();
    const key=`${hidden}:${disabled}:${carried}`;if(key===controlState)return;controlState=key;
    button.hidden=hidden;button.disabled=disabled;button.classList.toggle('cool',disabled);
    quantity.textContent=carried?'1':'0';
  }
  bindSkillPress(button,canUse,use);
  document.addEventListener('keydown',event=>{
    if(event.code!=='KeyZ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.target?.isContentEditable || !canUse())return;
    event.preventDefault();event.stopImmediatePropagation();use();
  },true);
  window.addEventListener('blur',()=>{if(savedWeapon)stow();syncControl();});
  function floorPoint() {
    const hit=game.raycast(c.pos.x,c.pos.y+.25,c.pos.z,0,-1,0,3);
    if(!hit)return null;
    const point=new Vector3(c.pos.x,c.pos.y+.25-hit.t,c.pos.z);
    return Math.abs(point.y-hit.b.maxY)<.045?point:null;
  }
  function reset() {
    cancelPickup();spent=false;launchTime=-1;lastClock=0;ringLife=0;ring.visible=false;
    if(window.__game?.stats)window.__game.stats.jumpGunLaunches=0;
    report('reset');
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
    if(savedWeapon)carried=false;
    game.rn('反動ジャンプ！ 空中で進路を調整');
    report('launched',{point:point.toArray(),velocity:c.vel.toArray(),life:c.life,up,push});
    return {handled:true,suppressTracer:true};
  }
  function tick(dt) {
    const mode=game.modeRef();
    if(savedWeapon && (mode!=='play' || z.over || z.t>=returnAt))stow();
    if(mode==='menu' || z.over)carried=false;
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
      if(!savedWeapon) {
        document.getElementById('tFire').textContent='跳ぶ';
        document.getElementById('tFire').hidden=false;
      }
    }
    syncControl();
  }
  return {fire,tick,blockShot,reset,grant,use,cancelPickup,get carrying(){return carried;},get presenting(){return !!savedWeapon;},playSound(){ document.body.dataset.skyGunSound='Jump Gun pressure pulse'; return playGearSound(game,'jump'); },get ready(){return !spent;}};
}
