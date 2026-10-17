// UI test with a simulated Chrome API. Does not claim extension integration.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {scanPage} from '../extension/scanner.js';
const server = createServer(async (request,response) => {
  const path = new URL(request.url,'http://localhost').pathname;
  if (path === '/fixture') {
    response.setHeader('Content-Type','text/html');
    response.end('<meta property="og:video" content="https://cdn.test/meta.mp4"><script type="application/ld+json">{"@type":"VideoObject","contentUrl":"https://cdn.test/json.webm"}</script><video src="blob:https://example.test/id"></video><div id="shadow"></div><div data-video-src="https://cdn.test/data.mp4"></div><a href="https://cdn.test/master.m3u8">Stream</a>');
    return;
  }
  if (!['/popup.html','/popup.css','/popup.js','/inspect.js'].includes(path)) { response.statusCode=404; response.end(); return; }
  response.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
  response.end(await readFile(`extension${path}`));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const scannerPage = await browser.newPage();
  await scannerPage.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  await scannerPage.evaluate(() => {
    const root=document.querySelector('#shadow').attachShadow({mode:'open'});
    root.innerHTML='<video src="https://cdn.test/shadow.mp4"></video>';
    Object.defineProperty(root.querySelector('video'),'mediaKeys',{value:{}});
  });
  const scanned=await scannerPage.evaluate(scanPage);
  for (const path of ['meta.mp4','json.webm','data.mp4','shadow.mp4','master.m3u8']) assert.ok(scanned.candidates.some(item=>item.url.endsWith(path)),path);
  assert.equal(scanned.drm,true);
  assert.ok(scanned.blobCount > 0);
  await scannerPage.close();
  const page = await browser.newPage({viewport:{width:390,height:760}});
  await page.addInitScript(()=>{
    window.messages=[];
    window.chrome={tabs:{query:async()=>[{id:1,url:'https://example.test/watch'}]},runtime:{sendMessage:async message=>{
      window.messages.push(message);
      if(message.type==='scan') return {items:[
        {url:'https://cdn.test/%3Cimg%20src=x%20onerror=alert(1)%3E.mp4?secret=123',format:'mp4',bytes:12000000,source:'Video öğesi'},
        {url:'https://cdn.test/master.m3u8',format:'stream',bytes:null,source:'Ağ isteği'},
        {url:'https://cdn.test/protected.mp4',format:'mp4',bytes:15000000,drm:'Widevine',source:'Ağ isteği'},
        {url:'https://cdn.test/tiny.mp4',format:'mp4',bytes:1024,source:'Ağ isteği'},
        {url:'https://cdn.test/unknown.mp4',format:'mp4',bytes:null,source:'Ağ isteği'}
      ]};
      if(message.type==='download')return {id:9};
      return {error:'Test: yardımcı kurulu değil'};
    }}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);
  await page.getByRole('heading',{name:'2 video kaynağı bulundu'}).waitFor();
  assert.equal(await page.locator('article').count(),2);
  assert.equal(await page.locator('article img').count(),0);
  assert.ok(!(await page.locator('body').innerText()).includes('secret=123'));
  await page.getByRole('button',{name:'↓ Videoyu indir',exact:true}).click();
  await page.getByRole('status').filter({hasText:'İndirme isteği gönderildi'}).waitFor();
  await page.screenshot({path:'artifacts/popup.png'});
  assert.equal(await page.getByRole('button',{name:'DRM/koruma işareti · indirilemiyor'}).isDisabled(),true);
  assert.equal(await page.locator('article').filter({hasText:'tiny.mp4'}).count(),0);
  assert.equal(await page.locator('article').filter({hasText:'unknown.mp4'}).count(),0);
  await page.getByRole('button',{name:'Bu sayfayı yardımcıyla indir'}).click();
  const messages=await page.evaluate(()=>window.messages);
  assert.equal(messages.filter(m=>m.type==='native').length,1);
  assert.equal(messages.at(-1).url,'https://example.test/watch');
  await page.evaluate(()=>chrome.runtime.sendMessage=async()=>({items:[]}));
  await page.getByRole('button',{name:'Yenile'}).click();
  await page.getByRole('heading',{name:'10 MB ve üzeri video bulunamadı'}).waitFor();
  await page.evaluate(()=>chrome.runtime.sendMessage=async()=>({error:'Erişim engellendi'}));
  await page.getByRole('button',{name:'Yenile'}).click();
  await page.getByRole('status').filter({hasText:'Erişim engellendi'}).waitFor();
  console.log('PASS: real Chromium DOM/shadow/JSON-LD/meta scanning + simulated Chrome API UI: 10 MB filter, safe text, DRM disabled action, downloads, empty/error states');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
