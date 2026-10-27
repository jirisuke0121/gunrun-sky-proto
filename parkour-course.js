// Built before the spatial index and navigation graph, so the ordinary collision,
// camera and zombie routes all see the same geometry. Engine XYZ, metres.
window.buildSwingCourse = function ({ ne }) {
  const box = (id, a, b, type = 'beam') => {
    const solid = ne(...a, ...b, type);
    solid.swingCourse = id; solid.canyonTier = 'U';
    return solid;
  };
  // Branch off the west middle ring; keep its inner 2 m lane open.
  const wall = box('kick-wall', [-21.6, 4, -7.6], [-20.75, 8.6, -4.4], 'mono');
  wall.wr = true;
  box('launch-pad', [-17.5, 4, -7.3], [-15.2, 5.2, -4.7]);
  // A slower north-side step lets zombies reach the launch pad as well. The
  // wall kick is the fast entrance, rather than a permanently safe island.
  box('pad-return-step-1', [-19.5, 4, -9.4], [-18.5, 4.3, -7.3]);
  box('pad-return-step-2', [-18.5, 4, -9.4], [-17.5, 4.6, -7.3]);
  box('pad-return-step-3', [-17.5, 4, -9.4], [-15.8, 4.9, -7.3]);
  const bars = [
    { id: 'west-bar-1', at: [-12.5, 8.2, -6], direction: [1, 0], width: 2.6 },
    { id: 'west-bar-2', at: [-6.6, 9.6, -6], direction: [1, 0], width: 2.6 },
  ];
  // Uprights flank the flight lane; the graspable crosspiece is a visual tube,
  // not a full collision box that would stop the player's head on approach.
  for (const b of bars) for (const side of [-1, 1])
    box(b.id + '-post', [b.at[0] - .07, 0, b.at[2] + side * 1.45 - .07],
      [b.at[0] + .07, b.at[1] + .06, b.at[2] + side * 1.45 + .07]);
  // The destination is the existing upper spine, accessible to pursuing zombies
  // via its three ladders. Falling lands on the existing ground loop.
  // Extra run-out absorbs the momentum-dependent landing positions. Floor
  // chevrons lead back into the spine, then north/south along the upper loop.
  box('upper-landing', [-2.4, 7.62, -8.2], [7.2, 8, -3.8]);
  window.skySwingCourse = { id: 'west-ascent', wall: { at: [-20.75, 5.3, -6], normal: [1, 0] },
    approach: [-20.3, 4, -8.8], pad: [-16.5, 5.2, -6], bars, exit: [0, 8, -6],
    entryMarkers: [[-19.8,4.025,-11,1],[-19.8,4.025,-9.7,1],[-19.8,4.025,-2,-1],[-19.8,4.025,-.7,-1]],
    exitBounds: [-2.4,7.2,-8.2,-3.8] };
};
