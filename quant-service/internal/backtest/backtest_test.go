package backtest

import (
	"math"
	"testing"
	"time"
)

func TestRunProducesStrategyAndBenchmarkResults(t *testing.T) {
	prices := []float64{10, 9, 8, 7, 8, 10, 12, 11, 9, 8, 10, 13, 15}
	bars := make([]Bar, 0, len(prices))
	for index, price := range prices {
		bars = append(bars, Bar{
			Time:  time.Unix(int64(index), 0),
			Open:  price,
			Close: price,
		})
	}
	result, err := Run(bars, 2, 3, Config{InitialCapital: 100, FeeRate: 0, SlippageRate: 0})
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.Bars != len(bars) || result.FinalEquity <= 0 || result.BenchmarkFinalEquity <= 0 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(result.EquityCurve) != len(bars) || result.Executions == 0 {
		t.Fatalf("expected an equity curve and at least one execution: %+v", result)
	}
}

func TestRunRejectsInsufficientBars(t *testing.T) {
	_, err := Run([]Bar{{Time: time.Now(), Open: 1, Close: 1}}, 12, 26, Config{InitialCapital: 100})
	if err == nil {
		t.Fatal("Run accepted insufficient bars")
	}
}

func TestRunIncludesSharpeComparison(t *testing.T) {
	bars := make([]Bar, 0, 32)
	for index := 0; index < 32; index++ {
		price := 100 + float64(index)
		bars = append(bars, Bar{Time: time.Unix(int64(index), 0), Open: price, Close: price})
	}
	result, err := Run(bars, 2, 5, Config{InitialCapital: 1000})
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if math.IsNaN(result.SharpeRatio) || math.IsInf(result.SharpeRatio, 0) || math.IsNaN(result.BenchmarkSharpeRatio) || math.IsInf(result.BenchmarkSharpeRatio, 0) {
		t.Fatalf("expected finite Sharpe ratios: %+v", result)
	}
}

func TestOptimizeRanksBySharpeRatio(t *testing.T) {
	prices := []float64{10, 9, 8, 7, 8, 10, 12, 11, 9, 8, 10, 13, 15, 14, 16, 18, 17, 19, 21, 20, 22, 24, 23, 25}
	bars := make([]Bar, 0, len(prices))
	for index, price := range prices {
		bars = append(bars, Bar{Time: time.Unix(int64(index), 0), Open: price, Close: price})
	}
	result, err := Optimize(bars, Config{InitialCapital: 100, FeeRate: 0, SlippageRate: 0}, SearchConfig{FastMin: 2, FastMax: 4, SlowMin: 5, SlowMax: 7, Step: 1, TopN: 3})
	if err != nil {
		t.Fatalf("Optimize returned error: %v", err)
	}
	if result.Tested != 9 || len(result.Candidates) != 3 {
		t.Fatalf("unexpected optimization size: %+v", result)
	}
	if result.Best.FastPeriod != result.Candidates[0].FastPeriod || result.Best.SlowPeriod != result.Candidates[0].SlowPeriod {
		t.Fatalf("best result does not match top candidate: %+v", result)
	}
	if len(result.Candidates[0].EquityCurve) != len(bars) {
		t.Fatalf("expected the top candidate to include its equity curve: got %d points", len(result.Candidates[0].EquityCurve))
	}
	for index := 1; index < len(result.Candidates); index++ {
		if result.Candidates[index].SharpeRatio > result.Candidates[index-1].SharpeRatio {
			t.Fatalf("candidates are not sorted by Sharpe ratio: %+v", result.Candidates)
		}
	}
}
