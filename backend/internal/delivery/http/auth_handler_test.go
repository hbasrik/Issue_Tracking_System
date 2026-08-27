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

func (f *loginUserRepo) GetByID(_ context.Context, id int) (*domain.User, error) {
	for _, user := range f.byEmail {
		if user.ID == id {
			copied := *user
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *loginUserRepo) List(context.Context) ([]domain.User, error) {
	return nil, nil
}

func (f *loginUserRepo) UpdateRoleAndActive(context.Context, int, int, bool) error {
	return nil
}

func (f *loginUserRepo) CountActiveUsersWithPermission(context.Context, string) (int, error) {
	return 0, nil
}

func (f *loginUserRepo) CountActiveUsersWithPermissionExceptRole(context.Context, string, int) (int, error) {
	return 0, nil
}

func (f *loginUserRepo) Create(_ context.Context, user *domain.User) (*domain.User, error) {
	copied := *user
	return &copied, nil
}

func (f *loginUserRepo) UpdatePassword(_ context.Context, id int, hash string, mustChange bool) error {
	for _, u := range f.byEmail {
		if u.ID == id {
			u.PasswordHash = hash
			u.MustChangePassword = mustChange
			return nil
		}
	}
	return domain.ErrNotFound
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
		Token       string   `json:"token"`
		Permissions []string `json:"permissions"`
		User        struct {
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
	seen := map[string]bool{}
	for _, code := range body.Permissions {
		seen[code] = true
	}
	if !seen[domain.PermissionMobileAccess] || !seen[domain.PermissionIssueCreate] {
		t.Fatalf("permissions = %v, want mobile.access and issue.create from DB", body.Permissions)
	}
	if seen[domain.PermissionWebAccess] {
		t.Fatal("operator must not receive web.access")
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

func TestChangePassword_WrongCurrent_Unauthorized(t *testing.T) {
	router := loginRouter(t, map[string]*domain.User{
		"op@karea.local": {
			ID:           operatorUserID,
			Email:        "op@karea.local",
			PasswordHash: hashPassword(t, "secret12"),
			IsActive:     true,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: true},
		},
	})
	issuer := auth.NewIssuer("test-secret", time.Hour)
	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{
		"current_password": "nope-nope",
		"new_password":     "newpass12",
		"confirm_password": "newpass12",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/change-password", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestChangePassword_TooShort_BadRequest(t *testing.T) {
	router := loginRouter(t, map[string]*domain.User{
		"op@karea.local": {
			ID:           operatorUserID,
			Email:        "op@karea.local",
			PasswordHash: hashPassword(t, "secret12"),
			IsActive:     true,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: true},
		},
	})
	issuer := auth.NewIssuer("test-secret", time.Hour)
	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{
		"current_password": "secret12",
		"new_password":     "ab1",
		"confirm_password": "ab1",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/change-password", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestLogin_IncludesMustChangePassword(t *testing.T) {
	router := loginRouter(t, map[string]*domain.User{
		"op@karea.local": {
			ID:                 operatorUserID,
			Email:              "op@karea.local",
			PasswordHash:       hashPassword(t, "secret"),
			IsActive:           true,
			MustChangePassword: true,
			Role:               domain.Role{Code: domain.RoleCodeOperator, IsActive: true},
		},
	})
	rec := postLogin(router, "op@karea.local", "secret")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if bytes.Contains(bytes.ToLower(rec.Body.Bytes()), []byte("password_hash")) {
		t.Fatal("login must not return password_hash")
	}
	var body struct {
		User struct {
			MustChangePassword bool `json:"MustChangePassword"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.User.MustChangePassword {
		t.Fatal("MustChangePassword should be true")
	}
}
