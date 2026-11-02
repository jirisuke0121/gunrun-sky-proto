// One contract for the classic browser entrypoint, recorder and Worker.
// View, input, audio and graphics preferences are deliberately outside it.
(function (root) {
  const version = 'corridor-time-score-v11';
  const settings = Object.freeze({
    walkSpeed: 4.6, groundAccel: 140, groundBrake: 120, sprintSpeed: 6,
    jumpVel: 7.2, gravity: 20, airAccel: 14, slideBoost: 9.5, slideFriction: 5,
    wallRunTime: 1.6, wallRunSpeed: 9.3, wallRunGravity: .22, wallJumpPush: 7,
    mantleReach: 2, edgeCatch: .45, edgeCatchCD: 0, edgeSafeR: 6, vaultTime: .26,
    coyote: .15, jumpBuffer: .15, momentumDecay: 2.5, ladderSpeed: 4.2,
    zipSpeed: 14, hookRange: 22, hookSpeed: 18, hookCooldown: 5,
    jumpGunUp: 20, jumpGunPush: 10, gunOn: true, reserveAmmo: 24, gunKnock: 6.5,
    kickReach: 1.8, kickUp: 7.5, kickBack: .6, kickPush: 9, kickStun: 1.2,
    kickChain: .85, knifeReach: 2.2, knifeKnock: 7.5, knifeStun: .7,
    knifeDmg: 1.4, stompUp: 9.5, slideCool: 2,
  });
  const entries = Object.entries(settings);
  function eligible(record) {
    if (!['easy', 'normal', 'hard'].includes(record.challenge?.id)) return false;
    const fixed = record.challenge?.fixedSettings;
    return fixed && entries.every(([key, value]) => fixed[key] === value &&
      (!Object.hasOwn(record.settings || {}, key) || record.settings[key] === value));
  }
  const rules = Object.freeze({ version, settings, eligible });
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.skyRankedRules = rules;
})(globalThis);
