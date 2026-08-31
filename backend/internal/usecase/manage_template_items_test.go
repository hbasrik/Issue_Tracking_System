package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

type templateCatalogueFake struct {
	templates map[int]domain.ChecklistTemplate
	items     map[int][]domain.ChecklistTemplateItem
	nextID    int
	progress  map[int]int
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
		nextID:   100,
		progress: map[int]int{10: 3},
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

func (f *templateCatalogueFake) CountProgressVINs(_ context.Context, itemID int) (int, error) {
	return f.progress[itemID], nil
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
