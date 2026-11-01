#!/usr/bin/env python3
"""Pack the playable build (index.html at the zip root) for a portal upload such as Y8.

Usage: python3 tools/make_release_zip.py [output.zip]
Ships the top-level game pages/scripts/styles and assets/. Leaves out the editors, the
white-box canyon map, benches, docs, server code and the pool/ folder.
"""
import sys, zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "sky-corridor-web.zip"

EXCLUDE = {
    "canyon.html", "canyon-world.js",                       # white-box map (developer only)
    "hook-editor.html", "hook-editor.js", "wall-jump-candidates.js",  # editors
    "swing-plan.html", "camera-comparison.html", "swing-escape-evidence.json",
    "size_check.sh",
}
files = []
for pattern in ("*.html", "*.js", "*.css"):
    files += [p for p in sorted(root.glob(pattern)) if p.name not in EXCLUDE]
files += [p for p in sorted((root / "assets").rglob("*")) if p.is_file()]

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in files:
        z.write(p, p.relative_to(root).as_posix())
raw = sum(p.stat().st_size for p in files)
print(f"{out.name}: {len(files)} files, {raw/1048576:.2f} MB raw, {out.stat().st_size/1048576:.2f} MB zipped")
