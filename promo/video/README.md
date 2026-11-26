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

## v5（2026-11-24）：町の人ゾンビ・人の陰影と輪郭線・近いカメラで全部撮り直し

途中でこの環境が再起動しても続きから撮れるように `resume.sh`（終わったカットは飛ばす。撮る前にローカルのサーバーを確かめる）。撮った物は `out4/`、仕上げは `final4/`（`TAKE`・`FINAL` で指定）。

```
./resume.sh L "<v3 と同じカット>" W=1920 H=1080 FPS=60 LANG=en     # J・P も v3 と同じ引数
TAKE=out4 FINAL=final4 python3 build2.py yt_en && TAKE=out4 FINAL=final4 python3 audio2.py yt_en   # yt_ja も同じ
TAKE=out4 FINAL=final4 python3 build2.py cg_land ; TAKE=out4 FINAL=final4 python3 build2.py cg_port
```

撮影は横15カット・日本語2カット・縦14カットで約2時間半（1コマ1〜3秒）。近くから見る用のカットに `n_zladder`（はしごを登るゾンビ）・`n_bite`（噛まれる瞬間）・`n_hface`（人の正面／背中）を足した。

## 逃走劇版（2026-11-26）：1ランでマップ全体を逃げ回る30秒（日本語）

技ごとの紹介とは別に、閃光玉→爆破ジャンプ→高台から撃ち落とし→分身→ジップライン→救済→ロープ連続スイング→リザルトを、残り時間と俯瞰の地図（撮影時のゲーム内の主人公・ゾンビの位置から描く）でつないだ版。

- 台本は `shots2.js`（`r_*`。`engine.cjs` が `shots.js` のあとに読み込む）。`X_CAM=n` でカメラを選ぶ。`PRE=` は保存しない先頭のコマ数（30fps換算）で、台本の時間は先頭から数える。
- 撮る：`node engine.cjs <台本> OUT=/home/claude/video/out5/<名前> W=1920 H=1080 LANG=ja FPS=60 FRAMES=…`。使った引数は `build3.py` の先頭の表（`out5`＝最初の撮影、`out6`（名前に `6:`）＝11/26 のゲーム修正のあと撮り直した閃光玉・爆破・撃ち落とし・救済）。
  - `open`: r_open FPS=30 FRAMES=104 ／ `6:flash`: r_flash FPS=60 FRAMES=175 ／ `6:blast`: r_flash FPS=60 X_CAM=1 PRE=102 FRAMES=66 ／ `6:gun`: r_gun2 FPS=30 FRAMES=80 ／ `decoy`: r_decoy FPS=30 FRAMES=108 ／ `zip`: r_decoy FPS=30 X_CAM=1 PRE=90 FRAMES=56 ／ `6:rescue2`: r_rescue FPS=60 X_CAM=2 X_ax=-5 X_ay=4.6 X_az=-6 FRAMES=82 ／ `chainA`: r_chain FPS=60 X_CAM=1 PRE=18 FRAMES=56 ／ `chainB`: r_chain FPS=60 X_CAM=1 PRE=120 FRAMES=82 ／ `card`: r_card FPS=30 PRE=150 FRAMES=45 AUDIO=0
- 地図の高さは `hm1`（`assets/hm.npy` に保存）。字幕は `make_text3.py`（`assets3/`）。
- 仕上げ：`python3 build3.py && python3 audio3.py` → `final5/run_ja.mp4`（30秒・1080p30・音あり、約80MB）。
- 撮影で見つかったゲーム側の問題（撃ち落とし・救済・閃光玉）は `docs/KNOCK_RESCUE_FLASH_2026-11-26.md`。

## 映画風版（2026-11-26 午後）：参考画像・Geminiの動画のカメラを取り入れた30秒（日本語）

参考にしたのはカメラと詰め込み方だけ（手前に追手・真ん中に主人公・奥に城、下から見上げる、1カットに複数のこと）。絵はすべて実際のゲーム画面。画面の表示は消し、題名の直前の2秒だけプレイ画面（表示あり）。AIの絵は表紙・サムネイル用で動画には入れない（本人の判断）。

- 台本は `shots2.js` の `k_*`（既存の撮影の動きを `recK` で再利用し、カメラだけ変える）。撮る引数（out7）：
  `flash`: k_flash FPS=60 FRAMES=150 ／ `beam0`: k_beam FPS=60 X_sd=1.1 X_cy=1.35 FRAMES=70 ／ `beam1`: k_beam FPS=60 X_CAM=1 FRAMES=90 ／ `blast0`: k_blast FPS=60 FRAMES=60 ／ `blast1`: k_blast FPS=60 X_CAM=1 PRE=55 FRAMES=70 ／ `dive0`: k_dive FPS=60 FRAMES=60 ／ `dive1`: k_dive FPS=60 X_CAM=1 FRAMES=60 ／ `hook`: k_hook FPS=60 FRAMES=60 ／ `rope`: k_rope FPS=60 FRAMES=50 ／ `tunnel2`: k_tunnel FPS=60 FRAMES=112 ／ `play`: chase_g FPS=30 FRAMES=96
  （`k_tunnel` は先頭の負のコマでしゃがみを押すので `PRE=` を付けない。）
- 編集の表は `edl4.json`、字幕は `caps4.json`（`make_text3.py` の `k1`・`c2`・`k3`）。仕上げ：`python3 build4.py && python3 audio4.py` → `final7/cine_ja.mp4`。

### 映画風版 v2（11/26 夕方）：技は使う理由から結果まで切らずに見せる
- 本人の指摘で組み直した：スライディング→トンネル→大ジャンプ→着地は等速の1カット（プレイヤーのカメラ・表示なし、`tunnelG`: tunnel FPS=60 HUD=0 FRAMES=145）。道具は分身だけにし、前後から挟まれた場面で使う（`g_decoy`：プレイヤーのカメラ・表示あり。これがプレイ画面を兼ねる。`decoyG`: g_decoy FPS=30 FRAMES=190）。フック・ロープ・閃光玉の切れ端は外した。
- 流れ：町の俯瞰（`out5/open` を `out7/open` に繋ぐ）→渡り廊下→窓破り→爆破→着地して撃ち落とし→挟まれて分身→ジップライン→トンネルから大ジャンプ→題名。表は `edl4.json`。
- `HUD=0` のとき、FLOWの表示・ドラム缶などの案内（画面に固定の要素）も隠す（`engine.cjs`）。

## Y8 用のプレイ動画（2026-11-26 夜）
これまでの台本を、プレイヤーのカメラ・英語の表示（`LANG=en`）・1280x720 で撮り直し、等速のまま切ってつないだ21秒（スロー・揺れ・字幕・題名なし、音楽は控えめ）。
`shots2.js` の `y_*`（`k_beam`・`r_gun2`・`k_blast`・`k_dive` をプレイヤーのカメラで撮る版）と `g_decoy`・`tunnel`。撮る引数は `build_y8.py` の表の順に：y_beam FRAMES=90 ／ y_dive 60 ／ y_blast 120 ／ y_gun2 80 ／ g_decoy 190 ／ tunnel 150（すべて W=1280 H=720 FPS=30 LANG=en、out8）。仕上げ：`python3 build_y8.py`。
