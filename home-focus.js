// Keep the existing game controls and listeners; only arrange the lobby.
(() => {
  if (window.skyPracticeMode || new URLSearchParams(location.search).has('practice')) return;
  const plate = document.querySelector('#ovStart .plate');
  if (!plate || document.getElementById('homeHero')) return;
  const $ = id => document.getElementById(id);
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});
  const canyon = location.pathname.endsWith('canyon.html');
  const hero = make('div', { id: 'homeHero' });
  document.body.classList.add('sky-lobby');
  const heading = make('header', { className: 'home-heading' }, '<div><p class="home-kicker">GUNRUN · PARKOUR SURVIVAL</p><h1>空中回廊<span>追跡</span></h1></div>');
  const settings = make('button', { id: 'homeSettings', type: 'button' }, '設定');
  settings.addEventListener('click', () => $('bSettings')?.click());
  const actions = make('div', { className: 'home-heading-actions' });
  if ($('langToggle')) actions.append($('langToggle'));
  actions.append(settings);
  const rankButton = make('button', { id: 'homeRankingButton', type: 'button' }, 'ランキング');
  rankButton.setAttribute('aria-haspopup', 'dialog'); rankButton.setAttribute('aria-expanded', 'false');
  // Nickname chip (like NIGHTLINE's racer chip): the name is always visible and one tap edits it.
  const nameChip = make('button', { id: 'homeName', type: 'button' });
  const syncName = () => {
    const name = window.skyOnboarding?.name?.() || '';
    nameChip.innerHTML = name ? `<small>ニックネーム</small><b></b><i aria-hidden="true">✎</i>` : '<b>ニックネームを決める</b><i aria-hidden="true">✎</i>';
    if (name) nameChip.querySelector('b').textContent = name;
    nameChip.setAttribute('aria-label', name ? `ニックネーム ${name}（変更する）` : 'ニックネームを決める');
  };
  nameChip.addEventListener('click', () => window.skyOnboarding?.open('name'));
  document.addEventListener('sky-name-change', syncName); syncName(); addEventListener('load', syncName);
  actions.prepend(rankButton); actions.prepend(nameChip); heading.append(actions);
  const scene = make('section', { className: 'home-scene', ariaLabel: canyon ? '岩壁渓谷のゲーム風景' : '旧市街のゲーム風景' }, `<div class="home-scene-copy"><span class="home-map">${canyon ? '岩壁渓谷' : '旧市街'}</span><h2>2分間、<br>逃げ切れ。</h2><p>跳ぶ。壁を走る。追跡を引き離す。</p></div>`);
  scene.style.backgroundImage = `linear-gradient(0deg,#0c1219f5 0%,#0c12191a 85%),url('./assets/lobby/${canyon ? 'canyon' : 'old-town'}.svg')`;
  const main = make('section', { className: 'home-play', ariaLabel: '逃走の準備' });
  const difficulty = make('div', { id: 'homeDifficulty' }, '<div class="home-difficulty-heading"><h2>難易度を選ぶ</h2><span>難しいほど得点にボーナス</span></div>');
  const selector = $('challengeDifficulty'); selector.hidden = true;
  const choices = make('div', { className: 'home-difficulty-choices', role: 'group', ariaLabel: '難易度' });
  const levels = window.skyChallenge.levels.filter(p => p.id !== 'legacy');
  for (const [index, p] of levels.entries()) {
    const button = make('button', { type: 'button' }, `<span>${p.name}</span><strong><em>スコア</em><b>×${(1 + .1 * index).toFixed(1)}</b></strong><small><span>追手 最大${Math.max(...p.counts)}体</span><span>ライフ${p.lives}</span></small>`);
    button.dataset.difficulty = p.id;
    button.addEventListener('click', () => {
      if (selector.disabled || window.__game.mode !== 'menu') return;
      selector.value = p.id; selector.dispatchEvent(new Event('change', { bubbles: true }));
    }); choices.append(button);
  }
  const bonus = $('challengeScoreBonus'); bonus.classList.add('home-sr-only');
  difficulty.append(choices, selector, bonus);
  main.append(difficulty, $('bStart'), $('startReadyStatus'));
  for (const button of [...plate.querySelectorAll(':scope > [data-retry-start]')]) main.append(button);
  const intro = $('introEntry');
  const introButton = $('bIntro'), introStatus = $('introReadyStatus'), introRetries = [...intro.querySelectorAll('[data-retry-start]')];
  intro.replaceChildren(make('div', {}, '<b>はじめての方へ</b><small>ライフ無限で、操作を練習。</small>'), introButton, introStatus, ...introRetries);
  // The unfinished guided course is available from the quiet development fold.
  const development = make('details', { id:'homeDevelopment' });
  development.append(make('summary', {}, '開発用'));
  const developmentButton=make('button', { id:'bGuidedIntro', type:'button' }, '入門モードで遊ぶ');
  development.append(developmentButton);
  const syncDevelopment = () => { developmentButton.disabled = introButton.disabled; };
  new MutationObserver(syncDevelopment).observe(introButton,{attributes:true,attributeFilter:['disabled']});
  syncDevelopment();intro.hidden=true;
  const best = $('bestLine'); main.append(best);
  const controls = make('p', { className: 'home-controls' }, '<span class="home-controls-desktop"><kbd>W A S D</kbd> 移動　<kbd>マウス</kbd> 視点　<kbd>Space</kbd> ジャンプ</span><span class="home-controls-touch">左ドラッグで移動 · 右ドラッグで視点 · ボタンでジャンプ</span>');
  const trial = new URLSearchParams(location.search).get('cameraTrial');
  {
    const originalControls = controls.innerHTML;
    const syncTrialControls = () => {
      const automatic = window.skyFollowCamera?.mode === 'after';
      const fixed = automatic && ['fixed','hybrid'].includes(trial);
      controls.innerHTML = fixed ? '<span class="home-controls-desktop"><kbd>W A S D</kbd> 画面の方向へ移動　<kbd>Space</kbd> ジャンプ · 視点操作なし</span><span class="home-controls-touch">左スティックで画面の方向へ移動 · ボタンでジャンプ · 視点操作なし</span>' : originalControls;
      if (automatic && !fixed && window.skyFollowCamera.manualLook === false) controls.innerHTML = '<span class="home-controls-desktop">W/S：前後、A/D：旋回、Space：ジャンプ。カメラは自動。</span><span class="home-controls-touch">左側で移動 · ボタンでジャンプ · 視点は自動</span>';
      if(fixed&&trial==='hybrid')controls.append(document.createTextNode(' · 見通しが悪い区間だけカメラが切り替わります'));
    };
    new MutationObserver(syncTrialControls).observe(document.body, { attributes: true, attributeFilter: ['data-sky-camera-mode','data-sky-camera-look'] });
    syncTrialControls();
  }
  // What is sent is said on the home screen. Sending cannot be turned off.
  const notice = make('p', { id: 'homeSendNotice' });
  const syncNotice = () => {
    if (['hybrid','follow','follow-legacy'].includes(trial) || (trial && ['localhost', '127.0.0.1'].includes(location.hostname))) { notice.textContent = 'ローカル比較用の試作です。ランキング・プレイ記録は送信しません。'; return; }
    notice.textContent = 'ランキングのため、ニックネーム・スコア・プレイ記録（操作・国・端末環境）を匿名で送信します。';
  };
  syncNotice(); addEventListener('load', syncNotice); document.addEventListener('sky-difficulty-change', syncNotice);
  hero.append(heading, scene, main, controls, notice); plate.prepend(hero);
  const rankSlot = make('section', { id: 'homeRanking', ariaLabel: 'ランキング' });
  const more = make('details', { id: 'homeMore' });
  more.append(make('summary', {}, '開発者向け（?dev=1）'));
  const body = make('div', { className: 'homeMoreBody' }); more.append(body);
  const mainControls = new Set(main.children);
  const rotFlip = $('rotFlip'); plate.insertBefore(rankSlot, rotFlip || null); plate.insertBefore(development, rotFlip || null); plate.insertBefore(more, rotFlip || null);
  // The ranking module adds #titleRanking next to the (hidden) map switch, which sits in the fold: bring it out.
  const adoptRanking = () => { const box = $('titleRanking'); if (box && box.parentElement !== rankSlot) rankSlot.append(box); };
  const sweep = () => {
    for (const child of [...plate.children]) if (![hero, rankSlot, development, more, rotFlip].includes(child)) body.append(child);
    adoptRanking();
  };
  sweep(); new MutationObserver(sweep).observe(plate, { childList: true });
  new MutationObserver(adoptRanking).observe(body, { childList: true, subtree: true });
  // Ranking is an overlay (NIGHTLINE style): the lobby stays one screen; Esc / close / backdrop return to it.
  rankSlot.setAttribute('role', 'dialog'); rankSlot.setAttribute('aria-modal', 'true'); rankSlot.setAttribute('aria-label', 'ランキング'); rankSlot.hidden = true;
  const rankClose = make('button', { id: 'homeRankingClose', type: 'button', ariaLabel: 'ランキングを閉じる' }, '閉じる');
  rankSlot.prepend(make('div', { className: 'home-ranking-head' }, '<h2>ランキング</h2>'));
  rankSlot.querySelector('.home-ranking-head').append(rankClose);
  const openRanking = () => { rankSlot.hidden = false; rankButton.setAttribute('aria-expanded', 'true'); window.skyRanking?.refreshTitle?.(); rankClose.focus({ preventScroll: true }); };
  const closeRanking = () => { if (rankSlot.hidden) return; rankSlot.hidden = true; rankButton.setAttribute('aria-expanded', 'false'); rankButton.focus({ preventScroll: true }); };
  rankButton.addEventListener('click', openRanking); rankClose.addEventListener('click', closeRanking);
  rankSlot.addEventListener('click', event => { if (event.target === rankSlot) closeRanking(); });
  rankSlot.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); closeRanking(); return; }
    if (event.key !== 'Tab') return;
    const items = [...rankSlot.querySelectorAll('button:not([disabled]),select,a[href]')].filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  new MutationObserver(() => { if ($('ovStart')?.hidden) closeRanking(); }).observe($('ovStart'), { attributes: true, attributeFilter: ['hidden'] });
  // Spot/ranking modules insert beside bestLine after the lobby has loaded.
  const adoptExtras = () => {
    for (const child of [...main.children]) if (!mainControls.has(child)) body.append(child);
    adoptRanking();
  };
  adoptExtras(); new MutationObserver(adoptExtras).observe(main, { childList: true });
  function updateDifficulty() {
    for (const button of choices.children) {
      button.setAttribute('aria-pressed', String(button.dataset.difficulty === selector.value && !selector.disabled));
      button.disabled = selector.disabled;
    }
  }
  document.addEventListener('sky-difficulty-change', updateDifficulty);
  updateDifficulty();
  const fit = () => {
    hero.dataset.compact = String($('app').clientHeight < 500);
    hero.dataset.tiny = String($('app').clientHeight < 350);
    hero.dataset.narrow = String($('app').clientWidth < 620);
  };
  new ResizeObserver(fit).observe($('app')); fit();
  document.body.dataset.skyHomeFocus = 'true';
})();
