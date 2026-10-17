import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {classify,filename} from '../extension/media.js';
import {totalBytes,inspectResource,visibleMedia} from '../extension/inspect.js';
import {scanPage} from '../extension/scanner.js';

test('worker stores network discoveries, validates requests, downloads and clears closed tabs', async () => {
  const listeners={}; const store={}; const downloads=[];
  const event = name=>({addListener:fn=>{listeners[name]=fn;}});
  const chrome={
    runtime:{id:'extension-id',onMessage:event('message')},
    webRequest:{onHeadersReceived:event('headers')},
    tabs:{onUpdated:event('updated'),onRemoved:event('removed'),query:async()=>[{id:1,url:'https://site.test/watch'}]},
    storage:{session:{get:async key=>({[key]:store[key]}),set:async value=>Object.assign(store,value),remove:async key=>{for(const k of [].concat(key)) delete store[k];}}},
    scripting:{executeScript:async()=>[{result:{candidates:[{url:'https://cdn.test/a.mp4',source:'Video öğesi'}],blobCount:1}}]},
    downloads:{onChanged:event('downloadChanged'),search:async()=>[{id:10,state:'in_progress',totalBytes:20000000}],cancel:async()=>{},removeFile:async()=>{},download:async options=>{downloads.push(options);return 10;}},
  };
  const source=(await readFile(new URL('../extension/background.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
    const fakeFetch=async (url,options={})=>{
    if(url.endsWith('m3u8'))return new Response('#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.widevine"');
    if(options.method==='HEAD')return new Response(null,{headers:{'content-length':'20000000','content-type':'video/mp4'}});
    const prefix=new Uint8Array(64);prefix.set([102,116,121,112],4);
    return new Response(prefix,{status:206,headers:{'content-range':'bytes 0-63/20000000','content-length':'64'}});
  };
  vm.runInNewContext(source,{chrome,URL,classify,filename,totalBytes,visibleMedia,scanPage,fetch:fakeFetch,inspectResource:(item,unused,verify)=>inspectResource(item,fakeFetch,verify)});
  const send = message=>new Promise(resolve=>listeners.message(message,{id:'extension-id'},resolve));
  listeners.headers({tabId:1,statusCode:200,url:'https://cdn.test/network',responseHeaders:[{name:'Content-Type',value:'video/webm'}]});
  listeners.headers({tabId:1,statusCode:200,url:'https://cdn.test/master.m3u8',responseHeaders:[]});
  const result=await send({type:'scan',tabId:1});
  assert.equal(result.items.length,2);
  assert.equal(result.diagnostics.unknown,1);
  assert.equal(result.diagnostics.blobCount,1);
  assert.equal(result.diagnostics.protected[0],'Widevine');
  const downloaded=await send({type:'download',tabId:1,url:'https://cdn.test/network'});
  assert.equal(downloaded.id,10);
  assert.equal(downloads[0].filename,'Indiren/network.webm');
  assert.equal(downloads[0].saveAs,true);
  let cancelled = false;
  chrome.downloads.search = async()=>[{id:10,state:'in_progress',totalBytes:1024,mime:'video/mp4'}];
  chrome.downloads.cancel = async()=>{cancelled = true;};
  listeners.downloadChanged({id:10});
  await send({type:'scan',tabId:1});
  assert.equal(cancelled,true);
  assert.match(store['tab:1:downloadWarning'],/Küçük/);
  let removed = false;
  store['download:11']={tabId:1};
  chrome.downloads.search = async()=>[{id:11,state:'complete',fileSize:1024,mime:'text/html'}];
  chrome.downloads.removeFile = async()=>{removed = true;};
  listeners.downloadChanged({id:11});
  await send({type:'scan',tabId:1});
  assert.equal(removed,true);
  store['download:12']={tabId:1};
  chrome.downloads.removeFile = async()=>{throw new Error('file locked');};
  listeners.downloadChanged({id:12});
  const failedCleanup=await send({type:'scan',tabId:1});
  assert.match(failedCleanup.warning,/temizleme başarısız/);
  assert.ok((await send({type:'download',tabId:1,url:'https://cdn.test/master.m3u8'})).error);
  assert.ok((await send({type:'download',tabId:2,url:'https://cdn.test/network'})).error);
  assert.ok((await send({type:'download',tabId:1,url:'https://unknown.test/a.mp4'})).error);
  assert.equal(listeners.message({},{id:'extension-id',tab:{id:1}},()=>assert.fail('content script must be rejected')),undefined);
  const drm=await new Promise(resolve=>listeners.message({type:'drm-detected'},{id:'extension-id',tab:{id:1}},resolve));
  assert.equal(drm.ok,true);
  assert.equal(store['tab:1:drm'],true);
  listeners.removed(1);
  await send({type:'download',tabId:1,url:'https://cdn.test/network'});
  assert.equal(store['tab:1'],undefined);
  assert.equal(store['tab:1:drm'],undefined);
});
