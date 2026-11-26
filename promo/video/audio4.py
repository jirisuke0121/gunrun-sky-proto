#!/usr/bin/env python3
# v2 sound for a YouTube/X version.  usage: audio2.py <yt_ja|yt_en>
#   - the game's own sound for every clip, played at the clip's speed (slow motion pitches it down),
#   - CC0 music ("Determined Pursuit" by Tozan), pulled back during slow motion and cut before the title,
#   - made here from noise and sine waves: whooshes on cuts, low hits on impacts and captions, a riser into the title.
import sys, json, subprocess, os, re
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
V = 'cine_ja'; OUT = '/home/claude/video/final7'; SRC = '/home/claude/video/out7'; M = '/home/claude/video/music/determined_pursuit_loop.wav'
SR = 48000; meta = json.load(open(f'{OUT}/{V}_clips.json')); clips = meta['clips']; TOTAL = meta['total']; N = int(round(TOTAL * SR))
rng = np.random.default_rng(11)
def load(path):
    sr, a = wavfile.read(path); a = a.astype(np.float32) / (32768 if a.dtype == np.int16 else 1)
    if a.ndim == 1: a = np.stack([a, a], 1)
    if sr != SR:
        n = int(len(a) * SR / sr); x = np.linspace(0, len(a) - 1, n); a = np.stack([np.interp(x, np.arange(len(a)), a[:, k]) for k in range(2)], 1).astype(np.float32)
    return a
def put(dst, sig, t, gain=1.0):
    i = int(round(t * SR));
    if i < 0: sig = sig[-i:]; i = 0
    n = min(len(sig), len(dst) - i)
    if n > 0: dst[i:i + n] += sig[:n] * gain
def env(n, attack, release):
    e = np.ones(n, np.float32); a = int(attack * SR); r = int(release * SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e
def band(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], btype='band', fs=SR, output='sos'), x).astype(np.float32)
def low(x, hz): return sosfilt(butter(2, hz, btype='low', fs=SR, output='sos'), x, axis=0).astype(np.float32)
def stereo(x, pan=0.0): return np.stack([x * (1 - max(0, pan)), x * (1 + min(0, pan))], 1).astype(np.float32)

# ---- made sounds ----
def whoosh(dur=.42, f0=500, f1=2600, peak=.55):
    n = int(dur * SR); t = np.arange(n) / n; noise = rng.normal(0, 1, n).astype(np.float32)
    # a band of noise that sweeps up and back: three fixed bands cross-faded
    bands = [band(noise, f0 * .7, f0 * 1.6), band(noise, (f0 * f1) ** .5 * .7, (f0 * f1) ** .5 * 1.5), band(noise, f1 * .7, f1 * 1.4)]
    pos = np.sin(np.pi * t) ** 1.0 * 2; w = [np.clip(1 - np.abs(pos - k), 0, 1) for k in range(3)]
    sig = sum(b * ww for b, ww in zip(bands, w)); e = np.exp(-((t - peak) / .2) ** 2)
    return (sig * e).astype(np.float32)
def boom(dur=.9, f0=82, f1=36, click=.35):
    n = int(dur * SR); t = np.arange(n) / SR; f = f1 + (f0 - f1) * np.exp(-t * 9); ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 5.2); body += .4 * np.sin(ph * 2) * np.exp(-t * 11)
    crack = band(rng.normal(0, 1, n).astype(np.float32), 900, 6000) * np.exp(-t * 38) * click
    rumble = low(rng.normal(0, 1, n).astype(np.float32), 140) * np.exp(-t * 6) * .5
    return np.tanh((body + crack + rumble) * 1.4).astype(np.float32)
def thump(): return boom(.35, 95, 48, .12)
def riser(dur=1.0):
    n = int(dur * SR); t = np.arange(n) / n; f = 180 * (7.5 ** t); tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * .35
    air = band(rng.normal(0, 1, n).astype(np.float32), 1500, 9000) * .6
    return ((tone + air) * t ** 2.6).astype(np.float32)
def sink(dur=.5):   # the pull into slow motion: a tone that falls away
    n = int(dur * SR); t = np.arange(n) / n; f = 190 * (0.32 ** t); return (np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - t) ** 1.5 * np.minimum(1, t * 30)).astype(np.float32)

sfx = np.zeros((N, 2), np.float32); made = np.zeros((N, 2), np.float32); duck = np.ones(N, np.float32)
def duck_range(a, b, depth, ramp=.07):
    i0, i1 = int(a * SR), min(N, int(b * SR)); r = int(ramp * SR)
    shape = np.ones(i1 - i0, np.float32) * depth
    if len(shape) > 2 * r: shape[:r] = np.linspace(1, depth, r); shape[-r:] = np.linspace(depth, 1, r)
    duck[i0:i1] = np.minimum(duck[i0:i1], shape)

