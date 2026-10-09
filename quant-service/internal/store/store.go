package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"cv/quant-service/internal/backtest"
	"cv/quant-service/internal/database"
	"cv/quant-service/internal/ema"
	"cv/quant-service/internal/okx"
)

type Snapshot struct {
	RecordedAt         string          `json:"recordedAt"`
	Mode               string          `json:"mode"`
	InstrumentID       string          `json:"instrumentId"`
	Bar                string          `json:"bar"`
	FastPeriod         int             `json:"fastPeriod"`
	SlowPeriod         int             `json:"slowPeriod"`
	AccountCurrency    string          `json:"accountCurrency"`
	EquityCurrency     string          `json:"equityCurrency"`
	AccountConnected   bool            `json:"accountConnected"`
	EMA                ema.Analysis    `json:"ema"`
	Backtest           backtest.Result `json:"backtest"`
	Equity             float64         `json:"equity"`
	CashBalance        float64         `json:"cashBalance"`
	AvailableBalance   float64         `json:"availableBalance"`
	FrozenBalance      float64         `json:"frozenBalance"`
	UnrealizedPnL      float64         `json:"unrealizedPnL"`
	RealizedPnL        float64         `json:"realizedPnL"`
	Fees               float64         `json:"fees"`
	EquityChange       float64         `json:"equityChange"`
	BillsLookbackHours float64         `json:"billsLookbackHours"`
	Positions          []Position      `json:"positions"`
	Bills              []Bill          `json:"bills"`
}

type Position struct {
	InstrumentID  string  `json:"instrumentId"`
	Position      float64 `json:"position"`
	AveragePrice  float64 `json:"averagePrice"`
	MarkPrice     float64 `json:"markPrice"`
	UnrealizedPnL float64 `json:"unrealizedPnL"`
	PositionSide  string  `json:"positionSide"`
	MarginMode    string  `json:"marginMode"`
	UpdatedAt     string  `json:"updatedAt"`
}

type Bill struct {
	ID            string  `json:"id"`
	Type          string  `json:"type"`
	SubType       string  `json:"subType"`
	Currency      string  `json:"currency"`
	InstrumentID  string  `json:"instrumentId"`
	BalanceChange float64 `json:"balanceChange"`
	RealizedPnL   float64 `json:"realizedPnL"`
	Fee           float64 `json:"fee"`
	FeeCurrency   string  `json:"feeCurrency"`
	Time          string  `json:"time"`
}

type Store struct {
	db     *sql.DB
	ownsDB bool
}

// New opens the shared SQLite database in dataDir. NewWithDB lets the service
// use the same migrated connection pool for account and snapshot data.
func New(dataDir string) (*Store, error) {
	db, err := database.Open(dataDir)
	if err != nil {
		return nil, err
	}
	store, err := NewWithDB(db)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	store.ownsDB = true
	return store, nil
}

