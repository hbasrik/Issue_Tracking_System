package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/karea/backend/internal/domain"
)

// handleAuditActivity lists plant-wide audit_logs for the Hareketler page.
// Gated by analysis.view — same operational analytics surface as Analysis.
func (s *server) handleAuditActivity(w http.ResponseWriter, r *http.Request) {
	if s.deps.Activity == nil {
		writeJSON(w, http.StatusOK, domain.AuditActivityPage{Items: []domain.HomeActivityEntry{}})
		return
	}
	q := r.URL.Query()
	f := domain.AuditActivityFilter{
		EventType:  q.Get("event_type"),
		VINSuffix:  q.Get("vin_suffix"),
		ActorQuery: q.Get("actor"),
	}
	if v := q.Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			f.From = &t
		}
	}
	if v := q.Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			f.To = &t
		}
	}
	if v := q.Get("actor_id"); v != "" {
		if id, err := strconv.Atoi(v); err == nil {
			f.ActorID = &id
		}
	}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Offset = n
		}
	}
	page, err := s.deps.Activity.List(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}
