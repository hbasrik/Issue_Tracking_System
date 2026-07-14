// Package config loads application configuration from environment variables.
package config

import (
	"os"
	"strings"
)

// Config holds runtime configuration for the API server.
type Config struct {
	AppEnv             string
	Port               string
	DatabaseURL        string
	JWTSecret          string
	CORSAllowedOrigins []string
}

// Load reads configuration from the process environment.
func Load() Config {
	return Config{
		AppEnv:             envOrDefault("APP_ENV", "development"),
		Port:               envOrDefault("PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
		CORSAllowedOrigins: parseCSVOrigins(envOrDefault("CORS_ALLOWED_ORIGIN", "http://localhost:5173")),
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
