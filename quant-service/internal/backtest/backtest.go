package backtest

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"cv/quant-service/internal/ema"
)

type Bar struct {
	Time  time.Time
	Open  float64
	Close float64
}

type Config struct {
	InitialCapital float64
	FeeRate        float64
	SlippageRate   float64
}

type EquityPoint struct {
	Date      string  `json:"date"`
	Close     float64 `json:"close"`
	Equity    float64 `json:"equity"`
	Benchmark float64 `json:"benchmark"`
	Drawdown  float64 `json:"drawdown"`
	Position  float64 `json:"position"`
}

type Trade struct {
	Date   string  `json:"date"`
	Side   string  `json:"side"`
	Reason string  `json:"reason"`
	Price  float64 `json:"price"`
	Fee    float64 `json:"fee"`
	PnL    float64 `json:"pnl"`
}

type Result struct {
	Strategy             string        `json:"strategy"`
	FastPeriod           int           `json:"fastPeriod"`
	SlowPeriod           int           `json:"slowPeriod"`
	InitialCapital       float64       `json:"initialCapital"`
	FinalEquity          float64       `json:"finalEquity"`
	StrategyReturn       float64       `json:"strategyReturn"`
	BenchmarkFinalEquity float64       `json:"benchmarkFinalEquity"`
	BenchmarkReturn      float64       `json:"benchmarkReturn"`
	ExcessReturn         float64       `json:"excessReturn"`
	SharpeRatio          float64       `json:"sharpeRatio"`
	BenchmarkSharpeRatio float64       `json:"benchmarkSharpeRatio"`
	MaxDrawdown          float64       `json:"maxDrawdown"`
	TotalTrades          int           `json:"totalTrades"`
	Executions           int           `json:"executions"`
	WinningTrades        int           `json:"winningTrades"`
	WinRate              float64       `json:"winRate"`
	FeeRate              float64       `json:"feeRate"`
	SlippageRate         float64       `json:"slippageRate"`
	Bars                 int           `json:"bars"`
	Start                string        `json:"start"`
	End                  string        `json:"end"`
	EquityCurve          []EquityPoint `json:"equityCurve"`
	Trades               []Trade       `json:"trades"`
	Assumptions          []string      `json:"assumptions"`
}

