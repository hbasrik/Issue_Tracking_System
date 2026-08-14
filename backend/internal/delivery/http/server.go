// Package http exposes the REST API: routing, middleware, and request/response
// adapters over the usecase layer.
//
// Router: chi (github.com/go-chi/chi/v5). chi is chosen over gin because it is
// a thin layer over the standard net/http interfaces (handlers are plain
// http.HandlerFunc and middleware is func(http.Handler) http.Handler), which
// keeps the delivery layer dependency-light and lets the same middleware and
// handlers be tested with net/http/httptest without a framework context object.
package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

// Deps holds the collaborators the HTTP layer delegates to.
type Deps struct {
	Issuer             *auth.Issuer
	Auth               *usecase.Authenticator
	Roles              repository.RoleRepository
	Vehicles           *usecase.VehicleService
	StationSteps       *usecase.StationStepResultRecorder
	Checklists         *usecase.ChecklistResultRecorder
	Issues             *usecase.IssueManager
	Stations           *usecase.StationService
	Analysis           *usecase.AnalysisMetricsReader
	EOLWorkflow        *usecase.EOLWorkflowReader
	EOLBranchShip      *usecase.EOLBranchShipper
	EOLDepotRelease    *usecase.EOLDepotReleaser
	EOLDocumentApprove *usecase.EOLDocumentApprover
	CORSAllowedOrigins []string
}

type server struct {
	deps        Deps
	permissions *PermissionChecker
}

// NewRouter builds the fully-wired HTTP handler with routing, RBAC middleware,
// and the route→usecase mapping inferred from the UI/UX page hierarchy
// (07_KAREA_UIUX_Tasarim_Rehberi.md Section 2).
func NewRouter(deps Deps) http.Handler {
	permissions := NewPermissionChecker(deps.Roles)
	s := &server{deps: deps, permissions: permissions}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(CORS(deps.CORSAllowedOrigins))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		// Public: authentication.
		r.Post("/auth/login", s.handleLogin)

		// Authenticated routes. Every gate below is a permission code, never a
		// role code, so extending the role matrix is a role_permissions insert
		// rather than a routing change (Karar 3).
		r.Group(func(r chi.Router) {
			r.Use(RequireAuth(deps.Issuer))

			// Read access. Both seeded roles hold vehicle.view.
			r.Group(func(r chi.Router) {
				r.Use(permissions.RequirePermission(domain.PermissionVehicleView))
				r.Get("/vehicles", s.handleVehicleList)
				r.Get("/vehicles/search", s.handleVehicleSearch)
				r.Get("/vehicles/{vin}", s.handleVehicleGet)
				r.Get("/vehicles/{vin}/station-steps", s.handleVehicleStationSteps)
				r.Get("/vehicles/{vin}/checklist/{type}", s.handleVehicleChecklistGet)
				r.Get("/vehicles/{vin}/eol", s.handleEOLWorkflowGet)
				r.Get("/issues", s.handleIssueList)
				r.Get("/issues/{id}", s.handleIssueGet)
				r.Get("/stations", s.handleStationList)
				// Operator read visibility into current problem status
				// (Decision Log #9). These are gated on vehicle.view, not
				// analysis.view, because analysis.view is the Manager/Admin-only
				// filtered Analysis tool permission.
				r.Get("/analysis/vehicle-severity-breakdown", s.handleVehicleSeverityBreakdown)
				r.Get("/analysis/defect-rate-per-station", s.handleDefectRatePerStation)
			})

			// Issue lifecycle. One route serves every transition, so the
			// specific issue.transition.* permission is checked in the usecase
			// against the target status rather than here.
			r.Patch("/issues/{id}/status", s.handleIssueStatus)

			// Filtered Analysis tool.
			r.Group(func(r chi.Router) {
				r.Use(permissions.RequirePermission(domain.PermissionAnalysisView))
				r.Get("/analysis/daily-pending-issues", s.handleDailyPendingIssues)
				r.Get("/analysis/mttr", s.handleMTTR)
			})

			// Manual override of a vehicle's global status is an administrative
			// action.
			r.Group(func(r chi.Router) {
				r.Use(permissions.RequirePermission(domain.PermissionAdminManageMasters))
				r.Patch("/vehicles/{vin}/status", s.handleVehicleStatus)
			})

			// Shop-floor writes.
			r.With(permissions.RequirePermission(domain.PermissionStationStepUpdate)).
				Post("/vehicles/{vin}/station-steps/{stationStepId}", s.handleRecordStationStep)
			r.With(permissions.RequirePermission(domain.PermissionChecklistItemUpdate)).
				Post("/vehicles/{vin}/checklist/{type}/{itemId}", s.handleRecordChecklist)
			r.With(permissions.RequirePermission(domain.PermissionIssueCreate)).
				Post("/issues", s.handleCreateIssue)

			// EOL workflow (Karar 2). Each stage has its own permission so the
			// three sign-offs can be delegated to different roles as the v2
			// role matrix grows.
			r.With(permissions.RequirePermission(domain.PermissionEOLBranchShip)).
				Post("/vehicles/{vin}/eol/branch-ship", s.handleEOLBranchShip)
			r.With(permissions.RequirePermission(domain.PermissionEOLDepotRelease)).
				Post("/vehicles/{vin}/eol/depot-release", s.handleEOLDepotRelease)
			r.With(permissions.RequirePermission(domain.PermissionEOLDocumentApprove)).
				Post("/vehicles/{vin}/eol/document-approve", s.handleEOLDocumentApprove)
		})
	})

	return r
}
