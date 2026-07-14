package http

import (
	"context"
	"net/http"
	"strings"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
)

type contextKey int

const claimsContextKey contextKey = iota

// CORS returns middleware that allows browser clients only when the request
// Origin is in allowedOrigins (from CORS_ALLOWED_ORIGIN). Matching origins get
// Access-Control-Allow-Origin set to that exact value; non-matching origins get
// no CORS headers (browser blocks). Preflight OPTIONS for allowed origins is
// answered here so it never hits method-restricted route handlers.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if o = strings.TrimSpace(o); o != "" {
			allowed[o] = struct{}{}
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				if _, ok := allowed[origin]; ok {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Credentials", "true")
					w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
					w.Header().Set("Vary", "Origin")
					if r.Method == http.MethodOptions {
						w.WriteHeader(http.StatusNoContent)
						return
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireAuth returns middleware that requires a valid Bearer JWT. On success
// it stores the parsed claims in the request context; otherwise it responds
// 401 and does not call the next handler.
func RequireAuth(issuer *auth.Issuer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			token, ok := bearerToken(header)
			if !ok {
				writeError(w, auth.ErrInvalidToken)
				return
			}
			claims, err := issuer.Parse(token)
			if err != nil {
				writeError(w, err)
				return
			}
			ctx := context.WithValue(r.Context(), claimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole returns middleware that allows the request only if the
// authenticated user's role is in allowed. It must be chained after
// RequireAuth. On mismatch it responds 403 (RBAC, Decision Log #4).
func RequireRole(allowed ...domain.UserRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := ClaimsFromContext(r.Context())
			if !ok {
				writeError(w, auth.ErrInvalidToken)
				return
			}
			if err := auth.Authorize(claims.Role, allowed...); err != nil {
				writeError(w, err)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClaimsFromContext returns the authenticated claims stored by RequireAuth.
func ClaimsFromContext(ctx context.Context) (*auth.Claims, bool) {
	claims, ok := ctx.Value(claimsContextKey).(*auth.Claims)
	return claims, ok
}

// bearerToken extracts the token from an "Authorization: Bearer <token>" header.
func bearerToken(header string) (string, bool) {
	const prefix = "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", false
	}
	token := strings.TrimSpace(header[len(prefix):])
	return token, token != ""
}
