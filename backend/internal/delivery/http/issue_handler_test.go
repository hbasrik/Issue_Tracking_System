package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
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

func (f *httpFakeIssueRepo) Create(_ context.Context, issue *domain.Issue) (int64, error) {
	if issue.ClientRequestID != "" {
		for _, existing := range f.issues {
			if existing.ClientRequestID == issue.ClientRequestID {
				return existing.ID, nil
			}
		}
	}
	id := int64(len(f.issues) + 1)
	for f.issues[id] != nil {
		id++
	}
	stored := *issue
	stored.ID = id
	f.issues[id] = &stored
	return id, nil
}

func (f *httpFakeIssueRepo) GetByID(_ context.Context, id int64) (*domain.Issue, error) {
	issue, ok := f.issues[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *issue
	return &copied, nil
}

func (f *httpFakeIssueRepo) GetByClientRequestID(_ context.Context, clientRequestID string) (*domain.Issue, error) {
	if clientRequestID == "" {
		return nil, domain.ErrNotFound
	}
	for _, issue := range f.issues {
		if issue.ClientRequestID == clientRequestID {
			copied := *issue
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
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

func (f *httpFakeIssueRepo) ListAll(_ context.Context, q domain.IssueListQuery) (domain.IssueListPage, error) {
	return paginateHTTPFakeIssues(f.issues, "", q), nil
}

func (f *httpFakeIssueRepo) ListByVIN(_ context.Context, vin string, q domain.IssueListQuery) (domain.IssueListPage, error) {
	return paginateHTTPFakeIssues(f.issues, vin, q), nil
}

func paginateHTTPFakeIssues(all map[int64]*domain.Issue, vin string, q domain.IssueListQuery) domain.IssueListPage {
	statusSet := map[domain.IssueStatus]struct{}{}
	for _, s := range q.Statuses {
		statusSet[s] = struct{}{}
	}
	var out []domain.Issue
	for _, issue := range all {
		if vin != "" && issue.VIN != vin {
			continue
		}
		if len(statusSet) > 0 {
			if _, ok := statusSet[issue.Status]; !ok {
				continue
			}
		}
		out = append(out, *issue)
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].IssueDate.Equal(out[j].IssueDate) {
			return out[i].IssueDate.After(out[j].IssueDate)
		}
		return out[i].ID > out[j].ID
	})
	if q.BeforeDate != nil && q.BeforeID != nil {
		filtered := out[:0]
		for _, issue := range out {
			if issue.IssueDate.Before(*q.BeforeDate) ||
				(issue.IssueDate.Equal(*q.BeforeDate) && issue.ID < *q.BeforeID) {
				filtered = append(filtered, issue)
			}
		}
		out = filtered
	} else if q.Offset > 0 {
		if q.Offset >= len(out) {
			out = nil
		} else {
			out = out[q.Offset:]
		}
	}
	page := domain.IssueListPage{Items: out, NextOffset: q.Offset}
	if q.Limit > 0 && len(out) > q.Limit {
		page.HasMore = true
		page.Items = out[:q.Limit]
	}
	page.NextOffset = q.Offset + len(page.Items)
	if n := len(page.Items); n > 0 {
		last := page.Items[n-1]
		d := last.IssueDate
		id := last.ID
		page.NextBeforeDate = &d
		page.NextBeforeID = &id
	}
	return page
}

func (f *httpFakeIssueRepo) ListOpenByVIN(_ context.Context, vin string) ([]domain.Issue, error) {
	page := paginateHTTPFakeIssues(f.issues, vin, domain.IssueListQuery{})
	var out []domain.Issue
	for _, issue := range page.Items {
		if issue.Status.IsOpen() {
			out = append(out, issue)
		}
	}
	return out, nil
}

func (f *httpFakeIssueRepo) UpdateStatus(_ context.Context, id int64, status domain.IssueStatus, actorID int, _ string) error {
	issue, ok := f.issues[id]
	if !ok {
		return domain.ErrNotFound
	}
	now := time.Now()
	switch status {
	case domain.IssueStatusApproved:
		issue.ApproveReporterID, issue.ApproveDate = &actorID, &now
	case domain.IssueStatusConditionalApproved:
		issue.ConditionalApproveReporterID, issue.ConditionalApproveDate = &actorID, &now
	}
	issue.Status = status
	return nil
}

func (f *httpFakeIssueRepo) RevertApproval(_ context.Context, id int64) error {
	issue, ok := f.issues[id]
	if !ok {
		return domain.ErrNotFound
	}
	switch issue.Status {
	case domain.IssueStatusApproved, domain.IssueStatusConditionalApproved:
		issue.Status = domain.IssueStatusDone
		issue.ApproveReporterID = nil
		issue.ApproveDate = nil
		issue.ConditionalApproveReporterID = nil
		issue.ConditionalApproveDate = nil
		return nil
	default:
		return domain.ErrNotFound
	}
}

func (f *httpFakeIssueRepo) UpdateClassification(
	_ context.Context,
	id int64,
	partID, typeID, processID *int,
	customPart, customDefect, defectCode string,
	partNameTR, partNameEN, typeNameTR, typeNameEN string,
) error {
	issue, ok := f.issues[id]
	if !ok {
		return domain.ErrNotFound
	}
	issue.DefectPartID = partID
	issue.DefectTypeID = typeID
	issue.ResponsibleProcessID = processID
	issue.CustomPartName = customPart
	issue.CustomDefectName = customDefect
	issue.DefectCode = defectCode
	issue.DefectPartNameTR = partNameTR
	issue.DefectPartNameEN = partNameEN
	issue.DefectTypeNameTR = typeNameTR
	issue.DefectTypeNameEN = typeNameEN
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
func (httpNoopAudit) ListActivity(context.Context, domain.AuditActivityFilter) (*domain.AuditActivityPage, error) {
	return &domain.AuditActivityPage{Items: []domain.HomeActivityEntry{}}, nil
}

type httpNoopUoW struct{}

func (httpNoopUoW) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

type httpStubVehicles struct{}

func (httpStubVehicles) GetByVIN(_ context.Context, vin string) (*domain.Vehicle, error) {
	return &domain.Vehicle{VIN: vin, CurrentGlobalStatus: domain.VehicleStatusInProduction}, nil
}

type httpStubCatalog struct{}

func (httpStubCatalog) GetPart(_ context.Context, id int) (*domain.DefectPart, error) {
	return &domain.DefectPart{ID: id, Code: "10-01", IsActive: true}, nil
}
func (httpStubCatalog) GetType(_ context.Context, id int) (*domain.DefectType, error) {
	return &domain.DefectType{ID: id, Code: "01", IsActive: true}, nil
}
func (httpStubCatalog) GetProcess(_ context.Context, id int) (*domain.DefectProcess, error) {
	return &domain.DefectProcess{ID: id, Code: "WELD", IsActive: true}, nil
}

func newIssueRouter(issues repository.IssueRepository) (http.Handler, *auth.Issuer) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer: issuer,
		Roles:  newFakeRoleRepo(),
		Issues: usecase.NewIssueManager(issues, httpNoopAudit{}, httpNoopUoW{}, httpStubVehicles{}, httpStubCatalog{}),
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

func TestIssueCreate_IdempotencyKeyReplaysSameIssue(t *testing.T) {
	repo := newHTTPFakeIssueRepo()
	router, issuer := newIssueRouter(repo)
	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{
		"vin":            "N7V1K1SA9SK000001",
		"source_type":    "MANUAL",
		"severity":       "LOW",
		"description":    "queued report",
		"issue_type_id":  1,
		"station_id":     1,
		"defect_part_id": 10,
		"defect_type_id": 20,
	})
	key := "550e8400-e29b-41d4-a716-446655440000"
	post := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/issues", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", key)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	first := post()
	if first.Code != http.StatusCreated {
		t.Fatalf("first status = %d body %s", first.Code, first.Body.String())
	}
	var created domain.Issue
	if err := json.Unmarshal(first.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode first: %v", err)
	}
	second := post()
	if second.Code != http.StatusCreated {
		t.Fatalf("replay status = %d body %s", second.Code, second.Body.String())
	}
	var replayed domain.Issue
	if err := json.Unmarshal(second.Body.Bytes(), &replayed); err != nil {
		t.Fatalf("decode replay: %v", err)
	}
	if created.ID == 0 || created.ID != replayed.ID {
		t.Fatalf("ids first=%d replay=%d", created.ID, replayed.ID)
	}
	if len(repo.issues) != 1 {
		t.Fatalf("rows = %d, want 1", len(repo.issues))
	}
}

// TestIssueList_OmitLimitReturnsFullList pins the contract Home KPIs rely on:
// omitting ?limit= must not silently page (fake repo has 250 issues).
func TestIssueList_OmitLimitReturnsFullList(t *testing.T) {
	const n = 250
	issues := make([]domain.Issue, 0, n)
	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for i := 1; i <= n; i++ {
		issues = append(issues, domain.Issue{
			ID:              int64(i),
			VIN:             "N7V1K1SA9SK000001",
			Status:          domain.IssueStatusOpen,
			IssueReporterID: managerUserID,
			IssueDate:       base.Add(time.Duration(i) * time.Minute),
			Description:     "bulk",
		})
	}
	router, issuer := newIssueRouter(newHTTPFakeIssueRepo(issues...))
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/issues", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Items   []domain.Issue `json:"items"`
		HasMore bool           `json:"has_more"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Items) != n {
		t.Fatalf("omit limit returned %d items, want %d (silent default page size?)", len(payload.Items), n)
	}
	if payload.HasMore {
		t.Fatalf("has_more=true on unlimited list")
	}

	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/issues?limit=50", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, req2)
	var paged struct {
		Items   []domain.Issue `json:"items"`
		HasMore bool           `json:"has_more"`
	}
	_ = json.Unmarshal(rec2.Body.Bytes(), &paged)
	if len(paged.Items) != 50 || !paged.HasMore {
		t.Fatalf("limit=50 → %d has_more=%v, want 50/true", len(paged.Items), paged.HasMore)
	}
}
