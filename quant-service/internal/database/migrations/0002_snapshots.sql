CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    mode TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    bar TEXT NOT NULL,
    fast_period INTEGER NOT NULL DEFAULT 0,
    slow_period INTEGER NOT NULL DEFAULT 0,
    account_currency TEXT NOT NULL DEFAULT '',
    equity_currency TEXT NOT NULL DEFAULT '',
    account_connected INTEGER NOT NULL DEFAULT 0 CHECK (account_connected IN (0, 1)),
    equity REAL NOT NULL DEFAULT 0,
    cash_balance REAL NOT NULL DEFAULT 0,
    available_balance REAL NOT NULL DEFAULT 0,
    frozen_balance REAL NOT NULL DEFAULT 0,
    unrealized_pnl REAL NOT NULL DEFAULT 0,
    realized_pnl REAL NOT NULL DEFAULT 0,
    fees REAL NOT NULL DEFAULT 0,
    equity_change REAL NOT NULL DEFAULT 0,
    bills_lookback_hours REAL NOT NULL DEFAULT 0,
    ema_latest_time TEXT NOT NULL,
    ema_close REAL NOT NULL DEFAULT 0,
    ema_signal TEXT NOT NULL DEFAULT '',
    ema_cross TEXT NOT NULL DEFAULT ''
);

CREATE INDEX snapshots_lookup_idx
    ON snapshots(instrument_id, bar, fast_period, slow_period, id DESC);

CREATE TABLE ema_values (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    period INTEGER NOT NULL,
    current_value REAL NOT NULL,
    previous_value REAL NOT NULL,
    PRIMARY KEY (snapshot_id, sort_order)
);

CREATE TABLE backtest_results (
    snapshot_id INTEGER PRIMARY KEY REFERENCES snapshots(id) ON DELETE CASCADE,
    strategy TEXT NOT NULL,
    fast_period INTEGER NOT NULL DEFAULT 0,
    slow_period INTEGER NOT NULL DEFAULT 0,
    initial_capital REAL NOT NULL DEFAULT 0,
    final_equity REAL NOT NULL DEFAULT 0,
    strategy_return REAL NOT NULL DEFAULT 0,
    benchmark_final_equity REAL NOT NULL DEFAULT 0,
    benchmark_return REAL NOT NULL DEFAULT 0,
    excess_return REAL NOT NULL DEFAULT 0,
    sharpe_ratio REAL NOT NULL DEFAULT 0,
    benchmark_sharpe_ratio REAL NOT NULL DEFAULT 0,
    max_drawdown REAL NOT NULL DEFAULT 0,
    total_trades INTEGER NOT NULL DEFAULT 0,
    executions INTEGER NOT NULL DEFAULT 0,
    winning_trades INTEGER NOT NULL DEFAULT 0,
    win_rate REAL NOT NULL DEFAULT 0,
    fee_rate REAL NOT NULL DEFAULT 0,
    slippage_rate REAL NOT NULL DEFAULT 0,
    bars INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT ''
);

CREATE TABLE backtest_equity_points (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    date TEXT NOT NULL,
    close REAL NOT NULL,
    equity REAL NOT NULL,
    benchmark REAL NOT NULL,
    drawdown REAL NOT NULL,
    position_amount REAL NOT NULL,
    PRIMARY KEY (snapshot_id, sort_order)
);

CREATE TABLE backtest_trades (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    date TEXT NOT NULL,
    side TEXT NOT NULL,
    reason TEXT NOT NULL,
    price REAL NOT NULL,
    fee REAL NOT NULL,
    pnl REAL NOT NULL,
    PRIMARY KEY (snapshot_id, sort_order)
);

CREATE TABLE backtest_assumptions (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    assumption TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, sort_order)
);

CREATE TABLE positions (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    instrument_id TEXT NOT NULL,
    position_amount REAL NOT NULL,
    average_price REAL NOT NULL,
    mark_price REAL NOT NULL,
    unrealized_pnl REAL NOT NULL,
    position_side TEXT NOT NULL,
    margin_mode TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, sort_order)
);

CREATE TABLE bills (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    bill_id TEXT NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT NOT NULL,
    currency TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    balance_change REAL NOT NULL,
    realized_pnl REAL NOT NULL,
    fee REAL NOT NULL,
    fee_currency TEXT NOT NULL,
    happened_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, sort_order)
);
