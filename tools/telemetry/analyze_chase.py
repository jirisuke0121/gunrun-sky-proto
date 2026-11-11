#!/usr/bin/env python3
"""Tension and release in real play, from the per-second trail every play record already carries.

Each trail sample is [t, x, y, z, state, move, nearest pursuer (m), path distance, pursuers within 9 m].
For every run this prints how the 2-3 minutes split into "pressed" (nearest pursuer under 4 m), "between"
and "clear" (12 m or more), how many times the player got away (went from under 5 m to 12 m or more and
stayed there 3 s or longer), how long those breaks lasted, and where players came down off the roofs
without a recorded fall (3 m or more of height lost within one second).  Device IDs are never printed.

Usage: python3 analyze_chase.py runs-export.json      (the Wrangler export described in README.md)
       python3 analyze_chase.py --selftest
"""

import argparse
from collections import defaultdict
import json
from pathlib import Path
import statistics

PRESSED, CLOSE, CLEAR, HOLD, DROP = 4.0, 5.0, 12.0, 3.0, 3.0


def load_rows(path):
    data = json.loads(Path(path).read_text())
    if isinstance(data, list) and data and isinstance(data[0], dict) and "results" in data[0]:
        return [row for page in data for row in page.get("results", [])]
    if isinstance(data, dict) and "results" in data:
        return data["results"]
    if isinstance(data, list):
        return data
    raise ValueError("Expected Wrangler --json output or a row array")


def payloads(rows):
    for row in rows:
        payload = row.get("json", row)
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except ValueError:
                continue
        if isinstance(payload, dict) and len(payload.get("trail") or []) >= 10:
            yield payload


def group_of(payload):
    settings = payload.get("settings") or {}
    level = payload.get("difficulty") or settings.get("difficulty") or settings.get("challenge") or "unknown level"
    return f"{payload.get('map') or 'old town'} / {level}"


def run_wave(trail):
    """One run's split and its getaways. Samples are about one second apart; gaps are weighted by their length."""
    pressed = between = clear = 0.0
    getaways, drops = [], []
    was_close, start = False, None
    for prev, cur in zip(trail, trail[1:]):
        dt = max(0.0, min(3.0, cur[0] - prev[0]))
        nearest = cur[6]
        if nearest < PRESSED:
            pressed += dt
        elif nearest >= CLEAR:
            clear += dt
        else:
            between += dt
        if nearest >= CLEAR:
            if start is None and was_close:
                start = cur[0]
        else:
            if start is not None and cur[0] - start >= HOLD:
                getaways.append(cur[0] - start)
            start = None
            if nearest < CLOSE:
                was_close = True
        if nearest >= CLEAR and start is not None:
            was_close = False
        if prev[2] - cur[2] >= DROP and dt <= 1.6:
            drops.append((round(prev[1] / 4) * 4, round(prev[2]), round(prev[3] / 4) * 4))
    if start is not None and trail[-1][0] - start >= HOLD:
        getaways.append(trail[-1][0] - start)
    total = pressed + between + clear
    return {"seconds": total, "pressed": pressed, "between": between, "clear": clear, "getaways": getaways, "drops": drops}


def summarize(runs):
    waves = [run_wave(p["trail"]) for p in runs]
    total = sum(w["seconds"] for w in waves) or 1.0
    breaks = [g for w in waves for g in w["getaways"]]
    falls = [((p.get("stats") or {}).get("falls") or 0) for p in runs]
    places = defaultdict(int)
    for w in waves:
        for place in w["drops"]:
            places[place] += 1
    return {
        "runs": len(runs), "minutes": total / 60,
        "pressed": sum(w["pressed"] for w in waves) / total, "between": sum(w["between"] for w in waves) / total,
        "clear": sum(w["clear"] for w in waves) / total,
        "getaways_per_minute": len(breaks) / (total / 60), "getaway_median": statistics.median(breaks) if breaks else 0.0,
        "runs_without_getaway": sum(1 for w in waves if not w["getaways"]),
        "falls_per_run": sum(falls) / len(runs), "drops_per_run": sum(len(w["drops"]) for w in waves) / len(runs),
        "drop_places": sorted(places.items(), key=lambda item: -item[1])[:10],
    }


def report(rows):
    groups = defaultdict(list)
    for payload in payloads(rows):
        groups[group_of(payload)].append(payload)
    if not groups:
        print("No run with a trail of 10 samples or more.")
        return {}
    out = {}
    for name in sorted(groups):
        s = out[name] = summarize(groups[name])
        print(f"\n{name}: {s['runs']} runs, {s['minutes']:.1f} min of play")
        print(f"  pressed (pursuer under {PRESSED:.0f} m) {s['pressed']:.0%} / between {s['between']:.0%} / clear ({CLEAR:.0f} m or more) {s['clear']:.0%}")
        print(f"  getaways (under {CLOSE:.0f} m -> {CLEAR:.0f} m or more, held {HOLD:.0f} s+): {s['getaways_per_minute']:.2f} per minute, "
              f"median length {s['getaway_median']:.1f} s, runs with none: {s['runs_without_getaway']}/{s['runs']}")
        print(f"  recorded falls per run {s['falls_per_run']:.2f}; came down {DROP:.0f} m+ within a second {s['drops_per_run']:.2f} per run")
        if s["drop_places"]:
            print("  where players came down most (x, height, z rounded to 4 m): " + ", ".join(f"{p} x{n}" for p, n in s["drop_places"]))
        if s["pressed"] > .5:
            print("  -> pressed more than half the time: little release. Look at pursuer pace and at the getaway spots.")
        elif s["clear"] > .6:
            print("  -> clear more than 60% of the time: little tension. The pursuers rarely get near.")
        elif s["getaways_per_minute"] < .5:
            print("  -> fewer than one getaway every two minutes: the tension-release cycle is not turning.")
    return out


def selftest():
    def run(pattern):
        trail, y = [], 8
        for t, nearest in enumerate(pattern):
            trail.append([t, 0, y, 0, 1, 0, nearest, nearest, 0])
        return {"trail": trail, "stats": {"falls": 0}, "settings": {"difficulty": "normal"}}
    cycle = [20] * 3 + [3] * 6 + [14] * 6 + [3] * 6 + [15] * 2 + [3] * 4      # one 6 s getaway; the 2 s one is too short
    stuck = [3] * 30
    drop = run([8] * 12)
    drop["trail"][6][2] = 3                                                       # 5 m lost within a second
    for sample in drop["trail"][7:]:
        sample[2] = 3
    out = report([{"json": json.dumps(run(cycle))}, {"json": run(stuck)}, drop])
    s = out["old town / normal"]
    assert s["runs"] == 3, s
    w = run_wave(run(cycle)["trail"])
    assert len(w["getaways"]) == 1 and abs(w["getaways"][0] - 6) < 1.01, w
    assert run_wave(run(stuck)["trail"])["getaways"] == [] and s["runs_without_getaway"] == 2, s
    assert s["drop_places"] == [((0, 8, 0), 1)], s
    print("\nPASS analyze_chase selftest")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("export", nargs="?")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        selftest()
    elif args.export:
        report(load_rows(args.export))
    else:
        parser.error("give the export file or --selftest")
