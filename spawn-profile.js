// Where pursuers appear, per difficulty.
// easy / normal / hard keep exactly the placement they had (first acceptable site wins), so the ranked tiers
// and their record version are untouched. Only tiers listed with `tight` change how a site is chosen.
//
// 'tight' (trial tier): the squeeze planner and the ambush look at several acceptable sites and take the one that
// leaves the shortest escape margin, instead of the first one found. The site is still only accepted when the
// player's best escape keeps at least the tier's own `lead` seconds (same forecast as before, `escapeLead`),
// so it takes the one route that is left - a hook, a ladder, a leap - instead of any open direction.
(function (root) {
  const table = Object.freeze({
    easy: null,
    normal: null,
    hard: null,
    // ahead: share of ambushes placed in front (65% before); samples: extra ambush sites compared.
    extreme: Object.freeze({ tight: true, ahead: .8, samples: 4 }),
  });
  const forProfile = profile => (profile && table[profile.id]) || null;
  // Shortest escape margin that still meets the minimum. pool items: { lead, ... } in the order they were found.
  function tightest(pool) {
    let best = null;
    for (const item of pool) if (!best || item.lead < best.lead) best = item;
    return best;
  }
  // Same rule for single sites: keep the candidate with the smallest margin that still meets the minimum.
  function better(current, candidate, minimum) {
    if (!Number.isFinite(candidate) || candidate < minimum) return false;
    return !Number.isFinite(current) || current < minimum || candidate < current;
  }
  const api = { table, forProfile, tightest, better };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skySpawnProfile = api;
})(globalThis);
