package usecase_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

type memAudit struct {
	entries []domain.AuditLog
}

func (m *memAudit) Append(_ context.Context, entry domain.AuditLog) error {
	m.entries = append(m.entries, entry)
	return nil
}

func TestLoginLimiter_AccountLockAfterFiveFailures(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	lim := usecase.NewLoginLimiter(nil)
	lim.SetClock(func() time.Time { return now })

	email := "alice@factory.local"
	for i := 0; i < 5; i++ {
		if err := lim.Check(context.Background(), email, "10.0.0.1"); err != nil {
			t.Fatalf("failure %d: unexpected check err: %v", i+1, err)
		}
		lim.RecordFailure(email)
	}
	if lim.Failures(email) != 5 {
		t.Fatalf("failures = %d, want 5", lim.Failures(email))
	}
	err := lim.Check(context.Background(), email, "10.0.0.1")
	var limited *domain.LoginRateLimitedError
	if err == nil || !asLoginLimited(err, &limited) {
		t.Fatalf("want lockout after 5 failures, got %v", err)
	}
	if !strings.Contains(err.Error(), "1 minutes") && !strings.Contains(err.Error(), "1 minute") {
		// Error always uses "minutes" plural in our format.
		if !strings.Contains(err.Error(), "try again in 1 minutes") {
			t.Fatalf("error = %q, want 1 minute message", err.Error())
		}
	}
}

func TestLoginLimiter_CorrectPasswordStillBlockedWhileLocked(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	lim := usecase.NewLoginLimiter(nil)
	lim.SetClock(func() time.Time { return now })
	email := "bob@factory.local"
	for i := 0; i < 5; i++ {
		_ = lim.Check(context.Background(), email, "10.0.0.1")
		lim.RecordFailure(email)
	}
	if err := lim.Check(context.Background(), email, "10.0.0.1"); err == nil {
		t.Fatal("expected lockout before credential check")
	}
}

func TestLoginLimiter_SuccessResetsCounter(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	lim := usecase.NewLoginLimiter(nil)
	lim.SetClock(func() time.Time { return now })
	email := "carol@factory.local"
	for i := 0; i < 4; i++ {
		_ = lim.Check(context.Background(), email, "10.0.0.1")
		lim.RecordFailure(email)
	}
	lim.RecordSuccess(email)
	if lim.Failures(email) != 0 {
		t.Fatalf("failures after success = %d", lim.Failures(email))
	}
	for i := 0; i < 4; i++ {
		if err := lim.Check(context.Background(), email, "10.0.0.1"); err != nil {
			t.Fatalf("post-reset failure %d blocked: %v", i+1, err)
		}
		lim.RecordFailure(email)
	}
	if err := lim.Check(context.Background(), email, "10.0.0.1"); err != nil {
		t.Fatalf("5th attempt after reset should still be allowed before RecordFailure: %v", err)
	}
}

func TestLoginLimiter_SharedIPDoesNotLockOtherAccounts(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	lim := usecase.NewLoginLimiter(nil)
	lim.SetClock(func() time.Time { return now })
	sharedIP := "203.0.113.50"

	for i := 0; i < 5; i++ {
		_ = lim.Check(context.Background(), "noisy@factory.local", sharedIP)
		lim.RecordFailure("noisy@factory.local")
	}
	if err := lim.Check(context.Background(), "noisy@factory.local", sharedIP); err == nil {
		t.Fatal("noisy account should be locked")
	}
	if err := lim.Check(context.Background(), "quiet@factory.local", sharedIP); err != nil {
		t.Fatalf("other account on same IP must not be locked: %v", err)
	}
}

func TestLoginLimiter_UnknownAndKnownSameLockMessage(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	lim := usecase.NewLoginLimiter(nil)
	lim.SetClock(func() time.Time { return now })

	lock := func(email string) string {
		for i := 0; i < 5; i++ {
			_ = lim.Check(context.Background(), email, "10.0.0.2")
			lim.RecordFailure(email)
		}
		err := lim.Check(context.Background(), email, "10.0.0.2")
		if err == nil {
			t.Fatalf("%s: expected lock", email)
		}
		return err.Error()
	}
	known := lock("exists@factory.local")
	unknown := lock("missing@factory.local")
	if known != unknown {
		t.Fatalf("messages differ:\n known=%q\n unknown=%q", known, unknown)
	}
}

func TestLoginLimiter_UnlockClearsLock(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	lim := usecase.NewLoginLimiter(nil)
	lim.SetClock(func() time.Time { return now })
	email := "locked@factory.local"
	for i := 0; i < 5; i++ {
		_ = lim.Check(context.Background(), email, "10.0.0.3")
		lim.RecordFailure(email)
	}
	lim.Unlock(email)
	if err := lim.Check(context.Background(), email, "10.0.0.3"); err != nil {
		t.Fatalf("after unlock: %v", err)
	}
	if lim.Failures(email) != 0 {
		t.Fatalf("failures after unlock = %d", lim.Failures(email))
	}
}

func TestLoginLimiter_BlockedAttemptAudited(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	audit := &memAudit{}
	lim := usecase.NewLoginLimiter(audit)
	lim.SetClock(func() time.Time { return now })
	email := "audit@factory.local"
	for i := 0; i < 5; i++ {
		_ = lim.Check(context.Background(), email, "198.51.100.9")
		lim.RecordFailure(email)
	}
	_ = lim.Check(context.Background(), email, "198.51.100.9")
	if len(audit.entries) != 1 {
		t.Fatalf("audit entries = %d, want 1", len(audit.entries))
	}
	e := audit.entries[0]
	if e.EventType != domain.AuditEventLoginRateLimited {
		t.Fatalf("event = %s", e.EventType)
	}
	if e.OldValue != email {
		t.Fatalf("email in old_value = %q", e.OldValue)
	}
	if e.NewValue != "198.51.100.9" {
		t.Fatalf("ip in new_value = %q", e.NewValue)
	}
	if e.Metadata["email"] != email {
		t.Fatalf("metadata email = %v", e.Metadata["email"])
	}
}

func TestClientIP_PrefersForwardedFor(t *testing.T) {
	t.Parallel()
	got := usecase.ClientIP("192.0.2.1:1234", "203.0.113.8, 10.0.0.1")
	if got != "203.0.113.8" {
		t.Fatalf("got %q", got)
	}
}

func asLoginLimited(err error, dst **domain.LoginRateLimitedError) bool {
	if err == nil {
		return false
	}
	e, ok := err.(*domain.LoginRateLimitedError)
	if !ok {
		return false
	}
	*dst = e
	return true
}
