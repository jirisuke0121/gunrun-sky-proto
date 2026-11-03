# Builds assets/sfx/bite/*.mp3 (bite / shove / zombie-voice sounds) from CC0 packs on OpenGameArt.
# Usage: python3 tools/build_bite_sfx.py SRC_ROOT OUTDIR      (needs numpy, scipy and ffmpeg)
# SRC_ROOT holds the extracted packs (see assets/sfx/bite/CREDITS.md for the pages and file names):
#   zombies/zombies/zombie-N.wav      Zombies Sound Pack (artisticdude, CC0)
#   rpg/RPG Sound Pack/...            RPG Sound Pack (artisticdude, CC0)
#   punch/qubodupPunch/*.ogg          Punch (qubodup, CC0)
#   swish/swishes/swish-N.wav         Swishes Sound Pack (artisticdude, CC0)
#   vocal/slightscream-NN.flac        15 vocal male strain/hurt/pain/jump sounds (qubodup, CC0)
#   creature/eat_0N.ogg               80 CC0 creature SFX (rubberduck, CC0)
#   squish/squish_NN.mp3, squishsplat_impact.mp3   Squish Sounds Effects (EZduzziteh, CC0)
# Every take is mono 44.1 kHz, gets a 3 ms fade-in and a short fade-out (no clicks), is band-limited, normalised to a
# fixed peak and encoded as 64 kbps MP3 (decodeAudioData handles MP3 on every browser the game targets).
import os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt

SRC, OUT = sys.argv[1], sys.argv[2]
SR = 44100
os.makedirs(OUT, exist_ok=True)


def load(rel):
    path = os.path.join(SRC, rel)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
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


def finish(x, dur, peak, fade_out=.04):
    x = x[:int(dur * SR)].copy()
    fi = int(.003 * SR); x[:fi] *= np.linspace(0, 1, fi)
    fo = min(len(x), int(fade_out * SR)); x[-fo:] *= np.linspace(1, 0, fo) ** 2
    m = np.abs(x).max()
    return (x * (peak / m)).astype(np.float32) if m > 0 else x


TAKES = {
    # teeth into flesh: a crisp bite with a wet squish under it
    'bite-1': lambda: finish(band(mix([(load('rpg/RPG Sound Pack/NPC/beetle/bite-small.wav'), 0, 1),
                                       (load('squish/squish_02.mp3'), .03, .6)]), hp=90, lp=4500), .45, .8),
    'bite-2': lambda: finish(band(mix([(load('rpg/RPG Sound Pack/NPC/beetle/bite-small3.wav'), 0, 1),
                                       (load('squish/squishsplat_impact.mp3'), .04, .7)]), hp=90, lp=4500), .45, .8),
    # the zombie that bit
    'snarl-1': lambda: finish(band(load('zombies/zombies/zombie-4.wav'), hp=90, lp=6000), .7, .8, .12),
    'snarl-2': lambda: finish(band(load('zombies/zombies/zombie-7.wav'), hp=90, lp=6000), .58, .8, .1),
    'snarl-3': lambda: finish(band(load('zombies/zombies/zombie-3.wav'), hp=90, lp=6000), .58, .8, .1),
    # chest-high impact of the shove
    'thump': lambda: finish(band(load('punch/qubodupPunch/qubodupPunch02.ogg'), hp=60, lp=3500), .3, .9, .08),
    # arms driven through the air
    'whoosh-1': lambda: finish(band(load('swish/swishes/swish-8.wav'), hp=150), .16, .75, .03),
    'whoosh-2': lambda: finish(band(load('swish/swishes/swish-9.wav'), hp=150), .2, .75, .04),
    # the player: pained strain when grabbed, effort when pushing
    'grunt-1': lambda: finish(band(load('vocal/slightscream-14.flac'), hp=100, lp=6000), .55, .8, .1),
    'grunt-2': lambda: finish(band(load('vocal/slightscream-11.flac'), hp=100, lp=6000), .33, .8, .06),
    # chewing while the player is held
    'chew-1': lambda: finish(band(load('creature/eat_01.ogg'), hp=90, lp=4500), .4, .75, .08),
    'chew-2': lambda: finish(band(load('creature/eat_02.ogg'), hp=90, lp=4500), .39, .75, .08),
    'chew-3': lambda: finish(band(load('creature/eat_04.ogg'), hp=90, lp=4200), .4, .75, .08),
    'chew-4': lambda: finish(band(load('creature/eat_03.ogg'), hp=90, lp=4000), .27, .75, .06),
    # zombies thrown back
    'groan-1': lambda: finish(band(load('zombies/zombies/zombie-1.wav'), hp=90, lp=6000), .85, .75, .15),
    'groan-2': lambda: finish(band(load('zombies/zombies/zombie-15.wav'), hp=90, lp=6000), .87, .75, .15),
}

total = 0
for name, build in TAKES.items():
    x = build()
    assert abs(x[0]) < .01 and abs(x[-1]) < .01, name + ': click at an edge'
    wav = os.path.join(OUT, name + '.tmp.wav')
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    import wave
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm)
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', mp3], check=True)
    os.remove(wav)
    size = os.path.getsize(mp3); total += size
    print(f'{name:9s} {len(x) / SR * 1000:5.0f} ms  peak {np.abs(x).max():.2f}  {size:6d} bytes')
print('total', total, 'bytes')
