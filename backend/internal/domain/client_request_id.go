package domain

import (
	"regexp"
	"strings"
)

// RFC 4122 UUID (any version), lowercase hex with hyphens.
var clientRequestIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// NormalizeClientRequestID trims and lowercases a client idempotency key.
// Empty input means "no key" and is not an error.
func NormalizeClientRequestID(raw string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return "", nil
	}
	if !clientRequestIDPattern.MatchString(s) {
		return "", ErrClientRequestIDInvalid
	}
	return s, nil
}
