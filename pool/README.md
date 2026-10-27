# pool/（素材置き場）

公開版（`index.html`／`canyon.html`）から外した素材の保管場所です。ゲームはここを読みません。`size_check.sh` の容量にも数えません（公開版に含める `assets/` の外にあります）。

置き方は `assets/` と同じです。戻すときは同じパスへ移します。

```
git mv pool/assets/zombie-hoodie.glb assets/zombie-hoodie.glb
```

ファイルを戻しても、読み込みコードは外してあるので自動では使われません。下の「戻すときに直す所」も必要です。

## 中身

| 区分 | ファイル | 約サイズ |
|---|---|---|
| Easy Weapons の武器モデル（Pistol・Shotgun・M4・Rail・Beam・Cluster・Rocket・M79） | `assets/easy-weapons-*.glb`（9個） | 6.5 MB |
| SG・SMG・MG のモデル | `assets/sg-meshy-low.glb` `smg-meshy-low.glb` `mg-meshy-low.glb` | 1.3 MB |
| 旧Meshyゾンビ4種（通常＋遠景用）と近距離軽量化の索引 | `assets/zombie-decayed-man*.glb` `zombie-decayed-woman*.glb` `zombie-old-worker*.glb` `zombie-hoodie*.glb` `zombie-near-indices.json` | 4.2 MB |
| SG・SMG・MG の銃声 | `assets/sfx/sg*.wav` `smg*.wav` `mg*.wav` | 2.4 MB |
| Easy Weapons の銃声・爆発音・装填音（`explosion_4.wav` は爆発樽で使うため `assets/` に残してあります） | `assets/sfx/easy-weapons/*` | 3.8 MB |

## 戻すときに直す所

- 武器：`enhancements.js` の `loadDetail` 周り（HG だけにしてある）、`SAMPLES`（銃声）、`EASY_FIRE`、`U.weapon = 0` の固定、`s_weapon` スライダーの非表示。`index.html`／`canyon.html` の `#wpSel` にボタンを足す。
- 旧ゾンビ：`index.html`／`canyon.html` のゾンビ読み込み（`urls`）、`zValues`、`#zombieSel`。`zombie-near.js` の索引の読み込み。
- 以前のホーム画面は git の履歴（この変更の1つ前のコミット）で確認できます。
