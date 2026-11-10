// 戻り道（旧市街、2026-11-10）。足場グラフの診断で見つかった「片寄り」を2か所だけ直す。
//
// 1) 西 → 中央（南西の角）: 高所のまま中央へ戻る道が、西の櫓（7 m）経由の1本しかなかった。
//    南西の4.2 mデッキ（鉄棒⑤の着地先）を壁ぎわで北へ2 m広げ、中央ブロックの西面に窓を開ける。
//    デッキ → 窓 → 屋内の上段回廊（南の通路）を東へ走り抜ける → 南の踊り場 → 階段で屋上。
//    窓は通路の突き当たりなので、入ってから曲がらずに走れる。デッキは既存の高さで、下からは登れない。
// 2) 東端: 東端デッキ（3.6 m）の出口が、来た長い階段（約11 m登り返す）しかなかった。
//    西の3 mの台を東へ2 m張り出し、デッキ → 3.5 m跳ぶ → 台 → 南の4.4 mの屋根、と戻れるようにする。
//    （実測: 走りジャンプは約4.3 m飛ぶ。途中に小さな柱を置くと飛び越してしまうので、着地側を伸ばした。）
//    張り出しは低い通路（-1 m）から4 m。下からは登れない。
// どちらもゾンビは跳ばない場所（跳ぶのは西の街区だけ）。ゾンビは階段と登りで回り込むので、人間が差を付けられる。
(() => {
  const WINDOW = { minX: -14, maxX: -13, minZ: 11.1, maxZ: 12.9, minY: 4, maxY: 7.2 };
  // 幅は2 mまで。これより西へ広げると、西の路地の壁ジャンプ（-14, 6.8 から南へ）の軌道に当たる。
  const DECK = { minX: -16, maxX: -14, minZ: 11, maxZ: 13, y: 4.2 };
  const FILL = { minX: -15.2, maxX: -14, minZ: 13, maxZ: 16.3, y: 4.2 }; // 既存のデッキと壁の間のすき間をふさぐ
  const LIP = { minX: 46, maxX: 48, minZ: .9, maxZ: 3, y: 3 };
  const TINT = { deck: 0x8ea4bd, frame: 0xf0c53c };

  function build({ ne, jn }) {
    const tunnel = window.skyTowerTunnel;
    if (!tunnel) return null;
    // 1) 窓: 西の外壁（塊）を、窓の形だけ抜く。上の 0.4 m（屋根の下）と左右の壁は残る。
    const cut = tunnel.cut(jn, WINDOW, b => b.type === 'mono' && !b.hidden && !b.tunnel && b.minX <= -13.99 && b.maxX <= -12.99 && b.minZ >= 9.5);
    // 抜いた下の壁の天面（4.0 m）は塊なので、歩ける床を1枚張る（屋内の床と同じ高さ）。
    const sill = ne(WINDOW.minX, 3.8, WINDOW.minZ, WINDOW.maxX, 4, WINDOW.maxZ, 'slab'); sill.returnLink = 'window-sill';
    const deck = ne(DECK.minX, DECK.y - .3, DECK.minZ, DECK.maxX, DECK.y, DECK.maxZ, 'beam');
    deck.tint = TINT.deck; deck.returnLink = 'deck';
    const fill = ne(FILL.minX, FILL.y - .3, FILL.minZ, FILL.maxX, FILL.y, FILL.maxZ, 'beam');
    fill.tint = TINT.deck; fill.returnLink = 'deck-fill';
    // 窓枠の目印（当たり判定は細い柱だけ。窓の外側に付け、開口は狭めない）。
    for (const z of [WINDOW.minZ - .12, WINDOW.maxZ]) {
      const post = ne(-14.12, DECK.y, z, -14, WINDOW.maxY, z + .12, 'beam'); post.tint = TINT.frame; post.returnLink = 'frame';
    }
    // 2) 東端の張り出し。
    const lip = ne(LIP.minX, LIP.y - .25, LIP.minZ, LIP.maxX, LIP.y, LIP.maxZ, 'slab');
    lip.tint = TINT.deck; lip.returnLink = 'east-lip';
    return { cut };
  }

  window.SKY_RETURN_LINKS = { WINDOW, DECK, LIP };
  window.buildReturnLinks = build;
})();
