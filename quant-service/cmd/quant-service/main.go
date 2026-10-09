package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cv/quant-service/internal/account"
	"cv/quant-service/internal/api"
	"cv/quant-service/internal/config"
	"cv/quant-service/internal/database"
	"cv/quant-service/internal/monitor"
	"cv/quant-service/internal/notify"
	"cv/quant-service/internal/okx"
	"cv/quant-service/internal/store"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	client, err := okx.NewClient(cfg)
	if err != nil {
		log.Fatalf("create OKX client: %v", err)
	}
	db, err := database.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("initialize SQLite database: %v", err)
	}
	defer db.Close()
	snapshotStore, err := store.NewWithDB(db)
	if err != nil {
		log.Fatalf("create snapshot store: %v", err)
	}
	accountStore, err := account.NewWithDB(db)
	if err != nil {
		log.Fatalf("create account store: %v", err)
	}
	service := monitor.NewService(cfg, client, snapshotStore)
	notificationService := notify.NewService(accountStore, notify.NewMailer(cfg))

	rootContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.SyncOnStart {
		runSync(rootContext, service, accountStore, notificationService, cfg.RequestTimeout*4)
	}

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.NewHandler(service, cfg, accountStore, notificationService),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go runScheduledSync(rootContext, service, accountStore, notificationService, cfg)
	go func() {
		log.Printf("quant service listening on %s, instrument=%s bar=%s", cfg.HTTPAddr, cfg.InstrumentID, cfg.Bar)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("HTTP server stopped: %v", err)
			stop()
		}
	}()

	<-rootContext.Done()
	shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		log.Printf("HTTP server shutdown: %v", err)
	}
}

func runScheduledSync(ctx context.Context, service *monitor.Service, accounts *account.Store, notifications *notify.Service, cfg config.Config) {
	ticker := time.NewTicker(cfg.SyncInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runSync(ctx, service, accounts, notifications, cfg.RequestTimeout*4)
		}
	}
}

func runSync(parent context.Context, service *monitor.Service, accounts *account.Store, notifications *notify.Service, timeout time.Duration) {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	symbols, err := accounts.WatchedSymbols()
	if err != nil {
		log.Printf("read watched symbols failed: %v", err)
		symbols = nil
	}
	if len(symbols) == 0 {
		symbols = []string{service.DefaultInstrumentID()}
	}
	for _, symbol := range symbols {
		result, err := service.SyncWithOptions(ctx, monitor.RunOptions{InstrumentID: symbol})
		if err != nil {
			log.Printf("quant sync failed: symbol=%s error=%v", symbol, err)
			continue
		}
		log.Printf("quant sync completed: symbol=%s mode=%s candles=%d signal=%s cross=%s equity=%.4f realizedPnL=%.4f fees=%.4f", symbol, result.Snapshot.Mode, result.CandleCount, result.Snapshot.EMA.Signal, result.Snapshot.EMA.Cross, result.Snapshot.Equity, result.Snapshot.RealizedPnL, result.Snapshot.Fees)
		for _, warning := range result.Warnings {
			log.Printf("quant sync warning: symbol=%s %s", symbol, warning)
		}
		if err := notifications.NotifySignal(ctx, result.Snapshot); err != nil {
			log.Printf("quant notification failed: symbol=%s error=%v", symbol, err)
		}
	}
}
