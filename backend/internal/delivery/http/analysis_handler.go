package http

import (
	"net/http"
	"time"

	"github.com/karea/backend/internal/domain"
)

// parseAnalysisFilter reads the shared Analysis-tab query params (from, to,
// vin_suffix) into a domain.AnalysisFilter. Dates accept "2006-01-02" or
// RFC3339.
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

// handleDailyPendingIssues serves the Daily Pending Issues trend.
func (s *server) handleDailyPendingIssues(w http.ResponseWriter, r *http.Request) {
	f, err := parseAnalysisFilter(r)
	if err != nil {
		badRequest(w, "invalid date range")
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
	f, err := parseAnalysisFilter(r)
	if err != nil {
		badRequest(w, "invalid date range")
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
	f, err := parseAnalysisFilter(r)
	if err != nil {
		badRequest(w, "invalid date range")
		return
	}
	items, err := s.deps.Analysis.DefectRatePerStation(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleMTTR serves the mean-time-to-resolve per station.
func (s *server) handleMTTR(w http.ResponseWriter, r *http.Request) {
	f, err := parseAnalysisFilter(r)
	if err != nil {
		badRequest(w, "invalid date range")
		return
	}
	items, err := s.deps.Analysis.MTTRPerStation(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
