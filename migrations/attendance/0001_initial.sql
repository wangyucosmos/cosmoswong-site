PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('normal','leave','rest','missing','makeup')), minutes INTEGER CHECK(minutes IS NULL OR minutes BETWEEN 0 AND 1440), note TEXT NOT NULL DEFAULT '', revision TEXT NOT NULL, PRIMARY KEY(user_id,date));
CREATE TABLE IF NOT EXISTS throttles (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
