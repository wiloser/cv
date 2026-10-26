CREATE TABLE user_notification_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT '',
    instrument_id TEXT NOT NULL,
    fast_period INTEGER NOT NULL CHECK (fast_period >= 2 AND fast_period <= 299),
    slow_period INTEGER NOT NULL CHECK (slow_period > fast_period AND slow_period <= 300),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    UNIQUE (user_id, instrument_id, fast_period, slow_period)
);

CREATE INDEX user_notification_strategies_lookup_idx
    ON user_notification_strategies(instrument_id, fast_period, slow_period, enabled, user_id);

INSERT INTO user_notification_strategies(
    user_id, sort_order, label, instrument_id, fast_period, slow_period, enabled
)
SELECT n.user_id, w.sort_order, '', w.instrument_id, 12, 26, 1
FROM user_notification_settings AS n
JOIN user_watchlist AS w ON w.user_id = n.user_id
WHERE n.enabled = 1;
