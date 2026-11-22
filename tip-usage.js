// Which moves has this player ever used in a finished real run? Stored only on this device (nothing is uploaded).
// Feeds the コツ list (orange dot = not used yet) and the one-time tip cards on the 2nd game-over screen.
// Counting rules: a run counts when its result screen is shown for a real 旧市街 run (not 入門, practice, replay, debug, 渓谷).
(() => {
  const KEY = 'gunrun-tip-usage-v1';
  const ORDER = ['wallrun', 'items', 'rope', 'zip', 'blast', 'jumpgun', 'bar'];
  // Per-run stat counters (game stats) that mean "the player did this move".
  const SOURCES = { wallrun: ['wallruns'], rope: ['ropeSwings'], zip: ['zips'], blast: ['blastLaunches'], jumpgun: ['jumpGunLaunches'], bar: ['barDropCatches'], items: ['decoys', 'rescues', 'flashbangs'] };
  const MAX_SHOWN = 2, SHOW_AFTER_RUNS = 2;

  function createTipUsage(storage, order = ORDER) {
    const read = () => { try { const v = JSON.parse(storage.getItem(KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
    const clean = v => ({ runs: Math.max(0, v.runs | 0), moves: Object.fromEntries(order.map(id => [id, Math.max(0, +(v.moves || {})[id] || 0)])), shown: !!v.shown });
    const state = () => clean(read());
    const save = s => { try { storage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; } };
    // stats: the finished run's counters (flashbangs: throws since the last result).
    function record(stats = {}) {
      const s = state(); s.runs++;
      for (const id of order) s.moves[id] += (SOURCES[id] || []).reduce((n, key) => n + Math.max(0, +stats[key] || 0), 0);
      save(s); return s;
    }
    const unused = () => { const s = state(); return order.filter(id => !s.moves[id]); };
    // Up to two unused tips in priority order, only once, from the 2nd finished run on.
    function due() { const s = state(); return s.runs >= SHOW_AFTER_RUNS && !s.shown ? unused().slice(0, MAX_SHOWN) : []; }
    function markShown() { const s = state(); s.shown = true; save(s); }
    return { record, unused, due, markShown, state, KEY };
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { createTipUsage, ORDER, SOURCES }; return; }

  const store = createTipUsage({ getItem: k => { try { return localStorage.getItem(k); } catch { return null; } }, setItem: (k, v) => localStorage.setItem(k, v) });
  let thrownSeen = 0;
  const realRun = () => {
    const w = window, ch = w.skyChallenge;
    return !w.skyPracticeMode && !w.skyOwnerReplay && !ch?.debug && !/canyon\.html$/i.test(location.pathname);
  };
  window.skyTipUsage = {
    unused: store.unused, due: store.due, markShown: store.markShown, state: store.state,
    // Called once per finished run by challenge-score.js; returns the tips to show after this run (maybe none).
    afterRun(stats) {
      const thrown = window.skyFlashbang?.stats?.thrown || 0, flashbangs = Math.max(0, thrown - thrownSeen); thrownSeen = thrown;
      if (!realRun()) return [];
      store.record({ ...stats, flashbangs });
      return store.due();
    }
  };
})();
