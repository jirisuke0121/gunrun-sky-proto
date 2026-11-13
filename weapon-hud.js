// Ammo box: a weapon icon + the number. The weapon name appears only for a moment when the weapon changes.
const game = window.__skyInternals;
const box = document.getElementById('ammoBox');
const icon = (body) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
const ICONS = {
  pistol: icon('<path d="M3 10h20v6h-9l-1 8H8l1-8H3z"/>'),
  shotgun: icon('<path d="M2 14h22v4H2zM24 13l6 2v2l-6 1zM8 18l3 7h4l-2-7"/>'),
  rifle: icon('<path d="M2 13h20v4H2zM22 12l7 1v3l-7 1zM10 17l1 8h4l-1-8M6 8h8v5H6z"/>'),
  special: icon('<circle cx="16" cy="16" r="9"/><path d="M16 4v6M16 22v6M4 16h6M22 16h6"/>'),
};
// Names come from the weapon table (HG, SG, SMG, MG, Easy ...): the group decides the icon.
const kind = (name = '') => /beam|rail|cluster|rocket/i.test(name) ? 'special'
  : /shotgun|^SG\b/i.test(name) ? 'shotgun'
  : /SMG|^MG\b|M4|rifle/i.test(name) ? 'rifle' : 'pistol';
if (box) {
  const mark = document.createElement('span'); mark.id = 'weaponIcon'; mark.setAttribute('aria-hidden', 'true');
  const flash = document.createElement('span'); flash.id = 'weaponNameFlash'; flash.setAttribute('role', 'status'); flash.hidden = true;
  box.prepend(mark); box.append(flash);
  let last = null, timer = 0;
  const tr = text => window.skyI18n?.tr(text) || text;
  function frame() {
    const name = String(game.wpc()?.n ?? '');
    if (name !== last) {
      mark.innerHTML = ICONS[kind(name)];
      box.dataset.weapon = name;
      box.setAttribute('aria-label', `${name} ${tr('残弾')}`);
      if (last !== null && name) {
        flash.textContent = name; flash.hidden = false;
        clearTimeout(timer); timer = setTimeout(() => { flash.hidden = true; }, 1600);
      }
      last = name;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
