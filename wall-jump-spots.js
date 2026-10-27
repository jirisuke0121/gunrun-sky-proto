(() => {
  const points = [
    { at: [14, 2.84, 9.82], normal: [1, 0] },
    { at: [14, 2.28, -10.42], normal: [1, 0] },
    { at: [-14, 3.22, -8.1], normal: [-1, 0] },
    { at: [-14, 2.69, 11.51], normal: [-1, 0] },
  ];

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
