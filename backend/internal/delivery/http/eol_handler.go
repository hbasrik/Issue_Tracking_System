package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// handleEOLBranchShip performs EOL stage 1. Open issues produce a warning in
// the 200 body rather than an error: branch shipment is a soft-warning gate
// (Karar 2).
func (s *server) handleEOLBranchShip(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	claims, _ := ClaimsFromContext(r.Context())

	out, err := s.deps.EOLBranchShip.Ship(r.Context(), vin, claims.UserID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// handleEOLDepotRelease performs EOL stage 2. This is the hard-block gate: if
// any issue is still open the response is 409 listing the blocking issues.
func (s *server) handleEOLDepotRelease(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	claims, _ := ClaimsFromContext(r.Context())

	out, err := s.deps.EOLDepotRelease.Release(r.Context(), vin, claims.UserID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// handleEOLDocumentApprove performs EOL stage 3, completing the workflow and
// moving the vehicle to SHIPPED.
func (s *server) handleEOLDocumentApprove(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	claims, _ := ClaimsFromContext(r.Context())

	out, err := s.deps.EOLDocumentApprove.Approve(r.Context(), vin, claims.UserID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// handleEOLWorkflowGet serves the Vehicle Detail EoL tab: the current stage
// plus each stage's timestamp and actor.
func (s *server) handleEOLWorkflowGet(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")

	view, err := s.deps.EOLWorkflow.Get(r.Context(), vin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}
