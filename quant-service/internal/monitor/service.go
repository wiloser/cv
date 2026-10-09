package monitor

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"cv/quant-service/internal/backtest"
	"cv/quant-service/internal/config"
	"cv/quant-service/internal/ema"
	"cv/quant-service/internal/okx"
	"cv/quant-service/internal/store"
)

type Service struct {
	syncMu sync.Mutex
	cfg    config.Config
	client *okx.Client
	store  *store.Store
}

type RunOptions struct {
	InstrumentID string
	FastPeriod   int
	SlowPeriod   int
}

type InvalidOptionsError struct {
	Message string
}

func (e *InvalidOptionsError) Error() string {
	return e.Message
}

func IsInvalidOptions(err error) bool {
	var target *InvalidOptionsError
	return errors.As(err, &target)
}

type SyncResult struct {
	Snapshot    store.Snapshot `json:"snapshot"`
	CandleCount int            `json:"candleCount"`
	Warnings    []string       `json:"warnings"`
}

type MarketQuote struct {
	InstrumentID      string  `json:"instrumentId"`
	Last              float64 `json:"last"`
	Open24h           float64 `json:"open24h"`
	High24h           float64 `json:"high24h"`
	Low24h            float64 `json:"low24h"`
	Volume24h         float64 `json:"volume24h"`
	VolumeCurrency24h float64 `json:"volumeCurrency24h"`
	Change24h         float64 `json:"change24h"`
	UpdatedAt         string  `json:"updatedAt"`
}

type Dashboard struct {
	InstrumentID string           `json:"instrumentId"`
	Bar          string           `json:"bar"`
	FastPeriod   int              `json:"fastPeriod"`
	SlowPeriod   int              `json:"slowPeriod"`
	EMA          ema.Analysis     `json:"ema"`
	Latest       store.Snapshot   `json:"latest"`
	HasLatest    bool             `json:"hasLatest"`
	History      []store.Snapshot `json:"history"`
}

type MonitorData struct {
	Mode         string                 `json:"mode"`
	InstrumentID string                 `json:"instrumentId"`
	Bar          string                 `json:"bar"`
	FastPeriod   int                    `json:"fastPeriod"`
	SlowPeriod   int                    `json:"slowPeriod"`
	UpdatedAt    string                 `json:"updatedAt"`
	NextSyncAt   string                 `json:"nextSyncAt"`
	SyncSchedule string                 `json:"syncSchedule"`
	SourceNote   string                 `json:"sourceNote"`
	Metrics      []MonitorMetric        `json:"metrics"`
	Trend        []MonitorTrendPoint    `json:"trend"`
	Sources      []MonitorSource        `json:"sources"`
	Quality      []MonitorQualityMetric `json:"quality"`
	Alerts       []MonitorAlert         `json:"alerts"`
	SyncRuns     []MonitorSyncRun       `json:"syncRuns"`
	Backtest     *backtest.Result       `json:"backtest,omitempty"`
}

type MonitorMetric struct {
	Label     string `json:"label"`
	Value     string `json:"value"`
	Change    string `json:"change"`
	Direction string `json:"direction"`
	Note      string `json:"note"`
}

type MonitorTrendPoint struct {
	Date      string  `json:"date"`
	Value     float64 `json:"value"`
	Secondary float64 `json:"secondary"`
}

type MonitorSource struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Status   string `json:"status"`
	LastSync string `json:"lastSync"`
	Records  string `json:"records"`
	Coverage string `json:"coverage"`
	Latency  string `json:"latency"`
}

type MonitorQualityMetric struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	Color string  `json:"color"`
}

type MonitorAlert struct {
	Level       string `json:"level"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Time        string `json:"time"`
}

type MonitorSyncRun struct {
	Time   string `json:"time"`
	Label  string `json:"label"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}

func NewService(cfg config.Config, client *okx.Client, snapshotStore *store.Store) *Service {
	return &Service{cfg: cfg, client: client, store: snapshotStore}
}

func (s *Service) DefaultInstrumentID() string {
	return s.cfg.InstrumentID
}

