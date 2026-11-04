// The voice / impact takes must exist, stay small, be credited, and the module must ask for exactly these files.
// The game hooks (skyVoice.death, skyVoice.impact) must be present in both maps, and the module must keep its fallbacks.
const assert = require('node:assert/strict'), fs = require('node:fs');
const source = fs.readFileSync('voice-sfx.js', 'utf8');
const names = [];
for (const m of source.matchAll(/names\('([a-z]+)', (\d+)\)/g)) for (let i = 1; i <= +m[2]; i++) names.push(`${m[1]}-${i}`);
names.push('zroar', 'breath');
assert.ok(names.length >= 35, 'bank lists the takes');
const credits = fs.readFileSync('assets/sfx/voice/CREDITS.md', 'utf8');
let total = 0;
for (const name of names) {
  const file = `assets/sfx/voice/${name}.mp3`;
  assert.ok(fs.existsSync(file), file + ' exists');
  const size = fs.statSync(file).size; total += size;
  assert.ok(size > 1000 && size < 30000, `${file} is a short mono take (${size} bytes)`);
}
for (const stem of new Set(names.map(n => n.replace(/-\d$/, '')))) assert.ok(credits.includes(stem), stem + ' is credited');
assert.ok(total < 300000, `all takes stay under 300 KB (${total})`);
assert.ok(/CC0/.test(credits) && !/CC-BY-SA 4\.0\s*\|/.test(credits), 'only CC0 sources are listed');
const files = fs.readdirSync('assets/sfx/voice').filter(f => f.endsWith('.mp3'));
assert.equal(files.length, names.length, 'no stray take is shipped without being used');
assert.ok(fs.existsSync('tools/build_voice_sfx.py'), 'the build script is kept');

for (const page of ['index.html', 'canyon.html']) {
  const html = fs.readFileSync(page, 'utf8');
  assert.ok(html.includes('./voice-sfx.js?v='), page + ' loads the module');
  assert.ok(html.includes('Tt.kill(),window.skyVoice?.death(this)}startAct'), page + ' reports the dying zombie');
  assert.ok(html.includes('window.skyVoice?.impact(o)'), page + ' reports bullets that hit the world');
  assert.ok(!html.includes('Tt.kill()}startAct'), page + ' no longer ends die() with a bare Tt.kill()');
}
// Every recorded sound has a synthesized fallback: groan keeps the old function, the rest only add a layer. Footsteps are not touched.
assert.ok(!/wrap\('step'/.test(source) && !/'step'/.test(source), 'footsteps stay the original synthesized sound');
assert.ok(/prev\(n, pan, close\)/.test(source), 'groan falls back to the synthesized groan');
assert.ok(/\.catch\(\(\) => null\)/.test(source), 'a failed download is skipped, not fatal');
console.log(`PASS voice sfx: ${names.length} takes, ${total} bytes, credited, hooks present in both maps`);
