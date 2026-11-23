#!/usr/bin/env python3
# v2 finishing and assembly.  usage: build2.py <yt_ja|yt_en|cg_land|cg_port> [preview]
#   YouTube/X (30 s, 30 fps): speed ramps and slow motion, motion blur along optical flow (180-degree shutter),
#   handheld shake and impact jolts on the cine shots, grade + glow + grain, animated captions and title.
#   CrazyGames (19.5 s, 60 fps, silent): straight cuts at real speed, grade only (their rules: no fast-forward,
#   no promotional text, no black bars), cover as the opening frame.
# Source frames are the 60 fps captures in out2/<L|J|P>/<shot>/f%05d.jpg (engine.cjs).
import sys, os, json, math, subprocess, glob
import numpy as np, cv2
V = sys.argv[1]; PREVIEW = len(sys.argv) > 2 and sys.argv[2] == 'preview'
ROOT = '/home/claude/video'; A = ROOT + '/assets'; OUT = ROOT + '/final2'; os.makedirs(OUT, exist_ok=True)
YT = V.startswith('yt'); lang = {'yt_ja': 'ja', 'yt_en': 'en'}.get(V); port = V == 'cg_port'
W, H = (1080, 1620) if port else (1920, 1080)
FPS = 30 if YT else 60; BEAT = .375
SRC = ROOT + '/out2/' + ('P' if port else 'L'); SRCJ = ROOT + '/out2/J'
cv2.setNumThreads(2); rng = np.random.default_rng(7)

# ---------------------------------------------------------------- edit list
# name, beats, s0 = first source frame (60 fps), speed = [(seconds into the clip, speed)], shake = handheld amount,
# hits = [(seconds into the clip, pixels)] impact jolts, hud = gameplay camera with the game's own HUD (no shake, no flow blur).
S = lambda name, beats, s0, **k: dict(kind='shot', name=name, beats=beats, s0=s0, **k)
if YT:
    EDL = [dict(kind='still', name='hero', beats=3),
           S('open', 5, 0, speed=[(0, 1), (.58, 1), (.74, .38), (1.3, .38), (1.46, 1.35), (1.875, 1.35)], shake=.55),
           S('chase', 4, 4, shake=1.0),
           S('chase_g', 4, 92, hud=True),
           S('wallrun', 3, 30, shake=.7, label='wallrun'),
           S('dive_c', 3, 24, speed=[(0, 1), (.48, 1), (.56, .3), (.98, .3), (1.05, 1), (1.125, 1)], hits=[(.58, 16)], shake=.35, label='dive'),
           S('swing', 4, 46, speed=[(0, 1), (.5, 1), (.62, .4), (1.02, .4), (1.12, 1), (1.5, 1)], shake=.45, label='swing'),
           S('zip_c', 3, 44, shake=.6, label='zip'),
           S('hook_c', 3, 16, shake=.45, label='hook'),
           S('blast_c', 3, 50, speed=[(0, 1), (.25, 1), (.31, .35), (.76, .35), (.84, 1), (1.125, 1)], hits=[(.29, 30)], shake=.4, label='blast'),
           S('tunnel', 2, 30, hud=True, label='tunnel'),
           S('tunnel_b', 3, 118, speed=[(0, 1.5), (.35, 1.5), (.49, .3), (1.125, .3)], shake=.4, label='tunnel'),
           S('gun_c', 8, 0, shake=.5),
           S('vista', 12, 10, shake=.22),
           S('ramp', 4, 4, shake=.95),
           S('leap', 4, 6, speed=[(0, 1), (.42, 1), (.58, .28), (1.5, .28)], shake=.5),
           dict(kind='end', name='hero', beats=12)]
