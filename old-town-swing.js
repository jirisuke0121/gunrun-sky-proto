// Optional old-town prototype. The normal map keeps its original geometry.
(() => {
  if (new URLSearchParams(location.search).get('oldtown_swing') !== '1') return;
  window.skyOldTownSwingPreview = true;
  window.buildOldTownSwingCourse = ({ ne }) => {
    const box = (id, a, b, type = 'slab') => {
      const solid = ne(...a, ...b, type);
      solid.oldTownSwing = id;
      solid.tint = id.includes('step') || id === 'launch-pad' ? 0xe39a4a : 0x8ea4bd;
      return solid;
    };
    // The existing wall-jump landing beam is x -22..-14, z 15.2..16.8.
    // Branch north of it, beyond the original landing, rather than intercepting
    // the jump or narrowing the existing way west.
    box('recovery-floor', [-25.2, -2.6, 11.8], [-20, 0, 15.2]);
    box('entry-step-1', [-22, 0, 14.8], [-20, .4, 15.2]);
    box('entry-step-2', [-22, 0, 14.4], [-20, .8, 14.8]);
    box('launch-pad', [-22, 0, 12.5], [-20, 1.2, 14.4]);
    const bar = { id: 'oldtown-west-bar-1', at: [-22.7, 4.1, 14], direction: [-1, 0], width: 2.6,
      label: 'SWING > ROOF' };
    for (const side of [-1, 1]) box('bar-post-' + side,
      [bar.at[0] - .07, 0, bar.at[2] + side * 1.45 - .07],
      [bar.at[0] + .07, bar.at[1] + .06, bar.at[2] + side * 1.45 + .07], 'beam');
    // Land on the existing 2.8 m roof (x -32..-25, z 12..18). The west
    // stepping stone and the north street remain the two onward choices.
    window.skyOldTownSwingCourse = {
      id: 'oldtown-west-swing-1', oldTown: true, name: '旧市街・西の鉄棒分岐',
      approach: [-14.36, 0, 2.5], approachYaw: Math.PI,
      pad: [-20.8, 1.2, 14], bars: [bar], exit: [-28, 2.8, 14],
      exitBounds: [-32, -25, 12, 18],
      signs: [
        { text: '鉄棒 > 西の屋根', at: [-20.6, 2.25, 14.5], scale: .65 },
        { text: '西：次の屋根 / 北：路地', at: [-28.5, 4.25, 12.5], scale: .8 },
      ],
      arrows: [
        { at: [-19.8, .025, 16], direction: [-1, 0] },
        { at: [-21, .425, 15], direction: [0, -1] },
        { at: [-20.8, 1.225, 14], direction: [-1, 0] },
        { at: [-28, 2.825, 14], direction: [-1, 0] },
        { at: [-29.5, 2.825, 13], direction: [0, -1] },
      ],
      instructions: '⑤の壁走りジャンプで着地したら橙色の小足場へ。鉄棒へ跳び、前へ振れたらジャンプを押し直して西の屋根へ。屋根から西の足場か北の路地へ抜けられます。',
    };
  };

  addEventListener('load', () => {
    const game = window.__game, sky = window.__skyInternals;
    if (!game || !sky || !window.skyOldTownSwingCourse) return;
    const card = document.createElement('section'); card.id = 'oldTownSwingPreview';
    card.style.cssText = 'margin:0 0 16px;padding:12px;border:1px solid #ffb647;border-radius:10px;background:#2c3028;color:#fff4df';
    const title = document.createElement('strong'); title.textContent = '旧市街・鉄棒① 試作';
    const note = document.createElement('p');
    note.textContent = '壁走り→壁ジャンプ→着地→鉄棒1本→西の屋根。通常ルートも通れます。この試作は記録を送信しません。';
    note.style.cssText = 'font-size:13px;line-height:1.6;margin:8px 0';
    const start = document.createElement('button'); start.textContent = '⑤の入口から試す';
    start.type = 'button';
    start.addEventListener('click', () => {
      game.startGame();
      game.placeAt({ x: -14.36, y: 0, z: 2.5, yaw: Math.PI });
      sky.z.safeT = 5;
    });
    const normal = document.createElement('a'); normal.href = './index.html';
    normal.textContent = '通常の旧市街へ'; normal.style.cssText = 'margin-left:12px;color:#ffe0a0';
    card.append(title, note, start, normal);
    const home = document.getElementById('ovStart')?.querySelector('.plate') || document.getElementById('ovStart');
    home?.prepend(card);
    const recording = document.getElementById('recNote');
    if (recording) recording.textContent = '鉄棒①の試作中：プレイの記録は送信しません。';
  });
})();
