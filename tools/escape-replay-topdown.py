"""docs/escape-replays/*.json を、上から見た動画(mp4)にする。軽いので数十秒で終わる。
    python3 tools/escape-replay-topdown.py [--fps=20]
白=プレイヤー(軌跡付き)、赤=ゾンビ、青の丸=脱出先。背景は足場(色は高さ)。
"""
import glob, json, math, os, subprocess, sys, tempfile
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = os.path.join(os.path.dirname(__file__), "..")
out_dir = os.path.join(root, "docs", "escape-replays")
fps = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--fps=")), 20))
nodes = json.load(open(os.path.join(out_dir, "map.json")))
report = {s["id"]: s for s in json.load(open(os.path.join(out_dir, "report.json")))["scenarios"]}
NAMES = ["走る", "空中", "滑り", "壁走り", "乗り越え", "登る", "掴み", "フック", "ジップ", "はしご"]

def sample(samples, t):
    if t <= samples[0][0]: return samples[0]
    for a, b in zip(samples, samples[1:]):
        if a[0] <= t <= b[0]:
            f = (t - a[0]) / (b[0] - a[0])
            return [t] + [a[i] + (b[i] - a[i]) * f for i in range(1, 4)] + [a[4], a[5], a[6]]
    return samples[-1]

def zombies_all(log, t):
    if not log: return []
    best = min(log, key=lambda row: abs(row[0] - t))
    return [tuple(z) for z in best[1]]

def zombies(frames, t):
    if not frames: return []
    for a, b in zip(frames, frames[1:] + [None]):
        if b is None or a[0] <= t < b[0]:
            if b is None: return [(r[1] / 100, r[2] / 100, r[3] / 100) for r in a[1]]
            f = (t - a[0]) / (b[0] - a[0]); bm = {r[0]: r for r in b[1]}; res = []
            for r in a[1]:
                n = bm.get(r[0], r)
                res.append(tuple((r[i] + (n[i] - r[i]) * f) / 100 for i in (1, 2, 3)))
            return res
    return []

xs = [n[0] for n in nodes]; zs = [n[2] for n in nodes]
for path in sorted(glob.glob(os.path.join(out_dir, "escape-*.json"))):
    rec = json.load(open(path)); gid = rec["id"]; ghost = rec["ghost"]; S = ghost["samples"]
    frames = (ghost.get("detail") or {}).get("frames", [])
    meta = report.get(gid, {}); target = meta.get("target")
    px = [s[1] for s in S]; pz = [s[3] for s in S]
    # 動いた範囲の周辺だけを大きく映す。
    cx0, cx1 = min(px) - 14, max(px) + 14; cz0, cz1 = min(pz) - 14, max(pz) + 14
    tmp = tempfile.mkdtemp(prefix=f"td-{gid}-"); t0, t1 = S[0][0], S[-1][0]; n = 0; t = t0
    while t <= t1 + 1e-6:
        fig, ax = plt.subplots(figsize=(7.2, 4.8), dpi=100); fig.patch.set_facecolor("#10161c"); ax.set_facecolor("#10161c")
        ax.scatter(xs, zs, c=[p[1] for p in nodes], cmap="cividis", s=14, marker="s", alpha=.55, vmin=-1, vmax=16)
        trail = [s for s in S if s[0] <= t]
        if trail: ax.plot([s[1] for s in trail], [s[3] for s in trail], color="#ffffff", lw=1.6, alpha=.9)
        if target: ax.scatter([target[0]], [target[2]], s=170, facecolors="none", edgecolors="#4aa3ff", linewidths=2)
        zs_now = zombies_all(rec.get("zombies"), t) if rec.get("zombies") else zombies(frames, t)
        if zs_now: ax.scatter([z[0] for z in zs_now], [z[2] for z in zs_now], c="#e5484d", s=90, edgecolors="white", linewidths=.8, zorder=5)
        p = sample(S, t); ax.scatter([p[1]], [p[3]], c="#ffffff", s=70, edgecolors="#10161c", zorder=6)
        near = min((math.sqrt((z[0] - p[1]) ** 2 + (z[1] - p[2]) ** 2 + (z[2] - p[3]) ** 2) for z in zs_now), default=None)
        ax.set_xlim(cx0, cx1); ax.set_ylim(cz1, cz0); ax.set_aspect("equal"); ax.axis("off")
        fig.text(.02, .96, f"{gid}  {meta.get('moves', '')}", color="#dfe8ef", fontsize=10, va="top", family="Noto Sans CJK JP")
        info = f"{t - t0:4.1f} / {t1 - t0:.1f}秒  高さ {p[2]:.1f}m  状態 {NAMES[int(p[6])]}" + (f"  最寄りのゾンビ(高さ込み) {near:.1f}m" if near is not None else "")
        fig.text(.02, .03, info, color="#dfe8ef", fontsize=10, family="Noto Sans CJK JP")
        fig.savefig(os.path.join(tmp, f"f{n:04d}.png"), facecolor=fig.get_facecolor()); plt.close(fig); n += 1; t += 1 / fps
    out = os.path.join(out_dir, f"{gid}-topdown.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(tmp, "f%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", out], check=True)
    print(gid, n, "frames ->", out)
