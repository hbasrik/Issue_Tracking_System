package usecase

import (
	"context"
	"errors"
	"strings"

	"github.com/karea/backend/internal/domain"
)

const templateItemNoRetries = 8

// CreateTemplateItemInput is a new catalogue row on an existing template.
type CreateTemplateItemInput struct {
	TemplateID       int
	ItemText         string
	EolPhase         *domain.EOLItemPhase
	SectionKey       *string
	SectionSort      *int16
	PropagationScope domain.TemplateItemPropagationScope
}

// UpdateTemplateItemInput patches text, phase, section and/or active flag.
type UpdateTemplateItemInput struct {
	TemplateID       int
	ItemID           int
	ItemText         *string
	EolPhase         *domain.EOLItemPhase
	ClearPhase       bool
	SectionKey       *string
	ClearSection     bool
	SectionSort      *int16
	IsActive         *bool
	PropagationScope domain.TemplateItemPropagationScope
}

func (r *ChecklistResultRecorder) withTx(ctx context.Context, fn func(context.Context) error) error {
	if r.uow == nil {
		return fn(ctx)
	}
	return r.uow.WithinTx(ctx, fn)
}

// CreateTemplateItem appends an active item and backfills PENDING onto
// vehicles selected by PropagationScope (default: not_started).
// If the scope matches nobody while assigned vehicles still lack the item,
// the catalogue row is deleted and TemplatePropagationEmptyError is returned
// so a silent zero-propagate cannot leave an orphan (root cause of #44).
// Insert + propagate run in one transaction; item_no unique conflicts retry.
func (r *ChecklistResultRecorder) CreateTemplateItem(ctx context.Context, in CreateTemplateItemInput) (*domain.ChecklistTemplateItem, error) {
	var created *domain.ChecklistTemplateItem
	var last error
	for attempt := 0; attempt < templateItemNoRetries; attempt++ {
		last = r.withTx(ctx, func(txCtx context.Context) error {
			item, err := r.createTemplateItemTx(txCtx, in)
			if err != nil {
				return err
			}
			created = item
			return nil
		})
		if last == nil {
			return created, nil
		}
		if errors.Is(last, domain.ErrTemplateItemNoConflict) {
			continue
		}
		return nil, last
	}
	return nil, last
}

func (r *ChecklistResultRecorder) createTemplateItemTx(ctx context.Context, in CreateTemplateItemInput) (*domain.ChecklistTemplateItem, error) {
	tmpl, err := r.checklist.GetTemplate(ctx, in.TemplateID)
	if err != nil {
		return nil, err
	}
	text := strings.TrimSpace(in.ItemText)
	if err := domain.ValidateTemplateItemFields(tmpl.Type, text, in.EolPhase); err != nil {
		return nil, err
	}
	sectionKey, err := domain.NormalizeSectionKey(in.SectionKey)
	if err != nil {
		return nil, err
	}
	scope := in.PropagationScope
	if scope == "" {
		scope = domain.PropagationScopeNotStarted
	}
	if !scope.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	item, err := r.checklist.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{
		TemplateID:  in.TemplateID,
		ItemText:    text,
		EolPhase:    in.EolPhase,
		SectionKey:  sectionKey,
		SectionSort: in.SectionSort,
		IsActive:    true,
	})
	if err != nil {
		return nil, err
	}
	n, err := r.checklist.InsertPendingForVehicles(ctx, item.ID, tmpl.ID, tmpl.Type, scope)
	if err != nil {
		_ = r.checklist.DeleteTemplateItem(ctx, item.ID)
		return nil, err
	}
	_, missing, err := r.checklist.ListVehiclesMissingTemplateItem(ctx, tmpl.ID, item.ID, tmpl.Type, 1)
	if err != nil {
		return item, err
	}
	if n == 0 && missing > 0 {
		if delErr := r.checklist.DeleteTemplateItem(ctx, item.ID); delErr != nil {
			return nil, delErr
		}
		return nil, &domain.TemplatePropagationEmptyError{Scope: scope, MissingVehicles: missing}
	}
	return item, nil
}

