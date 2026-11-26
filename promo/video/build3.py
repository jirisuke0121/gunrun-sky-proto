#!/usr/bin/env python3
# Escape-run video (30 s, 30 fps, ja): one run across the whole map with the skills. usage: build3.py [preview]
# Frames: out5/<take>/f%05d.jpg + log.json (runner and chaser positions per frame, from the game).
import sys, os, json, math, subprocess, glob
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
PREVIEW = len(sys.argv) > 1 and sys.argv[1] == 'preview'
V = 'run_ja'; lang = 'ja'
ROOT = '/home/claude/video'; A = ROOT + '/assets3'; OUT = ROOT + '/final5'; os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080; FPS = 30; BEAT = .375; SRC = ROOT + '/out5'; SRC6 = ROOT + '/out6'
cv2.setNumThreads(2); rng = np.random.default_rng(7)
# name, take (out5/<src>), sfps of the take, tick0 = game tick of its first saved frame, beats, s0 = first source frame,
# speed = [(seconds into the clip, speed)], timer = seconds left at tick 0 of the take
S = lambda name, src, sfps, tick0, beats, s0, timer, **k: dict(kind='shot', name=name, src=src, sfps=sfps, tick0=tick0, beats=beats, s0=s0, timer=timer, **k)
EDL = [S('open', 'open', 30, 0, 9, 2, 120, shake=.3),
       S('flash', '6:flash', 60, 0, 8, 6, 112, speed=[(0, 1), (.85, 1), (.92, .4), (1.4, .4), (1.5, 1.35), (3.0, 1.35)], hits=[(.91, 10)], shake=.5, label='flash'),
       S('blast', '6:blast', 60, 204, 5, 8, 112, speed=[(0, 1.6), (.70, 1.6), (.78, .35), (1.30, .35), (1.40, 1.2), (1.875, 1.2)], hits=[(.76, 30)], shake=.4, label='blast'),
       S('gun', '6:gun', 30, 0, 6, 4, 97, speed=[(0, 1), (.55, 1), (.62, .5), (1.6, .5), (1.7, 1), (2.25, 1)], shake=.35),
       S('decoy', 'decoy', 30, 0, 9, 0, 74, shake=.3, label='decoy'),
       S('zip', 'zip', 30, 180, 4, 3, 74, shake=.6, label='zip'),
       S('rescue', '6:rescue2', 60, 0, 8, 40, 41, speed=[(0, 1), (.30, 1), (.36, .55), (1.3, .55), (1.4, 1), (3.0, 1)], shake=.3, label='rescue'),
       S('chainA', 'chainA', 60, 36, 5, 0, 6.7, shake=.55, label='chain'),
       S('chainB', 'chainB', 60, 240, 7, 6, 6.7, speed=[(0, 1), (1.45, 1), (1.52, .4), (1.95, .4), (2.05, 1.3), (2.625, 1.3)], shake=.5, label='chain'),
       dict(kind='card', name='card', src='card', sfps=30, beats=6, s0=30),
       dict(kind='end', name='hero', beats=13)]
E = json.loads(os.environ.get('EDL', '{}'))
for c in EDL:
    c.update(E.get(c['name'], {}))
clips = []; acc = 0.0; done = 0
for c in EDL:
    acc += c['beats'] * BEAT * FPS; n = round(acc) - done; clips.append(dict(c, n=n, t0=done / FPS, dur=n / FPS)); done += n
TOTAL = done

# ---------------------------------------------------------------- frames, flow, blur
gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
_cache = {}
def src_dir(c): return f"{SRC6}/{c['src'][2:]}" if c['src'].startswith('6:') else f"{SRC}/{c['src']}"
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
        for j in range(fine): p += c['sfps'] / FPS / fine * float(np.interp((k + (j + .5) / fine) / FPS, ts, vs))
    return out

