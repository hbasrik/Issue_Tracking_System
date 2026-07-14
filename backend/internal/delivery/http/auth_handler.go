package http

import (
	"net/http"

	"github.com/karea/backend/internal/domain"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string       `json:"token"`
	User  *domain.User `json:"user"`
}

// handleLogin verifies credentials and returns a signed JWT carrying the user
// id and role claim. The password is checked with bcrypt in the usecase; it is
// never compared as plaintext, and the User's password hash is never returned
// (it is tagged json:"-").
func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" {
		badRequest(w, "email and password are required")
		return
	}

	user, err := s.deps.Auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeError(w, err)
		return
	}

	token, err := s.deps.Issuer.Issue(user.ID, user.Role)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, loginResponse{Token: token, User: user})
}
