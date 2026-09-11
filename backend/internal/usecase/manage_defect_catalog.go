package usecase

import (
	"context"
	"strings"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// DefectCatalogAdmin manages the defect classification masters.
type DefectCatalogAdmin struct {
	catalog repository.DefectCatalogRepository
}

// NewDefectCatalogAdmin constructs a DefectCatalogAdmin.
func NewDefectCatalogAdmin(catalog repository.DefectCatalogRepository) *DefectCatalogAdmin {
	return &DefectCatalogAdmin{catalog: catalog}
}

// --- Processes ---

func (a *DefectCatalogAdmin) ListProcesses(ctx context.Context) ([]domain.DefectProcess, error) {
	items, err := a.catalog.ListProcesses(ctx)
	if err != nil {
		return nil, err
	}
	if items == nil {
		return []domain.DefectProcess{}, nil
	}
	return items, nil
}

type UpsertProcessInput struct {
	Code      string
	NameTR    string
	NameEN    string
	SortOrder int
	IsActive  bool
}

func (a *DefectCatalogAdmin) CreateProcess(ctx context.Context, in UpsertProcessInput) (*domain.DefectProcess, error) {
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return nil, err
	}
	p := &domain.DefectProcess{
		Code: strings.TrimSpace(in.Code), NameTR: strings.TrimSpace(in.NameTR), NameEN: strings.TrimSpace(in.NameEN),
		SortOrder: in.SortOrder, IsActive: in.IsActive,
	}
	if p.SortOrder <= 0 {
		p.SortOrder = 1
	}
	id, err := a.catalog.CreateProcess(ctx, p)
	if err != nil {
		return nil, err
	}
	p.ID = id
	return p, nil
}

func (a *DefectCatalogAdmin) UpdateProcess(ctx context.Context, id int, in UpsertProcessInput) error {
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return err
	}
	return a.catalog.UpdateProcess(ctx, &domain.DefectProcess{
		ID: id, Code: strings.TrimSpace(in.Code), NameTR: strings.TrimSpace(in.NameTR), NameEN: strings.TrimSpace(in.NameEN),
		SortOrder: in.SortOrder, IsActive: in.IsActive,
	})
}

func (a *DefectCatalogAdmin) DeleteProcess(ctx context.Context, id int) error {
	n, err := a.catalog.CountProcessUsage(ctx, id)
	if err != nil {
		return err
	}
	if n > 0 {
		return &domain.CatalogInUseError{Kind: "process", Count: n}
	}
	return a.catalog.DeleteProcess(ctx, id)
}

func (a *DefectCatalogAdmin) ReorderProcesses(ctx context.Context, ids []int) error {
	return a.catalog.ReorderProcesses(ctx, ids)
}

// --- Zones ---

func (a *DefectCatalogAdmin) ListZones(ctx context.Context) ([]domain.DefectZone, error) {
	items, err := a.catalog.ListZones(ctx)
	if err != nil {
		return nil, err
	}
	if items == nil {
		return []domain.DefectZone{}, nil
	}
	return items, nil
}

type UpsertZoneInput struct {
	Code      string
	NameTR    string
	NameEN    string
	SortOrder int
	IsActive  bool
}

func (a *DefectCatalogAdmin) CreateZone(ctx context.Context, in UpsertZoneInput) (*domain.DefectZone, error) {
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return nil, err
	}
	z := &domain.DefectZone{
		Code: strings.TrimSpace(in.Code), NameTR: strings.TrimSpace(in.NameTR), NameEN: strings.TrimSpace(in.NameEN),
		SortOrder: in.SortOrder, IsActive: in.IsActive,
	}
	if z.SortOrder <= 0 {
		z.SortOrder = 1
	}
	id, err := a.catalog.CreateZone(ctx, z)
	if err != nil {
		return nil, err
	}
	z.ID = id
	return z, nil
}

func (a *DefectCatalogAdmin) UpdateZone(ctx context.Context, id int, in UpsertZoneInput) error {
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return err
	}
	return a.catalog.UpdateZone(ctx, &domain.DefectZone{
		ID: id, Code: strings.TrimSpace(in.Code), NameTR: strings.TrimSpace(in.NameTR), NameEN: strings.TrimSpace(in.NameEN),
		SortOrder: in.SortOrder, IsActive: in.IsActive,
	})
}

func (a *DefectCatalogAdmin) DeleteZone(ctx context.Context, id int) error {
	usage, err := a.catalog.CountZoneUsage(ctx, id)
	if err != nil {
		return err
	}
	if usage > 0 {
		return &domain.CatalogInUseError{Kind: "zone", Count: usage}
	}
	parts, err := a.catalog.CountZoneParts(ctx, id)
	if err != nil {
		return err
	}
	if parts > 0 {
		return &domain.CatalogInUseError{Kind: "zone", Count: parts}
	}
	return a.catalog.DeleteZone(ctx, id)
}

func (a *DefectCatalogAdmin) ReorderZones(ctx context.Context, ids []int) error {
	return a.catalog.ReorderZones(ctx, ids)
}

