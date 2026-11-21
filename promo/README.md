# promo/ — ポータル提出用の素材（ゲームには含めない）

`size_check.sh` と `tools/make_release_zip.py` の対象外（直下の html/js/css/svg と `assets/` だけが出荷物）。

## covers/（2026-11-21）
CrazyGames の必須サイズ（横 1920x1080・縦 800x1200・正方形 800x800）。文字はタイトルだけ（CrazyGames は「Play」「New」などの文字を禁止）。
ホームの絵（`assets/lobby/old-town-chase.webp`）と同じ場面：屋上の縁から跳ぶ人間に、ゾンビ3体が手を伸ばして追う。

作り直し方（ゲーム内のカメラで撮る。ローカルで `python3 -m http.server 8899` を立てておく）:
1. `stage-shot.cjs` で撮影。使った設定：
   `WARM=60 HIDEPOLES=1 W=3200 H=1800 SLOTS='[[0.1,0.35],[1.0,-0.4],[1.9,-1.1]]' SPECS='[{"id":"w7","x":-14,"z":2,"h":8,"a":5.105,"apex":7}]' CAMS='[{"n":"W1","f":-0.8,"s":3.6,"u":1.2,"tf":-0.9,"tu":1.62,"fov":55}]'`
   （旧市街 x=-14,z=2 の高さ8mの縁。人間は跳んで7フレーム目。ゾンビは縁の手前に固定。フックの印・ロープ台・ドカン・光の柱・細い柱は写さない）
2. `grade.py <撮影したpng> <出力名>` でホーム用（1920x1080 webp）。
3. `make_covers.py <撮影したpng>` で3枚の表紙（字体は Inter Display Black Italic、OFL）。

ゲームに無いもの（庇・バルコニー・ぶら下がるロープなど）は描き足さない。実際の画面と違う絵はポータルで信用を落とす。
