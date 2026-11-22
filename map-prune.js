// マップのノイズ撤去（旧市街、2026-11-22）。docs/MAP_NOISE_2026-11-22.md
// 「その物があることで次の行動が広がるか」で見直した。広がらない物＝ぶつかって避ける・乗り越えるだけ・乗っても先がない物を消す。
//   * 低い柵・低い梁（高さ約1 m）：乗り越えるだけで、越えた先は同じ床。
//   * 屋上の箱（高さ2〜2.2 m）：登れるが、上から届く先が屋上から届く先と同じ（より高い足場が近くにない）。
//   * 袋・土のう・ぽつんと置かれた木箱：走る流れを止めるだけ。
// 残したもの：上の段へ上がる足がかりになる箱（木箱の段・黄色い木箱）、階段、仕掛けの土台、マップの外へ落ちるのを防ぐ手すり。
// 判定は足場の高さの地図から機械的に出し（周りの床より高い物について、上から届く「床からは届かない高さの足場」があるか）、最後は場所ごとに目で確かめた。
// ?prune=0 で撤去前のマップ。
(() => {
  const OFF = new URLSearchParams(location.search).get('prune') === '0';
  // [種類, minX, minY, minZ, maxX, maxY, maxZ, 理由]
  const REMOVE = [
    // 中央屋上（高さ8 m）
    ['beam', -10, 8, 5.5, -3, 9.1, 6.5, '低い梁：乗り越えるだけ'],
    ['beam', 3.5, 8, 4, 4.5, 9.1, 11, '低い梁：乗り越えるだけ'],
    ['beam', -6.5, 8, -13, -5.5, 9.1, -11, '低い梁：乗り越えるだけ'],
    ['beam', -6, 8, -10, -5, 9, -2, '低い梁：乗り越えるだけ'],
    ['slab', 5, 8, -3, 9, 10.2, 1, '屋上の箱：登っても先がない'],
    ['slab', -12, 8, -12, -9, 10.2, -8.5, '屋上の箱：登っても先がない'],
    // 北の箱（x 2〜7、z -12〜-7、高さ2 m）は残す：開始位置 north-mid (5, 8, -13) の南をふさいでいて、外すと最初の追手が
    // 約2.5秒早く着く（ハード 6.5〜7.8秒 → 4.6〜5.2秒、中央値4.7秒で開始位置の基準「中央値5秒以上」を割る。実測）。
    ['prop', -8.5, 8, 4.1, -7.5, 9, 5.1, '木箱：避けるだけ'], ['prop', -8.4, 9, 4.1, -7.6, 9.8, 4.9, '木箱（上段）：避けるだけ'],
    ['prop', 7.5, 8, 5.5, 8.5, 9, 6.5, '木箱：避けるだけ'], ['prop', 8.525, 8, 6.6, 9.275, 8.4, 7.2, '袋：つまずくだけ'], ['prop', -4.375, 8, 5.7, -3.625, 8.4, 6.3, '袋：つまずくだけ'],
    // 通り・ほかの屋根
    ['prop', -45.975, 0, 10, -45.225, .4, 10.6, '袋：つまずくだけ'], ['prop', -23.375, 0, 13.1, -22.625, .4, 13.7, '袋：つまずくだけ'],
    ['prop', -23.975, 0, 12.3, -23.225, .4, 12.9, '袋：つまずくだけ'], ['prop', -24.575, 0, 13.6, -23.825, .4, 14.2, '袋：つまずくだけ'],
    ['prop', 39.625, 0, 12.7, 40.375, .4, 13.3, '袋：つまずくだけ'], ['prop', 44.325, 4.4, 7.3, 45.075, 4.8, 7.9, '袋：つまずくだけ'],
    ['prop', -31.3, 0, -5.1, -30.7, .8, -2.1, '土のう：乗り越えるだけ'], ['prop', 36, 0, 4.9, 39, .8, 5.5, '土のう：乗り越えるだけ'],
    ['prop', -26.5, 0, -3.5, -25.5, 1, -2.5, '木箱：避けるだけ'], ['prop', -23.5, 0, 6, -22.5, 1, 7, '木箱：避けるだけ'], ['prop', 43.5, 4.4, 6.5, 44.5, 5.4, 7.5, '木箱：避けるだけ'],
  ];
  // 残す柵（2026-11-22 追記）。8本とも外すと、開始位置の基準（最初の追手が触れるまで4.5秒以上、docs/START_SPOTS_2026-11-05.md）を
  // ハードの north-roof が割る（乱数16通りで 4.2秒が1回。外す前は最短5.2秒）。効いているのはこの2本（実測、docs/MAP_LINKS_2026-11-22.md）:
  //   west-north（西の縁の帯、z -2.5）… north-roof (-13, 8, -13) へ西の縁を北上してくる追手を遅らせる。
  //   north-east（北の縁の帯、x 3.5）… north-mid (5, 8, -13) へ北の縁を東へ来る追手を遅らせる。
  const KEEP_RAILS = ['west-north', 'north-east'];
  const near = (a, b) => Math.abs(a - b) < .03;
  function build({ jn }) {
    if (OFF) return null;
    const removed = [], missing = [];
    for (const [type, x0, y0, z0, x1, y1, z1, why] of REMOVE) {
      const i = jn.findIndex(b => b.type === type && near(b.minX, x0) && near(b.minY, y0) && near(b.minZ, z0) && near(b.maxX, x1) && near(b.maxY, y1) && near(b.maxZ, z1));
      if (i < 0) { missing.push([type, x0, y0, z0, x1, y1, z1]); continue; }
      jn.splice(i, 1); removed.push(why);
    }
    // 中央屋上の柵（roof-trenches.js の RAILS、高さ1 m）：乗り越えるだけ。開始位置を守る2本（KEEP_RAILS）だけ残す。
    let rails = 0;
    for (let i = jn.length - 1; i >= 0; i--) if (jn[i].roofRail && !KEEP_RAILS.includes(jn[i].roofRail)) { jn.splice(i, 1); rails++; }
    const result = { removed: removed.length, rails, keptRails: KEEP_RAILS.slice(), missing };
    window.SKY_MAP_PRUNE = result;
    if (missing.length) console.warn('map prune: not found', JSON.stringify(missing));
    return result;
  }
  window.SKY_MAP_PRUNE = OFF ? { removed: 0, rails: 0, missing: [], off: true } : null;
  window.buildMapPrune = build;
})();
