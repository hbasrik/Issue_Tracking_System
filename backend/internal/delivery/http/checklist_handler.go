package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

type checklistRequest struct {
	Status          string `json:"status"`
	ReworkDesc      string `json:"rework_desc"`
	ConditionalDesc string `json:"conditional_desc"`
	RejectedDesc    string `json:"rejected_desc"`
	RequestGateExit bool   `json:"request_gate_exit"`
}

// handleRecordChecklist records an EoL/Shipment checklist item result (Operator
// only). The URL type segment is eol|shipment. Hard-block semantics apply: a
// requested gate exit with any non-passing item returns 409 with the blocking
// item IDs, and the mandatory-description rule (FR-3.3) is validated before
// persistence (returning 400).
func (s *server) handleRecordChecklist(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")

	checklistType, ok := parseChecklistType(chi.URLParam(r, "type"))
	if !ok {
		badRequest(w, "type must be one of: eol, shipment")
		return
	}

	itemID, err := strconv.Atoi(chi.URLParam(r, "itemId"))
	if err != nil {
		badRequest(w, "itemId must be an integer")
		return
	}

	var req checklistRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	status := domain.CheckStatus(req.Status)
	if !status.Valid() {
		badRequest(w, "invalid check status")
		return
	}

	claims, _ := ClaimsFromContext(r.Context())
	out, err := s.deps.Checklists.Record(r.Context(), usecase.RecordChecklistInput{
		VIN:             vin,
		ChecklistType:   checklistType,
		ItemID:          itemID,
		Status:          status,
		CheckerID:       claims.UserID,
		ReworkDesc:      req.ReworkDesc,
		ConditionalDesc: req.ConditionalDesc,
		RejectedDesc:    req.RejectedDesc,
		RequestGateExit: req.RequestGateExit,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// parseChecklistType maps the URL segment (eol|shipment) to the domain enum.
func parseChecklistType(raw string) (domain.ChecklistType, bool) {
	switch strings.ToLower(raw) {
	case "eol":
		return domain.ChecklistTypeEOL, true
	case "shipment":
		return domain.ChecklistTypeShipment, true
	default:
		return "", false
	}
}
