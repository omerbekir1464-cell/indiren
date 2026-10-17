#!/usr/bin/env python3
"""Chrome Native Messaging bridge. No HTTP listener or shell commands."""
import json
import pathlib
import struct
import sys
from urllib.parse import urlsplit


def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError('Eksik mesaj başlığı')
    size = struct.unpack('<I', header)[0]
    if size > 65536:
        raise ValueError('Mesaj çok büyük')
    payload = stream.read(size)
    if len(payload) != size:
        raise ValueError('Eksik mesaj')
    return json.loads(payload)


def validate_url(value):
    if not isinstance(value, str) or len(value) > 16000:
        raise ValueError('Geçersiz bağlantı')
    url = urlsplit(value)
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password:
        raise ValueError('Yalnızca HTTP/HTTPS bağlantıları destekleniyor')
    return value


class QuietLogger:
    def debug(self, message): pass
    def warning(self, message): pass
    def error(self, message): pass


def download(message):
    import yt_dlp
    url = validate_url(message.get('url'))
    target = pathlib.Path.home() / 'Downloads' / 'Indiren'
    target.mkdir(parents=True, exist_ok=True)
    options = {
        'paths': {'home': str(target)},
        'outtmpl': '%(title).150B [%(id)s].%(ext)s',
        'noplaylist': True,
        'quiet': True,
        'noprogress': True,
        'logger': QuietLogger(),
        'restrictfilenames': True,
        'overwrites': False,
        'socket_timeout': 30,
        'retries': 3,
        # Do not read ambient yt-dlp configs, browser cookies or credentials.
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        result = downloader.download([url])
    if result:
        raise RuntimeError('İndirme tamamlanamadı')
    return {'ok': True, 'message': 'İndirme tamamlandı: Downloads/Indiren'}


def main():
    try:
        message = read_message(sys.stdin.buffer)
        if message is None:
            return
        result = download(message)
    except Exception:
        # Do not echo token-bearing URLs or server responses to the extension.
        result = {'error': 'Yardımcı indirmeyi tamamlayamadı. yt-dlp/FFmpeg kurulumunu ve videoya erişimi kontrol edin.'}
    payload = json.dumps(result, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(payload)) + payload)
    sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
