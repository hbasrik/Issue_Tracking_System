package http_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
)

// TestRBACMiddleware proves the RBAC middleware enforces role separation in
// both directions: an operator cannot reach a manager-only route, and a
// manager cannot reach an operator-only route.
func TestRBACMiddleware(t *testing.T) {
	issuer := auth.NewIssuer("test-secret", time.Hour)

	managerToken, err := issuer.Issue(1, domain.UserRoleManagerAdmin)
	if err != nil {
		t.Fatalf("issue manager token: %v", err)
	}
	operatorToken, err := issuer.Issue(2, domain.UserRoleOperator)
	if err != nil {
		t.Fatalf("issue operator token: %v", err)
	}

	okHandler := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(apphttp.RequireAuth(issuer))
		r.Group(func(r chi.Router) {
			r.Use(apphttp.RequireRole(domain.UserRoleManagerAdmin))
			r.Get("/manager-only", okHandler)
		})
		r.Group(func(r chi.Router) {
			r.Use(apphttp.RequireRole(domain.UserRoleOperator))
			r.Get("/operator-only", okHandler)
		})
	})

	cases := []struct {
		name       string
		path       string
		token      string
		wantStatus int
	}{
		{"manager reaches manager route", "/manager-only", managerToken, http.StatusOK},
		{"operator blocked from manager route", "/manager-only", operatorToken, http.StatusForbidden},
		{"operator reaches operator route", "/operator-only", operatorToken, http.StatusOK},
		{"manager blocked from operator route", "/operator-only", managerToken, http.StatusForbidden},
		{"missing token is unauthorized", "/manager-only", "", http.StatusUnauthorized},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("got status %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}
