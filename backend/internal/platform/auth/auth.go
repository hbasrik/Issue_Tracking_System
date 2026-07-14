// Package auth provides JWT issuing/parsing and role-based access control
// helpers. The HTTP middleware that consumes these is built in Prompt 4; this
// package intentionally has no net/http dependency so the token logic stays
// unit-testable in isolation.
//
// Tokens are signed with HS256 using only the standard library, avoiding a
// third-party JWT dependency for what is a small, well-understood format.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/karea/backend/internal/domain"
)

// Auth errors returned by parsing and authorization.
var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
	ErrForbidden    = errors.New("role not permitted")
)

// Claims is the JWT payload. Role drives RBAC (Decision Log #4).
type Claims struct {
	UserID int             `json:"sub"`
	Role   domain.UserRole `json:"role"`
	// IssuedAt and ExpiresAt are Unix seconds (standard "iat"/"exp" claims).
	IssuedAt  int64 `json:"iat"`
	ExpiresAt int64 `json:"exp"`
}

// Issuer signs and verifies JWTs with a shared HMAC secret.
type Issuer struct {
	secret []byte
	ttl    time.Duration
}

// NewIssuer creates an Issuer with the given signing secret and token TTL.
func NewIssuer(secret string, ttl time.Duration) *Issuer {
	return &Issuer{secret: []byte(secret), ttl: ttl}
}

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

// Issue mints a signed token for a user with the configured TTL.
func (i *Issuer) Issue(userID int, role domain.UserRole) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Role:      role,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(i.ttl).Unix(),
	}

	headerJSON, err := json.Marshal(jwtHeader{Alg: "HS256", Typ: "JWT"})
	if err != nil {
		return "", err
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	signingInput := encodeSegment(headerJSON) + "." + encodeSegment(claimsJSON)
	signature := i.sign(signingInput)
	return signingInput + "." + signature, nil
}

// Parse verifies a token's signature and expiry and returns its claims.
func (i *Issuer) Parse(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidToken
	}

	signingInput := parts[0] + "." + parts[1]
	expected := i.sign(signingInput)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[2])) != 1 {
		return nil, ErrInvalidToken
	}

	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrInvalidToken
	}
	var claims Claims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, ErrInvalidToken
	}
	if !claims.Role.Valid() {
		return nil, ErrInvalidToken
	}
	if time.Now().Unix() >= claims.ExpiresAt {
		return nil, ErrExpiredToken
	}
	return &claims, nil
}

func (i *Issuer) sign(input string) string {
	mac := hmac.New(sha256.New, i.secret)
	mac.Write([]byte(input))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func encodeSegment(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

// Authorize reports whether a role is allowed to access a resource, given the
// set of roles permitted for it. This is the RBAC decision function the HTTP
// middleware (Prompt 4) will call after Parse. Exactly two roles exist:
// OPERATOR (mobile-only) and MANAGER_ADMIN (web-only).
func Authorize(role domain.UserRole, allowed ...domain.UserRole) error {
	for _, a := range allowed {
		if role == a {
			return nil
		}
	}
	return ErrForbidden
}
