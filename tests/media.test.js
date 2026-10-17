import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,filename} from '../extension/media.js';
test('recognizes signed URLs without modifying their query', () => {
  assert.equal(classify('https://cdn.test/movie.MP4?token=abc#x'),'mp4');
  assert.equal(classify('https://cdn.test/play?id=1','video/webm; codecs=vp9'),'webm');
});
test('rejects non-downloadable protocols and non-video resources', () => {
  for (const value of ['blob:https://test/a','javascript:alert(1)','file:///a.mp4','bad','https://test/a.mp4.exe']) assert.equal(classify(value),null);
});
test('identifies HLS and DASH as streams', () => {
  assert.equal(classify('https://test/a.mpd','application/xml'),'stream');
  assert.equal(classify('https://test/a.mp4','text/html'),null);
  assert.equal(classify('https://test/a.m3u8?token=1'),'stream');
  assert.equal(classify('https://test/play','application/dash+xml'),'stream');
});
test('creates safe filenames with the detected extension', () => {
  assert.equal(filename('https://test/movie.mp4?token=secret','mp4'),'Indiren/movie.mp4');
  assert.equal(filename('https://test/..%2Fbad%3Fname','webm'),'Indiren/_bad_name.webm');
  assert.equal(filename('https://test/','mp4'),'Indiren/video.mp4');
});

test('extensionless MIME sources and query-based stream endpoints are recognized',()=>{
  assert.equal(classify('https://site.test/play?format=m3u8'),'stream');
  assert.equal(classify('https://site.test/play?file=movie.mp4'),'mp4');
  assert.equal(classify('https://site.test/opaque','video/unknown'),'video');
  assert.equal(classify('https://site.test/segment.m4s','video/mp4'),null);
});
