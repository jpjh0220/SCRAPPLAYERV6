-- SQLite Authentication Schema
-- This schema implements local username/password authentication

CREATE TABLE IF NOT EXISTS auth_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CHECK(length(username) >= 3 AND length(username) <= 50),
    CHECK(length(password_hash) > 0)
);

-- Index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username);

-- Index for cleanup job (find stale accounts)
CREATE INDEX IF NOT EXISTS idx_auth_users_last_login ON auth_users(last_login);

-- Sessions table (for connect-sqlite3)
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
);

-- Index for session cleanup
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
