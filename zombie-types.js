// Zombie kinds for the trial tier above Hard (challenge-difficulty.js: `types: true`). Ranked tiers never use this.
//
//   walker 歩行  : the ordinary zombie of that tier.
//   runner 俊足  : faster, half the health, a little smaller, pale tint. Closes on flat ground; easy to shoot off.
//   brute  重装  : twice the health, slower, bigger, shrugs off half of every shove. Uses the Unity "evolved" look
//                  (assets/zombie-gunrun-evolved.glb, already shipped; same mesh and animations as the standard one).
//
// Nothing here adds bodies: the tier keeps Hard's eight-body budget. The evolved look is one more texture; tints
// share one cloned material per kind (not one per zombie).
export function createZombieTypes(game, runtime) {
  const KINDS = Object.freeze({
    walker: Object.freeze({ label: '歩行' }),
    runner: Object.freeze({ label: '俊足', share: .25, speed: 1.1, health: .5, scale: .92, tint: [1.12, 1.08, .78], glow: [.10, .09, .02] }),
    brute: Object.freeze({ label: '重装', share: .2, speed: .88, health: 2, scale: 1.16, shove: .5, radius: .34, model: 'unity-evolved' }),
  });
  const stats = { walker: 0, runner: 0, brute: 0, evolvedReady: false };
  const materials = new Map(); // kind -> Map(source material -> tinted clone)
  let lastT = 0;

  const profile = () => window.skyChallenge?.profile?.();
  const enabled = () => !!profile()?.types && !game.z.mission && !window.skyPracticeMode;
  const evolvedLoaded = () => (game.zombieModels?.() || []).some(m => m.kind === 'unity-evolved');

  // Asked by the model builder for every new body: which look should it get? null keeps the page's own choice.
  function modelChoice() {
    if (!enabled()) return null;
    return evolvedLoaded() && Math.random() < KINDS.brute.share ? 'unity-evolved' : 'unity-standard';
  }
  // The trial tier is selected on the home screen: fetch the evolved look then, not during a run.
  function prepare() {
    if (!profile()?.types) return;
    window.__skyWantEvolved = true;
    try { window.__skyLoadEvolved?.(); } catch {}
  }
  // Upload the evolved textures while idle so the first brute does not hitch the frame it appears in.
  function warmTextures() {
    if (stats.evolvedReady) return;
    const model = (game.zombieModels?.() || []).find(m => m.kind === 'unity-evolved');
    const renderer = runtime.debug?.renderer;
    if (!model || !renderer?.initTexture) return;
    model.scene.traverse(node => {
      for (const material of [].concat(node.material || [])) for (const key of ['map', 'emissiveMap']) {
        if (material?.[key]) try { renderer.initTexture(material[key]); } catch {}
      }
    });
    stats.evolvedReady = true;
  }

  function tinted(kind, source) {
    let byKind = materials.get(kind);
    if (!byKind) materials.set(kind, byKind = new Map());
    let copy = byKind.get(source);
    if (!copy) {
      const spec = KINDS[kind];
      copy = source.clone();
      if (copy.color) { copy.color.r = Math.min(1, copy.color.r * spec.tint[0]); copy.color.g = Math.min(1, copy.color.g * spec.tint[1]); copy.color.b *= spec.tint[2]; }
      if (!copy.emissiveMap && copy.emissive?.setRGB) copy.emissive.setRGB(...spec.glow);
      copy.userData = { ...copy.userData, zombieKind: kind };
      byKind.set(source, copy);
    }
    return copy;
  }
  function dress(zombie, kind) {
    const spec = KINDS[kind];
    zombie.kind = kind;
    stats[kind]++;
    if (kind === 'walker') return;
    zombie.typeSpeed = spec.speed;
    zombie.hp = Math.max(1, zombie.hp * spec.health); zombie.maxHp = zombie.hp;
    if (spec.radius) zombie.r = spec.radius;
    zombie.m.root.scale.multiplyScalar(spec.scale);
    if (spec.tint) zombie.m.root.traverse(node => {
      if (!node.isMesh || !node.material) return;
      node.material = Array.isArray(node.material) ? node.material.map(m => tinted(kind, m)) : tinted(kind, node.material);
    });
    if (spec.shove) {
      const hurt = zombie.hurt;
      zombie.hurt = function (amount, dx, dz, stun, push) { return hurt.call(this, amount, dx, dz, stun, push * spec.shove); };
    }
  }
  function assign(zombie) {
    if (zombie.m?.src?.kind === KINDS.brute.model) return dress(zombie, 'brute');
    // The brute share was already rolled by modelChoice; the rest splits between runner and walker.
    const runner = KINDS.runner.share / (1 - (evolvedLoaded() ? KINDS.brute.share : 0));
    dress(zombie, Math.random() < runner ? 'runner' : 'walker');
  }

  // Once per game step: give every new ordinary zombie its kind before it has risen.
  function tick() {
    if (!enabled()) return;
    if (game.z.t < lastT) { stats.walker = stats.runner = stats.brute = 0; }
    lastT = game.z.t;
    warmTextures();
    for (const zombie of game.Jt) {
      if (zombie.kind || zombie.dead || zombie.stalker || zombie.boss || zombie.born === 'boss') continue;
      assign(zombie);
    }
  }
  const speed = (zombie, value) => zombie.typeSpeed ? value * zombie.typeSpeed : value;

  if (typeof document !== 'undefined') {
    document.addEventListener('sky-difficulty-change', prepare);
    setTimeout(prepare, 0);
  }
  return { KINDS, stats, tick, speed, modelChoice, prepare, enabled };
}
