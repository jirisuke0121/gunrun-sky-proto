const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
// Timer polling also observes tabs whose animation frames are suspended.
const wait = (page, predicate, argument) => page.waitForFunction(predicate, argument, { polling: 100, timeout: 45000 });

(async () => {
  const base = process.env.RUNNING_QA_URL || 'http://127.0.0.1:8779/';
  let server, browser;
  try {
    if (!process.env.RUNNING_QA_URL) {
      server = spawn('python3', ['-m', 'http.server', '8779', '--bind', '127.0.0.1'], { stdio: 'ignore' });
      for (let i = 0; i < 100; i++) {
        if (await fetch(base).then(r => r.ok, () => false)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    fs.mkdirSync('browser-evidence', { recursive: true });
    for (const touch of [false, true]) {
      const context = await browser.newContext({ viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 800 },
        hasTouch: touch, isMobile: touch });
      context.setDefaultTimeout(45000);
      try {
        const editor = await context.newPage(), game = await context.newPage(), errors = [];
        for (const page of [editor, game]) page.on('pageerror', error => errors.push(error.message));
        await editor.goto(new URL('hook-editor.html', base).href, { waitUntil: 'load' });
        await wait(editor, () => document.querySelector('#loadState').textContent.startsWith('下書き保存済み /'));
        await game.goto(base, {waitUntil:'load'});
        await wait(game, () => window.skyHookEditor && window.skyWallRunGuides && window.skyOldTownSwingCourse);
        const live=()=>game.evaluate(()=>({hooks:window.skyHookEditor.current(),walls:window.skyWallJumpEditor.current(),bars:window.skyOldTownSwingCourse.bars,guides:window.skyWallRunGuides.routes.map(r=>r.at)}));
        const baseline=await live();
        const draftKey='gunrun-old-town-marker-draft-v2';
        const saved=(kind,index,axis,value)=>wait(editor,({kind,index,axis,value,key})=>{
          const d=JSON.parse(localStorage.getItem(key)||'null');return d?.points[kind][index]?.[axis]===value;
        },{kind,index,axis,value,key:draftKey});
        const change=async(selector,value)=>{await editor.locator(selector).fill(String(value));await editor.locator(selector).press('Tab');};
        await editor.locator('#points button').first().click();
        const nextX=Number(await editor.locator('#x').inputValue())+.25;
        await change('#x',nextX);await saved('hook',0,0,nextX);
        assert.deepEqual(await live(),baseline,'hook drafts must not change an open game');
        await game.reload({waitUntil:'load'});await wait(game,()=>window.skyOldTownSwingCourse&&window.skyWallRunGuides);
        assert.deepEqual(await live(),baseline,'game reload ignores marker drafts');

        await editor.locator('#wallJumpMode').click();
        assert.equal(await editor.locator('#points button').count(),5);
        await editor.locator('#points button').first().click();await change('#x',32);await saved('walljump',0,0,32);
        assert.deepEqual(await live(),baseline,'wall drafts preserve permission and paint');
        const accepts=await game.evaluate(()=>{
          const wall=window.__game.solids.find(b=>b.type==='mono'&&Math.abs(b.maxZ+1.5)<.05&&b.minX<26&&b.maxX>32);
          return [32,26].map(x=>window.__skyCanWallJumpAtSpot({r:.34,pos:{x,y:1.9,z:-.78}},()=>wall,{x:0,z:1}));
        });assert.deepEqual(accepts,[false,true]);
        await editor.locator('#remove').click();
        await wait(editor,key=>JSON.parse(localStorage.getItem(key)).points.walljump.length===4,draftKey);
        assert.deepEqual(await live(),baseline);
        await editor.locator('#reset').click();
        await wait(editor,key=>JSON.parse(localStorage.getItem(key)).points.walljump.length===5,draftKey);

        await editor.locator('#barMode').click();
        assert.equal(await editor.locator('#points button').count(),baseline.bars.length);
        await editor.locator('#points button').first().click();
        const nextY=+(Number(await editor.locator('#y').inputValue())+.1).toFixed(2);
        await change('#y',nextY);await saved('bar',0,1,nextY);
        await editor.locator('#pointNote').fill('roof approach');await editor.locator('#pointNote').press('Tab');
        await wait(editor,key=>Object.values(JSON.parse(localStorage.getItem(key)).notes).includes('roof approach'),draftKey);
        const request=await editor.locator('#requestText').inputValue();
        assert.match(request,/鉄棒 移動・調整/);assert.match(request,/roof approach/);
        assert.deepEqual(await live(),baseline,'bar drafts leave published bars unchanged');
        await editor.reload({waitUntil:'load'});
        await wait(editor,()=>document.querySelector('#loadState').textContent.startsWith('下書き保存済み /'));
        await editor.locator('#barMode').click();await editor.locator('#points button').first().click();
        assert.equal(Number(await editor.locator('#y').inputValue()),nextY);
        assert.equal(await editor.locator('#pointNote').inputValue(),'roof approach');
        assert.deepEqual(await live(),baseline);
        await editor.screenshot({path:`browser-evidence/editor-autosave-${touch?'touch':'desktop'}.png`,fullPage:true});
        assert.deepEqual(errors,[]);
        console.log(`PASS ${touch?'touch':'desktop'} draft editor: hooks/walls/bars autosave and reload; delete/reset; request notes; published game and permissions unchanged`);
      } finally { await context.close(); }
    }
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
