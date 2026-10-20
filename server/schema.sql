-- GunRun 試作のプレイ記録（Cloudflare D1）
CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,          -- サーバーが受け取った時刻(ISO)
  played_at   TEXT,                   -- ゲームが記録した時刻(ISO)
  build       TEXT,
  player      TEXT,                   -- 端末ごとのランダムID（個人は特定しない）
  reason      TEXT,                   -- time / caught / fell / quit
  t           REAL,                   -- 生存秒
  stars       INTEGER,
  score       INTEGER,
  kills       INTEGER,
  gun_kills   INTEGER,
  input       TEXT,                   -- touch / keys
  screen_w    INTEGER,
  screen_h    INTEGER,
  json        TEXT NOT NULL           -- 1プレイ分の完全な記録
);
CREATE INDEX IF NOT EXISTS runs_received ON runs(received_at);
CREATE INDEX IF NOT EXISTS runs_player   ON runs(player, received_at);
CREATE INDEX IF NOT EXISTS runs_build    ON runs(build);
