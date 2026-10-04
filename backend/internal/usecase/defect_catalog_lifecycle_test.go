package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

// lifecycleCatalog is an in-memory catalogue with zones, parts, types and
// processes whose active flags the tests flip.
type lifecycleCatalog struct {
	repository.DefectCatalogRepository // unimplemented methods panic

	zones     map[int]*domain.DefectZone
	parts     map[int]*domain.DefectPart
	types     map[int]*domain.DefectType
	processes map[int]*domain.DefectProcess
	created   []domain.DefectPart
	updated   []domain.DefectPart
}

func newLifecycleCatalog() *lifecycleCatalog {
	c := &lifecycleCatalog{
		zones: map[int]*domain.DefectZone{
			1: {ID: 1, Code: "10", NameTR: "Body", IsActive: true},
			2: {ID: 2, Code: "20", NameTR: "Şasi", IsActive: true},
			9: {ID: 9, Code: domain.DefectZoneCodeOther, NameTR: "Diğer", IsActive: true},
		},
		parts: map[int]*domain.DefectPart{
			10: {ID: 10, ZoneID: 1, Code: "10-01", NameTR: "Kapı", NameEN: "Door", IsActive: true},
			11: {ID: 11, ZoneID: 1, Code: "10-02", NameTR: "Tampon", NameEN: "Bumper", IsActive: true},
			20: {ID: 20, ZoneID: 2, Code: "20-01", NameTR: "Şasi", NameEN: "Chassis", IsActive: true},
			99: {ID: 99, ZoneID: 9, Code: domain.DefectPartCodeOther, NameTR: "Diğer", NameEN: "Other", IsActive: true},
		},
		types: map[int]*domain.DefectType{},
		processes: map[int]*domain.DefectProcess{
			3: {ID: 3, Code: "ASSEMBLY", IsActive: true},
			4: {ID: 4, Code: "PAINT", IsActive: true},
		},
	}
	asm, paint := 3, 4
	c.types[1] = &domain.DefectType{ID: 1, Code: "01", NameTR: "Boşluk", NameEN: "Gap", IsActive: true}
	c.types[5] = &domain.DefectType{ID: 5, Code: "05", NameTR: "Eksik parça", NameEN: "Missing", DefaultProcessID: &asm, IsActive: true}
	c.types[2] = &domain.DefectType{ID: 2, Code: "02", NameTR: "Boya", NameEN: "Paint", DefaultProcessID: &paint, IsActive: true}
	c.types[99] = &domain.DefectType{ID: 99, Code: domain.DefectTypeCodeOther, NameTR: "Diğer", NameEN: "Other", IsActive: true}
	return c
}

