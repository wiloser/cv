package account

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"net/mail"
	"regexp"
	"strings"
	"sync"
	"time"

	"cv/quant-service/internal/database"
)

const (
	sessionTTL              = 7 * 24 * time.Hour
	passwordRounds          = 120_000
	emailCodeTTL            = 10 * time.Minute
	emailCodeResendInterval = 60 * time.Second
	emailCodeMaxAttempts    = 5
)

var (
	ErrUnauthenticated      = errors.New("authentication required")
	ErrInvalidInput         = errors.New("invalid account input")
	ErrEmailExists          = errors.New("email is already registered")
	ErrInvalidLogin         = errors.New("email or password is incorrect")
	ErrEmailCodeRequired    = errors.New("email verification code is required")
	ErrEmailCodeInvalid     = errors.New("email verification code is invalid or expired")
	ErrEmailCodeRateLimited = errors.New("email verification code was requested too recently")
	symbolPattern           = regexp.MustCompile(`^[A-Z0-9]{2,16}-[A-Z0-9]{2,8}$`)
)

type EmailCodeRateLimitError struct {
	RetryAfter int
}

func (e EmailCodeRateLimitError) Error() string {
	return fmt.Sprintf("%s: retry after %d seconds", ErrEmailCodeRateLimited, e.RetryAfter)
}

func (e EmailCodeRateLimitError) Unwrap() error {
	return ErrEmailCodeRateLimited
}

type NotificationSettings struct {
	Enabled bool   `json:"enabled"`
	Email   string `json:"email"`
	OnBuy   bool   `json:"onBuy"`
	OnSell  bool   `json:"onSell"`
}

type User struct {
	ID            string               `json:"id"`
	Email         string               `json:"email"`
	PasswordHash  string               `json:"passwordHash"`
	CreatedAt     string               `json:"createdAt"`
	UpdatedAt     string               `json:"updatedAt"`
	Watchlist     []string             `json:"watchlist"`
	Notifications NotificationSettings `json:"notifications"`
}

type PublicUser struct {
	ID            string               `json:"id"`
	Email         string               `json:"email"`
	CreatedAt     string               `json:"createdAt"`
	UpdatedAt     string               `json:"updatedAt"`
	Watchlist     []string             `json:"watchlist"`
	Notifications NotificationSettings `json:"notifications"`
}

type Recipient struct {
	UserID string
	Email  string
}

type session struct {
	UserID    string
	ExpiresAt time.Time
}

type emailCodeChallenge struct {
	Hash      [32]byte
	SentAt    time.Time
	ExpiresAt time.Time
	Attempts  int
}

type Store struct {
	db                   *sql.DB
	ownsDB               bool
	mu                   sync.Mutex
	notificationInFlight map[string]struct{}
	emailCodes           map[string]emailCodeChallenge
	sessions             map[string]session
}

// New opens the shared SQLite database in dataDir. NewWithDB lets the service
// share one already-migrated connection pool across account and snapshot data.
func New(dataDir string) (*Store, error) {
	db, err := database.Open(dataDir)
	if err != nil {
		return nil, err
	}
	store, err := NewWithDB(db)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	store.ownsDB = true
	return store, nil
}

func NewWithDB(db *sql.DB) (*Store, error) {
	if db == nil {
		return nil, errors.New("account database must not be nil")
	}
	return &Store{
		db:                   db,
		notificationInFlight: make(map[string]struct{}),
		emailCodes:           make(map[string]emailCodeChallenge),
		sessions:             make(map[string]session),
	}, nil
}

