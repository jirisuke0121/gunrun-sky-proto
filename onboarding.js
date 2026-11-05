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
      <li><b>走る・跳ぶ</b><span class="onb-pc"><kbd>W A S D</kbd> 移動　<kbd>Space</kbd> ジャンプ　<kbd>C</kbd> スライド</span><span class="onb-touch">左ドラッグで移動、「ジャンプ」ボタンで跳ぶ。低い通路は自動でスライド</span></li>
      <li><b>視点を回す</b><span class="onb-pc"><kbd>マウス</kbd> で視点を動かす</span><span class="onb-touch">画面の右側をドラッグ</span></li>
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
      <p class="onb-splash-intro">ライフ無限の入門で、操作を試そう。</p>
      <div class="onb-keys onb-pc"><span><kbd>W A S D</kbd><b>で移動</b></span><span><kbd>Space</kbd><b>でジャンプ</b></span></div>
      <p class="onb-touch onb-touch-line">左ドラッグで移動 · 右ドラッグで視点 · 「ジャンプ」ボタンで跳ぶ</p>
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

  // An actionable, non-modal tutorial: the player can keep moving while each card is open.
  const tutorial = make('section', { id: 'introTutorial', hidden: true });
  tutorial.setAttribute('aria-label', '入門チュートリアル');
  tutorial.innerHTML = `<div class="tutorial-copy"><small id="tutorialProgress"></small><h2 id="tutorialTitle"></h2><p id="tutorialText"></p></div>
    <div class="tutorial-actions"><button type="button" id="tutorialSkip"></button><button type="button" id="tutorialNext"></button></div>`;
  $('app').append(tutorial);
  for (const type of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend'])
    tutorial.addEventListener(type, event => event.stopPropagation());
  const lessons = [
    { ja: ['移動してみよう', 'W A S D で移動しよう。', '左側をドラッグして移動しよう。'], en: ['Move', 'Move with W A S D.', 'Drag on the left to move.'], action: 'move' },
    { ja: ['周りを見よう', '画面を右ドラッグ、または画面をクリックしてマウスを動かそう。', '画面の右側をドラッグして視点を回そう。'], en: ['Look around', 'Right-drag, or click the game and move the mouse.', 'Drag on the right to look around.'], action: 'look' },
    { ja: ['ジャンプしてみよう', 'Space でジャンプ。縁に向かって跳ぶと、つかめる場所もある。', '「ジャンプ」で跳ぼう。縁に向かって跳ぶと、つかめる場所もある。'], en: ['Jump', 'Press Space to jump. Jump toward an edge to grab it.', 'Tap Jump. Jump toward an edge to grab it.'], action: 'jump' },
    { ja: ['地形を使って逃げよう', '壁ジャンプ・鉄棒で進路を変える。Q でフックを使える。', '壁ジャンプ・鉄棒で進路を変える。画面の輪をタップするとフックを使える。'], en: ['Use the terrain', 'Change routes with wall jumps and bars. Press Q to use the hook.', 'Change routes with wall jumps and bars. Tap a target ring to use the hook.'] },
    { ja: ['ゾンビを引き離そう', '閃光玉は1、分身は2、困ったときの救済はV。銃は自動で撃つ。', '閃光玉・分身・救済のボタンで危機を切り抜けよう。銃は自動で撃つ。'], en: ['Escape the zombies', 'Press 1 for a flashbang, 2 for a decoy, or V for rescue. The gun fires automatically.', 'Use the flashbang, decoy or rescue buttons. The gun fires automatically.'] },
  ];
  let lesson = -1, introSeen = false, anchor = null, lastTime = 0, lookInput = 0;
  const touch = () => document.documentElement.classList.contains('touch');
  const english = () => document.documentElement.lang === 'en';
  function snapshot() {
    const game = window.__game, p = game.P, view = window.skyFollowCamera?.view || p;
    return { x: p.pos.x, z: p.pos.z, yaw: view.yaw, pitch: view.pitch, jumps: game.stats.jumps || 0, lookInput };
  }
  function renderLesson() {
    if (lesson < 0 || lesson >= lessons.length) { tutorial.hidden = true; return; }
    // Pointer lock sends every mouse click to the canvas; release it so the card buttons work.
    if (document.pointerLockElement) {
      window.__introTutorialUnlock = true;
      document.exitPointerLock?.();
      setTimeout(() => { window.__introTutorialUnlock = false; }, 500);
    }
    const lang = english() ? 'en' : 'ja', item = lessons[lesson][lang];
    $('tutorialProgress').textContent = `${lesson + 1} / ${lessons.length}`;
    $('tutorialTitle').textContent = item[0]; $('tutorialText').textContent = item[touch() ? 2 : 1];
    $('tutorialSkip').textContent = english() ? 'Skip tutorial' : 'チュートリアルを終了';
    const nextLabel = lesson === lessons.length - 1 ? (english() ? 'Finish' : '終わる') : (english() ? 'Next' : '次へ');
    $('tutorialNext').textContent = nextLabel + (touch() ? '' : ' [Enter]');
    tutorial.hidden = false; anchor = snapshot();
  }
  function nextLesson() { lesson++; renderLesson(); }
  $('tutorialNext').addEventListener('click', nextLesson);
  $('tutorialSkip').addEventListener('click', () => { lesson = lessons.length; renderLesson(); });
  window.addEventListener('keydown', event => {
    if (event.code !== 'Enter' || event.repeat || tutorial.hidden || window.__game?.mode !== 'play') return;
    event.preventDefault(); event.stopImmediatePropagation(); nextLesson();
  }, true);
  window.addEventListener('keydown', event => {
    if (lesson === 1 && !tutorial.hidden && ['ArrowLeft', 'ArrowRight'].includes(event.code)) lookInput++;
  }, true);
  window.addEventListener('pointermove', event => {
    if (lesson !== 1 || tutorial.hidden) return;
    const lookId = window.__skyInternals?.inputState?.lookId;
    if (event.pointerType === 'touch' ? lookId === event.pointerId : (document.pointerLockElement || (event.buttons & 2))) lookInput++;
  }, true);
  function tickTutorial() {
    const game = window.__game, introRun = !!game && !!window.skyChallenge?.isIntroRun && !game.GAME?.over;
    if (!introRun || game.mode === 'menu' || game.mode === 'over') {
      tutorial.hidden = true; introSeen = false; lesson = -1; lastTime = 0; return;
    }
    if (game.mode !== 'play') { tutorial.hidden = true; return; }
    if (!introSeen || game.GAME.t < lastTime - .5) { introSeen = true; lesson = 0; renderLesson(); }
    lastTime = game.GAME.t;
    if (lesson < 0 || lesson >= lessons.length) return;
    if (tutorial.hidden) { tutorial.hidden = false; anchor = snapshot(); }
    const p = game.P, view = window.skyFollowCamera?.view || p, action = lessons[lesson].action;
    const moved = Math.hypot(p.pos.x - anchor.x, p.pos.z - anchor.z) >= 1;
    const angle = Math.atan2(Math.sin(view.yaw - anchor.yaw), Math.cos(view.yaw - anchor.yaw));
    const looked = lookInput > anchor.lookInput && (Math.abs(angle) >= .2 || Math.abs(view.pitch - anchor.pitch) >= .2);
    const jumped = (game.stats.jumps || 0) > anchor.jumps;
    if (action === 'move' && moved || action === 'look' && looked || action === 'jump' && jumped) nextLesson();
  }
  setInterval(tickTutorial, 100);

  window.skyOnboarding = { first, open: openDialog, name: savedName, commitName,
    get splashVisible() { return !!splash?.isConnected; }, get dialogVisible() { return !root.hidden; } };
  if (first) showSplash();
})();
