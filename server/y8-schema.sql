CREATE TABLE IF NOT EXISTS y8_sessions (
 token_hash TEXT PRIMARY KEY, player TEXT NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS y8_sessions_expiry ON y8_sessions(expires_at);
