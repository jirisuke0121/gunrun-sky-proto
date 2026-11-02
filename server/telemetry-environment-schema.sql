-- Additive and idempotent. No raw IP/UA, persistent visitor ID or player record.
CREATE TABLE IF NOT EXISTS telemetry_environments (
  session TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  country TEXT,
  environment TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS telemetry_environment_country ON telemetry_environments(country);
