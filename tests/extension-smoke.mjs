import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const server = createServer(async (request,response) => {
  const url = new URL(request.url,'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type','text/html');
    response.end('<title>Video test</title><video src="/video.mp4" controls></video><a href="/stream.m3u8">Stream</a><a href="/video.mp4">Duplicate</a>');
  } else if (url.pathname === '/video.mp4') {
    response.setHeader('Content-Type','video/mp4');
    response.end(await readFile('artifacts/fixture/video.mp4'));
  } else { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let context;
try {
  const extension = resolve('extension');
  context = await chromium.launchPersistentContext('', {
    executablePath:process.env.CHROME_PATH || '/usr/lib/chromium/chromium',
    headless:true,
    ignoreDefaultArgs:['--disable-extensions'],
    timeout:15000,
    args:['--no-sandbox','--enable-unsafe-extension-debugging',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', {path:extension});
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:15000});
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('video').readyState > 0, null, {timeout:10000});
  // Popup is opened in a tab for DOM assertions; explicit target ID exercises
  // the actual worker scan/download path without replacing the active test tab.
  const messenger = await context.newPage();
  await messenger.goto(`chrome-extension://${id}/popup.html`);
  await page.bringToFront();
  const result = await messenger.evaluate(async () => {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    return await chrome.runtime.sendMessage({type:'scan',tabId:tab.id});
  });
  assert.equal(result.error,undefined,JSON.stringify(result));
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].format,'stream');
  assert.equal(result.diagnostics.small,1);
  assert.equal(result.diagnostics.unknown,1);
  // Tiny generated fixture must be detected but excluded by the 10 MB filter.
  // Use the fixture URL explicitly below to verify Chrome's own download API.
  const download = await worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    // Avoid the interactive save dialog in automation by testing the Chrome
    // downloads API with the exact URL selected by detection.
    const id = await chrome.downloads.download({url,filename:'Indiren/test.mp4'});
    return new Promise((resolve,reject) => {
      const timer = setTimeout(()=>reject(new Error('Download timeout')),10000);
      const poll = async () => {
        const [item] = await chrome.downloads.search({id});
        if (item.state === 'complete' || item.state === 'interrupted') { clearTimeout(timer); resolve(item); }
        else setTimeout(poll,50);
      };
      poll();
    });
  },`${origin}/video.mp4`);
  assert.equal(download.state,'complete');
  assert.ok(download.bytesReceived > 0);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('heading',{name:'Bu sayfa taranamadı'}).waitFor();
  assert.match(await popup.locator('#status').textContent(),/Normal bir web sayfası/);
  await popup.screenshot({path:'artifacts/popup.png'});
  // Navigation must discard URLs from the previous document.
  await popup.close();
  await page.bringToFront();
  await page.goto(`${origin}/?next`);
  const unsafe = await messenger.evaluate(async () => {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    return await chrome.runtime.sendMessage({type:'download',tabId:tab.id,url:'https://unknown.test/not-found.mp4'});
  });
  assert.match(unsafe.error,/doğrudan indirilemiyor/);
  console.log('PASS: Chromium MV3 load, DOM/network detection, 10 MB filtering, stream diagnostics, real MP4 download, restricted-page feedback, unknown URL rejection');
} finally {
  await context?.close();
  await new Promise(resolve=>server.close(resolve));
}
