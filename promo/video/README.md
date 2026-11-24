# promo/video/ — 紹介動画の作り方（2026-11-23、11-24 に v2・v3）

ゲームのエンジンを仮想の時計で1コマずつ進めて撮る。ソフトウェア描画の遅い環境でも、コマ落ちのない動画になる。
動画ファイル（mp4）はリポジトリに入れていない（1本 35〜41MB）。ここにあるのは作り直すためのスクリプトだけ。`size_check.sh` の対象外。

## できる動画（v2、2026-11-24）
| 用途 | 長さ | 中身 |
|---|---|---|
| YouTube・X（日本語／英語） | 30秒・1920x1080・**30fps**・音あり | スローモーション・被写体ぶれ・手持ちの揺れ・色調整・動く字幕・題名カード |
| CrazyGames 横 | 19.5秒・1920x1080・60fps・音なし | 表紙の絵から始まる。等速のまま（色調整だけ）。字幕なし |
| CrazyGames 縦 | 19.5秒・1080x1620（2:3）・60fps・音なし | 同じ構成。縦用に撮った絵 |

CrazyGames の決まり（2026-11-23 に確認）：15〜20秒、50MB以下、横16:9と縦2:3の両方、音なし、「Play Now」など宣伝の文字なし、黒帯なし、マウスカーソルなし、早送りなし、表紙を最初のコマに。スローモーションと被写体ぶれは CrazyGames 版には入れていない。

v3（11-24）：ゲーム側で、フック・ジップライン・ロープの掴む姿勢、窓破りの飛び込み、ゾンビの頭・顎・腕、爆発とガラスを直したので、全カットを撮り直した。壁走りとロープスイングのカメラを近づけ、カメラのカットにゆっくりした寄りを足し、題名カードを暗くした。参考にしたのは、同じ素材から Gemini が作った15秒の動画（被写体の大きさ・ガラスと爆発の濃さ・題名の暗さ）。

**近くから見る用のカット**（`shots.js` の `n_idle`・`n_run`・`n_hook`・`n_zip`・`n_swing`・`n_ladder`・`n_tunnel`・`n_zrun`）：体のすぐ横から撮る。動きの作りを直すときは、まずこれで連続写真を撮って原因を見る（`node engine.cjs n_hook W=640 H=400 FPS=30 AUDIO=0 EVERY=4`、前と比べるなら `Q=gripPose=0,zombieLife=0,bodyFeel=0`）。

## 仕組み
- `engine.cjs`：Playwright でゲームを開き、`page.clock` で時計を止めて1/60秒ずつ進める。`requestAnimationFrame` は自前の列で回す。CSSのアニメーションも同じ時計に合わせる。乱数は種を固定するので、同じカットを別のカメラ・言語・縦横で撮り直せる。
- 音：ゲームの `AudioContext` を `OfflineAudioContext` に差し替え、同じ時計で進めて録る（足音・声・銃声・風がそのまま入る）。
- `shots.js`：カットごとの台本（置く場所・入力・追手の位置・カメラ）。HUDつきの「プレイ画面」カット（`chase_g`・`tunnel`）と、HUDなしの「カメラ」カットがある。v2 で窓破り・ジップライン・フック・爆破・トンネルの飛び出しに近いカメラを足した（`dive_c`・`zip_c`・`hook_c`・`blast_c`・`tunnel_b`。同じ台本をカメラだけ変えて撮る `recam`）。フックは狙いをゲームのカメラで決めるので、撮るときだけカメラを差し替えて戻す（`gamecam`）。
- `final2.sh`：カットをまとめて撮る（60fps。`カット:コマ数` で長さを切れる）。
- `build2.py`：仕上げと編集。1拍 0.375 秒（音楽の 80BPM）。YouTube 版は、
  - **速度の変化**：カットごとの速度の曲線（`speed`）で、跳びの頂点・ガラスが割れる瞬間・爆発・ロープを離す瞬間・トンネルの頂点を 0.28〜0.4 倍に。60fps で撮ってあるので 0.5 倍までは実際のコマ、それより遅い所はオプティカルフローで間のコマを作る。
  - **被写体ぶれ**：前後のコマのオプティカルフロー（OpenCV の DIS）に沿って、シャッター 180 度ぶんだけ絵をずらして平均する。HUDつきのカットは、HUD をにじませないよう2コマの平均だけ。
  - **手持ちの揺れ・衝撃**：カメラのカットに小さな揺れ（`shake`）と、爆発・ガラス・題名で一瞬の揺れ（`hits`）。
  - **色**：明るい所のにじみ、S字カーブ、影を少し青く・明るい所を少し暖かく、周辺を暗く、粒状感。
  - **字幕**：大きい所から落ちて止まる字幕、左から入る技の名前、題名は暗転のあとに落ちる。
- `audio2.py`：ゲームの音をカットの速度どおりに再生（スローでは音程が下がる）＋音楽＋ここで作った音（カットの風切り・衝撃の低い音・題名前の上がる音。ノイズと正弦波から作るので素材は使っていない）。スローの間は音楽を下げ、題名の直前は無音にする。全体を −15 LUFS に一定の音量で合わせる（自動の音量調整は無音の前後で音が膨らむので使わない）。
- `make_text.py`：字幕と題名の画像。

## 作り直す手順
作業フォルダは `/home/claude/video`（スクリプト内のパスは絶対パス。別の場所で使うときは書き換える）。ゲームは `python3 -m http.server 8899` で配信しておく。Python は `opencv-python`・`numpy`・`scipy`・`Pillow`。

```
./final2.sh L "open:60 leap:60 chase:70 chase_g:96 wallrun:50 dive_c:40 swing:64 zip_c:62 hook_c:46 blast_c:54 tunnel:45 tunnel_b:86 gun_c:90 vista:150 ramp:50" W=1920 H=1080 FPS=60 LANG=en
./final2.sh J "chase_g:96 tunnel:45" W=1920 H=1080 FPS=60 LANG=ja AUDIO=0      # 日本語HUDの分
./final2.sh P "open:60 leap:60 chase:70 wallrun:50 dive_c:40 swing:64 zip_c:62 hook_c:46 blast_c:54 tunnel:45 tunnel_b:86 gun_c:90 vista:90 ramp:50" W=1080 H=1620 FPS=60 P=1 PW=1080 PH=1620 AUDIO=0
python3 make_text.py
python3 build2.py yt_en && python3 audio2.py yt_en      # yt_ja も同じ
python3 build2.py cg_land ; python3 build2.py cg_port
```
撮影は1コマ 1〜2.7 秒（1080p・60fps、横だけで約1時間）。仕上げは1本 8〜10 分。試し撮りは `node engine.cjs <カット> W=640 H=360 FPS=30 EVERY=5 AUDIO=0`、仕上げの確認は `python3 build2.py yt_en preview`（カットごとに数コマを書き出す）。カメラ探しは `X_cx= X_cy= X_cz= X_fov=` で位置を上書きできる。

表紙の絵（最初のコマと題名カード）は `promo/covers/` の撮影から作る（`assets/hero_big.png`・`cover_land.png`・`cover_port.png`）。

## 音楽
「Determined Pursuit (epic orchestra loop)」Tozan 作、CC0（OpenGameArt）。動画にだけ使い、ゲームには入れていない。
https://opengameart.org/content/determined-pursuit-epic-orchestra-loop

## 守ること
- 映すのは実際のゲームの画面だけ（描き足さない）。追手の位置と体力、プレイヤーの入力は台本で決めている。
- ライフ制なので「1回噛まれたら終わり」とは書かない。
