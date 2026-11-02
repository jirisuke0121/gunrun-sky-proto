# 管理画面のChatGPTログイン（2026-11-02）

管理画面は https://sky-corridor-owner.jirisuke.chatgpt.site/ 。ChatGPTで本人としてログインすると、管理者トークンを入力せず既存の集計を表示する。GitHub Pagesの `owner.html` からもこのページへ移動する。

## 接続と権限

- ゲームと記録の送信先は従来どおり。D1スキーマ・記録・ランキング・ゴーストは変更しない。
- 管理画面は本人だけがアクセスできる独立したSites。Sites側が提供する認証済みのIDとメールをサーバーで確認し、同一オリジンの `/api/overview` へ接続する。
- **Sitesの本人専用アクセス設定が管理者を限定する境界。公開・共有へ変更しない。** 将来共有するなら、先に管理者のID照合をサーバーへ追加する。
- Sitesと既存Workerの実行環境に同じ `OWNER_OVERVIEW_TOKEN` を秘密設定として置く。ブラウザには渡さない。専用キーで読めるのは `GET /admin/overview` の集計だけ。`GET /runs` と個別の記録は引き続き既存の `ADMIN_TOKEN` が必要。
- 公開Workerは `oai-authenticated-user-*` ヘッダーを信用しない。Sitesの認証済みヘッダーはSites内部だけで使用する。
- 画面の集計レスポンスは `private, no-store`。未ログインはAPIで401。接続先とHTTPメソッドを固定し、絞り込み条件のみ許可する。上流の接続失敗は情報を隠したエラーを返す。

従来のトークン接続画面は `owner-token.html` に残す。通常の入口は `owner.html` と上記のログイン式管理画面。

## 管理画面のソースと更新

Sitesプロジェクト: `appgprj_6ae7cc9838188191bd16869e745b6351`。ソースはこのSiteに紐づく管理リポジトリに保存する。最新の公開版はSitesの配信履歴と、その版に紐づくソースコミットを参照する。

Sitesスキルの既存Site更新手順でソースを開き、`worker/index.js` を編集する。テストは `node --test test/owner.test.mjs`、ビルドと成果物検証は `bash scripts/build.sh` と `node scripts/validate-artifact.mjs`。本人専用アクセスを保つ公開操作を使う。

既存Workerの変更は `node --test bench/foundation.test.cjs bench/record-integrity.test.cjs bench/shared-score.test.cjs` で検証する。キーの追加・変更はCloudflareの秘密設定を更新し、Sites側の秘密設定も更新してSiteを再配信する。値をソースや作業記録へ書かない。
