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

// TestRBACMiddleware proves role separation and Decision Log #9: operators may
// read current-state analysis views, but not the Manager/Admin-only Analysis
// tool endpoints (daily-pending, mttr) or operator-write routes.
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

		// Both roles — current-state analysis reads (Decision Log #9).
		r.Get("/analysis/vehicle-severity-breakdown", okHandler)
		r.Get("/analysis/defect-rate-per-station", okHandler)

		r.Group(func(r chi.Router) {
			r.Use(apphttp.RequireRole(domain.UserRoleManagerAdmin))
			r.Get("/manager-only", okHandler)
			r.Get("/analysis/daily-pending-issues", okHandler)
			r.Get("/analysis/mttr", okHandler)
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

		// Decision Log #9 — both roles can read current-state analysis.
		{"manager reads vehicle-severity-breakdown", "/analysis/vehicle-severity-breakdown", managerToken, http.StatusOK},
		{"operator reads vehicle-severity-breakdown", "/analysis/vehicle-severity-breakdown", operatorToken, http.StatusOK},
		{"manager reads defect-rate-per-station", "/analysis/defect-rate-per-station", managerToken, http.StatusOK},
		{"operator reads defect-rate-per-station", "/analysis/defect-rate-per-station", operatorToken, http.StatusOK},

		// Manager/Admin-only Analysis tool endpoints remain restricted.
		{"manager reads daily-pending-issues", "/analysis/daily-pending-issues", managerToken, http.StatusOK},
		{"operator blocked from daily-pending-issues", "/analysis/daily-pending-issues", operatorToken, http.StatusForbidden},
		{"manager reads mttr", "/analysis/mttr", managerToken, http.StatusOK},
		{"operator blocked from mttr", "/analysis/mttr", operatorToken, http.StatusForbidden},
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
