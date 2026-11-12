#!/usr/bin/env python3
"""Lossless WAV -> FLAC for the shipped sounds (about 57% smaller, bit-identical audio).
Usage: python3 tools/wav_to_flac.py [dir ...]   (default: assets)
For every *.wav under the given folders: encode FLAC (same sample rate, channels and 16-bit depth, max compression),
decode it again and compare the PCM with the original (md5). Only when they are identical is the WAV removed.
Why FLAC and not AAC/MP3/Opus: no quality change at all, no encoder delay (a lossy encoder adds a short silence at the start,
which would shift gunshots), and decodeAudioData reads FLAC in Chrome, Firefox and Safari (iOS 11+).
Needs ffmpeg. pool/ is not touched unless you pass it."""
import subprocess, sys
from pathlib import Path

def pcm_md5(path):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-f', 'md5', '-'], capture_output=True, text=True, check=True)
    return out.stdout.strip()

def main(dirs):
    saved = before = after = count = 0
    for d in dirs:
        for wav in sorted(Path(d).rglob('*.wav')):
            flac = wav.with_suffix('.flac')
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-sample_fmt', 's16', '-compression_level', '12', str(flac)], check=True)
            if pcm_md5(wav) != pcm_md5(flac):
                flac.unlink(); print('MISMATCH, kept WAV:', wav); sys.exit(1)
            before += wav.stat().st_size; after += flac.stat().st_size; count += 1
            wav.unlink()
    print(f'{count} files: {before/1024:.0f} KB -> {after/1024:.0f} KB (saved {(before-after)/1024:.0f} KB), all PCM identical')

if __name__ == '__main__':
    main(sys.argv[1:] or ['assets'])
