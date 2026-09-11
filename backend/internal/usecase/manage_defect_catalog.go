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
	issues  repository.IssueRepository
	audit   repository.AuditRepository
	uow     repository.TransactionManager
}

// NewDefectCatalogAdmin constructs a DefectCatalogAdmin.
func NewDefectCatalogAdmin(
	catalog repository.DefectCatalogRepository,
	issues repository.IssueRepository,
	audit repository.AuditRepository,
	uow repository.TransactionManager,
) *DefectCatalogAdmin {
	return &DefectCatalogAdmin{catalog: catalog, issues: issues, audit: audit, uow: uow}
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

// ListActiveProcesses returns active responsible-process rows for classification edit.
func (a *DefectCatalogAdmin) ListActiveProcesses(ctx context.Context) ([]domain.DefectProcess, error) {
	items, err := a.ListProcesses(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.DefectProcess, 0, len(items))
	for _, p := range items {
		if p.IsActive {
			out = append(out, p)
		}
	}
	return out, nil
}

// OtherUsageReport is the grouped "Diğer" free-text growth list.
type OtherUsageReport struct {
	Parts []domain.DefectOtherUsageGroup `json:"parts"`
	Types []domain.DefectOtherUsageGroup `json:"types"`
}

func (a *DefectCatalogAdmin) ListOtherUsage(ctx context.Context) (*OtherUsageReport, error) {
	parts, err := a.catalog.ListOtherCustomPartGroups(ctx)
	if err != nil {
		return nil, err
	}
	types, err := a.catalog.ListOtherCustomDefectGroups(ctx)
	if err != nil {
		return nil, err
	}
	return &OtherUsageReport{Parts: parts, Types: types}, nil
}

// PromoteOtherInput turns a recurring "Diğer" free-text into a catalogue row.
type PromoteOtherInput struct {
	Kind             string // "part" | "type"
	CustomName       string
	Code             string
	NameTR           string
	NameEN           string
	ZoneID           int
	DefaultProcessID *int
	SortOrder        int
	RebindIssues     bool
	ActorID          int
}

// PromoteOtherResult is the created catalogue row plus optional rebind count.
type PromoteOtherResult struct {
	Kind           string `json:"kind"`
	Part           *domain.DefectPart `json:"part,omitempty"`
	Type           *domain.DefectType `json:"type,omitempty"`
	ReboundCount   int                `json:"rebound_count"`
	ReboundIssueIDs []int64           `json:"rebound_issue_ids"`
}

func (a *DefectCatalogAdmin) PromoteOther(ctx context.Context, in PromoteOtherInput) (*PromoteOtherResult, error) {
	kind := strings.TrimSpace(strings.ToLower(in.Kind))
	custom := strings.TrimSpace(in.CustomName)
	if custom == "" {
		return nil, domain.ErrPromoteOtherNameRequired
	}
	if err := domain.ValidateDefectCatalogueFields(in.Code, in.NameTR, in.NameEN); err != nil {
		return nil, err
	}

	switch kind {
	case "part":
		return a.promoteOtherPart(ctx, in, custom)
	case "type":
		return a.promoteOtherType(ctx, in, custom)
	default:
		return nil, domain.ErrPromoteOtherKindInvalid
	}
}

func (a *DefectCatalogAdmin) promoteOtherPart(ctx context.Context, in PromoteOtherInput, custom string) (*PromoteOtherResult, error) {
	if in.ZoneID <= 0 {
		return nil, domain.ErrDefectZoneRequired
	}
	if _, err := a.catalog.GetZone(ctx, in.ZoneID); err != nil {
		return nil, err
	}
	other, err := a.catalog.GetPartByCode(ctx, domain.DefectPartCodeOther)
	if err != nil {
		return nil, err
	}

	sortOrder := in.SortOrder
	if sortOrder <= 0 {
		sortOrder = 1
	}
	part := &domain.DefectPart{
		ZoneID: in.ZoneID,
		Code:   strings.TrimSpace(in.Code),
		NameTR: strings.TrimSpace(in.NameTR),
		NameEN: strings.TrimSpace(in.NameEN),
		SortOrder: sortOrder,
		IsActive:  true,
	}

	var created *domain.DefectPart
	var rebound []int64
	err = a.uow.WithinTx(ctx, func(txCtx context.Context) error {
		id, err := a.catalog.CreatePart(txCtx, part)
		if err != nil {
			return err
		}
		part.ID = id
		created, err = a.catalog.GetPart(txCtx, id)
		if err != nil {
			return err
		}
		if !in.RebindIssues {
			return nil
		}
		rebound, err = a.catalog.RebindOtherPartIssues(txCtx, custom, other.ID, id, part.Code)
		if err != nil {
			return err
		}
		for _, issueID := range rebound {
			issue, err := a.issues.GetByID(txCtx, issueID)
			if err != nil {
				return err
			}
			performedBy := in.ActorID
			if err := a.audit.Append(txCtx, domain.AuditLog{
				VIN:         issue.VIN,
				EventType:   domain.AuditEventIssueClassification,
				OldValue:    "promote_other_part:" + custom,
				NewValue:    classificationAuditSummary(issue),
				StationID:   issue.StationID,
				PerformedBy: &performedBy,
				Metadata: map[string]any{
					"issue_id":     issueID,
					"action":       "promote_other_part",
					"custom_name":  custom,
					"new_part_id":  id,
					"new_part_code": part.Code,
				},
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &PromoteOtherResult{
		Kind:            "part",
		Part:            created,
		ReboundCount:    len(rebound),
		ReboundIssueIDs: rebound,
	}, nil
}

func (a *DefectCatalogAdmin) promoteOtherType(ctx context.Context, in PromoteOtherInput, custom string) (*PromoteOtherResult, error) {
	other, err := a.catalog.GetTypeByCode(ctx, domain.DefectTypeCodeOther)
	if err != nil {
		return nil, err
	}
	sortOrder := in.SortOrder
	if sortOrder <= 0 {
		sortOrder = 1
	}
	typ := &domain.DefectType{
		Code:             strings.TrimSpace(in.Code),
		NameTR:           strings.TrimSpace(in.NameTR),
		NameEN:           strings.TrimSpace(in.NameEN),
		DefaultProcessID: in.DefaultProcessID,
		SortOrder:        sortOrder,
		IsActive:         true,
	}

	var created *domain.DefectType
	var rebound []int64
	err = a.uow.WithinTx(ctx, func(txCtx context.Context) error {
		id, err := a.catalog.CreateType(txCtx, typ)
		if err != nil {
			return err
		}
		typ.ID = id
		created, err = a.catalog.GetType(txCtx, id)
		if err != nil {
			return err
		}
		if !in.RebindIssues {
			return nil
		}
		rebound, err = a.catalog.RebindOtherTypeIssues(txCtx, custom, other.ID, id, typ.Code)
		if err != nil {
			return err
		}
		for _, issueID := range rebound {
			issue, err := a.issues.GetByID(txCtx, issueID)
			if err != nil {
				return err
			}
			performedBy := in.ActorID
			if err := a.audit.Append(txCtx, domain.AuditLog{
				VIN:         issue.VIN,
				EventType:   domain.AuditEventIssueClassification,
				OldValue:    "promote_other_type:" + custom,
				NewValue:    classificationAuditSummary(issue),
				StationID:   issue.StationID,
				PerformedBy: &performedBy,
				Metadata: map[string]any{
					"issue_id":      issueID,
					"action":        "promote_other_type",
					"custom_name":   custom,
					"new_type_id":   id,
					"new_type_code": typ.Code,
				},
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &PromoteOtherResult{
		Kind:            "type",
		Type:            created,
		ReboundCount:    len(rebound),
		ReboundIssueIDs: rebound,
	}, nil
}
