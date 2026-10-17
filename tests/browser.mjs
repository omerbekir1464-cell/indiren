// UI test with a simulated Chrome API. Does not claim extension integration.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = createServer(async (request,response) => {
  const path = new URL(request.url,'http://localhost').pathname;
  if (!['/popup.html','/popup.css','/popup.js'].includes(path)) { response.statusCode=404; response.end(); return; }
  response.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
  response.end(await readFile(`extension${path}`));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:390,height:760}});
  await page.addInitScript(()=>{
    window.messages=[];
    window.chrome={tabs:{query:async()=>[{id:1,url:'https://example.test/watch'}]},runtime:{sendMessage:async message=>{
      window.messages.push(message);
      if(message.type==='scan') return {items:[
        {url:'https://cdn.test/%3Cimg%20src=x%20onerror=alert(1)%3E.mp4?secret=123',format:'mp4',source:'Video öğesi'},
        {url:'https://cdn.test/master.m3u8',format:'stream',source:'Ağ isteği'}
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
  await page.getByRole('button',{name:'↓ Yardımcıyla indir',exact:true}).click();
  await page.getByRole('status').filter({hasText:'yardımcı kurulu değil'}).waitFor();
  await page.getByRole('button',{name:'Bu sayfayı yardımcıyla indir'}).click();
  const messages=await page.evaluate(()=>window.messages);
  assert.equal(messages.filter(m=>m.type==='native').length,2);
  assert.equal(messages.at(-1).url,'https://example.test/watch');
  await page.evaluate(()=>chrome.runtime.sendMessage=async()=>({items:[]}));
  await page.getByRole('button',{name:'Yenile'}).click();
  await page.getByRole('heading',{name:'Henüz video bulunamadı'}).waitFor();
  await page.evaluate(()=>chrome.runtime.sendMessage=async()=>({error:'Erişim engellendi'}));
  await page.getByRole('button',{name:'Yenile'}).click();
  await page.getByRole('status').filter({hasText:'Erişim engellendi'}).waitFor();
  console.log('PASS: Chromium UI (simulated Chrome API): list, safe text, direct/native actions, empty state, errors');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
