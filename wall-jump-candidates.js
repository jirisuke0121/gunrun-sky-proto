// Old town: walls where a jump out of a wall run is worth enabling (2026-10-27).
// Design aid for hook-editor.html only; the game does not read this file.
//
// How the list was made: every wall-run wall (type "mono") was run in the game's own
// movement code. The player sprints at the wall, wall-runs, and jumps at different moments.
// The landing was matched to the zombie path graph and compared with the walking route
// between the same two points. "green" = the jump saves a long detour and was reproduced
// with a safe landing; "red" = checked and not recommended, with the reason.
//
// Fields: label, status ('ok' | 'ng'), title, reason,
//   at     marker position on the wall face [x, y, z] (y = player's feet height at take-off),
//   normal outward direction of the face [nx, nz] (green only; same shape as a wall-jump point),
//   span   optional [from, to] segment showing the wall that is run along,
//   path   optional run -> take-off -> landing polyline (green only),
//   also   optional extra marker positions for the same verdict.
// Coordinates are Three.js (x east, y up, z south), same as the editor.
window.skyWallJumpCandidates = [
  {
    label: '①', status: 'ok', title: '東の隙間（222番ブロックの南面）',
    reason: '東へ壁走り→x24〜31でジャンプ。隙間の先へ渡れる。壁走りだけでも先の地面（x33）に着き、ジャンプなら高い足場（x35）へ上がれる。歩くと約100mの回り込み、ここは約18m。',
    at: [26, 1.9, -1.5], normal: [0, 1],
    span: [[17, 1.5, -1.5], [35, 1.5, -1.5]],
    path: [[18.4, 0.7, -1.5], [26, 1.9, -1.5], [35.7, 1.6, 2.5]],
  },
  {
    label: '②', status: 'ok', title: '北の梁（345番の南面）',
    reason: '東へ壁走り→x28〜31でジャンプ。柱の先（x39）まで届く。x33より後ろでジャンプすると落下。西向きは壁走りだけで反対側へ渡れる。歩くと約50m、ここは約17m。',
    at: [29.6, 1.9, -25.2], normal: [0, 1],
    span: [[23, 1.5, -25.2], [36, 1.5, -25.2]],
    path: [[24.9, 0.8, -25.2], [29.6, 1.9, -25.2], [39.2, 0, -20.8]],
  },
  {
    label: '③', status: 'ok', title: 'リング東壁（南向き）',
    reason: '南へ壁走り→z5〜9でジャンプ。外側の南広場（x18, z16）へ出る。z11より後ろでは落下。歩くと約55m、ここは約18m。既存の地点（z9.8、高さ2.8m）は壁走り中の高さと1.5m以上ずれるため、この経路では働かない。',
    at: [14, 1.4, 6.8], normal: [1, 0],
    span: [[14, 1.5, 1.5], [14, 1.5, 14]],
    path: [[14, 1.2, 1.7], [14, 1.4, 6.8], [18.2, 0, 15.4]],
  },
  {
    label: '④', status: 'ok', title: 'リング西壁（北向き）',
    reason: '北へ壁走り→壁の北端（z-13〜-14）でジャンプ。穴を越えて北西（x-18, z-23）へ。早すぎても遅すぎても落下する上級者向け。歩くと約61m、ここは約28m。',
    at: [-14, 0.3, -13.6], normal: [-1, 0],
    span: [[-14, 1.5, -1.5], [-14, 1.5, -14]],
    path: [[-14, 1.2, -1.7], [-14, 0.3, -13.6], [-18, 0, -23.1]],
  },
  {
    label: '×1', status: 'ng', title: 'リング内側の通路',
    reason: '通路の幅が2m。壁走りはできるが、歩いても同じ距離で短縮にならない（最大でも-1m）。',
    at: [-11, 4, 0], also: [[11, 4, 0], [0, 4, -11], [0, 4, 11]],
  },
  {
    label: '×2', status: 'ng', title: 'リング外側の南面',
    reason: '歩いても同じ距離で、短縮は0〜2m。',
    at: [-7, 4, 14], also: [[7, 4, 14]],
  },
  {
    label: '×3', status: 'ng', title: 'リング外側の北面',
    reason: '壁の手前に歩ける足場がなく、助走できない。',
    at: [-7, 4, -14], also: [[7, 4, -14]],
  },
  {
    label: '×4', status: 'ng', title: '222番ブロックの北面',
    reason: '隣の鉄骨通路を歩くほうが速く、短縮にならない（-4m）。',
    at: [26, 4, -6],
  },
  {
    label: '×5', status: 'ng', title: '222番ブロックの短い壁（東西面）',
    reason: '壁が4.5mしかなく、短縮は1〜2m。',
    at: [17, 4, -3.75], also: [[35, 4, -3.75]],
  },
  {
    label: '×6', status: 'ng', title: '東の塔（257番）',
    reason: '壁が6mで、短縮は最大で約9m。効果が小さい。',
    at: [40, 7, -9], also: [[46, 7, -9], [43, 7, -6], [43, 7, -12]],
  },
  {
    label: '×7', status: 'ng', title: '小さな柱・塔（227・228番、スタート脇の塔）',
    reason: '壁が3〜4mしかなく、壁走りが続かない。',
    at: [-1, 2, -25.2], also: [[7.75, 2, -25.2], [-41, 5, 11.5]],
  },
  {
    label: '×8', status: 'ng', title: '孤立した壁（339番）',
    reason: '壁の前に歩ける足場がなく、助走できない。',
    at: [-34, 6, -17.5], also: [[-34, 6, -19]],
  },
];
