package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
)

// handleRBACMatrix returns every role, every permission, and current grants
// for the Roles screen (admin.manage_users).
func (s *server) handleRBACMatrix(w http.ResponseWriter, r *http.Request) {
	if s.deps.RoleAdmin == nil {
		writeJSON(w, http.StatusOK, map[string]any{"roles": []any{}, "permissions": []any{}})
		return
	}
	matrix, err := s.deps.RoleAdmin.Matrix(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	roles := make([]map[string]any, 0, len(matrix.Roles))
	for _, g := range matrix.Roles {
		perms := g.Permissions
		if perms == nil {
			perms = []string{}
		}
		roles = append(roles, map[string]any{
			"id":          g.Role.ID,
			"code":        g.Role.Code,
			"name":        g.Role.Name,
			"is_active":   g.Role.IsActive,
			"permissions": perms,
		})
	}
	perms := make([]map[string]any, 0, len(matrix.Permissions))
	for _, p := range matrix.Permissions {
		perms = append(perms, map[string]any{
			"id":          p.ID,
			"code":        p.Code,
			"description": p.Description,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"roles": roles, "permissions": perms})
}

type createRoleRequest struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

func (s *server) handleRoleCreate(w http.ResponseWriter, r *http.Request) {
	if s.deps.RoleAdmin == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	var req createRoleRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	role, err := s.deps.RoleAdmin.CreateRole(r.Context(), req.Code, req.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":        role.ID,
		"code":      role.Code,
		"name":      role.Name,
		"is_active": role.IsActive,
	})
}

type replaceGrantsRequest struct {
	Permissions []string `json:"permissions"`
}

func (s *server) handleRolePermissionsPut(w http.ResponseWriter, r *http.Request) {
	if s.deps.RoleAdmin == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		badRequest(w, "id must be a positive integer")
		return
	}
	var req replaceGrantsRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if req.Permissions == nil {
		req.Permissions = []string{}
	}
	if err := s.deps.RoleAdmin.ReplaceGrants(r.Context(), id, req.Permissions); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "permissions": req.Permissions})
}