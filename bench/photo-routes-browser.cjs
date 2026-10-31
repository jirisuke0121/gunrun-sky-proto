const fs=require('node:fs'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{let browser,server;try{
  const base='http://127.0.0.1:8795/';
  server=spawn('python3',['-m','http.server','8795','--bind','127.0.0.1'],{stdio:'ignore'});
  for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  fs.mkdirSync('browser-evidence/photo-routes',{recursive:true});
  const page=await browser.newPage({viewport:{width:1536,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"top":[],"total":0,"ok":true}'}));
  await page.goto(base+'bench/photo-route-review.html');
  await page.waitForFunction(()=>document.querySelector('#out').textContent.includes('bodyFree'),null,{timeout:120000});
  await page.screenshot({path:'browser-evidence/photo-routes/07-west-departure.png'});
  await page.locator('#run').click();
  await page.waitForFunction(()=>{try{return typeof JSON.parse(document.querySelector('#out').textContent).pass==='boolean'}catch{return false}},null,{timeout:120000});
  const result=JSON.parse(await page.locator('#out').innerText());
  fs.writeFileSync('browser-evidence/photo-routes/results.json',JSON.stringify(result,null,2));
  await page.screenshot({path:'browser-evidence/photo-routes/scenario-end.png'});
  assert.equal(result.pass,true,JSON.stringify(result));assert.deepEqual(errors,[]);
  for(const test of result.results.filter(r=>r.id==='tower-corner-west')){
    assert.ok(test.landing.p[0]<38&&test.end.p[0]<32&&test.end.p[1]>7,'07 must move west to the original beam');
    assert.equal(test.teleports,0);assert.equal(test.end.life,3);
  }
  // Render the corrected connection in the same orientation as the photo.
  for(const [id,value] of Object.entries({x:'36.2',y:'3.4',z:'-16.2',yaw:'-90',pitch:'0'}))await page.locator('#'+id).fill(value);
  await page.locator('#place').click();
  await page.screenshot({path:'browser-evidence/photo-routes/07-west-arrival.png'});
  for(const [id,value] of Object.entries({x:'-14.32',y:'0',z:'-5.5',yaw:'0',pitch:'0'}))await page.locator('#'+id).fill(value);
  await page.locator('#place').click();
  await page.screenshot({path:'browser-evidence/photo-routes/west-wall-clear-approach.png'});
  console.log('PASS photo 07 west hook and original beam, photo 08 bar and recovery, PC/touch inputs, no in-route repositioning');
}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
