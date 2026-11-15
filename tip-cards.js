// The one-time "コツ" strip on the game-over screen (2nd finished real run): up to two unused moves, side by side,
// each with its looping demo. Presentation only. challenge-score.js calls show() / clear(); tip-usage.js decides who is due.
(() => {
  const players = []; let watcher = null;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  function clear() {
    watcher?.disconnect(); watcher = null;
    players.splice(0).forEach(p => p.destroy());
    const strip = document.getElementById('unityTips');
    if (strip) { strip.textContent = ''; strip.hidden = true; }
    const card = document.getElementById('unityResultCard');
    if (card) { delete card.dataset.tips; card.style.height = ''; }
  }
  // Returns true when the strip is on screen. The card keeps its height so "もう一度逃げる" stays where it was.
  function show(ids) {
    const tips = window.skyTips, card = document.getElementById('unityResultCard'), strip = document.getElementById('unityTips');
    clear();
    if (!tips || !card || !strip || !ids?.length) return false;
    const height = card.offsetHeight;
    strip.hidden = false;
    for (const id of ids.slice(0, 2)) {
      const item = el('div', 'ut-card'), canvas = el('canvas', 'ut-canvas'), text = el('div', 'ut-text'), cap = el('p', 'ut-cap');
      const name = el('div', 'ut-name'); name.append(el('small', '', 'コツ'), el('b', '', tips.names[id])); text.append(name, cap);
      item.append(canvas, text); strip.append(item);
      const player = tips.createPlayer(canvas, { onStep: step => { cap.textContent = step; } });
      players.push(player); player.show(id);
    }
    card.dataset.tips = 'true'; card.style.height = height + 'px';
    // Stop the demos as soon as the result card goes away (retry key, menu, new run).
    watcher?.disconnect(); watcher = new MutationObserver(() => { if (card.offsetParent === null) clear(); });
    const over = document.getElementById('ovOver'); if (over) watcher.observe(over, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    return true;
  }
  window.skyTipCards = { show, clear };
})();