func (s *Store) Close() error {
	if s == nil || !s.ownsDB || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) Register(email, password, confirmPassword, code string) (PublicUser, string, error) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return PublicUser{}, "", err
	}
	if err := validatePassword(password); err != nil {
		return PublicUser{}, "", err
	}
	if password != confirmPassword {
		return PublicUser{}, "", fmt.Errorf("%w: passwords do not match", ErrInvalidInput)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	exists, err := s.emailExistsLocked(normalizedEmail)
	if err != nil {
		return PublicUser{}, "", err
	}
	if exists {
		return PublicUser{}, "", ErrEmailExists
	}
	if err := s.consumeEmailCodeLocked(normalizedEmail, code); err != nil {
		return PublicUser{}, "", err
	}

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return PublicUser{}, "", fmt.Errorf("create password salt: %w", err)
	}
	passwordHash := encodePasswordHash(password, salt)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	userID, err := randomID("usr_")
	if err != nil {
		return PublicUser{}, "", err
	}

	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return PublicUser{}, "", fmt.Errorf("begin account registration: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO users(id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, userID, normalizedEmail, passwordHash, now, now); err != nil {
		return PublicUser{}, "", fmt.Errorf("save registered account: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_notification_settings(user_id, email, on_buy, on_sell) VALUES (?, ?, 1, 1)`, userID, normalizedEmail); err != nil {
		return PublicUser{}, "", fmt.Errorf("save default notification settings: %w", err)
	}
	for index, symbol := range []string{"BTC-USDT", "ETH-USDT", "SOL-USDT"} {
		if _, err := tx.ExecContext(ctx, `INSERT INTO user_watchlist(user_id, instrument_id, sort_order) VALUES (?, ?, ?)`, userID, symbol, index); err != nil {
			return PublicUser{}, "", fmt.Errorf("save default watchlist: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return PublicUser{}, "", fmt.Errorf("commit account registration: %w", err)
	}

	token, err := s.newSessionLocked(userID)
	if err != nil {
		return PublicUser{}, "", err
	}
	user, err := loadUser(ctx, s.db, userID)
	if err != nil {
		delete(s.sessions, token)
		return PublicUser{}, "", err
	}
	return toPublic(user), token, nil
}

func (s *Store) Login(email, password string) (PublicUser, string, error) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return PublicUser{}, "", err
	}
	if strings.TrimSpace(password) == "" {
		return PublicUser{}, "", ErrInvalidLogin
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	var userID, passwordHash string
	err = s.db.QueryRowContext(context.Background(), `SELECT id, password_hash FROM users WHERE email = ? COLLATE NOCASE`, normalizedEmail).Scan(&userID, &passwordHash)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !verifyPassword(password, passwordHash)) {
		return PublicUser{}, "", ErrInvalidLogin
	}
	if err != nil {
		return PublicUser{}, "", fmt.Errorf("load account for login: %w", err)
	}
	user, err := loadUser(context.Background(), s.db, userID)
	if err != nil {
		return PublicUser{}, "", err
	}
	token, err := s.newSessionLocked(user.ID)
	if err != nil {
		return PublicUser{}, "", err
	}
	return toPublic(user), token, nil
}

func (s *Store) CreateEmailCode(email string) (string, int, int, error) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return "", 0, 0, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	exists, err := s.emailExistsLocked(normalizedEmail)
	if err != nil {
		return "", 0, 0, err
	}
	if exists {
		return "", 0, 0, ErrEmailExists
	}

	now := time.Now().UTC()
	if existing, ok := s.emailCodes[normalizedEmail]; ok && now.Before(existing.SentAt.Add(emailCodeResendInterval)) {
		retryAfter := int(time.Until(existing.SentAt.Add(emailCodeResendInterval)).Seconds())
		if retryAfter < 1 {
			retryAfter = 1
		}
		return "", 0, 0, EmailCodeRateLimitError{RetryAfter: retryAfter}
	}

	code, err := randomEmailCode()
	if err != nil {
		return "", 0, 0, fmt.Errorf("create email verification code: %w", err)
	}
	s.emailCodes[normalizedEmail] = emailCodeChallenge{
		Hash:      sha256.Sum256([]byte(code)),
		SentAt:    now,
		ExpiresAt: now.Add(emailCodeTTL),
	}
	return code, int(emailCodeTTL / time.Second), int(emailCodeResendInterval / time.Second), nil
}

func (s *Store) InvalidateEmailCode(email string) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.emailCodes, normalizedEmail)
}

func (s *Store) Logout(token string) {
	if strings.TrimSpace(token) == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
}

