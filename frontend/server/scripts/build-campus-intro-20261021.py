"""Build the approved campus intro. Requires FFmpeg with libx264 (or imageio-ffmpeg)."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
source = root / "seed-media/campus-intro-20261021/original.gif"
output = root.parent / "visual-preview-20261013/assets/media/campus-intro.mp4"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg"))
args = parser.parse_args()
binary = args.ffmpeg
if not binary:
    try:
        import imageio_ffmpeg
        binary = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        parser.error("Provide --ffmpeg PATH, set FFMPEG_PATH, or install imageio-ffmpeg")
output.parent.mkdir(parents=True, exist_ok=True)
# Frame 154 begins the unwanted faculty end-card dissolve. Do not include it.
subprocess.run([
    binary, "-y", "-ignore_loop", "1", "-i", str(source),
    "-vf", "trim=start_frame=12:end_frame=154,setpts=PTS-STARTPTS,pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:white",
    "-fps_mode", "passthrough", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-crf", "23", "-preset", "slow", "-movflags", "+faststart", "-an", str(output)
], check=True, stdout=subprocess.DEVNULL)
metadata = {
    "source": "User-provided campus sketch-to-color GIF, 2026-10-21",
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "sourceFrames": 224, "sourceDurationMs": 6720,
    "startFrameInclusive": 12, "endFrameExclusive": 154,
    "retainedFrames": 142, "sourceIntervalMs": 4260,
    "outputWidth": 1026, "outputHeight": 328,
    "outputBytes": output.stat().st_size,
    "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "note": "Campus sign retained. Faculty end card and QR code excluded. One white pixel pads the right edge for H.264. No audio."
}
(source.parent / "source.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Created {output.name}: {output.stat().st_size} bytes")
