# プレイ記録サーバー（Cloudflare Workers + D1）

## 2026-11-02：プレイヤー管理

`player-schema.sql` と `player-backfill.sql` をD1へ適用後、Workerを更新（`playerConsole:1`）。更新後にbackfillをもう一度適用する。どちらも再実行可能。元の記録値は変更せず、軽量メタデータと既存匿名IDの対応を追加する。[仕様・認証・検証・公開順序](../docs/PLAYER_OWNER_CONSOLE.md)。

## 2026-11-02：DB負荷監査

`ranking-index.sql` をD1へ適用してからWorkerを更新する。索引の追加のみで既存記録の値は変更しない。順位・総数・自己順位は1回の計算を共有し、管理集計は7種類のSQLを1バッチで実行する。端末環境の更新は変更がある場合だけ。受信の重複防止・保存確認は保持。[監査結果と測定条件](../docs/DB_EFFICIENCY_AUDIT_2026-11-02.md)。


## 2026-11-02：国・端末環境と任意の日付範囲

追加の `telemetry-environment-schema.sql` をD1へ適用してからWorkerを更新する。国は受信時のCloudflare情報、端末環境はブラウザが申告した取得可能な項目を保存する。既存の記録や順位は変更しない。任意期間は `GET /admin/overview?from=YYYY-MM-DD&to=YYYY-MM-DD`（日本時間、終了日を含む）。[仕様・検証・運用](../docs/ENVIRONMENT_ANALYTICS.md)。

## 2026-11-02：管理画面のChatGPTログイン

