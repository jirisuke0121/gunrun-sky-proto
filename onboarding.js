// First visit, modelled on NIGHTLINE's "first drive": no home screen and no form up front.
// A first-time player sees one short start card and is taken straight into the intro run,
// where interactive instruction cards guide the player; the nickname is asked once after the
// intro run ends (skippable). Returning players never see the card; "遊び方" on the home
// screen reopens the controls and the nickname. Nothing here awards score or changes the rules.
(() => {
  const params = new URLSearchParams(location.search);
  if (window.skyOwnerReplay || params.has('ownerReplay') || window.skyPracticeMode || params.has('practice')) return;
  const $ = id => document.getElementById(id);
  const hero = $('homeHero');
  if (!hero || $('onboarding')) return;
  const STORE = 'gunrun-onboarding-v1', NAME = 'gunrun-name';
  // Any of these means someone has played here before (the intro run alone leaves none of the first four).
  const TRACES = [STORE, NAME, 'gunrun-run-history-v1', 'gunrun-run-outbox-v1', 'gunrun-sky-ghost-v1', 'gunrun-sky-ghost-rock-canyon-v1',
    'gunrun-challenge-difficulty-v1', 'gunrun-follow-camera-v1', 'gunrun-render-quality-v1'];
  const SPECIAL = ['practice', 'oldtown_swing', 'dev', 'replay', 'qa'];
  const names = window.skyPlayerName;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
  if (params.get('onboarding') === 'reset') { try { TRACES.forEach(key => localStorage.removeItem(key)); } catch { /* storage unavailable */ } }
  const forced = ['1', 'reset'].includes(params.get('onboarding'));
  // Automated browsers (the existing bench scripts) skip the first-visit card unless it is asked for;
  // ?onboarding=auto applies the normal first-visit rule inside an automated browser (tests).
  const automated = navigator.webdriver === true && params.get('onboarding') !== 'auto';
  const traced = () => TRACES.some(key => Boolean(read(key)));
  const first = forced || (!automated && !SPECIAL.some(key => params.has(key)) && !window.skyDevMode && !traced());
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});
  const state = () => { try { return JSON.parse(read(STORE) || 'null') || {}; } catch { return {}; } };
  const saveState = patch => write(STORE, JSON.stringify({ at: new Date().toISOString(), ...state(), ...patch }));
  const savedName = () => { const value = read(NAME); return value ? names.normalize(value) : ''; };
  // After the first visit the intro run is offered from 遊び方, so the home screen drops its own intro block.
  // Automated browsers keep it (the existing bench scripts click it).
  const retireIntroEntry = () => { if (!automated) document.body.classList.add('onb-no-intro'); };
  if (!first && traced()) retireIntroEntry();
  const intro = $('bIntro');

  // ---- Dialog: 遊び方 (reopened from home) and the one-time nickname prompt ----
  const root = make('div', { id: 'onboarding', hidden: true });
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'onbTitle');
  root.innerHTML = `<div class="onb-card">
    <header><p class="onb-kicker">GUNRUN · PARKOUR SURVIVAL</p><h2 id="onbTitle">遊び方</h2>
      <p class="onb-lead" data-for="again">2分間、ゾンビから逃げ切るゲームです。30秒ごとにボーナス点が入ります。</p>
      <p class="onb-lead" data-for="name">ランキングに表示される名前です。あとからでも決められます。</p></header>
    <ol class="onb-steps">
      <li><b>走る・跳ぶ</b><span class="onb-pc"><kbd>W A S D</kbd> 移動　<kbd>Space</kbd> ジャンプ　<kbd>C</kbd> スライド</span><span id="onbTouchMove" class="onb-touch">左側に指を置き、上へずらして押したまま前進。離すと停止。「ジャンプ」で跳ぶ</span></li>
      <li><b id="onbLookTitle">視点を回す</b><span id="onbPcLook" class="onb-pc"><kbd>マウス</kbd> で視点を動かす</span><span id="onbTouchLook" class="onb-touch"></span></li>
      <li><b>技で引き離す</b><span class="onb-pc">壁走り・縁つかみ・はしご・ジップラインに加えて、<kbd>Q</kbd> でフック</span><span class="onb-touch">壁走り・縁つかみ・はしご・ジップラインに加えて、画面の輪をタップでフック</span></li>
      <li><b>銃は自動</b><span class="onb-pc">近い敵を自動で狙って撃ちます。<kbd>1</kbd> の閃光弾で周りのゾンビを止め、<kbd>2</kbd> の分身でおびき寄せます</span><span class="onb-touch">近い敵を自動で狙って撃ちます。「閃光弾」ボタンで周りのゾンビを数秒止められます</span></li>
    </ol>
    <section class="onb-name"><label for="onbName">ニックネーム（ランキングに表示されます）</label>
      <input id="onbName" type="text" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="例：RUNNER">
      <p id="onbError" class="onb-error" role="alert"></p><small>2〜14文字の文字・数字・_・-。空欄のままでも遊べます。</small>
      <small class="onb-send">ニックネーム・スコア・プレイ記録は、ランキングのために送信されます（設定で停止できます）。</small></section>
    <footer><button id="onbSave" type="button" class="onb-primary">保存する</button>
      <button id="onbIntro" type="button" class="onb-primary">入門モードで練習する</button>
      <button id="onbMain" type="button" class="onb-secondary">閉じる</button>
      <button id="onbSettings" type="button" class="onb-link">操作設定を開く</button></footer>
  </div>`;
  ($('app') || document.body).append(root);
  const input = $('onbName'), error = $('onbError');
  let mode = 'again';

  // Returns false (and shows why) when a typed name is not acceptable; an empty field is fine.
  function commitName() {
    const raw = input.value.trim();
    if (!raw) { error.textContent = ''; return true; }
    const name = names.normalize(raw);
    if (!name) { error.textContent = names.MESSAGE; input.setAttribute('aria-invalid', 'true'); input.focus(); return false; }
    input.removeAttribute('aria-invalid'); error.textContent = ''; input.value = name; write(NAME, name); document.dispatchEvent(new Event('sky-name-change')); return true;
  }
  function syncIntro() {
    const ready = !!intro && !intro.disabled;
    $('onbIntro').disabled = !ready;
    $('onbIntro').textContent = ready ? '入門モードで練習する' : '読み込み中…';
  }
  function openDialog(kind) {
    mode = root.dataset.mode = kind;
    input.value = savedName(); error.textContent = ''; input.removeAttribute('aria-invalid');
    $('onbTitle').textContent = kind === 'name' ? 'ニックネームを決めよう' : '遊び方';
    $('onbMain').textContent = kind === 'name' ? 'あとで' : '閉じる';
    const fixed = params.get('cameraTrial') === 'fixed' && window.skyFollowCamera?.mode === 'after';
    $('onbLookTitle').textContent = fixed ? 'カメラは固定' : '視点を回す';
    $('onbTouchMove').textContent = fixed ? '左側に指を置き、画面の進みたい方向へずらして押したまま移動。離すと停止。「ジャンプ」で跳ぶ' : '左側に指を置き、上へずらして押したまま前進。離すと停止。「ジャンプ」で跳ぶ';
    $('onbPcLook').innerHTML = fixed ? 'カメラの向きは固定です。視点操作はありません' : '<kbd>マウス</kbd> で視点を動かす';
    $('onbTouchLook').textContent = fixed ? 'カメラの向きは固定です。右側で視点を回す操作はありません' : window.skyFollowCamera?.mode === 'after'
      ? 'カメラは進む向きへ自動で回ります。右側で見回した後は、左の指を離して進む向きを選び直せます'
      : '画面の右側に指を置き、横へ動かして見回します。左側の移動と一緒に使えます';
    root.hidden = false; document.body.classList.add('onb-open'); syncIntro();
    input.focus({ preventScroll: true });
  }
  function closeDialog() { root.hidden = true; document.body.classList.remove('onb-open'); }
  $('onbSave').addEventListener('click', () => {
    if (!input.value.trim()) { error.textContent = '名前を入力してください'; input.focus(); return; }
    if (commitName()) closeDialog();
  });
  $('onbIntro').addEventListener('click', () => { if (!commitName() || !intro || intro.disabled) return; closeDialog(); intro.click(); });
  $('onbMain').addEventListener('click', () => { if (mode === 'name' && !input.value.trim()) { closeDialog(); return; } if (commitName()) closeDialog(); });
  $('onbSettings').addEventListener('click', () => { if (!commitName()) return; closeDialog(); $('bSettings')?.click(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $(mode === 'name' ? 'onbSave' : 'onbIntro').click(); } });
  root.addEventListener('keydown', event => { if (event.key === 'Escape') $('onbMain').click(); });
  if (intro) new MutationObserver(syncIntro).observe(intro, { attributes: true, attributeFilter: ['disabled'] });

  // Always reachable from the home screen: the controls again, and the nickname.
  const guide = make('button', { id: 'homeGuide', type: 'button' }, '遊び方');
  guide.addEventListener('click', () => openDialog('again'));
  hero.querySelector('.home-heading-actions')?.prepend(guide);

  // ---- First visit: one start card, then straight into the intro run ----
  let splash;
  function showSplash() {
    splash = make('div', { id: 'onbSplash' });
    splash.setAttribute('role', 'dialog'); splash.setAttribute('aria-modal', 'true'); splash.setAttribute('aria-labelledby', 'onbSplashTitle');
    splash.innerHTML = `<div class="onb-splash-card">
      <p class="onb-kicker">GUNRUN · PARKOUR SURVIVAL</p>
      <h1 id="onbSplashTitle">空中回廊<span>追跡</span></h1>
      <p class="onb-splash-intro">ゾンビから2分間逃げろ。</p>
      <p class="onb-splash-sub">銃・アイテム・地形を駆使して、とにかく逃げ切れ。</p>
      <p class="onb-splash-note">入門は記録・ランキングに反映されません。</p>
      <button id="onbStart" type="button" class="onb-start"><span id="onbStartLabel">タップしてスタート</span><span aria-hidden="true">❯❯</span></button>
    </div>`;
    ($('app') || document.body).append(splash); document.body.classList.add('onb-open');
    const start = $('onbStart');
    const sync = () => { const ready = !!intro && !intro.disabled; start.disabled = !ready; $('onbStartLabel').textContent = ready ? 'タップしてスタート' : '読み込み中…'; };
    sync(); if (intro) new MutationObserver(sync).observe(intro, { attributes: true, attributeFilter: ['disabled'] });
    start.addEventListener('click', () => {
      if (start.disabled) return;
      saveState({ phase: 'started' }); retireIntroEntry();
      splash.remove(); document.body.classList.remove('onb-open');
      intro.click();
    });
    start.focus({ preventScroll: true });
  }

  // ---- After the first intro run: ask for the nickname once ("あとで" skips it) ----
  document.addEventListener('sky-intro-result', () => {
    const current = state();
    if (current.phase !== 'started' || current.namePrompted || savedName()) return;
    saveState({ namePrompted: true });
    setTimeout(() => { if (root.hidden) openDialog('name'); }, 1600);
  });

  window.skyOnboarding = { first, open: openDialog, name: savedName, commitName,
    get splashVisible() { return !!splash?.isConnected; }, get dialogVisible() { return !root.hidden; } };
  if (first) showSplash();
})();
