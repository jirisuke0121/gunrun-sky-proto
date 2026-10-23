# 空中回廊の仮説検証用計測（devのみ）

この作業版は `dev/index.html` のビルド `2026-10-24b-telemetry-dev` にだけ計測を追加する。ルートの公開ゲーム、Worker、D1スキーマは変更しない。公開やD1へのテスト送信は別途行う。

## 回収と再集計

既存のCloudflare認証を使い、`server/` から読み取り専用で書き出す。`ADMIN_TOKEN` は不要。

```sh
cd server
npx wrangler d1 execute gunrun-runs --remote \
  --command 'SELECT id, received_at, played_at, build, player, reason, t, stars, score, kills, gun_kills, input, screen_w, screen_h, json FROM runs ORDER BY received_at ASC' \
  --json > runs-export.json
python3 ../tools/telemetry/analyze_runs.py runs-export.json > runs-summary.json
```

`runs-export.json` には端末ごとのランダムIDと詳細な操作経路が入る。公開リポジトリへ追加しない。`analyze_runs.py` は端末IDを出力しない。

## 追加されるJSON

`v:3`、`build`、`channel:"dev"`、`mapVersion` に加え、`diagnostics` を保存する。

- `jumps`: キーまたはタッチの入力時刻・位置・視線・接地・コヨーテ時間と、通常ジャンプ受付／別技による消費／未受付。`not_accepted` は失敗原因の確定ではない。
- `hooks`: 画面タップ、キー、ボタンの試行。成功開始か、画面タップ近辺の射程外・近すぎ・遮蔽物・照準ずれ・対象なしなど。タップ位置は画面比率であり、生のタッチ軌跡は残さない。
- `opportunities`: 0.25秒間隔で2回以上続けて、アンカーが画面内・射程内・遮蔽物なしのときの機会。プレイヤーが実際に気付いた証拠ではない。
- `zones`: エリアへの入場と退出。エリア訪問は障害物への挑戦機会と同義ではない。
- `falls`: 落下時の位置・最後の接地位置・視線・縦速度・接地状態と、直前のジャンプ／フック入力からの経過時間。
- `frames`: 描画フレーム間隔を10秒ごとに集約した件数・平均・33ms超・50ms超・最大・ヒストグラム。既存の `secs.ms` と区別する。
- 既存の `mistakes[].buf` は末尾に `yaw,pitch,verticalSpeed,onGround` を追加。従来8列、新版12列で、直近約5秒を0.25秒間隔で保持する。

配列には件数上限と `truncated` カウンタがある。既存の「プレイ記録を匿名で送信する」がオフの場合、追加の `diagnostics` は送信されない。ゲーム操作や難易度は変更しない。

## 判定上の注意

分析は `build`、`mapVersion`、`channel`、`kind/mission` で分ける。旧データにこれらがない場合は推定して混ぜない。落下地点・フック機会のログは再現候補を絞るもので、視認性や理不尽さの断定には実機動画・操作観察を使う。同一端末IDを一人のプレイヤーとして扱わない。

## 実機での受け入れ確認

1. dev版で同意あり／オフを切り替え、オフではD1に記録が増えないこと。
2. 接地中、空中、壁走り、はしご、フック中のジャンプを行い、`jumps[].outcome` と動画が合うこと。
3. アンカーがない場所、射程外、遮蔽物のある場所、アンカーを狙った場所でフックを試し、`hooks[]` と `opportunities[]` が一致すること。
4. 屋上・塔・梁での落下と、通常の操作ミスを録画し、`falls[]`、`mistakes[].buf`、動画の時刻を突き合わせること。
5. 同じ端末で序盤と終盤の `frames` を比較し、背景化・端末温度・読み込みの影響を分けること。
6. 1プレイの送信JSONがWorker上限600KB以下で、イベント上限到達時は `truncated` が増えること。

ローカルブラウザでは、送信先を空にしたQAコピーで開始・通常ジャンプ・フック開始・機会・エリア訪問・描画集計を確認した。物理iPhone、落下再現、D1送信、公開版への反映は未確認。
