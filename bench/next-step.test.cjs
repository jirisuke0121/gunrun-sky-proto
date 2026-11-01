const assert=require('node:assert/strict');
const {adviseNext,READY_SECONDS}=require('../next-step.js');
// The intro run's result decides the next recommendation.
assert.equal(READY_SECONDS,60);
assert.deepEqual(adviseNext({elapsed:120,cleared:true,reason:'time'}),{primary:'next',title:'入門クリア！',goal:'2分間逃げ切れました。次はイージーで本番に挑戦できます。'});
assert.equal(adviseNext({elapsed:75.9,reason:'caught'}).primary,'next','60 s or more is ready for the real run');
assert.match(adviseNext({elapsed:75.9,reason:'caught'}).goal,/^75秒生き残りました/);
assert.equal(adviseNext({elapsed:60,reason:'fell'}).primary,'next');
for(const [reason,pattern] of [['fell',/落下しました/],['caught',/追いつかれました/]]){
  const advice=adviseNext({elapsed:59.9,reason});
  assert.equal(advice.primary,'retry','under 60 s: practise again');assert.match(advice.goal,pattern);assert.match(advice.goal,/もう一度入門/);
}
assert.equal(adviseNext().primary,'retry','no result data defaults to practising');
assert.equal(adviseNext({elapsed:NaN,reason:'caught'}).primary,'retry');
console.log('PASS next-step advice from the intro result');
