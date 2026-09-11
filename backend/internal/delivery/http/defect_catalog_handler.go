package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/usecase"
)

type defectCatalogueBody struct {
	Code             string `json:"code"`
	NameTR           string `json:"name_tr"`
	NameEN           string `json:"name_en"`
	SortOrder        int    `json:"sort_order"`
	IsActive         *bool  `json:"is_active"`
	ZoneID           int    `json:"zone_id"`
	DefaultProcessID *int   `json:"default_process_id"`
}

type reorderIDsBody struct {
	IDs []int `json:"ids"`
}

func (b defectCatalogueBody) activeOrTrue() bool {
	if b.IsActive == nil {
		return true
	}
	return *b.IsActive
}

func parseIDParam(r *http.Request, name string) (int, error) {
	return strconv.Atoi(chi.URLParam(r, name))
}

// --- Processes ---

func (s *server) handleDefectProcessList(w http.ResponseWriter, r *http.Request) {
	items, err := s.deps.DefectCatalog.ListProcesses(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *server) handleDefectProcessCreate(w http.ResponseWriter, r *http.Request) {
	var req defectCatalogueBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	item, err := s.deps.DefectCatalog.CreateProcess(r.Context(), usecase.UpsertProcessInput{
		Code: req.Code, NameTR: req.NameTR, NameEN: req.NameEN, SortOrder: req.SortOrder, IsActive: req.activeOrTrue(),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *server) handleDefectProcessUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	var req defectCatalogueBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.DefectCatalog.UpdateProcess(r.Context(), id, usecase.UpsertProcessInput{
		Code: req.Code, NameTR: req.NameTR, NameEN: req.NameEN, SortOrder: req.SortOrder, IsActive: req.activeOrTrue(),
	}); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id})
}

func (s *server) handleDefectProcessDelete(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	if err := s.deps.DefectCatalog.DeleteProcess(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleDefectProcessReorder(w http.ResponseWriter, r *http.Request) {
	var req reorderIDsBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.DefectCatalog.ReorderProcesses(r.Context(), req.IDs); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// --- Zones ---

func (s *server) handleDefectZoneList(w http.ResponseWriter, r *http.Request) {
	items, err := s.deps.DefectCatalog.ListZones(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *server) handleDefectZoneCreate(w http.ResponseWriter, r *http.Request) {
	var req defectCatalogueBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	item, err := s.deps.DefectCatalog.CreateZone(r.Context(), usecase.UpsertZoneInput{
		Code: req.Code, NameTR: req.NameTR, NameEN: req.NameEN, SortOrder: req.SortOrder, IsActive: req.activeOrTrue(),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *server) handleDefectZoneUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	var req defectCatalogueBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.DefectCatalog.UpdateZone(r.Context(), id, usecase.UpsertZoneInput{
		Code: req.Code, NameTR: req.NameTR, NameEN: req.NameEN, SortOrder: req.SortOrder, IsActive: req.activeOrTrue(),
	}); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id})
}

func (s *server) handleDefectZoneDelete(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	if err := s.deps.DefectCatalog.DeleteZone(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleDefectZoneReorder(w http.ResponseWriter, r *http.Request) {
	var req reorderIDsBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.DefectCatalog.ReorderZones(r.Context(), req.IDs); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// --- Parts ---

func (s *server) handleDefectPartList(w http.ResponseWriter, r *http.Request) {
	var zoneID *int
	if raw := r.URL.Query().Get("zone_id"); raw != "" {
		id, err := strconv.Atoi(raw)
		if err != nil {
			badRequest(w, "zone_id must be an integer")
			return
		}
		zoneID = &id
	}
	items, err := s.deps.DefectCatalog.ListParts(r.Context(), zoneID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *server) handleDefectPartCreate(w http.ResponseWriter, r *http.Request) {
	var req defectCatalogueBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	item, err := s.deps.DefectCatalog.CreatePart(r.Context(), usecase.UpsertPartInput{
		ZoneID: req.ZoneID, Code: req.Code, NameTR: req.NameTR, NameEN: req.NameEN,
		SortOrder: req.SortOrder, IsActive: req.activeOrTrue(),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *server) handleDefectPartUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	var req defectCatalogueBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.DefectCatalog.UpdatePart(r.Context(), id, usecase.UpsertPartInput{
		ZoneID: req.ZoneID, Code: req.Code, NameTR: req.NameTR, NameEN: req.NameEN,
		SortOrder: req.SortOrder, IsActive: req.activeOrTrue(),
	}); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id})
}

func (s *server) handleDefectPartDelete(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	if err := s.deps.DefectCatalog.DeletePart(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleDefectPartReorder(w http.ResponseWriter, r *http.Request) {
	zoneID, err := strconv.Atoi(r.URL.Query().Get("zone_id"))
	if err != nil || zoneID <= 0 {
		badRequest(w, "zone_id query is required")
		return
	}
	var req reorderIDsBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.DefectCatalog.ReorderParts(r.Context(), zoneID, req.IDs); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// --- Types ---

func (s *server) handleDefectTypeList(w http.ResponseWriter, r *http.Request) {
	items, err := s.deps.DefectCatalog.ListTypes(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *server) handleDefectTypeCreate(w http.ResponseWriter, r *http.Request) {
	var req defectCatalogueBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	item, err := s.deps.DefectCatalog.CreateType(r.Context(), usecase.UpsertTypeInput{
		Code: req.Code, NameTR: req.NameTR, NameEN: req.NameEN,
		DefaultProcessID: req.DefaultProcessID, SortOrder: req.SortOrder, IsActive: req.activeOrTrue(),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *server) handleDefectTypeUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	var req defectCatalogueBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.DefectCatalog.UpdateType(r.Context(), id, usecase.UpsertTypeInput{
		Code: req.Code, NameTR: req.NameTR, NameEN: req.NameEN,
		DefaultProcessID: req.DefaultProcessID, SortOrder: req.SortOrder, IsActive: req.activeOrTrue(),
	}); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id})
}

func (s *server) handleDefectTypeDelete(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		badRequest(w, "id must be an integer")
		return
	}
	if err := s.deps.DefectCatalog.DeleteType(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleDefectTypeReorder(w http.ResponseWriter, r *http.Request) {
	var req reorderIDsBody
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if err := s.deps.DefectCatalog.ReorderTypes(r.Context(), req.IDs); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