func Run(bars []Bar, fastPeriod, slowPeriod int, cfg Config) (Result, error) {
	if fastPeriod <= 0 || slowPeriod <= 0 || fastPeriod >= slowPeriod {
		return Result{}, errors.New("EMA backtest requires positive fastPeriod < slowPeriod")
	}
	if cfg.InitialCapital <= 0 {
		return Result{}, errors.New("backtest initial capital must be positive")
	}
	if cfg.FeeRate < 0 || cfg.SlippageRate < 0 {
		return Result{}, errors.New("backtest fee and slippage rates cannot be negative")
	}
	if len(bars) < slowPeriod+1 {
		return Result{}, fmt.Errorf("EMA backtest requires at least %d bars, got %d", slowPeriod+1, len(bars))
	}
	for _, bar := range bars {
		if bar.Open <= 0 || bar.Close <= 0 {
			return Result{}, errors.New("EMA backtest requires positive open and close prices")
		}
	}

	closes := make([]float64, len(bars))
	for index, bar := range bars {
		closes[index] = bar.Close
	}
	fastSeries, err := ema.Series(closes, fastPeriod)
	if err != nil {
		return Result{}, err
	}
	slowSeries, err := ema.Series(closes, slowPeriod)
	if err != nil {
		return Result{}, err
	}

	result := Result{
		Strategy:       "ema-cross-long-only",
		FastPeriod:     fastPeriod,
		SlowPeriod:     slowPeriod,
		InitialCapital: cfg.InitialCapital,
		FeeRate:        cfg.FeeRate,
		SlippageRate:   cfg.SlippageRate,
		Bars:           len(bars),
		Start:          formatDate(bars[0].Time),
		End:            formatDate(bars[len(bars)-1].Time),
		EquityCurve:    make([]EquityPoint, 0, len(bars)),
		Trades:         make([]Trade, 0),
		Assumptions: []string{
			"仅做多：快线高于慢线时持仓，否则空仓",
			"收盘产生信号，下一根 K 线开盘执行，避免未来函数",
			fmt.Sprintf("手续费 %.3f%%，滑点 %.3f%%", cfg.FeeRate*100, cfg.SlippageRate*100),
			"夏普比按日收益、无风险利率 0、年化因子 √365 计算",
			"回测结束按最后一根 K 线价格平仓",
		},
	}

	cash := cfg.InitialCapital
	units := 0.0
	entryCost := 0.0
	pendingPosition := false
	pendingPositionSet := false
	pendingReason := ""
	benchmarkUnits := buyUnits(cfg.InitialCapital, bars[0].Open, cfg)
	peak := cfg.InitialCapital

	for index, bar := range bars {
		if pendingPositionSet {
			if pendingPosition {
				unitsBought, fee := buyUnitsAndFee(cash, bar.Open, cfg)
				if unitsBought > 0 {
					gross := unitsBought * executionPrice(bar.Open, true, cfg)
					cash -= gross + fee
					units = unitsBought
					entryCost = gross + fee
					result.Trades = append(result.Trades, Trade{Date: formatDate(bar.Time), Side: "buy", Reason: pendingReason, Price: executionPrice(bar.Open, true, cfg), Fee: fee})
					result.Executions++
				}
			} else if units > 0 {
				gross := units * executionPrice(bar.Open, false, cfg)
				fee := gross * cfg.FeeRate
				net := gross - fee
				cash += net
				tradePnL := net - entryCost
				result.Trades = append(result.Trades, Trade{Date: formatDate(bar.Time), Side: "sell", Reason: pendingReason, Price: executionPrice(bar.Open, false, cfg), Fee: fee, PnL: tradePnL})
				result.Executions++
				result.TotalTrades++
				if tradePnL > 0 {
					result.WinningTrades++
				}
				units = 0
				entryCost = 0
			}
			pendingPositionSet = false
		}

		equity := cash + units*bar.Close
		benchmarkEquity := benchmarkUnits * bar.Close
		if equity > peak {
			peak = equity
		}
		drawdown := 0.0
		if peak > 0 {
			drawdown = equity/peak - 1
		}
		result.EquityCurve = append(result.EquityCurve, EquityPoint{
			Date:      formatDate(bar.Time),
			Close:     bar.Close,
			Equity:    equity,
			Benchmark: benchmarkEquity,
			Drawdown:  drawdown,
			Position:  units,
		})

		if index >= slowPeriod-1 {
			desired := fastSeries[index] > slowSeries[index]
			currentlyLong := units > 0 || pendingPosition
			if desired != currentlyLong {
				pendingPosition = desired
				pendingPositionSet = true
				pendingReason = crossReason(index, fastSeries, slowSeries, desired)
			}
		}
	}

	if units > 0 {
		lastBar := bars[len(bars)-1]
		gross := units * executionPrice(lastBar.Close, false, cfg)
		fee := gross * cfg.FeeRate
		cash += gross - fee
		tradePnL := gross - fee - entryCost
		result.Trades = append(result.Trades, Trade{Date: formatDate(lastBar.Time), Side: "sell", Reason: "backtest-end", Price: executionPrice(lastBar.Close, false, cfg), Fee: fee, PnL: tradePnL})
		result.Executions++
		result.TotalTrades++
		if tradePnL > 0 {
			result.WinningTrades++
		}
		units = 0
		if len(result.EquityCurve) > 0 {
			result.EquityCurve[len(result.EquityCurve)-1].Equity = cash
			result.EquityCurve[len(result.EquityCurve)-1].Position = 0
		}
	}

	benchmarkFinal := sellValue(benchmarkUnits, bars[len(bars)-1].Close, cfg)
	result.FinalEquity = cash
	result.BenchmarkFinalEquity = benchmarkFinal
	result.StrategyReturn = result.FinalEquity/cfg.InitialCapital - 1
	result.BenchmarkReturn = benchmarkFinal/cfg.InitialCapital - 1
	result.ExcessReturn = result.StrategyReturn - result.BenchmarkReturn
	result.SharpeRatio = sharpeRatio(result.EquityCurve, false)
	result.BenchmarkSharpeRatio = sharpeRatio(result.EquityCurve, true)
	result.MaxDrawdown = maxDrawdown(result.EquityCurve)
	if result.TotalTrades > 0 {
		result.WinRate = float64(result.WinningTrades) / float64(result.TotalTrades)
	}
	return result, nil
}

type SearchConfig struct {
	FastMin int `json:"fastMin"`
	FastMax int `json:"fastMax"`
	SlowMin int `json:"slowMin"`
	SlowMax int `json:"slowMax"`
	Step    int `json:"step"`
	TopN    int `json:"topN"`
}

