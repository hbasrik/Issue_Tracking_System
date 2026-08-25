package http

import (
	"net/http"
	"time"

	"github.com/karea/backend/internal/domain"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string    `json:"token"`
	User  loginUser `json:"user"`
}

// loginUser is the wire shape of the authenticated user. Role is flattened to
// its code so the API contract is unchanged now that domain.User.Role is a
// table row rather than an enum value.
type loginUser struct {
	ID        int       `json:"ID"`
	FullName  string    `json:"FullName"`
	Email     string    `json:"Email"`
	Role      string    `json:"Role"`
	IsActive  bool      `json:"IsActive"`
	CreatedAt time.Time `json:"CreatedAt"`
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

	token, err := s.deps.Issuer.Issue(user.ID, user.Role.Code)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, loginResponse{
		Token: token,
		User:  publicUser(user),
	})
}

func publicUser(user *domain.User) loginUser {
	return loginUser{
		ID:        user.ID,
		FullName:  user.FullName,
		Email:     user.Email,
		Role:      user.Role.Code,
		IsActive:  user.IsActive,
		CreatedAt: user.CreatedAt,
	}
}
