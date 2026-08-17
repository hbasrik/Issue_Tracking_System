package http_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
)

// TestEOLReset_NotFoundOutsideDevelopment is the production guard: the rewind
// route must 404 when APP_ENV is not development, even for a manager token,
// so hiding the button is not the only protection.
func TestEOLReset_NotFoundOutsideDevelopment(t *testing.T) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer: issuer,
		Roles:  newFakeRoleRepo(),
		AppEnv: "production",
	})
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/vehicles/"+seededVIN+"/eol/reset", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body: %s)", rec.Code, rec.Body.String())
	}
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.Error == "" {
		t.Error("expected an error message on the 404 body")
	}
}

func TestEOLReset_NotFoundOutsideDevelopmentWithoutAuth(t *testing.T) {
	router := apphttp.NewRouter(apphttp.Deps{
		Roles:  newFakeRoleRepo(),
		AppEnv: "staging",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/vehicles/"+seededVIN+"/eol/reset", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 so production probes do not see 401", rec.Code)
	}
}
