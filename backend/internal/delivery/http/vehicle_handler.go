package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// handleVehicleList serves the filterable/paginated vehicle table (vehicle.view).
func (s *server) handleVehicleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := domain.VehicleListFilter{
		VINContains: q.Get("vin"),
	}

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
	if raw := q.Get("station"); raw != "" {
		stationID, err := strconv.Atoi(raw)
		if err != nil || stationID < 1 {
			badRequest(w, "station must be a positive integer id")
			return
		}
		filter.StationID = &stationID
	}
	if raw := q.Get("eol_stage"); raw != "" {
		stage := domain.EOLWorkflowStage(raw)
		if !stage.FilterValid() {
			badRequest(w, "invalid eol_stage filter")
			return
		}
		filter.EOLStage = &stage
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

	emptyWindow, ok := applyVehicleAnalysisStat(w, r, &filter)
	if !ok {
		return
	}
	if emptyWindow {
		writeJSON(w, http.StatusOK, &usecase.VehicleListResult{
			Items: []domain.Vehicle{},
			Total: 0,
			Page:  page,
			Size:  20,
		})
		return
	}

	result, err := s.deps.Vehicles.List(r.Context(), filter, page)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// applyVehicleAnalysisStat copies Analysis KPI card drill-down params onto
// the list filter. emptyWindow is true when the date intersection has no
// duration (return an empty page). ok is false when the request was already
// written as an error.
func applyVehicleAnalysisStat(w http.ResponseWriter, r *http.Request, filter *domain.VehicleListFilter) (emptyWindow bool, ok bool) {
	raw := r.URL.Query().Get("analysis_stat")
	if raw == "" {
		return false, true
	}
	stat := domain.VehicleAnalysisStat(raw)
	if !stat.Valid() || stat == "" {
		badRequest(w, "invalid analysis_stat")
		return false, false
	}
	filter.AnalysisStat = stat
	if stat == domain.VehicleAnalysisStatOnLine {
		return false, true
	}

	af, err := parseAnalysisFilter(r)
	if err != nil {
		badRequest(w, "invalid analysis filter")
		return false, false
	}

	today := domain.IstanbulDayStart(time.Now())
	todayEnd := today.Add(24 * time.Hour)
	switch stat {
	case domain.VehicleAnalysisStatShippedToday:
		from, until, empty := domain.IntersectWindow(af.From, af.To, today, todayEnd)
		if empty {
			return true, true
		}
		filter.WindowFrom, filter.WindowUntil = &from, &until
	case domain.VehicleAnalysisStatShippedWeek:
		weekStart := today.AddDate(0, 0, -6)
		from, until, empty := domain.IntersectWindow(af.From, af.To, weekStart, todayEnd)
		if empty {
			return true, true
		}
		filter.WindowFrom, filter.WindowUntil = &from, &until
	case domain.VehicleAnalysisStatDepotReleased:
		from, until := domain.InclusiveDateBounds(af.From, af.To)
		filter.WindowFrom, filter.WindowUntil = from, until
	}
	return false, true
}

// handleVehicleGet returns a single vehicle by VIN (vehicle.view).
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
// (vehicle.view).
func (s *server) handleVehicleSearch(w http.ResponseWriter, r *http.Request) {
	suffix := r.URL.Query().Get("vin_suffix")
	vehicles, err := s.deps.Vehicles.SearchByVINSuffix(r.Context(), suffix, 0)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": vehicles})
}

// handleVehicleStationSteps returns the station step catalogue with
// per-vehicle progress and open issue counts per station.
func (s *server) handleVehicleStationSteps(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	result, err := s.deps.StationSteps.ListForVehicle(r.Context(), vin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleVehicleStatusHistory lists STATUS_CHANGE audit rows for one vehicle,
// oldest first, with the acting user's name already joined.
func (s *server) handleVehicleStatusHistory(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	if s.deps.Vehicles == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	items, err := s.deps.Vehicles.ListStatusHistory(r.Context(), vin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleVehicleChecklistGet returns checklist items for eol, shipment, or
// test. vehicle.view gets the caller onto the vehicle; the matching
// checklist.*.view code is required on top so Quality can open Test without
// seeing Shipment/EoL.
func (s *server) handleVehicleChecklistGet(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	checklistType, ok := parseChecklistType(chi.URLParam(r, "type"))
	if !ok {
		badRequest(w, "type must be one of: eol, shipment, test")
		return
	}
	if !s.requireCode(w, r, domain.ChecklistViewPermission(checklistType)) {
		return
	}

	items, err := s.deps.Checklists.ListForVehicle(r.Context(), vin, checklistType)
	if err != nil {
		writeError(w, err)
		return
	}
	if items == nil {
		items = []domain.ChecklistItemView{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleShipmentReadiness returns the soft pre-shipment warning list.
func (s *server) handleShipmentReadiness(w http.ResponseWriter, r *http.Request) {
	if !s.requireCode(w, r, domain.PermissionChecklistShipmentView) {
		return
	}
	if s.deps.ShipmentReadiness == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	vin := chi.URLParam(r, "vin")
	ready, err := s.deps.ShipmentReadiness.ForVIN(r.Context(), vin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ready)
}

type vehicleStatusRequest struct {
	Status string `json:"status"`
}

// handleVehicleStatus performs a manual global status change
// (admin.manage_masters). It delegates to the hard-block-aware usecase, so a
// move to WITH_CUSTOMER/SHIPPED with an incomplete shipment checklist returns
// 409 with the blocking item IDs.
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

type vehicleBulkImportRequest struct {
	VINs []string `json:"vins"`
}

// handleVehicleBulkImport inserts VINs as PLANNED (Manager/Admin, Karar 10).
func (s *server) handleVehicleBulkImport(w http.ResponseWriter, r *http.Request) {
	var req vehicleBulkImportRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	result, err := s.deps.Vehicles.BulkImportPlanned(r.Context(), req.VINs)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
