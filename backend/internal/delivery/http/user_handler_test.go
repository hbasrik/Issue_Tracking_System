package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"testing"
	"time"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

var _ repository.UserRepository = (*httpAdminUserRepo)(nil)

var (
	httpOperatorRole = domain.Role{ID: 1, Code: domain.RoleCodeOperator, Name: "Operator", IsActive: true}
	httpManagerRole  = domain.Role{ID: 2, Code: domain.RoleCodeManagerAdmin, Name: "Manager/Admin", IsActive: true}
)

type httpAdminUserRepo struct {
	users map[int]*domain.User
}

func (r *httpAdminUserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	for _, user := range r.users {
		if user.Email == email {
			copied := *user
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *httpAdminUserRepo) GetByID(_ context.Context, id int) (*domain.User, error) {
	user, ok := r.users[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *user
	return &copied, nil
}

func (r *httpAdminUserRepo) List(context.Context) ([]domain.User, error) {
	ids := make([]int, 0, len(r.users))
	for id := range r.users {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	out := make([]domain.User, 0, len(ids))
	for _, id := range ids {
		out = append(out, *r.users[id])
	}
	return out, nil
}

func (r *httpAdminUserRepo) UpdateRoleAndActive(_ context.Context, id, roleID int, isActive bool) error {
	user, ok := r.users[id]
	if !ok {
		return domain.ErrNotFound
	}
	switch roleID {
	case httpOperatorRole.ID:
		user.Role = httpOperatorRole
	case httpManagerRole.ID:
		user.Role = httpManagerRole
	default:
		return domain.ErrNotFound
	}
	user.IsActive = isActive
	return nil
}

func (r *httpAdminUserRepo) CountActiveUsersWithPermission(_ context.Context, code string) (int, error) {
	n := 0
	for _, user := range r.users {
		if user.IsActive && user.Role.IsActive && user.Role.Code == domain.RoleCodeManagerAdmin &&
			code == domain.PermissionAdminManageUsers {
			n++
		}
	}
	return n, nil
}

func (r *httpAdminUserRepo) CountActiveUsersWithPermissionExceptRole(_ context.Context, code string, roleID int) (int, error) {
	n := 0
	for _, user := range r.users {
		if user.IsActive && user.Role.IsActive && user.Role.ID != roleID &&
			user.Role.Code == domain.RoleCodeManagerAdmin &&
			code == domain.PermissionAdminManageUsers {
			n++
		}
	}
	return n, nil
}

func (r *httpAdminUserRepo) Create(_ context.Context, user *domain.User) (*domain.User, error) {
	for _, existing := range r.users {
		if existing.Email == user.Email {
			return nil, domain.ErrEmailTaken
		}
	}
	id := 1
	for existingID := range r.users {
		if existingID >= id {
			id = existingID + 1
		}
	}
	copied := *user
	copied.ID = id
	r.users[id] = &copied
	out := copied
	return &out, nil
}

func (r *httpAdminUserRepo) UpdatePassword(_ context.Context, id int, hash string, mustChange bool) error {
	user, ok := r.users[id]
	if !ok {
		return domain.ErrNotFound
	}
	user.PasswordHash = hash
	user.MustChangePassword = mustChange
	return nil
}

func httpUser(id int, role domain.Role) *domain.User {
	return &domain.User{
		ID:       id,
		FullName: "User",
		Email:    "user@karea.local",
		Role:     role,
		IsActive: true,
	}
}

func usersRouter(users map[int]*domain.User) http.Handler {
	roles := newFakeRoleRepo()
	copied := make(map[int]*domain.User, len(users))
	for id, u := range users {
		c := *u
		copied[id] = &c
	}
	issuer := auth.NewIssuer("test-secret", time.Hour)
	return apphttp.NewRouter(apphttp.Deps{
		Issuer: issuer,
		Roles:  roles,
		Users:  usecase.NewUserAdmin(&httpAdminUserRepo{users: copied}, roles),
	})
}

func managerToken(t *testing.T, router http.Handler) string {
	t.Helper()
	// The issuer is inside the router; mint a matching token with the same secret.
	issuer := auth.NewIssuer("test-secret", time.Hour)
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}
	_ = router
	return token
}

func patchUser(router http.Handler, token string, id int, body any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/users/"+strconv.Itoa(id), bytes.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestUserList_ManagerOK(t *testing.T) {
	router := usersRouter(map[int]*domain.User{
		1: httpUser(1, httpManagerRole),
		2: httpUser(2, httpOperatorRole),
	})
	token := managerToken(t, router)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/users", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Items []struct {
			ID   int    `json:"ID"`
			Role string `json:"Role"`
		} `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Items) != 2 {
		t.Fatalf("items = %d", len(body.Items))
	}
}

func TestUserList_OperatorForbidden(t *testing.T) {
	router := usersRouter(map[int]*domain.User{
		1: httpUser(1, httpManagerRole),
		2: httpUser(2, httpOperatorRole),
	})
	issuer := auth.NewIssuer("test-secret", time.Hour)
	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/users", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestUserUpdate_LastManagerDemoteSelf_Conflict(t *testing.T) {
	router := usersRouter(map[int]*domain.User{
		1: httpUser(1, httpManagerRole),
		2: httpUser(2, httpOperatorRole),
	})
	rec := patchUser(router, managerToken(t, router), 1, map[string]string{"role": domain.RoleCodeOperator})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(domain.ErrLastActiveManager.Error())) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestUserUpdate_ChangeOwnRole_Forbidden(t *testing.T) {
	router := usersRouter(map[int]*domain.User{
		1: httpUser(1, httpManagerRole),
		2: httpUser(2, httpManagerRole),
	})
	rec := patchUser(router, managerToken(t, router), 1, map[string]string{"role": domain.RoleCodeOperator})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(domain.ErrCannotChangeOwnRole.Error())) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestUserUpdate_PromoteOperator_OK(t *testing.T) {
	router := usersRouter(map[int]*domain.User{
		1: httpUser(1, httpManagerRole),
		2: httpUser(2, httpOperatorRole),
	})
	rec := patchUser(router, managerToken(t, router), 2, map[string]string{"role": domain.RoleCodeManagerAdmin})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Role string `json:"Role"`
		ID   int    `json:"ID"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.ID != 2 || body.Role != domain.RoleCodeManagerAdmin {
		t.Fatalf("user = %+v", body)
	}
}

func TestUserUpdate_DeactivateSelf_Forbidden(t *testing.T) {
	router := usersRouter(map[int]*domain.User{
		1: httpUser(1, httpManagerRole),
		2: httpUser(2, httpManagerRole),
	})
	rec := patchUser(router, managerToken(t, router), 1, map[string]any{"is_active": false})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(domain.ErrCannotDeactivateSelf.Error())) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestUserCreate_ReturnsTemporaryPasswordNotHash(t *testing.T) {
	router := usersRouter(map[int]*domain.User{
		1: httpUser(1, httpManagerRole),
	})
	raw, _ := json.Marshal(map[string]string{
		"full_name": "Test Operator",
		"email":     "temp.op@karea.local",
		"role":      domain.RoleCodeOperator,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+managerToken(t, router))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if bytes.Contains(bytes.ToLower(rec.Body.Bytes()), []byte("password_hash")) {
		t.Fatal("response must not contain password_hash")
	}
	var body struct {
		TemporaryPassword string `json:"temporary_password"`
		User              struct {
			Email              string `json:"Email"`
			MustChangePassword bool   `json:"MustChangePassword"`
			IsActive           bool   `json:"IsActive"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.TemporaryPassword == "" || !body.User.MustChangePassword || !body.User.IsActive {
		t.Fatalf("body = %+v", body)
	}
	if body.User.Email != "temp.op@karea.local" {
		t.Fatalf("email = %q", body.User.Email)
	}
}

func TestUserCreate_DuplicateEmail(t *testing.T) {
	existing := httpUser(1, httpManagerRole)
	existing.Email = "taken@karea.local"
	router := usersRouter(map[int]*domain.User{1: existing})
	raw, _ := json.Marshal(map[string]string{
		"full_name": "Other",
		"email":     "taken@karea.local",
		"role":      domain.RoleCodeOperator,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+managerToken(t, router))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestUserResetPassword_SelfForbidden(t *testing.T) {
	router := usersRouter(map[int]*domain.User{
		1: httpUser(1, httpManagerRole),
		2: httpUser(2, httpOperatorRole),
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users/1/reset-password", nil)
	req.Header.Set("Authorization", "Bearer "+managerToken(t, router))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}
