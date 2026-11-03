// The recorded bite/shove takes must exist, stay tiny, and be credited; the module must ask for exactly these files.
const assert = require('node:assert/strict'), fs = require('node:fs');
const source = fs.readFileSync('bite-shove.js', 'utf8');
const block = source.match(/const BANK = \{([\s\S]*?)\};/)[1];
const names = [...block.matchAll(/'([a-z]+-?\d*)'/g)].map(m => m[1]).filter(n => /-\d$|^thump$/.test(n));
assert.ok(names.length >= 10, 'bank lists the takes');
let total = 0;
const credits = fs.readFileSync('assets/sfx/bite/CREDITS.md', 'utf8');
for (const name of names) {
  const file = `assets/sfx/bite/${name}.mp3`;
  assert.ok(fs.existsSync(file), file + ' exists');
  const size = fs.statSync(file).size; total += size;
  assert.ok(size > 1000 && size < 20000, `${file} is a short mono take (${size} bytes)`);
  assert.ok(credits.includes(name.replace(/-\d$/, '')), name + ' is credited');
}
assert.ok(total < 100000, `all takes stay under 100 KB (${total})`);
assert.ok(/CC0/.test(credits) && !/CC-BY-SA 4\.0\s*\|/.test(credits), 'only CC0 sources are listed');
const files = fs.readdirSync('assets/sfx/bite').filter(f => f.endsWith('.mp3'));
assert.equal(files.length, names.length, 'no stray take is shipped without being used');
console.log(`PASS bite sfx: ${names.length} takes, ${total} bytes, credited`);
