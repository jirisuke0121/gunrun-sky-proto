(() => {
  const defaults = [
    { at: [26, 1.9, -1.5], normal: [0, 1], direction: [1, 0], name: '東の隙間' },
    { at: [29.6, 1.9, -25.2], normal: [0, 1], direction: [1, 0], name: '北の梁' },
    { at: [14, 1.4, 6.8], normal: [1, 0], direction: [0, 1], name: 'リング東壁' },
    { at: [-14, 0.3, -13.6], normal: [-1, 0], direction: [0, -1], name: 'リング西壁' },
    { at: [-14, 1.4, 6.8], normal: [-1, 0], direction: [0, 1], name: '西の路地・南への近道' },
  ];
  const key = 'gunrun-old-town-walljumps-v1';
  // Restore the published routes independently of saved editor designs. Moving
  // a design marker must not remove an existing in-game take-off point.
  let points = defaults;
  const rows = source => source.map(({ at, normal }) => [...at, ...normal]);
  const valid = value => Array.isArray(value) && value.length <= 128 && value.every(p =>
    Array.isArray(p) && p.length === 5 && p.every(Number.isFinite) &&
    Math.abs(p[0]) <= 150 && p[1] >= -20 && p[1] <= 100 && Math.abs(p[2]) <= 150 &&
    ((Math.abs(p[3]) === 1 && p[4] === 0) || (p[3] === 0 && Math.abs(p[4]) === 1)));
  function publish() {
    // Practice and canyon courses own their own permissions and route guides.
    if (window.skyPracticeMode || window.skySwingCourse) return;
    window.__skyWallRunSpots = defaults.map(({ at, normal }) => ({ at: [...at], normal: [...normal] }));
    window.__skyWallRunRoutes = defaults.map(({ at, normal, direction, name }) =>
      ({ at: [...at], normal: [...normal], direction: [...direction], name }));
    window.dispatchEvent?.(new Event('sky-walljump-layout-change'));
  }
  function apply(value, persist = false) {
    if (!valid(value)) return false;
    // Persist before changing the live registry so a denied write remains retryable.
    if (persist) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch { return false; }
    }
    if (JSON.stringify(value) === JSON.stringify(rows(points))) return true;
    points = value.map(([x, y, z, nx, nz], i) => {
      // Retain the route's arrow direction when its take-off point is moved on
      // the same face. New faces get a consistent tangent for their guide.
      const original = defaults.find(p => p.normal[0] === nx && p.normal[1] === nz &&
        Math.abs((nx ? p.at[0] : p.at[2]) - (nx ? x : z)) < .05 &&
        Math.hypot(p.at[0] - x, p.at[2] - z) < 10);
      return { at: [x, y, z], normal: [nx, nz], direction: original ? [...original.direction] : [-nz, nx],
        name: original?.name || `編集した壁ジャンプ ${i + 1}` };
    });
    return true;
  }
  window.skyWallJumpEditor = {
    key, defaults: () => rows(defaults), current: () => rows(points), apply,
    reset() {
      try { localStorage.removeItem(key); } catch { return false; }
      points = defaults; return true;
    },
  };
  publish();
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) apply(JSON.parse(stored));
  } catch { /* Keep published defaults if storage is corrupt or unavailable. */ }
  window.addEventListener?.('storage', event => {
    if (event.key !== key && event.key !== null) return;
    try { apply(event.newValue === null ? rows(defaults) : JSON.parse(event.newValue)); }
    catch { /* Keep the last valid live registry. */ }
  });

  // A jump marker permits only its wall face, never the whole wall object or
  // another face on the same building. Keep run permission separate from the
  // much smaller take-off area used by matchingPoint below.
  window.__skyCanWallRunOnFace = (wall, normal) => {
    if (!wall || wall.type !== "mono" || wall.wr === false || wall.off || !normal) return false;
    return (window.skyPracticeMode ? window.skyPracticeCourse.wallSpots : defaults).some(({ at: [x, y, z], normal: [nx, nz] }) => {
      if (normal.x !== nx || normal.z !== nz) return false;
      const plane = nx ? (nx > 0 ? wall.maxX : wall.minX) : (nz > 0 ? wall.maxZ : wall.minZ);
      const along = nx ? z : x;
      return Math.abs(plane - (nx ? x : z)) < .05
        && along > (nx ? wall.minZ : wall.minX) && along < (nx ? wall.maxZ : wall.maxX)
        && y >= wall.minY && y < wall.maxY;
    });
  };

  // A descending player may catch an approved face without already having
  // running speed. The capsule must actually touch that face; the ordinary
  // wider side probes must never turn a nearby fall into an automatic catch.
  window.__skyFindFallingWallRun = (player, getWall) => {
    if (player.onGround || player.state !== 'normal' || player.vel.y >= -1) return null;
    for (const [nx,nz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const normal={x:nx,z:nz};
      const wall=getWall(player.pos.x-nx*(player.r+.16),player.pos.y+1,player.pos.z-nz*(player.r+.16));
      if (!wall || !window.__skyCanWallRunOnFace?.(wall,normal) || wall.wf && !wall.wf[nx+','+nz]) continue;
      const plane=nx?(nx>0?wall.maxX:wall.minX):(nz>0?wall.maxZ:wall.minZ);
      const distance=(nx?player.pos.x-plane:player.pos.z-plane)*(nx||nz);
      if (distance<player.r-.04 || distance>player.r+.16) continue;
      let tx=nx?0:player.vel.x,tz=nz?0:player.vel.z;
      let length=Math.hypot(tx,tz);
      if (length<1) {
        tx=nx?0:-Math.sin(player.yaw);tz=nz?0:-Math.cos(player.yaw);length=Math.hypot(tx,tz);
        if (length<.25) {
          const routes=window.skyPracticeMode?window.skyPracticeCourse.wallSpots:defaults;
          const route=routes.find(p=>{
            const along=nx?p.at[2]:p.at[0];
            return p.normal[0]===nx&&p.normal[1]===nz&&Math.abs((nx?p.at[0]:p.at[2])-plane)<.05&&
              along>(nx?wall.minZ:wall.minX)&&along<(nx?wall.maxZ:wall.maxX);
          });
          [tx,tz]=route?.direction||[-nz,nx];length=Math.hypot(tx,tz);
        }
      }
      tx/=length;tz/=length;
      return {w:wall,n:normal,side:(-tz*nx+tx*nz)<0?1:-1,direction:[tx,tz],falling:true};
    }
    return null;
  };

  function matchingPoint(player, getWall, wallNormal) {
    const radius = player.r + 0.55;
    // Falling catches use their actual contact height on the same approved
    // face. Ordinary runs keep the original marked take-off areas.
    if (player.state==='wallrun' && player.wallDrop && wallNormal) {
      const {x:nx,z:nz}=wallNormal;
      const wall=getWall(player.pos.x-nx*radius,player.pos.y+1,player.pos.z-nz*radius);
      if (wall===player.wallDrop && window.__skyCanWallRunOnFace?.(wall,wallNormal)) {
        const plane=nx?(nx>0?wall.maxX:wall.minX):(nz>0?wall.maxZ:wall.minZ);
        const distance=(nx?player.pos.x-plane:player.pos.z-plane)*(nx||nz);
        if (distance>=player.r-.04 && distance<=player.r+.25) return {at:[player.pos.x,player.pos.y,player.pos.z],normal:[nx,nz]};
      }
    }
    return (window.skyPracticeMode ? [...window.skyPracticeCourse.wallSpots,window.skySwingCourse.wall] : window.skySwingCourse ? [window.skySwingCourse.wall] : defaults).find(({ at, normal }) => {
      const [x, y, z] = at;
      const [nx, nz] = normal;
      if (wallNormal && wallNormal.x * nx + wallNormal.z * nz < 0.8) return false;

      const wall = getWall(
        player.pos.x - nx * radius,
        player.pos.y + 1,
        player.pos.z - nz * radius,
      );
      if (!wall) return false;

      const planeDistance = nx
        ? Math.abs(player.pos.x - (x + nx * (player.r + 0.04)))
        : Math.abs(player.pos.z - (z + nz * (player.r + 0.04)));
      const alongWallDistance = nx ? Math.abs(player.pos.z - z) : Math.abs(player.pos.x - x);
      return planeDistance <= 0.9 && alongWallDistance <= 2 && Math.abs(player.pos.y - y) <= 1.8;
    });
  }

  window.__skyCanWallJumpAtSpot = (player, getWall, wallNormal) =>
    !!matchingPoint(player, getWall, wallNormal);

  window.__skyTryRegisteredWallJump = (player, settings, getWall, time, stats, audio) => {
    const spot = matchingPoint(
      player,
      getWall,
      player.state === "wallrun" ? player.wallN : null,
    );
    if (!spot) return false;

    const [nx, nz] = spot.normal;
    const intoWall = player.vel.x * nx + player.vel.z * nz;
    const tangentX = player.vel.x - nx * intoWall;
    const tangentZ = player.vel.z - nz * intoWall;
    player.vel.x = tangentX + nx * settings.wallJumpPush;
    player.vel.z = tangentZ + nz * settings.wallJumpPush;
    player.vel.y = settings.jumpVel * 0.95;
    player.edgeJump = true;
    player.onGround = false;
    player.state = "normal";
    player.jumpBuf = 0;
    player.airT = 0;
    player.wallT = 0;
    player.wallDrop = null;
    window.skyTelemetryProbe?.jumpAccepted(time, "walljump");
    stats.walljumps = (stats.walljumps || 0) + 1;
    audio.jump();
    return true;
  };
})();
