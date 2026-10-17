"""Register the helper for the current user's Google Chrome profile."""
import argparse
import json
import os
import pathlib
import re
import shlex
import sys

parser = argparse.ArgumentParser()
parser.add_argument('extension_id', help='ID shown on chrome://extensions')
parser.add_argument('--exe', type=pathlib.Path, help='Windows: packaged native host executable')
args = parser.parse_args()
if not re.fullmatch('[a-p]{32}', args.extension_id):
    parser.error('Chrome eklenti kimliği 32 adet a-p harfinden oluşmalıdır')
root = pathlib.Path(__file__).resolve().parent
if sys.platform == 'win32':
    if not args.exe or not args.exe.resolve().is_file():
        parser.error('Windows için --exe ile PyInstaller host.exe dosyasını belirtin')
    executable = args.exe.resolve()
    location = pathlib.Path(os.environ['LOCALAPPDATA']) / 'Indiren'
elif sys.platform == 'darwin':
    location = pathlib.Path.home() / 'Library/Application Support/Google/Chrome/NativeMessagingHosts'
else:
    location = pathlib.Path.home() / '.config/google-chrome/NativeMessagingHosts'
location.mkdir(parents=True, exist_ok=True)
if sys.platform != 'win32':
    executable = root / 'launch.sh'
    executable.write_text('#!/bin/sh\nexec ' + shlex.quote(sys.executable) + ' ' + shlex.quote(str(root / 'host.py')) + '\n')
    executable.chmod(0o700)
manifest = location / 'com.indiren.downloader.json'
manifest.write_text(json.dumps({
    'name': 'com.indiren.downloader',
    'description': 'Indiren yt-dlp download helper',
    'path': str(executable),
    'type': 'stdio',
    'allowed_origins': [f'chrome-extension://{args.extension_id}/'],
}, indent=2))
if sys.platform == 'win32':
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Google\Chrome\NativeMessagingHosts\com.indiren.downloader') as key:
        winreg.SetValueEx(key, '', 0, winreg.REG_SZ, str(manifest))
print('Yardımcı kaydedildi:', manifest)
