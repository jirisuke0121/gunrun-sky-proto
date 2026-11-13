const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gunrun-y8-'));
try{
 const zip=path.join(dir,'game.zip');execFileSync('python3',['tools/make_release_zip.py','--y8',zip]);
 const manifest=JSON.parse(execFileSync('python3',['-c',`import zipfile,json,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 print(json.dumps({'files':z.namelist(),'html':z.read('index.html').decode(),'bytes':sum(i.file_size for i in z.infolist())}))`,zip],{maxBuffer:8*1024*1024}));
 assert.ok(manifest.html.startsWith('<!doctype html>'));
 assert.ok(manifest.html.includes('window.SKY_PLATFORM={id:"y8"}'));
 assert.ok(manifest.html.includes('https://cdn.y8.com/minimal-sdk/2-0/y8.min.js'));
 assert.ok(!fs.readFileSync('index.html','utf8').includes('window.SKY_PLATFORM={id:"y8"}'),'normal Pages stays platform-neutral');
 for(const file of ['y8-runtime.js','y8-config.js','CREDITS.md','audio-recovery.js','assets/human-gunrun-animated.glb.gz'])assert.ok(manifest.files.includes(file),file);
 for(const file of manifest.files)assert.ok(!/^(?:server|bench|docs|tools|pool|node_modules)\/|^(?:owner|hook-editor|canyon|camera-trial|camera-comparison|swing-plan|escape-replay-viewer)/.test(file),file);
 for(const match of manifest.html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[^" ]*)"/g))assert.ok(manifest.files.includes(match[1]),'missing entry dependency '+match[1]);
 assert.ok(manifest.bytes<20*1048576);assert.ok(fs.statSync(zip).size<20*1048576);
 console.log('PASS Y8 root entry, CDN SDK, isolated config, shipped dependencies, credits, excluded private/development files and size');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
