// docs/escape-replays の記録を、これ1枚で開けるHTML(player.html)にまとめる。ゲーム本体は不要。
//   node tools/escape-replay-standalone.cjs
const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(__dirname, '..', 'docs/escape-replays');
const map = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8'));
const report = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).scenarios.map(s => [s.id, s]));
const runs = fs.readdirSync(dir).filter(f => /^escape-\d+\.json$/.test(f)).sort().map(f => {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), m = report[r.id] || {};
  return { id: r.id, moves: m.moves, target: m.target, minDist: m.minDist, samples: r.ghost.samples.map(s => [s[0], s[1], s[2], s[3], s[6]]), zombies: r.zombies || [] };
});
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>脱出テストのリプレイ（上から）</title>
<style>body{margin:0;background:#10161c;color:#dfe8ef;font:14px/1.5 sans-serif;display:flex;flex-direction:column;height:100vh}#top,#bar{padding:8px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
canvas{flex:1;min-height:0;width:100%}select,button{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid #3a4b5a;background:#1b2630;color:#dfe8ef}input[type=range]{flex:1;min-width:160px}#info{font-size:13px;color:#aab8c4}</style>
<div id="top"><select id="run"></select><span id="moves"></span><span id="info"></span></div><canvas id="c"></canvas>
<div id="bar"><button id="play">一時停止</button><button id="restart">最初から</button><input id="seek" type="range" min="0" max="1" step="0.01" value="0"><select id="speed"><option value="0.25">0.25倍</option><option value="0.5">0.5倍</option><option value="1" selected>1倍</option><option value="2">2倍</option></select><span id="clock"></span></div>
<script>
const MAP=${JSON.stringify(map)},RUNS=${JSON.stringify(runs)},NAMES=['走る','空中','滑り','壁走り','乗り越え','登る','掴み','フック','ジップ','はしご'];
const $=id=>document.getElementById(id),cv=$('c'),cx=cv.getContext('2d');let run=RUNS[0],t=0,playing=true,last=performance.now();
$('run').innerHTML=RUNS.map((r,i)=>'<option value="'+i+'">'+r.id+'</option>').join('');
function pick(i){run=RUNS[i];t=run.samples[0][0];$('seek').min=t;$('seek').max=run.samples.at(-1)[0];$('moves').textContent=run.moves||'';playing=true;}
const pose=t=>{const S=run.samples;if(t<=S[0][0])return S[0];for(let i=1;i<S.length;i++)if(t<=S[i][0]){const a=S[i-1],b=S[i],f=(t-a[0])/(b[0]-a[0]);return[t,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f,a[3]+(b[3]-a[3])*f,a[4]];}return S.at(-1);};
const zom=t=>{let best=null,bd=1e9;for(const r of run.zombies){const d=Math.abs(r[0]-t);if(d<bd){bd=d;best=r;}}return best?best[1]:[];};
function draw(){const w=cv.clientWidth,h=cv.clientHeight;cv.width=w;cv.height=h;const S=run.samples;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const s of S){x0=Math.min(x0,s[1]);x1=Math.max(x1,s[1]);z0=Math.min(z0,s[3]);z1=Math.max(z1,s[3]);}
x0-=14;x1+=14;z0-=14;z1+=14;const k=Math.min((w-20)/(x1-x0),(h-20)/(z1-z0)),X=x=>10+(x-x0)*k,Y=z=>10+(z-z0)*k;cx.clearRect(0,0,w,h);
for(const n of MAP){if(n[0]<x0||n[0]>x1||n[2]<z0||n[2]>z1)continue;const v=Math.max(0,Math.min(1,(n[1]+1)/17));cx.fillStyle='hsl('+(210-v*170)+',45%,'+(22+v*30)+'%)';cx.fillRect(X(n[0])-k*.45,Y(n[2])-k*.45,k*.9,k*.9);}
const p=pose(t);cx.strokeStyle='#fff';cx.lineWidth=2;cx.beginPath();let st=false;for(const s of S){if(s[0]>t)break;st?cx.lineTo(X(s[1]),Y(s[3])):cx.moveTo(X(s[1]),Y(s[3]));st=true;}cx.stroke();
if(run.target){cx.strokeStyle='#4aa3ff';cx.lineWidth=3;cx.beginPath();cx.arc(X(run.target[0]),Y(run.target[2]),k*1.4,0,7);cx.stroke();}
let near=null;for(const z of zom(t)){cx.fillStyle='#e5484d';cx.strokeStyle='#fff';cx.lineWidth=1.5;cx.beginPath();cx.arc(X(z[0]),Y(z[2]),k*.8,0,7);cx.fill();cx.stroke();const d=Math.hypot(z[0]-p[1],z[1]-p[2],z[2]-p[3]);near=near===null?d:Math.min(near,d);}
cx.fillStyle='#fff';cx.strokeStyle='#10161c';cx.beginPath();cx.arc(X(p[1]),Y(p[3]),k*.9,0,7);cx.fill();cx.stroke();
$('info').textContent='高さ '+p[2].toFixed(1)+'m / 状態 '+NAMES[p[4]]+(near!==null?' / 最寄りのゾンビ（高さ込み）'+near.toFixed(1)+'m':'');$('clock').textContent=(t-S[0][0]).toFixed(1)+' / '+(S.at(-1)[0]-S[0][0]).toFixed(1)+'秒';$('seek').value=t;$('play').textContent=playing?'一時停止':'再生';}
function loop(now){const dt=(now-last)/1000;last=now;if(playing){t+=dt*Number($('speed').value);const end=run.samples.at(-1)[0];if(t>=end){t=end;playing=false;}}draw();requestAnimationFrame(loop);}
$('run').onchange=e=>pick(Number(e.target.value));$('play').onclick=()=>{if(!playing&&t>=run.samples.at(-1)[0])t=run.samples[0][0];playing=!playing;};$('restart').onclick=()=>{t=run.samples[0][0];playing=true;};
$('seek').oninput=e=>{t=Number(e.target.value);playing=false;};pick(0);requestAnimationFrame(loop);
</script>`;
fs.writeFileSync(path.join(dir, 'player.html'), html);
console.log('player.html', (html.length / 1024).toFixed(0) + 'KB', runs.length + ' runs');