// UpdateTemplateItem edits a catalogue item. Deactivate removes PENDING
// progress; reactivate backfills by PropagationScope (default: not_started).
// Text/phase edits do not move progress rows.
func (r *ChecklistResultRecorder) UpdateTemplateItem(ctx context.Context, in UpdateTemplateItemInput) (*domain.ChecklistTemplateItem, error) {
	var updated *domain.ChecklistTemplateItem
	err := r.withTx(ctx, func(txCtx context.Context) error {
		item, err := r.updateTemplateItemTx(txCtx, in)
		if err != nil {
			return err
		}
		updated = item
		return nil
	})
	return updated, err
}

func (r *ChecklistResultRecorder) updateTemplateItemTx(ctx context.Context, in UpdateTemplateItemInput) (*domain.ChecklistTemplateItem, error) {
	tmpl, err := r.checklist.GetTemplate(ctx, in.TemplateID)
	if err != nil {
		return nil, err
	}
	item, err := r.checklist.GetTemplateItem(ctx, in.ItemID)
	if err != nil {
		return nil, err
	}
	if item.TemplateID != in.TemplateID {
		return nil, domain.ErrNotFound
	}
	prevActive := item.IsActive
	if in.ItemText != nil {
		item.ItemText = strings.TrimSpace(*in.ItemText)
	}
	if in.ClearPhase {
		item.EolPhase = nil
	} else if in.EolPhase != nil {
		item.EolPhase = in.EolPhase
	}
	if in.ClearSection {
		item.SectionKey = nil
		item.SectionSort = nil
	} else if in.SectionKey != nil {
		key, err := domain.NormalizeSectionKey(in.SectionKey)
		if err != nil {
			return nil, err
		}
		item.SectionKey = key
		if key == nil {
			item.SectionSort = nil
		} else if in.SectionSort != nil {
			item.SectionSort = in.SectionSort
		}
	} else if in.SectionSort != nil {
		item.SectionSort = in.SectionSort
	}
	if in.IsActive != nil {
		item.IsActive = *in.IsActive
	}
	if err := domain.ValidateTemplateItemFields(tmpl.Type, item.ItemText, item.EolPhase); err != nil {
		return nil, err
	}
	if err := r.checklist.UpdateTemplateItem(ctx, item); err != nil {
		return nil, err
	}
	if in.IsActive != nil && prevActive && !item.IsActive {
		if _, err := r.checklist.DeletePendingProgressForItem(ctx, item.ID); err != nil {
			return nil, err
		}
	}
	if in.IsActive != nil && !prevActive && item.IsActive {
		scope := in.PropagationScope
		if scope == "" {
			scope = domain.PropagationScopeNotStarted
		}
		if !scope.Valid() {
			return nil, domain.ErrInvalidEnumValue
		}
		n, err := r.checklist.InsertPendingForVehicles(ctx, item.ID, tmpl.ID, tmpl.Type, scope)
		if err != nil {
			return nil, err
		}
		_, missing, err := r.checklist.ListVehiclesMissingTemplateItem(ctx, tmpl.ID, item.ID, tmpl.Type, 1)
		if err != nil {
			return item, err
		}
		if n == 0 && missing > 0 {
			item.IsActive = false
			if revErr := r.checklist.UpdateTemplateItem(ctx, item); revErr != nil {
				return nil, revErr
			}
			return nil, &domain.TemplatePropagationEmptyError{Scope: scope, MissingVehicles: missing}
		}
	}
	return item, nil
}

// DeleteTemplateItem hard-deletes only when nothing was evaluated and no
// issue is linked. PENDING-only materialization is cleared first.
func (r *ChecklistResultRecorder) DeleteTemplateItem(ctx context.Context, templateID, itemID int) error {
	return r.withTx(ctx, func(txCtx context.Context) error {
		return r.deleteTemplateItemTx(txCtx, templateID, itemID)
	})
}

func (r *ChecklistResultRecorder) deleteTemplateItemTx(ctx context.Context, templateID, itemID int) error {
	item, err := r.checklist.GetTemplateItem(ctx, itemID)
	if err != nil {
		return err
	}
	if item.TemplateID != templateID {
		return domain.ErrNotFound
	}
	evaluated, err := r.checklist.CountEvaluatedProgressVINs(ctx, itemID)
	if err != nil {
		return err
	}
	linked, err := r.checklist.CountIssueLinkedVINs(ctx, itemID)
	if err != nil {
		return err
	}
	if evaluated > 0 || linked > 0 {
		_, protected, derr := r.checklist.DeactivateImpact(ctx, itemID)
		if derr != nil {
			return derr
		}
		if protected < 1 {
			protected = evaluated + linked
		}
		return &domain.TemplateItemInUseError{VehicleCount: protected}
	}
	if _, err := r.checklist.DeletePendingProgressForItem(ctx, itemID); err != nil {
		return err
	}
	return r.checklist.DeleteTemplateItem(ctx, itemID)
}

