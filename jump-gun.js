// A movement weapon: one floor-powered impulse per flight, rearmed on landing.
export function createJumpGun(game) {
  const { c, U, Et, z, ue, Geom } = game;
  const { Vector3, Mesh, Torus, Basic } = Geom;
  const material = new Basic({ color:0x7ceaff, transparent:true, opacity:0, depthWrite:false });
  const ring = new Mesh(new Torus(.20,.025,6,24),material);
  ring.rotation.x=-Math.PI/2;ring.visible=false;ue.add(ring);
  const pulsePoint=new Vector3();
  let spent=false,launchTime=-1,lastClock=0,ringLife=0;
  const report = (result, extra={}) => {
    document.body.dataset.skyJumpGun=JSON.stringify({result,ready:!spent,...extra});
  };
  function reset() {
    spent=false;launchTime=-1;lastClock=0;ringLife=0;ring.visible=false;
    if(window.__game?.stats)window.__game.stats.jumpGunLaunches=0;
  }
  function blockShot() {
    if((U.weapon|0)!==12 || !spent)return false;
    Et.fireCD=.18;game.rn('着地するとジャンプガンを再使用できます');
    report('await-landing');return true;
  }
  function fire({origin,direction,raycast,particles,stats}) {
    Et.ammo=Et.mag;Et.autoReload=0;
    // Aim from the player even in third person; a nearby wall still blocks it.
    const start=new Vector3(c.pos.x,c.pos.y+c.eye,c.pos.z);
    const hit=raycast(start.x,start.y,start.z,direction.x,direction.y,direction.z,4.5);
    const point=hit?start.clone().addScaledVector(direction,hit.t):null;
    const floor=point && direction.y<-.28 && Math.abs(point.y-hit.b.maxY)<.045
      && Math.hypot(point.x-c.pos.x,point.z-c.pos.z)<=3.8;
    if(!floor) {
      game.rn('近くの床を狙って撃つと大ジャンプ');
      report('no-floor');return {handled:true,suppressTracer:true};
    }
    spent=true;launchTime=z.t;
    const up=Number.isFinite(U.jumpGunUp)?Math.max(4,Math.min(20,U.jumpGunUp)):11.2;
    const push=Number.isFinite(U.jumpGunPush)?Math.max(0,Math.min(14,U.jumpGunPush)):8;
    c.state='normal';c.ledge=null;c.ladder=null;c.wallKey=null;
    c.onGround=false;c.coyote=0;c.airT=0;c.jumpBuf=0;
    c.vel.y=Math.max(c.vel.y,Math.max(up*(8.2/11.2),-direction.y*up));
    c.vel.x-=direction.x*push;c.vel.z-=direction.z*push;
    const speed=Math.hypot(c.vel.x,c.vel.z);
    if(speed>14){c.vel.x*=14/speed;c.vel.z*=14/speed;}
    c.shake=Math.max(c.shake||0,.22);
    pulsePoint.copy(point);pulsePoint.y+=.035;
    ring.position.copy(pulsePoint);ring.scale.setScalar(1);ring.visible=true;ringLife=.42;
    particles(point.x,point.y+.06,point.z,12,'dust',2,.3);
    game.Tt.bang(.6);
    stats.jumpGunLaunches=(stats.jumpGunLaunches||0)+1;
    game.rn('反動ジャンプ！ 空中で進路を調整');
    report('launched',{point:point.toArray(),velocity:c.vel.toArray(),life:c.life,up,push});
    return {handled:true,suppressTracer:true};
  }
  function tick(dt) {
    const mode=game.modeRef();
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
      document.getElementById('hAmmo').textContent=spent?'着地待ち':'READY';
      document.getElementById('hRes').textContent='Jump Gun・近い床を狙う';
      document.getElementById('tFire').textContent='床撃ち';
    }
  }
  return {fire,tick,blockShot,reset,get ready(){return !spent;}};
}