# ---------------------------------------------------------------- shake
def shake(img, t, amp, hits, seed, push=0.0):
    if amp <= 0 and not hits: return img
    ph = np.random.default_rng(seed).uniform(0, 6.283, 9); k = H / 1080
    dx = amp * (3.4 * math.sin(5.6 * t + ph[0]) + 1.9 * math.sin(14.5 * t + ph[1]) + .9 * math.sin(31 * t + ph[2])) * k
    dy = amp * (2.8 * math.sin(6.9 * t + ph[3]) + 1.7 * math.sin(17.3 * t + ph[4]) + .8 * math.sin(36 * t + ph[5])) * k
    rot = amp * (.16 * math.sin(4.3 * t + ph[6]) + .08 * math.sin(12.1 * t + ph[7])); zoom = 1.035 + push   # push: a slow move in over the clip
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
ov = lambda name, t0, t1, kind: overlays.append(Overlay(f"{A}/{name}_{lang}.png", t0, t1, kind))
ov('c1', .35, T['open']['t0'] + T['open']['dur'] - .2, 'slam')
seen = {}
for c in clips:
    if c.get('label'): seen.setdefault(c['label'], [c['t0'], c['t0'] + c['dur']])[1] = c['t0'] + c['dur']
for name, (a, b) in seen.items(): ov('l_' + name, a + .05, b - .05, 'label')
ov('c2', T['gun']['t0'] + .15, T['gun']['t0'] + T['gun']['dur'] - .12, 'slam')
overlays.append(Overlay(f"{A}/end_{lang}.png", T['hero_end']['t0'] + .12, 1e9, 'title'))

# ---------------------------------------------------------------- route map + time left (drawn from the game's own positions)
hm = np.load(ROOT + '/assets/hm.npy'); X0, Z0, CELL = -69, -37, .5
PXM = 3.7; MW, MH = int(128 * PXM), int(64 * PXM); PAD = 18; TOP = 78; PW, PH = MW + 2 * PAD, MH + 2 * PAD + TOP; PX, PY = W - PW - 48, 40
solid = hm > -50; hv = np.clip((hm + 4) / 20, 0, 1)
base = np.zeros(hm.shape + (4,), np.uint8); base[..., 0] = 150 + 90 * hv; base[..., 1] = 160 + 80 * hv; base[..., 2] = 185 + 60 * hv; base[..., 3] = np.where(solid, 190 + 60 * hv, 0)
base_im = Image.fromarray(base, 'RGBA').resize((MW, MH), Image.BILINEAR)
FD = ImageFont.truetype('/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf', 46); FJ = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 22, index=0)
mp = lambda x, z: (PAD + (x - X0) * PXM, PAD + TOP + (z - Z0) * PXM)
logs = {}
def log(src):
    if src not in logs: logs[src] = [e[1] for e in json.load(open((f'{SRC6}/{src[2:]}' if src.startswith('6:') else f'{SRC}/{src}') + '/log.json'))['log']]
    return logs[src]
