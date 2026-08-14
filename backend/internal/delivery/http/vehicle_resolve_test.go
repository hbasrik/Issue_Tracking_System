package http_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

const seededVehicleNumber = "12345"

// httpFakeVehicleRepo serves a single vehicle, enough to prove the routing and
// lookup path for the resolve endpoint.
type httpFakeVehicleRepo struct{ vehicle domain.Vehicle }

var _ repository.VehicleRepository = (*httpFakeVehicleRepo)(nil)

func newHTTPFakeVehicleRepo() *httpFakeVehicleRepo {
	return &httpFakeVehicleRepo{vehicle: domain.Vehicle{
		VIN:                 seededVIN,
		VehicleNumber:       seededVehicleNumber,
		VehicleModelID:      1,
		CurrentGlobalStatus: domain.VehicleStatusInProduction,
	}}
}

func (f *httpFakeVehicleRepo) GetByVIN(_ context.Context, vin string) (*domain.Vehicle, error) {
	if vin != f.vehicle.VIN {
		return nil, domain.ErrNotFound
	}
	v := f.vehicle
	return &v, nil
}

func (f *httpFakeVehicleRepo) GetByVehicleNumber(_ context.Context, vehicleNumber string) (*domain.Vehicle, error) {
	if vehicleNumber != f.vehicle.VehicleNumber {
		return nil, domain.ErrNotFound
	}
	v := f.vehicle
	return &v, nil
}

func (f *httpFakeVehicleRepo) List(_ context.Context, _ domain.VehicleListFilter) ([]domain.Vehicle, error) {
	return []domain.Vehicle{f.vehicle}, nil
}

func (f *httpFakeVehicleRepo) Count(_ context.Context, _ domain.VehicleListFilter) (int, error) {
	return 1, nil
}

func (f *httpFakeVehicleRepo) SearchByVINSuffix(_ context.Context, _ string, _ int) ([]domain.Vehicle, error) {
	return []domain.Vehicle{f.vehicle}, nil
}

func (f *httpFakeVehicleRepo) UpdateProgress(_ context.Context, _ string, _ float64, _ *int) error {
	return nil
}

func (f *httpFakeVehicleRepo) UpdateStatus(_ context.Context, _ string, _ domain.VehicleStatus) error {
	return nil
}

// newVehicleRouter builds the real router with only the vehicle dependency
// populated.
func newVehicleRouter(vehicles repository.VehicleRepository) (http.Handler, *auth.Issuer) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:   issuer,
		Roles:    newFakeRoleRepo(),
		Vehicles: usecase.NewVehicleService(vehicles, nil, nil, nil),
	})
	return router, issuer
}

// TestVehicleResolve covers the Karar 5 short-number lookup. The unknown-number
// case matters most: resolve sits next to the /vehicles/{vin} wildcard, so a
// miss must be a clear 404 rather than the wildcard handler treating "resolve"
// as a VIN.
func TestVehicleResolve(t *testing.T) {
	router, issuer := newVehicleRouter(newHTTPFakeVehicleRepo())

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	cases := []struct {
		name       string
		query      string
		wantStatus int
	}{
		{"known number resolves", "?vehicle_number=" + seededVehicleNumber, http.StatusOK},
		{"surrounding whitespace tolerated", "?vehicle_number=%20" + seededVehicleNumber + "%20", http.StatusOK},
		{"unknown number is not found", "?vehicle_number=99999", http.StatusNotFound},
		{"missing parameter is a bad request", "", http.StatusBadRequest},
		{"blank parameter is a bad request", "?vehicle_number=", http.StatusBadRequest},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/vehicles/resolve"+c.query, nil)
			req.Header.Set("Authorization", "Bearer "+token)

			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != c.wantStatus {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, c.wantStatus, rec.Body.String())
			}
		})
	}
}

// TestVehicleResolve_ReturnsSameShapeAsVINRead pins the promise that resolve is
// only a different way in to the same record, so clients can reuse the vehicle
// parser they already have.
func TestVehicleResolve_ReturnsSameShapeAsVINRead(t *testing.T) {
	router, issuer := newVehicleRouter(newHTTPFakeVehicleRepo())

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	get := func(path string) map[string]any {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s: status = %d (body: %s)", path, rec.Code, rec.Body.String())
		}

		var body map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("GET %s: decode body: %v", path, err)
		}
		return body
	}

	byVIN := get("/api/v1/vehicles/" + seededVIN)
	byNumber := get("/api/v1/vehicles/resolve?vehicle_number=" + seededVehicleNumber)

	if len(byVIN) != len(byNumber) {
		t.Fatalf("field count = %d, want %d", len(byNumber), len(byVIN))
	}
	for key, want := range byVIN {
		if got := byNumber[key]; got != want {
			t.Errorf("%s = %v, want %v", key, got, want)
		}
	}
}
