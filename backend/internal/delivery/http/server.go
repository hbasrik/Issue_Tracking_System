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
	"github.com/karea/backend/internal/usecase"
)

// Deps holds the collaborators the HTTP layer delegates to.
type Deps struct {
	Issuer      *auth.Issuer
	Auth        *usecase.Authenticator
	Vehicles    *usecase.VehicleService
	Checkpoints *usecase.CheckpointResultRecorder
	Checklists  *usecase.ChecklistResultRecorder
	Issues      *usecase.IssueManager
	Analysis    *usecase.AnalysisMetricsReader
}

type server struct {
	deps Deps
}

// NewRouter builds the fully-wired HTTP handler with routing, RBAC middleware,
// and the route→usecase mapping inferred from the UI/UX page hierarchy
// (07_KAREA_UIUX_Tasarim_Rehberi.md Section 2).
func NewRouter(deps Deps) http.Handler {
	s := &server{deps: deps}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		// Public: authentication.
		r.Post("/auth/login", s.handleLogin)

		// Authenticated routes.
		r.Group(func(r chi.Router) {
			r.Use(RequireAuth(deps.Issuer))

			// Both roles.
			r.Get("/vehicles/search", s.handleVehicleSearch)
			r.Get("/vehicles/{vin}", s.handleVehicleGet)
			// Issue lifecycle: route is open to both roles; the DONE->APPROVED
			// (manager-only) rule is enforced in the usecase layer.
			r.Patch("/issues/{id}/status", s.handleIssueStatus)

			// Manager/Admin only (web dashboard).
			r.Group(func(r chi.Router) {
				r.Use(RequireRole(domain.UserRoleManagerAdmin))
				r.Get("/vehicles", s.handleVehicleList)
				r.Patch("/vehicles/{vin}/status", s.handleVehicleStatus)
				r.Get("/analysis/daily-pending-issues", s.handleDailyPendingIssues)
				r.Get("/analysis/vehicle-severity-breakdown", s.handleVehicleSeverityBreakdown)
				r.Get("/analysis/defect-rate-per-station", s.handleDefectRatePerStation)
				r.Get("/analysis/mttr", s.handleMTTR)
			})

			// Operator only (mobile field app).
			r.Group(func(r chi.Router) {
				r.Use(RequireRole(domain.UserRoleOperator))
				r.Post("/vehicles/{vin}/checkpoints/{checkpointId}", s.handleRecordCheckpoint)
				r.Post("/vehicles/{vin}/checklist/{type}/{itemId}", s.handleRecordChecklist)
				r.Post("/issues", s.handleCreateIssue)
			})
		})
	})

	return r
}
