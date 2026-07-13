// Package config loads application configuration from environment variables.
package config

import "os"

// Config holds runtime configuration for the API server.
type Config struct {
	AppEnv      string
	Port        string
	DatabaseURL string
	JWTSecret   string
}

// Load reads configuration from the process environment.
func Load() Config {
	return Config{
		AppEnv:      envOrDefault("APP_ENV", "development"),
		Port:        envOrDefault("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
	}
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
