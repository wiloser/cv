package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"cv/quant-service/internal/account"
	"cv/quant-service/internal/backtest"
	"cv/quant-service/internal/config"
	"cv/quant-service/internal/monitor"
	"cv/quant-service/internal/notify"
)

type Handler struct {
	service       *monitor.Service
	cfg           config.Config
	accounts      *account.Store
	notifications *notify.Service
}

func NewHandler(service *monitor.Service, cfg config.Config, accounts *account.Store, notifications *notify.Service) http.Handler {
	handler := &Handler{service: service, cfg: cfg, accounts: accounts, notifications: notifications}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", handler.health)
	mux.HandleFunc("/api/quant/config", handler.configuration)
	mux.HandleFunc("/api/quant/auth/email-code", handler.emailCode)
	mux.HandleFunc("/api/quant/auth/register", handler.register)
	mux.HandleFunc("/api/quant/auth/login", handler.login)
	mux.HandleFunc("/api/quant/auth/logout", handler.logout)
	mux.HandleFunc("/api/quant/auth/me", handler.me)
	mux.HandleFunc("/api/quant/watchlist", handler.watchlist)
	mux.HandleFunc("/api/quant/notifications", handler.notificationsSettings)
	mux.HandleFunc("/api/quant/notifications/test", handler.testNotification)
	mux.HandleFunc("/api/quant/market", handler.market)
	mux.HandleFunc("/api/quant/dashboard", handler.dashboard)
	mux.HandleFunc("/api/quant/monitor", handler.monitor)
	mux.HandleFunc("/api/quant/ema", handler.ema)
	mux.HandleFunc("/api/quant/backtest", handler.backtest)
	mux.HandleFunc("/api/quant/optimize", handler.optimize)
	mux.HandleFunc("/api/quant/pnl", handler.pnl)
	mux.HandleFunc("/api/quant/sync", handler.sync)
	return handler.withCORS(mux)
}

const sessionCookieName = "quant_session"

type credentialsRequest struct {
	Email           string `json:"email"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirmPassword"`
	Code            string `json:"code"`
}

type emailCodeRequest struct {
	Email string `json:"email"`
}

type watchlistRequest struct {
	Symbols []string `json:"symbols"`
}

