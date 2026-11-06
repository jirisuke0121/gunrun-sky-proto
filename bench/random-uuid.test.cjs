const assert=require('node:assert/strict');
(async()=>{const {randomUUID}=await import('../random-uuid.js');
assert.equal(randomUUID({randomUUID:()=> 'native'}),'native');
const source={getRandomValues:bytes=>bytes.fill(255)};
assert.equal(randomUUID(source),'ffffffff-ffff-4fff-bfff-ffffffffffff');
assert.match(randomUUID(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
console.log('PASS UUID native API and secure-random fallback without randomUUID');
})().catch(e=>{console.error(e);process.exitCode=1});
