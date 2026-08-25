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

type httpFakeAnalysisRepo struct {
	last     domain.AnalysisFilter
	dash     *domain.AnalysisDashboard
	severity []domain.VehicleSeverityBreakdown
	defects  []domain.StationDefectRate
	mttr     []domain.StationMTTR
}

var _ repository.AnalysisRepository = (*httpFakeAnalysisRepo)(nil)

func (f *httpFakeAnalysisRepo) DailyPendingIssues(context.Context, domain.AnalysisFilter) ([]domain.DailyPendingIssue, error) {
	return nil, nil
}
func (f *httpFakeAnalysisRepo) CompletedIssuesDaily(context.Context, domain.AnalysisFilter) ([]domain.CompletedIssuesDaily, error) {
	return nil, nil
}
func (f *httpFakeAnalysisRepo) DefectRatePerStation(_ context.Context, filter domain.AnalysisFilter) ([]domain.StationDefectRate, error) {
	f.last = filter
	return f.defects, nil
}
func (f *httpFakeAnalysisRepo) MTTRPerStation(_ context.Context, filter domain.AnalysisFilter) ([]domain.StationMTTR, error) {
	f.last = filter
	return f.mttr, nil
}
func (f *httpFakeAnalysisRepo) VehicleSeverityBreakdown(_ context.Context, filter domain.AnalysisFilter) ([]domain.VehicleSeverityBreakdown, error) {
	f.last = filter
	return f.severity, nil
}
func (f *httpFakeAnalysisRepo) Dashboard(_ context.Context, filter domain.AnalysisFilter) (*domain.AnalysisDashboard, error) {
	f.last = filter
	if f.dash == nil {
		return &domain.AnalysisDashboard{}, nil
	}
	return f.dash, nil
}

func TestAnalysisDashboard_PassesDateFilter(t *testing.T) {
	repo := &httpFakeAnalysisRepo{dash: &domain.AnalysisDashboard{
		KPIs:      domain.AnalysisKPIs{ShippedToday: 2, ShippedWeek: 5},
		WorkSplit: domain.WorkSplit{Completed: 3, Ongoing: 4},
	}}
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:   issuer,
		Roles:    newFakeRoleRepo(),
		Analysis: usecase.NewAnalysisMetricsReader(repo),
	})
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/analysis/dashboard?from=2026-08-24&to=2026-08-25", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	if repo.last.From == nil || repo.last.To == nil {
		t.Fatal("expected from/to to reach the repository")
	}
	if repo.last.From.Format("2006-01-02") != "2026-08-24" || repo.last.To.Format("2006-01-02") != "2026-08-25" {
		t.Fatalf("from/to = %v %v", repo.last.From, repo.last.To)
	}

	var dash domain.AnalysisDashboard
	if err := json.Unmarshal(rec.Body.Bytes(), &dash); err != nil {
		t.Fatal(err)
	}
	if dash.KPIs.ShippedToday != 2 || dash.WorkSplit.Ongoing != 4 {
		t.Fatalf("payload = %+v", dash)
	}
}

func TestAnalysisDefectRate_HonorsDateFilter(t *testing.T) {
	repo := &httpFakeAnalysisRepo{defects: []domain.StationDefectRate{{StationID: 1, IssueCount: 1}}}
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:   issuer,
		Roles:    newFakeRoleRepo(),
		Analysis: usecase.NewAnalysisMetricsReader(repo),
	})
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analysis/defect-rate-per-station?from=2026-08-25&to=2026-08-25", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if repo.last.From == nil || repo.last.To == nil {
		t.Fatal("defect-rate ignored from/to")
	}
}

func TestAnalysisDashboard_OperatorForbidden(t *testing.T) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:   issuer,
		Roles:    newFakeRoleRepo(),
		Analysis: usecase.NewAnalysisMetricsReader(&httpFakeAnalysisRepo{}),
	})
	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analysis/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}
