// "Here are your controls": one picture screen shown right after the player picks a control style (2026-11-14, PC playtest:
// nobody knew which keys do what). PC (WASD / mouse / Q / 1-4), phone, and the automatic-camera "easy" style each get their own picture.
// show(mode, done) -> done() is called when the player presses "Got it" (or at once when the screen is skipped).
// Skipped for automated browsers unless ?controlsGuide=1, and with ?controlsGuide=0 and owner replays (the guided intro itself runs in practice mode, so practice is not a reason to skip).
(() => {
  if (window.skyControlsGuide) return;
  const params = new URLSearchParams(location.search);
  const skipped = () => params.get('controlsGuide') === '0' || window.skyOwnerReplay || params.has('ownerReplay') ||
    (navigator.webdriver === true && params.get('controlsGuide') !== '1');
  const k = (label, cls = '') => `<kbd class="cg-key ${cls}">${label}</kbd>`;
  const MOUSE = right => `<svg class="cg-mouse" viewBox="0 0 48 64" aria-hidden="true"><rect x="6" y="4" width="36" height="56" rx="18" fill="#10202c" stroke="#e8f4ff" stroke-width="2.5"/>` +
    `<path d="M6 28h36M24 4v24" stroke="#e8f4ff" stroke-width="2.5" fill="none"/>` +
    (right ? `<path d="M24 4a18 18 0 0 1 18 18v6H24z" fill="#35c4e8"/>` : `<rect x="21" y="14" width="6" height="12" rx="3" fill="#35c4e8"/>`) + `</svg>`;
  const CIRCLE = `<svg class="cg-circle" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="38" r="20" fill="none" stroke="#e8f4ff" stroke-width="2.5" opacity=".7"/>` +
    `<circle cx="32" cy="38" r="7" fill="#35c4e8"/><path d="M32 22V6m-7 7 7-7 7 7" fill="none" stroke="#35c4e8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const LOOK = `<svg class="cg-circle" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 32h48M18 22 8 32l10 10M46 22l10 10-10 10" fill="none" stroke="#35c4e8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CAMERA = `<svg class="cg-circle" viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="20" width="36" height="26" rx="5" fill="none" stroke="#e8f4ff" stroke-width="2.5"/><path d="M44 29l12-7v22l-12-7z" fill="none" stroke="#e8f4ff" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 10a14 14 0 0 1 14 0" fill="none" stroke="#35c4e8" stroke-width="3" stroke-linecap="round"/></svg>`;
  const block = (pic, title, sub = '') => `<div class="cg-block"><div class="cg-pic">${pic}</div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  function blocks(mode, touch) {
    const auto = mode === 'after';
    if (touch) return [
      block(CIRCLE, '移動', '左の円に指を置いて移動'),
      auto ? block(CAMERA, 'カメラ自動', 'カメラは自動で追いかけます') : block(LOOK, '視点', '右側をなぞって見回す'),
      block(`<span class="cg-btn">ジャンプ</span>`, 'ジャンプ', '画面下のボタン'),
      block(`<span class="cg-ring"></span>`, '技（フック・爆破）', '光る印をタップ。低い通路は自動でスライド'),
    ];
    return [
      block(auto ? `<div class="cg-keys">${k('W', 'a')}<br>${k('A', 'b')}${k('S', 'a')}${k('D', 'b')}</div>` : `<div class="cg-keys">${k('W')}<br>${k('A')}${k('S')}${k('D')}</div>`,
        auto ? '<span class="cg-a">前後</span> / <span class="cg-b">曲がる</span>' : '移動'),
      auto ? block(CAMERA, 'カメラ自動', 'カメラは自動で追いかけます') : block(MOUSE(false), '視点', 'マウスを動かして視点を回す'),
      block(`<div class="cg-keys">${k('Space', 'wide')}</div>`, 'ジャンプ'),
      block(`<div class="cg-keys">${k('Q', 'hot')}</div><span class="cg-or">/</span>${MOUSE(true)}`, '技（フック・爆破）', 'マークが出たら押す'),
      block(`<div class="cg-keys">${k('E', 'hot')}</div>`, 'スライド', '走りながら押す。押している間滑る'),
      block(`<div class="cg-keys items">${k('1')}${k('2')}${k('3')}${k('4')}</div>`, 'アイテム', '閃光弾 · 分身 · 救済 · ジャンプ弾'),
    ];
  }
  let root = null, done = null;
  function close(run) {
    if (!root || root.hidden) return;
    root.hidden = true; document.body.classList.remove('cg-open');
    const cb = done; done = null; if (run) cb?.();
  }
  function build() {
    root = document.createElement('section'); root.id = 'controlsGuide'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'cgTitle');
    root.innerHTML = '<div class="cg-panel"><h2 id="cgTitle">操作はこの通り</h2><div class="cg-grid"></div><p class="cg-auto">射撃とナイフは自動です</p><button type="button" class="cg-ok">わかった</button></div>';
    (document.getElementById('app') || document.body).append(root);
    root.querySelector('.cg-ok').addEventListener('click', () => close(true));
    root.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(true); } });
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup']) root.addEventListener(type, e => e.stopPropagation());
  }
  function show(mode, then) {
    if (skipped()) { then?.(); return false; }
    if (!root) build();
    const touch = !!window.skyFollowCamera?.touchDevice;
    root.dataset.mode = mode; root.dataset.kind = touch ? 'touch' : 'pc';
    root.querySelector('.cg-grid').innerHTML = blocks(mode, touch).join('');
    done = then || null; root.hidden = false; document.body.classList.add('cg-open');
    document.exitPointerLock?.();
    root.querySelector('.cg-ok').focus({ preventScroll: true });
    return true;
  }
  window.skyControlsGuide = { show, close: () => close(false), get visible() { return !!root && !root.hidden; } };
})();
