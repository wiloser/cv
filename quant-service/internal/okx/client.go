package okx

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"cv/quant-service/internal/config"
)

const maxResponseBytes = 8 << 20

type Client struct {
	baseURL          *url.URL
	apiKey           string
	apiSecret        string
	apiPassphrase    string
	simulatedTrading bool
	httpClient       *http.Client
}

type Candle struct {
	Time      time.Time `json:"time"`
	Open      float64   `json:"open"`
	Close     float64   `json:"close"`
	Confirmed bool      `json:"confirmed"`
}

type Ticker struct {
	InstrumentID      string
	Last              float64
	Open24h           float64
	High24h           float64
	Low24h            float64
	Volume24h         float64
	VolumeCurrency24h float64
	Time              time.Time
}

type Balance struct {
	TotalEquity float64         `json:"totalEquity"`
	Details     []BalanceDetail `json:"details"`
}

type BalanceDetail struct {
	Currency      string  `json:"currency"`
	Equity        float64 `json:"equity"`
	CashBalance   float64 `json:"cashBalance"`
	Available     float64 `json:"available"`
	Frozen        float64 `json:"frozen"`
	UnrealizedPnL float64 `json:"unrealizedPnL"`
}

type Position struct {
	InstrumentID  string    `json:"instrumentId"`
	Position      float64   `json:"position"`
	AveragePrice  float64   `json:"averagePrice"`
	MarkPrice     float64   `json:"markPrice"`
	UnrealizedPnL float64   `json:"unrealizedPnL"`
	PositionSide  string    `json:"positionSide"`
	MarginMode    string    `json:"marginMode"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type Bill struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"`
	SubType       string    `json:"subType"`
	Currency      string    `json:"currency"`
	InstrumentID  string    `json:"instrumentId"`
	BalanceChange float64   `json:"balanceChange"`
	RealizedPnL   float64   `json:"realizedPnL"`
	Fee           float64   `json:"fee"`
	FeeCurrency   string    `json:"feeCurrency"`
	Time          time.Time `json:"time"`
}

