package http

import (
	"net/http"

	"github.com/karea/backend/internal/domain"
)

// handleStationList returns all stations (both roles).
func (s *server) handleStationList(w http.ResponseWriter, r *http.Request) {
	stations, err := s.deps.Stations.List(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if stations == nil {
		stations = []domain.Station{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": stations})
}
