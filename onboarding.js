// First visit: a short guide (nickname + the few controls that matter) that leads into the
// life-unlimited intro run. Modelled on NIGHTLINE's entry flow (first-visit check, nickname rule,
// control coach shown once). Nothing here awards score or changes the rules; it only opens the
// existing intro button. Returning players never see it unless they open "遊び方" themselves.
(() => {
  const params = new URLSearchParams(location.search);
  if (window.skyPracticeMode || params.has('practice')) return;
  const $ = id => document.getElementById(id);
  const hero = $('homeHero');
  if (!hero || $('onboarding')) return;
  const STORE = 'gunrun-onboarding-v1', NAME = 'gunrun-name', HISTORY = 'gunrun-run-history-v1';
  const names = window.skyPlayerName;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
  if (params.get('onboarding') === 'reset') { try { localStorage.removeItem(STORE); localStorage.removeItem(NAME); } catch { /* storage unavailable */ } }
  const forced = ['1', 'reset'].includes(params.get('onboarding'));
  const hasHistory = () => { try { return JSON.parse(read(HISTORY) || '[]').length > 0; } catch { return false; } };
  // Automated browsers (the existing bench scripts) skip the guide unless it is asked for;
  // ?onboarding=auto applies the normal first-visit rule inside an automated browser (tests).
  const automated = navigator.webdriver === true && params.get('onboarding') !== 'auto';
  const first = forced || (!automated && !read(STORE) && !hasHistory() && !window.skyDevMode);
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});
  const savedName = () => { const value = read(NAME); return value ? names.normalize(value) : ''; };

  const root = make('div', { id: 'onboarding', hidden: true });
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'onbTitle');
  root.innerHTML = `<div class="onb-card">
    <header><p class="onb-kicker">GUNRUN · PARKOUR SURVIVAL</p><h2 id="onbTitle">はじめに</h2>
      <p class="onb-lead">2分間、ゾンビから逃げ切るゲームです。30秒ごとにボーナス点が入ります。</p></header>
    <ol class="onb-steps">
      <li><b>走る・跳ぶ</b><span class="onb-pc"><kbd>W A S D</kbd> 移動　<kbd>Space</kbd> ジャンプ　<kbd>C</kbd> スライド</span><span class="onb-touch">左ドラッグで移動、「ジャンプ」ボタンで跳ぶ。低い通路は自動でスライド</span></li>
      <li><b>視点を回す</b><span class="onb-pc"><kbd>マウス</kbd> で視点を動かす</span><span class="onb-touch">画面の右側をドラッグ</span></li>
      <li><b>技で引き離す</b><span class="onb-pc">壁走り・縁つかみ・はしご・ジップラインに加えて、<kbd>Q</kbd> でフック</span><span class="onb-touch">壁走り・縁つかみ・はしご・ジップラインに加えて、画面の輪をタップでフック</span></li>
      <li><b>銃は自動</b><span class="onb-pc">近い敵を自動で狙って撃ちます。<kbd>G</kbd> の閃光弾で周りのゾンビを数秒止められます</span><span class="onb-touch">近い敵を自動で狙って撃ちます。「閃光弾」ボタンで周りのゾンビを数秒止められます</span></li>
    </ol>
    <section class="onb-name"><label for="onbName">ニックネーム（ランキングに表示されます）</label>
      <input id="onbName" type="text" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="例：RUNNER">
      <p id="onbError" class="onb-error" role="alert"></p><small>2〜14文字の文字・数字・_・-。空欄のままでも遊べます。あとから「遊び方」で変えられます。</small></section>
    <footer><button id="onbIntro" type="button" class="onb-primary">入門モードで始める（ライフ無限）</button>
      <button id="onbMain" type="button" class="onb-secondary">本番へ進む</button>
      <button id="onbSettings" type="button" class="onb-link">操作設定を開く</button></footer>
  </div>`;
  document.body.append(root);

  const input = $('onbName'), error = $('onbError');
  let mode = 'first', startPending = false;
  const intro = $('bIntro');

  // Returns false (and shows why) when a typed name is not acceptable; an empty field is fine.
  function commitName() {
    const raw = input.value.trim();
    if (!raw) { error.textContent = ''; return true; }
    const name = names.normalize(raw);
    if (!name) { error.textContent = names.MESSAGE; input.setAttribute('aria-invalid', 'true'); input.focus(); return false; }
    input.removeAttribute('aria-invalid'); error.textContent = ''; input.value = name; write(NAME, name); return true;
  }
  function syncIntro() {
    const ready = !!intro && !intro.disabled;
    $('onbIntro').disabled = !ready && !startPending;
    $('onbIntro').textContent = ready || startPending ? '入門モードで始める（ライフ無限）' : '読み込み中…';
    if (startPending && ready) { startPending = false; close('intro'); intro.click(); }
  }
  function open(kind = 'first') {
    mode = kind;
    input.value = savedName(); error.textContent = ''; input.removeAttribute('aria-invalid');
    $('onbTitle').textContent = kind === 'first' ? 'はじめに' : '遊び方';
    $('onbMain').textContent = kind === 'first' ? '本番へ進む' : '閉じる';
    root.hidden = false; document.body.classList.add('onb-open'); syncIntro();
    (kind === 'first' ? $('onbIntro') : input).focus({ preventScroll: true });
  }
  function close(how) {
    if (mode === 'first' || how === 'intro') write(STORE, JSON.stringify({ at: new Date().toISOString(), how }));
    root.hidden = true; document.body.classList.remove('onb-open');
    window.dispatchEvent(new CustomEvent('sky-onboarding-close', { detail: { how, name: savedName() } }));
  }
  $('onbIntro').addEventListener('click', () => {
    if (!commitName()) return;
    if (intro && !intro.disabled) { close('intro'); intro.click(); }
    else { startPending = true; syncIntro(); }
  });
  $('onbMain').addEventListener('click', () => { if (commitName()) close('main'); });
  $('onbSettings').addEventListener('click', () => { if (!commitName()) return; close(mode === 'first' ? 'settings' : 'closed'); $('bSettings')?.click(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('onbIntro').click(); } });
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && mode !== 'first') $('onbMain').click(); });
  if (intro) new MutationObserver(syncIntro).observe(intro, { attributes: true, attributeFilter: ['disabled'] });

  // Always reachable from the home screen, for the guide and for changing the nickname.
  const guide = make('button', { id: 'homeGuide', type: 'button' }, '遊び方');
  guide.addEventListener('click', () => open('again'));
  const actions = hero.querySelector('.home-heading-actions');
  if (actions) actions.prepend(guide);

  window.skyOnboarding = { first, open, close, name: savedName, commitName,
    get visible() { return !root.hidden; }, get pendingStart() { return startPending; } };
  if (first) open('first');
})();
