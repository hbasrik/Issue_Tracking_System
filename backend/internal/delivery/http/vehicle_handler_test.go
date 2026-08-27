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
	byVIN map[string]*domain.Vehicle
}

var _ repository.VehicleRepository = (*recordingVehicleRepo)(nil)

func (f *recordingVehicleRepo) GetByVIN(_ context.Context, vin string) (*domain.Vehicle, error) {
	if f.byVIN != nil {
		if v, ok := f.byVIN[vin]; ok {
			return v, nil
		}
	}
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

type namedStatusAudit struct {
	items []domain.VehicleStatusHistoryEntry
}

func (namedStatusAudit) Append(context.Context, domain.AuditLog) error { return nil }
func (namedStatusAudit) ListIssueStatusHistory(context.Context, int64) ([]domain.IssueStatusHistoryEntry, error) {
	return nil, nil
}
func (a namedStatusAudit) ListVehicleStatusHistory(context.Context, string) ([]domain.VehicleStatusHistoryEntry, error) {
	return a.items, nil
}

func TestVehicleStatusHistory_JSONIncludesActorName(t *testing.T) {
	const vin = "1KTSKRC2XSB010057"
	at := time.Date(2026, 8, 25, 14, 5, 0, 0, time.UTC)
	repo := &recordingVehicleRepo{
		byVIN: map[string]*domain.Vehicle{
			vin: {VIN: vin, CurrentGlobalStatus: domain.VehicleStatusShipped},
		},
	}
	audit := namedStatusAudit{items: []domain.VehicleStatusHistoryEntry{{
		ID: 11, FromStatus: "IN_PRODUCTION", ToStatus: "SHIPPED",
		ActorName: "Local Manager", EventAt: at,
	}}}
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:   issuer,
		Roles:    newFakeRoleRepo(),
		Vehicles: usecase.NewVehicleService(repo, nil, audit, nil),
	})
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/vehicles/"+vin+"/status-history", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Items []domain.VehicleStatusHistoryEntry `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 {
		t.Fatalf("items = %d, want 1", len(body.Items))
	}
	if body.Items[0].ActorName != "Local Manager" {
		t.Errorf("ActorName = %q", body.Items[0].ActorName)
	}
	if body.Items[0].ToStatus != "SHIPPED" {
		t.Errorf("ToStatus = %q", body.Items[0].ToStatus)
	}
}