T = {c['clip'] + ('_end' if c['kind'] == 'end' else ''): c for c in clips}
for c in clips:
    if c['kind'] != 'shot': continue
    nm = c['name']; path = (f"/home/claude/video/out6/{nm[2:]}" if nm.startswith('6:') else f"{SRC}/{nm}") + "/audio.wav"
    if os.path.exists(path):
        a = load(path); n = int(round(c['dur'] * SR)); tt = np.arange(n) / SR
        sp = c.get('speed') or [[0, 1], [c['dur'], 1]]; ts = [p[0] for p in sp]; vs = [p[1] for p in sp]
        fine = np.linspace(0, c['dur'], 2000); spd = np.interp(fine, ts, vs); pos = c['src'][0] + np.concatenate([[0], np.cumsum((spd[1:] + spd[:-1]) / 2 * np.diff(fine))])
        s = np.interp(tt, fine, pos) * SR; i = np.clip(s.astype(np.int64), 0, len(a) - 2); fr = (s - i)[:, None].astype(np.float32)
        seg = a[i] * (1 - fr) + a[i + 1] * fr; seg *= env(n, .012, .03)[:, None]
        slow = np.interp(tt, ts, vs) < .75
        if slow.any(): seg[slow] *= .75
        put(sfx, seg, c['t0'])
    # slow motion: pull the music back and mark the entry
    sp = c.get('speed')
    if sp:
        slow_parts = [(a, b) for (a, va), (b, vb) in zip(sp, sp[1:]) if max(va, vb) < .75]
        for a, b in slow_parts:
            duck_range(c['t0'] + a - .05, c['t0'] + b + .05, .42); put(made, stereo(sink(min(.6, b - a + .1))), c['t0'] + a - .04, .16)
    for th, strength in c.get('hits') or []:
        put(made, stereo(boom(.8 if strength > 20 else .55, 84, 38, .4 if strength > 20 else .25)), c['t0'] + th - .01, .6 if strength > 20 else .34)

# cuts: a whoosh that peaks on the cut
cut = lambda name: T[name]['t0']
import itertools
for c, pan in zip([c for c in clips if c['kind'] == 'shot'][1:], itertools.cycle([.3, -.3])):
    put(made, stereo(whoosh(), pan), c['t0'] - .55 * .42, .2)
put(made, stereo(whoosh(1.6, 300, 1500, .5)), 0.05, .16)
for name, g in [('open', .3), ('blast1', .28), ('decoy', .26)]: put(made, stereo(thump()), T[name]['t0'] + .3 - .01, g)
end = T['hero_end']['t0']; hit = end + .12; card = end
put(made, stereo(riser(1.1)), end - 1.1, .4)
put(made, stereo(boom(2.4, 78, 30, .5)), hit - .012, .95); put(made, stereo(whoosh(.9, 200, 900, .2)), hit, .2)

# ---- music ----
mus_src = load(M); music = np.zeros((N, 2), np.float32)
def seg(v0, m0, d, fin=.02, fout=.02):
    a = mus_src[int(m0 * SR):int((m0 + d) * SR)].copy(); a *= env(len(a), fin, fout)[:, None]; put(music, a, v0)
seg(0, 12, 6); seg(6, 18, 12); seg(18, 54, end - 18 + .1, .02, .5)
seg(hit, 72, TOTAL - hit, .004, 1.7)
music *= duck[:, None]

SFX = float(os.environ.get('SFX', 2.0)); MUS = float(os.environ.get('MUS', .44)); MADE = float(os.environ.get('MADE', 1.0))
mix = sfx * SFX + music * MUS + made * MADE
i0, i1 = int(end * SR), int(hit * SR); mix[i0:i1] = 0   # the gap before the title is silent
pre = int(.025 * SR); mix[i0 - pre:i0] *= np.linspace(1, 0, pre)[:, None]
raw = f'{OUT}/{V}_mix_raw.wav'; wavfile.write(raw, SR, (np.clip(mix * .5, -1, 1) * 32767).astype(np.int16))
# one static gain to -15 LUFS (no automatic levelling: it would pump the quiet before the title), then a limiter
r = subprocess.run(['ffmpeg', '-hide_banner', '-i', raw, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1]); gain = float(os.environ.get('LUFS', -15)) - I
wav = f'{OUT}/{V}_audio.wav'
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', f'volume={gain:.2f}dB,alimiter=limit=0.89:level=false:attack=3:release=60', '-ar', '48000', wav], check=True)
r = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
print('loudness', re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1], 'LUFS, peak', re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)[-1], 'dBFS, gain', round(gain, 2))
if not os.path.exists(f'{OUT}/{V}_video.mp4'): print('no video yet: audio only'); sys.exit(0)
tmp = f'{OUT}/{V}.tmp.mp4'
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', f'{OUT}/{V}_video.mp4', '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', tmp], check=True)
os.replace(tmp, f'{OUT}/{V}.mp4'); print('done', V, TOTAL)
