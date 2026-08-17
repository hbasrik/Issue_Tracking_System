package http_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	apphttp "github.com/karea/backend/internal/delivery/http"
)

const webOrigin = "http://localhost:5174"

// newCORSRouter builds the production router with nothing but the origin
// allowlist configured. The point of these tests is the middleware chain and
// the routing around it, so no usecase needs to be reachable.
func newCORSRouter() http.Handler {
	return apphttp.NewRouter(apphttp.Deps{
		Roles:              newFakeRoleRepo(),
		CORSAllowedOrigins: []string{webOrigin},
	})
}

func preflight(target, origin string) *http.Request {
	req := httptest.NewRequest(http.MethodOptions, target, nil)
	req.Header.Set("Origin", origin)
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "Content-Type")
	return req
}

// TestCORSPreflightIsAnsweredForEveryRoute is the regression test for the bug
// where a preflight was answered 405 with no CORS headers: no route declares
// OPTIONS, so unless the CORS middleware short-circuits it first, chi's method
// dispatch rejects it and the browser reports a CORS failure. Both a public
// and an authenticated route are covered because a preflight carries no
// Authorization header and must not be challenged for one.
func TestCORSPreflightIsAnsweredForEveryRoute(t *testing.T) {
	router := newCORSRouter()

	routes := []string{
		"/api/v1/auth/login",
		"/api/v1/vehicles/search",
		"/api/v1/vehicles/resolve",
		"/api/v1/media",
		"/api/v1/issues/1/status",
	}

	for _, route := range routes {
		t.Run(route, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, preflight(route, webOrigin))

			if rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want 200 or 204", rec.Code)
			}
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != webOrigin {
				t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, webOrigin)
			}
			if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
				t.Error("Access-Control-Allow-Methods is missing")
			}
			if got := rec.Header().Get("Access-Control-Allow-Headers"); got == "" {
				t.Error("Access-Control-Allow-Headers is missing")
			}
		})
	}
}

// TestCORSDisallowedOriginPreflight keeps a rejected origin distinguishable
// from a broken route: the preflight is still answered, it simply carries no
// grant, so a misconfigured allowlist reads as "missing header" rather than
// "405 Method Not Allowed".
func TestCORSDisallowedOriginPreflight(t *testing.T) {
	rec := httptest.NewRecorder()
	newCORSRouter().ServeHTTP(rec, preflight("/api/v1/auth/login", "https://evil.example"))

	if rec.Code == http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want the preflight answered rather than method-rejected", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Access-Control-Allow-Origin = %q, want it omitted", got)
	}
}

// TestCORSActualRequestCarriesOrigin covers the non-preflight half: the
// allowlisted origin gets its grant on the real response too.
func TestCORSActualRequestCarriesOrigin(t *testing.T) {
	router := newCORSRouter()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", webOrigin)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != webOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, webOrigin)
	}
}