type apiEnvelope struct {
	Code string          `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

type candleRow []string

type tickerResponse struct {
	InstrumentID      string `json:"instId"`
	Last              string `json:"last"`
	Open24h           string `json:"sodUtc0"`
	Open24hAlt        string `json:"open24h"`
	High24h           string `json:"high24h"`
	Low24h            string `json:"low24h"`
	Volume24h         string `json:"vol24h"`
	VolumeCurrency24h string `json:"volCcy24h"`
	Timestamp         string `json:"ts"`
}

type balanceResponse struct {
	TotalEquity string          `json:"totalEq"`
	Details     []balanceDetail `json:"details"`
}

type balanceDetail struct {
	Currency      string `json:"ccy"`
	Equity        string `json:"eq"`
	CashBalance   string `json:"cashBal"`
	Available     string `json:"availBal"`
	Frozen        string `json:"frozenBal"`
	UnrealizedPnL string `json:"upl"`
}

type positionResponse struct {
	InstrumentID  string `json:"instId"`
	Position      string `json:"pos"`
	AveragePrice  string `json:"avgPx"`
	MarkPrice     string `json:"markPx"`
	UnrealizedPnL string `json:"upl"`
	PositionSide  string `json:"posSide"`
	MarginMode    string `json:"mgnMode"`
	UpdatedAt     string `json:"uTime"`
}

type billResponse struct {
	ID            string `json:"billId"`
	Type          string `json:"type"`
	SubType       string `json:"subType"`
	Currency      string `json:"ccy"`
	InstrumentID  string `json:"instId"`
	BalanceChange string `json:"balChg"`
	RealizedPnL   string `json:"pnl"`
	FillPnL       string `json:"fillPnl"`
	Fee           string `json:"fee"`
	FeeCurrency   string `json:"feeCcy"`
	Time          string `json:"ts"`
}

func NewClient(cfg config.Config) (*Client, error) {
	baseURL, err := url.Parse(cfg.BaseURL)
	if err != nil || baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("invalid OKX base URL: %q", cfg.BaseURL)
	}

	return &Client{
		baseURL:          baseURL,
		apiKey:           cfg.APIKey,
		apiSecret:        cfg.APISecret,
		apiPassphrase:    cfg.APIPassphrase,
		simulatedTrading: cfg.SimulatedTrading,
		httpClient:       &http.Client{Timeout: cfg.RequestTimeout},
	}, nil
}

func (c *Client) GetCandles(ctx context.Context, instrumentID, bar string, limit int) ([]Candle, error) {
	query := url.Values{}
	query.Set("instId", instrumentID)
	query.Set("bar", bar)
	query.Set("limit", strconv.Itoa(limit))

	var rows []candleRow
	if err := c.get(ctx, "/api/v5/market/candles", query, false, &rows); err != nil {
		return nil, err
	}

	candles := make([]Candle, 0, len(rows))
	for _, row := range rows {
		if len(row) < 5 {
			return nil, errors.New("OKX returned a candle row with fewer than five fields")
		}
		millis, err := strconv.ParseInt(row[0], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid OKX candle timestamp %q: %w", row[0], err)
		}
		closePrice, err := strconv.ParseFloat(row[4], 64)
		if err != nil {
			return nil, fmt.Errorf("invalid OKX candle close %q: %w", row[4], err)
		}
		openPrice, err := strconv.ParseFloat(row[1], 64)
		if err != nil {
			return nil, fmt.Errorf("invalid OKX candle open %q: %w", row[1], err)
		}
		confirmed := true
		if len(row) >= 9 {
			confirmed = row[8] == "1"
		}
		candles = append(candles, Candle{
			Time:      time.UnixMilli(millis).UTC(),
			Open:      openPrice,
			Close:     closePrice,
			Confirmed: confirmed,
		})
	}

	sort.Slice(candles, func(i, j int) bool { return candles[i].Time.Before(candles[j].Time) })
	return candles, nil
}

func (c *Client) GetTickers(ctx context.Context, instrumentType string) ([]Ticker, error) {
	query := url.Values{}
	query.Set("instType", instrumentType)

	var response []tickerResponse
	if err := c.get(ctx, "/api/v5/market/tickers", query, false, &response); err != nil {
		return nil, err
	}

	tickers := make([]Ticker, 0, len(response))
	for _, item := range response {
		open24h := item.Open24hAlt
		if open24h == "" {
			open24h = item.Open24h
		}
		tickers = append(tickers, Ticker{
			InstrumentID:      item.InstrumentID,
			Last:              parseNumber(item.Last),
			Open24h:           parseNumber(open24h),
			High24h:           parseNumber(item.High24h),
			Low24h:            parseNumber(item.Low24h),
			Volume24h:         parseNumber(item.Volume24h),
			VolumeCurrency24h: parseNumber(item.VolumeCurrency24h),
			Time:              parseMillis(item.Timestamp),
		})
	}
	return tickers, nil
}

func (c *Client) GetAccountBalance(ctx context.Context, currency string) (Balance, error) {
	query := url.Values{}
	query.Set("ccy", currency)

	var response []balanceResponse
	if err := c.get(ctx, "/api/v5/account/balance", query, true, &response); err != nil {
		return Balance{}, err
	}
	if len(response) == 0 {
		return Balance{}, errors.New("OKX returned an empty account balance")
	}

	result := Balance{TotalEquity: parseNumber(response[0].TotalEquity)}
	for _, detail := range response[0].Details {
		result.Details = append(result.Details, BalanceDetail{
			Currency:      detail.Currency,
			Equity:        parseNumber(detail.Equity),
			CashBalance:   parseNumber(detail.CashBalance),
			Available:     parseNumber(detail.Available),
			Frozen:        parseNumber(detail.Frozen),
			UnrealizedPnL: parseNumber(detail.UnrealizedPnL),
		})
	}
	return result, nil
}

func (c *Client) GetPositions(ctx context.Context, instrumentType, instrumentID string) ([]Position, error) {
	query := url.Values{}
	query.Set("instType", instrumentType)
	if instrumentID != "" {
		query.Set("instId", instrumentID)
	}

	var response []positionResponse
	if err := c.get(ctx, "/api/v5/account/positions", query, true, &response); err != nil {
		return nil, err
	}

	positions := make([]Position, 0, len(response))
	for _, item := range response {
		positions = append(positions, Position{
			InstrumentID:  item.InstrumentID,
			Position:      parseNumber(item.Position),
			AveragePrice:  parseNumber(item.AveragePrice),
			MarkPrice:     parseNumber(item.MarkPrice),
			UnrealizedPnL: parseNumber(item.UnrealizedPnL),
			PositionSide:  item.PositionSide,
			MarginMode:    item.MarginMode,
			UpdatedAt:     parseMillis(item.UpdatedAt),
		})
	}
	return positions, nil
}

func (c *Client) GetBills(ctx context.Context, currency string, begin, end time.Time) ([]Bill, error) {
	bills := make([]Bill, 0)
	after := ""
	for page := 0; page < 20; page++ {
		query := url.Values{}
		query.Set("ccy", currency)
		query.Set("begin", strconv.FormatInt(begin.UnixMilli(), 10))
		query.Set("end", strconv.FormatInt(end.UnixMilli(), 10))
		query.Set("limit", "100")
		if after != "" {
			query.Set("after", after)
		}

		var response []billResponse
		if err := c.get(ctx, "/api/v5/account/bills-archive", query, true, &response); err != nil {
			return nil, err
		}
		for _, item := range response {
			realizedPnL := item.RealizedPnL
			if realizedPnL == "" {
				realizedPnL = item.FillPnL
			}
			bills = append(bills, Bill{
				ID:            item.ID,
				Type:          item.Type,
				SubType:       item.SubType,
				Currency:      item.Currency,
				InstrumentID:  item.InstrumentID,
				BalanceChange: parseNumber(item.BalanceChange),
				RealizedPnL:   parseNumber(realizedPnL),
				Fee:           parseNumber(item.Fee),
				FeeCurrency:   item.FeeCurrency,
				Time:          parseMillis(item.Time),
			})
		}
		if len(response) < 100 {
			break
		}
		nextAfter := response[len(response)-1].ID
		if nextAfter == "" || nextAfter == after {
			break
		}
		after = nextAfter
		if !waitForNextPage(ctx, 450*time.Millisecond) {
			return nil, ctx.Err()
		}
	}
	return bills, nil
}

func waitForNextPage(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (c *Client) get(ctx context.Context, path string, query url.Values, authenticated bool, target any) error {
	return c.request(ctx, http.MethodGet, path, query, nil, authenticated, target)
}

func (c *Client) request(ctx context.Context, method, path string, query url.Values, body []byte, authenticated bool, target any) error {
	endpoint := *c.baseURL
	endpoint.Path = path
	endpoint.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "cv-quant-service/0.1")
	if c.simulatedTrading {
		req.Header.Set("x-simulated-trading", "1")
	}

	if authenticated {
		if c.apiKey == "" || c.apiSecret == "" || c.apiPassphrase == "" {
			return errors.New("OKX private API credentials are not configured")
		}
		timestamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		requestPath := path
		if encodedQuery := query.Encode(); encodedQuery != "" {
			requestPath += "?" + encodedQuery
		}
		prehash := timestamp + method + requestPath + string(body)
		hash := hmac.New(sha256.New, []byte(c.apiSecret))
		_, _ = hash.Write([]byte(prehash))
		signature := base64.StdEncoding.EncodeToString(hash.Sum(nil))
		req.Header.Set("OK-ACCESS-KEY", c.apiKey)
		req.Header.Set("OK-ACCESS-SIGN", signature)
		req.Header.Set("OK-ACCESS-TIMESTAMP", timestamp)
		req.Header.Set("OK-ACCESS-PASSPHRASE", c.apiPassphrase)
	}

	response, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("OKX request %s %s: %w", method, path, err)
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes))
	if err != nil {
		return fmt.Errorf("read OKX response: %w", err)
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("OKX request %s %s returned HTTP %d: %s", method, path, response.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	var envelope apiEnvelope
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		return fmt.Errorf("decode OKX response: %w", err)
	}
	if envelope.Code != "0" {
		return fmt.Errorf("OKX request %s %s failed with code %s: %s", method, path, envelope.Code, envelope.Msg)
	}
	if target == nil || len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return nil
	}
	if err := json.Unmarshal(envelope.Data, target); err != nil {
		return fmt.Errorf("decode OKX response data: %w", err)
	}
	return nil
}

func parseNumber(value string) float64 {
	parsed, _ := strconv.ParseFloat(value, 64)
	return parsed
}

func parseMillis(value string) time.Time {
	millis, err := strconv.ParseInt(value, 10, 64)
	if err != nil || millis <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(millis).UTC()
}