func (s *Store) Current(token string) (PublicUser, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	userID, ok := s.userIDForSessionLocked(token)
	if !ok {
		return PublicUser{}, false, nil
	}
	user, err := loadUser(context.Background(), s.db, userID)
	if errors.Is(err, sql.ErrNoRows) {
		delete(s.sessions, strings.TrimSpace(token))
		return PublicUser{}, false, nil
	}
	if err != nil {
		return PublicUser{}, false, err
	}
	return toPublic(user), true, nil
}

func (s *Store) UpdateWatchlist(token string, symbols []string) (PublicUser, error) {
	normalized, err := normalizeSymbols(symbols)
	if err != nil {
		return PublicUser{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	userID, ok := s.userIDForSessionLocked(token)
	if !ok {
		return PublicUser{}, ErrUnauthenticated
	}

	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return PublicUser{}, fmt.Errorf("begin watchlist update: %w", err)
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE users SET updated_at = ? WHERE id = ?`, time.Now().UTC().Format(time.RFC3339Nano), userID)
	if err != nil {
		return PublicUser{}, fmt.Errorf("update watchlist timestamp: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return PublicUser{}, fmt.Errorf("check watchlist account: %w", err)
	}
	if rowsAffected == 0 {
		return PublicUser{}, ErrUnauthenticated
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM user_watchlist WHERE user_id = ?`, userID); err != nil {
		return PublicUser{}, fmt.Errorf("replace watchlist: %w", err)
	}
	for index, symbol := range normalized {
		if _, err := tx.ExecContext(ctx, `INSERT INTO user_watchlist(user_id, instrument_id, sort_order) VALUES (?, ?, ?)`, userID, symbol, index); err != nil {
			return PublicUser{}, fmt.Errorf("save watchlist item: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return PublicUser{}, fmt.Errorf("commit watchlist update: %w", err)
	}
	user, err := loadUser(ctx, s.db, userID)
	if err != nil {
		return PublicUser{}, err
	}
	return toPublic(user), nil
}

func (s *Store) UpdateNotifications(token string, settings NotificationSettings) (PublicUser, error) {
	settings.Email = strings.TrimSpace(strings.ToLower(settings.Email))
	if settings.Enabled && settings.Email == "" {
		return PublicUser{}, fmt.Errorf("%w: notification email is required", ErrInvalidInput)
	}
	if settings.Email != "" {
		if _, err := normalizeEmail(settings.Email); err != nil {
			return PublicUser{}, err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	userID, ok := s.userIDForSessionLocked(token)
	if !ok {
		return PublicUser{}, ErrUnauthenticated
	}
	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return PublicUser{}, fmt.Errorf("begin notification settings update: %w", err)
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE users SET updated_at = ? WHERE id = ?`, time.Now().UTC().Format(time.RFC3339Nano), userID)
	if err != nil {
		return PublicUser{}, fmt.Errorf("update notification timestamp: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return PublicUser{}, fmt.Errorf("check notification account: %w", err)
	}
	if rowsAffected == 0 {
		return PublicUser{}, ErrUnauthenticated
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_notification_settings(user_id, enabled, email, on_buy, on_sell)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, email = excluded.email, on_buy = excluded.on_buy, on_sell = excluded.on_sell`,
		userID, settings.Enabled, settings.Email, settings.OnBuy, settings.OnSell); err != nil {
		return PublicUser{}, fmt.Errorf("save notification settings: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return PublicUser{}, fmt.Errorf("commit notification settings: %w", err)
	}
	user, err := loadUser(ctx, s.db, userID)
	if err != nil {
		return PublicUser{}, err
	}
	return toPublic(user), nil
}

func (s *Store) WatchedSymbols() ([]string, error) {
	rows, err := s.db.QueryContext(context.Background(), `SELECT DISTINCT instrument_id FROM user_watchlist ORDER BY instrument_id`)
	if err != nil {
		return nil, fmt.Errorf("read watched symbols: %w", err)
	}
	defer rows.Close()
	symbols := make([]string, 0)
	for rows.Next() {
		var symbol string
		if err := rows.Scan(&symbol); err != nil {
			return nil, fmt.Errorf("read watched symbol: %w", err)
		}
		symbols = append(symbols, symbol)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate watched symbols: %w", err)
	}
	return symbols, nil
}

func (s *Store) SignalRecipients(instrumentID, cross string) ([]Recipient, error) {
	instrumentID = strings.ToUpper(strings.TrimSpace(instrumentID))
	cross = strings.ToLower(strings.TrimSpace(cross))
	rows, err := s.db.QueryContext(context.Background(), `SELECT u.id, n.email
		FROM users AS u
		JOIN user_notification_settings AS n ON n.user_id = u.id
		JOIN user_watchlist AS w ON w.user_id = u.id
		WHERE w.instrument_id = ? COLLATE NOCASE
		  AND n.enabled = 1 AND TRIM(n.email) <> ''
		  AND ((? = 'golden' AND n.on_buy = 1) OR (? = 'death' AND n.on_sell = 1))
		ORDER BY u.id`, instrumentID, cross, cross)
	if err != nil {
		return nil, fmt.Errorf("read signal recipients: %w", err)
	}
	defer rows.Close()
	recipients := make([]Recipient, 0)
	for rows.Next() {
		var recipient Recipient
		if err := rows.Scan(&recipient.UserID, &recipient.Email); err != nil {
			return nil, fmt.Errorf("read signal recipient: %w", err)
		}
		recipients = append(recipients, recipient)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate signal recipients: %w", err)
	}
	return recipients, nil
}

func (s *Store) BeginNotificationEvent(key string) (bool, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return false, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.notificationInFlight[key]; exists {
		return false, nil
	}
	var exists bool
	if err := s.db.QueryRowContext(context.Background(), `SELECT EXISTS(SELECT 1 FROM notification_events WHERE event_key = ?)`, key).Scan(&exists); err != nil {
		return false, fmt.Errorf("check notification event: %w", err)
	}
	if exists {
		return false, nil
	}
	s.notificationInFlight[key] = struct{}{}
	return true, nil
}

func (s *Store) CompleteNotificationEvent(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return ErrInvalidInput
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	defer delete(s.notificationInFlight, key)
	if _, err := s.db.ExecContext(context.Background(), `INSERT INTO notification_events(event_key, completed_at) VALUES (?, ?) ON CONFLICT(event_key) DO NOTHING`, key, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return fmt.Errorf("save notification event: %w", err)
	}
	return nil
}

func (s *Store) ReleaseNotificationEvent(key string) {
	key = strings.TrimSpace(key)
	if key == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.notificationInFlight, key)
}

func (s *Store) userIDForSessionLocked(token string) (string, bool) {
	token = strings.TrimSpace(token)
	current, ok := s.sessions[token]
	if !ok || time.Now().After(current.ExpiresAt) {
		if ok {
			delete(s.sessions, token)
		}
		return "", false
	}
	return current.UserID, true
}

func (s *Store) consumeEmailCodeLocked(email, code string) error {
	if strings.TrimSpace(code) == "" {
		return ErrEmailCodeRequired
	}
	challenge, ok := s.emailCodes[email]
	if !ok || time.Now().UTC().After(challenge.ExpiresAt) {
		delete(s.emailCodes, email)
		return ErrEmailCodeInvalid
	}

	challenge.Attempts++
	expected := sha256.Sum256([]byte(strings.TrimSpace(code)))
	valid := subtle.ConstantTimeCompare(expected[:], challenge.Hash[:]) == 1
	if !valid {
		if challenge.Attempts >= emailCodeMaxAttempts {
			delete(s.emailCodes, email)
		} else {
			s.emailCodes[email] = challenge
		}
		return ErrEmailCodeInvalid
	}
	delete(s.emailCodes, email)
	return nil
}

func (s *Store) emailExistsLocked(email string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(context.Background(), `SELECT EXISTS(SELECT 1 FROM users WHERE email = ? COLLATE NOCASE)`, email).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check account email: %w", err)
	}
	return exists, nil
}

func (s *Store) newSessionLocked(userID string) (string, error) {
	token, err := randomID("sess_")
	if err != nil {
		return "", err
	}
	s.sessions[token] = session{UserID: userID, ExpiresAt: time.Now().Add(sessionTTL)}
	return token, nil
}

func loadUser(ctx context.Context, db *sql.DB, userID string) (User, error) {
	var user User
	if err := db.QueryRowContext(ctx, `SELECT id, email, password_hash, created_at, updated_at FROM users WHERE id = ?`, userID).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt,
	); err != nil {
		return User{}, err
	}

	user.Watchlist = make([]string, 0)
	rows, err := db.QueryContext(ctx, `SELECT instrument_id FROM user_watchlist WHERE user_id = ? ORDER BY sort_order, instrument_id`, userID)
	if err != nil {
		return User{}, fmt.Errorf("read account watchlist: %w", err)
	}
	for rows.Next() {
		var symbol string
		if err := rows.Scan(&symbol); err != nil {
			_ = rows.Close()
			return User{}, fmt.Errorf("read account watchlist item: %w", err)
		}
		user.Watchlist = append(user.Watchlist, symbol)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return User{}, fmt.Errorf("iterate account watchlist: %w", err)
	}
	if err := rows.Close(); err != nil {
		return User{}, fmt.Errorf("close account watchlist: %w", err)
	}

	var enabled, onBuy, onSell bool
	err = db.QueryRowContext(ctx, `SELECT enabled, email, on_buy, on_sell FROM user_notification_settings WHERE user_id = ?`, userID).Scan(
		&enabled, &user.Notifications.Email, &onBuy, &onSell,
	)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return User{}, fmt.Errorf("read account notification settings: %w", err)
	}
	if err == nil {
		user.Notifications.Enabled = enabled
		user.Notifications.OnBuy = onBuy
		user.Notifications.OnSell = onSell
	}
	return user, nil
}

func normalizeEmail(value string) (string, error) {
	value = strings.TrimSpace(strings.ToLower(value))
	parsed, err := mail.ParseAddress(value)
	if err != nil || parsed.Address != value || !strings.Contains(value, "@") {
		return "", fmt.Errorf("%w: enter a valid email address", ErrInvalidInput)
	}
	return value, nil
}

func randomEmailCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func validatePassword(password string) error {
	if len(password) < 8 || len(password) > 128 {
		return fmt.Errorf("%w: password must be 8-128 characters", ErrInvalidInput)
	}
	return nil
}

func normalizeSymbols(symbols []string) ([]string, error) {
	result := make([]string, 0, len(symbols))
	seen := make(map[string]struct{}, len(symbols))
	for _, symbol := range symbols {
		normalized := strings.ToUpper(strings.TrimSpace(strings.ReplaceAll(symbol, "/", "-")))
		if normalized == "" {
			continue
		}
		if !symbolPattern.MatchString(normalized) {
			return nil, fmt.Errorf("%w: invalid OKX instrument %q", ErrInvalidInput, symbol)
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result, nil
}

func randomID(prefix string) (string, error) {
	value := make([]byte, 24)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("create secure identifier: %w", err)
	}
	return prefix + base64.RawURLEncoding.EncodeToString(value), nil
}

func encodePasswordHash(password string, salt []byte) string {
	digest := sha256.New()
	digest.Write(salt)
	digest.Write([]byte(password))
	hash := digest.Sum(nil)
	for index := 0; index < passwordRounds; index++ {
		digest = sha256.New()
		digest.Write(hash)
		digest.Write(salt)
		hash = digest.Sum(nil)
	}
	return fmt.Sprintf("v1$%s$%s", base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash))
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 || parts[0] != "v1" {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	actualParts := strings.Split(encodePasswordHash(password, salt), "$")
	if len(actualParts) != 3 {
		return false
	}
	actual, err := base64.RawStdEncoding.DecodeString(actualParts[2])
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func toPublic(user User) PublicUser {
	return PublicUser{
		ID:            user.ID,
		Email:         user.Email,
		CreatedAt:     user.CreatedAt,
		UpdatedAt:     user.UpdatedAt,
		Watchlist:     append([]string{}, user.Watchlist...),
		Notifications: user.Notifications,
	}
}
