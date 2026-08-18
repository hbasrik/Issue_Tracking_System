package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

type createIssueRequest struct {
	VIN                 string `json:"vin"`
	SourceType          string `json:"source_type"`
	SourceStationStepID *int   `json:"source_station_step_id"`
	SourceCheckItemID   *int   `json:"source_check_item_id"`
	StationID           *int   `json:"station_id"`
	IssueTypeID         *int   `json:"issue_type_id"`
	Severity            string `json:"severity"`
	Description         string `json:"description"`
	PictureURL          string `json:"picture_url"`
}

// handleCreateIssue creates a new issue (Operator only). Severity is mandatory
// (Decision Log #7); a missing severity is rejected with 400.
func (s *server) handleCreateIssue(w http.ResponseWriter, r *http.Request) {
	var req createIssueRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}

	claims, _ := ClaimsFromContext(r.Context())
	issue, err := s.deps.Issues.Create(r.Context(), usecase.CreateIssueInput{
		VIN:                 req.VIN,
		SourceType:          domain.IssueSource(req.SourceType),
		SourceStationStepID: req.SourceStationStepID,
		SourceCheckItemID:   req.SourceCheckItemID,
		StationID:           req.StationID,
		IssueTypeID:         req.IssueTypeID,
		Severity:            domain.IssueSeverity(req.Severity),
		Description:         req.Description,
		PictureURL:          req.PictureURL,
		ReporterID:          claims.UserID,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, issue)
}

// handleIssueTypeList returns the issue_types catalogue (Hata / Tamir Gerekiyor).
func (s *server) handleIssueTypeList(w http.ResponseWriter, r *http.Request) {
	items, err := s.deps.Issues.ListIssueTypes(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if items == nil {
		items = []domain.IssueType{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleIssueList returns issues for the issues queue / vehicle detail.
//
// Scope:
//   - ?vin=… → every issue for that vehicle (any authenticated vehicle.view user)
//   - no vin + analysis.view → global queue (Manager/Admin dashboard)
//   - no vin without analysis.view → reporter-scoped list (operator "My Issues")
func (s *server) handleIssueList(w http.ResponseWriter, r *http.Request) {
	var status *domain.IssueStatus
	if raw := r.URL.Query().Get("status"); raw != "" {
		st := domain.IssueStatus(raw)
		if !st.Valid() {
			badRequest(w, "invalid status filter")
			return
		}
		status = &st
	}

	vin := strings.TrimSpace(r.URL.Query().Get("vin"))
	claims, _ := ClaimsFromContext(r.Context())

	var (
		items []domain.Issue
		err   error
	)
	switch {
	case vin != "":
		items, err = s.deps.Issues.ListByVIN(r.Context(), vin, status)
	default:
		ctx, permissions, perr := s.permissions.Resolve(r.Context())
		if perr != nil {
			writeError(w, perr)
			return
		}
		if permissions.Has(domain.PermissionAnalysisView) {
			items, err = s.deps.Issues.ListAll(ctx, status)
		} else {
			items, err = s.deps.Issues.ListForUser(ctx, claims.UserID, status)
		}
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if items == nil {
		items = []domain.Issue{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleIssueGet returns a single issue by id (any authenticated user).
func (s *server) handleIssueGet(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}

	issue, err := s.deps.Issues.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, issue)
}

type issueStatusRequest struct {
	Status string `json:"status"`
}

// handleIssueStatus advances an issue through the OPEN -> IN_PROGRESS -> DONE
// lifecycle and on to one of the two terminal quality decisions, APPROVED or
// CONDITIONAL_APPROVED (Karar 6). The required issue.transition.* permission
// depends on the target status, so it is enforced in the usecase rather than
// in routing. Illegal transitions — including any attempt to move an issue
// that already carries a quality decision — return 409; a missing permission
// returns 403.
func (s *server) handleIssueStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}

	var req issueStatusRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	target := domain.IssueStatus(req.Status)
	if !target.Valid() {
		badRequest(w, "invalid issue status")
		return
	}

	claims, _ := ClaimsFromContext(r.Context())
	ctx, permissions, err := s.permissions.Resolve(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if err := s.deps.Issues.TransitionStatus(ctx, id, target, claims.UserID, permissions); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": target})
}
