// Package config loads application configuration from environment variables.
package config

import (
	"os"
	"path/filepath"
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
	// UploadDir is where media attachments are written. Karar 8 defers the
	// cloud-storage decision, so uploads live on local disk for now.
	UploadDir string
}

// Load reads configuration from the process environment, after filling gaps
// from a .env file if the repository has one.
func Load() Config {
	loadDotEnv()

	return Config{
		AppEnv:             envOrDefault("APP_ENV", "development"),
		Port:               envOrDefault("PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
		CORSAllowedOrigins: parseCSVOrigins(envOrDefault("CORS_ALLOWED_ORIGIN", "http://localhost:5173")),
		UploadDir:          envOrDefault("UPLOAD_DIR", "uploads"),
	}
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

// parseCSVOrigins splits a comma-separated origin list and trims whitespace.
func parseCSVOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if o := strings.TrimSpace(p); o != "" {
			out = append(out, o)
		}
	}
	return out
}