func (h *Handler) register(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	var payload credentialsRequest
	if err := decodeJSON(request, &payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	user, token, err := h.accounts.Register(payload.Email, payload.Password, payload.ConfirmPassword, payload.Code)
	if err != nil {
		writeAccountError(writer, err)
		return
	}
	setSessionCookie(writer, token)
	writeJSON(writer, http.StatusCreated, user)
}

func (h *Handler) login(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	var payload credentialsRequest
	if err := decodeJSON(request, &payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	user, token, err := h.accounts.Login(payload.Email, payload.Password)
	if err != nil {
		writeAccountError(writer, err)
		return
	}
	setSessionCookie(writer, token)
	writeJSON(writer, http.StatusOK, user)
}

func (h *Handler) emailCode(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if h.notifications == nil || !h.notifications.Configured() {
		writeError(writer, http.StatusServiceUnavailable, notify.ErrNotConfigured)
		return
	}
	var payload emailCodeRequest
	if err := decodeJSON(request, &payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	code, expiresIn, retryAfter, err := h.accounts.CreateEmailCode(payload.Email)
	if err != nil {
		writeAccountError(writer, err)
		return
	}
	if err := h.notifications.SendVerificationCode(request.Context(), payload.Email, code); err != nil {
		h.accounts.InvalidateEmailCode(payload.Email)
		if errors.Is(err, notify.ErrNotConfigured) {
			writeError(writer, http.StatusServiceUnavailable, err)
			return
		}
		writeError(writer, http.StatusBadGateway, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{
		"sent":       true,
		"expiresIn":  expiresIn,
		"retryAfter": retryAfter,
	})
}

func (h *Handler) logout(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	h.accounts.Logout(sessionToken(request))
	http.SetCookie(writer, &http.Cookie{Name: sessionCookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	writeJSON(writer, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) me(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	user, ok, err := h.currentUser(request)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		writeError(writer, http.StatusUnauthorized, account.ErrUnauthenticated)
		return
	}
	writeJSON(writer, http.StatusOK, user)
}

func (h *Handler) watchlist(writer http.ResponseWriter, request *http.Request) {
	user, ok, err := h.currentUser(request)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		writeError(writer, http.StatusUnauthorized, account.ErrUnauthenticated)
		return
	}
	switch request.Method {
	case http.MethodGet:
		writeJSON(writer, http.StatusOK, map[string]any{"symbols": user.Watchlist})
	case http.MethodPut:
		var payload watchlistRequest
		if err := decodeJSON(request, &payload); err != nil {
			writeError(writer, http.StatusBadRequest, err)
			return
		}
		updated, err := h.accounts.UpdateWatchlist(sessionToken(request), payload.Symbols)
		if err != nil {
			writeAccountError(writer, err)
			return
		}
		writeJSON(writer, http.StatusOK, updated)
	default:
		methodNotAllowed(writer, "GET, PUT")
	}
}

func (h *Handler) notificationsSettings(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPut {
		methodNotAllowed(writer, http.MethodPut)
		return
	}
	if _, ok, err := h.currentUser(request); err != nil {
		writeError(writer, http.StatusInternalServerError, err)
		return
	} else if !ok {
		writeError(writer, http.StatusUnauthorized, account.ErrUnauthenticated)
		return
	}
	var payload account.NotificationSettings
	if err := decodeJSON(request, &payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	updated, err := h.accounts.UpdateNotifications(sessionToken(request), payload)
	if err != nil {
		writeAccountError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, updated)
}

func (h *Handler) testNotification(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	user, ok, err := h.currentUser(request)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		writeError(writer, http.StatusUnauthorized, account.ErrUnauthenticated)
		return
	}
	if err := h.notifications.SendTest(request.Context(), user.Notifications.Email); err != nil {
		if errors.Is(err, notify.ErrNotConfigured) {
			writeError(writer, http.StatusServiceUnavailable, err)
			return
		}
		writeError(writer, http.StatusBadGateway, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]bool{"sent": true})
}

func (h *Handler) health(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	dashboard, err := h.service.Dashboard()
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{
		"status":           "ok",
		"instrumentId":     dashboard.InstrumentID,
		"bar":              dashboard.Bar,
		"hasLatest":        dashboard.HasLatest,
		"accountConnected": dashboard.HasLatest && dashboard.Latest.AccountConnected,
	})
}

func (h *Handler) configuration(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{
		"instrumentId":      h.cfg.InstrumentID,
		"instrumentType":    h.cfg.InstrumentType,
		"bar":               h.cfg.Bar,
		"emaPeriods":        h.cfg.EMAPeriods,
		"defaultFastPeriod": h.cfg.EMAPeriods[0],
		"defaultSlowPeriod": h.cfg.EMAPeriods[len(h.cfg.EMAPeriods)-1],
		"accountCurrency":   h.cfg.AccountCurrency,
		"syncInterval":      h.cfg.SyncInterval.String(),
		"privateApiEnabled": h.cfg.PrivateAPIConfigured(),
	})
}

func (h *Handler) market(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	symbols := strings.FieldsFunc(request.URL.Query().Get("symbols"), func(r rune) bool {
		return r == ',' || r == ' ' || r == '\t' || r == '\n'
	})
	quoteCurrency := strings.ToUpper(strings.TrimSpace(request.URL.Query().Get("quoteCcy")))
	quotes, err := h.service.MarketQuotes(request.Context(), symbols, quoteCurrency)
	if err != nil {
		writeServiceError(writer, http.StatusBadGateway, err)
		return
	}
	writeJSON(writer, http.StatusOK, quotes)
}

func (h *Handler) dashboard(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	options, err := optionsFromRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	dashboard, err := h.service.DashboardFor(options)
	if err != nil {
		writeServiceError(writer, http.StatusInternalServerError, err)
		return
	}
	writeJSON(writer, http.StatusOK, dashboard)
}

func (h *Handler) monitor(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	options, err := optionsFromRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	data, err := h.service.MonitorDataFor(options)
	if err != nil {
		writeServiceError(writer, http.StatusInternalServerError, err)
		return
	}
	writeJSON(writer, http.StatusOK, data)
}

func (h *Handler) ema(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	options, err := optionsFromRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	dashboard, err := h.service.DashboardFor(options)
	if err != nil {
		writeServiceError(writer, http.StatusInternalServerError, err)
		return
	}
	writeJSON(writer, http.StatusOK, dashboard.EMA)
}

func (h *Handler) backtest(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	options, err := optionsFromRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	dashboard, err := h.service.DashboardFor(options)
	if err != nil {
		writeServiceError(writer, http.StatusInternalServerError, err)
		return
	}
	if !dashboard.HasLatest || dashboard.Latest.Backtest.Bars == 0 {
		writeError(writer, http.StatusNotFound, fmt.Errorf("no EMA backtest result is available yet"))
		return
	}
	writeJSON(writer, http.StatusOK, dashboard.Latest.Backtest)
}

func (h *Handler) optimize(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	options, err := optionsFromRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	search, err := searchFromRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	result, err := h.service.Optimize(request.Context(), options, search)
	if err != nil {
		writeServiceError(writer, http.StatusBadGateway, err)
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (h *Handler) pnl(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	options, err := optionsFromRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	dashboard, err := h.service.DashboardFor(options)
	if err != nil {
		writeServiceError(writer, http.StatusInternalServerError, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{
		"accountCurrency":  dashboard.Latest.AccountCurrency,
		"accountConnected": dashboard.HasLatest && dashboard.Latest.AccountConnected,
		"latest":           dashboard.Latest,
		"history":          dashboard.History,
	})
}

func (h *Handler) sync(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	options, err := optionsFromRequest(request)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	result, err := h.service.SyncWithOptions(request.Context(), options)
	if err != nil {
		writeServiceError(writer, http.StatusBadGateway, err)
		return
	}
	if h.notifications != nil {
		if err := h.notifications.NotifySignal(request.Context(), result.Snapshot); err != nil {
			writeServiceError(writer, http.StatusBadGateway, err)
			return
		}
	}
	writeJSON(writer, http.StatusOK, result)
}

func (h *Handler) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		origin := h.cfg.CORSOrigin
		if origin == "" {
			origin = "http://localhost:5174"
		}
		if origin == "*" || strings.EqualFold(request.Header.Get("Origin"), origin) {
			writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		writer.Header().Set("Vary", "Origin")
		writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		writer.Header().Set("Access-Control-Allow-Credentials", "true")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func (h *Handler) currentUser(request *http.Request) (account.PublicUser, bool, error) {
	if h.accounts == nil {
		return account.PublicUser{}, false, nil
	}
	return h.accounts.Current(sessionToken(request))
}

func sessionToken(request *http.Request) string {
	cookie, err := request.Cookie(sessionCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func setSessionCookie(writer http.ResponseWriter, token string) {
	http.SetCookie(writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int((7 * 24 * 60 * 60)),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func decodeJSON(request *http.Request, target any) error {
	decoder := json.NewDecoder(io.LimitReader(request.Body, 1<<20))
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid JSON body: %w", err)
	}
	return nil
}

func writeAccountError(writer http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	var rateLimit account.EmailCodeRateLimitError
	switch {
	case errors.As(err, &rateLimit):
		status = http.StatusTooManyRequests
		writer.Header().Set("Retry-After", strconv.Itoa(rateLimit.RetryAfter))
	case errors.Is(err, account.ErrInvalidInput):
		status = http.StatusBadRequest
	case errors.Is(err, account.ErrEmailExists):
		status = http.StatusConflict
	case errors.Is(err, account.ErrInvalidLogin), errors.Is(err, account.ErrUnauthenticated):
		status = http.StatusUnauthorized
	case errors.Is(err, account.ErrEmailCodeRequired), errors.Is(err, account.ErrEmailCodeInvalid):
		status = http.StatusBadRequest
	}
	writeError(writer, status, err)
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func writeError(writer http.ResponseWriter, status int, err error) {
	writeJSON(writer, status, map[string]string{"error": err.Error()})
}

func writeServiceError(writer http.ResponseWriter, fallbackStatus int, err error) {
	if monitor.IsInvalidOptions(err) || backtest.IsInvalidSearch(err) {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	writeError(writer, fallbackStatus, err)
}

func optionsFromRequest(request *http.Request) (monitor.RunOptions, error) {
	query := request.URL.Query()
	options := monitor.RunOptions{
		InstrumentID: query.Get("symbol"),
	}
	if options.InstrumentID == "" {
		options.InstrumentID = query.Get("instId")
	}
	fast, err := queryInt(query.Get("fast"), query.Get("fastPeriod"), "fast")
	if err != nil {
		return monitor.RunOptions{}, err
	}
	slow, err := queryInt(query.Get("slow"), query.Get("slowPeriod"), "slow")
	if err != nil {
		return monitor.RunOptions{}, err
	}
	options.FastPeriod = fast
	options.SlowPeriod = slow
	return options, nil
}

func queryInt(primary, fallback, label string) (int, error) {
	value := primary
	if value == "" {
		value = fallback
	}
	if value == "" {
		return 0, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", label)
	}
	return parsed, nil
}

func searchFromRequest(request *http.Request) (backtest.SearchConfig, error) {
	search := backtest.DefaultSearchConfig()
	query := request.URL.Query()
	fields := []struct {
		key    string
		target *int
	}{
		{key: "fastMin", target: &search.FastMin},
		{key: "fastMax", target: &search.FastMax},
		{key: "slowMin", target: &search.SlowMin},
		{key: "slowMax", target: &search.SlowMax},
		{key: "step", target: &search.Step},
		{key: "top", target: &search.TopN},
		{key: "topN", target: &search.TopN},
	}
	for _, field := range fields {
		value := query.Get(field.key)
		if value == "" {
			continue
		}
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return backtest.SearchConfig{}, fmt.Errorf("%s must be an integer", field.key)
		}
		*field.target = parsed
	}
	return search, nil
}

func methodNotAllowed(writer http.ResponseWriter, allowed string) {
	writer.Header().Set("Allow", allowed)
	writeJSON(writer, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}
