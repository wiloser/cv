package database

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const FileName = "quant.db"

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Open creates the data directory and SQLite file when needed, then applies
// every unapplied embedded schema migration before returning the connection.
func Open(dataDir string) (*sql.DB, error) {
	if strings.TrimSpace(dataDir) == "" {
		return nil, errors.New("database data directory must not be empty")
	}
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}

	absolutePath, err := filepath.Abs(filepath.Join(dataDir, FileName))
	if err != nil {
		return nil, fmt.Errorf("resolve database path: %w", err)
	}
	dsnURL := url.URL{Scheme: "file", Path: filepath.ToSlash(absolutePath)}
	query := url.Values{}
	query.Set("_busy_timeout", "10000")
	query.Set("_foreign_keys", "on")
	query.Set("_journal_mode", "WAL")
	query.Set("_synchronous", "NORMAL")
	dsnURL.RawQuery = query.Encode()

	db, err := sql.Open("sqlite3", dsnURL.String())
	if err != nil {
		return nil, fmt.Errorf("open SQLite database: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("connect to SQLite database: %w", err)
	}
	if err := applyMigrations(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := os.Chmod(absolutePath, 0o600); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("restrict SQLite database permissions: %w", err)
	}
	return db, nil
}

func applyMigrations(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at TEXT NOT NULL
	)`); err != nil {
		return fmt.Errorf("create migration registry: %w", err)
	}

	files, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return fmt.Errorf("list database migrations: %w", err)
	}
	sort.Strings(files)
	for _, name := range files {
		version, err := migrationVersion(name)
		if err != nil {
			return err
		}
		var applied bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?)`, version).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if applied {
			continue
		}

		source, err := migrationFiles.ReadFile(name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}
		for _, statement := range strings.Split(string(source), ";") {
			statement = strings.TrimSpace(statement)
			if statement == "" {
				continue
			}
			if _, err := tx.ExecContext(ctx, statement); err != nil {
				_ = tx.Rollback()
				return fmt.Errorf("apply migration %s: %w", name, err)
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)`, version, filepath.Base(name), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}
	return nil
}

func migrationVersion(name string) (int, error) {
	base := filepath.Base(name)
	parts := strings.SplitN(base, "_", 2)
	if len(parts) != 2 || !strings.HasSuffix(parts[1], ".sql") {
		return 0, fmt.Errorf("invalid database migration filename %q", base)
	}
	version, err := strconv.Atoi(parts[0])
	if err != nil || version <= 0 {
		return 0, fmt.Errorf("invalid database migration version in %q", base)
	}
	return version, nil
}
