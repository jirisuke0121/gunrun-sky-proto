#!/usr/bin/env python3
"""Summarize a read-only Wrangler D1 JSON export without printing device IDs."""

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path


def load_rows(path):
    data = json.loads(Path(path).read_text())
    if isinstance(data, list) and data and isinstance(data[0], dict) and "results" in data[0]:
        return [row for page in data for row in page.get("results", [])]
    if isinstance(data, dict) and "results" in data:
        return data["results"]
    if isinstance(data, list):
        return data
    raise ValueError("Expected Wrangler --json output or a row array")


def load_records(rows):
    records = []
    for row in rows:
        payload = row.get("json", row)
        if isinstance(payload, str):
            payload = json.loads(payload)
        if not isinstance(payload, dict):
            continue
        records.append((row, payload))
    return records


def summarize(records):
    grouped = defaultdict(list)
    for row, payload in records:
        build = payload.get("build", row.get("build", "unknown"))
        mode = payload.get("kind", "unknown")
        if mode == "mission":
            mode += ":" + str(payload.get("mission", "unknown"))
        grouped[(build, payload.get("mapVersion", "legacy-unknown"), payload.get("channel", "legacy-unknown"), mode)].append((row, payload))

    result = []
    for (build, map_version, channel, mode), entries in sorted(grouped.items()):
        exits = Counter()
        fall_places = Counter()
        hook_results = Counter()
        zone_visits = Counter()
        jumps = Counter()
        frame_total = frame_over33 = 0
        opportunities = opportunity_with_attempt = 0
        legacy_hook_starts = legacy_canvas_misses = 0
        devices = set()
        for row, payload in entries:
            devices.add(payload.get("player", row.get("player", "unknown")))
            exits[payload.get("reason", row.get("reason", "unknown"))] += 1
            fall_places.update(m.get("place", "unknown") for m in payload.get("mistakes", []) if m.get("k") == "fall")
            diagnostics = payload.get("diagnostics") or {}
            if diagnostics.get("schema") == 3:
                attempts = diagnostics.get("hooks", [])
                hook_results.update(h.get("result", "unknown") for h in attempts)
                jumps.update(j.get("outcome", "unknown") for j in diagnostics.get("jumps", []))
                zone_visits.update(z.get("place", "unknown") for z in diagnostics.get("zones", []))
                for opportunity in diagnostics.get("opportunities", []):
                    opportunities += 1
                    start, end = opportunity.get("start"), opportunity.get("end")
                    if start is not None and end is not None and any(start <= h.get("t", -1) <= end for h in attempts):
                        opportunity_with_attempt += 1
                for window in diagnostics.get("frames", []):
                    frame_total += window.get("n", 0)
                    frame_over33 += window.get("over33", 0)
            else:
                legacy_hook_starts += payload.get("stats", {}).get("hooks", 0)
                legacy_canvas_misses += payload.get("miss", {}).get("hookTap", 0)
        result.append({
            "build": build,
            "mapVersion": map_version,
            "channel": channel,
            "mode": mode,
            "runs": len(entries),
            "anonymous_devices_not_people": len(devices),
            "exits": dict(exits),
            "fall_events_by_place_not_failure_rate": dict(fall_places),
            "v3_jump_input_outcomes": dict(jumps),
            "v3_hook_attempt_results": dict(hook_results),
            "v3_hook_opportunity_episodes": opportunities,
            "v3_opportunity_episodes_with_attempt": opportunity_with_attempt,
            "v3_area_visits_not_obstacle_opportunities": dict(zone_visits),
            "v3_render_frame_intervals": frame_total,
            "v3_render_intervals_over_33ms": frame_over33,
            "legacy_hook_starts": legacy_hook_starts,
            "legacy_canvas_tap_misses_partial": legacy_canvas_misses,
        })
    return {"groups": result, "notes": [
        "Separate build, mapVersion, channel, and mode before comparing outcomes.",
        "An anonymous device ID is not a unique player.",
        "Area visits are not obstacle-specific attempts; replay/video is needed to judge visibility and fairness.",
        "Legacy hookTap misses omit button/key attempts and opportunity exposure.",
    ]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", help="Wrangler D1 --json export")
    args = parser.parse_args()
    print(json.dumps(summarize(load_records(load_rows(args.export))), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
