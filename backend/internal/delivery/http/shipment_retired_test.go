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
)

// The Shipment checklist is retired (Karar 33). These tests pin the wire
// contract: every route that used to accept it now refuses it.

func managerRequest(t *testing.T, issuer *auth.Issuer, method, path, body string) *http.Request {
	t.Helper()
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return req
}

func TestShipmentChecklistRoutesReturn400(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	cases := []struct {
		name, method, path, body string
	}{
		{"read", http.MethodGet, "/api/v1/vehicles/" + seededVIN + "/checklist/shipment", ""},
		{"record", http.MethodPost, "/api/v1/vehicles/" + seededVIN + "/checklist/shipment/1", `{"status":"OK"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, managerRequest(t, issuer, tc.method, tc.path, tc.body))
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body: %s)", rec.Code, rec.Body.String())
			}
		})
	}
}

// TestShipmentTemplateItemsReturn404: the template admin cannot reach a
// template the repository does not return (GetTemplate filters SHIPMENT).
func TestShipmentTemplateItemsReturn404(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, managerRequest(t, issuer, http.MethodGet, "/api/v1/checklist-templates/2/items", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body: %s)", rec.Code, rec.Body.String())
	}
}

// shipmentProgressMediaRepo answers like MediaRepo does for a progress row
// whose checklist_type is SHIPMENT: the type is not Valid.
type shipmentProgressMediaRepo struct{ *httpFakeMediaRepo }

func (shipmentProgressMediaRepo) ChecklistTypeForProgressID(context.Context, string) (domain.ChecklistType, error) {
	return "", domain.ErrInvalidEnumValue
}

func TestShipmentProgressMediaUploadReturns400(t *testing.T) {
	media := newHTTPFakeMediaRepo()
	store := &httpFakeMediaStore{}
	router, issuer := newMediaRouter(shipmentProgressMediaRepo{media}, store)
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	body, contentType := multipartUpload(t, string(domain.MediaEntityChecklistItemProgress), "77", "item.jpg", tinyJPEGBytes(t))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/media", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body: %s)", rec.Code, rec.Body.String())
	}
	if len(media.rows) != 0 || store.saved != 0 {
		t.Errorf("rows = %d, files = %d, want 0/0", len(media.rows), store.saved)
	}
}

// TestShipmentReadinessNeedsOnlyVehicleView: the warning panel is gated on
// vehicle.view, so QUALITY and ASSEMBLY pass the gate and a user without
// vehicle.view does not. ShipmentReadiness is nil here, so passing the gate
// shows up as 404.
func TestShipmentReadinessNeedsOnlyVehicleView(t *testing.T) {
	const noViewUserID = 99
	roles := newFakeRoleRepo()
	roles.byUser[noViewUserID] = permissions(domain.PermissionMobileAccess)
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{Issuer: issuer, Roles: roles})

	cases := []struct {
		name   string
		userID int
		role   string
		want   int
	}{
		{"quality", qualityUserID, domain.RoleCodeQuality, http.StatusNotFound},
		{"assembly", assemblyUserID, domain.RoleCodeAssembly, http.StatusNotFound},
		{"no vehicle.view", noViewUserID, domain.RoleCodeOperator, http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			token, err := issuer.Issue(tc.userID, tc.role)
			if err != nil {
				t.Fatalf("issue token: %v", err)
			}
			req := httptest.NewRequest(http.MethodGet, "/api/v1/vehicles/"+seededVIN+"/shipment-readiness", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}
