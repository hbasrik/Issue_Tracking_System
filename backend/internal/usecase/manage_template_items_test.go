package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

type templateCatalogueFake struct {
	templates  map[int]domain.ChecklistTemplate
	items      map[int][]domain.ChecklistTemplateItem
	nextID     int
	evaluated  map[int]int
	issueLinked map[int]int
	pendingVINs map[int]int
	createAff  int
	createProt int
	deletedPending map[int]int64
	insertedPending map[int]int64
}

var _ repository.ChecklistProgressRepository = (*templateCatalogueFake)(nil)

func newTemplateCatalogueFake() *templateCatalogueFake {
	branch := domain.EOLItemPhaseBranch
	return &templateCatalogueFake{
		templates: map[int]domain.ChecklistTemplate{
			1: {ID: 1, Type: domain.ChecklistTypeEOL, Name: "EOL", IsActive: true},
			2: {ID: 2, Type: domain.ChecklistTypeTest, Name: "TEST", IsActive: true},
		},
		items: map[int][]domain.ChecklistTemplateItem{
			1: {
				{ID: 10, TemplateID: 1, ItemNo: 1, ItemText: "Paint", EolPhase: &branch, IsActive: true},
				{ID: 11, TemplateID: 1, ItemNo: 2, ItemText: "Gaps", EolPhase: &branch, IsActive: true},
			},
			2: {
				{ID: 20, TemplateID: 2, ItemNo: 1, ItemText: "Dyno", IsActive: true},
			},
		},
		nextID:      100,
		evaluated:   map[int]int{10: 3},
		issueLinked: map[int]int{},
		pendingVINs: map[int]int{10: 5, 11: 2},
		createAff:   7,
		createProt:  3,
		deletedPending:  map[int]int64{},
		insertedPending: map[int]int64{},
	}
}

func (f *templateCatalogueFake) ListByVINAndType(context.Context, string, domain.ChecklistType) ([]domain.ChecklistProgress, error) {
	return nil, nil
}
func (f *templateCatalogueFake) ResolveDefaultTemplateID(context.Context, domain.ChecklistType) (int, error) {
	return 0, domain.ErrNotFound
}
func (f *templateCatalogueFake) ListItemsWithProgress(context.Context, string, domain.ChecklistType, int) ([]domain.ChecklistItemView, error) {
	return nil, nil
}
func (f *templateCatalogueFake) SaveResult(context.Context, domain.ChecklistProgress) error {
	return domain.ErrNotFound
}
func (f *templateCatalogueFake) ListTemplates(context.Context) ([]domain.ChecklistTemplateSummary, error) {
	return nil, nil
}

