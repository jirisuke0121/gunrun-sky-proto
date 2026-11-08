#!/usr/bin/env python3
"""Summarize real-device frame traces (diagnostics.perf) from a read-only Wrangler D1 JSON export.

Every run that carries a perf block is read (all play is traced by default). Device IDs are never printed.
Usage: python3 analyze_perf.py runs-export.json
"""

import argparse
from collections import defaultdict
import json
from pathlib import Path

EXCLUSIVE = ("adv", "cam", "hv", "render")  # parts of one frame; ai and so run inside adv


def load_rows(path):
    data = json.loads(Path(path).read_text())
    if isinstance(data, list) and data and isinstance(data[0], dict) and "results" in data[0]:
        return [row for page in data for row in page.get("results", [])]
    if isinstance(data, dict) and "results" in data:
        return data["results"]
    if isinstance(data, list):
        return data
    raise ValueError("Expected Wrangler --json output or a row array")


def perf_runs(rows):
    for row in rows:
        payload = row.get("json", row)
        if isinstance(payload, str):
            payload = json.loads(payload)
        perf = ((payload or {}).get("diagnostics") or {}).get("perf")
        if isinstance(payload, dict) and isinstance(perf, dict) and perf.get("buckets"):
            yield payload, perf


def device_key(payload):
    env = payload.get("environment") or {}
    parts = [env.get("os"), env.get("osVersion"), env.get("browser"), f"{env.get('cores')}cores" if env.get("cores") else None,
             f"{env.get('screenWidth')}x{env.get('screenHeight')}" if env.get("screenWidth") else None]
    return " ".join(str(p) for p in parts if p) or "unknown device"


def summarize(entries):
    """entries: list of (payload, perf). Frame-weighted means over every 10 s window."""
    n = iv = cpu = iv33 = iv50 = cpu33 = cpu50 = 0.0
    sec = defaultdict(float)
    ai_max = 0.0
    timer = []
    for payload, perf in entries:
        if perf.get("timerMs"):
            timer.append(perf["timerMs"])
        for b in perf["buckets"]:
            w = b["n"]
            n += w
            iv += b["iv"] * w
            cpu += b["cpu"] * w
            iv33 += b["iv33"]
            iv50 += b["iv50"]
            cpu33 += b["cpu33"]
            cpu50 += b["bins"][4] + b["bins"][5]
            for name, (mean, _) in b["s"].items():
                sec[name] += mean * w
            ai_max = max(ai_max, b.get("zMax", 0))
    if not n:
        return None
    mean = lambda v: v / n
    out = {
        "frames": int(n), "seconds": round(iv / 1000, 1), "iv": mean(iv), "cpu": mean(cpu), "gap": mean(iv) - mean(cpu),
        "iv33": iv33 / n, "iv50": iv50 / n, "cpu33": cpu33 / n, "cpu50": cpu50 / n,
        "sec": {k: mean(v) for k, v in sec.items()}, "zMax": ai_max, "timerMs": max(timer) if timer else None,
    }
    out["rest"] = max(0.0, out["cpu"] - sum(out["sec"].get(k, 0) for k in EXCLUSIVE))
    return out


