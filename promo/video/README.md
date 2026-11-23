# promo/video/ — 紹介動画の作り方（2026-11-23）

ゲームのエンジンを仮想の時計で1コマずつ進めて撮る。ソフトウェア描画の遅い環境でも、60fps のなめらかな動画になる。
動画ファイル（mp4）はリポジトリに入れていない（1本 35〜41MB）。ここにあるのは作り直すためのスクリプトだけ。`size_check.sh` の対象外。

## できる動画
| 用途 | 長さ | 中身 |
|---|---|---|
| YouTube・X（日本語／英語） | 30秒・1920x1080・60fps・音あり | 字幕と最後の題名カードつき |
| CrazyGames 横 | 19.5秒・1920x1080・音なし | 表紙の絵から始まる。字幕なし |
| CrazyGames 縦 | 19.5秒・1080x1620（2:3）・音なし | 同じ構成。縦用に撮り直した絵 |

CrazyGames の決まり（2026-11-23 に確認）：15〜20秒、50MB以下、横16:9と縦2:3の両方、音なし、「Play Now」など宣伝の文字なし、黒帯なし、マウスカーソルなし、早送りなし、表紙の絵を最初のコマに。

## 仕組み
- `engine.cjs`：Playwright でゲームを開き、`page.clock` で時計を止めて1/60秒ずつ進める。`requestAnimationFrame` は自前の列で回す。CSSのアニメーションも同じ時計に合わせる。乱数は種を固定するので、同じカットは何度撮っても同じ動きになる（横・縦・日本語HUDを別々に撮って同じ編集点で切れる）。
- 音：ゲームの `AudioContext` を `OfflineAudioContext` に差し替え、同じ時計で進めて録る（足音・声・銃声・風がそのまま入る）。
- `shots.js`：カットごとの台本（置く場所・入力・追手の位置・カメラ）。HUDつきの「プレイ画面」カットと、HUDなしの「カメラ」カットがある。カメラのカットでは、拾える物・近すぎるフックの輪・画面に貼りつく線を写さない。HUDの左上の案内（`#runResponsibility`）は全カットで隠している。
- `final.sh`：カットをまとめて撮る。`assemble.py`：編集（1拍0.375秒＝音楽の80BPMに合わせた長さ）と字幕。`audio.py`：ゲームの音＋音楽を混ぜて付ける。`make_text.py`：字幕と題名カードの画像。

## 作り直す手順
作業フォルダは `/home/claude/video`（スクリプト内のパスは絶対パス。別の場所で使うときは書き換える）。ゲームは `python3 -m http.server 8899` で配信しておく。

```
./final.sh L "open leap chase chase_g wallrun dive swing zip hook blast tunnel gun_c vista ramp" W=1920 H=1080 FPS=60
./final.sh J "chase_g dive zip hook blast tunnel wallrun" W=1920 H=1080 FPS=60 LANG=ja AUDIO=0      # 日本語HUDの分
./final.sh P "open leap chase wallrun dive swing zip hook blast tunnel gun_c vista ramp" P=1 PW=1080 PH=1620 W=1920 H=1080 FPS=60 AUDIO=0
python3 make_text.py
CRF=21 python3 assemble.py yt_en && SFX=2.0 MUS=0.42 python3 audio.py yt_en      # yt_ja も同じ
CRF=20 python3 assemble.py cg_land ; CRF=20 python3 assemble.py cg_port
```
1コマ 0.8〜2秒かかる（1080p・60fps、全カットで40〜60分）。試し撮りは `node engine.cjs <カット> W=640 H=360 EVERY=3 AUDIO=0`。

## 音楽
「Determined Pursuit (epic orchestra loop)」Tozan 作、CC0（OpenGameArt）。動画にだけ使い、ゲームには入れていない。
https://opengameart.org/content/determined-pursuit-epic-orchestra-loop

## 守ること
- 映すのは実際のゲームの画面だけ（描き足さない）。追手の位置と体力、プレイヤーの入力は台本で決めている。
- ライフ制なので「1回噛まれたら終わり」とは書かない。
