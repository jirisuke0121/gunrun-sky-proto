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

-- Narrow rank candidates before parsing replay JSON or sorting player bests.
CREATE INDEX IF NOT EXISTS runs_rank_scope ON runs (
  COALESCE(json_extract(json, '$.mapKey'), CASE WHEN json_extract(json, '$.map.id') = 'rock_canyon_v1' OR json_extract(json, '$.mapVersion') = 'rock-canyon-v1'
              THEN 'rock-canyon' ELSE 'old-town' END),
  json_extract(json, '$.challenge.version'), json_extract(json, '$.challenge.id')
) WHERE reason IN ('time','caught','fell') AND score IS NOT NULL;

-- Additive owner-only analytics. No raw replay or diagnostics in owner_runs.
CREATE TABLE IF NOT EXISTS owner_runs (
 id TEXT PRIMARY KEY, player TEXT NOT NULL, name TEXT, received_at INTEGER NOT NULL,
 played_at TEXT, build TEXT, map TEXT, source TEXT, device TEXT, difficulty TEXT,
 reason TEXT, t REAL, score REAL, replay INTEGER NOT NULL, performance TEXT, country TEXT, environment TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS owner_runs_received ON owner_runs(received_at);
CREATE INDEX IF NOT EXISTS owner_runs_player ON owner_runs(player,received_at DESC,id);
