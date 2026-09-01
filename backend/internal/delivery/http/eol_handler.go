package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
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

// handleEOLDepotRelease performs EOL stage 2: hard-block on open issues and
// depot EoL items, then completes the workflow while the vehicle stays
// IN_WAREHOUSE.
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

// handleEOLDeliver marks the vehicle delivered after depot release.
func (s *server) handleEOLDeliver(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	claims, _ := ClaimsFromContext(r.Context())

	out, err := s.deps.EOLDeliver.Deliver(r.Context(), vin, claims.UserID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// handleEOLDocumentApprove is the unused leftover of the document stage.
// UI no longer calls it; depot release is what ships the vehicle.
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
	if !s.requireCode(w, r, domain.PermissionChecklistEOLView) {
		return
	}
	vin := chi.URLParam(r, "vin")

	view, err := s.deps.EOLWorkflow.Get(r.Context(), vin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// handleEOLWorkflowReset is the development-only rewind of the three-stage
// EoL workflow. requireDevelopment already 404'd non-development requests.
func (s *server) handleEOLWorkflowReset(w http.ResponseWriter, r *http.Request) {
	if s.deps.EOLReset == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	vin := chi.URLParam(r, "vin")
	claims, _ := ClaimsFromContext(r.Context())
	out, err := s.deps.EOLReset.Reset(r.Context(), vin, claims.UserID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
