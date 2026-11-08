// 塔のトンネル: 屋内通路を残したまま掘れていること、滑り台・U字・出口の幾何、打ち上げの数値を確かめる。
// 塔まわりの元の箱（tools/admin/maps.json 由来）を固定値で持ち、index.html の hd() をそのまま使って掘る。
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const hdSource = html.slice(html.indexOf('function hd('), html.indexOf('function gs('));
assert.ok(hdSource.includes('slideSlope'), 'index.html から hd() を取り出せること');

const baseline = [
  ['mono', -11, 11, 0, 8, -11, 11], ['slab', -14, 14, 7.6, 8, -14, 14], ['slab', -22, 22, -2.6, 0, -22, 22],
  ['mono', 13, 14, 0, 8, -14, -5], ['mono', 13, 14, 2.5, 8, -5, -2.4], ['mono', 13, 14, 0, 8, -2.4, -1.5],
  ['slab', 11, 13, 3.6, 4, -11, 11], ['slab', -13, -11, 3.6, 4, -11, 11], ['slab', 11, 13, 3.6, 4, -13, -11],
  ['beam', 11, 13, 2.5, 3.6, -7.5, -6.5], ['beam', 11, 13, 6.5, 7.6, -7.5, -6.5], ['beam', 11, 13, 6.5, 7.6, 6.5, 7.5],
  ['beam', 2, 7, 8, 10, -12, -7], ['beam', -6, -5, 8, 9, -10, -2], ['beam', -12, -9, 8, 10.2, -12, -8.5],
  ['mono', 13, 14, 3.2, 8, -1.5, -.65],
];
function world() {
  const jn = [], Ja = [];
  const ne = (a, b, c, d, e, f, type) => { const box = { minX: Math.min(a, d), minY: Math.min(b, e), minZ: Math.min(c, f), maxX: Math.max(a, d), maxY: Math.max(b, e), maxZ: Math.max(c, f), type, solid: true, q: 0 }; jn.push(box); return box; };
  for (const [type, x0, x1, y0, y1, z0, z1] of baseline) ne(x0, y0, z0, x1, y1, z1, type);
  const sandbox = { Math, ne, Ja };
  const hd = vm.runInNewContext(`(${hdSource.replace('function hd(', 'function(')})`, sandbox);
  return { jn, Ja, ne, hd };
}
const env = { window: {}, addEventListener() {}, Math };
vm.runInNewContext(fs.readFileSync('tower-tunnel.js', 'utf8'), env);
const tunnel = env.window.skyTowerTunnel, T = tunnel.T;
assert.ok(tunnel && typeof env.window.buildTowerTunnel === 'function');

const overlap = (b, v) => Math.min(b.maxX, v.maxX) - Math.max(b.minX, v.minX) > 1e-6 && Math.min(b.maxY, v.maxY) - Math.max(b.minY, v.minY) > 1e-6 &&
  Math.min(b.maxZ, v.maxZ) - Math.max(b.minZ, v.minZ) > 1e-6;
const volume = (jn, pick, clip) => jn.filter(pick).reduce((sum, b) => {
  const x = Math.min(b.maxX, clip.maxX) - Math.max(b.minX, clip.minX), y = Math.min(b.maxY, clip.maxY) - Math.max(b.minY, clip.minY), z = Math.min(b.maxZ, clip.maxZ) - Math.max(b.minZ, clip.minZ);
  return sum + (x > 0 && y > 0 && z > 0 ? x * y * z : 0);
}, 0);

// --- 入口の許容: 長い斜面（z -8.7〜-7.3、中心 -8.0）の左右 0.5 m ずれても、体（半径0.32）が坑の壁に当たらない ---
const RAMP_CENTER = -8, BODY = .32;
assert.ok(T.Z1 - BODY - RAMP_CENTER >= .55 && RAMP_CENTER - (T.Z0 + BODY) >= .55, `斜面の中心から左右0.55 m以上は体が通れる: 右${(T.Z1 - BODY - RAMP_CENTER).toFixed(2)} 左${(RAMP_CENTER - T.Z0 - BODY).toFixed(2)}`);
assert.ok(T.Z1 - T.Z0 >= 2.4 && T.Z1 <= -7.05, '帯の幅は2.4 m以上。右端は屋上の『ドカン』（z -6.5）に触れない');

// --- 打ち上げの数値 ---
const flight = tunnel.flight(20);
assert.ok(flight.apex >= 22 && flight.apex <= 24, '頂点は約23 m: ' + flight.apex);
assert.ok(flight.above20 >= 1, '20 m以上に1秒以上いる（マップ全体が見渡せる）: ' + flight.above20.toFixed(2));
assert.ok(Math.abs(Math.hypot(flight.v.x, flight.v.y) - T.EXIT_SPEED) < 1e-6);
assert.ok(flight.v.x <= -5, '西へ流れる速度がある（5 m/s以上）: ' + flight.v.x.toFixed(2));
// 着地は西の広場の床（x -22〜-14, z -8〜8, y=0）の内側。入った位置が帯の北端でも南端でも。
for (const z0 of [T.Z0 + .4, (T.Z0 + T.Z1) / 2, T.Z1 - .4]) {
  const x = flight.landX, z = z0 + flight.landZ;
  assert.ok(x < -15.5 && x > -20.5 && z > -7.5 && z < 7.5, `着地は広場の床の内側: (${x.toFixed(2)}, ${z.toFixed(2)})`);
}
// 打ち上げから着地まで、小屋・壁・塔の西壁に当たらない（出口を出た直後は穴のまわりの箱も含めて確かめる）。
const hut = { minX: -12, maxX: -9, minY: 8, maxY: 10.2, minZ: -12, maxZ: -8.5 }, wall = { minX: -6, maxX: -5, minY: 8, maxY: 9, minZ: -10, maxZ: -2 },
  west = { minX: -14, maxX: -13, minY: 0, maxY: 8, minZ: -14, maxZ: -1.5 };
