CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE user_watchlist (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instrument_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, instrument_id)
);

CREATE INDEX user_watchlist_instrument_idx
    ON user_watchlist(instrument_id, user_id);

CREATE TABLE user_notification_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    email TEXT NOT NULL DEFAULT '',
    on_buy INTEGER NOT NULL DEFAULT 0 CHECK (on_buy IN (0, 1)),
    on_sell INTEGER NOT NULL DEFAULT 0 CHECK (on_sell IN (0, 1))
);

CREATE TABLE notification_events (
    event_key TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL
);
