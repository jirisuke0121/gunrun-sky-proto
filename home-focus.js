// Home screen: first view = title, one-line goal, win/lose, controls, Start.
// Everything else (spots, practice, settings, ranking, long rules) moves into one folded section.
// This only re-parents existing elements, so ids, listeners and other scripts keep working.
(() => {
  const plate = document.querySelector('#ovStart .plate');
  if (!plate || document.getElementById('homeHero')) return;
  const $ = id => document.getElementById(id);
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});

  const hero = make('div', { id: 'homeHero' });
  const eyebrow = plate.querySelector(':scope > .eyebrow');
  const title = plate.querySelector(':scope > h1');
  const oldLede = plate.querySelector(':scope > .lede');
  if (eyebrow) hero.append(eyebrow);
  if (title) hero.append(title);
  hero.append(
    make('p', { className: 'homeGoal' }, '2分間、ゾンビから逃げ切れ。'),
    make('ul', { className: 'homeRules' }, [
      '<li><b>勝ち</b>2分間つかまらずに生き残る</li>',
      '<li><b>負け</b>ゾンビにつかまる／奈落に落ちると終了</li>',
      '<li><b>得点</b>近くの追手をしのいで加点。ダメージ・撃破でも得点</li>',
    ].join('')),
    make('p', { className: 'homeKeys homeKeysDesktop' },
      '<span class="keysAfter"><kbd>W</kbd><kbd>S</kbd> 前後　<kbd>A</kbd><kbd>D</kbd> 曲がる　</span>' +
      '<span class="keysBefore"><kbd>W A S D</kbd> 移動　</span>' +
      '<kbd>マウス</kbd> 見回す　<kbd>Space</kbd> ジャンプ　<kbd>Esc</kbd> 一時停止'),
  );
  const touchNote = $('touchNote');
  if (touchNote) touchNote.classList.add('homeKeysTouch');
  const retryButtons = [...plate.querySelectorAll(':scope > [data-retry-start]')];
  // Fixed order of the first view. Other scripts may prepend/insert around these later, so we re-apply it.
  const settingsButton = make('button', { id: 'homeSettings', type: 'button' }, '⚙ 設定（操作・感度・音量・画質）');
  settingsButton.addEventListener('click', () => $('bSettings')?.click());
  const heroOrder = () => [
    eyebrow, title, hero.querySelector('.homeGoal'), hero.querySelector('.homeRules'),
    hero.querySelector('.homeKeysDesktop'), touchNote, $('bStart'), $('startReadyStatus'),
    ...retryButtons, $('introEntry'), settingsButton, $('bestLine'),
  ].filter(Boolean);
  plate.prepend(hero);

  const more = make('details', { id: 'homeMore' });
  more.append(make('summary', {}, '練習・スポット選択・設定・ランキング・くわしいルール'));
  const body = make('div', { className: 'homeMoreBody' });
  more.append(body);
  const rotFlip = $('rotFlip');
  plate.insertBefore(more, rotFlip || null);

  // Move whatever is left (now and anything other scripts inject later) into the folded section.
  const heroObserver = new MutationObserver(() => arrangeHero());
  const arrangeHero = () => {
    heroObserver.disconnect();
    const keep = heroOrder();
    for (const child of [...hero.children]) if (!keep.includes(child)) body.append(child);
    keep.forEach((el, i) => { if (hero.children[i] !== el) hero.insertBefore(el, hero.children[i] || null); });
    heroObserver.observe(hero, { childList: true });
  };
  const sweep = () => {
    for (const child of [...plate.children]) {
      if (child === hero || child === more || child === rotFlip) continue;
      if (child.id === 'oldTownSwingPreview' || child.className === 'lede') { body.prepend(child); continue; }
      body.append(child);
    }
  };
  if (oldLede) oldLede.classList.add('homeOldLede');
  arrangeHero();
  sweep();
  new MutationObserver(sweep).observe(plate, { childList: true });
  document.body.dataset.skyHomeFocus = 'true';
})();
