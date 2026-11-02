-- Additive migration. Does not change runs, rankings, replay or delivery receipts.
CREATE TABLE IF NOT EXISTS telemetry_events (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  session TEXT NOT NULL,
  event TEXT NOT NULL,
  build TEXT NOT NULL,
  map TEXT NOT NULL,
  source TEXT NOT NULL,
  device TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  run TEXT,
  reason TEXT,
  error TEXT,
  performance TEXT
);
CREATE INDEX IF NOT EXISTS telemetry_received ON telemetry_events(received_at);
CREATE INDEX IF NOT EXISTS telemetry_session ON telemetry_events(session, received_at);

CREATE TABLE IF NOT EXISTS telemetry_environments (
  session TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  country TEXT,
  environment TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS telemetry_environment_country ON telemetry_environments(country);

CREATE TABLE IF NOT EXISTS telemetry_players (
 session TEXT PRIMARY KEY, player TEXT NOT NULL, name TEXT, received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS telemetry_players_player ON telemetry_players(player,received_at DESC);
CREATE INDEX IF NOT EXISTS telemetry_run ON telemetry_events(run,received_at) WHERE run IS NOT NULL;
CREATE VIEW IF NOT EXISTS owner_activity AS
 SELECT e.id,i.player,i.name,e.received_at AS at,'telemetry' AS kind,e.session,e.run,e.event,e.reason,e.error,e.map,e.difficulty,e.source,e.device,e.performance,v.country,COALESCE(v.environment,'{}') AS environment,NULL AS score,0 AS replay
 FROM telemetry_events e JOIN telemetry_players i ON i.session=e.session LEFT JOIN telemetry_environments v ON v.session=e.session
 UNION ALL
 SELECT r.id,r.player,r.name,r.received_at AS at,'record' AS kind,NULL AS session,r.id AS run,'finish' AS event,r.reason,NULL AS error,r.map,r.difficulty,r.source,r.device,r.performance,r.country,r.environment,r.score,r.replay
 FROM owner_runs r;
