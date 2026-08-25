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

// handleRecordChecklist records a checklist item result. The URL type
// segment (eol|shipment|test) selects which checklist.*.edit permission is
// required. The mandatory-description rule (FR-3.3) applies to EoL items
// only (400). Test and Shipment are Yes/No with no note. Depot-phase EoL
// updates return 409 until every Branch-phase item is OK/CONDITIONAL_OK.
// Hard-block semantics apply to the two gated types: a requested gate exit
// with any non-passing item returns 409 with the blocking item IDs. The
// Test checklist has no gate, so a gate exit requested against it is
// rejected rather than silently ignored.
func (s *server) handleRecordChecklist(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")

	checklistType, ok := parseChecklistType(chi.URLParam(r, "type"))
	if !ok {
		badRequest(w, "type must be one of: eol, shipment, test")
		return
	}
	if !s.requireCode(w, r, domain.ChecklistEditPermission(checklistType)) {
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

// handleChecklistTemplateList serves the /templates admin page: every
// checklist template with a live count of its active items
// (admin.manage_masters). The v1 page hardcoded EOL=13 / SHIPMENT=43
// and omitted TEST; this is the live replacement.
func (s *server) handleChecklistTemplateList(w http.ResponseWriter, r *http.Request) {
	if s.deps.Checklists == nil {
		writeJSON(w, http.StatusOK, map[string]any{"items": []domain.ChecklistTemplateSummary{}})
		return
	}
	items, err := s.deps.Checklists.ListTemplates(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleChecklistTemplateItems returns the active items of one template for
// the editor pane on /templates.
func (s *server) handleChecklistTemplateItems(w http.ResponseWriter, r *http.Request) {
	if s.deps.Checklists == nil {
		writeJSON(w, http.StatusOK, map[string]any{"items": []domain.ChecklistTemplateItem{}})
		return
	}
	templateID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	items, err := s.deps.Checklists.ListTemplateItems(r.Context(), templateID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// parseChecklistType maps the URL segment (eol|shipment|test) to the domain
// enum.
func parseChecklistType(raw string) (domain.ChecklistType, bool) {
	switch strings.ToLower(raw) {
	case "eol":
		return domain.ChecklistTypeEOL, true
	case "shipment":
		return domain.ChecklistTypeShipment, true
	case "test":
		return domain.ChecklistTypeTest, true
	default:
		return "", false
	}
}
