// Package applog is the process logger: level-filtered lines go to stderr and
// an optional rotating file. Secrets (passwords, tokens, hashes) must never be
// passed as field values — use Redact for untrusted strings.
package applog

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Level is a severity threshold.
type Level int

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
)

func (l Level) String() string {
	switch l {
	case LevelDebug:
		return "DEBUG"
	case LevelInfo:
		return "INFO"
	case LevelWarn:
		return "WARN"
	case LevelError:
		return "ERROR"
	default:
		return "INFO"
	}
}

// ParseLevel maps env values (debug/info/warn/error) to Level.
func ParseLevel(raw string) Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return LevelDebug
	case "warn", "warning":
		return LevelWarn
	case "error":
		return LevelError
	default:
		return LevelInfo
	}
}

// Options configures Init.
type Options struct {
	Level       Level
	FilePath    string // empty = stderr only
	MaxBytes    int64  // rotate when file exceeds this (default 10 MiB)
	MaxBackups  int    // kept rotated files (default 5)
}

var (
	mu     sync.Mutex
	level  = LevelInfo
	writer io.Writer = os.Stderr
	closer io.Closer
)

// Init replaces the global logger. Safe to call once at process start.
func Init(opts Options) error {
	mu.Lock()
	defer mu.Unlock()

	if closer != nil {
		_ = closer.Close()
		closer = nil
	}

	level = opts.Level

	var outputs []io.Writer
	// Always mirror to stderr so operators still see lines in the terminal.
	outputs = append(outputs, os.Stderr)

	if opts.FilePath != "" {
		maxBytes := opts.MaxBytes
		if maxBytes <= 0 {
			maxBytes = 10 << 20
		}
		maxBackups := opts.MaxBackups
		if maxBackups <= 0 {
			maxBackups = 5
		}
		dir := filepath.Dir(opts.FilePath)
		if dir != "" && dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return fmt.Errorf("applog mkdir: %w", err)
			}
		}
		rw, err := openRotate(opts.FilePath, maxBytes, maxBackups)
		if err != nil {
			return err
		}
		outputs = append(outputs, rw)
		closer = rw
	}

	writer = io.MultiWriter(outputs...)
	return nil
}

// Close flushes/closes the file sink (tests / shutdown).
func Close() {
	mu.Lock()
	defer mu.Unlock()
	if closer != nil {
		_ = closer.Close()
		closer = nil
	}
	writer = os.Stderr
}

// SetOutputForTest redirects logging (and disables the file closer).
func SetOutputForTest(w io.Writer, lvl Level) {
	mu.Lock()
	defer mu.Unlock()
	if closer != nil {
		_ = closer.Close()
		closer = nil
	}
	level = lvl
	if w == nil {
		writer = os.Stderr
		return
	}
	writer = w
}

func logf(lvl Level, msg string, kv ...any) {
	mu.Lock()
	defer mu.Unlock()
	if lvl < level {
		return
	}
	var b strings.Builder
	b.WriteString(time.Now().UTC().Format(time.RFC3339))
	b.WriteByte(' ')
	b.WriteString(lvl.String())
	b.WriteByte(' ')
	b.WriteString(msg)
	for i := 0; i+1 < len(kv); i += 2 {
		b.WriteByte(' ')
		b.WriteString(fmt.Sprint(kv[i]))
		b.WriteByte('=')
		b.WriteString(quote(fmt.Sprint(kv[i+1])))
	}
	b.WriteByte('\n')
	_, _ = io.WriteString(writer, b.String())
}

func quote(s string) string {
	if s == "" {
		return `""`
	}
	if strings.ContainsAny(s, " \t=\"") {
		return fmt.Sprintf("%q", s)
	}
	return s
}

// Debug logs at DEBUG.
func Debug(msg string, kv ...any) { logf(LevelDebug, msg, kv...) }

// Info logs at INFO.
func Info(msg string, kv ...any) { logf(LevelInfo, msg, kv...) }

// Warn logs at WARN.
func Warn(msg string, kv ...any) { logf(LevelWarn, msg, kv...) }

// Error logs at ERROR.
func Error(msg string, kv ...any) { logf(LevelError, msg, kv...) }

// Redact replaces secrets with a fixed placeholder. Use when logging
// untrusted input that might contain passwords or tokens.
func Redact(s string) string {
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	secrets := []string{
		"password", "passwd", "token", "authorization", "bearer ",
		"password_hash", "secret", "api_key", "apikey",
	}
	for _, needle := range secrets {
		if strings.Contains(lower, needle) {
			return "[REDACTED]"
		}
	}
	return s
}

// ContainsSecret reports whether s looks like it embeds a credential field.
func ContainsSecret(s string) bool {
	return Redact(s) == "[REDACTED]" && s != "" && s != "[REDACTED]"
}
