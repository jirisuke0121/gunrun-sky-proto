#!/usr/bin/env python3
"""Report download-size estimates for the production game only."""
from pathlib import Path
import gzip

root = Path(__file__).resolve().parent
files = [root / "index.html", root / "canyon.html", root / "enhancements.js", root / "human-view.js", root / "human-running.js", root / "human-actions.js", root / "telemetry-probe.js", root / "desktop-look-fallback.js", root / "canyon-world.js", root / "town-heights.js", root / "blast-barrels.js"]
files += [p for p in (root / "assets").rglob("*") if p.is_file()]
files = [p for p in files if p.is_file()]
raw = sum(p.stat().st_size for p in files)
compressed = gzip.compress(b"".join(p.read_bytes() for p in files), compresslevel=9)
mb = lambda n: n / 1048576
pct = lambda n, limit: round(100 * n / limit)
print(f"■ 公開版: 合計 {mb(raw):.2f} MB（圧縮後の目安 {mb(len(compressed)):.2f} MB）／ ファイル数 {len(files)}")
print(f"  CrazyGames 初回ダウンロード 50MB以内: {pct(raw, 52428800)}% 使用（残り {mb(52428800-raw):.2f} MB）")
print(f"  CrazyGames スマホのトップ掲載 20MB以内: {pct(raw, 20971520)}% 使用（残り {mb(20971520-raw):.2f} MB）")
print(f"  CrazyGames 全体 250MB／1500ファイル: {pct(raw, 262144000)}% ／ {pct(len(files), 1500)}%")
print("  ※ Y8 は容量の上限を公式ページで確認できていません（提出画面で確認）。")
print("  ※ CrazyGames の測り方: SDK組み込み時は『ゲーム開始』までのダウンロード量。SDK未組み込みなら全体の合計。")
