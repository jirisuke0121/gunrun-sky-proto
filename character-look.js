// Character look (2026-11-23): the runner and the zombies are drawn in the town's own style, and no two zombies in
// a pack look the same. Presentation only: positions, speeds, health, hit boxes and scores are untouched.
//
//   1. Painted look. The Unity characters carry detailed photo textures; the town is flat colour with ink lines.
//      The texture is read partly from a coarse mip (small detail melts into colour areas), its saturation comes
//      down a little, the scene's light is allowed to shade the runner (he was fully self-lit), and a rim in the
//      sky's colour lifts the silhouette off the roofs. Fragment shader only: no extra draw calls.
//   2. Ink line around each zombie (inverted hull, one extra draw per zombie). PC only by default: on phones the
//      extra skinned draw is not measured yet, so it stays off there (?charOutline=1 forces it on, =0 off).
//   3. Zombie variety. Each zombie gets one of five shared material variants (skin tone + cloth colour) and its own
//      build (height / width). The evolved Unity look is loaded for every tier, so packs mix the two models.
//      In the trial tier the evolved look still means "brute"; in the ranked tiers it is only a look.
//   4. No two bodies in one spot. Zombies that stand inside each other are drawn a little apart (the drawn body
//      only; the game's own position, pathing and hit box do not move, so ranked behaviour is unchanged).
//   5. The grapple-anchor ring was a pure-metal material with nothing to reflect, so it rendered black ("a tyre").
//      It now reads as dark iron.
//   6. Zombies that look alive: head and neck follow the runner, jaw, each body's own arm carriage, chest roll
//      (?zombieLife=0 off).   7. Soft foot shadows where the device draws no shadows (?footShadow=0|1).
//   The runner's own body feel (stretch, lean, squash, breathing) lives in human-view.js (?bodyFeel=0).
//   8. Zombies wear something: shirts, hair, blood and dirt, two-tone shading, all painted in the shader from the
//      rest pose (?zombieWear=0 off). 9. Twisted strands on the ropes.
//   ?chars=plain   everything above off (comparison).
(() => {
  const query = new URLSearchParams(location.search);
  if (query.get('chars') === 'plain') { window.skyCharacterLook = { enabled: false, reason: 'query' }; return; }
  const sky = window.__skyInternals;
  if (!sky?.ue || !sky.Geom) return;
  const scene = sky.ue, stats = { styled: 0, variants: 0, hulls: 0, dressed: 0, apart: 0 };
  const touch = () => document.documentElement.classList.contains('touch');
  const outlineQuery = query.get('charOutline');
  const outlineOn = () => outlineQuery === '1' || (outlineQuery !== '0' && !touch());

  // ---- 1. painted look -------------------------------------------------------------------------------------
  // 2026-11-24 (zombies only, uLookBody = 1): every zombie was the same bald, bare-chested body in one flat tone.
  // Painted on in the shader, from where a point sits on the body in its rest pose (no textures, no extra draws):
  //   a shirt (none / sleeveless / short / long sleeves, whole or torn), hair or none, blood at the mouth, chest and
  //   hands, dirt on the legs, and two-tone shading from the sun so the body has a lit side and a shadow side.
  // Rest pose of both zombie models (metres): Y up, +Z front, arms out along X; waist .93, collar 1.50, top 1.80,
  // shoulder |x| .18, elbow .38, wrist .60.
  const HEAD = `uniform float uLookFlat;uniform float uLookBias;uniform float uLookSat;uniform vec3 uLookSkin;uniform vec3 uLookCloth;uniform float uLookClothAmt;uniform vec3 uLookRim;uniform float uLookRimPow;
uniform float uLookBody;uniform vec4 uLookShirt;uniform vec2 uLookSleeve;uniform vec4 uLookHair;uniform float uLookBlood;
varying vec3 vLookBind;
float lookNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3. - 2. * f );
  float a = fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ), b = fract( sin( dot( i + vec2( 1., 0. ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  float c = fract( sin( dot( i + vec2( 0., 1. ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 ), d = fract( sin( dot( i + vec2( 1., 1. ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ); }
`;
  const MAP = `#ifdef USE_MAP
  vec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), texture2D( map, vMapUv, uLookBias ), uLookFlat );
  {
    float lookL = dot( sampledDiffuseColor.rgb, vec3( .299, .587, .114 ) );
    float lookCloth = uLookClothAmt * ( 1. - smoothstep( .07, .17, lookL ) );
    sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb * uLookSkin, uLookCloth * ( lookL * 14. ), lookCloth );
    lookL = dot( sampledDiffuseColor.rgb, vec3( .299, .587, .114 ) );
    sampledDiffuseColor.rgb = mix( vec3( lookL ), sampledDiffuseColor.rgb, uLookSat );
    if ( uLookBody > .5 ) {
      vec3 b = vLookBind; float ax = abs( b.x );
      float coarse = lookNoise( b.xy * 13. + b.z * 9. ), fine = lookNoise( b.yx * 41. + b.z * 27. );
      // shirt: waist to collar on the trunk, and out along the arm as far as the sleeve goes; torn shirts have holes
      float torn = uLookSleeve.y, rag = lookNoise( vec2( b.x * 9. + b.z * 5., 2.3 ) );     // rag: one value per strip of cloth, so the hem hangs in tatters
      float hem = .90 + coarse * .05 + torn * ( .03 + .20 * rag );
      float trunk = ( 1. - smoothstep( .195, .215, ax ) ) * smoothstep( hem, hem + .012, b.y );
      float neckline = 1.50 - .055 * ( 1. - smoothstep( 0., .075, ax ) ) * step( 0., b.z );
      trunk *= 1. - smoothstep( neckline - .012, neckline + .012, b.y );
      float cuff = uLookSleeve.x + coarse * .04 - torn * .09 * rag;
      float sleeve = smoothstep( .195, .215, ax ) * ( 1. - smoothstep( cuff - .012, cuff + .012, ax ) ) * step( 1.02, b.y );   // arms only: the feet are also wide of the trunk
      float holes = lookNoise( b.xy * 17. + b.z * 11. + 3.7 );                              // a few small holes, not a missing half
      float shirt = uLookShirt.a * max( trunk, sleeve ) * smoothstep( torn * .24, torn * .24 + .05, holes );
      float fold = lookNoise( vec2( b.x * 24. + b.z * 14., b.y * 5. ) );                   // long folds down the cloth; little of the muscle painted on the skin shows through
      sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, uLookShirt.rgb * ( .74 + fold * .3 ) * ( .8 + lookL * .35 ), shirt );
      sampledDiffuseColor.rgb *= 1. - shirt * ( 1. - shirt ) * 2.2;                         // a dark line where the cloth ends: it has an edge
      // hair: the top of the head, further down at the back, the hairline higher at the front
      float scalp = b.y + max( 0., -b.z ) * .9 - max( 0., b.z ) * .35 + fine * .012 + coarse * .022 - .011;
      float hair = uLookHair.a * smoothstep( 1.688, 1.704, scalp ) * step( ax, .13 );
      sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, uLookHair.rgb * ( .55 + lookL * .9 ), hair );
      // blood: mouth and chin, a run down the chest, the hands; dirt up the shins and on the forearms
      float mouth = smoothstep( .015, .05, b.z ) * ( 1. - smoothstep( .045, .075, ax ) ) * smoothstep( 1.545, 1.57, b.y ) * ( 1. - smoothstep( 1.62, 1.645, b.y ) );
      float chest = step( 0., b.z ) * ( 1. - smoothstep( .03 + coarse * .07, .06 + coarse * .07, ax ) ) * smoothstep( 1.26 + fine * .2, 1.34 + fine * .2, b.y ) * ( 1. - smoothstep( 1.52, 1.56, b.y ) );
      float hands = smoothstep( .575 + fine * .05, .62 + fine * .05, ax );
      float blood = uLookBlood * clamp( mouth + chest * .8 + hands * .85, 0., 1. ) * ( .55 + fine * .45 );
      sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( .30, .035, .03 ) * ( .6 + lookL * .7 ), blood );
      float dirt = ( 1. - smoothstep( .05, .42, b.y ) ) * .38 + smoothstep( .40, .58, ax ) * .10;
      sampledDiffuseColor.rgb *= 1. - dirt * ( .55 + coarse * .45 );
    }
  }
  diffuseColor *= sampledDiffuseColor;
#endif`;
  const EMISSIVE = `#ifdef USE_EMISSIVEMAP
  #ifdef USE_MAP
    totalEmissiveRadiance *= sampledDiffuseColor.rgb;
  #else
    totalEmissiveRadiance *= texture2D( emissiveMap, vEmissiveMapUv ).rgb;
  #endif
#endif`;
  const RIM = `{
    float lookRim = pow( 1. - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0., 1. ), uLookRimPow );
    gl_FragColor.rgb += uLookRim * lookRim;
    #if NUM_DIR_LIGHTS > 0
    if ( uLookBody > .5 ) {      // two tones from the sun: a lit side and a cool shadow side, with a firm edge between
      float lookBand = smoothstep( -.10, .14, dot( normalize( normal ), directionalLights[ 0 ].direction ) );
      gl_FragColor.rgb *= mix( vec3( .68, .65, .78 ), vec3( 1.07, 1.03, .97 ), lookBand );
    }
    #endif
  }
  #include <tonemapping_fragment>`;
  const hooks = new WeakMap(); // material -> the callbacks it had before this file touched it
  function stylize(material, look) {
    if (!material || material.userData.skyLook || !material.isMeshStandardMaterial) return material;
    material.userData.skyLook = 1;
    if (look.body && material.emissiveIntensity > .3) material.emissiveIntensity = .3;   // the evolved model was fully self-lit: no shading at all
    const own = hooks.get(material) || { before: material.onBeforeCompile, key: material.customProgramCacheKey }; hooks.set(material, own);
    const before = own.before, key = own.key;
    material.onBeforeCompile = (shader, renderer) => {
      before?.call(material, shader, renderer);
      if (!shader.fragmentShader.includes('#include <map_fragment>') || !shader.fragmentShader.includes('#include <tonemapping_fragment>')) return;
      Object.assign(shader.uniforms, { uLookFlat: { value: look.flat }, uLookBias: { value: look.bias }, uLookSat: { value: look.sat }, uLookSkin: { value: look.skin },
        uLookCloth: { value: look.cloth }, uLookClothAmt: { value: look.clothAmt }, uLookRim: { value: look.rim }, uLookRimPow: { value: look.rimPow },
        uLookBody: { value: look.body ? 1 : 0 }, uLookShirt: { value: look.shirt || [0, 0, 0, 0] }, uLookSleeve: { value: [look.sleeve ?? .2, look.torn ?? 0] }, uLookHair: { value: look.hair || [0, 0, 0, 0] }, uLookBlood: { value: look.blood ?? 0 } });
      shader.vertexShader = 'varying vec3 vLookBind;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLookBind = position;');
      shader.fragmentShader = HEAD + shader.fragmentShader.replace('#include <map_fragment>', MAP).replace('#include <emissivemap_fragment>', EMISSIVE).replace('#include <tonemapping_fragment>', RIM);
    };
    material.customProgramCacheKey = () => (key ? key.call(material) : '') + '|sky-character-look-3';
    material.needsUpdate = true; stats.styled++;
    return material;
  }
  const RIM_COLOUR = [.11, .08, .1];
  // `?zombieWear=0`: no shirts, hair, blood or two-tone shading (the 11/23 look), for comparison or if a device struggles.
  const ZOMBIE_LOOK = { flat: .42, bias: 3.5, sat: .8, skin: [1, 1, 1], cloth: [0, 0, 0], clothAmt: 0, rim: RIM_COLOUR, rimPow: 2.6, body: query.get('zombieWear') !== '0', blood: .55 };
  const HUMAN_LOOK = { flat: .5, bias: 4, sat: .9, skin: [1, 1, 1], cloth: [0, 0, 0], clothAmt: 0, rim: [.1, .075, .09], rimPow: 3 };
  // Skin tone (multiplied) and cloth colour (replaces the dark trousers) per variant. Variant 0 keeps the original.
  // skin = tone (multiplied), cloth = trousers (replaces the dark cloth of the texture), shirt = [r, g, b, 1] or none,
  // sleeve = how far out along the arm it reaches (.2 none, .38 elbow, .6 wrist), torn 0..1, hair = [r, g, b, 1] or none.
  const VARIANTS = [
    { skin: [1, 1, 1], cloth: [0, 0, 0], clothAmt: 0, blood: .9 },                                                                    // the original: bare chest, bald
    { skin: [.8, .95, .78], cloth: [.045, .06, .12], clothAmt: 1, shirt: [.17, .22, .30, 1], sleeve: .37, torn: .25, hair: [.06, .05, .05, 1], blood: .5 },   // grey-blue tee
    { skin: [.88, .78, .7], cloth: [.085, .1, .055], clothAmt: 1, shirt: [.20, .21, .12, 1], sleeve: .215, torn: .1, blood: .7 },                               // olive vest, bald
    { skin: [.74, .82, .96], cloth: [.06, .06, .07], clothAmt: 1, shirt: [.40, .37, .31, 1], sleeve: .60, torn: .6, hair: [.42, .40, .38, 1], blood: .7 },     // torn linen long sleeves, grey hair
    { skin: [1, .95, .8], cloth: [.15, .035, .05], clothAmt: 1, hair: [.07, .05, .04, 1], blood: .8 },                                                         // bare chest, dark hair
    { skin: [.92, .9, .84], cloth: [.11, .08, .06], clothAmt: 1, shirt: [.17, .115, .08, 1], sleeve: .36, torn: 1, blood: 1 },                                 // brown wool in rags, bald
    { skin: [.82, .84, .9], cloth: [.045, .06, .12], clothAmt: 1, shirt: [.075, .075, .09, 1], sleeve: .60, torn: .15, hair: [.05, .04, .04, 1], blood: .4 },   // dark long sleeves
    { skin: [.86, .92, .84], cloth: [0, 0, 0], clothAmt: 0, shirt: [.15, .21, .21, 1], sleeve: .38, torn: .4, hair: [.36, .35, .34, 1], blood: .6 },            // teal tee, grey hair
  ];
  const variantCache = new Map(); // source material -> [materials]
  function variantOf(source, index) {
    let list = variantCache.get(source);
    if (!list) variantCache.set(source, list = [source]);
    if (!list[index]) { const copy = source.clone(), own = hooks.get(source); copy.userData = { ...copy.userData, skyLook: 0, skyLookVariant: index }; if (own) { copy.onBeforeCompile = own.before; copy.customProgramCacheKey = own.key; hooks.set(copy, own); } stylize(copy, { ...ZOMBIE_LOOK, ...VARIANTS[index] }); list[index] = copy; stats.variants++; }
    return list[index];
  }

  // ---- 2. ink hull for skinned characters ------------------------------------------------------------------
  const inkSize = { value: [0, 0] };
  let inkMaterial = null;
  function ink() {
    if (inkMaterial) return inkMaterial;
    inkMaterial = new sky.Geom.Basic({ color: 0x2b2220, side: 1 });
    inkMaterial.onBeforeCompile = shader => {
      shader.uniforms.uInk = inkSize;
      shader.vertexShader = 'uniform vec2 uInk;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_SKINNING
    vec3 inkN = transformedNormal;
    #ifdef FLIP_SIDED
      inkN = - inkN; // the back-side material flips it; the hull has to grow outwards
    #endif
  #else
    vec3 inkN = normalMatrix * normal;
  #endif
  gl_Position.xy += normalize( inkN.xy + vec2( 1e-5 ) ) * uInk * gl_Position.w;`);
    };
    inkMaterial.customProgramCacheKey = () => 'sky-character-ink-1';
    inkMaterial.fog = true;
    return inkMaterial;
  }
  // One hull per body, added when the body is first drawn (not to the source model: the game clones that for every
  // new zombie, and extra objects there would shift the game's own random-number order).
  function addHull(root) {
    const meshes = []; root.traverse(node => { if (node.isSkinnedMesh && !node.userData.skyInkHull) meshes.push(node); });
    for (const mesh of meshes) {
      const hull = new mesh.constructor(mesh.geometry, ink());
      hull.name = 'Character ink hull'; hull.userData.skyInkHull = true; hull.frustumCulled = false; hull.receiveShadow = false;
      // The game walks every skinned mesh of a body to switch shadows and tints; the hull keeps its own.
      const own = ink(); Object.defineProperty(hull, 'castShadow', { get: () => false, set() {} }); Object.defineProperty(hull, 'material', { get: () => own, set() {} });
      hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale);
      mesh.parent.add(hull); hull.bind(mesh.skeleton, mesh.bindMatrix); stats.hulls++;
    }
  }

  // ---- 3 + 4. per-zombie dress and drawn separation ---------------------------------------------------------
  let seed = 0x2545f491;
  const roll = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 10000) / 10000; }; // own sequence: the game's Math.random order is not disturbed
  const offsets = new WeakMap();
  function dress(zombie) {
    const body = zombie.m; body.skyLook = true; stats.dressed++;
    // The variant the living pack has least of (ties by chance), so a pack never comes out all alike.
    const used = VARIANTS.map(() => 0); for (const other of sky.Jt) if (!other.dead && other !== zombie && other.m?.skyVariant !== undefined) used[other.m.skyVariant]++;
    const least = Math.min(...used), free = used.map((count, k) => count === least ? k : -1).filter(k => k >= 0);
    const index = free[Math.floor(roll() * free.length)], tall = .95 + roll() * .1, wide = .93 + roll() * .16;
    const plainKind = zombie.kind && zombie.kind !== 'walker';
    body.skyVariant = index; body.skyMeshes = []; body.skyOwnLook = plainKind ? ZOMBIE_LOOK : { ...ZOMBIE_LOOK, ...VARIANTS[index] };
    body.inner.scale.set(body.inner.scale.x * wide, body.inner.scale.y * tall, body.inner.scale.z * wide);
    body.root.traverse(node => {
      if (!node.isSkinnedMesh) return;
      if (node.userData.skyInkHull) { node.visible = outlineOn(); return; }
      if (plainKind) { stylize(node.material, ZOMBIE_LOOK); body.skyMeshes.push(node); return; } // the trial tier's own tints keep their meaning
      const base = variantCache.has(node.material) ? node.material : (stylize(node.material, ZOMBIE_LOOK), node.material);
      node.material = variantOf(base, index); body.skyMeshes.push(node);
    });
    if (outlineOn()) addHull(body.root);
  }
  const SPACE = .62;
  function separate(list) {
    for (const zombie of list) { const o = offsets.get(zombie) || { x: 0, z: 0, tx: 0, tz: 0, ax: 0, az: 0, px: NaN, pz: NaN }; o.tx = o.tz = 0; offsets.set(zombie, o); }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; if (Math.abs(a.pos.y - b.pos.y) > 1.2) continue;
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz); if (d >= SPACE) continue;
      if (d < .02) { const angle = i * 2.4 + j * 1.3; dx = Math.cos(angle); dz = Math.sin(angle); d = 0; } else { dx /= d; dz /= d; }
      const push = Math.min(.3, (SPACE - d) / 2), oa = offsets.get(a), ob = offsets.get(b);
      oa.tx -= dx * push; oa.tz -= dz * push; ob.tx += dx * push; ob.tz += dz * push; stats.apart++;
    }
    for (const zombie of list) { const o = offsets.get(zombie); o.x += (o.tx - o.x) * .2; o.z += (o.tz - o.z) * .2; const at = zombie.m.root.position;
      // The game sets the position every step; when it did not (paused, hit-stop), take the last offset back first.
      if (at.x === o.px && at.z === o.pz) { at.x -= o.ax; at.z -= o.az; }
      at.x += o.x; at.z += o.z; o.ax = o.x; o.az = o.z; o.px = at.x; o.pz = at.z; }
  }

  // ---- 6. zombies that look alive (2026-11-24) -----------------------------------------------------------------
  // Every zombie played the same clip the same way: arms out level, head locked forward, mouth shut. On top of the
  // clip (bones, after the animation, before the draw): the head and neck follow the runner, with a twitch now and
  // then; the jaw hangs open and snaps when close; each body carries its arms its own way (one low, one reaching)
  // and reaches further when close; the chest rolls with the steps. Drawn only. `?zombieLife=0` turns it off.
  const lifeOn = query.get('zombieLife') !== '0';
  const Vec = sky.Geom.Vector3, Quat = scene.quaternion.constructor;
  const UP = new Vec(0, 1, 0), rightAxis = new Vec(), frontAxis = new Vec(), headAt = new Vec(), parentTurn = new Quat(), worldTurn = new Quat(), localTurn = new Quat();
  const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle)), clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const BONES = { head: /HumanHead$/, neck: /HumanNeck$/, jaw: /HeadJaw$/, chest: /HumanRibcage$/, lArm: /LArmUpperarm$/, rArm: /RArmUpperarm$/, lFore: /LArmForearm$/, rFore: /RArmForearm$/ };
  function bonesOf(body) {
    if (body.skyBones) return body.skyBones;
    const found = {}; body.root.traverse(node => { if (node.isBone) for (const key in BONES) if (BONES[key].test(node.name)) found[key] = node; });
    return body.skyBones = found;
  }
  // The animation writes each bone every game step. When it did not (pause, hit-stop, a second draw of the same
  // step) the bone still holds what was written here last time: start again from the animation's own value.
  function fresh(bone) {
    const data = bone.userData;
    if (!data.skyOut) { data.skyOut = bone.quaternion.clone(); data.skyBase = bone.quaternion.clone(); }
    else if (bone.quaternion.equals(data.skyOut)) bone.quaternion.copy(data.skyBase); else data.skyBase.copy(bone.quaternion);
  }
  // Turn a bone about an axis given in world space (the rig's own bone axes differ from bone to bone).
  function turn(bone, axis, angle) {
    if (!bone || Math.abs(angle) < .0005) return;
    bone.parent.getWorldQuaternion(parentTurn); worldTurn.setFromAxisAngle(axis, angle);
    localTurn.copy(parentTurn).invert().multiply(worldTurn).multiply(parentTurn); bone.quaternion.premultiply(localTurn);
  }
  function enliven(zombie, dt, time) {
    const body = zombie.m, bones = bonesOf(body); if (!bones.head) return;
    const life = body.skyLife || (body.skyLife = { yaw: 0, pitch: 0, twitch: 0, twitchNow: 0, twitchIn: roll() * 2, tilt: (roll() - .5) * .36, jaw: .12 + roll() * .3, jawRate: 5 + roll() * 6,
      armL: -.6 + roll() * .7, armR: -.6 + roll() * .7, reachL: .1 + roll() * .55, reachR: .1 + roll() * .55, foreL: roll() * .4, foreR: roll() * .4, sway: .05 + roll() * .07, swayRate: 6 + roll() * 3, phase: roll() * 6.28 });
    for (const key in bones) fresh(bones[key]);
    const yaw = zombie.yaw || 0; frontAxis.set(-Math.sin(yaw), 0, -Math.cos(yaw)); rightAxis.set(Math.cos(yaw), 0, -Math.sin(yaw));
    bones.head.getWorldPosition(headAt);
    const c = sky.c, dx = c.pos.x - headAt.x, dy = c.pos.y + 1.45 - headAt.y, dz = c.pos.z - headAt.z, flat = Math.hypot(dx, dz), near = clamp(1 - flat / 4.5, 0, 1);
    const wantYaw = flat > .25 ? clamp(wrap(Math.atan2(-dx, -dz) - yaw), -1.2, 1.2) : 0, wantPitch = clamp(Math.atan2(dy, flat + .3), -.55, .7);
    const ease = 1 - Math.exp(-dt * 7); life.yaw += (wantYaw - life.yaw) * ease; life.pitch += (wantPitch - life.pitch) * ease;
    life.twitchIn -= dt; if (life.twitchIn < 0) { life.twitch = (roll() - .5) * .7; life.twitchIn = .5 + roll() * 2.4; }
    life.twitchNow += (life.twitch - life.twitchNow) * (1 - Math.exp(-dt * 22)); life.twitch *= Math.exp(-dt * 5);
    turn(bones.chest, UP, life.yaw * .16); turn(bones.chest, frontAxis, life.sway * Math.sin(time * life.swayRate + life.phase));
    turn(bones.neck, UP, life.yaw * .32); turn(bones.neck, rightAxis, life.pitch * .4);
    turn(bones.head, UP, life.yaw * .5 + life.twitchNow * .5); turn(bones.head, rightAxis, life.pitch * .6); turn(bones.head, frontAxis, life.tilt + life.twitchNow * .4);
    turn(bones.jaw, rightAxis, -(life.jaw + near * .3 + (.06 + near * .14) * Math.sin(time * life.jawRate + life.phase)));
    if (!zombie.act && !zombie.crawl) {     // not while it climbs, jumps or crawls: those clips place the arms themselves
      // The clip holds both arms out to the sides. Bring each one forward by its own amount (more when close), and
      // carry it lower or higher; close to the runner both come up to chest height.
      turn(bones.lArm, UP, -(life.reachL + near * .45)); turn(bones.rArm, UP, life.reachR + near * .45);
      turn(bones.lArm, rightAxis, life.armL + near * (.12 - life.armL * .7)); turn(bones.rArm, rightAxis, life.armR + near * (.12 - life.armR * .7));
      turn(bones.lFore, rightAxis, life.foreL * (1 - near * .6)); turn(bones.rFore, rightAxis, life.foreR * (1 - near * .6));
    }
    for (const key in bones) bones[key].userData.skyOut.copy(bones[key].quaternion);
    stats.alive = (stats.alive || 0) + 1;
  }

  // ---- 7. a soft shadow under each body when the device draws no shadows (phones by default) -------------------
  // Without one the runner and the zombies float over the roofs. One quad per body in a single draw call; the ground
  // height comes from the game's own ray test, three bodies per frame. `?footShadow=0` off, `=1` forces it on.
  const footMode = query.get('footShadow');
  const FEET = 10, foot = { mesh: null, at: new Float32Array(FEET * 12), ground: new Float32Array(FEET).fill(NaN), turn: 0, needed: false, checked: -999 };
  function footShadows(renderer, bodies) {
    if (footMode === '0') return;
    if (frame - foot.checked > 90) {       // do the lights cast shadows on this device?
      foot.checked = frame; let cast = false; if (renderer.shadowMap?.enabled) scene.traverse(node => { if (node.isLight && node.castShadow) cast = true; });
      foot.needed = footMode === '1' || !cast;
    }
    if (!foot.needed) { if (foot.mesh) foot.mesh.visible = false; return; }
    if (!foot.mesh) {
      const G = sky.Geom, canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const ctx = canvas.getContext('2d');
      const fade = ctx.createRadialGradient(32, 32, 2, 32, 32, 31); fade.addColorStop(0, 'rgba(20,16,22,.5)'); fade.addColorStop(.55, 'rgba(20,16,22,.3)'); fade.addColorStop(1, 'rgba(20,16,22,0)');
      ctx.fillStyle = fade; ctx.fillRect(0, 0, 64, 64);
      const shape = new G.BufferGeometry(), uv = new Float32Array(FEET * 8), index = [];
      for (let k = 0; k < FEET; k++) { uv.set([0, 0, 1, 0, 1, 1, 0, 1], k * 8); index.push(k * 4, k * 4 + 2, k * 4 + 1, k * 4, k * 4 + 3, k * 4 + 2); }
      shape.setAttribute('position', new G.Float32Attribute(foot.at, 3)); shape.setAttribute('uv', new G.Float32Attribute(uv, 2)); shape.setIndex(index);
      foot.mesh = new G.Mesh(shape, new G.Basic({ map: new G.CanvasTexture(canvas), transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      foot.mesh.name = 'Foot shadows'; foot.mesh.frustumCulled = false; foot.mesh.renderOrder = 1; scene.add(foot.mesh);
    }
    foot.mesh.visible = true; foot.turn = (foot.turn + 1) % 3;
    for (let k = 0; k < FEET; k++) {
      const pos = bodies[k], o = k * 12;
      if (!pos) { foot.at.fill(0, o, o + 12); foot.ground[k] = NaN; continue; }
      if (k % 3 === foot.turn || Number.isNaN(foot.ground[k])) { const hit = sky.raycast(pos.x, pos.y + .6, pos.z, 0, -1, 0, 7); foot.ground[k] = hit ? pos.y + .6 - hit.t : -9999; }
      const y = foot.ground[k], up = pos.y - y; if (y < -9000 || up > 6) { foot.at.fill(0, o, o + 12); continue; }
      const r = .46 * Math.max(.35, 1 - Math.max(0, up) / 7), yy = y + .035;
      foot.at.set([pos.x - r, yy, pos.z - r, pos.x + r, yy, pos.z - r, pos.x + r, yy, pos.z + r, pos.x - r, yy, pos.z + r], o);
    }
    foot.mesh.geometry.attributes.position.needsUpdate = true;
  }

  // ---- 8. ropes that read as rope (2026-11-24) -----------------------------------------------------------------
  // The swing ropes were plain cream square bars and the hook's rope a plain brown tube. One small twisted-strand
  // texture (16 x 16, drawn here) is laid along them; the material's own colour still tints it.
  let ropeSource = null;
  function ropeMap(turns) {
    if (!ropeSource) { ropeSource = document.createElement('canvas'); ropeSource.width = ropeSource.height = 16; const ctx = ropeSource.getContext('2d');
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, 16, 16); ctx.strokeStyle = '#7d7d7d'; ctx.lineWidth = 2.2;
      for (let k = -2; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-2, k * 8 + 10); ctx.lineTo(18, k * 8 - 2); ctx.stroke(); } }
    const map = new sky.Geom.CanvasTexture(ropeSource); map.wrapS = map.wrapT = 1000; map.colorSpace = 'srgb'; map.repeat.set(1, turns); map.needsUpdate = true; return map;
  }
  window.skyRopeMap = ropeMap;
  let ropesDone = false;
  function dressRopes() {
    for (const name of ['Rope swing', 'Rope stations']) scene.getObjectByName(name)?.traverse(mesh => {
      const size = mesh.geometry?.parameters; if (!mesh.isMesh || mesh.userData.skyRope || !size || size.width !== .05 || size.depth !== .05 || size.height !== 1) return;
      mesh.userData.skyRope = true; const material = mesh.material.clone(); material.map = ropeMap(Math.max(4, Math.round(mesh.scale.y * 7))); material.needsUpdate = true; mesh.material = material;
      mesh.scale.x = mesh.scale.z = 1.3; ropesDone = true;     // 5 cm -> 6.5 cm: it was hard to see against the sky
    });
  }

  // ---- per frame, just before the scene is drawn ------------------------------------------------------------
  let humanDone = false, anchorsDone = false, evolvedAsked = false, frame = 0, lastDraw = 0, runner = null;
  const playerShown = () => { if (!runner?.parent) runner = scene.getObjectByName('Unity challenge human') || null; return !!runner?.visible; };
  const hookBefore = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, s, camera, target) {
    hookBefore?.call(this, renderer, s, camera, target);
    if (camera !== sky.Se) return;
    // Nothing here may draw from the game's Math.random (three.js takes four numbers for every new object's id).
    const gameRandom = Math.random; Math.random = roll;
    try { beforeDraw(renderer); } finally { Math.random = gameRandom; }
  };
  function beforeDraw(renderer) {
    frame++;
    const size = renderer.getDrawingBufferSize(inkScratch), ratio = renderer.getPixelRatio();
    inkSize.value[0] = 3.2 * ratio / Math.max(1, size.x); inkSize.value[1] = 3.2 * ratio / Math.max(1, size.y);
    for (const model of sky.zombieModels?.() || []) {
      if (model.skyLook) continue; model.skyLook = true;
      model.scene.traverse(node => { if (node.isSkinnedMesh && node.material?.map) stylize(node.material, ZOMBIE_LOOK); });
    }
    if (!evolvedAsked && frame > 30) { evolvedAsked = true; try { window.__skyWantEvolved = true; window.__skyLoadEvolved?.(); } catch {} }
    if (!humanDone || frame % 240 === 0) {
      scene.traverse(node => {
        if (node.name !== 'Unity challenge human') return;
        node.traverse(mesh => { if (mesh.isMesh && mesh.material?.map && !mesh.material.userData.skyLook) { stylize(mesh.material, HUMAN_LOOK); if (mesh.material.emissiveIntensity > .6) mesh.material.emissiveIntensity = .6; humanDone = true; } });
      });
    }
    if (!ropesDone || frame % 240 === 0) dressRopes();
    if (!anchorsDone || frame % 240 === 0) {
      scene.traverse(node => { if (node.name === 'Meshy grapple anchor mobile LOD') node.traverse(mesh => { const m = mesh.material; if (mesh.isMesh && m && !m.userData.skyIron) { m.userData.skyIron = true; m.metalness = .3; m.roughness = .62; m.color?.setRGB(.62, .58, .56); m.emissive?.setRGB(.2, .175, .165); m.emissiveMap = null; m.needsUpdate = true; anchorsDone = true; } }); });
    }
    const live = [];
    for (const zombie of sky.Jt) {
      const body = zombie.m; if (!body?.meshy || !body.root) continue;
      if (!body.skyLook) dress(zombie);
      // A body is reused after its zombie dies, and the game puts the model's own material back: give it its look again.
      // On the first bullet hit the game gives the zombie its own copies of the materials (so only that body flashes);
      // a copy does not carry the shader patch, so the body would fall back to the raw texture. Give the copy its look.
      else for (const mesh of body.skyMeshes) { const material = mesh.material; if (material && !hooks.has(material) && material.isMeshStandardMaterial) { material.userData.skyLook = 0; stylize(material, body.skyOwnLook); } }
      // Looping walk and run cycles start at a different point for each body, so a pack does not step in unison (drawn only).
      const action = body.curA; if (action && action !== body.skyPhased) { body.skyPhased = action; const length = action.getClip?.().duration; if (action.loop === 2201 && length > .2) action.time = (action.time + roll() * length) % length; }
      if (!zombie.dead && body.root.visible && !zombie.rise && !zombie.fall) live.push(zombie);
    }
    if (live.length > 1) separate(live);
    const now = performance.now(), dt = Math.min(.05, Math.max(0, (now - lastDraw) / 1000)); lastDraw = now;
    const cam = sky.Se.position, bodies = [sky.modeRef?.() === 'play' && playerShown() ? sky.c.pos : null];
    for (const zombie of live) {
      const near = (zombie.pos.x - cam.x) ** 2 + (zombie.pos.z - cam.z) ** 2 < 900;
      if (lifeOn && near) enliven(zombie, dt, now / 1000);
      // The renderer has already worked out this frame's matrices: bring the moved root and bones up to date,
      // or the drawn-apart offset and the bone turns would only show one frame late (and never, in normal play).
      zombie.m.root.updateMatrixWorld(true);
      if (bodies.length < FEET) bodies.push(zombie.pos);
    }
    footShadows(renderer, bodies);
  };
  const inkScratch = new sky.Geom.Vector3(); // stands in for the Vector2 the renderer fills (x, y only)
  window.skyCharacterLook = { enabled: true, stats, outline: outlineOn, variants: VARIANTS.length, styled: material => hooks.has(material) };
})();