for (const z0 of [T.Z0 + .4, T.Z1 - .4]) for (let t = 0; t < flight.landT - .05; t += .005) {
  const y = T.LIP_Y + .05 + flight.v.y * t - 10 * t * t, x = T.LIP_X + flight.v.x * t, z = z0 + flight.v.z * t;
  const p = { minX: x - .32, maxX: x + .32, minY: y, maxY: y + 1.75, minZ: z - .32, maxZ: z + .32 };
  assert.ok(!overlap(p, hut) && !overlap(p, wall) && !overlap(p, west), `飛行中に屋上の物へ当たらない t=${t.toFixed(2)} z0=${z0}`);
}

// --- 掘り方 ---
const before = world(), after = world();
tunnel.build(after);
const lane = { minZ: T.Z0, maxZ: T.Z1 };

// 1. 東の回廊（上段 y4〜、下段 y0〜）を塞がない。天井高 2.5 m 以上。
const upper = { minX: 11, maxX: 13, minY: 4.01, maxY: 4 + 2.4, minZ: -13, maxZ: 13 };
assert.equal(before.jn.filter(b => overlap(b, upper)).length, 0, '元の上段回廊は空');
assert.equal(after.jn.filter(b => overlap(b, upper)).length, 0, '掘った後も上段回廊（天井高2.4 m）は空');
const lower = { minX: 11, maxX: 13, minY: .01, maxY: 3.5, minZ: -13, maxZ: 13 };
assert.equal(before.jn.filter(b => overlap(b, lower)).length, after.jn.filter(b => overlap(b, lower)).length, '下段回廊は変わらない');
let lowestShell = Infinity;
for (const b of after.jn) if (b.slideSlope && b.minX >= 11 - 1e-6 && b.maxX <= 13 + 1e-6) lowestShell = Math.min(lowestShell, b.minY);
assert.ok(lowestShell - 4 >= 2.5, '回廊の上の殻の下端から床まで2.5 m以上: ' + (lowestShell - 4).toFixed(2));
// 回廊の梁は帯の外で、そのまま残る。
for (const b of after.jn.filter(b => b.type === 'beam' && !b.hidden && b.minY >= 6.4 && b.minX >= 11 && b.maxX <= 13)) assert.ok(b.minZ >= T.Z1 - 1e-6 || b.maxZ <= T.Z0 + 1e-6, '梁は帯の外 ' + JSON.stringify(b));
assert.equal(after.jn.filter(b => b.type === 'beam' && !b.hidden).length, before.jn.filter(b => b.type === 'beam').length, '梁は増減しない');

// 2. 帯の外は変えない（体積が同じ）。帯の中も y 3.2 より下は変えない。
const all = { minX: -50, maxX: 50, minY: -50, maxY: 50, minZ: -50, maxZ: 50 };
const outsideLane = [{ minZ: -50, maxZ: T.Z0 }, { minZ: T.Z1, maxZ: 50 }];
for (const side of outsideLane) {
  const clip = { ...all, ...side }, pick = b => b.type !== 'x';
  const orig = baseline.reduce((s, [, x0, x1, y0, y1, z0, z1]) => { const z = Math.min(z1, clip.maxZ) - Math.max(z0, clip.minZ); return s + (z > 0 ? (x1 - x0) * (y1 - y0) * z : 0); }, 0);
  assert.ok(Math.abs(volume(after.jn.filter(b => !b.hidden && b.tunnel === undefined), pick, clip) - orig) < 1e-6, '帯の外の体積は元と同じ');
}
const below = { ...all, ...lane, maxY: T.FILL0 };
assert.ok(Math.abs(volume(after.jn.filter(b => b.tunnel === undefined), () => true, below) - volume(before.jn, () => true, below)) < 1e-6, '帯の中でも y 3.2 より下は変えない');