def decide(s):
    """The rules behind 'what to do next'. Returns a list of plain-language lines."""
    lines = []
    smooth = s["iv"] <= 18.5 and s["iv33"] < 0.01
    if smooth:
        lines.append("滑らか（平均18.5 ms以下、33 ms超の割合1%未満）: この端末では最適化を止めてよい。")
    else:
        lines.append(f"カクつきあり（平均{s['iv']:.1f} ms、33 ms超 {s['iv33']*100:.1f}%、50 ms超 {s['iv50']*100:.1f}%）。")
        if s["cpu"] < 0.5 * s["iv"]:
            lines.append(f"CPUは平均{s['cpu']:.1f} msで間隔の半分未満: 描画（GPU）待ちが支配的。ゾンビ側の最適化は打ち切り、影・解像度・描画数を調べる。")
        else:
            parts = {k: s["sec"].get(k, 0) for k in EXCLUSIVE}
            parts["rest"] = s["rest"]
            top = max(parts, key=parts.get)
            label = {"adv": "ゲーム更新", "cam": "カメラ", "hv": "人物の腕", "render": "描画の提出", "rest": "その他（HUD・ミニマップ等）"}[top]
            lines.append(f"CPU内訳で最大は{label}（{parts[top]:.1f} ms / CPU平均{s['cpu']:.1f} ms）。")
            if top == "hv" or parts["hv"] >= 0.25 * s["cpu"]:
                lines.append("→ 人物の腕の曲げ（2番）を軽くする。")
            if top == "adv":
                ai, so = s["sec"].get("ai", 0), s["sec"].get("so", 0)
                lines.append(f"  ゲーム更新のうち ゾンビ{ai:.1f} ms・経路検索{so:.1f} ms。" + (" → ゾンビ更新を調べる。" if ai >= 0.4 * parts["adv"] else ""))
            if top == "render":
                lines.append("→ 描画数・影・解像度を調べる。")
    if s["cpu50"] > 0:
        lines.append(f"50 ms超のCPUスパイクが{s['cpu50']*s['frames']:.0f}回: 下の遅いフレームの場所と状態から、西端のときと同じ手順で関数まで特定する。")
    if s["timerMs"] and s["timerMs"] >= 0.5:
        lines.append(f"注意: この端末のタイマー精度は約{s['timerMs']} ms。小さい区間は0/1 msに丸まるが、10秒平均は有効。")
    return lines


def report(path):
    rows = load_rows(path)
    groups = defaultdict(list)
    for payload, perf in perf_runs(rows):
        groups[(device_key(payload), payload.get("mapKey") or payload.get("map") or "?")].append((payload, perf))
    if not groups:
        return "perf付きのプレイ記録がありません（この版以降のプレイ記録に付く。記録送信がオフの端末、?perf=0 の端末は付かない）。"
    out = []
    for (device, map_key), entries in sorted(groups.items(), key=lambda kv: str(kv[0])):
        s = summarize(entries)
        if not s:
            continue
        out.append(f"■ {device} / {map_key}: {len(entries)}プレイ・{s['frames']}フレーム・約{s['seconds']}秒")
        out.append(f"  間隔 平均{s['iv']:.1f} ms（CPU {s['cpu']:.1f} / 描画待ち等 {s['gap']:.1f}）  33ms超 {s['iv33']*100:.1f}%  50ms超 {s['iv50']*100:.1f}%")
        sec = s["sec"]
        out.append("  CPU内訳 ms: " + "  ".join(f"{k} {sec.get(k, 0):.1f}" for k in EXCLUSIVE) + f"  その他 {s['rest']:.1f}  （うち ゾンビ {sec.get('ai', 0):.1f} / 経路 {sec.get('so', 0):.1f}）")
        out.extend("  " + line for line in decide(s))
        worst = sorted((w for _, p in entries for w in p.get("worst", [])), key=lambda w: -max(w["cpu"], w["iv"] / 2))[:6]
        for w in worst:
            z = w.get("zMax")
            place = w.get("ctx") or {}
            out.append(f"  遅い: t={w['t']}s 間隔{w['iv']} CPU{w['cpu']} (更新{w['adv']} 腕{w['hv']} 描画{w['render']} その他{w['rest']}; ゾンビ{w['ai']} 経路{w['so']})"
                       + (f"  最遅ゾンビ{z['ms']}ms@({z['x']},{z['y']},{z['z']}) {z['act'] or '-'}" if z else "")
                       + (f"  自分@({','.join(str(v) for v in place['p'])}) ゾンビ{place.get('z')}体(10m内{place.get('near')})" if place.get('p') else ""))
        out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export")
    print(report(parser.parse_args().export))