func (f *templateCatalogueFake) GetTemplate(_ context.Context, id int) (*domain.ChecklistTemplate, error) {
	t, ok := f.templates[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := t
	return &cp, nil
}

func (f *templateCatalogueFake) GetTemplateItem(_ context.Context, itemID int) (*domain.ChecklistTemplateItem, error) {
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

func (f *templateCatalogueFake) ListTemplateItems(_ context.Context, templateID int) ([]domain.ChecklistTemplateItem, error) {
	out := append([]domain.ChecklistTemplateItem{}, f.items[templateID]...)
	return out, nil
}

func (f *templateCatalogueFake) CreateTemplateItem(_ context.Context, item *domain.ChecklistTemplateItem) (*domain.ChecklistTemplateItem, error) {
	f.nextID++
	created := *item
	created.ID = f.nextID
	created.ItemNo = int16(len(f.items[item.TemplateID]) + 1)
	created.IsActive = true
	f.items[item.TemplateID] = append(f.items[item.TemplateID], created)
	return &created, nil
}

func (f *templateCatalogueFake) UpdateTemplateItem(_ context.Context, item *domain.ChecklistTemplateItem) error {
	list := f.items[item.TemplateID]
	for i := range list {
		if list[i].ID == item.ID {
			list[i] = *item
			f.items[item.TemplateID] = list
			return nil
		}
	}
	return domain.ErrNotFound
}

func (f *templateCatalogueFake) DeleteTemplateItem(_ context.Context, itemID int) error {
	for tid, list := range f.items {
		for i := range list {
			if list[i].ID == itemID {
				f.items[tid] = append(list[:i], list[i+1:]...)
				return nil
			}
		}
	}
	return domain.ErrNotFound
}

func (f *templateCatalogueFake) ReorderTemplateItems(_ context.Context, templateID int, itemIDs []int) error {
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

func (f *templateCatalogueFake) CountEvaluatedProgressVINs(_ context.Context, itemID int) (int, error) {
	return f.evaluated[itemID], nil
}
func (f *templateCatalogueFake) CountIssueLinkedVINs(_ context.Context, itemID int) (int, error) {
	return f.issueLinked[itemID], nil
}
func (f *templateCatalogueFake) DeactivateImpact(_ context.Context, itemID int) (int, int, error) {
	return f.pendingVINs[itemID], f.evaluated[itemID] + f.issueLinked[itemID], nil
}
func (f *templateCatalogueFake) CreateImpact(_ context.Context, _ int, _ domain.ChecklistType) (int, int, error) {
	return f.createAff, f.createProt, nil
}
func (f *templateCatalogueFake) DeletePendingProgressForItem(_ context.Context, itemID int) (int64, error) {
	n := int64(f.pendingVINs[itemID])
	f.deletedPending[itemID] = n
	f.pendingVINs[itemID] = 0
	return n, nil
}
func (f *templateCatalogueFake) InsertPendingForNotStartedVehicles(_ context.Context, itemID, _ int, _ domain.ChecklistType) (int64, error) {
	n := int64(f.createAff)
	f.insertedPending[itemID] = n
	return n, nil
}

func TestCreateTemplateItem_AppendsActiveEOLItem(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	depot := domain.EOLItemPhaseDepot

	got, err := svc.CreateTemplateItem(context.Background(), CreateTemplateItemInput{
		TemplateID: 1,
		ItemText:   "  Charge port  ",
		EolPhase:   &depot,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if got.ItemText != "Charge port" || !got.IsActive {
		t.Fatalf("item = %+v", got)
	}
	if got.EolPhase == nil || *got.EolPhase != domain.EOLItemPhaseDepot {
		t.Fatalf("phase = %v", got.EolPhase)
	}
	if fake.insertedPending[got.ID] != 7 {
		t.Fatalf("backfill = %d, want 7", fake.insertedPending[got.ID])
	}
}

func TestCreateTemplateItem_RejectsPhaseOnTest(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	branch := domain.EOLItemPhaseBranch
	_, err := svc.CreateTemplateItem(context.Background(), CreateTemplateItemInput{
		TemplateID: 2,
		ItemText:   "Extra",
		EolPhase:   &branch,
	})
	if !errors.Is(err, domain.ErrEOLPhaseNotAllowed) {
		t.Fatalf("err = %v, want ErrEOLPhaseNotAllowed", err)
	}
}

func TestUpdateTemplateItem_Deactivates(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	off := false
	got, err := svc.UpdateTemplateItem(context.Background(), UpdateTemplateItemInput{
		TemplateID: 1,
		ItemID:     11,
		IsActive:   &off,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if got.IsActive {
		t.Fatal("expected inactive")
	}
	if fake.deletedPending[11] != 2 {
		t.Fatalf("pending cleared = %d, want 2", fake.deletedPending[11])
	}
}

func TestUpdateTemplateItem_ReactivatesBackfill(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	off := false
	if _, err := svc.UpdateTemplateItem(context.Background(), UpdateTemplateItemInput{
		TemplateID: 1, ItemID: 11, IsActive: &off,
	}); err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	on := true
	if _, err := svc.UpdateTemplateItem(context.Background(), UpdateTemplateItemInput{
		TemplateID: 1, ItemID: 11, IsActive: &on,
	}); err != nil {
		t.Fatalf("activate: %v", err)
	}
	if fake.insertedPending[11] != 7 {
		t.Fatalf("reactivate backfill = %d, want 7", fake.insertedPending[11])
	}
}

func TestUpdateTemplateItem_TextOnlyNoPropagation(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	text := "Paint updated"
	if _, err := svc.UpdateTemplateItem(context.Background(), UpdateTemplateItemInput{
		TemplateID: 1, ItemID: 10, ItemText: &text,
	}); err != nil {
		t.Fatalf("update: %v", err)
	}
	if len(fake.deletedPending) != 0 || len(fake.insertedPending) != 0 {
		t.Fatalf("text edit must not propagate progress")
	}
}

func TestDeleteTemplateItem_InUse(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	err := svc.DeleteTemplateItem(context.Background(), 1, 10)
	var inUse *domain.TemplateItemInUseError
	if !errors.As(err, &inUse) || inUse.VehicleCount != 3 {
		t.Fatalf("err = %v, want in-use with 3 vehicles", err)
	}
	if _, err := fake.GetTemplateItem(context.Background(), 10); err != nil {
		t.Fatal("in-use item must not be deleted")
	}
}

func TestDeleteTemplateItem_Unused(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	if err := svc.DeleteTemplateItem(context.Background(), 1, 11); err != nil {
		t.Fatalf("delete unused: %v", err)
	}
	if _, err := fake.GetTemplateItem(context.Background(), 11); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want not found", err)
	}
	if fake.deletedPending[11] != 2 {
		t.Fatalf("pending cleanup = %d, want 2", fake.deletedPending[11])
	}
}

func TestPreviewTemplateItemImpact_Deactivate(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	got, err := svc.PreviewTemplateItemImpact(context.Background(), 1, 10, "deactivate")
	if err != nil {
		t.Fatalf("impact: %v", err)
	}
	if got.Affected != 5 || got.Protected != 3 || got.Action != "deactivate" {
		t.Fatalf("impact = %+v", got)
	}
}

func TestReorderTemplateItems(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	if err := svc.ReorderTemplateItems(context.Background(), 1, []int{11, 10}); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	items, _ := fake.ListTemplateItems(context.Background(), 1)
	if items[0].ID != 11 || items[0].ItemNo != 1 || items[1].ID != 10 {
		t.Fatalf("order = %+v", items)
	}
}

func TestReorderTemplateItems_RejectsPartialList(t *testing.T) {
	fake := newTemplateCatalogueFake()
	svc := NewChecklistResultRecorder(nil, fake, nil, nil)
	err := svc.ReorderTemplateItems(context.Background(), 1, []int{10})
	if !errors.Is(err, domain.ErrTemplateItemReorderInvalid) {
		t.Fatalf("err = %v", err)
	}
}
