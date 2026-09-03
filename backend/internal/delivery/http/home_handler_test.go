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
	"github.com/karea/backend/internal/usecase"
)

type fakeHomeRepo struct {
	stages     []domain.HomeEOLStageCount
	checklist  []domain.HomeEOLChecklistCount
	critical   []domain.HomeCriticalVehicle
}

func (f *fakeHomeRepo) EOLStageCounts(context.Context) ([]domain.HomeEOLStageCount, error) {
	return f.stages, nil
}
func (f *fakeHomeRepo) EOLChecklistCounts(context.Context) ([]domain.HomeEOLChecklistCount, error) {
	return f.checklist, nil
}
func (f *fakeHomeRepo) CriticalVehicles(context.Context, int) ([]domain.HomeCriticalVehicle, error) {
	return f.critical, nil
}

type fakeHomeAudit struct {
	items []domain.HomeActivityEntry
}

func (fakeHomeAudit) Append(context.Context, domain.AuditLog) error { return nil }
func (fakeHomeAudit) ListIssueStatusHistory(context.Context, int64) ([]domain.IssueStatusHistoryEntry, error) {
	return nil, nil
}
func (fakeHomeAudit) ListVehicleStatusHistory(context.Context, string) ([]domain.VehicleStatusHistoryEntry, error) {
	return nil, nil
}
func (f fakeHomeAudit) ListRecent(context.Context, int) ([]domain.HomeActivityEntry, error) {
	return f.items, nil
}
func (f fakeHomeAudit) ListActivity(context.Context, domain.AuditActivityFilter) (*domain.AuditActivityPage, error) {
	return &domain.AuditActivityPage{Items: f.items, Total: int64(len(f.items))}, nil
}

func TestHomeOverview_ReturnsPayload(t *testing.T) {
	at := time.Date(2026, 9, 3, 8, 0, 0, 0, time.UTC)
	home := &fakeHomeRepo{
		stages: []domain.HomeEOLStageCount{{Stage: "BRANCH", Count: 3}},
		checklist: []domain.HomeEOLChecklistCount{
			{Phase: "BRANCH", Done: 10, Total: 20},
		},
		critical: []domain.HomeCriticalVehicle{{
			VIN: "VIN1", CriticalCount: 2, WorstSeverity: "CRITICAL", Status: "IN_PRODUCTION",
		}},
	}
	audit := fakeHomeAudit{items: []domain.HomeActivityEntry{{
		EventAt: at, EventType: "ISSUE_STATUS_CHANGE", VIN: "VIN1", NewValue: "DONE", ActorName: "Ali",
	}}}
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer: issuer,
		Roles:  newFakeRoleRepo(),
		Home:   usecase.NewHomeOverviewReader(home, audit),
	})
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/home/overview", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var body domain.HomeOverview
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.EOLStages) != 1 || body.EOLStages[0].Count != 3 {
		t.Fatalf("stages = %+v", body.EOLStages)
	}
	if len(body.Activity) != 1 || body.Activity[0].ActorName != "Ali" {
		t.Fatalf("activity = %+v", body.Activity)
	}
	if len(body.CriticalVehicles) != 1 || body.CriticalVehicles[0].CriticalCount != 2 {
		t.Fatalf("critical = %+v", body.CriticalVehicles)
	}
}