// 3. 屋根: 入口の坑と出口の穴だけ開く。間（トンネルの天井）は残る。
const roofAt = (x, z = -8.75) => after.jn.some(b => b.type === 'slab' && b.minY >= 7.55 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
for (const x of [7.5, 9, 11, 12.5, 13.8]) assert.ok(!roofAt(x), `入口の坑は開いている x=${x}`);
for (const x of [T.HOLE_W + .05, -2.2, T.HOLE_E - .05]) assert.ok(!roofAt(x), `出口の穴は開いている x=${x}`);
for (const x of [T.HOLE_E + .05, 0, 3, 6, 7.1]) assert.ok(roofAt(x), `トンネルの天井は残る x=${x}`);
for (const z of [T.Z0 - .3, T.Z1 + .3]) for (const x of [9, 13.5, -2.2]) assert.ok(roofAt(x, z), `帯の外の屋根は残る x=${x} z=${z}`);

// 4. 滑り台: 歩いて登れる段差（0.25 m以下）で、勾配の印が付き、頭上に1.85 m以上ある。
const top = (x, z = -8.75) => {
  let best = -Infinity;
  for (const b of after.jn) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.type !== 'slab' && b.minY < 7.95 && b.maxY > best) best = b.maxY;
  return best;
};
let prev = null;
for (let x = T.XB + .1; x < T.XT - .05; x += .05) {
  const y = top(x);
  assert.ok(Math.abs(y - tunnel.surfaceY(x)) <= .22, `滑り台の面が設計の勾配に沿う x=${x.toFixed(2)} y=${y.toFixed(2)}`);
  if (prev !== null) assert.ok(Math.abs(y - prev) <= .25, `段差は歩いて登れる x=${x.toFixed(2)}`);
  prev = y;
  const ceiling = after.jn.filter(b => x > b.minX && x < b.maxX && -8.75 > b.minZ && -8.75 < b.maxZ && b.minY >= y + .1).reduce((m, b) => Math.min(m, b.minY), Infinity);
  assert.ok(ceiling - y >= 1.85, `頭上に1.85 m以上 x=${x.toFixed(2)} ${(ceiling - y).toFixed(2)}`);
}
const slopes = after.jn.filter(b => b.slideSlope);
assert.ok(slopes.length > 20 && slopes.every(b => b.hidden && b.slideSlope.dx === -1 && Math.abs(b.slideSlope.grade - T.grade) < 1e-9), '滑り台の段には西向き・同じ勾配の印が付く');
assert.ok(T.grade >= .12, 'slope-slide の最小勾配以上');

// 5. U字: 当たり判定は曲線より下。出口で屋根の縁に頭が当たらない。始点は滑り台の底、終点は穴の縁。
for (const b of after.jn.filter(b => b.tunnel === 'arc')) {
  const east = tunnel.arcPoint(Math.asin((T.XB - b.minX) / T.R) > T.TH ? T.TH : Math.asin((T.XB - b.maxX) / T.R));
  assert.ok(b.maxY <= east.y + 1e-6 + (b.maxY === T.FILL0 + .05 ? .05 : 0), 'U字の柱は曲線の下');
}
const start = tunnel.arcPoint(0), end = tunnel.arcPoint(T.TH);
assert.ok(Math.abs(start.x - T.XB) < 1e-9 && Math.abs(start.y - T.YB) < 1e-9);
assert.ok(Math.abs(end.x - T.LIP_X) < 1e-9 && Math.abs(end.y - T.LIP_Y) < 1e-9);
// 出口を出た体（半径0.32・高さ1.75）が、掘った後の箱（穴の縁・壁・屋根）に一度も当たらない。
for (const z0 of [T.Z0 + .4, T.Z1 - .4]) for (let t = 0; t < .5; t += .002) {
  const y = T.LIP_Y + .05 + flight.v.y * t - 10 * t * t, x = T.LIP_X + flight.v.x * t;
  const p = { minX: x - .32, maxX: x + .32, minY: y + 1e-6, maxY: y + 1.75, minZ: z0 - .32, maxZ: z0 + .32 };
  const hit = after.jn.find(b => overlap(b, p));
  assert.ok(!hit, `出口の直後に壁・屋根へ当たらない t=${t.toFixed(3)} ${hit && JSON.stringify([hit.minX, hit.maxX, hit.minY, hit.maxY])}`);
}
for (let th = 0; th <= T.TH; th += .005) {
  const p = tunnel.arcPoint(th);
  if (p.y + 1.75 > T.ROOF_Y) assert.ok(p.x + .32 <= T.HOLE_E + 1e-9, `出口の穴で頭が屋根の縁に当たらない th=${(th * 180 / Math.PI).toFixed(1)}° x=${p.x.toFixed(2)}`);
}
// 掘る箱の引き算は体積が合う。
{
  const b = { minX: 0, maxX: 4, minY: 0, maxY: 4, minZ: 0, maxZ: 4, type: 'mono' }, v = { minX: 1, maxX: 3, minY: 1, maxY: 9, minZ: -2, maxZ: 2 };
  const parts = tunnel.subtract(b, v), vol = p => (p.maxX - p.minX) * (p.maxY - p.minY) * (p.maxZ - p.minZ);
  assert.ok(Math.abs(parts.reduce((s, p) => s + vol(p), 0) - (64 - 2 * 3 * 2)) < 1e-9);
  assert.equal(tunnel.subtract(b, { ...v, minX: 5, maxX: 6 }), null);
}
console.log('PASS tower tunnel: corridors stay open (2.5 m+), roof/core cut only in the 2.5 m lane, walkable chute, U-arc clearance, launch apex/landing numbers');