// PreviewTemplateItemImpact returns how many vehicles a catalogue change
// would touch versus leave alone (history preserved).
func (r *ChecklistResultRecorder) PreviewTemplateItemImpact(
	ctx context.Context, templateID, itemID int, action string,
) (*domain.TemplateItemPropagationImpact, error) {
	tmpl, err := r.checklist.GetTemplate(ctx, templateID)
	if err != nil {
		return nil, err
	}
	out := &domain.TemplateItemPropagationImpact{Action: action}
	switch action {
	case "create", "activate":
		nsA, nsP, incA, incP, cerr := r.checklist.CreateImpact(ctx, templateID, tmpl.Type)
		if cerr != nil {
			return nil, cerr
		}
		out.NotStartedAffected = nsA
		out.NotStartedProtected = nsP
		out.IncompleteAffected = incA
		out.IncompleteProtected = incP
		// Default selected scope for Affected/Protected is not_started.
		out.Scope = string(domain.PropagationScopeNotStarted)
		out.Affected = nsA
		out.Protected = nsP
		return out, nil
	case "deactivate":
		if itemID < 1 {
			return nil, domain.ErrNotFound
		}
		item, gerr := r.checklist.GetTemplateItem(ctx, itemID)
		if gerr != nil {
			return nil, gerr
		}
		if item.TemplateID != templateID {
			return nil, domain.ErrNotFound
		}
		out.Affected, out.Protected, err = r.checklist.DeactivateImpact(ctx, itemID)
	case "delete":
		if itemID < 1 {
			return nil, domain.ErrNotFound
		}
		item, gerr := r.checklist.GetTemplateItem(ctx, itemID)
		if gerr != nil {
			return nil, gerr
		}
		if item.TemplateID != templateID {
			return nil, domain.ErrNotFound
		}
		affected, protected, derr := r.checklist.DeactivateImpact(ctx, itemID)
		if derr != nil {
			return nil, derr
		}
		// For delete, "affected" is PENDING cleanup; "protected" blocks delete.
		out.Affected = affected
		out.Protected = protected
	default:
		return nil, domain.ErrInvalidEnumValue
	}
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ListTemplateItemMissingVehicles returns assigned VINs without this item.
func (r *ChecklistResultRecorder) ListTemplateItemMissingVehicles(
	ctx context.Context, templateID, itemID, limit int,
) (*domain.TemplateItemMissingVehicles, error) {
	tmpl, err := r.checklist.GetTemplate(ctx, templateID)
	if err != nil {
		return nil, err
	}
	item, err := r.checklist.GetTemplateItem(ctx, itemID)
	if err != nil {
		return nil, err
	}
	if item.TemplateID != templateID {
		return nil, domain.ErrNotFound
	}
	rows, total, err := r.checklist.ListVehiclesMissingTemplateItem(ctx, templateID, itemID, tmpl.Type, limit)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []domain.TemplateItemMissingVehicle{}
	}
	return &domain.TemplateItemMissingVehicles{Count: total, Vehicles: rows}, nil
}

// ReorderTemplateItems sets item_no from the given id order.
func (r *ChecklistResultRecorder) ReorderTemplateItems(ctx context.Context, templateID int, itemIDs []int) error {
	if _, err := r.checklist.GetTemplate(ctx, templateID); err != nil {
		return err
	}
	existing, err := r.checklist.ListTemplateItems(ctx, templateID)
	if err != nil {
		return err
	}
	if !sameIDs(existing, itemIDs) {
		return domain.ErrTemplateItemReorderInvalid
	}
	return r.checklist.ReorderTemplateItems(ctx, templateID, itemIDs)
}

func sameIDs(items []domain.ChecklistTemplateItem, ids []int) bool {
	if len(items) != len(ids) {
		return false
	}
	seen := make(map[int]int, len(ids))
	for _, id := range ids {
		seen[id]++
		if seen[id] > 1 {
			return false
		}
	}
	for _, item := range items {
		if seen[item.ID] != 1 {
			return false
		}
	}
	return true
}
