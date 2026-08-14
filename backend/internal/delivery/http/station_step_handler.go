package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

type stationStepRequest struct {
	Status string `json:"status"`
}

// handleRecordStationStep records a single station step result. Soft-warning
// semantics apply: a NOT_OK result is accepted and never blocks later stations.
func (s *server) handleRecordStationStep(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	stationStepID, err := strconv.Atoi(chi.URLParam(r, "stationStepId"))
	if err != nil {
		badRequest(w, "stationStepId must be an integer")
		return
	}

	var req stationStepRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	status := domain.StationStepStatus(req.Status)
	if !status.Valid() {
		badRequest(w, "invalid station step status")
		return
	}

	claims, _ := ClaimsFromContext(r.Context())
	out, err := s.deps.StationSteps.Record(r.Context(), usecase.RecordStationStepInput{
		VIN:           vin,
		StationStepID: stationStepID,
		Status:        status,
		CheckedBy:     claims.UserID,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
