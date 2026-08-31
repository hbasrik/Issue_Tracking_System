package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
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
	nextID    int
	progress  map[int]int
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
			1: {{
				ID: 1, TemplateID: 1, ItemNo: 1, ItemText: "Verify exterior paint",
				EolPhase: eolBranchPtr(), IsActive: true,
			}},
		},
		nextID:   50,
		progress: map[int]int{1: 2},
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

func (f *httpFakeChecklistRepo) GetTemplate(_ context.Context, templateID int) (*domain.ChecklistTemplate, error) {
	for _, t := range f.templates {
		if t.ID == templateID {
			return &domain.ChecklistTemplate{
				ID: t.ID, VehicleModelID: t.VehicleModelID, Type: t.Type,
				Name: t.Name, IsActive: t.IsActive,
			}, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *httpFakeChecklistRepo) GetTemplateItem(_ context.Context, itemID int) (*domain.ChecklistTemplateItem, error) {
	for _, list := range f.items {
		for i := range list {
			if list[i].ID == itemID {
				cp := list[i]
				return &cp, nil
			}
		}
	}
	return nil, domain.ErrNotFound
}

func (f *httpFakeChecklistRepo) CreateTemplateItem(_ context.Context, item *domain.ChecklistTemplateItem) (*domain.ChecklistTemplateItem, error) {
	f.nextID++
	created := *item
	created.ID = f.nextID
	created.ItemNo = int16(len(f.items[item.TemplateID]) + 1)
	created.IsActive = true
	f.items[item.TemplateID] = append(f.items[item.TemplateID], created)
	for i := range f.templates {
		if f.templates[i].ID == item.TemplateID {
			f.templates[i].ItemCount++
		}
	}
	return &created, nil
}

func (f *httpFakeChecklistRepo) UpdateTemplateItem(_ context.Context, item *domain.ChecklistTemplateItem) error {
	list := f.items[item.TemplateID]
	for i := range list {
		if list[i].ID == item.ID {
			wasActive := list[i].IsActive
			list[i] = *item
			f.items[item.TemplateID] = list
			if wasActive != item.IsActive {
				delta := -1
				if item.IsActive {
					delta = 1
				}
				for j := range f.templates {
					if f.templates[j].ID == item.TemplateID {
						f.templates[j].ItemCount += delta
					}
				}
			}
			return nil
		}
	}
	return domain.ErrNotFound
}

func (f *httpFakeChecklistRepo) DeleteTemplateItem(_ context.Context, itemID int) error {
	for tid, list := range f.items {
		for i := range list {
			if list[i].ID == itemID {
				if list[i].IsActive {
					for j := range f.templates {
						if f.templates[j].ID == tid {
							f.templates[j].ItemCount--
						}
					}
				}
				f.items[tid] = append(list[:i], list[i+1:]...)
				return nil
			}
		}
	}
	return domain.ErrNotFound
}

func (f *httpFakeChecklistRepo) ReorderTemplateItems(_ context.Context, templateID int, itemIDs []int) error {
	byID := map[int]domain.ChecklistTemplateItem{}
	for _, it := range f.items[templateID] {
		byID[it.ID] = it
	}
	next := make([]domain.ChecklistTemplateItem, 0, len(itemIDs))
	for i, id := range itemIDs {
		it, ok := byID[id]
		if !ok {
			return domain.ErrNotFound
		}
		it.ItemNo = int16(i + 1)
		next = append(next, it)
	}
	f.items[templateID] = next
	return nil
}

func (f *httpFakeChecklistRepo) CountProgressVINs(_ context.Context, itemID int) (int, error) {
	return f.progress[itemID], nil
}

func newChecklistTemplateRouter(checklists repository.ChecklistProgressRepository) (http.Handler, *auth.Issuer) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:     issuer,
		Roles:      newFakeRoleRepo(),
		Checklists: usecase.NewChecklistResultRecorder(nil, checklists, nil, nil),
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

func eolBranchPtr() *domain.EOLItemPhase {
	p := domain.EOLItemPhaseBranch
	return &p
}

func TestChecklistTemplateItemCreate_TestType(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	body := `{"ItemText":"New dyno check"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/checklist-templates/3/items", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var item domain.ChecklistTemplateItem
	if err := json.Unmarshal(rec.Body.Bytes(), &item); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if item.ItemText != "New dyno check" || !item.IsActive || item.TemplateID != 3 {
		t.Fatalf("item = %+v", item)
	}
}

func TestChecklistTemplateItemCreate_OperatorForbidden(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/checklist-templates/3/items",
		strings.NewReader(`{"ItemText":"nope"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestChecklistTemplateItemDelete_InUse(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/checklist-templates/1/items/1", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusConflict, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("2 araçta kullanılmış")) {
		t.Errorf("body = %s", rec.Body.String())
	}
}

func TestChecklistTemplateItemDelete_Unused(t *testing.T) {
	repo := newHTTPFakeChecklistRepo()
	router, issuer := newChecklistTemplateRouter(repo)
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	created, err := repo.CreateTemplateItem(context.Background(), &domain.ChecklistTemplateItem{
		TemplateID: 3, ItemText: "scratch", IsActive: true,
	})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	req := httptest.NewRequest(http.MethodDelete,
		"/api/v1/checklist-templates/3/items/"+strconv.Itoa(created.ID), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusNoContent, rec.Body.String())
	}
}

func TestChecklistTemplateItemPatch_Deactivate(t *testing.T) {
	router, issuer := newChecklistTemplateRouter(newHTTPFakeChecklistRepo())
	token, err := issuer.Issue(managerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/checklist-templates/1/items/1",
		strings.NewReader(`{"IsActive":false}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusOK, rec.Body.String())
	}
	var item domain.ChecklistTemplateItem
	if err := json.Unmarshal(rec.Body.Bytes(), &item); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if item.IsActive {
		t.Fatal("expected inactive")
	}
}
