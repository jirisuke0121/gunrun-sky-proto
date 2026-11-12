// Shipped sounds are FLAC (lossless, tools/wav_to_flac.py): no WAV left in assets/, every file really is FLAC,
// and every sound name the code asks for exists.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=walk(path.join(root,'assets'));
assert.deepEqual(files.filter(f=>f.endsWith('.wav')).map(f=>path.relative(root,f)),[],'no WAV is shipped: run tools/wav_to_flac.py');
const flacs=files.filter(f=>f.endsWith('.flac'));
assert.ok(flacs.length>=34,'FLAC files: '+flacs.length);
for(const f of flacs)assert.equal(fs.readFileSync(f).subarray(0,4).toString('latin1'),'fLaC','FLAC header: '+f);
const src=n=>fs.readFileSync(path.join(root,n),'utf8');
// names the code asks for
const need=new Set();
const replay=src('replay-audio.js').match(/const FILES = \[([^\]]*)\]/)[1].match(/'[^']+'/g).map(s=>s.slice(1,-1));
for(const n of replay)need.add('assets/sfx/'+n);
const feedback=src('combat-feedback.js');
assert.match(feedback,/base \+ name \+ '\.flac'/,'combat feedback asks for FLAC');
const sounds=feedback.match(/const sounds = \{([\s\S]*?)\};/);
if(sounds)for(const m of sounds[1].matchAll(/\[\s*'([A-Za-z]+)'/g))need.add('assets/combat-feedback/'+m[1]+'.flac');
const enh=src('enhancements.js');
assert.ok(enh.includes('/assets/sfx/${id}.flac')||enh.includes('./assets/sfx/${id}.flac'),'weapon shots ask for FLAC');
assert.ok(enh.includes('explosion_4.flac'),'explosion asks for FLAC');
need.add('assets/sfx/easy-weapons/explosion_4.flac');
for(const id of ['hg1','hg2','sg1','sg2','sg3','sg4','mg1','mg2','mg3','mg4','mgh1','mgh6','smgh1','smgh9','smgl1','smgl2'])need.add('assets/sfx/'+id+'.flac');
for(const n of need)assert.ok(fs.existsSync(path.join(root,n)),'missing: '+n);
for(const n of ['combat-feedback.js','enhancements.js','replay-audio.js'])assert.ok(!/['"`][^'"`]*\.wav['"`?]/.test(src(n).replace("playEasySound('reload_1.wav'",'')),n+' still names a .wav');
console.log('PASS sfx flac:',flacs.length,'files, none are WAV, all',need.size,'requested names exist');
