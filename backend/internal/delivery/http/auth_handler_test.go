package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

type loginUserRepo struct {
	byEmail map[string]*domain.User
}

var _ repository.UserRepository = (*loginUserRepo)(nil)

func (f *loginUserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	user, ok := f.byEmail[email]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *user
	return &copied, nil
}

func (f *loginUserRepo) GetByID(context.Context, int) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func hashPassword(t *testing.T, password string) string {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	return string(hash)
}

func loginRouter(t *testing.T, users map[string]*domain.User) http.Handler {
	t.Helper()
	return apphttp.NewRouter(apphttp.Deps{
		Issuer: auth.NewIssuer("test-secret", time.Hour),
		Auth:   usecase.NewAuthenticator(&loginUserRepo{byEmail: users}),
		Roles:  newFakeRoleRepo(),
	})
}

func postLogin(router http.Handler, email, password string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestLogin_InactiveRole_NoToken(t *testing.T) {
	router := loginRouter(t, map[string]*domain.User{
		"op@karea.local": {
			ID:           2,
			Email:        "op@karea.local",
			PasswordHash: hashPassword(t, "secret"),
			IsActive:     true,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: false},
		},
	})

	rec := postLogin(router, "op@karea.local", "secret")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["error"] != domain.ErrAccountInactive.Error() {
		t.Fatalf("error = %v", body["error"])
	}
	if _, ok := body["token"]; ok {
		t.Fatal("token must not be issued for an inactive role")
	}
}

func TestLogin_InactiveUser_NoToken(t *testing.T) {
	router := loginRouter(t, map[string]*domain.User{
		"op@karea.local": {
			ID:           2,
			Email:        "op@karea.local",
			PasswordHash: hashPassword(t, "secret"),
			IsActive:     false,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: true},
		},
	})

	rec := postLogin(router, "op@karea.local", "secret")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() == `{"error":"invalid credentials"}`+"\n" {
		t.Fatal("inactive account must not look like a password error")
	}
}

func TestLogin_ActiveUser_IssuesToken(t *testing.T) {
	router := loginRouter(t, map[string]*domain.User{
		"op@karea.local": {
			ID:           2,
			Email:        "op@karea.local",
			PasswordHash: hashPassword(t, "secret"),
			IsActive:     true,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: true},
		},
	})

	rec := postLogin(router, "op@karea.local", "secret")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Token string `json:"token"`
		User  struct {
			Role string `json:"Role"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Token == "" {
		t.Fatal("expected a JWT")
	}
	if body.User.Role != domain.RoleCodeOperator {
		t.Fatalf("role = %q", body.User.Role)
	}
}

func TestLogin_WrongPassword_Unauthorized(t *testing.T) {
	router := loginRouter(t, map[string]*domain.User{
		"op@karea.local": {
			ID:           2,
			Email:        "op@karea.local",
			PasswordHash: hashPassword(t, "secret"),
			IsActive:     true,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: true},
		},
	})

	rec := postLogin(router, "op@karea.local", "wrong")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}