else:
    EDL = [dict(kind='still', name='cover', beats=2), S('open', 5, 0), S('chase', 4, 4), S('wallrun', 3, 30), S('dive_c', 3, 10), S('swing', 4, 50),
           S('zip_c', 3, 44), S('hook_c', 3, 16), S('blast_c', 3, 38), S('tunnel', 2, 30), S('tunnel_b', 3, 104), S('gun_c', 5, 20), S('vista', 5, 10), S('ramp', 3, 4), S('leap', 4, 6)]
for k, v in json.loads(os.environ.get('S0', '{}')).items():
    for c in EDL:
        if c['name'] == k: c['s0'] = v
clips = []; acc = 0.0; done = 0
for c in EDL:
    acc += c['beats'] * BEAT * FPS; n = round(acc) - done; clips.append(dict(c, n=n, t0=done / FPS, dur=n / FPS)); done += n
TOTAL = done

# ---------------------------------------------------------------- frames, flow, blur
gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
_cache = {}
def src_dir(c):
    if lang == 'ja' and c.get('hud') and os.path.isdir(f"{SRCJ}/{c['name']}"): return f"{SRCJ}/{c['name']}"
    return f"{SRC}/{c['name']}"
_count = {}
def read(d, i):
    if d not in _count: _count[d] = len(glob.glob(d + '/f*.jpg'))
    i = max(0, min(_count[d] - 1, int(i))); key = (d, i)
    if key not in _cache:
        if len(_cache) > 6: _cache.pop(next(iter(_cache)))
        img = cv2.imread(f"{d}/f{i:05d}.jpg")
        if img.shape[1] != W or img.shape[0] != H: img = cv2.resize(img, (W, H), interpolation=cv2.INTER_LANCZOS4)
        _cache[key] = img
    return _cache[key]
