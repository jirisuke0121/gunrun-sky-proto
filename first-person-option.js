// 一人称視点のおまけ（2026-11-22）。操作設定の末尾に小さく置く、任意で選べるだけの試作。
//   * 既定は三人称。選ぶと視点だけが一人称になる（human-view.js の setFirstPerson。保存は gunrun-first-person-v1）。
//   * 一人称で遊んだランは、ランキング・プレイ記録に送らない（run-records.js・foundation-runtime.js）。
//   * 入門コースでは三人称のまま（human-view.js の desiredView）。
// pause-focus.js が #firstPersonOption を操作タブの末尾へ並べる。
(() => {
  if (document.getElementById('firstPersonOption')) return;
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});
  const box = make('div', { id: 'firstPersonOption', className: 'first-person-option' });
  const label = make('label', { className: 'tg' });
  const input = make('input', { type: 'checkbox', id: 'firstPersonToggle' });
  label.append(input, make('span', {}, '一人称視点（おまけ・試作）'));
  const note = make('p', { className: 'note' }, '自分の目線で遊びます。足元や背後の追手が見えにくくなります。この設定で遊んだランは、ランキング・プレイ記録に送信されません。');
  box.append(label, note);
  let saved = false;
  try { saved = localStorage.getItem('gunrun-first-person-v1') === '1'; } catch {}
  input.checked = saved;
  const sync = () => { input.checked = !!(window.skyHumanView?.firstPerson ?? saved); };
  input.addEventListener('change', () => { window.skyHumanView?.setFirstPerson(input.checked); sync(); });
  document.addEventListener('sky-first-person-change', sync);
  // 人物を読み込めず代替表示（一人称）になっているとき・入門コースでは、切り替えても変わらないので出さない。
  const visible = () => { box.hidden = window.skyHumanView?.choice === 'existing' || !!window.skyGuidedMode; };
  new MutationObserver(visible).observe(document.body, { attributes: true, attributeFilter: ['data-sky-human-trial'] });
  visible();
  window.skyFirstPersonOption = { box, input, sync };
  // pause-focus.js が操作タブへ移すまでは置き場（#app の直下）に隠れている（pause-focus.css）。
  (document.getElementById('app') || document.body).append(box);
})();
