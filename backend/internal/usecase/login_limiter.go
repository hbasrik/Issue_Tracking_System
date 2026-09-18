package usecase

import (
	"context"
	"math"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/karea/backend/internal/domain"
)

// loginAuditWriter is the narrow audit surface needed for blocked logins.
type loginAuditWriter interface {
	Append(ctx context.Context, entry domain.AuditLog) error
}

// Account lockout after consecutive failures (success clears the counter).
// Thresholds match the factory brief: shared egress IP must not lock everyone.
const (
	loginFailLock1Min  = 5
	loginFailLock5Min  = 10
	loginFailLock15Min = 15

	loginIPMaxPerMinute = 100
	loginIPWindow       = time.Minute
)

// LoginLimiter tracks failed logins in process memory. A backend restart
// clears every counter and lock — intentional until persistence is required.
type LoginLimiter struct {
	mu       sync.Mutex
	accounts map[string]*accountLoginState
	ips      map[string]*ipLoginState
	audit    loginAuditWriter
	now      func() time.Time
}

type accountLoginState struct {
	failures    int
	lockedUntil time.Time
}

type ipLoginState struct {
	windowStart time.Time
	count       int
}

// NewLoginLimiter wires an in-memory limiter. audit may be nil (tests).
func NewLoginLimiter(audit loginAuditWriter) *LoginLimiter {
	return &LoginLimiter{
		accounts: make(map[string]*accountLoginState),
		ips:      make(map[string]*ipLoginState),
		audit:    audit,
		now:      time.Now,
	}
}

// SetClock replaces time.Now (tests only).
func (l *LoginLimiter) SetClock(now func() time.Time) {
	if l == nil {
		return
	}
	l.now = now
}

// NormalizeLoginEmail lowercases and trims so "A@x" and "a@x" share a bucket.
func NormalizeLoginEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// ClientIP prefers the first X-Forwarded-For hop (factory reverse proxy), else
// the TCP peer host.
func ClientIP(remoteAddr, forwardedFor string) string {
	if forwardedFor != "" {
		parts := strings.Split(forwardedFor, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(remoteAddr)
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(remoteAddr)
}

func lockDurationForFailures(failures int) time.Duration {
	switch {
	case failures >= loginFailLock15Min:
		return 15 * time.Minute
	case failures >= loginFailLock5Min:
		return 5 * time.Minute
	case failures >= loginFailLock1Min:
		return time.Minute
	default:
		return 0
	}
}

func retryMinutes(remaining time.Duration) int {
	if remaining <= 0 {
		return 1
	}
	mins := int(math.Ceil(remaining.Seconds() / 60))
	if mins < 1 {
		return 1
	}
	return mins
}

func (l *LoginLimiter) clock() time.Time {
	if l.now != nil {
		return l.now()
	}
	return time.Now()
}

// Check rejects the attempt when the account is locked or the IP ceiling is
// hit. Blocked attempts are written to audit_logs when an auditor is wired.
func (l *LoginLimiter) Check(ctx context.Context, email, ip string) error {
	key := NormalizeLoginEmail(email)
	now := l.clock()

	l.mu.Lock()
	defer l.mu.Unlock()

	if st, ok := l.accounts[key]; ok && st.lockedUntil.After(now) {
		remaining := st.lockedUntil.Sub(now)
		l.auditBlocked(ctx, key, ip, "account", remaining)
		return domain.NewLoginRateLimitedError(remaining)
	}

	ipKey := strings.TrimSpace(ip)
	if ipKey == "" {
		ipKey = "unknown"
	}
	ipSt := l.ips[ipKey]
	if ipSt == nil {
		ipSt = &ipLoginState{windowStart: now}
		l.ips[ipKey] = ipSt
	}
	if now.Sub(ipSt.windowStart) >= loginIPWindow {
		ipSt.windowStart = now
		ipSt.count = 0
	}
	if ipSt.count >= loginIPMaxPerMinute {
		remaining := loginIPWindow - now.Sub(ipSt.windowStart)
		if remaining < time.Second {
			remaining = time.Second
		}
		l.auditBlocked(ctx, key, ipKey, "ip", remaining)
		return domain.NewLoginRateLimitedError(remaining)
	}
	ipSt.count++
	return nil
}

// RecordFailure increments the account failure counter and may start/extend a
// lockout. Unknown and known emails share the same keying rules.
func (l *LoginLimiter) RecordFailure(email string) {
	key := NormalizeLoginEmail(email)
	now := l.clock()

	l.mu.Lock()
	defer l.mu.Unlock()

	st := l.accounts[key]
	if st == nil {
		st = &accountLoginState{}
		l.accounts[key] = st
	}
	st.failures++
	if d := lockDurationForFailures(st.failures); d > 0 {
		until := now.Add(d)
		if until.After(st.lockedUntil) {
			st.lockedUntil = until
		}
	}
}

// RecordSuccess clears the account failure counter and any lockout.
func (l *LoginLimiter) RecordSuccess(email string) {
	key := NormalizeLoginEmail(email)
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.accounts, key)
}

// Unlock clears lockout state for an email (admin action).
func (l *LoginLimiter) Unlock(email string) {
	key := NormalizeLoginEmail(email)
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.accounts, key)
}

// LockedUntil reports when the account may try again (zero if not locked).
func (l *LoginLimiter) LockedUntil(email string) time.Time {
	key := NormalizeLoginEmail(email)
	now := l.clock()
	l.mu.Lock()
	defer l.mu.Unlock()
	st := l.accounts[key]
	if st == nil || !st.lockedUntil.After(now) {
		return time.Time{}
	}
	return st.lockedUntil
}

// Failures returns the in-memory failure count (tests / diagnostics).
func (l *LoginLimiter) Failures(email string) int {
	key := NormalizeLoginEmail(email)
	l.mu.Lock()
	defer l.mu.Unlock()
	if st := l.accounts[key]; st != nil {
		return st.failures
	}
	return 0
}

func (l *LoginLimiter) auditBlocked(
	ctx context.Context,
	email, ip, reason string,
	remaining time.Duration,
) {
	if l.audit == nil {
		return
	}
	meta := map[string]any{
		"email":            email,
		"ip":               ip,
		"reason":           reason,
		"retry_after_sec":  int(remaining.Seconds()),
		"retry_after_min":  retryMinutes(remaining),
	}
	_ = l.audit.Append(ctx, domain.AuditLog{
		EventType: domain.AuditEventLoginRateLimited,
		OldValue:  email,
		NewValue:  ip,
		Metadata:  meta,
	})
}
