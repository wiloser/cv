package ema

import (
	"errors"
	"fmt"
	"sort"
	"time"
)

type PricePoint struct {
	Time  time.Time
	Close float64
}

type Value struct {
	Period   int     `json:"period"`
	Current  float64 `json:"current"`
	Previous float64 `json:"previous"`
}

type Analysis struct {
	LatestTime time.Time `json:"latestTime"`
	Close      float64   `json:"close"`
	Values     []Value   `json:"values"`
	Signal     string    `json:"signal"`
	Cross      string    `json:"cross"`
}

// Series calculates an EMA using the standard SMA seed at period-1 and then
// applies EMA_t = close_t * alpha + EMA_(t-1) * (1-alpha).
func Series(closes []float64, period int) ([]float64, error) {
	if period <= 0 {
		return nil, errors.New("EMA period must be positive")
	}
	if len(closes) < period {
		return nil, fmt.Errorf("EMA period %d requires at least %d closes, got %d", period, period, len(closes))
	}

	series := make([]float64, len(closes))
	alpha := 2 / float64(period+1)
	var seed float64
	for _, close := range closes[:period] {
		seed += close
	}
	seed /= float64(period)
	series[period-1] = seed
	for index := period; index < len(closes); index++ {
		series[index] = closes[index]*alpha + series[index-1]*(1-alpha)
	}
	return series, nil
}

func Analyze(points []PricePoint, periods []int) (Analysis, error) {
	if len(points) == 0 {
		return Analysis{}, errors.New("cannot analyze EMA without price points")
	}
	if len(periods) == 0 {
		return Analysis{}, errors.New("at least one EMA period is required")
	}

	sortedPeriods := append([]int(nil), periods...)
	sort.Ints(sortedPeriods)
	result := Analysis{
		LatestTime: points[len(points)-1].Time,
		Close:      points[len(points)-1].Close,
		Values:     make([]Value, 0, len(sortedPeriods)),
	}
	seriesByPeriod := make(map[int][]float64, len(sortedPeriods))
	closes := make([]float64, len(points))
	for index, point := range points {
		closes[index] = point.Close
	}

	for _, period := range sortedPeriods {
		series, err := Series(closes, period)
		if err != nil {
			return Analysis{}, err
		}
		seriesByPeriod[period] = series
		previous := series[len(series)-1]
		if len(series) > period {
			previous = series[len(series)-2]
		}
		result.Values = append(result.Values, Value{
			Period:   period,
			Current:  series[len(series)-1],
			Previous: previous,
		})
	}

	if len(sortedPeriods) >= 2 {
		fast, slow := sortedPeriods[0], sortedPeriods[len(sortedPeriods)-1]
		fastSeries := seriesByPeriod[fast]
		slowSeries := seriesByPeriod[slow]
		fastCurrent := fastSeries[len(fastSeries)-1]
		slowCurrent := slowSeries[len(slowSeries)-1]
		if fastCurrent > slowCurrent {
			result.Signal = "bullish"
		} else if fastCurrent < slowCurrent {
			result.Signal = "bearish"
		} else {
			result.Signal = "flat"
		}

		if len(points) >= slow+1 {
			fastPrevious := fastSeries[len(fastSeries)-2]
			slowPrevious := slowSeries[len(slowSeries)-2]
			switch {
			case fastPrevious <= slowPrevious && fastCurrent > slowCurrent:
				result.Cross = "golden"
			case fastPrevious >= slowPrevious && fastCurrent < slowCurrent:
				result.Cross = "death"
			default:
				result.Cross = "none"
			}
		} else {
			result.Cross = "none"
		}
	} else {
		result.Signal = "neutral"
		result.Cross = "none"
	}

	return result, nil
}
