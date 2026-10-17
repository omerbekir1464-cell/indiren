import contextlib
import functools
import http.server
import importlib.util
import io
import json
import pathlib
import struct
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('host', ROOT / 'native/host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class NativeTests(unittest.TestCase):
    def test_protocol(self):
        value = json.dumps({'url': 'https://example.test/video.mp4'}).encode()
        self.assertEqual(host.read_message(io.BytesIO(struct.pack('<I', len(value)) + value))['url'], 'https://example.test/video.mp4')
        self.assertIsNone(host.read_message(io.BytesIO(b'')))
        for data in (b'x', struct.pack('<I', 70000), struct.pack('<I', 5) + b'{}'):
            with self.assertRaises(ValueError):
                host.read_message(io.BytesIO(data))

    def test_url_validation(self):
        for value in ('file:///etc/passwd', 'javascript:foo', 'https://user:pass@example.test/a', '--exec=bad', None):
            with self.assertRaises(ValueError):
                host.validate_url(value)

    def test_error_is_framed_json(self):
        payload = json.dumps({'url': 'file:///bad'}).encode()
        result = subprocess.run([sys.executable, str(ROOT / 'native/host.py')], input=struct.pack('<I', len(payload)) + payload, capture_output=True, check=True)
        message = host.read_message(io.BytesIO(result.stdout))
        self.assertIn('error', message)
        self.assertNotIn('file:///bad', json.dumps(message))

    def test_real_hls_download(self):
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'artifacts/fixture'))
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                with patch.object(pathlib.Path, 'home', return_value=pathlib.Path(directory)):
                    result = host.download({'url': f'http://127.0.0.1:{server.server_port}/stream.m3u8'})
                self.assertTrue(result['ok'])
                files = list((pathlib.Path(directory) / 'Downloads/Indiren').glob('*.mp4'))
                self.assertEqual(len(files), 1)
                probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', str(files[0])], capture_output=True, text=True, check=True)
                self.assertEqual(json.loads(probe.stdout)['streams'][0]['codec_type'], 'video')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