segs = {}   # finished clips: list of map points
SS = 2      # supersample
def panel(frame, c, p, tg):
    L = log(c['src']); k = max(0, min(len(L) - 1, int(round(p)))); k0 = int(c['s0'])
    pts = [mp(e['p'][0], e['p'][2]) for e in L[k0:k + 1]]; segs[c['name']] = pts
    tick = c['tick0'] + p * 60 / c['sfps']; left = max(0.0, c['timer'] - tick / 60)
    im = Image.new('RGBA', (PW * SS, PH * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, PW * SS - 1, PH * SS - 1], 18 * SS, fill=(12, 18, 28, 185), outline=(255, 255, 255, 46), width=SS)
    im.alpha_composite(base_im.resize((MW * SS, MH * SS), Image.BILINEAR), (PAD * SS, (PAD + TOP) * SS))
    d.text((PAD * SS, 30 * SS), '残り時間', font=FJ.font_variant(size=30 * SS), fill=(255, 255, 255, 225))
    txt = f"{int(left) // 60}:{int(left) % 60:02d}"; warn = left < 10
    d.text((PW * SS - PAD * SS, 10 * SS), txt, font=FD.font_variant(size=62 * SS), fill=(255, 120, 90, 255) if warn else (255, 255, 255, 255), anchor='ra')
    sc = lambda q: [(x * SS, y * SS) for x, y in q]
    prev = None
    for cc in clips:
        q = segs.get(cc['name'])
        if not q: continue
        if prev is not None and math.hypot(q[0][0] - prev[0], q[0][1] - prev[1]) > 2:   # the run between two scenes: dotted
            n = int(math.hypot(q[0][0] - prev[0], q[0][1] - prev[1]) / 7)
            for j in range(1, n): u = j / n; x = prev[0] + (q[0][0] - prev[0]) * u; y = prev[1] + (q[0][1] - prev[1]) * u; d.ellipse([x * SS - 2 * SS, y * SS - 2 * SS, x * SS + 2 * SS, y * SS + 2 * SS], fill=(255, 159, 112, 170))
        if len(q) > 1: d.line(sc(q), fill=(255, 159, 112, 255), width=5 * SS, joint='curve')
        prev = q[-1]
        if cc['name'] == c['name']: break
    for zx, zz in L[k]['z']:
        x, y = mp(zx, zz)
        if PAD < x < PW - PAD and PAD + TOP < y < PH - PAD: d.ellipse([x * SS - 4 * SS, y * SS - 4 * SS, x * SS + 4 * SS, y * SS + 4 * SS], fill=(235, 60, 70, 255))
    x, y = pts[-1]; d.ellipse([x * SS - 8 * SS, y * SS - 8 * SS, x * SS + 8 * SS, y * SS + 8 * SS], fill=(255, 159, 112, 255)); d.ellipse([x * SS - 5 * SS, y * SS - 5 * SS, x * SS + 5 * SS, y * SS + 5 * SS], fill=(255, 255, 255, 255))
    im = im.resize((PW, PH), Image.LANCZOS); o = np.asarray(im); op = min(1.0, max(0.0, (tg - .5) / .35))
    al = o[..., 3:4].astype(np.float32) / 255 * op; roi = frame[PY:PY + PH, PX:PX + PW]
    roi[:] = (roi * (1 - al) + o[..., 2::-1] * al).astype(np.uint8)