type InvalidSearchError struct {
	Message string
}

func (e *InvalidSearchError) Error() string {
	return e.Message
}

func IsInvalidSearch(err error) bool {
	var target *InvalidSearchError
	return errors.As(err, &target)
}

func DefaultSearchConfig() SearchConfig {
	return SearchConfig{FastMin: 5, FastMax: 30, SlowMin: 20, SlowMax: 80, Step: 1, TopN: 8}
}

type Candidate struct {
	FastPeriod           int           `json:"fastPeriod"`
	SlowPeriod           int           `json:"slowPeriod"`
	FinalEquity          float64       `json:"finalEquity"`
	StrategyReturn       float64       `json:"strategyReturn"`
	BenchmarkReturn      float64       `json:"benchmarkReturn"`
	ExcessReturn         float64       `json:"excessReturn"`
	SharpeRatio          float64       `json:"sharpeRatio"`
	BenchmarkSharpeRatio float64       `json:"benchmarkSharpeRatio"`
	MaxDrawdown          float64       `json:"maxDrawdown"`
	TotalTrades          int           `json:"totalTrades"`
	EquityCurve          []EquityPoint `json:"equityCurve"`
}

type OptimizationResult struct {
	InstrumentID string      `json:"instrumentId,omitempty"`
	Bar          string      `json:"bar,omitempty"`
	Objective    string      `json:"objective"`
	Bars         int         `json:"bars"`
	Start        string      `json:"start"`
	End          string      `json:"end"`
	FastMin      int         `json:"fastMin"`
	FastMax      int         `json:"fastMax"`
	SlowMin      int         `json:"slowMin"`
	SlowMax      int         `json:"slowMax"`
	Step         int         `json:"step"`
	Tested       int         `json:"tested"`
	Best         Result      `json:"best"`
	Candidates   []Candidate `json:"candidates"`
}

func Optimize(bars []Bar, cfg Config, search SearchConfig) (OptimizationResult, error) {
	if len(bars) == 0 {
		return OptimizationResult{}, &InvalidSearchError{Message: "EMA optimization requires at least one bar"}
	}
	if search.FastMin == 0 {
		search.FastMin = DefaultSearchConfig().FastMin
	}
	if search.FastMax == 0 {
		search.FastMax = DefaultSearchConfig().FastMax
	}
	if search.SlowMin == 0 {
		search.SlowMin = DefaultSearchConfig().SlowMin
	}
	if search.SlowMax == 0 {
		search.SlowMax = DefaultSearchConfig().SlowMax
	}
	if search.Step == 0 {
		search.Step = DefaultSearchConfig().Step
	}
	if search.TopN == 0 {
		search.TopN = DefaultSearchConfig().TopN
	}
	if search.FastMin <= 0 || search.FastMax < search.FastMin || search.SlowMin <= 0 || search.SlowMax < search.SlowMin || search.Step <= 0 {
		return OptimizationResult{}, &InvalidSearchError{Message: "EMA optimization ranges must be positive and ordered"}
	}
	if search.SlowMax >= len(bars) {
		return OptimizationResult{}, &InvalidSearchError{Message: fmt.Sprintf("EMA optimization slowMax must be less than bar count %d", len(bars))}
	}
	if search.TopN < 1 || search.TopN > 20 {
		return OptimizationResult{}, &InvalidSearchError{Message: "EMA optimization topN must be between 1 and 20"}
	}

	candidates := make([]Candidate, 0)
	var best Result
	hasBest := false
	for fastPeriod := search.FastMin; fastPeriod <= search.FastMax; fastPeriod += search.Step {
		for slowPeriod := search.SlowMin; slowPeriod <= search.SlowMax; slowPeriod += search.Step {
			if fastPeriod >= slowPeriod {
				continue
			}
			result, err := Run(bars, fastPeriod, slowPeriod, cfg)
			if err != nil {
				return OptimizationResult{}, fmt.Errorf("run EMA %d/%d: %w", fastPeriod, slowPeriod, err)
			}
			candidates = append(candidates, candidateFromResult(result))
			if !hasBest || betterResult(result, best) {
				best = result
				hasBest = true
			}
		}
	}
	if !hasBest {
		return OptimizationResult{}, &InvalidSearchError{Message: "EMA optimization found no valid fast/slow pair"}
	}
	tested := len(candidates)
	sort.SliceStable(candidates, func(left, right int) bool {
		return betterCandidate(candidates[left], candidates[right])
	})
	if len(candidates) > search.TopN {
		candidates = candidates[:search.TopN]
	}
	return OptimizationResult{
		Objective:  "sharpe-ratio",
		Bars:       len(bars),
		Start:      formatDate(bars[0].Time),
		End:        formatDate(bars[len(bars)-1].Time),
		FastMin:    search.FastMin,
		FastMax:    search.FastMax,
		SlowMin:    search.SlowMin,
		SlowMax:    search.SlowMax,
		Step:       search.Step,
		Tested:     tested,
		Best:       best,
		Candidates: candidates,
	}, nil
}

