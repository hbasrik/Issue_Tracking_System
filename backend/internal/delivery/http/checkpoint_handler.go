package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

type checkpointRequest struct {
	Status string `json:"status"`
}

// handleRecordCheckpoint records a single phase checkpoint result (Operator
// only). Soft-warning semantics apply: a NOT_OK result is accepted and never
// blocks later phases.
func (s *server) handleRecordCheckpoint(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	checkpointID, err := strconv.Atoi(chi.URLParam(r, "checkpointId"))
	if err != nil {
		badRequest(w, "checkpointId must be an integer")
		return
	}

	var req checkpointRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	status := domain.CheckpointStatus(req.Status)
	if !status.Valid() {
		badRequest(w, "invalid checkpoint status")
		return
	}

	claims, _ := ClaimsFromContext(r.Context())
	out, err := s.deps.Checkpoints.Record(r.Context(), usecase.RecordCheckpointInput{
		VIN:          vin,
		CheckpointID: checkpointID,
		Status:       status,
		CheckedBy:    claims.UserID,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