// --- Parts ---

func (a *DefectCatalogAdmin) ListParts(ctx context.Context, zoneID *int) ([]domain.DefectPart, error) {
	items, err := a.catalog.ListParts(ctx, zoneID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		return []domain.DefectPart{}, nil
	}
	return items, nil
}

type UpsertPartInput struct {
	ZoneID    int
	Code      string
	NameTR    string
	NameEN    string
	SortOrder int
	IsActive  bool
}

func (a *DefectCatalogAdmin) CreatePart(ctx context.Context, in UpsertPartInput) (*domain.DefectPart, error) {
	if in.ZoneID <= 0 {
		return nil, domain.ErrDefectZoneRequired
	}
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return nil, err
	}
	if _, err := a.catalog.GetZone(ctx, in.ZoneID); err != nil {
		return nil, err
	}
	p := &domain.DefectPart{
		ZoneID: in.ZoneID, Code: strings.TrimSpace(in.Code), NameTR: strings.TrimSpace(in.NameTR), NameEN: strings.TrimSpace(in.NameEN),
		SortOrder: in.SortOrder, IsActive: in.IsActive,
	}
	if p.SortOrder <= 0 {
		p.SortOrder = 1
	}
	id, err := a.catalog.CreatePart(ctx, p)
	if err != nil {
		return nil, err
	}
	p.ID = id
	return p, nil
}

func (a *DefectCatalogAdmin) UpdatePart(ctx context.Context, id int, in UpsertPartInput) error {
	if in.ZoneID <= 0 {
		return domain.ErrDefectZoneRequired
	}
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return err
	}
	if _, err := a.catalog.GetZone(ctx, in.ZoneID); err != nil {
		return err
	}
	return a.catalog.UpdatePart(ctx, &domain.DefectPart{
		ID: id, ZoneID: in.ZoneID, Code: strings.TrimSpace(in.Code), NameTR: strings.TrimSpace(in.NameTR), NameEN: strings.TrimSpace(in.NameEN),
		SortOrder: in.SortOrder, IsActive: in.IsActive,
	})
}

func (a *DefectCatalogAdmin) DeletePart(ctx context.Context, id int) error {
	n, err := a.catalog.CountPartUsage(ctx, id)
	if err != nil {
		return err
	}
	if n > 0 {
		return &domain.CatalogInUseError{Kind: "part", Count: n}
	}
	return a.catalog.DeletePart(ctx, id)
}

func (a *DefectCatalogAdmin) ReorderParts(ctx context.Context, zoneID int, ids []int) error {
	if zoneID <= 0 {
		return domain.ErrDefectZoneRequired
	}
	return a.catalog.ReorderParts(ctx, zoneID, ids)
}

// --- Types ---

func (a *DefectCatalogAdmin) ListTypes(ctx context.Context) ([]domain.DefectType, error) {
	items, err := a.catalog.ListTypes(ctx)
	if err != nil {
		return nil, err
	}
	if items == nil {
		return []domain.DefectType{}, nil
	}
	return items, nil
}

type UpsertTypeInput struct {
	Code             string
	NameTR           string
	NameEN           string
	DefaultProcessID *int
	SortOrder        int
	IsActive         bool
}

func (a *DefectCatalogAdmin) CreateType(ctx context.Context, in UpsertTypeInput) (*domain.DefectType, error) {
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return nil, err
	}
	t := &domain.DefectType{
		Code: strings.TrimSpace(in.Code), NameTR: strings.TrimSpace(in.NameTR), NameEN: strings.TrimSpace(in.NameEN),
		DefaultProcessID: in.DefaultProcessID, SortOrder: in.SortOrder, IsActive: in.IsActive,
	}
	if t.SortOrder <= 0 {
		t.SortOrder = 1
	}
	id, err := a.catalog.CreateType(ctx, t)
	if err != nil {
		return nil, err
	}
	t.ID = id
	return t, nil
}

func (a *DefectCatalogAdmin) UpdateType(ctx context.Context, id int, in UpsertTypeInput) error {
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return err
	}
	return a.catalog.UpdateType(ctx, &domain.DefectType{
		ID: id, Code: strings.TrimSpace(in.Code), NameTR: strings.TrimSpace(in.NameTR), NameEN: strings.TrimSpace(in.NameEN),
		DefaultProcessID: in.DefaultProcessID, SortOrder: in.SortOrder, IsActive: in.IsActive,
	})
}

func (a *DefectCatalogAdmin) DeleteType(ctx context.Context, id int) error {
	n, err := a.catalog.CountTypeUsage(ctx, id)
	if err != nil {
		return err
	}
	if n > 0 {
		return &domain.CatalogInUseError{Kind: "type", Count: n}
	}
	return a.catalog.DeleteType(ctx, id)
}

func (a *DefectCatalogAdmin) ReorderTypes(ctx context.Context, ids []int) error {
	return a.catalog.ReorderTypes(ctx, ids)
}
