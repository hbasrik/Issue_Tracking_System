package http

import (
	"context"
	"net/http"
	"strings"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/repository"
)

type contextKey int

const (
	claimsContextKey contextKey = iota
	permissionsContextKey
)

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

// PermissionChecker resolves a caller's permissions from the RBAC tables and
// turns them into route middleware (Karar 3).
type PermissionChecker struct {
	roles repository.RoleRepository
}

// NewPermissionChecker constructs a PermissionChecker over the role catalogue.
func NewPermissionChecker(roles repository.RoleRepository) *PermissionChecker {
	return &PermissionChecker{roles: roles}
}

// RequirePermission returns middleware that allows the request only if the
// authenticated user holds the given permission code. It must be chained after
// RequireAuth. On a missing permission it responds 403.
func (pc *PermissionChecker) RequirePermission(code string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, permissions, err := pc.Resolve(r.Context())
			if err != nil {
				writeError(w, err)
				return
			}
			if err := auth.Authorize(permissions, code); err != nil {
				writeError(w, err)
				return
			}
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// Resolve returns the caller's permission set along with a context carrying it.
// The set is looked up at most once per request: stacked RequirePermission
// middleware and handlers that need the set reuse the cached value instead of
// re-querying.
func (pc *PermissionChecker) Resolve(ctx context.Context) (context.Context, domain.PermissionSet, error) {
	if permissions, ok := PermissionsFromContext(ctx); ok {
		return ctx, permissions, nil
	}
	claims, ok := ClaimsFromContext(ctx)
	if !ok {
		return ctx, nil, auth.ErrInvalidToken
	}
	granted, err := pc.roles.GetPermissionsForUser(ctx, claims.UserID)
	if err != nil {
		return ctx, nil, err
	}
	permissions := domain.NewPermissionSet(granted)
	return context.WithValue(ctx, permissionsContextKey, permissions), permissions, nil
}

// ClaimsFromContext returns the authenticated claims stored by RequireAuth.
func ClaimsFromContext(ctx context.Context) (*auth.Claims, bool) {
	claims, ok := ctx.Value(claimsContextKey).(*auth.Claims)
	return claims, ok
}

// PermissionsFromContext returns the permission set cached by Resolve.
func PermissionsFromContext(ctx context.Context) (domain.PermissionSet, bool) {
	permissions, ok := ctx.Value(permissionsContextKey).(domain.PermissionSet)
	return permissions, ok
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

// requireCode resolves the caller's permission set (cached per request) and
// 403s when the given code is missing. Handlers that branch on a URL
// parameter (checklist type) use this instead of route-level middleware.
func (s *server) requireCode(w http.ResponseWriter, r *http.Request, code string) bool {
	if code == "" {
		writeError(w, auth.ErrForbidden)
		return false
	}
	_, permissions, err := s.permissions.Resolve(r.Context())
	if err != nil {
		writeError(w, err)
		return false
	}
	if err := auth.Authorize(permissions, code); err != nil {
		writeError(w, err)
		return false
	}
	return true
}
