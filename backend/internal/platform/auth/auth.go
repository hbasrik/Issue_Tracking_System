// Package auth provides JWT issuing/parsing and permission-based access
// control helpers. This package intentionally has no net/http dependency so
// the token logic stays unit-testable in isolation.
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
	ErrForbidden    = errors.New("permission not granted")
)

// Claims is the JWT payload.
//
// RoleCode is carried for coarse client-side decisions (which app shell to
// render). It is deliberately NOT the basis for endpoint authorization: since
// Karar 3 the permission set is table-driven and resolved per request, so
// putting it in the token would let a revoked permission stay valid until the
// token expired.
type Claims struct {
	UserID   int    `json:"sub"`
	RoleCode string `json:"role_code"`
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
func (i *Issuer) Issue(userID int, roleCode string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		RoleCode:  roleCode,
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
	if claims.UserID == 0 || claims.RoleCode == "" {
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

// Authorize reports whether a resolved permission set grants the permission a
// resource requires. This is the RBAC decision function the HTTP middleware
// calls after Parse. It takes a permission code rather than a role so adding a
// role to the matrix never requires touching this code path (Karar 3).
func Authorize(permissions domain.PermissionSet, required string) error {
	if permissions.Has(required) {
		return nil
	}
	return ErrForbidden
}
