package account

import (
	"errors"
	"testing"
)

func TestEmailCodeRegisterAndLoginLifecycle(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	code, expiresIn, retryAfter, err := store.CreateEmailCode("User@example.com")
	if err != nil {
		t.Fatalf("create registration code: %v", err)
	}
	if len(code) != 6 || expiresIn <= 0 || retryAfter <= 0 {
		t.Fatalf("unexpected code metadata: code=%q expiresIn=%d retryAfter=%d", code, expiresIn, retryAfter)
	}
	if _, _, err := store.Register("User@example.com", "password-123", "password-123", "000000"); !errors.Is(err, ErrEmailCodeInvalid) {
		t.Fatalf("invalid code error = %v, want ErrEmailCodeInvalid", err)
	}

	user, token, err := store.Register("User@example.com", "password-123", "password-123", code)
	if err != nil {
		t.Fatalf("register with code: %v", err)
	}
	if user.Email != "user@example.com" || token == "" {
		t.Fatalf("unexpected registration result: user=%+v token=%q", user, token)
	}
	if _, _, err := store.Register("User@example.com", "password-123", "password-123", code); !errors.Is(err, ErrEmailExists) {
		t.Fatalf("duplicate registration error = %v, want ErrEmailExists", err)
	}

	loggedIn, loginToken, err := store.Login("user@example.com", "password-123")
	if err != nil {
		t.Fatalf("login with password: %v", err)
	}
	if loggedIn.ID != user.ID || loginToken == "" {
		t.Fatalf("unexpected login result: user=%+v token=%q", loggedIn, loginToken)
	}
}

func TestEmailCodeRequiresChallengeBeforeAccountOperation(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if _, _, err := store.Register("new@example.com", "password-123", "password-123", "123456"); !errors.Is(err, ErrEmailCodeInvalid) {
		t.Fatalf("registration without challenge error = %v, want ErrEmailCodeInvalid", err)
	}
	if _, _, err := store.Register("new@example.com", "password-123", "password-123", ""); !errors.Is(err, ErrEmailCodeRequired) {
		t.Fatalf("registration without code error = %v, want ErrEmailCodeRequired", err)
	}
	code, _, _, err := store.CreateEmailCode("another@example.com")
	if err != nil {
		t.Fatalf("create second registration code: %v", err)
	}
	if _, _, err := store.Register("another@example.com", "password-123", "different-password", code); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("mismatched password error = %v, want ErrInvalidInput", err)
	}
	if _, _, err := store.Register("another@example.com", "password-123", "password-123", code); err != nil {
		t.Fatalf("register after correcting password confirmation: %v", err)
	}
}

func TestNotificationEventCanBeRetriedAfterRelease(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	const key = "user|BTC-USDT|signal"
	started, err := store.BeginNotificationEvent(key)
	if err != nil {
		t.Fatalf("begin first notification event: %v", err)
	}
	if !started {
		t.Fatal("first notification event should begin")
	}
	started, err = store.BeginNotificationEvent(key)
	if err != nil {
		t.Fatalf("check in-flight notification event: %v", err)
	}
	if started {
		t.Fatal("in-flight notification event should not begin twice")
	}
	store.ReleaseNotificationEvent(key)
	started, err = store.BeginNotificationEvent(key)
	if err != nil {
		t.Fatalf("retry notification event: %v", err)
	}
	if !started {
		t.Fatal("released notification event should be retryable")
	}
	if err := store.CompleteNotificationEvent(key); err != nil {
		t.Fatalf("complete notification event: %v", err)
	}
	started, err = store.BeginNotificationEvent(key)
	if err != nil {
		t.Fatalf("check completed notification event: %v", err)
	}
	if started {
		t.Fatal("completed notification event should not begin twice")
	}
}
