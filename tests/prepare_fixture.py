import pathlib
import subprocess
root = pathlib.Path(__file__).resolve().parents[1] / 'artifacts/fixture'
root.mkdir(parents=True, exist_ok=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', str(root/'video.mp4')], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(root/'video.mp4'), '-c', 'copy', '-hls_time', '1', '-hls_list_size', '0', '-y', str(root/'stream.m3u8')], check=True)
