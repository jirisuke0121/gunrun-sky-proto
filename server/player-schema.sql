-- Additive owner-only analytics. No raw replay or diagnostics in owner_runs.
CREATE TABLE IF NOT EXISTS owner_runs (
 id TEXT PRIMARY KEY, player TEXT NOT NULL, name TEXT, received_at INTEGER NOT NULL,
 played_at TEXT, build TEXT, map TEXT, source TEXT, device TEXT, difficulty TEXT,
 reason TEXT, t REAL, score REAL, replay INTEGER NOT NULL, performance TEXT, country TEXT, environment TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS owner_runs_received ON owner_runs(received_at);
CREATE INDEX IF NOT EXISTS owner_runs_player ON owner_runs(player,received_at DESC,id);
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
