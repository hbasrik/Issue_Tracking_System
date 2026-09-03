package http_test

import (
	"bytes"
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

// httpFakeIssueRepo is an in-memory IssueRepository for list/transition HTTP tests.
type httpFakeIssueRepo struct {
	issues map[int64]*domain.Issue
}

var _ repository.IssueRepository = (*httpFakeIssueRepo)(nil)

func newHTTPFakeIssueRepo(issues ...domain.Issue) *httpFakeIssueRepo {
	f := &httpFakeIssueRepo{issues: map[int64]*domain.Issue{}}
	for i := range issues {
		copied := issues[i]
		f.issues[copied.ID] = &copied
	}
	return f
}

func (f *httpFakeIssueRepo) Create(_ context.Context, _ *domain.Issue) (int64, error) {
	return 0, domain.ErrNotFound
}

func (f *httpFakeIssueRepo) GetByID(_ context.Context, id int64) (*domain.Issue, error) {
	issue, ok := f.issues[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *issue
	return &copied, nil
}

func (f *httpFakeIssueRepo) ListForUser(_ context.Context, userID int, status *domain.IssueStatus) ([]domain.Issue, error) {
	var out []domain.Issue
	for _, issue := range f.issues {
		if issue.IssueReporterID != userID {
			continue
		}
		if status != nil && issue.Status != *status {
			continue
		}
		out = append(out, *issue)
	}
	return out, nil
}

func (f *httpFakeIssueRepo) ListAll(_ context.Context, status *domain.IssueStatus) ([]domain.Issue, error) {
	var out []domain.Issue
	for _, issue := range f.issues {
		if status != nil && issue.Status != *status {
			continue
		}
		out = append(out, *issue)
	}
	return out, nil
}

func (f *httpFakeIssueRepo) ListByVIN(_ context.Context, vin string, status *domain.IssueStatus) ([]domain.Issue, error) {
	var out []domain.Issue
	for _, issue := range f.issues {
		if issue.VIN != vin {
			continue
		}
		if status != nil && issue.Status != *status {
			continue
		}
		out = append(out, *issue)
	}
	return out, nil
}

func (f *httpFakeIssueRepo) ListOpenByVIN(_ context.Context, vin string) ([]domain.Issue, error) {
	return f.ListByVIN(context.Background(), vin, nil)
}

func (f *httpFakeIssueRepo) UpdateStatus(_ context.Context, id int64, status domain.IssueStatus, _ int, _ string) error {
	issue, ok := f.issues[id]
	if !ok {
		return domain.ErrNotFound
	}
	issue.Status = status
	return nil
}

func (f *httpFakeIssueRepo) ListIssueTypes(_ context.Context) ([]domain.IssueType, error) {
	return []domain.IssueType{}, nil
}

type httpNoopAudit struct{}

func (httpNoopAudit) Append(context.Context, domain.AuditLog) error { return nil }

func (httpNoopAudit) ListIssueStatusHistory(context.Context, int64) ([]domain.IssueStatusHistoryEntry, error) {
	return []domain.IssueStatusHistoryEntry{}, nil
}

func (httpNoopAudit) ListVehicleStatusHistory(context.Context, string) ([]domain.VehicleStatusHistoryEntry, error) {
	return []domain.VehicleStatusHistoryEntry{}, nil
}

func (httpNoopAudit) ListRecent(context.Context, int) ([]domain.HomeActivityEntry, error) {
	return []domain.HomeActivityEntry{}, nil
}

type httpNoopUoW struct{}

func (httpNoopUoW) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

func newIssueRouter(issues repository.IssueRepository) (http.Handler, *auth.Issuer) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer: issuer,
		Roles:  newFakeRoleRepo(),
		Issues: usecase.NewIssueManager(issues, httpNoopAudit{}, httpNoopUoW{}),
	})
	return router, issuer
}