# ---------------------------------------------------------------- stills
def still(path, n, k, z0, z1, drift=.012):
    img = cv2.imread(path); u = k / max(1, n - 1); z = z0 + (z1 - z0) * u; ih, iw = img.shape[:2]
    cw = iw / z; ch = cw * H / W
    if ch > ih / 1.0: ch = ih / z; cw = ch * W / H
    cxp = iw / 2 + iw * drift * u; cyp = ih / 2
    M = np.float32([[W / cw, 0, W / 2 - cxp * W / cw], [0, H / ch, H / 2 - cyp * H / ch]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_AREA if W / cw < 1 else cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


# ---------------------------------------------------------------- render
if not os.path.exists(f"{A}/hero_big.png"): cv2.imwrite(f"{A}/hero_big.png", cv2.imread(f"{SRC}/open/f00000.jpg"))
vid = f"{OUT}/{V}_video.mp4"; tmp = vid.replace('.mp4', '.tmp.mp4'); ff = None
if not PREVIEW:
    ff = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', os.environ.get('CRF', '19'), '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                           '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
else: os.makedirs(f"{OUT}/{V}_preview", exist_ok=True)
FLASH_TICK = float(os.environ.get('FLASH_TICK', 62))
meta = []
for ci, c in enumerate(clips):
    if os.environ.get('ONLY') and c['name'] not in os.environ['ONLY'].split(','): 
        if c['kind'] == 'shot' and PREVIEW and os.path.exists(f"{SRC}/{c['src']}/log.json"): L = log(c['src']); pos = positions(c); segs[c['name']] = [mp(e['p'][0], e['p'][2]) for e in L[int(c['s0']):int(round(pos[-1])) + 1]]
        continue
    info = dict(name=c.get('src', c['name']), kind='shot' if c['kind'] == 'shot' else c['kind'], t0=c['t0'], dur=c['dur'], clip=c['name'])
    if c['kind'] == 'shot':
        d = src_dir(c); pos = positions(c); info['src'] = [pos[0] / c['sfps'], pos[-1] / c['sfps']]; info['speed'] = c.get('speed'); info['hits'] = c.get('hits')
    meta.append(info)
    for k in range(c['n']):
        tg = c['t0'] + k / FPS
        if PREVIEW and (k % max(1, c['n'] // int(os.environ.get('PN', 3)))) and k != c['n'] - 1: continue
        if c['kind'] == 'shot':
            p = pos[k]; adv = pos[k + 1] - pos[k]
            img = mblur(at(d, p), flow(d, math.floor(p)), adv / 2 * 60 / c['sfps'] / 2 if c['sfps'] == 30 else adv / 2)
            img = grade(img)
            if c['name'] == 'flash':   # the game's own full-screen flash (a page overlay, not in the 3D picture): same curve as flashbang.js
                kb = next((j for j in range(c['n']) if c['tick0'] + pos[j] >= FLASH_TICK), None); age = (k - kb) / FPS if kb is not None else -1
                if 0 <= age < .5: fade = max(0, 1 - max(0, age - .065) / (.5 - .065)); img = cv2.addWeighted(img, 1, np.full_like(img, 255), .5 * fade ** 1.35, 0)
            img = shake(img, k / FPS, c.get('shake', 0), c.get('hits'), 100 + ci, .03 * k / max(1, c['n'] - 1))
            img = np.ascontiguousarray(img); panel(img, c, p, tg)
        elif c['kind'] == 'card':
            img = read(f"{SRC}/card", c['s0'] + k); z = 1.7 + .06 * k / c['n']; M = cv2.getRotationMatrix2D((W / 2, H / 2), 0, z); img = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            a = k / FPS
            if a < .25: img = cv2.addWeighted(img, 1, np.full_like(img, 255), .6 * (1 - a / .25) ** 2, 0)
            if k >= c['n'] - 3: img = (img * ((c['n'] - k - 1) / 3) ** 1.5).astype(np.uint8)
        else:
            a = k / FPS; img = still(f"{A}/hero_big.png", c['n'], k, 1.12, 1.0, 0)
            img = cv2.GaussianBlur(img, (0, 0), 2.2); img = grade(img, dark=.36 + .14 * math.exp(-a * 5)); hit = .12
            if a < hit: img = (img * (a / hit) ** 2).astype(np.uint8)
            else: fl = math.exp(-(a - hit) * 9); img = cv2.addWeighted(img, 1, np.full_like(img, 255), .55 * fl, 0)
            img = shake(img, a, .12, [(hit, 26)], 77)
        img = np.ascontiguousarray(img)
        for o in overlays: o.draw(img, tg)
        if PREVIEW: cv2.imwrite(f"{OUT}/{V}_preview/{ci:02d}_{c['name']}_{k:03d}.jpg", cv2.resize(img, (W // 2, H // 2)), [cv2.IMWRITE_JPEG_QUALITY, 85])
        else: ff.stdin.write(img.tobytes())
    print(V, c['name'], c['n'], flush=True)
if not os.environ.get('ONLY'): json.dump(dict(fps=FPS, total=TOTAL / FPS, clips=meta), open(f"{OUT}/{V}_clips.json", 'w'), indent=1)
if ff:
    ff.stdin.close(); assert ff.wait() == 0; os.replace(tmp, vid); print('wrote', vid, TOTAL / FPS)
