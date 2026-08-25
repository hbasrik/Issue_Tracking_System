package http_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/repository"
)

const (
	managerUserID  = 1
	operatorUserID = 2
	strangerUserID = 3
)

// fakeRoleRepo serves the role_permissions rows migration 0002 seeds for the
// two roles that exist today, and counts lookups so the per-request cache can
// be asserted.
type fakeRoleRepo struct {
	byUser map[int][]domain.Permission
	calls  int
}

var _ repository.RoleRepository = (*fakeRoleRepo)(nil)

func newFakeRoleRepo() *fakeRoleRepo {
	operator := permissions(
		domain.PermissionVehicleView,
		domain.PermissionStationStepUpdate,
		domain.PermissionChecklistItemUpdate,
		domain.PermissionIssueCreate,
		domain.PermissionIssueTransitionInProgress,
		domain.PermissionIssueTransitionDone,
	)
	manager := permissions(
		domain.PermissionVehicleView,
		domain.PermissionStationStepUpdate,
		domain.PermissionChecklistItemUpdate,
		domain.PermissionIssueCreate,
		domain.PermissionIssueTransitionInProgress,
		domain.PermissionIssueTransitionDone,
		domain.PermissionIssueTransitionApprove,
		domain.PermissionIssueTransitionConditionalApprove,
		domain.PermissionEOLBranchShip,
		domain.PermissionEOLDepotRelease,
		domain.PermissionEOLDocumentApprove,
		domain.PermissionAnalysisView,
		domain.PermissionAdminManageMasters,
	)
	return &fakeRoleRepo{byUser: map[int][]domain.Permission{
		managerUserID:  manager,
		operatorUserID: operator,
	}}
}

func permissions(codes ...string) []domain.Permission {
	out := make([]domain.Permission, 0, len(codes))
	for i, code := range codes {
		out = append(out, domain.Permission{ID: i + 1, Code: code})
	}
	return out
}

func (f *fakeRoleRepo) GetPermissionsForUser(_ context.Context, userID int) ([]domain.Permission, error) {
	f.calls++
	return f.byUser[userID], nil
}

func (f *fakeRoleRepo) GetByCode(_ context.Context, code string) (*domain.Role, error) {
	switch code {
	case domain.RoleCodeOperator:
		return &domain.Role{ID: 1, Code: code, Name: "Operator", IsActive: true}, nil
	case domain.RoleCodeManagerAdmin:
		return &domain.Role{ID: 2, Code: code, Name: "Manager/Admin", IsActive: true}, nil
	default:
		return nil, domain.ErrNotFound
	}
}

func okHandler(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

// newPermissionRouter mirrors the permission gates in NewRouter so the test
// exercises the same mapping the API serves.
func newPermissionRouter(issuer *auth.Issuer, roles repository.RoleRepository) http.Handler {
	checker := apphttp.NewPermissionChecker(roles)

	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(apphttp.RequireAuth(issuer))

		r.Group(func(r chi.Router) {
			r.Use(checker.RequirePermission(domain.PermissionVehicleView))
			r.Get("/vehicles", okHandler)
			r.Get("/analysis/vehicle-severity-breakdown", okHandler)
			r.Get("/analysis/defect-rate-per-station", okHandler)
		})
		r.Group(func(r chi.Router) {
			r.Use(checker.RequirePermission(domain.PermissionAnalysisView))
			r.Get("/analysis/daily-pending-issues", okHandler)
			r.Get("/analysis/mttr", okHandler)
		})
		r.With(checker.RequirePermission(domain.PermissionAdminManageMasters)).
			Get("/vehicles/status", okHandler)
		r.With(checker.RequirePermission(domain.PermissionStationStepUpdate)).
			Get("/station-steps", okHandler)
		r.With(checker.RequirePermission(domain.PermissionIssueCreate)).
			Get("/issues", okHandler)

		// EOL workflow (Karar 2) — one permission per stage.
		r.With(checker.RequirePermission(domain.PermissionEOLBranchShip)).
			Get("/eol/branch-ship", okHandler)
		r.With(checker.RequirePermission(domain.PermissionEOLDepotRelease)).
			Get("/eol/depot-release", okHandler)
		r.With(checker.RequirePermission(domain.PermissionEOLDocumentApprove)).
			Get("/eol/document-approve", okHandler)

		// Stacked gates: both must pass, and both must share one lookup.
		r.With(
			checker.RequirePermission(domain.PermissionVehicleView),
			checker.RequirePermission(domain.PermissionAnalysisView),
		).Get("/stacked", okHandler)
	})
	return r
}