func (c *lifecycleCatalog) GetZone(_ context.Context, id int) (*domain.DefectZone, error) {
	z, ok := c.zones[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *z
	return &cp, nil
}

func (c *lifecycleCatalog) GetPart(_ context.Context, id int) (*domain.DefectPart, error) {
	p, ok := c.parts[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *p
	cp.ZoneIsActive = c.zones[p.ZoneID].IsActive
	return &cp, nil
}

func (c *lifecycleCatalog) GetType(_ context.Context, id int) (*domain.DefectType, error) {
	t, ok := c.types[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *t
	return &cp, nil
}

func (c *lifecycleCatalog) GetProcess(_ context.Context, id int) (*domain.DefectProcess, error) {
	p, ok := c.processes[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *p
	return &cp, nil
}

func (c *lifecycleCatalog) CreatePart(_ context.Context, p *domain.DefectPart) (int, error) {
	c.created = append(c.created, *p)
	return 1000 + len(c.created), nil
}

func (c *lifecycleCatalog) UpdatePart(_ context.Context, p *domain.DefectPart) error {
	c.updated = append(c.updated, *p)
	return nil
}

func (c *lifecycleCatalog) ListParts(_ context.Context, zoneID *int) ([]domain.DefectPart, error) {
	var out []domain.DefectPart
	for _, p := range c.parts {
		if zoneID == nil || p.ZoneID == *zoneID {
			out = append(out, *p)
		}
	}
	return out, nil
}

func (c *lifecycleCatalog) ListTypes(_ context.Context) ([]domain.DefectType, error) {
	var out []domain.DefectType
	for _, t := range c.types {
		out = append(out, *t)
	}
	return out, nil
}

func (c *lifecycleCatalog) CreateType(_ context.Context, _ *domain.DefectType) (int, error) {
	return 2000, nil
}

func (c *lifecycleCatalog) UpdateZone(_ context.Context, _ *domain.DefectZone) error { return nil }
func (c *lifecycleCatalog) UpdateType(_ context.Context, _ *domain.DefectType) error { return nil }

// --- Issue create / classification ---

const lifecycleReporter = 7

func seededIssue(repo *fakeIssueRepo, partID, typeID int, processID *int) int64 {
	p, t := partID, typeID
	id, _ := repo.Create(context.Background(), &domain.Issue{
		VIN:                  "1KTSKRC2XSB010042",
		Status:               domain.IssueStatusOpen,
		IssueReporterID:      lifecycleReporter,
		DefectPartID:         &p,
		DefectTypeID:         &t,
		ResponsibleProcessID: processID,
		DefectCode:           "10-01-05",
		DefectPartNameTR:     "Kapı (eski ad)",
		DefectPartNameEN:     "Door (old name)",
		DefectTypeNameTR:     "Eksik parça (eski ad)",
		DefectTypeNameEN:     "Missing (old name)",
	})
	return id
}

func lifecycleManager(repo *fakeIssueRepo, cat *lifecycleCatalog) *usecase.IssueManager {
	return usecase.NewIssueManager(repo, newFakeAuditRepo(), &passthroughFakeUoW{}, createIssueStubVehicles{}, cat)
}

func classify(mgr *usecase.IssueManager, id int64, partID, typeID int, mut func(*usecase.UpdateClassificationInput)) (*domain.Issue, error) {
	p, t := partID, typeID
	in := usecase.UpdateClassificationInput{
		IssueID:      id,
		ActorID:      lifecycleReporter,
		DefectPartID: &p,
		DefectTypeID: &t,
	}
	if mut != nil {
		mut(&in)
	}
	return mgr.UpdateClassification(context.Background(), in)
}

func TestUpdateClassification_KeepsInactivePartTypeAndProcess(t *testing.T) {
	cat := newLifecycleCatalog()
	repo := newFakeIssueRepo()
	asm := 3
	id := seededIssue(repo, 10, 5, &asm)
	cat.parts[10].IsActive = false
	cat.types[5].IsActive = false
	cat.processes[3].IsActive = false

	got, err := classify(lifecycleManager(repo, cat), id, 10, 5, nil)
	if err != nil {
		t.Fatalf("unchanged inactive values must not block the edit: %v", err)
	}
	if got.ResponsibleProcessID == nil || *got.ResponsibleProcessID != 3 {
		t.Fatalf("process must be preserved, got %v", got.ResponsibleProcessID)
	}
	if got.DefectCode != "10-01-05" {
		t.Fatalf("defect code must be preserved, got %q", got.DefectCode)
	}
	if got.DefectPartNameTR != "Kapı (eski ad)" || got.DefectTypeNameTR != "Eksik parça (eski ad)" {
		t.Fatalf("snapshots must be preserved, got %q / %q", got.DefectPartNameTR, got.DefectTypeNameTR)
	}
}

func TestUpdateClassification_InactivePartKeptWhileTypeChanges(t *testing.T) {
	cat := newLifecycleCatalog()
	repo := newFakeIssueRepo()
	id := seededIssue(repo, 10, 5, nil)
	cat.parts[10].IsActive = false

	got, err := classify(lifecycleManager(repo, cat), id, 10, 2, nil)
	if err != nil {
		t.Fatalf("keeping an inactive part while changing the type must work: %v", err)
	}
	if got.DefectPartNameTR != "Kapı (eski ad)" {
		t.Fatalf("part snapshot must be kept, got %q", got.DefectPartNameTR)
	}
	if got.DefectTypeNameTR != "Boya" {
		t.Fatalf("new type gets a fresh snapshot, got %q", got.DefectTypeNameTR)
	}
	if got.ResponsibleProcessID == nil || *got.ResponsibleProcessID != 4 {
		t.Fatalf("omitted process + changed type -> new type default, got %v", got.ResponsibleProcessID)
	}
}

func TestUpdateClassification_UnchangedInactiveProcessSentBackIsAccepted(t *testing.T) {
	cat := newLifecycleCatalog()
	repo := newFakeIssueRepo()
	asm := 3
	id := seededIssue(repo, 10, 5, &asm)
	cat.processes[3].IsActive = false

	got, err := classify(lifecycleManager(repo, cat), id, 11, 5, func(in *usecase.UpdateClassificationInput) {
		in.ResponsibleProcessSet = true
		in.ResponsibleProcessID = &asm
	})
	if err != nil {
		t.Fatalf("older clients send the stored process back; must not fail: %v", err)
	}
	if got.ResponsibleProcessID == nil || *got.ResponsibleProcessID != 3 {
		t.Fatalf("process must be preserved, got %v", got.ResponsibleProcessID)
	}
}

func TestUpdateClassification_NewlyChosenInactiveValuesRejected(t *testing.T) {
	cases := []struct {
		name    string
		prepare func(*lifecycleCatalog)
		partID  int
		typeID  int
		mut     func(*usecase.UpdateClassificationInput)
		want    error
	}{
		{"inactive part", func(c *lifecycleCatalog) { c.parts[11].IsActive = false }, 11, 5, nil, domain.ErrDefectCatalogueInactive},
		{"part in inactive zone", func(c *lifecycleCatalog) { c.zones[2].IsActive = false }, 20, 5, nil, domain.ErrDefectZoneInactive},
		{"inactive type", func(c *lifecycleCatalog) { c.types[2].IsActive = false }, 10, 2, nil, domain.ErrDefectCatalogueInactive},
		{"inactive process", func(c *lifecycleCatalog) { c.processes[4].IsActive = false }, 10, 5,
			func(in *usecase.UpdateClassificationInput) {
				p := 4
				in.ResponsibleProcessSet = true
				in.ResponsibleProcessID = &p
			}, domain.ErrDefectProcessInactive},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cat := newLifecycleCatalog()
			repo := newFakeIssueRepo()
			asm := 3
			id := seededIssue(repo, 10, 5, &asm)
			tc.prepare(cat)
			_, err := classify(lifecycleManager(repo, cat), id, tc.partID, tc.typeID, tc.mut)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestCreateIssue_PartUnderInactiveZoneRejected(t *testing.T) {
	cat := newLifecycleCatalog()
	cat.zones[1].IsActive = false
	mgr := lifecycleManager(newFakeIssueRepo(), cat)
	station, issueType := 3, 1
	create := func(partID int, custom string) error {
		p, ty := partID, 1
		_, err := mgr.Create(context.Background(), usecase.CreateIssueInput{
			VIN: "1KTSKRC2XSB010042", SourceType: domain.IssueSourceManual, StationID: &station,
			IssueTypeID: &issueType, Severity: domain.IssueSeverityMedium, Description: "x",
			ReporterID: lifecycleReporter, DefectPartID: &p, DefectTypeID: &ty, CustomPartName: custom,
		})
		return err
	}
	if err := create(10, ""); !errors.Is(err, domain.ErrDefectZoneInactive) {
		t.Fatalf("part under inactive zone: err = %v", err)
	}
	if err := create(99, "serbest metin"); err != nil {
		t.Fatalf("Other lives in its own zone and must stay usable: %v", err)
	}
}

// --- Catalogue admin ---

func TestCatalogAdmin_InactiveZoneAcceptsNoNewParts(t *testing.T) {
	cat := newLifecycleCatalog()
	cat.zones[1].IsActive = false
	admin := usecase.NewDefectCatalogAdmin(cat, nil, nil, nil)

	_, err := admin.CreatePart(context.Background(), usecase.UpsertPartInput{ZoneID: 1, Code: "10-50", NameTR: "a", NameEN: "a", IsActive: true})
	if !errors.Is(err, domain.ErrDefectZoneClosedForParts) {
		t.Fatalf("create in inactive zone: err = %v", err)
	}
	err = admin.UpdatePart(context.Background(), 20, usecase.UpsertPartInput{ZoneID: 1, Code: "20-01", NameTR: "Şasi", NameEN: "Chassis", IsActive: true})
	if !errors.Is(err, domain.ErrDefectZoneClosedForParts) {
		t.Fatalf("move into inactive zone: err = %v", err)
	}
	err = admin.UpdatePart(context.Background(), 10, usecase.UpsertPartInput{ZoneID: 1, Code: "10-01", NameTR: "Kapı yeni", NameEN: "Door", IsActive: false})
	if err != nil {
		t.Fatalf("editing a part already in the inactive zone must work: %v", err)
	}
}

func TestCatalogAdmin_OtherRowsProtected(t *testing.T) {
	cat := newLifecycleCatalog()
	admin := usecase.NewDefectCatalogAdmin(cat, nil, nil, nil)
	ctx := context.Background()

	checks := map[string]error{
		"deactivate Other zone": admin.UpdateZone(ctx, 9, usecase.UpsertZoneInput{Code: "99", NameTR: "Diğer", NameEN: "Other", IsActive: false}),
		"recode Other zone":     admin.UpdateZone(ctx, 9, usecase.UpsertZoneInput{Code: "98", NameTR: "Diğer", NameEN: "Other", IsActive: true}),
		"delete Other zone":     admin.DeleteZone(ctx, 1, 9),
		"deactivate Other part": admin.UpdatePart(ctx, 99, usecase.UpsertPartInput{ZoneID: 9, Code: "99-99", NameTR: "Diğer", NameEN: "Other", IsActive: false}),
		"move Other part":       admin.UpdatePart(ctx, 99, usecase.UpsertPartInput{ZoneID: 1, Code: "99-99", NameTR: "Diğer", NameEN: "Other", IsActive: true}),
		"delete Other part":     admin.DeletePart(ctx, 1, 99),
		"deactivate Other type": admin.UpdateType(ctx, 99, usecase.UpsertTypeInput{Code: "99", NameTR: "Diğer", NameEN: "Other", IsActive: false}),
		"delete Other type":     admin.DeleteType(ctx, 1, 99),
		"move part into Other zone": admin.UpdatePart(ctx, 10, usecase.UpsertPartInput{ZoneID: 9, Code: "10-01", NameTR: "Kapı", NameEN: "Door", IsActive: true}),
	}
	_, createErr := admin.CreatePart(ctx, usecase.UpsertPartInput{ZoneID: 9, Code: "99-01", NameTR: "x", NameEN: "x", IsActive: true})
	checks["create part in Other zone"] = createErr
	for name, err := range checks {
		if !errors.Is(err, domain.ErrDefectCatalogueProtected) {
			t.Errorf("%s: err = %v, want protected", name, err)
		}
	}
	if err := admin.UpdatePart(ctx, 99, usecase.UpsertPartInput{ZoneID: 9, Code: "99-99", NameTR: "Diğer (yeni ad)", NameEN: "Other", IsActive: true}); err != nil {
		t.Fatalf("renaming Other stays allowed: %v", err)
	}
}
