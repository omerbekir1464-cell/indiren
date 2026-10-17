import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {classify,filename} from '../extension/media.js';

test('worker stores network discoveries, validates requests, downloads and clears closed tabs', async () => {
  const listeners={}; const store={}; const downloads=[];
  const event = name=>({addListener:fn=>{listeners[name]=fn;}});
  const chrome={
    runtime:{id:'extension-id',onMessage:event('message')},
    webRequest:{onHeadersReceived:event('headers')},
    tabs:{onUpdated:event('updated'),onRemoved:event('removed'),query:async()=>[{id:1,url:'https://site.test/watch'}]},
    storage:{session:{get:async key=>({[key]:store[key]}),set:async value=>Object.assign(store,value),remove:async key=>{delete store[key];}}},
    scripting:{executeScript:async()=>[{result:[{url:'https://cdn.test/a.mp4',source:'Video öğesi'}]}]},
    downloads:{download:async options=>{downloads.push(options);return 10;}},
  };
  const source=(await readFile(new URL('../extension/background.js',import.meta.url),'utf8')).replace("import { classify, filename } from './media.js';",'');
  vm.runInNewContext(source,{chrome,URL,classify,filename});
  const send = message=>new Promise(resolve=>listeners.message(message,{id:'extension-id'},resolve));
  listeners.headers({tabId:1,statusCode:200,url:'https://cdn.test/network',responseHeaders:[{name:'Content-Type',value:'video/webm'}]});
  listeners.headers({tabId:1,statusCode:200,url:'https://cdn.test/master.m3u8',responseHeaders:[]});
  const result=await send({type:'scan',tabId:1});
  assert.equal(result.items.length,3);
  const downloaded=await send({type:'download',tabId:1,url:'https://cdn.test/network'});
  assert.equal(downloaded.id,10);
  assert.equal(downloads[0].filename,'Indiren/network.webm');
  assert.equal(downloads[0].saveAs,true);
  assert.ok((await send({type:'download',tabId:1,url:'https://cdn.test/master.m3u8'})).error);
  assert.ok((await send({type:'download',tabId:2,url:'https://cdn.test/network'})).error);
  assert.ok((await send({type:'download',tabId:1,url:'https://unknown.test/a.mp4'})).error);
  assert.equal(listeners.message({},{id:'extension-id',tab:{id:1}},()=>assert.fail('content script must be rejected')),undefined);
  listeners.removed(1);
  await send({type:'download',tabId:1,url:'https://cdn.test/network'});
  assert.equal(store['tab:1'],undefined);
});
