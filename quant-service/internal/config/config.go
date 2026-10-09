package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Config contains only runtime configuration. Secrets are intentionally read
// from the environment and are never serialized or logged by the service.
type Config struct {
	BaseURL                string
	APIKey                 string
	APISecret              string
	APIPassphrase          string
	SimulatedTrading       bool
	InstrumentID           string
	InstrumentType         string
	Bar                    string
	CandleLimit            int
	EMAPeriods             []int
	AccountCurrency        string
	BacktestInitialCapital float64
	BacktestFeeRate        float64
	BacktestSlippageRate   float64
	BillsLookback          time.Duration
	SyncInterval           time.Duration
	SyncOnStart            bool
	HTTPAddr               string
	DataDir                string
	RequestTimeout         time.Duration
	CORSOrigin             string
	SMTPHost               string
	SMTPPort               int
	SMTPUser               string
	SMTPPassword           string
	SMTPFrom               string
	SMTPProxy              string
}

func Load() (Config, error) {
	cfg := Config{
		BaseURL:         envString("OKX_BASE_URL", "https://www.okx.com"),
		APIKey:          strings.TrimSpace(os.Getenv("OKX_API_KEY")),
		APISecret:       strings.TrimSpace(os.Getenv("OKX_API_SECRET")),
		APIPassphrase:   strings.TrimSpace(os.Getenv("OKX_API_PASSPHRASE")),
		InstrumentID:    strings.ToUpper(envString("OKX_INST_ID", "BTC-USDT")),
		InstrumentType:  strings.ToUpper(envString("OKX_INST_TYPE", "SPOT")),
		Bar:             envString("OKX_BAR", "1D"),
		AccountCurrency: strings.ToUpper(envString("OKX_ACCOUNT_CCY", "USDT")),
		HTTPAddr:        envString("HTTP_ADDR", ":8081"),
		DataDir:         envString("DATA_DIR", "./data"),
		CORSOrigin:      envString("CORS_ORIGIN", "http://localhost:5174"),
		SMTPHost:        strings.TrimSpace(os.Getenv("SMTP_HOST")),
		SMTPUser:        strings.TrimSpace(os.Getenv("SMTP_USER")),
		SMTPPassword:    os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:        strings.TrimSpace(os.Getenv("SMTP_FROM")),
		SMTPProxy:       strings.TrimSpace(os.Getenv("SMTP_PROXY")),
	}

	var err error
	if cfg.SimulatedTrading, err = envBool("OKX_SIMULATED_TRADING", false); err != nil {
		return Config{}, err
	}
	if cfg.CandleLimit, err = envInt("OKX_CANDLE_LIMIT", 300); err != nil {
		return Config{}, err
	}
	if cfg.CandleLimit < 30 || cfg.CandleLimit > 300 {
		return Config{}, fmt.Errorf("OKX_CANDLE_LIMIT must be between 30 and 300, got %d", cfg.CandleLimit)
	}
	if cfg.EMAPeriods, err = envPeriods("EMA_PERIODS", []int{12, 26}); err != nil {
		return Config{}, err
	}
	if cfg.BacktestInitialCapital, err = envFloat("BACKTEST_INITIAL_CAPITAL", 10000); err != nil {
		return Config{}, err
	}
	if cfg.BacktestFeeRate, err = envFloat("BACKTEST_FEE_RATE", 0.001); err != nil {
		return Config{}, err
	}
	if cfg.BacktestSlippageRate, err = envFloat("BACKTEST_SLIPPAGE_RATE", 0.0005); err != nil {
		return Config{}, err
	}
	if cfg.BillsLookback, err = envDuration("BILLS_LOOKBACK", 24*time.Hour); err != nil {
		return Config{}, err
	}
	if cfg.SyncInterval, err = envDuration("SYNC_INTERVAL", 24*time.Hour); err != nil {
		return Config{}, err
	}
	if cfg.RequestTimeout, err = envDuration("OKX_REQUEST_TIMEOUT", 15*time.Second); err != nil {
		return Config{}, err
	}
	if cfg.SMTPPort, err = envInt("SMTP_PORT", 587); err != nil {
		return Config{}, err
	}
	if cfg.BillsLookback <= 0 || cfg.SyncInterval <= 0 || cfg.RequestTimeout <= 0 {
		return Config{}, errors.New("BILLS_LOOKBACK, SYNC_INTERVAL and OKX_REQUEST_TIMEOUT must be positive")
	}
	if cfg.BacktestInitialCapital <= 0 {
		return Config{}, errors.New("BACKTEST_INITIAL_CAPITAL must be positive")
	}
	if cfg.BacktestFeeRate < 0 || cfg.BacktestFeeRate >= 1 {
		return Config{}, errors.New("BACKTEST_FEE_RATE must be between 0 and 1")
	}
	if cfg.BacktestSlippageRate < 0 || cfg.BacktestSlippageRate >= 1 {
		return Config{}, errors.New("BACKTEST_SLIPPAGE_RATE must be between 0 and 1")
	}
	if cfg.SyncOnStart, err = envBool("SYNC_ON_START", true); err != nil {
		return Config{}, err
	}
	if cfg.InstrumentID == "" || cfg.AccountCurrency == "" {
		return Config{}, errors.New("OKX_INST_ID and OKX_ACCOUNT_CCY must not be empty")
	}
	if cfg.SMTPPort <= 0 || cfg.SMTPPort > 65535 {
		return Config{}, errors.New("SMTP_PORT must be between 1 and 65535")
	}

	parsedBaseURL, err := url.Parse(cfg.BaseURL)
	if err != nil || parsedBaseURL.Scheme == "" || parsedBaseURL.Host == "" {
		return Config{}, fmt.Errorf("OKX_BASE_URL must be an absolute URL: %q", cfg.BaseURL)
	}

	return cfg, nil
}

func (c Config) PrivateAPIConfigured() bool {
	return c.APIKey != "" && c.APISecret != "" && c.APIPassphrase != ""
}

func (c Config) HasAnyPrivateCredential() bool {
	return c.APIKey != "" || c.APISecret != "" || c.APIPassphrase != ""
}

func (c Config) ShouldReadPositions() bool {
	return c.InstrumentType != "SPOT"
}

func envString(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envBool(key string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", key, err)
	}
	return parsed, nil
}

func envInt(key string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}
	return parsed, nil
}

func envFloat(key string, fallback float64) (float64, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a number: %w", key, err)
	}
	return parsed, nil
}

func envDuration(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a Go duration such as 24h: %w", key, err)
	}
	return parsed, nil
}

func envPeriods(key string, fallback []int) ([]int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	parts := strings.Split(value, ",")
	periods := make([]int, 0, len(parts))
	seen := make(map[int]struct{}, len(parts))
	for _, part := range parts {
		period, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || period <= 0 {
			return nil, fmt.Errorf("%s must be a comma-separated list of positive integers", key)
		}
		if _, exists := seen[period]; exists {
			continue
		}
		seen[period] = struct{}{}
		periods = append(periods, period)
	}
	if len(periods) == 0 {
		return nil, fmt.Errorf("%s must contain at least one period", key)
	}
	sort.Ints(periods)
	return periods, nil
}