// TestRBACMiddleware proves permission separation in both directions: a role is
// admitted exactly where the seeded role_permissions rows grant the endpoint's
// permission code, and 403s everywhere else. The middleware never looks at the
// role code, so extending the matrix is a data change (Karar 3).
func TestRBACMiddleware(t *testing.T) {
	issuer := auth.NewIssuer("test-secret", time.Hour)

	managerToken, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue manager token: %v", err)
	}
	operatorToken, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue operator token: %v", err)
	}
	// A valid token for a user whose role grants nothing: proves authorization
	// is decided by the permission table, not by the token's role_code.
	strangerToken, err := issuer.Issue(strangerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue stranger token: %v", err)
	}

	r := newPermissionRouter(issuer, newFakeRoleRepo())

	cases := []struct {
		name       string
		path       string
		token      string
		wantStatus int
	}{
		// vehicle.view — held by both seeded roles.
		{"manager reads vehicles", "/vehicles", managerToken, http.StatusOK},
		{"operator reads vehicles", "/vehicles", operatorToken, http.StatusOK},

		// Decision Log #9 — current-state analysis reads stay on vehicle.view
		// so operators keep the visibility they had before.
		{"manager reads vehicle-severity-breakdown", "/analysis/vehicle-severity-breakdown", managerToken, http.StatusOK},
		{"operator reads vehicle-severity-breakdown", "/analysis/vehicle-severity-breakdown", operatorToken, http.StatusOK},
		{"manager reads defect-rate-per-station", "/analysis/defect-rate-per-station", managerToken, http.StatusOK},
		{"operator reads defect-rate-per-station", "/analysis/defect-rate-per-station", operatorToken, http.StatusOK},

		// analysis.view — Manager/Admin only.
		{"manager reads daily-pending-issues", "/analysis/daily-pending-issues", managerToken, http.StatusOK},
		{"operator blocked from daily-pending-issues", "/analysis/daily-pending-issues", operatorToken, http.StatusForbidden},
		{"manager reads mttr", "/analysis/mttr", managerToken, http.StatusOK},
		{"operator blocked from mttr", "/analysis/mttr", operatorToken, http.StatusForbidden},

		// admin.manage_masters — Manager/Admin only.
		{"manager reaches admin route", "/vehicles/status", managerToken, http.StatusOK},
		{"operator blocked from admin route", "/vehicles/status", operatorToken, http.StatusForbidden},

		// Shop-floor write permissions — held by the operator, and also by the
		// manager because the seeded MANAGER_ADMIN grant is full access.
		{"operator reaches station-step route", "/station-steps", operatorToken, http.StatusOK},
		{"manager reaches station-step route", "/station-steps", managerToken, http.StatusOK},
		{"operator reaches issue-create route", "/issues", operatorToken, http.StatusOK},
		{"manager reaches issue-create route", "/issues", managerToken, http.StatusOK},

		// eol.* — each stage is separately gated, and the seed grants all
		// three to Manager/Admin only.
		{"manager reaches eol branch-ship", "/eol/branch-ship", managerToken, http.StatusOK},
		{"operator blocked from eol branch-ship", "/eol/branch-ship", operatorToken, http.StatusForbidden},
		{"manager reaches eol depot-release", "/eol/depot-release", managerToken, http.StatusOK},
		{"operator blocked from eol depot-release", "/eol/depot-release", operatorToken, http.StatusForbidden},
		{"manager reaches eol document-approve", "/eol/document-approve", managerToken, http.StatusOK},
		{"operator blocked from eol document-approve", "/eol/document-approve", operatorToken, http.StatusForbidden},

		// A role with no rows in role_permissions is denied everywhere.
		{"unpermissioned role blocked from vehicles", "/vehicles", strangerToken, http.StatusForbidden},
		{"unpermissioned role blocked from mttr", "/analysis/mttr", strangerToken, http.StatusForbidden},

		{"missing token is unauthorized", "/vehicles", "", http.StatusUnauthorized},
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

// TestRequirePermissionCachesLookupPerRequest proves the permission set is
// resolved once per request even when several gates are stacked, so adding
// middleware does not multiply queries.
func TestRequirePermissionCachesLookupPerRequest(t *testing.T) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	roles := newFakeRoleRepo()
	r := newPermissionRouter(issuer, roles)

	req := httptest.NewRequest(http.MethodGet, "/stacked", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want %d", rec.Code, http.StatusOK)
	}
	if roles.calls != 1 {
		t.Errorf("permission lookups = %d, want 1 per request", roles.calls)
	}
}

// TestPermissionsAreNotReadFromTheToken proves a forged role_code cannot grant
// access: authorization always re-reads the permission table.
func TestPermissionsAreNotReadFromTheToken(t *testing.T) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	// A genuine operator token that claims the manager role code.
	token, err := issuer.Issue(operatorUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	r := newPermissionRouter(issuer, newFakeRoleRepo())

	req := httptest.NewRequest(http.MethodGet, "/analysis/mttr", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("got status %d, want %d", rec.Code, http.StatusForbidden)
	}
}
