// Keep the existing game controls and listeners; only arrange the lobby.
// 2026-11-21: the home is one full-screen picture (a chase over the rooftops) with the title, one line, the start button
// and the difficulty tabs at the bottom left; Tips, Ranking and Settings sit at the top right. Everything else is small
// (best score, credits, privacy, language) or lives elsewhere (nickname → ranking, key guide → Tips and Settings).
(() => {
  if (window.skyPracticeMode || new URLSearchParams(location.search).has('practice')) return;
  const plate = document.querySelector('#ovStart .plate');
  if (!plate || document.getElementById('homeHero')) return;
  const $ = id => document.getElementById(id);
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});
  const canyon = location.pathname.endsWith('canyon.html');
  const hero = make('div', { id: 'homeHero' });
  document.body.classList.add('sky-lobby');
  hero.dataset.map = canyon ? 'canyon' : 'old-town';

  // Background picture. 旧市街: four zombies reach from a high roof edge for a runner leaping out over the cloud sea toward
  // the castle (in-engine render of the current town, 2026-11-23; promo/README.md).
  const scene = make('div', { className: 'home-scene' });
  scene.setAttribute('aria-hidden', 'true');
  scene.style.backgroundImage = canyon ? `url('./assets/lobby/canyon.svg')` : `url('./assets/lobby/old-town-chase.webp')`;

  // Top right: Ranking and Settings only.
  const top = make('header', { className: 'home-top' });
  const actions = make('div', { className: 'home-heading-actions' });
  const rankButton = make('button', { id: 'homeRankingButton', type: 'button' }, 'ランキング');
  rankButton.setAttribute('aria-haspopup', 'dialog'); rankButton.setAttribute('aria-expanded', 'false');
  const settings = make('button', { id: 'homeSettings', type: 'button' }, '設定');
  settings.addEventListener('click', () => $('bSettings')?.click());
  actions.append(rankButton, settings); top.append(actions);

  // Bottom left: title, one line, start, difficulty, small links.
  const main = make('section', { className: 'home-play', ariaLabel: '逃走の準備' });
  const heading = make('header', { className: 'home-heading' }, '<h1>空中回廊<span>追跡</span></h1>');
  const copy = make('div', { className: 'home-scene-copy' }, '<h2>屋根を跳び、ゾンビから2分間逃げ切れ。</h2><p>跳ぶ。壁を走る。追跡を引き離す。</p>');
  const difficulty = make('div', { id: 'homeDifficulty' });
  const selector = $('challengeDifficulty'); selector.hidden = true;
  const choices = make('div', { className: 'home-difficulty-choices', role: 'group', ariaLabel: '難易度' });
  const details = make('p', { className: 'home-difficulty-detail' });
  const levels = window.skyChallenge.levels.filter(p => p.id !== 'legacy');
  for (const [index, p] of levels.entries()) {
    // The trial tier is a small muted tab after the three ranked ones: it is not part of the shared ranking.
    const button = p.trial
      ? make('button', { type: 'button', className: 'home-difficulty-trial' }, `<span>${p.name}</span><small>試作</small>`)
      : make('button', { type: 'button' }, `<span>${p.name}</span>`);
    button.dataset.difficulty = p.id;
    button.addEventListener('click', () => {
      if (selector.disabled || window.__game.mode !== 'menu') return;
      selector.value = p.id; selector.dispatchEvent(new Event('change', { bubbles: true }));
    }); choices.append(button);
    // One line per level, built once (so the translator sees static text) and shown for the selected level.
    const line = p.trial
      ? make('span', {}, '<span>俊足と重装が混ざる</span><span>ランキング対象外</span>')
      : make('span', {}, `<span>追手 最大${Math.max(...p.counts)}体</span><span>ライフ${p.lives}</span><span><em>スコア</em><b>×${(1 + .1 * index).toFixed(1)}</b></span>`);
    line.dataset.difficulty = p.id; line.hidden = true; details.append(line);
  }
  const bonus = $('challengeScoreBonus'); bonus.classList.add('home-sr-only');
  // 2026-11-23: the selected level's line and the best score share one row (the bottom-left block is five rows:
  // title, one line, start, difficulty, this row). Tips moved to the top right next to Ranking and Settings.
  const links = make('div', { className: 'home-links' });
  const meta = make('div', { className: 'home-meta' }); meta.append(details, links);
  difficulty.append(choices, meta, selector, bonus);
  const startButton = $('bStart');
  main.append(heading, copy, startButton, $('startReadyStatus'));
  for (const button of [...plate.querySelectorAll(':scope > [data-retry-start]')]) main.append(button);
  main.append(difficulty);
  const best = $('bestLine'); links.append(best);

  // Bottom right: key guide (PC), credits, privacy, language, and the developer tab (?dev=1).
  const foot = make('footer', { className: 'home-foot' });
  // Keep the unfinished guided course in the collapsed development tab on the home screen.
  // Players reach the course from the first-visit card (onboarding.js) and from コツ.
  // The tab is shown only in developer mode (?dev=1, home-focus.css). The credits link must stay visible to players
  // (CC BY attribution), so it lives in its own footer slot instead of inside the tab (credits.js).
  const development = make('details', { id: 'homeDevelopment' });
  const footer = make('div', { id: 'homeFooter' });
  if (new URLSearchParams(location.search).get('dev') === '1') development.dataset.devUrl = '1';
  development.append(make('summary', {}, '開発用'));
  const developmentButton = make('button', { id: 'bGuidedIntro', type: 'button' }, '入門モードで遊ぶ');
  development.append(developmentButton);
  const syncDevelopment = () => { developmentButton.disabled = startButton.disabled; };
  new MutationObserver(syncDevelopment).observe(startButton, { attributes: true, attributeFilter: ['disabled'] });
  syncDevelopment();
  const controls = make('p', { className: 'home-controls' }, '<span class="home-controls-desktop"><kbd>W A S D</kbd> 移動　<kbd>マウス</kbd> 視点　<kbd>Space</kbd> ジャンプ　<kbd>Q</kbd>/<kbd>右クリック</kbd> 技（フック・爆破）　<kbd>E</kbd> スライド</span><span class="home-controls-touch">左ドラッグで移動 · 右ドラッグで視点 · ボタンでジャンプ</span>');
  const trial = new URLSearchParams(location.search).get('cameraTrial');
  {
    const originalControls = controls.innerHTML;
    const syncTrialControls = () => {
      const automatic = window.skyFollowCamera?.mode === 'after';
      const fixed = automatic && trial === 'fixed';
      controls.innerHTML = fixed ? '<span class="home-controls-desktop"><kbd>W A S D</kbd> 画面の方向へ移動　<kbd>Space</kbd> ジャンプ · 視点操作なし</span><span class="home-controls-touch">左スティックで画面の方向へ移動 · ボタンでジャンプ · 視点操作なし</span>' : originalControls;
      if (automatic && !fixed && window.skyFollowCamera.manualLook === false) controls.innerHTML = '<span class="home-controls-desktop">W/S：前後、A/D：旋回、Space：ジャンプ。カメラは自動。</span><span class="home-controls-touch">左側で移動 · ボタンでジャンプ · 視点は自動</span>';
    };
    new MutationObserver(syncTrialControls).observe(document.body, { attributes: true, attributeFilter: ['data-sky-camera-mode','data-sky-camera-look'] });
    syncTrialControls();
  }
  const footLinks = make('div', { className: 'home-foot-links' });
  footLinks.append(footer);
  if ($('langToggle')) footLinks.append($('langToggle'));
  foot.append(controls, footLinks, development);
  // Sending is always on and needs no notice. Only the comparison trials, which send nothing, say so.
  const notSent = ['follow','follow-legacy','follow-turn'].includes(trial) || (trial && ['localhost', '127.0.0.1'].includes(location.hostname));
  if (notSent) {
    const notice = make('p', { id: 'homeSendNotice' });
    notice.textContent = 'ローカル比較用の試作です。ランキング・プレイ記録は送信しません。';
    main.append(notice);
  }
  hero.append(scene, top, main, foot);
  plate.prepend(hero);

  // Ranking overlay (NIGHTLINE style); the nickname is edited from its header, next to the board it appears on.
  const rankSlot = make('section', { id: 'homeRanking', ariaLabel: 'ランキング' });
  const more = make('details', { id: 'homeMore' });
  more.append(make('summary', {}, '開発者向け（?dev=1）'));
  const body = make('div', { className: 'homeMoreBody' }); more.append(body);
  const mainControls = new Set(main.children), linkControls = new Set(links.children);
  const rotFlip = $('rotFlip'); plate.insertBefore(rankSlot, rotFlip || null); plate.insertBefore(more, rotFlip || null);
  // The ranking module adds #titleRanking next to the (hidden) map switch, which sits in the fold: bring it out.
  const adoptRanking = () => { const box = $('titleRanking'); if (box && box.parentElement !== rankSlot) rankSlot.append(box); };
  const sweep = () => {
    for (const child of [...plate.children]) if (![hero, rankSlot, more, rotFlip].includes(child)) body.append(child);
    adoptRanking();
  };
  sweep(); new MutationObserver(sweep).observe(plate, { childList: true });
  new MutationObserver(adoptRanking).observe(body, { childList: true, subtree: true });
  rankSlot.setAttribute('role', 'dialog'); rankSlot.setAttribute('aria-modal', 'true'); rankSlot.setAttribute('aria-label', 'ランキング'); rankSlot.hidden = true;
  const rankClose = make('button', { id: 'homeRankingClose', type: 'button', ariaLabel: 'ランキングを閉じる' }, '閉じる');
  const rankHead = make('div', { className: 'home-ranking-head' }, '<h2>ランキング</h2>');
  // Nickname chip (like NIGHTLINE's racer chip): the name is visible beside the board and one tap edits it.
  const nameChip = make('button', { id: 'homeName', type: 'button' });
  const syncName = () => {
    const name = window.skyOnboarding?.name?.() || '';
    nameChip.innerHTML = name ? `<small>ニックネーム</small><b></b><i aria-hidden="true">✎</i>` : '<b><span class="home-name-long">ニックネームを決める</span><span class="home-name-short">ニックネーム</span></b><i aria-hidden="true">✎</i>';
    if (name) nameChip.querySelector('b').textContent = name;
    nameChip.setAttribute('aria-label', name ? `ニックネーム ${name}（変更する）` : 'ニックネームを決める');
  };
  nameChip.addEventListener('click', () => window.skyOnboarding?.open('name'));
  document.addEventListener('sky-name-change', syncName); syncName(); addEventListener('load', syncName);
  const rankTools = make('div', { className: 'home-ranking-tools' }); rankTools.append(nameChip, rankClose);
  rankHead.append(rankTools); rankSlot.prepend(rankHead);
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
  // The nickname dialog opens above the ranking; returning from it keeps the ranking open.
  new MutationObserver(() => { if ($('ovStart')?.hidden) closeRanking(); }).observe($('ovStart'), { attributes: true, attributeFilter: ['hidden'] });
  // Spot/ranking modules insert beside bestLine after the lobby has loaded.
  const adoptExtras = () => {
    for (const child of [...main.children]) if (!mainControls.has(child)) body.append(child);
    for (const child of [...links.children]) if (!linkControls.has(child) && child.id !== 'homeGuide') body.append(child);
    adoptRanking();
  };
  adoptExtras(); new MutationObserver(adoptExtras).observe(main, { childList: true }); new MutationObserver(adoptExtras).observe(links, { childList: true });
  function updateDifficulty() {
    for (const button of choices.children) {
      button.setAttribute('aria-pressed', String(button.dataset.difficulty === selector.value && !selector.disabled));
      button.disabled = selector.disabled;
    }
    for (const line of details.children) line.hidden = line.dataset.difficulty !== selector.value;
  }
  document.addEventListener('sky-difficulty-change', updateDifficulty);
  selector.addEventListener('change', updateDifficulty);
  updateDifficulty();
  const fit = () => {
    hero.dataset.compact = String($('app').clientHeight < 500);
    hero.dataset.tiny = String($('app').clientHeight < 350);
    hero.dataset.narrow = String($('app').clientWidth < 620);
  };
  new ResizeObserver(fit).observe($('app')); fit();
  document.body.dataset.skyHomeFocus = 'true';
})();
