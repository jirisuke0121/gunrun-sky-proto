(() => {
  const points = [
    { at: [26, 1.9, -1.5], normal: [0, 1], direction: [1, 0], name: '東の隙間' },
    { at: [29.6, 1.9, -25.2], normal: [0, 1], direction: [1, 0], name: '北の梁' },
    { at: [14, 1.4, 6.8], normal: [1, 0], direction: [0, 1], name: 'リング東壁' },
    { at: [-14, 0.3, -13.6], normal: [-1, 0], direction: [0, -1], name: 'リング西壁' },
  ];
  window.__skyWallRunSpots = points.map(({ at, normal }) => ({ at: [...at], normal: [...normal] }));
  window.__skyWallRunRoutes = points.map(({ at, normal, direction, name }) =>
    ({ at: [...at], normal: [...normal], direction: [...direction], name }));

  // A jump marker permits only its wall face, never the whole wall object or
  // another face on the same building. Keep run permission separate from the
  // much smaller take-off area used by matchingPoint below.
  const wallRunFaces = points;
  window.__skyCanWallRunOnFace = (wall, normal) => {
    if (!wall || wall.type !== "mono" || wall.wr === false || wall.off || !normal) return false;
    return wallRunFaces.some(({ at: [x, y, z], normal: [nx, nz] }) => {
      if (normal.x !== nx || normal.z !== nz) return false;
      const plane = nx ? (nx > 0 ? wall.maxX : wall.minX) : (nz > 0 ? wall.maxZ : wall.minZ);
      const along = nx ? z : x;
      return Math.abs(plane - (nx ? x : z)) < .05
        && along > (nx ? wall.minZ : wall.minX) && along < (nx ? wall.maxZ : wall.maxX)
        && y >= wall.minY && y < wall.maxY;
    });
  };

  function matchingPoint(player, getWall, wallNormal) {
    const radius = player.r + 0.55;
    return (window.skySwingCourse ? [window.skySwingCourse.wall] : points).find(({ at, normal }) => {
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
    player.onGround = false;
    player.state = "normal";
    player.jumpBuf = 0;
    player.airT = 0;
    player.wallT = 0;
    window.skyTelemetryProbe?.jumpAccepted(time, "walljump");
    stats.walljumps = (stats.walljumps || 0) + 1;
    audio.jump();
    return true;
  };
})();
