package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/karea/backend/internal/domain"
)

// parseAnalysisFilter reads the shared Analysis-tab query params into a
// domain.AnalysisFilter. Dates accept "2006-01-02" or RFC3339; the To date is
// inclusive of that calendar day.
func parseAnalysisFilter(r *http.Request) (domain.AnalysisFilter, error) {
	q := r.URL.Query()
	var f domain.AnalysisFilter

	from, err := parseDateParam(q.Get("from"))
	if err != nil {
		return f, err
	}
	to, err := parseDateParam(q.Get("to"))
	if err != nil {
		return f, err
	}
	f.From = from
	f.To = to
	f.VINSuffix = q.Get("vin_suffix")
	f.IssueType = q.Get("issue_type")

	if raw := q.Get("station"); raw != "" {
		id, err := strconv.Atoi(raw)
		if err != nil {
			return f, err
		}
		f.StationID = &id
	}
	if raw := q.Get("status"); raw != "" {
		st := domain.VehicleStatus(raw)
		if !st.Valid() {
			return f, domain.ErrInvalidEnumValue
		}
		f.VehicleStatus = &st
	}
	return f, nil
}

func parseDateParam(raw string) (*time.Time, error) {
	if raw == "" {
		return nil, nil
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		return &t, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *server) withAnalysisFilter(w http.ResponseWriter, r *http.Request) (domain.AnalysisFilter, bool) {
	f, err := parseAnalysisFilter(r)
	if err != nil {
		badRequest(w, "invalid analysis filter")
		return f, false
	}
	return f, true
}

// handleAnalysisDashboard serves every Analysis-tab series under one filter.
func (s *server) handleAnalysisDashboard(w http.ResponseWriter, r *http.Request) {
	f, ok := s.withAnalysisFilter(w, r)
	if !ok {
		return
	}
	dash, err := s.deps.Analysis.Dashboard(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dash)
}

// handleDailyPendingIssues serves the Daily Pending Issues trend.
func (s *server) handleDailyPendingIssues(w http.ResponseWriter, r *http.Request) {
	f, ok := s.withAnalysisFilter(w, r)
	if !ok {
		return
	}
	items, err := s.deps.Analysis.DailyPendingIssues(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleVehicleSeverityBreakdown serves the per-vehicle open-issue severity split.
func (s *server) handleVehicleSeverityBreakdown(w http.ResponseWriter, r *http.Request) {
	f, ok := s.withAnalysisFilter(w, r)
	if !ok {
		return
	}
	items, err := s.deps.Analysis.VehicleSeverityBreakdown(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleDefectRatePerStation serves the per-station defect distribution.
func (s *server) handleDefectRatePerStation(w http.ResponseWriter, r *http.Request) {
	f, ok := s.withAnalysisFilter(w, r)
	if !ok {
		return
	}
	items, err := s.deps.Analysis.DefectRatePerStation(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleMTTR serves the mean-time-to-resolve per station (IN_PROGRESS → DONE).
func (s *server) handleMTTR(w http.ResponseWriter, r *http.Request) {
	f, ok := s.withAnalysisFilter(w, r)
	if !ok {
		return
	}
	items, err := s.deps.Analysis.MTTRPerStation(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
