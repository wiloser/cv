package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sort"
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
	notificationService := notify.NewService(accountStore, notify.NewMailer(cfg), cfg.SyncLocation)

	rootContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
	if cfg.SyncOnStart {
		go runSync(rootContext, service, accountStore, notificationService, cfg, false, cfg.RequestTimeout*4)
	}

	<-rootContext.Done()
	shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		log.Printf("HTTP server shutdown: %v", err)
	}
}

func runScheduledSync(ctx context.Context, service *monitor.Service, accounts *account.Store, notifications *notify.Service, cfg config.Config) {
	for {
		nextSync := cfg.NextSyncTime(time.Now())
		timer := time.NewTimer(time.Until(nextSync))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			runSync(ctx, service, accounts, notifications, cfg, true, cfg.RequestTimeout*4)
		}
	}
}

func runSync(parent context.Context, service *monitor.Service, accounts *account.Store, notifications *notify.Service, cfg config.Config, sendNotifications bool, timeout time.Duration) {
	symbols, err := accounts.WatchedSymbols()
	if err != nil {
		log.Printf("read watched symbols failed: %v", err)
		symbols = nil
	}
	strategies, err := accounts.NotificationTargets()
	if err != nil {
		log.Printf("read notification strategies failed: %v", err)
		strategies = nil
	}

	targetsByKey := make(map[string]account.NotificationTarget)
	addTarget := func(target account.NotificationTarget) {
		key := fmt.Sprintf("%s|%d|%d", target.InstrumentID, target.FastPeriod, target.SlowPeriod)
		targetsByKey[key] = target
	}
	defaultTarget := account.NotificationTarget{
		InstrumentID: service.DefaultInstrumentID(),
		FastPeriod:   cfg.EMAPeriods[0],
		SlowPeriod:   cfg.EMAPeriods[len(cfg.EMAPeriods)-1],
	}
	for _, symbol := range symbols {
		addTarget(account.NotificationTarget{InstrumentID: symbol, FastPeriod: defaultTarget.FastPeriod, SlowPeriod: defaultTarget.SlowPeriod})
	}
	for _, strategy := range strategies {
		addTarget(strategy)
	}
	if len(targetsByKey) == 0 {
		addTarget(defaultTarget)
	}

	targets := make([]account.NotificationTarget, 0, len(targetsByKey))
	for _, target := range targetsByKey {
		targets = append(targets, target)
	}
	sort.Slice(targets, func(i, j int) bool {
		if targets[i].InstrumentID != targets[j].InstrumentID {
			return targets[i].InstrumentID < targets[j].InstrumentID
		}
		if targets[i].FastPeriod != targets[j].FastPeriod {
			return targets[i].FastPeriod < targets[j].FastPeriod
		}
		return targets[i].SlowPeriod < targets[j].SlowPeriod
	})

	ctx, cancel := context.WithTimeout(parent, timeout+time.Duration(len(targets))*cfg.RequestTimeout*4)
	defer cancel()
	snapshots := make([]store.Snapshot, 0, len(targets))
	for _, target := range targets {
		result, err := service.SyncWithOptions(ctx, monitor.RunOptions{
			InstrumentID: target.InstrumentID,
			FastPeriod:   target.FastPeriod,
			SlowPeriod:   target.SlowPeriod,
		})
		if err != nil {
			log.Printf("quant sync failed: symbol=%s ema=%d/%d error=%v", target.InstrumentID, target.FastPeriod, target.SlowPeriod, err)
			continue
		}
		snapshots = append(snapshots, result.Snapshot)
		log.Printf("quant sync completed: symbol=%s ema=%d/%d mode=%s candles=%d signal=%s cross=%s equity=%.4f realizedPnL=%.4f fees=%.4f", target.InstrumentID, target.FastPeriod, target.SlowPeriod, result.Snapshot.Mode, result.CandleCount, result.Snapshot.EMA.Signal, result.Snapshot.EMA.Cross, result.Snapshot.Equity, result.Snapshot.RealizedPnL, result.Snapshot.Fees)
		for _, warning := range result.Warnings {
			log.Printf("quant sync warning: symbol=%s ema=%d/%d %s", target.InstrumentID, target.FastPeriod, target.SlowPeriod, warning)
		}
	}
	if sendNotifications && notifications != nil {
		if err := notifications.NotifySignals(ctx, snapshots); err != nil {
			log.Printf("quant notification digest failed: %v", err)
		}
	}
}