func otherReporterIssue() domain.Issue {
	return domain.Issue{
		ID:              41,
		VIN:             "N7V1K1SA9SK000001",
		Status:          domain.IssueStatusOpen,
		IssueReporterID: managerUserID,
		ReporterName:    "Manager Admin",
		Description:     "someone else's defect",
	}
}

func operatorOwnIssue() domain.Issue {
	return domain.Issue{
		ID:              7,
		VIN:             "N7V1K1SA9SK000002",
		Status:          domain.IssueStatusOpen,
		IssueReporterID: operatorUserID,
		ReporterName:    "Operator One",
		Description:     "own defect",
	}
}

// TestIssueList_OperatorSeesEveryIssue is the repair-queue guarantee: listing
// is not reporter-scoped and does not require analysis.view, so an operator
// can pick up an issue someone else opened.
func TestIssueList_OperatorSeesEveryIssue(t *testing.T) {
	router, issuer := newIssueRouter(newHTTPFakeIssueRepo(otherReporterIssue(), operatorOwnIssue()))

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/issues", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload struct {
		Items []domain.Issue `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Items) != 2 {
		t.Fatalf("items = %d, want 2 (reporter-scoped leak)", len(payload.Items))
	}
	seen := map[int64]bool{}
	for _, item := range payload.Items {
		seen[item.ID] = true
	}
	if !seen[41] || !seen[7] {
		t.Fatalf("ids = %v, want both 41 (other reporter) and 7 (own)", seen)
	}
}

func TestIssueList_UnpermissionedRoleForbidden(t *testing.T) {
	router, issuer := newIssueRouter(newHTTPFakeIssueRepo(otherReporterIssue()))

	token, err := issuer.Issue(strangerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/issues", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestIssueStatus_OperatorCannotApprove(t *testing.T) {
	done := domain.Issue{
		ID:              12,
		VIN:             "N7V1K1SA9SK000001",
		Status:          domain.IssueStatusDone,
		IssueReporterID: operatorUserID,
		Description:     "awaiting sign-off",
	}
	repo := newHTTPFakeIssueRepo(done)
	router, issuer := newIssueRouter(repo)

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	for _, target := range []string{"APPROVED", "CONDITIONAL_APPROVED"} {
		body, _ := json.Marshal(map[string]string{"status": target})
		req := httptest.NewRequest(http.MethodPatch, "/api/v1/issues/12/status", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("%s status = %d, want %d (body: %s)", target, rec.Code, http.StatusForbidden, rec.Body.String())
		}
		if repo.issues[12].Status != domain.IssueStatusDone {
			t.Fatalf("%s mutated status to %s", target, repo.issues[12].Status)
		}
	}
}

func TestIssueCreate_QualityForbidden(t *testing.T) {
	router, issuer := newIssueRouter(newHTTPFakeIssueRepo())
	token, err := issuer.Issue(qualityUserID, domain.RoleCodeQuality)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{
		"vin": "N7V1K1SA9SK000001", "source_type": "MANUAL", "severity": "LOW", "description": "x",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/issues", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestIssueStatus_AssemblyCannotApprove(t *testing.T) {
	done := domain.Issue{
		ID:              12,
		VIN:             "N7V1K1SA9SK000001",
		Status:          domain.IssueStatusDone,
		IssueReporterID: assemblyUserID,
		Description:     "awaiting sign-off",
	}
	repo := newHTTPFakeIssueRepo(done)
	router, issuer := newIssueRouter(repo)
	token, err := issuer.Issue(assemblyUserID, domain.RoleCodeAssembly)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{"status": "APPROVED"})
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/issues/12/status", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestIssueStatus_QualityCanApprove(t *testing.T) {
	done := domain.Issue{
		ID:              12,
		VIN:             "N7V1K1SA9SK000001",
		Status:          domain.IssueStatusDone,
		IssueReporterID: operatorUserID,
		Description:     "awaiting sign-off",
	}
	router, issuer := newIssueRouter(newHTTPFakeIssueRepo(done))
	token, err := issuer.Issue(qualityUserID, domain.RoleCodeQuality)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{"status": "APPROVED"})
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/issues/12/status", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}
