package http_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/platform/config"
	"github.com/karea/backend/internal/usecase"
)

func TestJWTSecret_RejectsEmptyAndShort(t *testing.T) {
	t.Parallel()
	if err := config.ValidateJWTSecret(""); err == nil {
		t.Fatal("empty secret accepted")
	}
	if err := config.ValidateJWTSecret(strings.Repeat("a", 31)); err == nil {
		t.Fatal("31-char secret accepted")
	}
	if err := config.ValidateJWTSecret(strings.Repeat("b", 32)); err != nil {
		t.Fatalf("32-char secret rejected: %v", err)
	}
	msg := config.ValidateJWTSecret("short").Error()
	if !strings.Contains(msg, "openssl rand -base64 32") {
		t.Fatalf("message missing generate hint: %s", msg)
	}
}

func TestDocumentApprove_Returns410(t *testing.T) {
	issuer := auth.NewIssuer("test-secret-at-least-32-chars-long!!", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:             issuer,
		Roles:              newFakeRoleRepo(),
		EOLDocumentApprove: usecase.NewEOLDocumentApprover(nil, nil, nil),
	})
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/vehicles/"+seededVIN+"/eol/document-approve", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusGone {
		t.Fatalf("status = %d, want 410 body=%s", rec.Code, rec.Body.String())
	}
}

func TestMediaUpload_OperatorCannotAttachToVehicleEntity(t *testing.T) {
	media := newHTTPFakeMediaRepo()
	router, issuer := newMediaRouter(media, &httpFakeMediaStore{})
	token, _ := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	body, contentType := multipartUpload(t, "VEHICLE", seededVIN, "damage.jpg", "bytes")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/media", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	if len(media.rows) != 0 {
		t.Fatalf("rows = %d, want 0", len(media.rows))
	}
}

func TestDocumentApprovePermission_NotAssignable(t *testing.T) {
	if domain.IsAssignablePermission(domain.PermissionEOLDocumentApprove) {
		t.Fatal("eol.document_approve must not be assignable")
	}
}

func TestDescriptionMaxLen(t *testing.T) {
	t.Parallel()
	long := strings.Repeat("ü", domain.IssueDescriptionMaxLen+1)
	if len([]rune(strings.TrimSpace(long))) <= domain.IssueDescriptionMaxLen {
		t.Fatal("test setup")
	}
	if err := descriptionLenErr(long); err != domain.ErrIssueDescriptionTooLong {
		t.Fatalf("got %v", err)
	}
	ok := strings.Repeat("a", domain.IssueDescriptionMaxLen)
	if err := descriptionLenErr(ok); err != nil {
		t.Fatalf("max length rejected: %v", err)
	}
}

func descriptionLenErr(desc string) error {
	if strings.TrimSpace(desc) == "" {
		return domain.ErrIssueDescriptionRequired
	}
	if len([]rune(strings.TrimSpace(desc))) > domain.IssueDescriptionMaxLen {
		return domain.ErrIssueDescriptionTooLong
	}
	return nil
}

func TestSession_RevokedAfterTokensValidFromBump(t *testing.T) {
	issuer := auth.NewIssuer("test-secret-at-least-32-chars-long!!", time.Hour)
	users := map[string]*domain.User{
		"op@karea.local": {
			ID: operatorUserID, Email: "op@karea.local", FullName: "Op",
			Role:            domain.Role{ID: 2, Code: domain.RoleCodeOperator, IsActive: true},
			PasswordHash:    hashPassword(t, "secret12"),
			IsActive:        true,
			TokensValidFrom: time.Now().Add(-time.Hour),
		},
	}
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer: issuer,
		Auth:   usecase.NewAuthenticator(&mapUserRepo{users: users}),
		Roles:  newFakeRoleRepo(),
	})

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/change-password", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code == http.StatusUnauthorized {
		t.Fatalf("pre-bump should not 401, got %d %s", rec.Code, rec.Body.String())
	}

	users["op@karea.local"].TokensValidFrom = time.Now().Add(2 * time.Second)

	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, req)
	if rec2.Code != http.StatusUnauthorized {
		t.Fatalf("post-bump status = %d, want 401 body=%s", rec2.Code, rec2.Body.String())
	}

	users["op@karea.local"].TokensValidFrom = time.Now().Add(-time.Second)
	newToken, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatal(err)
	}
	req3 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/change-password", strings.NewReader(`{}`))
	req3.Header.Set("Authorization", "Bearer "+newToken)
	req3.Header.Set("Content-Type", "application/json")
	rec3 := httptest.NewRecorder()
	router.ServeHTTP(rec3, req3)
	if rec3.Code == http.StatusUnauthorized {
		t.Fatalf("fresh token rejected: %d %s", rec3.Code, rec3.Body.String())
	}
}

func TestSession_InactiveUserRejected(t *testing.T) {
	issuer := auth.NewIssuer("test-secret-at-least-32-chars-long!!", time.Hour)
	users := map[string]*domain.User{
		"op@karea.local": {
			ID: operatorUserID, Email: "op@karea.local", FullName: "Op",
			Role:            domain.Role{ID: 2, Code: domain.RoleCodeOperator, IsActive: true},
			PasswordHash:    hashPassword(t, "secret12"),
			IsActive:        false,
			// Deactivate bumps tokens_valid_from to now(); iat is older → 401.
			TokensValidFrom: time.Now().Add(2 * time.Second),
		},
	}
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer: issuer,
		Auth:   usecase.NewAuthenticator(&mapUserRepo{users: users}),
		Roles:  newFakeRoleRepo(),
	})
	token, _ := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/change-password", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 body=%s", rec.Code, rec.Body.String())
	}
}

type mapUserRepo struct {
	users map[string]*domain.User
}

func (m *mapUserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	u, ok := m.users[strings.ToLower(email)]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *u
	return &cp, nil
}
func (m *mapUserRepo) GetByID(_ context.Context, id int) (*domain.User, error) {
	for _, u := range m.users {
		if u.ID == id {
			cp := *u
			return &cp, nil
		}
	}
	return nil, domain.ErrNotFound
}
func (m *mapUserRepo) List(context.Context) ([]domain.User, error) { return nil, nil }
func (m *mapUserRepo) UpdateRoleAndActive(context.Context, int, int, bool) error {
	return nil
}
func (m *mapUserRepo) CountActiveUsersWithPermission(context.Context, string) (int, error) {
	return 0, nil
}
func (m *mapUserRepo) CountActiveUsersWithPermissionExceptRole(context.Context, string, int) (int, error) {
	return 0, nil
}
func (m *mapUserRepo) Create(_ context.Context, u *domain.User) (*domain.User, error) { return u, nil }
func (m *mapUserRepo) UpdatePassword(context.Context, int, string, bool) error {
	return nil
}
func (m *mapUserRepo) CountReferences(context.Context, int) (int, error) { return 0, nil }
func (m *mapUserRepo) Delete(context.Context, int) error                 { return nil }
