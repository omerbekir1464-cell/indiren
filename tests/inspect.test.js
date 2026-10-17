import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {MIN_BYTES,totalBytes,manifestProtection,visibleMedia,inspectResource,videoSignature} from '../extension/inspect.js';

const headers = values => Object.entries(values).map(([name,value])=>({name,value}));
test('10 MB boundary excludes tiny, unknown and playlist sizes',()=>{
  for (const bytes of [null,undefined,NaN,0,1024,9999999]) assert.equal(visibleMedia({format:'mp4',bytes}),false);
  assert.equal(visibleMedia({format:'mp4',bytes:MIN_BYTES}),true);
  assert.equal(visibleMedia({format:'stream',bytes:20000000}),false);
  assert.equal(visibleMedia({format:'mp4',bytes:20000000,invalidMedia:true}),false);
});
test('partial response uses full Content-Range, never fragment Content-Length',()=>{
  assert.equal(totalBytes(headers({'Content-Length':'1024','Content-Range':'bytes 0-1023/24000000'}),206),24000000);
  assert.equal(totalBytes(headers({'content-length':'1024'}),206),null);
  assert.equal(totalBytes(headers({'content-range':'bytes 0-1023/*'}),206),null);
  assert.equal(totalBytes(headers({'content-length':'12000000','content-encoding':'gzip'})),null);
  assert.equal(totalBytes(headers({'content-length':'-10'})),null);
  assert.equal(totalBytes(headers({'content-length':'9007199254740992'})),null);
});
test('DRM indicators are detected without license access or decryption',()=>{
  assert.equal(manifestProtection('<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>'),'Widevine');
  assert.equal(manifestProtection('<ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"/>'),'PlayReady');
  assert.equal(manifestProtection('#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery"'),'FairPlay');
  assert.equal(manifestProtection('#EXT-X-KEY:METHOD=AES-128,URI="key.bin"'),null);
  assert.equal(manifestProtection('#EXTM3U\n#EXTINF:10,\nvideo.ts'),null);
});
test('container signature rejects HTML/error payload even with video URL',()=>{
  assert.equal(videoSignature(new TextEncoder().encode('<html>Access denied</html>')),false);
  assert.equal(videoSignature(new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109])),true);
});
test('real HTTP metadata fallback, prefix verification, small/HTML rejection and DRM manifest',async()=>{
  const signature=Buffer.alloc(64);signature.write('ftyp',4);
  const requests=[];
  const server=createServer((req,res)=>{
    requests.push({url:req.url,method:req.method,range:req.headers.range});
    if(req.url==='/drm.mpd') {res.setHeader('content-type','application/dash+xml');res.end('<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>');return;}
    if(req.url==='/error.mp4') {res.setHeader('content-type','text/html');res.end('<html>error</html>');return;}
    if(req.method==='HEAD') {
      if(req.url==='/fallback.mp4'){res.writeHead(405);res.end();return;}
      res.setHeader('content-length',req.url==='/small.mp4'?'1000':'12000000');res.end();return;
    }
    res.writeHead(206,{'content-type':'video/mp4','content-range':'bytes 0-63/12000000','content-length':'64'});
    res.end(req.url==='/fake.mp4'?Buffer.from('<html>not a video</html>'.padEnd(64)):signature);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await inspectResource({url:base+'/big.mp4',format:'mp4'},fetch,true)).signatureChecked,true);
    assert.equal((await inspectResource({url:base+'/fallback.mp4',format:'mp4'})).bytes,12000000);
    assert.equal((await inspectResource({url:base+'/fake.mp4',format:'mp4'},fetch,true)).invalidMedia,true);
    assert.equal((await inspectResource({url:base+'/error.mp4',format:'mp4'})).invalidMedia,true);
    assert.equal(visibleMedia({format:'mp4',...await inspectResource({url:base+'/small.mp4',format:'mp4'})}),false);
    const drm=await inspectResource({url:base+'/drm.mpd',format:'stream'});
    assert.equal(drm.drm,'Widevine');assert.equal(drm.bytes,undefined);
    assert.ok(requests.some(r=>r.method==='GET' && r.range==='bytes=0-63'));
  } finally {await new Promise(resolve=>server.close(resolve));}
});
