// Allowed-origin rules for the record Worker (exact entries and https://*.host subdomain entries).
const assert = require('node:assert/strict');
(async () => {
  const { originAllowed, corsOrigin } = await import('../server/origins.js');
  const list = ['https://jirisuke0121.github.io', 'https://y8.com', 'https://*.y8.com'];
  for (const ok of ['https://jirisuke0121.github.io', 'https://y8.com', 'https://www.y8.com', 'https://cdn.games.y8.com', ''])
    assert.equal(originAllowed(ok, list), true, ok);
  for (const bad of ['http://www.y8.com', 'https://evil-y8.com', 'https://y8.com.evil.example', 'https://www.y8.com.evil.example', 'https://example.com', 'https://jirisuke0121.github.io.evil.example', 'https://user@www.y8.com'])
    assert.equal(originAllowed(bad, list), false, bad);
  assert.equal(originAllowed('https://example.com', []), true, 'empty list allows all');
  assert.equal(corsOrigin('https://www.y8.com', list), 'https://www.y8.com');
  assert.equal(corsOrigin('https://example.com', list), list[0]);
  assert.equal(corsOrigin('', []), '*');
  console.log('origins ok');
})().catch(e => { console.error(e); process.exit(1); });
