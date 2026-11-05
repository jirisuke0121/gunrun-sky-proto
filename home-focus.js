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
  actions.prepend(rankButton); heading.append(actions);
  const scene = make('section', { className: 'home-scene', ariaLabel: canyon ? '岩壁渓谷のゲーム風景' : '旧市街のゲーム風景' }, `<div class="home-scene-copy"><span class="home-map">${canyon ? '岩壁渓谷' : '旧市街'}</span><h2>2分間、<br>逃げ切れ。</h2><p>跳ぶ。壁を走る。追跡を引き離す。</p></div>`);
  scene.style.backgroundImage = `linear-gradient(0deg,#0c1219f5 0%,#0c12191a 85%),url('./assets/lobby/${canyon ? 'canyon' : 'old-town'}.svg')`;
  const main = make('section', { className: 'home-play', ariaLabel: '逃走の準備' });
  const difficulty = make('div', { id: 'homeDifficulty' }, '<div class="home-difficulty-heading"><h2>難易度を選ぶ</h2><span>数字は得点の倍率</span></div>');
  const selector = $('challengeDifficulty'); selector.hidden = true;
  const choices = make('div', { className: 'home-difficulty-choices', role: 'group', ariaLabel: '難易度' });
  const levels = window.skyChallenge.levels.filter(p => p.id !== 'legacy');
  for (const [index, p] of levels.entries()) {
    const button = make('button', { type: 'button' }, `<span>${p.name}</span><strong>×${(1 + .1 * index).toFixed(1)}</strong><small><span>追手 最大${Math.max(...p.counts)}体</span><span>ライフ${p.lives}</span></small>`);
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
  main.append(intro);
  const best = $('bestLine'); main.append(best);
  const controls = make('p', { className: 'home-controls' }, '<span class="home-controls-desktop"><kbd>W A S D</kbd> 移動　<kbd>マウス</kbd> 視点　<kbd>Space</kbd> ジャンプ</span><span class="home-controls-touch">左ドラッグで移動 · 右ドラッグで視点 · ボタンでジャンプ</span>');
  hero.append(heading, scene, main, controls); plate.prepend(hero);
  const rankSlot = make('section', { id: 'homeRanking', ariaLabel: 'ランキング' });
  const more = make('details', { id: 'homeMore' });
  more.append(make('summary', {}, '練習・スポット・ルール'));
  const body = make('div', { className: 'homeMoreBody' }); more.append(body);
  const mainControls = new Set(main.children);
  const rotFlip = $('rotFlip'); plate.insertBefore(rankSlot, rotFlip || null); plate.insertBefore(more, rotFlip || null);
  // The ranking module adds #titleRanking next to the (hidden) map switch, which sits in the fold: bring it out.
  const adoptRanking = () => { const box = $('titleRanking'); if (box && box.parentElement !== rankSlot) rankSlot.append(box); };
  const sweep = () => {
    for (const child of [...plate.children]) if (![hero, rankSlot, more, rotFlip].includes(child)) body.append(child);
    adoptRanking();
  };
  sweep(); new MutationObserver(sweep).observe(plate, { childList: true });
  new MutationObserver(adoptRanking).observe(body, { childList: true, subtree: true });
  rankButton.addEventListener('click', () => {
    rankSlot.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
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
