// 難易度ごとの出現場所の設定（spawn-profile.js）。順位対象の3難易度は従来どおり（先に見つかった地点）、
// 試作の超ベリーハードだけ「余裕が最も短い地点」を選ぶことを確かめる。
const assert = require('node:assert/strict');
const P = require('../spawn-profile.js');

for (const id of ['easy', 'normal', 'hard']) assert.equal(P.forProfile({ id }), null, `${id} は従来どおり`);
assert.equal(P.forProfile(null), null);
assert.equal(P.forProfile({ id: 'intro' }), null);
assert.equal(P.forProfile({ id: 'extreme' }).tight, true);
assert.ok(P.forProfile({ id: 'extreme' }).ahead > .65, '前から来る割合は従来(65%)より多い');
assert.ok(Object.isFrozen(P.table) && Object.isFrozen(P.table.extreme), '設定表は書き換えられない');

// 余裕が最も短い候補を選ぶ。同じ余裕なら先に見つかったもの。
const pool = [{ id: 'a', lead: 5.1 }, { id: 'b', lead: 3.4 }, { id: 'c', lead: 3.4 }, { id: 'd', lead: 4 }];
assert.equal(P.tightest(pool).id, 'b');
assert.equal(P.tightest([]), null);

// 1地点ずつ比べる規則：下限を満たし、今より短いときだけ入れ替える。
assert.equal(P.better(5, 3.5, 3.2), true);
assert.equal(P.better(5, 3.1, 3.2), false, '下限未満は選ばない');
assert.equal(P.better(3.5, 4, 3.2), false, '今より長い余裕には替えない');
assert.equal(P.better(2, 3.3, 3.2), true, '今の地点が下限未満なら、下限を満たす地点に替える');
assert.equal(P.better(Infinity, 6, 3.2), true);
assert.equal(P.better(5, NaN, 3.2), false);
assert.equal(P.better(5, -Infinity, 3.2), false);
console.log('spawn-profile.test: ok');
