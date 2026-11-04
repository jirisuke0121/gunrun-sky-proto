# Builds assets/sfx/voice/*.mp3 (human and zombie voices, impacts, footsteps, tired breathing) from CC0 packs on OpenGameArt.
# Usage: python3 tools/build_voice_sfx.py SRC_ROOT OUTDIR      (needs numpy, scipy and ffmpeg)
# SRC_ROOT holds the extracted packs (see assets/sfx/voice/CREDITS.md for the pages):
#   vocal/slightscream-NN.flac                          15 vocal male strain/hurt/pain/jump sounds (qubodup, CC0)
#   zombies/zombies/zombie-N.wav                        Zombies Sound Pack (artisticdude, CC0)
#   squish/squish_NN.mp3                                Squish Sounds Effects (EZduzziteh, CC0)
#   mw/metal_hit_0N.ogg, mw/wood_hit_0N.ogg             100 CC0 metal and wood SFX (rubberduck, CC0)
#   fant/Fantozzi-footsteps/ogg/Fantozzi-StoneXN.ogg    Fantozzi's Footsteps (Grass/Sand & Stone) (Fantozzi, CC0)
#   breath/breath.wav                                   Breathing Tired (mikeask, CC0)
# Every take is mono 44.1 kHz, gets a 3 ms fade-in and a fade-out (no clicks), is band-limited, normalised to a fixed
# peak and encoded as a 64 kbps MP3. Which source file feeds which take was chosen from length, attack and pitch
# measurements (the takes were not auditioned by ear): swap a source number below and rebuild if one sounds wrong.
import os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt

SRC, OUT = sys.argv[1], sys.argv[2]
SR = 44100
os.makedirs(OUT, exist_ok=True)


def load(rel):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(SRC, rel), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def band(x, hp=None, lp=None):
    if hp: x = sosfilt(butter(2, hp, 'hp', fs=SR, output='sos'), x)
    if lp: x = sosfilt(butter(2, lp, 'lp', fs=SR, output='sos'), x)
    return x


def mix(parts):
    """parts: [(signal, delay_seconds, gain)]"""
    n = max(int(d * SR) + len(s) for s, d, _ in parts)
    out = np.zeros(n, dtype=np.float32)
    for s, d, g in parts:
        i = int(d * SR); out[i:i + len(s)] += s * g
    return out


def thump(freq=95, dur=.14):
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2 * np.pi * (freq * np.exp(-t * 9)) * t) * np.exp(-t * 26)).astype(np.float32)


def trim_start(x, thresh=.04):
    """Drop leading silence so the take starts on its attack."""
    idx = np.nonzero(np.abs(x) > thresh * np.abs(x).max())[0]
    return x[max(0, idx[0] - int(.004 * SR)):] if len(idx) else x


def finish(x, dur, peak, fade_out=.04, fade_in=.003):
    x = trim_start(x)[:int(dur * SR)].copy()
    fi = int(fade_in * SR); x[:fi] *= np.linspace(0, 1, fi)
    fo = min(len(x), int(fade_out * SR)); x[-fo:] *= np.linspace(1, 0, fo) ** 2
    m = np.abs(x).max()
    return (x * (peak / m)).astype(np.float32) if m > 0 else x


def vocal(n): return f'vocal/slightscream-{n:02d}.flac'
def zomb(n): return f'zombies/zombies/zombie-{n}.wav'


TAKES = {}
# --- the player: a short effort for a jump, a heavier one for a hard landing, pain for a bite ---
for name, n, dur in [('jump-1', 1, .3), ('jump-2', 2, .28), ('jump-3', 12, .3), ('jump-4', 3, .32)]:
    TAKES[name] = (lambda n=n, dur=dur: finish(band(load(vocal(n)), hp=120, lp=7000), dur, .8, .08))
for name, n, dur in [('land-1', 8, .34), ('land-2', 13, .4)]:
    TAKES[name] = (lambda n=n, dur=dur: finish(band(load(vocal(n)), hp=100, lp=6500), dur, .85, .1))
for name, n, dur in [('hurt-1', 5, .55), ('hurt-2', 10, .62), ('hurt-3', 15, .7)]:
    TAKES[name] = (lambda n=n, dur=dur: finish(band(load(vocal(n)), hp=100, lp=6500), dur, .85, .12))
# --- zombies: death cries (long, falling), pain grunts (short, sharp), idle groans, alert shrieks, one deep roar ---
for i, n in enumerate([17, 18, 21, 19, 20], 1):
    TAKES[f'zdie-{i}'] = (lambda n=n: finish(band(load(zomb(n)), hp=80, lp=6500), 1.25, .9, .3))
for i, n in enumerate([5, 6, 13, 24, 22], 1):
    TAKES[f'zhit-{i}'] = (lambda n=n: finish(band(load(zomb(n)), hp=100, lp=6500), .45, .85, .1))
for i, n in enumerate([2, 8, 14, 23], 1):
    TAKES[f'zgroan-{i}'] = (lambda n=n: finish(band(load(zomb(n)), hp=80, lp=5500), .85, .8, .2))
for i, n in enumerate([9, 10, 12], 1):
    TAKES[f'zalert-{i}'] = (lambda n=n: finish(band(load(zomb(n)), hp=120, lp=7000), .7, .85, .15))
TAKES['zroar'] = lambda: finish(band(load(zomb(16)), hp=60, lp=5000), 1.4, .9, .3)
# --- bullets into flesh: a wet squish over a short low thump; into the world: a short metal or wood tick ---
for i, n in enumerate(['01_0', '03', '04'], 1):
    TAKES[f'flesh-{i}'] = (lambda n=n: finish(band(mix([(load(f'squish/squish_{n}.mp3'), 0, .9), (thump(), 0, .55)]), hp=70, lp=5500), .3, .85, .12))
for i in range(1, 6):
    TAKES[f'imp-{i}'] = (lambda i=i: finish(band(load(f'mw/metal_hit_0{i}.ogg'), hp=350, lp=9000), .22, .75, .12))
for i in range(1, 4):
    TAKES[f'impw-{i}'] = (lambda i=i: finish(band(load(f'mw/wood_hit_0{i}.ogg'), hp=150, lp=8000), .2, .75, .1))
# --- footsteps on stone (left and right takes) ---
for i, side in enumerate(['L1', 'R1', 'L2', 'R2', 'L3', 'R3'], 1):
    TAKES[f'step-{i}'] = (lambda side=side: finish(band(load(f'fant/Fantozzi-footsteps/ogg/Fantozzi-Stone{side}.ogg'), hp=50, lp=7000), .3, .75, .12))
# --- tired breathing, played repeatedly while the player is on the last life ---
TAKES['breath'] = lambda: finish(band(load('breath/breath.wav'), hp=80, lp=4500), 3.1, .6, .35, .25)

total = 0
for name, build in TAKES.items():
    pcm = build()
    out = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '64k', out],
                   input=pcm.tobytes(), check=True)
    size = os.path.getsize(out); total += size
    print(f'{name:10s} {len(pcm) / SR:5.2f}s {size:6d} B')
print(f'{len(TAKES)} takes, {total} bytes')