func NewWithDB(db *sql.DB) (*Store, error) {
	if db == nil {
		return nil, errors.New("snapshot database must not be nil")
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	if s == nil || !s.ownsDB || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) Append(snapshot Snapshot) error {
	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin snapshot write: %w", err)
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `INSERT INTO snapshots(
		recorded_at, mode, instrument_id, bar, fast_period, slow_period,
		account_currency, equity_currency, account_connected, equity, cash_balance,
		available_balance, frozen_balance, unrealized_pnl, realized_pnl, fees,
		equity_change, bills_lookback_hours, ema_latest_time, ema_close, ema_signal, ema_cross
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		snapshot.RecordedAt, snapshot.Mode, snapshot.InstrumentID, snapshot.Bar,
		snapshot.FastPeriod, snapshot.SlowPeriod, snapshot.AccountCurrency, snapshot.EquityCurrency,
		snapshot.AccountConnected, snapshot.Equity, snapshot.CashBalance, snapshot.AvailableBalance,
		snapshot.FrozenBalance, snapshot.UnrealizedPnL, snapshot.RealizedPnL, snapshot.Fees,
		snapshot.EquityChange, snapshot.BillsLookbackHours,
		snapshot.EMA.LatestTime.UTC().Format(time.RFC3339Nano), snapshot.EMA.Close,
		snapshot.EMA.Signal, snapshot.EMA.Cross,
	)
	if err != nil {
		return fmt.Errorf("insert snapshot: %w", err)
	}
	snapshotID, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("read inserted snapshot id: %w", err)
	}
	if err := insertEMAValues(ctx, tx, snapshotID, snapshot.EMA.Values); err != nil {
		return err
	}
	if err := insertBacktest(ctx, tx, snapshotID, snapshot.Backtest); err != nil {
		return err
	}
	for index, position := range snapshot.Positions {
		if _, err := tx.ExecContext(ctx, `INSERT INTO positions(
			snapshot_id, sort_order, instrument_id, position_amount, average_price,
			mark_price, unrealized_pnl, position_side, margin_mode, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, snapshotID, index, position.InstrumentID,
			position.Position, position.AveragePrice, position.MarkPrice, position.UnrealizedPnL,
			position.PositionSide, position.MarginMode, position.UpdatedAt); err != nil {
			return fmt.Errorf("insert snapshot position: %w", err)
		}
	}
	for index, bill := range snapshot.Bills {
		if _, err := tx.ExecContext(ctx, `INSERT INTO bills(
			snapshot_id, sort_order, bill_id, type, subtype, currency, instrument_id,
			balance_change, realized_pnl, fee, fee_currency, happened_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, snapshotID, index, bill.ID,
			bill.Type, bill.SubType, bill.Currency, bill.InstrumentID, bill.BalanceChange,
			bill.RealizedPnL, bill.Fee, bill.FeeCurrency, bill.Time); err != nil {
			return fmt.Errorf("insert snapshot bill: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit snapshot: %w", err)
	}
	return nil
}

func insertEMAValues(ctx context.Context, tx *sql.Tx, snapshotID int64, values []ema.Value) error {
	for index, value := range values {
		if _, err := tx.ExecContext(ctx, `INSERT INTO ema_values(snapshot_id, sort_order, period, current_value, previous_value) VALUES (?, ?, ?, ?, ?)`,
			snapshotID, index, value.Period, value.Current, value.Previous); err != nil {
			return fmt.Errorf("insert EMA value: %w", err)
		}
	}
	return nil
}

func insertBacktest(ctx context.Context, tx *sql.Tx, snapshotID int64, result backtest.Result) error {
	if _, err := tx.ExecContext(ctx, `INSERT INTO backtest_results(
		snapshot_id, strategy, fast_period, slow_period, initial_capital, final_equity,
		strategy_return, benchmark_final_equity, benchmark_return, excess_return,
		sharpe_ratio, benchmark_sharpe_ratio, max_drawdown, total_trades, executions,
		winning_trades, win_rate, fee_rate, slippage_rate, bars, start_date, end_date
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		snapshotID, result.Strategy, result.FastPeriod, result.SlowPeriod, result.InitialCapital,
		result.FinalEquity, result.StrategyReturn, result.BenchmarkFinalEquity, result.BenchmarkReturn,
		result.ExcessReturn, result.SharpeRatio, result.BenchmarkSharpeRatio, result.MaxDrawdown,
		result.TotalTrades, result.Executions, result.WinningTrades, result.WinRate,
		result.FeeRate, result.SlippageRate, result.Bars, result.Start, result.End,
	); err != nil {
		return fmt.Errorf("insert backtest summary: %w", err)
	}
	for index, point := range result.EquityCurve {
		if _, err := tx.ExecContext(ctx, `INSERT INTO backtest_equity_points(
			snapshot_id, sort_order, date, close, equity, benchmark, drawdown, position_amount
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, snapshotID, index, point.Date, point.Close,
			point.Equity, point.Benchmark, point.Drawdown, point.Position); err != nil {
			return fmt.Errorf("insert backtest equity point: %w", err)
		}
	}
	for index, trade := range result.Trades {
		if _, err := tx.ExecContext(ctx, `INSERT INTO backtest_trades(
			snapshot_id, sort_order, date, side, reason, price, fee, pnl
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, snapshotID, index, trade.Date, trade.Side,
			trade.Reason, trade.Price, trade.Fee, trade.PnL); err != nil {
			return fmt.Errorf("insert backtest trade: %w", err)
		}
	}
	for index, assumption := range result.Assumptions {
		if _, err := tx.ExecContext(ctx, `INSERT INTO backtest_assumptions(snapshot_id, sort_order, assumption) VALUES (?, ?, ?)`, snapshotID, index, assumption); err != nil {
			return fmt.Errorf("insert backtest assumption: %w", err)
		}
	}
	return nil
}

func (s *Store) Latest() (Snapshot, bool, error) {
	id, found, err := s.latestID("", nil)
	if err != nil || !found {
		return Snapshot{}, found, err
	}
	snapshot, err := s.load(id)
	return snapshot, err == nil, err
}

func (s *Store) List(limit int) ([]Snapshot, error) {
	return s.list(limit, "", nil)
}

func (s *Store) LatestFor(instrumentID, bar string, fastPeriod, slowPeriod int) (Snapshot, bool, error) {
	where, args := snapshotFilter(instrumentID, bar, fastPeriod, slowPeriod)
	id, found, err := s.latestID(where, args)
	if err != nil || !found {
		return Snapshot{}, found, err
	}
	snapshot, err := s.load(id)
	return snapshot, err == nil, err
}

func (s *Store) ListFor(instrumentID, bar string, fastPeriod, slowPeriod, limit int) ([]Snapshot, error) {
	where, args := snapshotFilter(instrumentID, bar, fastPeriod, slowPeriod)
	return s.list(limit, where, args)
}

func snapshotFilter(instrumentID, bar string, fastPeriod, slowPeriod int) (string, []any) {
	conditions := make([]string, 0, 4)
	args := make([]any, 0, 4)
	if instrumentID != "" {
		conditions = append(conditions, "instrument_id = ?")
		args = append(args, instrumentID)
	}
	if bar != "" {
		conditions = append(conditions, "bar = ?")
		args = append(args, bar)
	}
	if fastPeriod != 0 || slowPeriod != 0 {
		conditions = append(conditions, "fast_period = ? AND slow_period = ?")
		args = append(args, fastPeriod, slowPeriod)
	}
	if len(conditions) == 0 {
		return "", nil
	}
	where := " WHERE "
	for index, condition := range conditions {
		if index > 0 {
			where += " AND "
		}
		where += condition
	}
	return where, args
}

func (s *Store) latestID(where string, args []any) (int64, bool, error) {
	var id int64
	err := s.db.QueryRowContext(context.Background(), `SELECT id FROM snapshots`+where+` ORDER BY id DESC LIMIT 1`, args...).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("find latest snapshot: %w", err)
	}
	return id, true, nil
}

func (s *Store) list(limit int, where string, args []any) ([]Snapshot, error) {
	if limit <= 0 {
		limit = 50
	}
	query := `SELECT id FROM snapshots` + where + ` ORDER BY id DESC LIMIT ?`
	queryArgs := append(append([]any(nil), args...), limit)
	rows, err := s.db.QueryContext(context.Background(), query, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("query snapshots: %w", err)
	}
	ids := make([]int64, 0, limit)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("read snapshot id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate snapshot ids: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close snapshot query: %w", err)
	}

	snapshots := make([]Snapshot, 0, len(ids))
	for index := len(ids) - 1; index >= 0; index-- {
		snapshot, err := s.load(ids[index])
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots, nil
}

func (s *Store) load(id int64) (Snapshot, error) {
	ctx := context.Background()
	var snapshot Snapshot
	var latestEMATime string
	err := s.db.QueryRowContext(ctx, `SELECT
		recorded_at, mode, instrument_id, bar, fast_period, slow_period,
		account_currency, equity_currency, account_connected, equity, cash_balance,
		available_balance, frozen_balance, unrealized_pnl, realized_pnl, fees,
		equity_change, bills_lookback_hours, ema_latest_time, ema_close, ema_signal, ema_cross
		FROM snapshots WHERE id = ?`, id).Scan(
		&snapshot.RecordedAt, &snapshot.Mode, &snapshot.InstrumentID, &snapshot.Bar,
		&snapshot.FastPeriod, &snapshot.SlowPeriod, &snapshot.AccountCurrency, &snapshot.EquityCurrency,
		&snapshot.AccountConnected, &snapshot.Equity, &snapshot.CashBalance, &snapshot.AvailableBalance,
		&snapshot.FrozenBalance, &snapshot.UnrealizedPnL, &snapshot.RealizedPnL, &snapshot.Fees,
		&snapshot.EquityChange, &snapshot.BillsLookbackHours, &latestEMATime, &snapshot.EMA.Close,
		&snapshot.EMA.Signal, &snapshot.EMA.Cross,
	)
	if err != nil {
		return Snapshot{}, fmt.Errorf("load snapshot %d: %w", id, err)
	}
	snapshot.EMA.LatestTime, err = time.Parse(time.RFC3339Nano, latestEMATime)
	if err != nil {
		return Snapshot{}, fmt.Errorf("parse EMA time in snapshot %d: %w", id, err)
	}

	snapshot.EMA.Values, err = s.loadEMAValues(ctx, id)
	if err != nil {
		return Snapshot{}, err
	}
	snapshot.Backtest, err = s.loadBacktest(ctx, id)
	if err != nil {
		return Snapshot{}, err
	}
	snapshot.Positions, err = s.loadPositions(ctx, id)
	if err != nil {
		return Snapshot{}, err
	}
	snapshot.Bills, err = s.loadBills(ctx, id)
	if err != nil {
		return Snapshot{}, err
	}
	return snapshot, nil
}

func (s *Store) loadEMAValues(ctx context.Context, snapshotID int64) ([]ema.Value, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT period, current_value, previous_value FROM ema_values WHERE snapshot_id = ? ORDER BY sort_order`, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("query EMA values: %w", err)
	}
	defer rows.Close()
	values := make([]ema.Value, 0)
	for rows.Next() {
		var value ema.Value
		if err := rows.Scan(&value.Period, &value.Current, &value.Previous); err != nil {
			return nil, fmt.Errorf("read EMA value: %w", err)
		}
		values = append(values, value)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate EMA values: %w", err)
	}
	return values, nil
}

func (s *Store) loadBacktest(ctx context.Context, snapshotID int64) (backtest.Result, error) {
	var result backtest.Result
	err := s.db.QueryRowContext(ctx, `SELECT
		strategy, fast_period, slow_period, initial_capital, final_equity,
		strategy_return, benchmark_final_equity, benchmark_return, excess_return,
		sharpe_ratio, benchmark_sharpe_ratio, max_drawdown, total_trades, executions,
		winning_trades, win_rate, fee_rate, slippage_rate, bars, start_date, end_date
		FROM backtest_results WHERE snapshot_id = ?`, snapshotID).Scan(
		&result.Strategy, &result.FastPeriod, &result.SlowPeriod, &result.InitialCapital,
		&result.FinalEquity, &result.StrategyReturn, &result.BenchmarkFinalEquity,
		&result.BenchmarkReturn, &result.ExcessReturn, &result.SharpeRatio,
		&result.BenchmarkSharpeRatio, &result.MaxDrawdown, &result.TotalTrades,
		&result.Executions, &result.WinningTrades, &result.WinRate, &result.FeeRate,
		&result.SlippageRate, &result.Bars, &result.Start, &result.End,
	)
	if err != nil {
		return backtest.Result{}, fmt.Errorf("load backtest summary: %w", err)
	}
	result.EquityCurve, err = s.loadEquityCurve(ctx, snapshotID)
	if err != nil {
		return backtest.Result{}, err
	}
	result.Trades, err = s.loadTrades(ctx, snapshotID)
	if err != nil {
		return backtest.Result{}, err
	}
	result.Assumptions, err = s.loadAssumptions(ctx, snapshotID)
	if err != nil {
		return backtest.Result{}, err
	}
	return result, nil
}

func (s *Store) loadEquityCurve(ctx context.Context, snapshotID int64) ([]backtest.EquityPoint, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT date, close, equity, benchmark, drawdown, position_amount FROM backtest_equity_points WHERE snapshot_id = ? ORDER BY sort_order`, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("query backtest equity curve: %w", err)
	}
	defer rows.Close()
	points := make([]backtest.EquityPoint, 0)
	for rows.Next() {
		var point backtest.EquityPoint
		if err := rows.Scan(&point.Date, &point.Close, &point.Equity, &point.Benchmark, &point.Drawdown, &point.Position); err != nil {
			return nil, fmt.Errorf("read backtest equity point: %w", err)
		}
		points = append(points, point)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate backtest equity curve: %w", err)
	}
	return points, nil
}

func (s *Store) loadTrades(ctx context.Context, snapshotID int64) ([]backtest.Trade, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT date, side, reason, price, fee, pnl FROM backtest_trades WHERE snapshot_id = ? ORDER BY sort_order`, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("query backtest trades: %w", err)
	}
	defer rows.Close()
	trades := make([]backtest.Trade, 0)
	for rows.Next() {
		var trade backtest.Trade
		if err := rows.Scan(&trade.Date, &trade.Side, &trade.Reason, &trade.Price, &trade.Fee, &trade.PnL); err != nil {
			return nil, fmt.Errorf("read backtest trade: %w", err)
		}
		trades = append(trades, trade)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate backtest trades: %w", err)
	}
	return trades, nil
}

func (s *Store) loadAssumptions(ctx context.Context, snapshotID int64) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT assumption FROM backtest_assumptions WHERE snapshot_id = ? ORDER BY sort_order`, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("query backtest assumptions: %w", err)
	}
	defer rows.Close()
	assumptions := make([]string, 0)
	for rows.Next() {
		var assumption string
		if err := rows.Scan(&assumption); err != nil {
			return nil, fmt.Errorf("read backtest assumption: %w", err)
		}
		assumptions = append(assumptions, assumption)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate backtest assumptions: %w", err)
	}
	return assumptions, nil
}

