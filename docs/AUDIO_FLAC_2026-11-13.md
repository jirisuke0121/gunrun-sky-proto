# 音声をFLACにして容量を減らした（2026-11-13）

## 結論
- `assets/` の効果音WAV 34本を **FLAC（可逆）** に置き換えた。3,182KB → 1,379KB（**−1,803KB**）。
- 音は変わらない。FLACは圧縮前の波形をそのまま復元する形式なので、聞こえ方の劣化は原理的にない。

## なぜMP3/OGGではなくFLACか
- 銃声・爆発は短くて、頭の立ち上がり（アタック）が命。MP3/AAC は先頭に無音（エンコーダ遅延）が入り、OGG も高域が丸くなる。
  容量は半分以下まで落とせるが、「音が悪くならないか」は耳でしか確かめられない。FLACなら確かめる必要がない。
- 取り込みは全て `fetch` + `decodeAudioData`（`combat-feedback.js` は `OfflineAudioContext`）なので、拡張子を変えるだけで動く。

## 確かめたこと
- ffmpeg で、変換前後のPCMのmd5が全34本で一致（`tools/wav_to_flac.py` が一致したときだけWAVを消す）。
- Chromium の `decodeAudioData` で、FLACと元のWAV（git HEAD）をサンプル単位で比べて差0：
  hg1・sg3・mg2・smgh5・explosion_4・Kill・Hit。
- `bench/sfx-flac.test.cjs`（WAVが残っていない・FLACの先頭4バイト・コードが要求する名前が全て存在）、
  `bench/sfx-flac-browser.cjs`（index.html を開き、34本全てがデコードできる・404なし）。
- 既存の `start-readiness-browser.cjs`、`combat-feedback-browser.cjs` も通過。

## 未確認
- Safari / iOS での再生。FLACは iOS 11 以降で対応のはずだが、この環境は Chromium だけ。実機で一度、銃声とKILL音を鳴らして確認する。
- Y8 など他の公開先でFLACが問題になるかは未確認（CrazyGames は拡張子の制限なし）。

## 運用
- 音を足す・作り直すときは、WAVを作ったあとに `python3 tools/wav_to_flac.py` を回す（`tools/build_sfx_takes.py` の後）。
  PCMが一致しなければWAVは消えない。
- コードから参照する拡張子は `.flac`。`reload_1.wav` は出荷していないファイルなので、呼び出しだけ残している。
- `explosion_4` は CREDITS 上でライセンス確認が残っている（以前から）。

## 参考：初回に要らない素材の洗い出し（候補。まだ動かしていない）
- 読み込み段階の合計は約14.6MB。
- 後回しにできそうなもの（約2.5MB）：使わない武器モデル、ナイフ、ジップライン、フック発射機、`damage-bullet.png` など。
- 15秒の間に一度も要求されなかったもの（約1.5MB）：`human-gunrun.glb` 468K、`zombie-gunrun-evolved.glb` 272K、スコアパネル `.webp` 226K など。
- どれも、後回しにすると初回のヒッチや読み込み失敗の経路が増えるので、PlaytestCloud の後に、必要になったら1つずつ。