func candidateFromResult(result Result) Candidate {
	return Candidate{
		FastPeriod:           result.FastPeriod,
		SlowPeriod:           result.SlowPeriod,
		FinalEquity:          result.FinalEquity,
		StrategyReturn:       result.StrategyReturn,
		BenchmarkReturn:      result.BenchmarkReturn,
		ExcessReturn:         result.ExcessReturn,
		SharpeRatio:          result.SharpeRatio,
		BenchmarkSharpeRatio: result.BenchmarkSharpeRatio,
		MaxDrawdown:          result.MaxDrawdown,
		TotalTrades:          result.TotalTrades,
		EquityCurve:          result.EquityCurve,
	}
}

func betterResult(left, right Result) bool {
	if left.SharpeRatio != right.SharpeRatio {
		return left.SharpeRatio > right.SharpeRatio
	}
	if left.StrategyReturn != right.StrategyReturn {
		return left.StrategyReturn > right.StrategyReturn
	}
	return left.MaxDrawdown > right.MaxDrawdown
}

func betterCandidate(left, right Candidate) bool {
	if left.SharpeRatio != right.SharpeRatio {
		return left.SharpeRatio > right.SharpeRatio
	}
	if left.StrategyReturn != right.StrategyReturn {
		return left.StrategyReturn > right.StrategyReturn
	}
	return left.MaxDrawdown > right.MaxDrawdown
}

func buyUnits(capital, open float64, cfg Config) float64 {
	price := executionPrice(open, true, cfg)
	return capital / (price * (1 + cfg.FeeRate))
}

func buyUnitsAndFee(capital, open float64, cfg Config) (float64, float64) {
	units := buyUnits(capital, open, cfg)
	gross := units * executionPrice(open, true, cfg)
	return units, gross * cfg.FeeRate
}

func sellValue(units, close float64, cfg Config) float64 {
	gross := units * executionPrice(close, false, cfg)
	return gross - gross*cfg.FeeRate
}

func executionPrice(price float64, buy bool, cfg Config) float64 {
	if buy {
		return price * (1 + cfg.SlippageRate)
	}
	return price * (1 - cfg.SlippageRate)
}

func crossReason(index int, fast, slow []float64, entering bool) string {
	if index > 0 {
		if entering && fast[index-1] <= slow[index-1] {
			return "golden-cross"
		}
		if !entering && fast[index-1] >= slow[index-1] {
			return "death-cross"
		}
	}
	if entering {
		return "trend-on"
	}
	return "trend-off"
}

func maxDrawdown(curve []EquityPoint) float64 {
	peak := 0.0
	max := 0.0
	for _, point := range curve {
		if point.Equity > peak {
			peak = point.Equity
		}
		if peak > 0 {
			drawdown := point.Equity/peak - 1
			if drawdown < max {
				max = drawdown
			}
		}
	}
	return max
}

func sharpeRatio(curve []EquityPoint, benchmark bool) float64 {
	if len(curve) < 2 {
		return 0
	}
	returns := make([]float64, 0, len(curve)-1)
	for index := 1; index < len(curve); index++ {
		previous := curve[index-1].Equity
		current := curve[index].Equity
		if benchmark {
			previous = curve[index-1].Benchmark
			current = curve[index].Benchmark
		}
		if previous <= 0 {
			continue
		}
		returns = append(returns, current/previous-1)
	}
	if len(returns) < 2 {
		return 0
	}

	mean := 0.0
	for _, value := range returns {
		mean += value
	}
	mean /= float64(len(returns))
	variance := 0.0
	for _, value := range returns {
		delta := value - mean
		variance += delta * delta
	}
	variance /= float64(len(returns))
	if variance <= 0 {
		return 0
	}
	return mean / math.Sqrt(variance) * math.Sqrt(365)
}

func formatDate(value time.Time) string {
	return value.UTC().Format("2006-01-02")
}
