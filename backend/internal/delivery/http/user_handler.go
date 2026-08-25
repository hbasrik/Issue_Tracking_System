package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/usecase"
)

type updateUserRequest struct {
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
}

// handleUserList returns every user for the Users & Roles screen. Gated on
// admin.manage_masters. Password hashes are never included (loginUser DTO).
func (s *server) handleUserList(w http.ResponseWriter, r *http.Request) {
	items, err := s.deps.Users.List(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]loginUser, 0, len(items))
	for i := range items {
		out = append(out, publicUser(&items[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

// handleUserUpdate applies a role and/or is_active change. Self-lockout and
// the last-manager invariant are enforced in the usecase: 403 for changing
// your own account, 409 when the write would leave zero active managers.
func (s *server) handleUserUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		badRequest(w, "id must be a positive integer")
		return
	}

	var req updateUserRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if req.Role == nil && req.IsActive == nil {
		badRequest(w, "role or is_active is required")
		return
	}

	claims, _ := ClaimsFromContext(r.Context())
	user, err := s.deps.Users.Update(r.Context(), claims.UserID, id, usecase.UpdateUserInput{
		Role:     req.Role,
		IsActive: req.IsActive,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, publicUser(user))
}