_fcache = {}
def flow(d, i):
    key = (d, i)
    if key not in _fcache:
        if len(_fcache) > 3: _fcache.pop(next(iter(_fcache)))
        a = cv2.cvtColor(cv2.resize(read(d, i), (W // 2, H // 2), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        b = cv2.cvtColor(cv2.resize(read(d, i + 1), (W // 2, H // 2), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        f = dis.calc(a, b, None); f = cv2.GaussianBlur(f, (0, 0), 3)
        m = np.hypot(f[..., 0], f[..., 1]); s = np.minimum(1, 45 / np.maximum(m, 1e-3)); f = f * s[..., None]   # cap: 90 px at full size
        _fcache[key] = cv2.resize(f, (W, H), interpolation=cv2.INTER_LINEAR) * 2
    return _fcache[key]
def at(d, p):
    """Source picture at fractional frame p (flow-warped in-between for slow motion below half speed)."""
    i = math.floor(p); fr = p - i
    if fr < .06: return read(d, i)
    if fr > .94: return read(d, i + 1)
    f = flow(d, i); a = read(d, i); b = read(d, i + 1)
    wa = cv2.remap(a, gx - f[..., 0] * fr, gy - f[..., 1] * fr, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    wb = cv2.remap(b, gx + f[..., 0] * (1 - fr), gy + f[..., 1] * (1 - fr), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return cv2.addWeighted(wa, 1 - fr, wb, fr, 0)
def mblur(img, f, amount):
    """Average of the picture slid along the flow over the time the shutter is open."""
    small = f[::8, ::8]; mag = float(np.percentile(np.hypot(small[..., 0], small[..., 1]), 98)) * amount
    if mag < 1.5: return img
    n = int(min(11, max(3, round(mag / 2.5)))); acc = np.zeros(img.shape, np.float32)
    for t in [float(v) for v in np.linspace(-.5, .5, n)]:
        cv2.accumulate(cv2.remap(img, gx - f[..., 0] * (amount * t), gy - f[..., 1] * (amount * t), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE), acc)
    return cv2.convertScaleAbs(acc, alpha=1 / n)
def positions(c):
    """Source frame position for each output frame, and the advance to the next one."""
    sp = c.get('speed') or [(0, 1), (c['dur'], 1)]; ts = [a for a, _ in sp]; vs = [b for _, b in sp]
    fine = 20; p = float(c['s0']); out = []
    for k in range(c['n'] + 1):
        out.append(p)
        for j in range(fine): p += 60 / FPS / fine * float(np.interp((k + (j + .5) / fine) / FPS, ts, vs))
    return out

# ---------------------------------------------------------------- shake
def shake(img, t, amp, hits, seed):
    if amp <= 0 and not hits: return img
    ph = np.random.default_rng(seed).uniform(0, 6.283, 9); k = H / 1080
    dx = amp * (3.4 * math.sin(5.6 * t + ph[0]) + 1.9 * math.sin(14.5 * t + ph[1]) + .9 * math.sin(31 * t + ph[2])) * k
    dy = amp * (2.8 * math.sin(6.9 * t + ph[3]) + 1.7 * math.sin(17.3 * t + ph[4]) + .8 * math.sin(36 * t + ph[5])) * k
    rot = amp * (.16 * math.sin(4.3 * t + ph[6]) + .08 * math.sin(12.1 * t + ph[7])); zoom = 1.035
    for th, s in hits or []:
        if t >= th:
            e = math.exp(-(t - th) * 9) * s * k; dx += e * math.sin((t - th) * 58 + 1.3); dy += e * math.cos((t - th) * 49); rot += e * .012 * math.sin((t - th) * 40); zoom += e * .0009
    M = cv2.getRotationMatrix2D((W / 2, H / 2), rot, zoom); M[0, 2] += dx; M[1, 2] += dy
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

# ---------------------------------------------------------------- grade
x = np.arange(256, dtype=np.float32) / 255
def curve(v, lift, gain, shadow, high):
    s = v * v * (3 - 2 * v); y = v + .42 * (s - v)                       # S-curve
    y = y + shadow * (1 - v) ** 2 + high * v ** 2                         # split tone: add to shadows / highlights
    return np.clip((lift + y * (1 - lift)) * gain, 0, 1)
LUT = np.zeros((256, 1, 3), np.uint8)
LUT[:, 0, 0] = np.round(curve(x, .012, 1.0, .028, -.03) * 255)   # blue: cool shadows, less in the highlights
LUT[:, 0, 1] = np.round(curve(x, .008, 1.0, .004, -.004) * 255)
LUT[:, 0, 2] = np.round(curve(x, .008, 1.0, -.012, .03) * 255)   # red: warm highlights
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); r2 = ((xx / W - .5) * 2) ** 2 * .85 + ((yy / H - .5) * 2) ** 2
VIG = (1 - .30 * np.clip(r2 - .22, 0, 1.6)); VIG3 = np.round(np.clip(VIG, 0, 1)[..., None].repeat(3, 2) * 255).astype(np.uint8)
def grade(img, grain=True, dark=1.0):
    small = cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    glow = cv2.GaussianBlur(cv2.subtract(small, (168, 168, 168, 0)), (0, 0), 10 * H / 1080)
    img = cv2.add(img, cv2.convertScaleAbs(cv2.resize(glow, (W, H), interpolation=cv2.INTER_LINEAR), alpha=.5))
    img = cv2.LUT(img, LUT)
    g = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR); img = cv2.addWeighted(img, 1.14, g, -.14, 0)
    img = cv2.multiply(img, VIG3, scale=dark / 255)
    if grain:
        n = cv2.resize(rng.normal(0, 3.4, (H // 2, W // 2)).astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
        img = cv2.add(img, cv2.merge([n, n, n]), dtype=cv2.CV_8U)
    return img

# ---------------------------------------------------------------- text
ease = lambda u: 1 - (1 - min(1, max(0, u))) ** 3
class Overlay:
    def __init__(self, png, t0, t1, kind):
        self.img = cv2.imread(png, cv2.IMREAD_UNCHANGED); self.t0, self.t1, self.kind = t0, t1, kind
        ys, xs = np.nonzero(self.img[..., 3] > 6); self.box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        self.cx = (self.box[0] + self.box[2]) / 2; self.cy = (self.box[1] + self.box[3]) / 2
        if kind == 'title': self.cx = W * .06; self.cy = H * .9     # grows from its own corner, so it stays inside the frame
    def draw(self, frame, t):
        if not (self.t0 <= t < self.t1): return
        a = t - self.t0; b = self.t1 - t; s = 1.0; dx = 0.0; op = 1.0; k = W / 1920
        if self.kind == 'slam':      # lands from large, a touch of overshoot, leaves to the left
            u = ease(a / .2); s = 1 + .42 * (1 - u) - .035 * math.sin(min(1, a / .32) * math.pi); op = min(1, a / .1);
            if b < .16: op = b / .16; dx = -(1 - b / .16) * 46 * k
            s *= 1 + .012 * a
        elif self.kind == 'label':   # slides in from the left edge
            u = ease(a / .16); dx = -(1 - u) * 150 * k; op = min(1, a / .08)
            if b < .1: op = b / .1
        elif self.kind == 'title':   # the title hits and then drifts
            u = ease(a / .22); s = (1 + 1.1 * (1 - u)) * (1 + .010 * a); op = min(1, a / .07)
        else:
            op = min(1, a / .3, b / .3)
        M = np.float32([[s, 0, self.cx * (1 - s) + dx], [0, s, self.cy * (1 - s)]])
        x0, y0, x1, y1 = self.box; pts = np.float32([[x0, y0], [x1, y1]]) @ M[:, :2].T + M[:, 2]
        X0 = int(max(0, math.floor(pts[0, 0]) - 2)); Y0 = int(max(0, math.floor(pts[0, 1]) - 2)); X1 = int(min(W, math.ceil(pts[1, 0]) + 2)); Y1 = int(min(H, math.ceil(pts[1, 1]) + 2))
        if X1 <= X0 or Y1 <= Y0: return
        M2 = M.copy(); M2[0, 2] -= X0; M2[1, 2] -= Y0
        o = cv2.warpAffine(self.img, M2, (X1 - X0, Y1 - Y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        al = (o[..., 3:4].astype(np.float32) / 255) * op; roi = frame[Y0:Y1, X0:X1]
        roi[:] = (roi * (1 - al) + o[..., :3] * al).astype(np.uint8)

T = {c['name'] + ('_end' if c['kind'] == 'end' else ''): c for c in clips}
overlays = []
if lang:
    ov = lambda name, t0, t1, kind: overlays.append(Overlay(f"{A}/{name}_{lang}.png", t0, t1, kind))
    ov('c1', .28, 2.85, 'slam'); ov('c2', 3.12, 5.85, 'slam')
    seen = {}
    for c in clips:
        if c.get('label'): seen.setdefault(c['label'], [c['t0'], c['t0'] + c['dur']])[1] = c['t0'] + c['dur']
    for name, (a, b) in seen.items(): ov('l_' + name, a + .05, b - .05, 'label')
    ov('c4', T['gun_c']['t0'] + .15, T['gun_c']['t0'] + T['gun_c']['dur'] - .12, 'slam')
    ov('c5', T['vista']['t0'] + .5, T['vista']['t0'] + T['vista']['dur'] - .25, 'fade')
    ov('c6', T['ramp']['t0'] + .1, T['leap']['t0'] + .62, 'slam')
    overlays.append(Overlay(f"{A}/end_{lang}.png", T['hero_end']['t0'] + .12, 1e9, 'title'))

# ---------------------------------------------------------------- stills
def still(path, n, k, z0, z1, drift=.012):
    img = cv2.imread(path); u = k / max(1, n - 1); z = z0 + (z1 - z0) * u; ih, iw = img.shape[:2]
    cw = iw / z; ch = cw * H / W
    if ch > ih / 1.0: ch = ih / z; cw = ch * W / H
    cxp = iw / 2 + iw * drift * u; cyp = ih / 2
    M = np.float32([[W / cw, 0, W / 2 - cxp * W / cw], [0, H / ch, H / 2 - cyp * H / ch]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_AREA if W / cw < 1 else cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

# ---------------------------------------------------------------- render
vid = f"{OUT}/{V}_video.mp4"; tmp = vid.replace('.mp4', '.tmp.mp4')
crf = os.environ.get('CRF', '20' if YT else '19')
ff = None
if not PREVIEW:
    ff = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                           '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
else:
    os.makedirs(f"{OUT}/{V}_preview", exist_ok=True)
meta = []
for ci, c in enumerate(clips):
    if os.environ.get('ONLY') and c['name'] not in os.environ['ONLY'].split(','): continue
    info = dict(name=c['name'], kind=c['kind'], t0=c['t0'], dur=c['dur'])
    if c['kind'] == 'shot':
        d = src_dir(c); pos = positions(c); info['src'] = [pos[0] / 60, pos[-1] / 60]; info['speed'] = c.get('speed'); info['hits'] = c.get('hits'); info['hud'] = bool(c.get('hud'))
    meta.append(info)
    for k in range(c['n']):
        tg = c['t0'] + k / FPS
        if PREVIEW and (k % max(1, c['n'] // 3)) and k != c['n'] - 1: continue
        if c['kind'] == 'shot':
            p = pos[k]; adv = pos[k + 1] - pos[k]
            if not YT: img = grade(read(d, round(p)), grain=False)
            else:
                if c.get('hud'): img = cv2.addWeighted(read(d, math.floor(p)), .5, read(d, math.floor(p) + 1), .5, 0)   # frame blend keeps the HUD crisp
                else: img = mblur(at(d, p), flow(d, math.floor(p)), adv / 2)
                img = grade(img)
                if not c.get('hud'): img = shake(img, k / FPS, c.get('shake', 0), c.get('hits'), 100 + ci)
        elif c['kind'] == 'still':
            base = f"{A}/{'cover_port' if port else ('cover_land' if c['name'] == 'cover' else 'hero_big')}.png"
            img = still(base, c['n'], k, 1.0, 1.06 if YT else 1.04)
            if YT: img = grade(img); img = shake(img, k / FPS, .25, None, 50)
            else: img = img if k == 0 else img      # the cover itself is the first frame
        else:
            a = k / FPS; img = still(f"{A}/hero_big.png", c['n'], k, 1.12, 1.0, 0)
            img = cv2.GaussianBlur(img, (0, 0), 2.2); img = grade(img, dark=.5 + .12 * math.exp(-a * 5))
            hit = .12
            if a < hit: img = (img * (a / hit) ** 2).astype(np.uint8)                                 # out of black
            else:
                fl = math.exp(-(a - hit) * 9); img = cv2.addWeighted(img, 1, np.full_like(img, 255), .55 * fl, 0)   # flash as the title lands
            img = shake(img, a, .12, [(hit, 26)], 77)
        if YT and c['name'] == 'leap' and c['kind'] == 'shot' and k >= c['n'] - 3: img = (img * ((c['n'] - k - 1) / 3) ** 1.5).astype(np.uint8)   # dip to black before the title
        if overlays:
            img = np.ascontiguousarray(img)
            for o in overlays: o.draw(img, tg)
        if PREVIEW: cv2.imwrite(f"{OUT}/{V}_preview/{ci:02d}_{c['name']}_{k:03d}.jpg", cv2.resize(img, (W // 2, H // 2)), [cv2.IMWRITE_JPEG_QUALITY, 85])
        else: ff.stdin.write(np.ascontiguousarray(img).tobytes())
    print(V, c['name'], c['n'], flush=True)
json.dump(dict(fps=FPS, total=TOTAL / FPS, clips=meta), open(f"{OUT}/{V}_clips.json", 'w'), indent=1)
if ff:
    ff.stdin.close(); assert ff.wait() == 0; os.replace(tmp, vid); print('wrote', vid, TOTAL / FPS)
