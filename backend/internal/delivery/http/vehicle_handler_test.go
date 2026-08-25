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

type recordingVehicleRepo struct {
	last  domain.VehicleListFilter
	items []domain.Vehicle
}

var _ repository.VehicleRepository = (*recordingVehicleRepo)(nil)

func (f *recordingVehicleRepo) GetByVIN(context.Context, string) (*domain.Vehicle, error) {
	return nil, domain.ErrNotFound
}
func (f *recordingVehicleRepo) List(_ context.Context, filter domain.VehicleListFilter) ([]domain.Vehicle, error) {
	f.last = filter
	return f.items, nil
}
func (f *recordingVehicleRepo) Count(_ context.Context, filter domain.VehicleListFilter) (int, error) {
	f.last = filter
	return len(f.items), nil
}
func (f *recordingVehicleRepo) SearchByVINSuffix(context.Context, string, int) ([]domain.Vehicle, error) {
	return nil, nil
}
func (f *recordingVehicleRepo) UpdateProgress(context.Context, string, float64, *int) error {
	return nil
}
func (f *recordingVehicleRepo) UpdateStatus(context.Context, string, domain.VehicleStatus) error {
	return nil
}
func (f *recordingVehicleRepo) BulkInsertPlanned(context.Context, []string) ([]string, error) {
	return nil, nil
}

func TestVehicleList_AnalysisStatOnLine(t *testing.T) {
	repo := &recordingVehicleRepo{items: []domain.Vehicle{{
		VIN:                 "VINONLINE00000001",
		CurrentGlobalStatus: domain.VehicleStatusInProduction,
	}}}
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:   issuer,
		Roles:    newFakeRoleRepo(),
		Vehicles: usecase.NewVehicleService(repo, nil, nil, nil),
	})
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/vehicles?analysis_stat=on_line&from=2026-08-24&to=2026-08-24", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if repo.last.AnalysisStat != domain.VehicleAnalysisStatOnLine {
		t.Fatalf("stat = %q", repo.last.AnalysisStat)
	}
	if repo.last.WindowFrom != nil || repo.last.WindowUntil != nil {
		t.Fatal("on_line snapshot must not bind a date window")
	}

	var body usecase.VehicleListResult
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Total != 1 || len(body.Items) != 1 {
		t.Fatalf("payload = %+v", body)
	}
}

func TestVehicleList_AnalysisStatInvalid(t *testing.T) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:   issuer,
		Roles:    newFakeRoleRepo(),
		Vehicles: usecase.NewVehicleService(&recordingVehicleRepo{}, nil, nil, nil),
	})
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/vehicles?analysis_stat=not_a_stat", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", rec.Code)
	}
}
