// 2026-11-24 視野角の既定を 88° → 70°、走りで広がる量を 16° → 8° にした（三人称のカメラ）。
// 88°（横長スマホで横 約128°）では、人物が画面の高さの約15%（約60ピクセル）しかなく、端の伸びも大きかった。
// 設定は全項目まとめて保存される（`gunrun-sky-proto-v1`）ので、前の既定のまま保存されている人だけ、1回だけ新しい既定へ移す。
// 自分で動かした値（88・16 以外）はそのまま。`?cam=old` で前の既定と前のカメラ位置（比較用。保存はしない。位置は dash-boost.js）。
(() => {
  // 画面の四隅の暗がり（screen-vignette.css）は `?vignette=0` で外す。
  try { if (new URLSearchParams(location.search).get('vignette') === '0') document.documentElement.classList.add('no-vignette'); } catch {}
  const KEY = 'gunrun-sky-proto-v1', DONE = 'gunrun-camera-fov-v2';
  const OLD = { fov: 88, fovKick: 16 }, NEW = { fov: 70, fovKick: 8 };
  window.skyCameraFov = { old: OLD, current: NEW };
  try {
    if (new URLSearchParams(location.search).get('cam') === 'old') {
      window.skyCameraFov.compare = true;
      addEventListener('load', () => { const U = window.__skyInternals?.U; if (U) Object.assign(U, OLD); });
      return;
    }
    if (localStorage.getItem(DONE)) return;
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      let changed = false;
      for (const k of Object.keys(OLD)) if (saved[k] === OLD[k]) { saved[k] = NEW[k]; changed = true; }
      if (changed) localStorage.setItem(KEY, JSON.stringify(saved));
    }
    localStorage.setItem(DONE, '1');
  } catch {}
})();
