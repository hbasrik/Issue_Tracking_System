package http_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/applog"
	"github.com/karea/backend/internal/platform/auth"
)

func panicProbeRouter(t *testing.T, appEnv string, enableProbe bool) (http.Handler, *auth.Issuer) {
	t.Helper()
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		CORSAllowedOrigins: []string{"http://localhost:5173"},
		AppEnv:             appEnv,
		EnablePanicProbe:   enableProbe,
		Issuer:             issuer,
	})
	return router, issuer
}

func authGET(t *testing.T, issuer *auth.Issuer, path string) *http.Request {
	t.Helper()
	token, err := issuer.Issue(1, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	return req
}

func TestPanicProbe_ProductionConfig_NotFound(t *testing.T) {
	// Negative proof: production AppEnv must not register the probe even when
	// EnablePanicProbe is incorrectly true — flag presence alone is not enough.
	router, issuer := panicProbeRouter(t, "production", true)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, authGET(t, issuer, "/api/v1/__test/panic"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("production+probe flag: status = %d, want 404 (body: %s)", rec.Code, rec.Body.String())
	}

	// Unauthenticated must also 404 (route absent), not 401.
	bare := httptest.NewRecorder()
	router.ServeHTTP(bare, httptest.NewRequest(http.MethodGet, "/api/v1/__test/panic", nil))
	if bare.Code != http.StatusNotFound {
		t.Fatalf("production bare: status = %d, want 404", bare.Code)
	}
}

func TestPanicProbe_RequiresAuth(t *testing.T) {
	router, issuer := panicProbeRouter(t, "development", true)

	unauth := httptest.NewRecorder()
	router.ServeHTTP(unauth, httptest.NewRequest(http.MethodGet, "/api/v1/__test/panic", nil))
	if unauth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated probe: status = %d, want 401 (body: %s)", unauth.Code, unauth.Body.String())
	}

	// Authenticated request reaches the handler and is recovered as 500.
	var logBuf bytes.Buffer
	applog.SetOutputForTest(&logBuf, applog.LevelDebug)
	t.Cleanup(func() { applog.SetOutputForTest(nil, applog.LevelInfo) })

	authRec := httptest.NewRecorder()
	router.ServeHTTP(authRec, authGET(t, issuer, "/api/v1/__test/panic"))
	if authRec.Code != http.StatusInternalServerError {
		t.Fatalf("authenticated probe: status = %d, want 500", authRec.Code)
	}
}

func TestRecoverPanic_Returns500KeepsProcess(t *testing.T) {
	var logBuf bytes.Buffer
	applog.SetOutputForTest(&logBuf, applog.LevelDebug)
	t.Cleanup(func() { applog.SetOutputForTest(nil, applog.LevelInfo) })

	router, issuer := panicProbeRouter(t, "development", true)

	req := authGET(t, issuer, "/api/v1/__test/panic")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body not JSON: %s", rec.Body.String())
	}
	if body["error"] != "internal server error" {
		t.Fatalf("error = %v", body["error"])
	}
	reqID, _ := body["request_id"].(string)
	if reqID == "" {
		t.Fatal("expected request_id in error body")
	}
	if rec.Header().Get("X-Request-ID") == "" {
		t.Fatal("expected X-Request-ID response header")
	}
	if strings.Contains(rec.Body.String(), "intentional panic") {
		t.Fatal("client must not see panic text")
	}
	if strings.Contains(rec.Body.String(), "goroutine") || strings.Contains(rec.Body.String(), "stack") {
		t.Fatal("client must not see stack trace")
	}

	// Process still serves after the panic.
	health := httptest.NewRecorder()
	router.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/health", nil))
	if health.Code != http.StatusOK {
		t.Fatalf("health after panic = %d", health.Code)
	}

	logged := logBuf.String()
	if !strings.Contains(logged, "panic recovered") {
		t.Fatalf("missing panic log: %s", logged)
	}
	if !strings.Contains(logged, "request_id="+reqID) && !strings.Contains(logged, "request_id=\""+reqID) {
		// quote() may leave bare id
		if !strings.Contains(logged, reqID) {
			t.Fatalf("log missing request id %q: %s", reqID, logged)
		}
	}
	if !strings.Contains(logged, "path=/api/v1/__test/panic") {
		t.Fatalf("log missing path: %s", logged)
	}
	if !strings.Contains(logged, "intentional panic probe") {
		t.Fatalf("log missing panic value: %s", logged)
	}
	if !strings.Contains(logged, "stack=") {
		t.Fatalf("log missing stack: %s", logged)
	}
}

func TestUnhandledError_5xxIncludesRequestID(t *testing.T) {
	var logBuf bytes.Buffer
	applog.SetOutputForTest(&logBuf, applog.LevelDebug)
	t.Cleanup(func() { applog.SetOutputForTest(nil, applog.LevelInfo) })

	router, issuer := panicProbeRouter(t, "development", true)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, authGET(t, issuer, "/api/v1/__test/panic"))
	if rec.Code != 500 {
		t.Fatalf("status=%d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"request_id"`) {
		t.Fatalf("body=%s", rec.Body.String())
	}
}

func TestLogin_PasswordNotLogged(t *testing.T) {
	var logBuf bytes.Buffer
	applog.SetOutputForTest(&logBuf, applog.LevelDebug)
	t.Cleanup(func() { applog.SetOutputForTest(nil, applog.LevelInfo) })

	router := loginRouter(t, map[string]*domain.User{})
	secret := "NeverLogThisPassword99"
	body, _ := json.Marshal(map[string]string{
		"email":    "nobody@karea.local",
		"password": secret,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	logged := logBuf.String()
	if strings.Contains(logged, secret) {
		t.Fatalf("password leaked into logs: %s", logged)
	}
	if strings.Contains(strings.ToLower(logged), `"password"`) {
		t.Fatalf("password field leaked into logs: %s", logged)
	}
}

func TestRedact_LoginBody(t *testing.T) {
	t.Parallel()
	raw := `{"email":"a@b.c","password":"NeverLogThisPassword99"}`
	if got := applog.Redact(raw); got != "[REDACTED]" {
		t.Fatalf("got %q", got)
	}
}
