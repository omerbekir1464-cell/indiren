import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeError} from '../extension/native-error.js';
test('native host errors distinguish identity, registration, startup and protocol problems',()=>{
  assert.match(nativeError('Specified native messaging host not found.','abc'),/kaydı bulunamadı/);
  assert.match(nativeError('Access to the specified native messaging host is forbidden.','abc'),/kimliğine izin vermiyor/);
  assert.match(nativeError('Failed to start native messaging host.','abc'),/EXE başlatılamadı/);
  assert.match(nativeError('Native host has exited.','abc'),/yanıt vermeden kapattı/);
  assert.match(nativeError('Custom failure','abc'),/Chrome: Custom failure/);
});
