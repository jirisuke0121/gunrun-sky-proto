// 管理画面を実ブラウザで操作する。Workerの応答は本物の形でモックする（本番のトークンは使わない）。
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const WORKER='https://gunrun-runs.jirisuke0121.workers.dev',TOKEN='test-token';
const record=(id,at,over={})=>({clientRunId:id,build:'2026-11-03-nav-watch-v1',at,challenge:{id:'hard'},reason:'caught',t:80,mapKey:'old-town',...over});
const hit=(life,at)=>({k:'hit',t:30,at,life,place:'西の広場',state:'run',nearest:1.2,near9:4});
const stuck=(cause,t,p)=>({t,cause,n:3,nav:0,player:{p,now:-1,kept:12,keptAt:[-30,11.9,1]},targets:[[-30,11.9,1]],zombies:[{p:[-30,11.9,1],node:5,f:0,edge:-1}]});
const RUNS=[
 {id:'a',json:JSON.stringify(record('aaaaaaaa-1','2026-11-03T10:00:00.000Z',{mistakes:[hit(2,[-22,4.2,0]),hit(1,[-21,4.2,1]),{k:'fall',t:60,at:[10,8,-5],life:0}]}))},
 {id:'b',json:JSON.stringify(record('bbbbbbbb-2','2026-11-03T12:00:00.000Z',{reason:'time',diagnostics:{stuck:[stuck('player-no-node',40,[-22.5,6.7,1.3]),stuck('no-route',70,[31,7.4,-12])]}}))},
 {id:'c',json:JSON.stringify(record('cccccccc-3','2026-11-03T13:00:00.000Z',{build:'2026-11-03-x-dev',mistakes:[hit(1,[0,0,0])]}))},
];
const player=(n,name)=>({player:'p'.repeat(8)+n,name,lastAt:Date.parse('2026-11-03T11:00:00Z'),periodFirstAt:1,activeDays:2,plays:5,finishes:1,quits:1,retries:2,isNew:n===1});
(async()=>{let browser,server;try{
 const base='http://127.0.0.1:8831/';server=spawn('python3',['-m','http.server','8831','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
 // 旧URLは新しい画面へ転送される
 assert.match(await (await fetch(base+'tools/heatmap/heatmap.html')).text(),/url=\.\.\/admin\//,'old heatmap URL redirects');
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 const calls=[];
 const open=async(viewport)=>{
  const page=await (await browser.newContext({viewport})).newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/status of 401/.test(m.text()))errors.push(m.text())});// the wrong-token step expects one 401
  await page.route(WORKER+'/**',route=>{
   const url=new URL(route.request().url()),auth=route.request().headers().authorization,json=(b,s=200)=>route.fulfill({status:s,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(b)});
   calls.push(url.pathname+url.search);
   if(url.pathname==='/')return json({ok:true,service:'gunrun-runs',build:'test-build',recordProtocol:2,rankedRules:'v14'});
   if(auth!=='Bearer '+TOKEN)return json({error:'unauthorized'},401);
   if(url.pathname==='/runs')return json({count:RUNS.length,runs:RUNS});
   if(url.pathname==='/admin/players')return json(url.searchParams.has('cursor')
     ?{players:[player(3,'三人目')],nextCursor:null,note:'メモ'}
     :{players:[player(1,'<img src=x onerror=window.__xss=1>太郎'),player(2,'花子')],nextCursor:'next-page',note:'同じブラウザの匿名IDで集計します。'});
   if(url.pathname==='/admin/player')return json({player:player(1,'<img src=x onerror=window.__xss=1>太郎'),records:[{id:'r1',name:'x',receivedAt:Date.parse('2026-11-03T11:00:00Z'),map:'old-town',difficulty:'hard',source:'github',device:'phone',reason:'time',t:120,score:3400,replay:1}],
     timeline:[{at:Date.parse('2026-11-03T11:00:00Z'),event:'start',reason:null,map:'old-town',difficulty:'hard'}],recordsCursor:null});
   return json({error:'not_found'},404);
  });
  await page.goto(base+'tools/admin/index.html');await page.waitForFunction(()=>window.__adminReady);
  return {page,errors};
 };

 const {page,errors}=await open({width:1280,height:800});
 // 認証：違う合言葉は弾かれ、何も表示しない
 await page.fill('#token','wrong');await page.click('#load');
 await page.waitForFunction(()=>/合言葉が違います/.test(document.getElementById('msg').textContent));
 assert.match(await page.textContent('#sum'),/データなし/);
 // 地図：読み込むと、被弾・死亡・落下・詰まりが数えられる（-dev と入門は除外）
 await page.fill('#token',TOKEN);await page.click('#load');
 await page.waitForFunction(()=>/2プレイ/.test(document.getElementById('msg').textContent));
 const sum=await page.textContent('#sum');
 assert.match(sum,/対象\s*2\s*プレイ/);assert.match(sum,/被弾\s*2/);assert.match(sum,/死亡\s*1/);assert.match(sum,/落下\s*0/);assert.match(sum,/詰まり\s*2/);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('admin-token')),TOKEN);
 // 地図の点をクリック：詰まりの詳細に原因・ゾンビ・目標が出る
 const stuckAt=await page.evaluate(()=>{const p=shown.find(q=>q.type==='stuck'&&q.cause==='player-no-node'),k=cv.width/view.span,r=cv.getBoundingClientRect(),f=r.width/cv.width;
   return {x:r.left+(p.x-view.minX)*k*f,y:r.top+(p.z-view.minZ)*k*f}});
 await page.mouse.click(stuckAt.x,stuckAt.y);
 const detail=await page.innerHTML('#detail');
 assert.match(detail,/詰まり/);assert.match(detail,/足元にノードなし/);assert.match(detail,/ゾンビ 3体/);assert.match(detail,/足元のノード なし/);assert.match(detail,/ゾンビの目標 \(-30\.0, 11\.9, 1\.0\)/);
 // 種類のチェックで詰まりだけ消せる
 await page.uncheck('[data-type="stuck"]');assert.match(await page.textContent('#sum'),/詰まり\s*0/);await page.check('[data-type="stuck"]');
 await page.screenshot({path:'browser-evidence/admin-map.png'});

 // 詰まりタブ：原因ボタン、絞り込み、行→地図
 await page.click('#tabs [data-tab="stuck"]');
 assert.equal(await page.isVisible('#tab-stuck'),true);assert.equal(await page.isVisible('#tab-map'),false);
 assert.equal(await page.locator('#stuckRows tr[data-i]').count(),2);
 const chips=await page.locator('#causes .chip').allTextContents();
 assert.ok(chips.some(t=>/足元にノードなし/.test(t)&&/1/.test(t))&&chips.some(t=>/降りる経路なし/.test(t)),'cause chips: '+chips);
 await page.click('#causes .chip[data-cause="no-route"]');
 assert.equal(await page.locator('#stuckRows tr[data-i]').count(),1);assert.match(await page.textContent('#causeHelp'),/つながっていない/);
 assert.match(await page.textContent('#stuckRows'),/降りる経路なし/);
 await page.screenshot({path:'browser-evidence/admin-stuck.png'});
 await page.click('#causes .chip[data-cause=""]');await page.click('#stuckRows tr[data-i="0"]');
 assert.equal(await page.isVisible('#tab-map'),true,'row click goes to the map');
 assert.match(await page.innerHTML('#detail'),/詰まり/);

 // プレイヤータブ：一覧、HTMLのエスケープ、続き、詳細
 await page.click('#tabs [data-tab="players"]');await page.click('#pLoad');
 await page.waitForFunction(()=>document.querySelectorAll('#pRows tr[data-id]').length===2);
 assert.equal(await page.evaluate(()=>window.__xss),undefined,'a player name with HTML does not run');
 assert.equal(await page.locator('#pRows img').count(),0,'and is shown as text');
 assert.match(await page.textContent('#pRows'),/<img src=x onerror=window\.__xss=1>太郎/);
 assert.equal(await page.isVisible('#pMore'),true);await page.click('#pMore');
 await page.waitForFunction(()=>document.querySelectorAll('#pRows tr[data-id]').length===3);
 assert.equal(await page.isVisible('#pMore'),false,'no more pages');
 await page.fill('#pQ','太郎');await page.selectOption('#pCompletion','finished');await page.selectOption('#pDays','30');await page.click('#pLoad');
 await page.waitForFunction(()=>document.querySelectorAll('#pRows tr[data-id]').length===2);
 const q=calls.filter(c=>c.startsWith('/admin/players')).at(-1);
 assert.match(q,/days=30/);assert.match(q,/completion=finished/);assert.match(q,/q=%E5%A4%AA%E9%83%8E/);assert.doesNotMatch(q,/cursor/,'a new search starts from the top');
 await page.click('#pRows tr[data-id]');await page.waitForSelector('#pDetail:not([hidden])');
 const pd=await page.textContent('#pDetail');assert.match(pd,/3400/);assert.match(pd,/github/);assert.match(pd,/11-03 20:00/,'time in Japan time');assert.match(pd,/Sitesの管理画面/);
 assert.equal(await page.evaluate(()=>window.__xss),undefined);
 await page.screenshot({path:'browser-evidence/admin-players.png'});

 // リプレイ・概要タブ：Sitesへのリンクと Worker の状態
 await page.click('#tabs [data-tab="more"]');
 assert.match(await page.getAttribute('#sitesLink','href'),/^https:\/\/sky-corridor-owner\.jirisuke\.chatgpt\.site\//);
 assert.equal(await page.getAttribute('#sitesLink','rel'),'noopener noreferrer');
 await page.click('#wLoad');await page.waitForFunction(()=>/test-build/.test(document.getElementById('wRows').textContent));
 assert.match(await page.textContent('#wRows'),/rankedRules/);
 assert.deepEqual(errors,[],'no console errors');

 // JSONを開く：ネットに出さずに見る
 await page.click('#tabs [data-tab="map"]');
 fs.mkdirSync('browser-evidence',{recursive:true});fs.writeFileSync('browser-evidence/admin-sample.json',JSON.stringify(RUNS.map(r=>JSON.parse(r.json))));
 await page.setInputFiles('#file','browser-evidence/admin-sample.json');
 await page.waitForFunction(()=>/admin-sample\.json/.test(document.getElementById('msg').textContent));
 assert.match(await page.textContent('#sum'),/詰まり\s*2/);

 // 携帯の幅でも崩れない（地図が縦に並ぶ）
 const m=await open({width:390,height:844});
 await m.page.fill('#token',TOKEN);await m.page.click('#load');await m.page.waitForFunction(()=>/2プレイ/.test(document.getElementById('msg').textContent));
 const overflow=await m.page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 assert.ok(overflow<=1,'no horizontal overflow on a phone: '+overflow);
 await m.page.screenshot({path:'browser-evidence/admin-phone.png'});assert.deepEqual(m.errors,[]);
 console.log('PASS admin: token, map (hit/death/fall/stuck), stuck tab, players tab, more tab, JSON file, phone width');
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
