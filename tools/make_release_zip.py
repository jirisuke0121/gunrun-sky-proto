#!/usr/bin/env python3
"""Pack the playable build (index.html at the zip root) for a portal upload such as Y8.

Usage: python3 tools/make_release_zip.py [output.zip]
Ships the top-level game pages/scripts/styles and assets/. Leaves out the editors, the
white-box canyon map, owner/admin pages, benches, docs, server code and the pool/ folder.
"""
import sys, zipfile, re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
y8 = "--y8" in sys.argv
args = [a for a in sys.argv[1:] if a != "--y8"]
out = Path(args[0]) if args else root / "sky-corridor-web.zip"
out.parent.mkdir(parents=True, exist_ok=True)

EXCLUDE = {
    "canyon.html", "canyon-world.js",                       # white-box map (developer only)
    "hook-editor.html", "hook-editor.js", "wall-jump-candidates.js",  # editors
    "swing-plan.html", "camera-comparison.html", "swing-escape-evidence.json",
    "size_check.sh",
    # owner / admin and review pages: never ship them to a portal
    "owner.html", "owner-token.html", "owner.js", "owner.css", "escape-replay-viewer.html", "camera-trial.html",
}
files = []
for pattern in ("*.html", "*.js", "*.css", "*.svg"):
    files += [p for p in sorted(root.glob(pattern)) if p.name not in EXCLUDE]
files += [p for p in sorted((root / "assets").rglob("*")) if p.is_file()]
files.append(root / "CREDITS.md")

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in files:
        name = p.relative_to(root).as_posix()
        if y8 and name == "index.html":
            html = p.read_text()
            html = html.replace("<head>", '<head><script>window.SKY_PLATFORM={id:"y8"};</script><script async src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js"></script>', 1)
            # The white-box map is not shipped; remove its hidden development links too.
            html = re.sub(r'<a\b[^>]*href="\./canyon\.html[^"]*"[^>]*>.*?</a>', '', html, flags=re.DOTALL)
            z.writestr(name, html)
        else:
            z.write(p, name)
raw = sum(p.stat().st_size for p in files)
print(f"{out.name}: {len(files)} files, {raw/1048576:.2f} MB raw, {out.stat().st_size/1048576:.2f} MB zipped")
