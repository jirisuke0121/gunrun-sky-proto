# 空中回廊 管理画面（Cloudflare移行版）

ゲームと同じリポジトリの `admin/` が管理画面の正本です。プレイヤー一覧・日付/配信元・個別記録・リプレイ・動作診断をSites版から移植し、被弾/落下/死亡ヒートマップを追加しました。

専用Worker `sky-corridor-owner` が既存D1 `gunrun-runs` を読みます。既存 `server/players.js` と `server/telemetry.js` を再利用します。管理者用APIキーはブラウザに渡さず、ゲームのWorkerを経由する必要もありません。ゲーム・記録Worker・DBスキーマは変更しません。リプレイは既存のGitHub Pages上の静かな再生画面を使います。

## 認証

Cloudflare Accessで本人メールだけを許可します。Workerでも `jose` でJWT署名・issuer・audience・有効期限・本人メールを検証します。設定未完了は503、トークンなしは401、不正トークン・他人は403です。静的ファイルも同じ認証を通し、`workers.dev`直アクセスや偽の認証ヘッダーで迂回できません。プレビューURLは無効にしています。

以下はWorkerのsecretとして設定し、GitHubには値を保存しません。

- `ACCESS_TEAM_DOMAIN`: `https://<team>.cloudflareaccess.com`（末尾スラッシュなし）
- `ACCESS_AUD`: この管理画面専用AccessアプリのAUD
- `OWNER_EMAIL`: 本人として許可するメールアドレス

Access側の許可ルールも本人メール1件に限定してください。ゲームの公開ドメイン・記録送信API全体にAccessを設定しないでください。保護するのは管理画面専用Workerだけです。

## 公開・切替手順

1. リポジトリを取得し `cd admin && npm ci`、`npm test`、`npm run check`。
2. `npx wrangler login` で既存Cloudflareアカウントにログイン。
3. `npm run deploy`。未設定では503で保護され、データは公開されません。実際に返ったWorker URLを控える。
4. Zero Trust > Access > Applicationsで、その管理画面ホスト全体を保護するアプリを作成。本人メールのみ許可（メールのワンタイムコード等）。ポリシーのBypassは作らない。
5. `npx wrangler secret put ACCESS_TEAM_DOMAIN`、`npx wrangler secret put ACCESS_AUD`、`npx wrangler secret put OWNER_EMAIL` を実行して各値を設定。
6. 未ログイン/他人が管理APIと画面を読めないこと、本人がプレイヤー一覧・リプレイ・動作診断・ヒートマップを開けることを本番で確認。
7. GitHub連携を設定する場合は管理画面Workerだけに、対象リポジトリ・本番ブランチ `main`・ルート `admin`・deploy command `npm run deploy` を指定。ゲームWorkerの既存設定は変更しない。専用のビルド環境でも `npm ci` が必要。
8. 確認後にリポジトリルートの `owner.html` の転送先を新URLへ更新し、Sites側にも新URLの案内を置く。切替までは今のSites版を残す。

新しいURLはデプロイ結果から取得し、推測して転送先へ書き込まないでください。既存の `owner.html` / `owner-token.html` はこの変更では変更していません。

## 検証

`npm test` はJWTの署名/issuer/audience/期限/本人メール、認証ヘッダー偽装、未設定時の拒否、静的ファイルの認証、API条件制限、ヒートマップのJST境界・配信元・最新200件制限・死亡の重複防止を検証します。`npm run check` は実際の依存と静的アセットをWranglerでバンドルします。

## ヒートマップ

期間と配信元は管理画面共通、マップ・難易度・ビルド・端末・高さ・経過時間はタブ内で選択。最新200プレイに制限したことを明示します。被弾・落下の最終ライフ喪失は赤、その他は橙・青。死亡件数は被弾/落下の内数です。各点と記録一覧から詳細を選べます。TOP6は8m四方の件数とプレイ数です。記録件数は危険率ではなく、滞在時間で補正していません。

位置の元データは既存 `mistakes`。入門・開発版を除き、ライフを失わない接触は対象外。地形は `tools/heatmap/heatmap-maps.json` を同梱した時点の形です。地形変更時は同ツールで再生成し `admin/public/heatmap-maps.json` も更新してください。過去ビルドと現在地形が一致しない場合はビルドで絞って解釈してください。

## 現時点の制約

Cloudflareのデプロイ認証とAccessアプリ設定は未完了です。ブラウザ実機/本番データでの移行先検証と転送先変更は、その設定後に行います。
