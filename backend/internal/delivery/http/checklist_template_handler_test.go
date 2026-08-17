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

// httpFakeChecklistRepo is enough of ChecklistProgressRepository to serve the
// /templates admin list: three v2 templates with live item counts.
type httpFakeChecklistRepo struct {
	templates []domain.ChecklistTemplateSummary
	items     map[int][]domain.ChecklistTemplateItem
}

var _ repository.ChecklistProgressRepository = (*httpFakeChecklistRepo)(nil)

func newHTTPFakeChecklistRepo() *httpFakeChecklistRepo {
	return &httpFakeChecklistRepo{
		templates: []domain.ChecklistTemplateSummary{
			{ID: 1, Type: domain.ChecklistTypeEOL, Name: "Default EoL Template (16 items, Branch + Depot)", IsActive: true, ItemCount: 16},
			{ID: 2, Type: domain.ChecklistTypeShipment, Name: "Default Customer Vehicle Checklist (43 items)", IsActive: true, ItemCount: 43},
			{ID: 3, Type: domain.ChecklistTypeTest, Name: "Default Test Checklist (45 items)", IsActive: true, ItemCount: 45},
		},
		items: map[int][]domain.ChecklistTemplateItem{
			1: {{ID: 1, TemplateID: 1, ItemNo: 1, ItemText: "Verify exterior paint", IsActive: true}},
		},
	}
}

func (f *httpFakeChecklistRepo) ListByVINAndType(context.Context, string, domain.ChecklistType) ([]domain.ChecklistProgress, error) {
	return nil, nil
}
func (f *httpFakeChecklistRepo) ResolveDefaultTemplateID(context.Context, domain.ChecklistType) (int, error) {
	return 0, domain.ErrNotFound
}
func (f *httpFakeChecklistRepo) ListItemsWithProgress(context.Context, string, domain.ChecklistType, int) ([]domain.ChecklistItemView, error) {
	return nil, nil
}
func (f *httpFakeChecklistRepo) SaveResult(context.Context, domain.ChecklistProgress) error {
	return nil
}
func (f *httpFakeChecklistRepo) ListTemplates(context.Context) ([]domain.ChecklistTemplateSummary, error) {
	return f.templates, nil
}
func (f *httpFakeChecklistRepo) ListTemplateItems(_ context.Context, templateID int) ([]domain.ChecklistTemplateItem, error) {
	return f.items[templateID], nil
}

func newChecklistTemplateRouter(checklists repository.ChecklistProgressRepository) (http.Handler, *auth.Issuer) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:     issuer,
		Roles:      newFakeRoleRepo(),
		Checklists: usecase.NewChecklistResultRecorder(nil, checklists),
	})
	return router, issuer
}

// TestChecklistTemplateList_ReturnsAllThreeTypes is the contract the
// /templates page depends on: live counts for EOL, SHIPMENT and TEST, never
// the v1 hardcoded 13/43 pair.
func TestChecklistTemplateList_ReturnsAllThreeTypes(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checklist-templates", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload struct {
		Items []domain.ChecklistTemplateSummary `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Items) != 3 {
		t.Fatalf("templates = %d, want 3", len(payload.Items))
	}

	got := map[domain.ChecklistType]int{}
	for _, row := range payload.Items {
		got[row.Type] = row.ItemCount
	}
	want := map[domain.ChecklistType]int{
		domain.ChecklistTypeEOL:      16,
		domain.ChecklistTypeShipment: 43,
		domain.ChecklistTypeTest:     45,
	}
	for typ, count := range want {
		if got[typ] != count {
			t.Errorf("%s item_count = %d, want %d", typ, got[typ], count)
		}
	}
}

func TestChecklistTemplateList_OperatorForbidden(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checklist-templates", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestChecklistTemplateItems_ReturnsLiveItems(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/checklist-templates/1/items", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload struct {
		Items []domain.ChecklistTemplateItem `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Items) != 1 || payload.Items[0].ItemText == "" {
		t.Errorf("items = %+v, want the live template item", payload.Items)
	}
}
