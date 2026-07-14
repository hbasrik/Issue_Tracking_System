package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

type createIssueRequest struct {
	VIN                string `json:"vin"`
	SourceType         string `json:"source_type"`
	SourceCheckpointID *int   `json:"source_checkpoint_id"`
	SourceCheckItemID  *int   `json:"source_check_item_id"`
	StationID          *int   `json:"station_id"`
	IssueTypeID        *int   `json:"issue_type_id"`
	Severity           string `json:"severity"`
	Description        string `json:"description"`
	PictureURL         string `json:"picture_url"`
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
		VIN:                req.VIN,
		SourceType:         domain.IssueSource(req.SourceType),
		SourceCheckpointID: req.SourceCheckpointID,
		SourceCheckItemID:  req.SourceCheckItemID,
		StationID:          req.StationID,
		IssueTypeID:        req.IssueTypeID,
		Severity:           domain.IssueSeverity(req.Severity),
		Description:        req.Description,
		PictureURL:         req.PictureURL,
		ReporterID:         claims.UserID,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, issue)
}

// handleIssueList returns issues where the authenticated user is a reporter.
func (s *server) handleIssueList(w http.ResponseWriter, r *http.Request) {
	var status *domain.IssueStatus
	if raw := r.URL.Query().Get("status"); raw != "" {
		s := domain.IssueStatus(raw)
		if !s.Valid() {
			badRequest(w, "invalid status filter")
			return
		}
		status = &s
	}

	claims, _ := ClaimsFromContext(r.Context())
	items, err := s.deps.Issues.ListForUser(r.Context(), claims.UserID, status)
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
// -> APPROVED lifecycle. Role rules are enforced in the usecase: OPERATOR may
// report/finish (up to DONE), only MANAGER_ADMIN may APPROVE. Illegal
// transitions return 409; a role that is not permitted returns 403.
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
	if err := s.deps.Issues.TransitionStatus(r.Context(), id, target, claims.UserID, claims.Role); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": target})
}