通常の管理画面は [本人専用のログイン式ページ](https://sky-corridor-owner.jirisuke.chatgpt.site/) 。`OWNER_OVERVIEW_TOKEN` をWorkerとSitesの秘密設定に登録し、Sitesのサーバーから集計だけを読む。既存の `ADMIN_TOKEN` は保持し、個別記録への権限を専用キーへ与えない。D1の変更は不要。[運用手順](../docs/OWNER_LOGIN.md)。

## 2026-11-01：生存時間と戦闘の得点（v11）

脅威ポイントを廃止し、生存時間×毎秒120点、実ダメージ×2点、撃破×100点の各得点に難易度倍率（1.0/1.1/1.2）を適用。ポーズ中は停止。全難易度の共通順位は維持し、新ルール `corridor-time-score-v11` で旧記録と分離します。Worker更新が先に必要です。[仕様と確認範囲](../docs/TIME_SCORE_2026-11-01.md)。以下の得点式は過去の仕様です。

## 2026-11-01：全難易度共通スコア（公開前）

- 新ルール `corridor-shared-score-v9`。`GET /ranking?map=old-town&rules=corridor-shared-score-v9&mode=score&difficulty=all` はEasy/Normal/Hard全体の最高スコアを端末ごとに1件返す。難易度やクリア状態で順位を優先せず、得点順で比較する。各行には実際に挑戦した難易度を残す。星は0。`/ghosts/<id>` も同じクエリで、その順位の記録だけを返す。
- クライアントは実際の固定条件を `challenge.fixedSettings` に記録する。Workerは共有の `ranked-rules.js` と、記録中の設定差分を検査する。異なる条件や必要な条件情報がない場合も結果を保存し、`receipt.ranked:false` で通常順位から除外する。クライアントが付けた `rankingEligible` は信頼しない。
- 容量対策で診断やゴーストを省く場合も `challenge` の条件情報は保持する。記録プロトコル2・重複防止・既存ルールの読み取り・自由調整は維持。スキーマ変更なし。
- 公開時はWorkerを先に更新し、`GET /` の `rankedRules:corridor-shared-score-v9` を確認してからPagesを反映する。本変更は未公開。

## 2026-10-31：記録と送信の整合性

| 段階 | 正とするデータ・条件 |
| --- | --- |
| プレイ確定 | `clientRunId`（UUID）、結果、難易度 `challenge.id`、ルール `challenge.version`、`mapKey` を固定する。旧 `Z.saved` は保存成功の意味を持たないため、収集終了フラグ `Z.sealed` へ変更。 |
| 端末保存 | 送信前に `gunrun-run-outbox-v1` に保管する。直近50件の結果と配送状態は `gunrun-run-history-v1`。容量不足時もゴースト等の付属情報より結果を優先する。 |
| サーバー保存 | `/runs` が保存後にDBから同じ行を読み直し、`id` と結果の `receipt` を返した場合だけ成功。ゴースト不正で結果まで捨てない。 |
| 再送 | `clientRunId` を行の主キーとして同じプレイを重複登録しない。送信結果不明時は `recordProtocol:2` を確認して再送。旧サーバーには不明な送信を自動再送しない。 |
| ランキング | 同じ `mapKey`・難易度・ルールで読み直す。送信成功と順位確認を区別する。最高記録以外のプレイも保存されるが、順位表は端末ごとの自己ベストだけ。 |

`run-records.js` が両マップの端末保存・送信・確認を担当する。端末IDは既存の `gunrun-pid` を継承し、記録送信オフを勝手にオンにしない。練習場の一時設定は本番設定へ保存しない。ミッション・途中終了・検証版とランキングの条件は従来通り区別する。

Workerの修正にはスキーマ変更は不要。`node bench/record-integrity.test.cjs` とブラウザ検証後、`server/` で `npx wrangler deploy` が必要。GitHub Pagesへの反映だけではWorkerは更新されない。未反映の間はクライアントが旧プロトコルとして扱う。

本番の公開API検証では `channel:dev`、`build` の `-dev` 接尾辞を付けた2分・2401サンプルのデータを使い、HTTP 200とIDの返却を確認した。テストデータを本番ランキングに含めていない。この確認は、ユーザー端末の送信状態や管理者限定のDB・ログを読んだことを意味しない。

ゲームが1プレイ終わるごとに、記録（結果・操作・画面サイズなど）をここへ送ります。
個人名・メールなどは送りません。端末ごとのランダムID（`gunrun-pid`）だけが付きます。

## 2026-10-31：3段階のチャレンジ

新しい `corridor-three-v7` はeasy/normal/hardの3段階。ランキングとゴーストはこの版だけを対象にし、クリア順位はハード→ノーマル→イージー。同じ難易度は同順位、スコアは得点順。v7でexpert/master/ultraを指定すると400を返します。旧corridor-crowd6-v6等のAPIは従来の6段階を維持し、過去のデータを変更しません。DBスキーマの変更は不要です。公開時はWorker→ゲームの順で反映します。今回の変更は未公開です。

## 2026-10-27：チャレンジ難易度別の記録

`GET /ranking?map=old-town&difficulty=normal&rules=corridor-crowd6-v6` と `GET /ghosts/<id>?map=old-town&difficulty=normal&rules=corridor-crowd6-v6` は同じ難易度の記録に絞ります。`easy` / `normal` / `hard` / `expert` / `master` / `ultra` は指定した `challenge.version` の記録が対象です。`rules` は `corridor-crowd6-v6`、`corridor-health-v5`、`corridor-cap12-v4`、`corridor-score-v3`、`corridor-v2`、前案の `unity-v1` に対応し、省略時は前案互換の `unity-v1`。`legacy` または難易度省略では従来の記録・自由調整の記録を返します。過去の記録を新しいNormalへ移すことはありません。

記録JSONの `challenge: {id, version}` を既存のJSON列へ保存し、DBスキーマ変更はありません。Workerを先に更新してからゲームを公開します。

## 2026-10-26：ランキングからのゴースト閲覧

- `GET /ranking?map=old-town` / `map=rock-canyon` はマップごとの最高記録と、再生可能な記録の `replayId` と記録日時 `playedAt`（ISO 8601）を返します。省略時は旧市街です。
- `GET /ghosts/<replayId>?map=...` はランキングに採用されたそのプレイの移動だけを返します。記録日時 `playedAt` も返します。以前の記録に日時がない・不正な場合は受信日時を使います。完全な診断記録を読む `/runs` は引き続き管理者専用です。
- 今後のプレイでは位置・向き・上下の視線・移動状態・ライフ・復帰時の切れ目を最大20回/秒で保存します。既存のJSON列を使い、テーブルの変更はありません。
- 以前の記録は保存済みの1秒間隔の `trail` から、おおまかな軌跡として再生します。表示で精度の違いを知らせます。
- 更新は `node bench/ranked-ghost.test.cjs`（リポジトリ直下）、`cd server && npx wrangler deploy`。Workerを先に更新し、その後ゲームを公開します。

## 現在の状態（2026-10-22）

データベース `gunrun-runs`（D1）は作成済みで、`runs` テーブルとインデックスも作ってあります。`wrangler.toml` の `database_id` も設定済みです。
残りはWorkerの公開だけなので、下の「公開手順」のうち **ログイン → ADMIN_TOKEN → deploy の3コマンドだけ** 実行すれば足ります（`d1 create` と `d1 execute` は不要）。

## 公開手順（初回だけ・約10分）

PCのターミナルで、このリポジトリの `server/` フォルダに入って実行します。

```bash
cd server
npx wrangler login                         # ブラウザでCloudflareにログイン
npx wrangler d1 create gunrun-runs         # 表示される database_id を控える
```

1. `wrangler.toml` の `database_id` を、表示されたIDに書き換える
2. 続けて実行：

```bash
npx wrangler d1 execute gunrun-runs --remote --file schema.sql   # テーブル作成
npx wrangler secret put ADMIN_TOKEN                               # 閲覧用の合言葉（自分で決めた長い文字列）
npx wrangler deploy                                                # 公開。最後に https://gunrun-runs.<あなた>.workers.dev が表示される
```

3. ルートの `index.html` で `RECORD_URL=""` を `RECORD_URL="https://gunrun-runs.<あなた>.workers.dev/runs"` に書き換えて、`git push`

以後、GitHub版のゲームで遊ぶと記録が溜まります。タイトル画面に「記録を送信しています」と出て、設定の「プレイ記録を匿名で送信する」でオフにできます。

## 記録を見る

```bash
# 直近の一覧（本文なし）
curl -s "https://gunrun-runs.<あなた>.workers.dev/runs?limit=50" -H "Authorization: Bearer <ADMIN_TOKEN>"
# ビルドを絞る・完全な記録つき
curl -s "https://gunrun-runs.<あなた>.workers.dev/runs?build=2026-10-20d&full=1" -H "Authorization: Bearer <ADMIN_TOKEN>"
# 1件だけ
curl -s "https://gunrun-runs.<あなた>.workers.dev/runs/<id>" -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Claudeに分析させるときは、この出力のJSONを渡してください。

## 仕様
- 受け付ける送信元：`wrangler.toml` の `ALLOWED_ORIGINS`（既定は `https://jirisuke0121.github.io`）。別のURLに置くなら追加する
- 1回の送信は600KBまで。同じ端末IDからは1分に20回まで
- 移動・戦闘情報を含むゴーストは記録量が増える。D1 Freeはアカウント合計5GBでも、単一DBは500MBが上限。固定のプレイ件数で無料容量を保証しない。[今回の保存量と費用対効果](../docs/GHOST_REPLAY_SCOPE_2026-10-31.md)を参照。

`corridor-crowd6-v6` / `corridor-health-v5` / `corridor-cap12-v4` / `corridor-score-v3` の6難易度はUnityの得点順（score降順）で比較します。クリア状態は別表示です。旧ルールと自由調整は従来のクリア優先順を維持します。


## 2026-10-28：難易度クリアとスコア

`GET /ranking?map=old-town&rules=corridor-crowd6-v6&mode=clear` は各端末の最高クリア難易度を返します。Easy〜Ultraの2分逃げ切りだけが対象で、同難易度は同順位。同じ端末・難易度の代表記録は得点、時間、受信日時、IDの順で選びます。

`mode=score`（省略時も同じ）は従来どおり `difficulty` の最高得点。両方に難易度 `difficulty`、星 `stars`、クリア状態、得点、日時と再生IDを返します。星を無効化していた版のクリア記録は、保存済みの目標点（省略時430/470点）から星を表示時に補完し、元データは変更しません。

`GET /ghosts/<id>?map=...&rules=...&mode=clear` は難易度クリア順位に選んだその記録を再生します。スコアの場合は `mode=score&difficulty=...` を渡します。ランキング画面で表示している難易度を使い、ゲーム開始時の選択とは分離します。スキーマ変更はありません。

## 2026-10-31：入門除外とparkour-v8（未公開）

`corridor-parkour-v8` はEasy/Normal/Hardの3段階で、v7以前とランキング・ゴーストを分離します。`challenge.id=intro` のPOSTは400 `intro_not_recorded`、ランキングの `difficulty=intro` も400。通常のライフ8/5/3のゴーストを受け付け、旧版の読取りを維持します。記録プロトコルは2のまま、D1スキーマ変更なし。公開時はWorkerを先に更新してください。ローカルD1での確認のみで、本番へは未反映です。

## 2026-10-31：ゴーストの人物・発砲・敵（公開前）

移動形式v1に任意の `ghost.detail` を追加。発砲時刻・武器・弾道、近くの最大6体の敵の位置・姿勢を保存する。追加分は128KBまで。Workerの `validateGhost` は不正な追加情報を省いて移動を残し、公開するデータは固定の数値配列に限定する。D1スキーマや索引の変更は不要。詳細と費用対効果は [確認記録](../docs/GHOST_REPLAY_SCOPE_2026-10-31.md)。

先にこのブランチの共有モジュールを含むWorkerを公開し、`GET /` の `replayDetail:1` を確認。その後Pagesを公開する。旧Workerは追加情報を除くため、Pagesだけでは他端末から発砲・敵を閲覧できない。旧記録の移動再生は維持する。
