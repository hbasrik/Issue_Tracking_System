package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

type updateUserRequest struct {
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
}

// handleUserList returns every user for the Users & Roles screen. Gated on
// admin.manage_users. Password hashes are never included (loginUser DTO).
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
	writeJSON(w, http.StatusOK, map[string]any{
		"items":                 out,
		"allowed_email_domains": s.deps.Users.AllowedEmailDomains(),
	})
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

type createUserRequest struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

// handleUserCreate inserts an active user with a generated password. The
// plaintext is returned once; the hash is never serialized.
func (s *server) handleUserCreate(w http.ResponseWriter, r *http.Request) {
	if s.deps.Users == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	var req createUserRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	created, err := s.deps.Users.Create(r.Context(), usecase.CreateUserInput{
		FullName: req.FullName,
		Email:    req.Email,
		Role:     req.Role,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":               publicUser(created.User),
		"temporary_password": created.TemporaryPassword,
	})
}

// handleUserResetPassword generates a one-time password for another user.
func (s *server) handleUserResetPassword(w http.ResponseWriter, r *http.Request) {
	if s.deps.Users == nil {
		writeError(w, domain.ErrNotFound)
		return
	}
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id < 1 {
		badRequest(w, "id must be a positive integer")
		return
	}
	claims, _ := ClaimsFromContext(r.Context())
	plain, err := s.deps.Users.ResetPassword(r.Context(), claims.UserID, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"temporary_password": plain})
}
