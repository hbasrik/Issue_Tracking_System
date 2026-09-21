// Package config loads application configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds runtime configuration for the API server.
type Config struct {
	AppEnv             string
	Port               string
	DatabaseURL        string
	JWTSecret          string
	CORSAllowedOrigins []string
	// AllowedEmailDomains is the company-domain allowlist for user create.
	// Empty means no restriction (local development).
	AllowedEmailDomains []string
	// UploadDir is where media attachments are written. Karar 8 defers the
	// cloud-storage decision, so uploads live on local disk for now.
	UploadDir string
	// LogLevel is debug|info|warn|error (default info).
	LogLevel string
	// LogFile is the rotating log path. Empty disables the file sink (stderr only).
	LogFile string
	// LogMaxBytes rotates the file when it exceeds this size (default 10 MiB).
	LogMaxBytes int64
	// LogMaxBackups is how many rotated files to keep (default 5).
	LogMaxBackups int
}

// Load reads configuration from the process environment, after filling gaps
// from a .env file if the repository has one.
func Load() Config {
	loadDotEnv()

	return Config{
		AppEnv:      envOrDefault("APP_ENV", "development"),
		Port:        envOrDefault("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		CORSAllowedOrigins: parseCSV(envOrDefault(
			"CORS_ALLOWED_ORIGIN",
			"http://localhost:5173,http://localhost:5174",
		)),
		AllowedEmailDomains: parseCSV(os.Getenv("ALLOWED_EMAIL_DOMAINS")),
		UploadDir:           envOrDefault("UPLOAD_DIR", "uploads"),
		LogLevel:            envOrDefault("LOG_LEVEL", "info"),
		LogFile:             envOrDefault("LOG_FILE", "logs/karea-api.log"),
		LogMaxBytes:         envInt64OrDefault("LOG_MAX_BYTES", 10<<20),
		LogMaxBackups:       envIntOrDefault("LOG_MAX_BACKUPS", 5),
	}
}

// MinJWTSecretLen is the minimum accepted JWT_SECRET length. Shorter secrets
// are rejected at process start so tokens cannot be forged with an empty key.
const MinJWTSecretLen = 32

// ValidateJWTSecret fails closed when JWT_SECRET is missing or too short.
// There is no auto-generate escape hatch — operators must set a real secret.
func ValidateJWTSecret(secret string) error {
	if len(secret) < MinJWTSecretLen {
		return fmt.Errorf(
			"JWT_SECRET must be at least %d characters (got %d). Generate one with: openssl rand -base64 32",
			MinJWTSecretLen, len(secret),
		)
	}
	return nil
}

// dotEnvSearchDepth is how far up the tree to look for a .env: the README has
// developers run `go run ./cmd/api` from backend/, while the file lives at the
// repository root.
const dotEnvSearchDepth = 3

// loadDotEnv loads the nearest .env at or above the working directory.
// godotenv never overwrites a variable that is already set, so a real
// environment (Docker, CI, an exported shell var) still wins; without this the
// values the README tells developers to put in .env would silently never reach
// the process, and the defaults below would apply instead.
func loadDotEnv() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	for range dotEnvSearchDepth {
		path := filepath.Join(dir, ".env")
		if _, err := os.Stat(path); err == nil {
			_ = godotenv.Load(path)
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envIntOrDefault(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

func envInt64OrDefault(key string, fallback int64) int64 {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

// parseCSV splits a comma-separated list and trims whitespace. Empty
// segments are dropped.
func parseCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if o := strings.TrimSpace(p); o != "" {
			out = append(out, o)
		}
	}
	return out
}

// parseCSVOrigins splits a comma-separated exact-origin allowlist.
// Callers must pass concrete origins (e.g. http://localhost:5173) —
// wildcards are not supported and must not be introduced here.
func parseCSVOrigins(raw string) []string {
	return parseCSV(raw)
}
