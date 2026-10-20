# プレイ記録サーバー（Cloudflare Workers + D1）

ゲームが1プレイ終わるごとに、記録（結果・操作・画面サイズなど）をここへ送ります。
個人名・メールなどは送りません。端末ごとのランダムID（`gunrun-pid`）だけが付きます。

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
- 無料枠で足りる量：1プレイ1.5万〜5万バイト、D1の無料枠は5GB。10万プレイ程度までは余裕
