package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
)

// handleVehicleList serves the filterable/paginated vehicle table
// (Manager/Admin only).
func (s *server) handleVehicleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := domain.VehicleListFilter{VINContains: q.Get("vin")}

	if raw := q.Get("status"); raw != "" {
		status := domain.VehicleStatus(raw)
		if !status.Valid() {
			badRequest(w, "invalid status filter")
			return
		}
		filter.Status = &status
	}
	if raw := q.Get("model"); raw != "" {
		modelID, err := strconv.Atoi(raw)
		if err != nil {
			badRequest(w, "model must be an integer id")
			return
		}
		filter.ModelID = &modelID
	}

	page := 1
	if raw := q.Get("page"); raw != "" {
		p, err := strconv.Atoi(raw)
		if err != nil || p < 1 {
			badRequest(w, "page must be a positive integer")
			return
		}
		page = p
	}

	result, err := s.deps.Vehicles.List(r.Context(), filter, page)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleVehicleGet returns a single vehicle by VIN (both roles).
func (s *server) handleVehicleGet(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	vehicle, err := s.deps.Vehicles.GetByVIN(r.Context(), vin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, vehicle)
}

// handleVehicleSearch performs partial VIN lookup via the trigram index
// (both roles).
func (s *server) handleVehicleSearch(w http.ResponseWriter, r *http.Request) {
	suffix := r.URL.Query().Get("vin_suffix")
	vehicles, err := s.deps.Vehicles.SearchByVINSuffix(r.Context(), suffix, 0)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": vehicles})
}

type vehicleStatusRequest struct {
	Status string `json:"status"`
}

// handleVehicleStatus performs a manual global status change (Manager/Admin
// only). It delegates to the hard-block-aware usecase, so a move to
// WITH_CUSTOMER/SHIPPED with an incomplete shipment checklist returns 409 with
// the blocking item IDs.
func (s *server) handleVehicleStatus(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")

	var req vehicleStatusRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	target := domain.VehicleStatus(req.Status)
	if !target.Valid() {
		badRequest(w, "invalid target status")
		return
	}

	claims, _ := ClaimsFromContext(r.Context())
	vehicle, err := s.deps.Vehicles.ChangeStatus(r.Context(), vin, target, claims.UserID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, vehicle)
}
