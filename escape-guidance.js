// Short cues only where the immediate floor and player clearance are checked.
const g = window.__game, s = window.__skyInternals, c = g.P;
const hint = document.createElement('div'); hint.id = 'escapeGuidance'; hint.hidden = true;
document.getElementById('app').append(hint);
const style = document.createElement('style');
style.textContent = `#escapeGuidance{position:absolute;z-index:9;left:50%;top:126px;transform:translateX(-50%);max-width:calc(100% - 320px);padding:6px 10px;border:1px solid #8fead2;border-radius:8px;background:#102b2de8;color:#eafff9;font:700 13px/1.4 system-ui;text-align:center;pointer-events:none}#escapeGuidance[hidden]{display:none!important}@media(max-height:500px){#escapeGuidance{top:92px;font-size:11px}}`;
document.head.append(style);
let flash = null, lastClock = 0;
const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
function bearing(dx, dz) {
  const a = Math.atan2(dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), -dx * Math.sin(c.yaw) - dz * Math.cos(c.yaw));
  return arrows[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}
function clearDirection(dx, dz, distance = 2.4) {
  if (!c.onGround || c.state !== 'normal') return false;
  for (let d = .4; d <= distance + .01; d += .4) {
    const x = c.pos.x + dx * d, z = c.pos.z + dz * d;
    if (!s.oe(x, c.pos.y + .04, z, c.r, 1.75)) return false;
    const floor = s.raycast(x, c.pos.y + .35, z, 0, -1, 0, .8);
    if (!floor || Math.abs(floor.b.maxY - c.pos.y) > .4) return false;
  }
  return true;
}
function afterFlash() {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8, dx = Math.sin(angle), dz = Math.cos(angle);
    if (!clearDirection(dx, dz)) continue;
    const x = c.pos.x + dx * 2.4, z = c.pos.z + dz * 2.4;
    let nearest = 12;
    for (const enemy of s.Jt) if (!enemy.dead && !enemy.remove && Math.abs(enemy.pos.y - c.pos.y) < 3)
      nearest = Math.min(nearest, Math.hypot(enemy.pos.x - x, enemy.pos.z - z));
    if (nearest > bestScore) { bestScore = nearest; best = { dx, dz, until: s.z.t + 3 }; }
  }
  flash = best;
}
function update() {
  hint.hidden = true;
  if (s.modeRef() !== 'play' || s.z.over || s.z.mission || window.skyPracticeMode) { flash = null; lastClock = 0; return; }
  if (s.z.t < lastClock) flash = null;
  lastClock = s.z.t;
  const existingRoute = document.getElementById('escapeRouteHint');
  if (existingRoute && !existingRoute.hidden) return;
  let direction = null, text = '';
  if (flash && s.z.t < flash.until && clearDirection(flash.dx, flash.dz, 1.2)) {
    direction = flash; text = document.documentElement.lang === 'en' ? 'Possible escape' : '逃げ道の候補';
  } else {
    flash = null;
    // First move north alongside the obstacle, then turn east into the street.
    const first = c.pos.z > 5.8, dx = (first ? -42 : -35) - c.pos.x, dz = (first ? 5 : 4.8) - c.pos.z, len = Math.hypot(dx, dz);
    if ((location.pathname.endsWith('index.html') || location.pathname.endsWith('/')) && s.z.t < 9 && Math.hypot(c.pos.x + 42, c.pos.z - 8) < 9 && len > 1 && clearDirection(dx / len, dz / len, 1.2)) {
      direction = {dx, dz}; text = document.documentElement.lang === 'en' ? 'Head for the opening' : '通路へ進もう';
    }
  }
  if (direction) { hint.textContent = `${bearing(direction.dx, direction.dz)} ${text}`; hint.hidden = false; }
}
window.skyEscapeGuidance = { afterFlash, update, clearDirection, get flash() { return flash; } };
let last = 0;
function frame(t) { requestAnimationFrame(frame); if (t - last >= 100) { last = t; update(); } }
requestAnimationFrame(frame);
