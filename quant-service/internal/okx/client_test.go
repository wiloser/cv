package okx

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"cv/quant-service/internal/config"
)

func TestGetCandlesSortsChronologicallyAndSkipsNothing(t *testing.T) {
	client := newRoundTripClient(t, func(request *http.Request) string {
		if request.URL.Path != "/api/v5/market/candles" {
			t.Fatalf("path = %s", request.URL.Path)
		}
		return `{"code":"0","data":[["2000","2","2","1","1","0","0","0","1"],["1000","2","2","1","2","0","0","0","1"]]}`
	})

	var err error
	candles, err := client.GetCandles(context.Background(), "BTC-USDT", "1D", 30)
	if err != nil {
		t.Fatalf("GetCandles returned error: %v", err)
	}
	if len(candles) != 2 {
		t.Fatalf("got %d candles, want 2", len(candles))
	}
	if !candles[0].Time.Before(candles[1].Time) || candles[0].Close != 2 || candles[1].Close != 1 {
		t.Fatalf("candles were not sorted and parsed as expected: %+v", candles)
	}
}

func TestPrivateRequestUsesOKXSignature(t *testing.T) {
	const secret = "test-secret"
	client := newRoundTripClient(t, func(request *http.Request) string {
		timestamp := request.Header.Get("OK-ACCESS-TIMESTAMP")
		prehash := timestamp + http.MethodGet + request.URL.RequestURI()
		hash := hmac.New(sha256.New, []byte(secret))
		_, _ = hash.Write([]byte(prehash))
		wantSignature := base64.StdEncoding.EncodeToString(hash.Sum(nil))
		if request.Header.Get("OK-ACCESS-SIGN") != wantSignature {
			t.Errorf("signature = %q, want %q", request.Header.Get("OK-ACCESS-SIGN"), wantSignature)
		}
		if request.Header.Get("OK-ACCESS-KEY") != "test-key" {
			t.Errorf("missing API key header")
		}
		return `{"code":"0","data":[{"totalEq":"100.5","details":[{"ccy":"USDT","eq":"100.5","cashBal":"100","availBal":"99","frozenBal":"1","upl":"0.5"}]}]}`
	})
	client.apiKey = "test-key"
	client.apiSecret = secret
	client.apiPassphrase = "test-passphrase"

	balance, err := client.GetAccountBalance(context.Background(), "USDT")
	if err != nil {
		t.Fatalf("GetAccountBalance returned error: %v", err)
	}
	if balance.TotalEquity != 100.5 || len(balance.Details) != 1 || balance.Details[0].Available != 99 {
		t.Fatalf("unexpected balance: %+v", balance)
	}
}

func TestGetCandlesRejectsMalformedRows(t *testing.T) {
	client := newRoundTripClient(t, func(request *http.Request) string {
		return `{"code":"0","data":[["1000","2"]]}`
	})
	if _, err := client.GetCandles(context.Background(), "BTC-USDT", "1D", 30); err == nil {
		t.Fatal("GetCandles accepted a malformed row")
	}
}

func TestGetTickersParsesCurrencyVolume(t *testing.T) {
	client := newRoundTripClient(t, func(request *http.Request) string {
		if request.URL.Path != "/api/v5/market/tickers" || request.URL.Query().Get("instType") != "SPOT" {
			t.Fatalf("unexpected request: %s", request.URL.String())
		}
		return `{"code":"0","data":[{"instId":"BTC-USDT","last":"100","sodUtc0":"90","high24h":"110","low24h":"80","vol24h":"12.5","volCcy24h":"1250","ts":"1000"}]}`
	})

	tickers, err := client.GetTickers(context.Background(), "SPOT")
	if err != nil {
		t.Fatalf("GetTickers returned error: %v", err)
	}
	if len(tickers) != 1 || tickers[0].Volume24h != 12.5 || tickers[0].VolumeCurrency24h != 1250 {
		t.Fatalf("unexpected ticker volume values: %+v", tickers)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func newRoundTripClient(t *testing.T, responseBody func(*http.Request) string) *Client {
	t.Helper()
	client, err := NewClient(config.Config{BaseURL: "https://example.com", RequestTimeout: time.Second})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}
	client.httpClient = &http.Client{
		Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(responseBody(request))),
				Request:    request,
			}, nil
		}),
	}
	return client
}
