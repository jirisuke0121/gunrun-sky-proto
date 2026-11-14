// Presentation only: of the messages that share the centre-top slot, show the most urgent one.
// No simulation values are read or changed.
(() => {
  const slots = [
    ['alert', el => el.classList.contains('on')],
    ['wallrunGuide', el => !el.hidden],
    ['hint', el => el.classList.contains('on')],
    ['flowTag', el => parseFloat(el.style.opacity || '0') > 0.05],
  ];
  function tick() {
    let shown = false;
    for (const [id, active] of slots) {
      const el = document.getElementById(id);
      if (!el) continue;
      const on = active(el);
      el.classList.toggle('hud-hide', on && shown);
      if (on) shown = true;
    }
  }
  setInterval(tick, 50);
})();
