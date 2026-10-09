package ema

import (
	"math"
	"testing"
	"time"
)

func TestSeriesUsesSMASeed(t *testing.T) {
	series, err := Series([]float64{1, 2, 3, 4}, 2)
	if err != nil {
		t.Fatalf("Series returned error: %v", err)
	}
	want := []float64{0, 1.5, 2.5, 3.5}
	for index := range want {
		if math.Abs(series[index]-want[index]) > 1e-9 {
			t.Fatalf("series[%d] = %v, want %v", index, series[index], want[index])
		}
	}
}

func TestAnalyzeDetectsGoldenCross(t *testing.T) {
	points := make([]PricePoint, 0, 8)
	for index, close := range []float64{10, 9, 8, 7, 6, 7, 9, 12} {
		points = append(points, PricePoint{Time: time.Unix(int64(index), 0), Close: close})
	}
	result, err := Analyze(points, []int{2, 3})
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}
	if result.Signal != "bullish" {
		t.Fatalf("signal = %q, want bullish", result.Signal)
	}
}
