package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

type createTemplateItemRequest struct {
	ItemText string  `json:"ItemText"`
	EolPhase *string `json:"EolPhase"`
}

type updateTemplateItemRequest struct {
	ItemText *string `json:"ItemText"`
	EolPhase *string `json:"EolPhase"`
	IsActive *bool   `json:"IsActive"`
}

type reorderTemplateItemsRequest struct {
	ItemIDs []int `json:"ItemIDs"`
}

// handleChecklistTemplateItemCreate appends an active catalogue item.
func (s *server) handleChecklistTemplateItemCreate(w http.ResponseWriter, r *http.Request) {
	if s.deps.Checklists == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	templateID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || templateID < 1 {
		badRequest(w, "id must be a positive integer")
		return
	}
	var req createTemplateItemRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	phase, err := parseOptionalEOLPhase(req.EolPhase)
	if err != nil {
		writeError(w, err)
		return
	}
	item, err := s.deps.Checklists.CreateTemplateItem(r.Context(), usecase.CreateTemplateItemInput{
		TemplateID: templateID,
		ItemText:   req.ItemText,
		EolPhase:   phase,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

// handleChecklistTemplateItemUpdate patches text, eol_phase and/or is_active.
func (s *server) handleChecklistTemplateItemUpdate(w http.ResponseWriter, r *http.Request) {
	if s.deps.Checklists == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	templateID, itemID, ok := parseTemplateItemIDs(w, r)
	if !ok {
		return
	}
	var req updateTemplateItemRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if req.ItemText == nil && req.EolPhase == nil && req.IsActive == nil {
		badRequest(w, "ItemText, EolPhase or IsActive is required")
		return
	}
	phase, err := parseOptionalEOLPhase(req.EolPhase)
	if err != nil {
		writeError(w, err)
		return
	}
	item, err := s.deps.Checklists.UpdateTemplateItem(r.Context(), usecase.UpdateTemplateItemInput{
		TemplateID: templateID,
		ItemID:     itemID,
		ItemText:   req.ItemText,
		EolPhase:   phase,
		IsActive:   req.IsActive,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// handleChecklistTemplateItemDelete hard-deletes only when unused.
func (s *server) handleChecklistTemplateItemDelete(w http.ResponseWriter, r *http.Request) {
	if s.deps.Checklists == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	templateID, itemID, ok := parseTemplateItemIDs(w, r)
	if !ok {
		return
	}
	if err := s.deps.Checklists.DeleteTemplateItem(r.Context(), templateID, itemID); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// handleChecklistTemplateItemReorder sets item_no from the given id list.
func (s *server) handleChecklistTemplateItemReorder(w http.ResponseWriter, r *http.Request) {
	if s.deps.Checklists == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	templateID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || templateID < 1 {
		badRequest(w, "id must be a positive integer")
		return
	}
	var req reorderTemplateItemsRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.Checklists.ReorderTemplateItems(r.Context(), templateID, req.ItemIDs); err != nil {
		writeError(w, err)
		return
	}
	items, err := s.deps.Checklists.ListTemplateItems(r.Context(), templateID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func parseTemplateItemIDs(w http.ResponseWriter, r *http.Request) (templateID, itemID int, ok bool) {
	var err error
	templateID, err = strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || templateID < 1 {
		badRequest(w, "id must be a positive integer")
		return 0, 0, false
	}
	itemID, err = strconv.Atoi(chi.URLParam(r, "itemId"))
	if err != nil || itemID < 1 {
		badRequest(w, "itemId must be a positive integer")
		return 0, 0, false
	}
	return templateID, itemID, true
}

func parseOptionalEOLPhase(raw *string) (*domain.EOLItemPhase, error) {
	if raw == nil {
		return nil, nil
	}
	s := strings.TrimSpace(*raw)
	if s == "" {
		return nil, nil
	}
	p := domain.EOLItemPhase(strings.ToUpper(s))
	if !p.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	return &p, nil
}
