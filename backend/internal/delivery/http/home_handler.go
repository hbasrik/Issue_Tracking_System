package http

import "net/http"

// handleHomeOverview serves the dashboard slices that cannot be derived from
// the issue list (EOL funnel, checklist completion, activity).
func (s *server) handleHomeOverview(w http.ResponseWriter, r *http.Request) {
	if s.deps.Home == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"EOLStages":        []any{},
			"EOLChecklist":     []any{},
			"CriticalVehicles": []any{},
			"Activity":         []any{},
		})
		return
	}
	out, err := s.deps.Home.Overview(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