func (s *Service) Sync(ctx context.Context) (SyncResult, error) {
	return s.SyncWithOptions(ctx, RunOptions{})
}

func (s *Service) MarketQuotes(ctx context.Context, symbols []string, quoteCurrency string) ([]MarketQuote, error) {
	tickers, err := s.client.GetTickers(ctx, s.cfg.InstrumentType)
	if err != nil {
		return nil, err
	}

	requested := make([]string, 0, len(symbols))
	seen := make(map[string]struct{}, len(symbols))
	for _, symbol := range symbols {
		normalized := strings.ToUpper(strings.TrimSpace(symbol))
		if normalized == "" {
			continue
		}
		if !matchesQuoteCurrency(normalized, quoteCurrency) {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		requested = append(requested, normalized)
	}
	if len(requested) == 0 {
		requested = make([]string, 0, len(tickers))
		for _, ticker := range tickers {
			normalized := strings.ToUpper(strings.TrimSpace(ticker.InstrumentID))
			if normalized == "" {
				continue
			}
			if !matchesQuoteCurrency(normalized, quoteCurrency) {
				continue
			}
			if _, exists := seen[normalized]; exists {
				continue
			}
			seen[normalized] = struct{}{}
			requested = append(requested, normalized)
		}
	}

	byInstrument := make(map[string]okx.Ticker, len(tickers))
	for _, ticker := range tickers {
		byInstrument[strings.ToUpper(ticker.InstrumentID)] = ticker
	}

	quotes := make([]MarketQuote, 0, len(requested))
	for _, symbol := range requested {
		ticker, exists := byInstrument[symbol]
		if !exists {
			continue
		}
		change := 0.0
		if ticker.Open24h > 0 {
			change = ticker.Last/ticker.Open24h - 1
		}
		updatedAt := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		if !ticker.Time.IsZero() {
			updatedAt = ticker.Time.Format("2006-01-02T15:04:05.000Z")
		}
		quotes = append(quotes, MarketQuote{
			InstrumentID:      ticker.InstrumentID,
			Last:              ticker.Last,
			Open24h:           ticker.Open24h,
			High24h:           ticker.High24h,
			Low24h:            ticker.Low24h,
			Volume24h:         ticker.Volume24h,
			VolumeCurrency24h: ticker.VolumeCurrency24h,
			Change24h:         change,
			UpdatedAt:         updatedAt,
		})
	}
	return quotes, nil
}

func matchesQuoteCurrency(instrumentID, quoteCurrency string) bool {
	quoteCurrency = strings.TrimSpace(quoteCurrency)
	if quoteCurrency == "" {
		return true
	}
	return strings.HasSuffix(strings.ToUpper(instrumentID), "-"+strings.ToUpper(quoteCurrency))
}

func (s *Service) SyncWithOptions(ctx context.Context, options RunOptions) (SyncResult, error) {
	instrumentID, emaPeriods, err := s.resolveOptions(options)
	if err != nil {
		return SyncResult{}, err
	}

	s.syncMu.Lock()
	defer s.syncMu.Unlock()

	if s.cfg.HasAnyPrivateCredential() && !s.cfg.PrivateAPIConfigured() {
		return SyncResult{}, errors.New("OKX private API credentials are incomplete; set OKX_API_KEY, OKX_API_SECRET and OKX_API_PASSPHRASE together")
	}

	candles, err := s.client.GetCandles(ctx, instrumentID, s.cfg.Bar, s.cfg.CandleLimit)
	if err != nil {
		return SyncResult{}, err
	}
	confirmed := make([]okx.Candle, 0, len(candles))
	for _, candle := range candles {
		if candle.Confirmed {
			confirmed = append(confirmed, candle)
		}
	}
	if len(confirmed) == 0 {
		return SyncResult{}, errors.New("OKX returned no confirmed candles")
	}

	points := make([]ema.PricePoint, 0, len(confirmed))
	for _, candle := range confirmed {
		points = append(points, ema.PricePoint{Time: candle.Time, Close: candle.Close})
	}
	analysis, err := ema.Analyze(points, emaPeriods)
	if err != nil {
		return SyncResult{}, err
	}

	warnings := make([]string, 0)
	now := time.Now().UTC()
	snapshot := store.Snapshot{
		RecordedAt:         now.Format("2006-01-02T15:04:05.000Z"),
		Mode:               "market-only",
		InstrumentID:       instrumentID,
		Bar:                s.cfg.Bar,
		FastPeriod:         emaPeriods[0],
		SlowPeriod:         emaPeriods[len(emaPeriods)-1],
		AccountCurrency:    s.cfg.AccountCurrency,
		EquityCurrency:     "USD",
		AccountConnected:   false,
		EMA:                analysis,
		Positions:          []store.Position{},
		Bills:              []store.Bill{},
		BillsLookbackHours: s.cfg.BillsLookback.Hours(),
	}
	if len(emaPeriods) >= 2 {
		backtestBars := make([]backtest.Bar, 0, len(confirmed))
		for _, candle := range confirmed {
			backtestBars = append(backtestBars, backtest.Bar{Time: candle.Time, Open: candle.Open, Close: candle.Close})
		}
		backtestResult, backtestErr := backtest.Run(backtestBars, emaPeriods[0], emaPeriods[len(emaPeriods)-1], backtest.Config{
			InitialCapital: s.cfg.BacktestInitialCapital,
			FeeRate:        s.cfg.BacktestFeeRate,
			SlippageRate:   s.cfg.BacktestSlippageRate,
		})
		if backtestErr != nil {
			warnings = append(warnings, "EMA 回测未完成: "+backtestErr.Error())
		} else {
			snapshot.Backtest = backtestResult
		}
	} else {
		warnings = append(warnings, "EMA 回测至少需要两个周期")
	}

	if s.cfg.PrivateAPIConfigured() {
		balance, err := s.client.GetAccountBalance(ctx, s.cfg.AccountCurrency)
		if err != nil {
			return SyncResult{}, fmt.Errorf("read OKX account balance: %w", err)
		}
		accountDetail, found := findBalanceDetail(balance, s.cfg.AccountCurrency)
		if !found {
			warnings = append(warnings, fmt.Sprintf("OKX account balance did not include %s detail", s.cfg.AccountCurrency))
		}

		snapshot.Mode = "live"
		snapshot.AccountConnected = true
		snapshot.Equity = balance.TotalEquity
		snapshot.CashBalance = accountDetail.CashBalance
		snapshot.AvailableBalance = accountDetail.Available
		snapshot.FrozenBalance = accountDetail.Frozen
		snapshot.UnrealizedPnL = accountDetail.UnrealizedPnL

		if s.cfg.ShouldReadPositions() {
			positions, err := s.client.GetPositions(ctx, s.cfg.InstrumentType, instrumentID)
			if err != nil {
				return SyncResult{}, fmt.Errorf("read OKX positions: %w", err)
			}
			for _, position := range positions {
				snapshot.Positions = append(snapshot.Positions, store.PositionFromOKX(position))
			}
			if snapshot.UnrealizedPnL == 0 {
				for _, position := range positions {
					snapshot.UnrealizedPnL += position.UnrealizedPnL
				}
			}
		}

		bills, err := s.client.GetBills(ctx, s.cfg.AccountCurrency, now.Add(-s.cfg.BillsLookback), now)
		if err != nil {
			return SyncResult{}, fmt.Errorf("read OKX account bills: %w", err)
		}
		for _, bill := range bills {
			if bill.Currency != "" && !strings.EqualFold(bill.Currency, s.cfg.AccountCurrency) {
				continue
			}
			snapshot.RealizedPnL += bill.RealizedPnL
			snapshot.Fees += bill.Fee
			snapshot.Bills = append(snapshot.Bills, store.BillFromOKX(bill))
		}
	}

	if previous, found, err := s.store.LatestFor(instrumentID, s.cfg.Bar, emaPeriods[0], emaPeriods[len(emaPeriods)-1]); err != nil {
		return SyncResult{}, err
	} else if found && previous.AccountConnected && snapshot.AccountConnected {
		snapshot.EquityChange = snapshot.Equity - previous.Equity
	}

	if err := s.store.Append(snapshot); err != nil {
		return SyncResult{}, err
	}
	return SyncResult{Snapshot: snapshot, CandleCount: len(confirmed), Warnings: warnings}, nil
}

func (s *Service) Optimize(ctx context.Context, options RunOptions, search backtest.SearchConfig) (backtest.OptimizationResult, error) {
	instrumentID, _, err := s.resolveOptions(options)
	if err != nil {
		return backtest.OptimizationResult{}, err
	}

	s.syncMu.Lock()
	defer s.syncMu.Unlock()

	candles, err := s.client.GetCandles(ctx, instrumentID, s.cfg.Bar, s.cfg.CandleLimit)
	if err != nil {
		return backtest.OptimizationResult{}, err
	}
	confirmed := make([]backtest.Bar, 0, len(candles))
	for _, candle := range candles {
		if candle.Confirmed {
			confirmed = append(confirmed, backtest.Bar{Time: candle.Time, Open: candle.Open, Close: candle.Close})
		}
	}
	if len(confirmed) == 0 {
		return backtest.OptimizationResult{}, errors.New("OKX returned no confirmed candles")
	}

	result, err := backtest.Optimize(confirmed, backtest.Config{
		InitialCapital: s.cfg.BacktestInitialCapital,
		FeeRate:        s.cfg.BacktestFeeRate,
		SlippageRate:   s.cfg.BacktestSlippageRate,
	}, search)
	if err != nil {
		return backtest.OptimizationResult{}, err
	}
	result.InstrumentID = instrumentID
	result.Bar = s.cfg.Bar
	return result, nil
}

func (s *Service) Dashboard() (Dashboard, error) {
	return s.DashboardFor(RunOptions{})
}

func (s *Service) DashboardFor(options RunOptions) (Dashboard, error) {
	instrumentID, emaPeriods, err := s.resolveOptions(options)
	if err != nil {
		return Dashboard{}, err
	}
	latest, hasLatest, err := s.store.LatestFor(instrumentID, s.cfg.Bar, emaPeriods[0], emaPeriods[len(emaPeriods)-1])
	if err != nil {
		return Dashboard{}, err
	}
	history, err := s.store.ListFor(instrumentID, s.cfg.Bar, emaPeriods[0], emaPeriods[len(emaPeriods)-1], 100)
	if err != nil {
		return Dashboard{}, err
	}
	dashboard := Dashboard{
		InstrumentID: instrumentID,
		Bar:          s.cfg.Bar,
		FastPeriod:   emaPeriods[0],
		SlowPeriod:   emaPeriods[len(emaPeriods)-1],
		Latest:       latest,
		HasLatest:    hasLatest,
		History:      history,
	}
	if hasLatest {
		dashboard.EMA = latest.EMA
	}
	return dashboard, nil
}

func (s *Service) MonitorData() (MonitorData, error) {
	return s.MonitorDataFor(RunOptions{})
}

func (s *Service) MonitorDataFor(options RunOptions) (MonitorData, error) {
	instrumentID, emaPeriods, err := s.resolveOptions(options)
	if err != nil {
		return MonitorData{}, err
	}
	dashboard, err := s.DashboardFor(options)
	if err != nil {
		return MonitorData{}, err
	}
	fastPeriod := emaPeriods[0]
	slowPeriod := emaPeriods[len(emaPeriods)-1]
	data := MonitorData{
		Mode:         "demo",
		InstrumentID: instrumentID,
		Bar:          s.cfg.Bar,
		FastPeriod:   fastPeriod,
		SlowPeriod:   slowPeriod,
		UpdatedAt:    time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		NextSyncAt:   time.Now().UTC().Add(s.cfg.SyncInterval).Format("2006-01-02T15:04:05.000Z"),
		SyncSchedule: "每 " + s.cfg.SyncInterval.String(),
		SourceNote:   "OKX 只读行情与账户快照，服务不包含下单、撤单或提现接口。",
		Metrics: []MonitorMetric{
			{Label: "EMA " + strconv.Itoa(fastPeriod), Value: "--", Change: "--", Direction: "flat", Note: "等待首次同步"},
			{Label: "EMA " + strconv.Itoa(slowPeriod), Value: "--", Change: "--", Direction: "flat", Note: "等待首次同步"},
			{Label: "实盘权益", Value: "--", Change: "--", Direction: "flat", Note: "未连接账户"},
			{Label: "区间已实现收益", Value: "--", Change: "--", Direction: "flat", Note: "未连接账户"},
		},
		Trend:    []MonitorTrendPoint{},
		Sources:  []MonitorSource{},
		Quality:  []MonitorQualityMetric{},
		Alerts:   []MonitorAlert{},
		SyncRuns: []MonitorSyncRun{},
	}

	if dashboard.HasLatest {
		latest := dashboard.Latest
		if latest.Backtest.Bars > 0 {
			data.Backtest = &latest.Backtest
		}
		data.Mode = "live"
		data.UpdatedAt = latest.RecordedAt
		if parsed, parseErr := time.Parse("2006-01-02T15:04:05.000Z", latest.RecordedAt); parseErr == nil {
			data.NextSyncAt = parsed.Add(s.cfg.SyncInterval).Format("2006-01-02T15:04:05.000Z")
		}
		for _, value := range latest.EMA.Values {
			metricIndex := -1
			switch value.Period {
			case fastPeriod:
				metricIndex = 0
			case slowPeriod:
				metricIndex = 1
			}
			if metricIndex >= 0 {
				data.Metrics[metricIndex] = MonitorMetric{
					Label:     "EMA " + strconv.Itoa(value.Period),
					Value:     formatNumber(value.Current),
					Change:    formatSigned(value.Current - value.Previous),
					Direction: movement(value.Current, value.Previous),
					Note:      "收盘价 " + formatNumber(latest.EMA.Close),
				}
			}
		}
		if latest.AccountConnected {
			data.Metrics[2] = MonitorMetric{
				Label:     "实盘权益",
				Value:     formatNumber(latest.Equity),
				Change:    formatSigned(latest.EquityChange),
				Direction: movement(latest.Equity, latest.Equity-latest.EquityChange),
				Note:      "总权益 " + latest.EquityCurrency + " · 余额 " + latest.AccountCurrency,
			}
			data.Metrics[3] = MonitorMetric{
				Label:     "区间已实现收益",
				Value:     formatNumber(latest.RealizedPnL),
				Change:    formatSigned(latest.Fees),
				Direction: signDirection(latest.RealizedPnL),
				Note:      fmt.Sprintf("近 %.0f 小时 · 手续费 %s", latest.BillsLookbackHours, formatNumber(latest.Fees)),
			}
		}

		data.Sources = append(data.Sources,
			MonitorSource{
				Name:     "OKX 行情",
				Type:     "REST K线",
				Status:   "healthy",
				LastSync: latest.RecordedAt,
				Records:  strconv.Itoa(len(dashboard.History)),
				Coverage: s.cfg.Bar,
				Latency:  "--",
			},
			MonitorSource{
				Name:     "OKX 账户",
				Type:     "余额 / 账单",
				Status:   accountSourceStatus(latest.AccountConnected),
				LastSync: latest.RecordedAt,
				Records:  strconv.Itoa(len(latest.Bills)),
				Coverage: latest.AccountCurrency,
				Latency:  "--",
			},
		)
		data.Quality = []MonitorQualityMetric{
			{Label: "K线完整性", Value: 100, Color: "#22c55e"},
			{Label: "EMA计算", Value: 100, Color: "#6366f1"},
			{Label: "账户快照", Value: accountQuality(latest.AccountConnected), Color: "#f59e0b"},
		}
		if latest.EMA.Cross == "golden" || latest.EMA.Cross == "death" {
			data.Alerts = append(data.Alerts, MonitorAlert{
				Level:       "warning",
				Title:       "EMA 交叉信号",
				Description: fmt.Sprintf("%s EMA 交叉，当前趋势为 %s。", latest.EMA.Cross, latest.EMA.Signal),
				Time:        latest.RecordedAt,
			})
		}
		if !latest.AccountConnected {
			data.Alerts = append(data.Alerts, MonitorAlert{
				Level:       "info",
				Title:       "当前为行情模式",
				Description: "未配置完整的 OKX 只读 API 凭据，因此未记录账户收益。",
				Time:        latest.RecordedAt,
			})
		}
	}

	for _, snapshot := range dashboard.History {
		date := snapshot.RecordedAt
		if len(date) >= 10 {
			date = date[:10]
		}
		data.Trend = append(data.Trend, MonitorTrendPoint{
			Date:      date,
			Value:     chooseTrendValue(snapshot),
			Secondary: emaFast(snapshot),
		})
	}
	for index := len(dashboard.History) - 1; index >= 0 && len(data.SyncRuns) < 8; index-- {
		snapshot := dashboard.History[index]
		data.SyncRuns = append(data.SyncRuns, MonitorSyncRun{
			Time:   snapshot.RecordedAt,
			Label:  "OKX 每日同步",
			Status: "done",
			Detail: fmt.Sprintf("%s · EMA %s", snapshot.Mode, snapshot.EMA.Signal),
		})
	}
	return data, nil
}

func (s *Service) resolveOptions(options RunOptions) (string, []int, error) {
	instrumentID := strings.ToUpper(strings.TrimSpace(options.InstrumentID))
	if instrumentID == "" {
		instrumentID = s.cfg.InstrumentID
	}
	if instrumentID == "" || len(instrumentID) > 50 || strings.ContainsAny(instrumentID, " \t\r\n") {
		return "", nil, &InvalidOptionsError{Message: "symbol must be a non-empty OKX instrument id without whitespace"}
	}

	fastPeriod := options.FastPeriod
	slowPeriod := options.SlowPeriod
	if fastPeriod == 0 {
		if len(s.cfg.EMAPeriods) == 0 {
			return "", nil, &InvalidOptionsError{Message: "no default EMA period is configured"}
		}
		fastPeriod = s.cfg.EMAPeriods[0]
	}
	if slowPeriod == 0 {
		if len(s.cfg.EMAPeriods) < 2 {
			return "", nil, &InvalidOptionsError{Message: "EMA requires a fast and a slow period"}
		}
		slowPeriod = s.cfg.EMAPeriods[len(s.cfg.EMAPeriods)-1]
	}
	if fastPeriod <= 0 || slowPeriod <= 0 || fastPeriod >= slowPeriod {
		return "", nil, &InvalidOptionsError{Message: fmt.Sprintf("EMA fast period must be positive and smaller than slow period, got %d/%d", fastPeriod, slowPeriod)}
	}

	periods := append([]int(nil), s.cfg.EMAPeriods...)
	if options.FastPeriod != 0 || options.SlowPeriod != 0 {
		periods = []int{fastPeriod, slowPeriod}
	}
	return instrumentID, periods, nil
}

func formatNumber(value float64) string {
	return strconv.FormatFloat(value, 'f', 4, 64)
}

func formatSigned(value float64) string {
	if value > 0 {
		return "+" + formatNumber(value)
	}
	return formatNumber(value)
}

func movement(current, previous float64) string {
	if current > previous {
		return "up"
	}
	if current < previous {
		return "down"
	}
	return "flat"
}

func signDirection(value float64) string {
	if value > 0 {
		return "up"
	}
	if value < 0 {
		return "down"
	}
	return "flat"
}

func accountSourceStatus(connected bool) string {
	if connected {
		return "healthy"
	}
	return "warning"
}

func accountQuality(connected bool) float64 {
	if connected {
		return 100
	}
	return 35
}

func chooseTrendValue(snapshot store.Snapshot) float64 {
	if snapshot.AccountConnected {
		return snapshot.Equity
	}
	return snapshot.EMA.Close
}

func emaFast(snapshot store.Snapshot) float64 {
	if len(snapshot.EMA.Values) == 0 {
		return 0
	}
	return snapshot.EMA.Values[0].Current
}

func findBalanceDetail(balance okx.Balance, currency string) (okx.BalanceDetail, bool) {
	for _, detail := range balance.Details {
		if strings.EqualFold(detail.Currency, currency) {
			return detail, true
		}
	}
	return okx.BalanceDetail{}, false
}
