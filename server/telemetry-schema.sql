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