func (s *Store) loadPositions(ctx context.Context, snapshotID int64) ([]Position, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT instrument_id, position_amount, average_price, mark_price, unrealized_pnl, position_side, margin_mode, updated_at FROM positions WHERE snapshot_id = ? ORDER BY sort_order`, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("query positions: %w", err)
	}
	defer rows.Close()
	positions := make([]Position, 0)
	for rows.Next() {
		var position Position
		if err := rows.Scan(&position.InstrumentID, &position.Position, &position.AveragePrice, &position.MarkPrice, &position.UnrealizedPnL, &position.PositionSide, &position.MarginMode, &position.UpdatedAt); err != nil {
			return nil, fmt.Errorf("read position: %w", err)
		}
		positions = append(positions, position)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate positions: %w", err)
	}
	return positions, nil
}

func (s *Store) loadBills(ctx context.Context, snapshotID int64) ([]Bill, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT bill_id, type, subtype, currency, instrument_id, balance_change, realized_pnl, fee, fee_currency, happened_at FROM bills WHERE snapshot_id = ? ORDER BY sort_order`, snapshotID)
	if err != nil {
		return nil, fmt.Errorf("query bills: %w", err)
	}
	defer rows.Close()
	bills := make([]Bill, 0)
	for rows.Next() {
		var bill Bill
		if err := rows.Scan(&bill.ID, &bill.Type, &bill.SubType, &bill.Currency, &bill.InstrumentID, &bill.BalanceChange, &bill.RealizedPnL, &bill.Fee, &bill.FeeCurrency, &bill.Time); err != nil {
			return nil, fmt.Errorf("read bill: %w", err)
		}
		bills = append(bills, bill)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate bills: %w", err)
	}
	return bills, nil
}

func PositionFromOKX(position okx.Position) Position {
	return Position{
		InstrumentID:  position.InstrumentID,
		Position:      position.Position,
		AveragePrice:  position.AveragePrice,
		MarkPrice:     position.MarkPrice,
		UnrealizedPnL: position.UnrealizedPnL,
		PositionSide:  position.PositionSide,
		MarginMode:    position.MarginMode,
		UpdatedAt:     position.UpdatedAt.Format("2006-01-02T15:04:05.000Z"),
	}
}

func BillFromOKX(bill okx.Bill) Bill {
	return Bill{
		ID:            bill.ID,
		Type:          bill.Type,
		SubType:       bill.SubType,
		Currency:      bill.Currency,
		InstrumentID:  bill.InstrumentID,
		BalanceChange: bill.BalanceChange,
		RealizedPnL:   bill.RealizedPnL,
		Fee:           bill.Fee,
		FeeCurrency:   bill.FeeCurrency,
		Time:          bill.Time.Format("2006-01-02T15:04:05.000Z"),
	}
}
