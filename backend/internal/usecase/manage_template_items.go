package usecase

import (
	"context"
	"strings"

	"github.com/karea/backend/internal/domain"
)

// CreateTemplateItemInput is a new catalogue row on an existing template.
type CreateTemplateItemInput struct {
	TemplateID        int
	ItemText          string
	EolPhase          *domain.EOLItemPhase
	PropagationScope  domain.TemplateItemPropagationScope
}

// UpdateTemplateItemInput patches text, phase and/or active flag.
type UpdateTemplateItemInput struct {
	TemplateID       int
	ItemID           int
	ItemText         *string
	EolPhase         *domain.EOLItemPhase
	ClearPhase       bool
	IsActive         *bool
	PropagationScope domain.TemplateItemPropagationScope
}

// CreateTemplateItem appends an active item and backfills PENDING onto
// vehicles selected by PropagationScope (default: not_started).
func (r *ChecklistResultRecorder) CreateTemplateItem(ctx context.Context, in CreateTemplateItemInput) (*domain.ChecklistTemplateItem, error) {
	tmpl, err := r.checklist.GetTemplate(ctx, in.TemplateID)
	if err != nil {
		return nil, err
	}
	text := strings.TrimSpace(in.ItemText)
	if err := domain.ValidateTemplateItemFields(tmpl.Type, text, in.EolPhase); err != nil {
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
		TemplateID: in.TemplateID,
		ItemText:   text,
		EolPhase:   in.EolPhase,
		IsActive:   true,
	})
	if err != nil {
		return nil, err
	}
	if _, err := r.checklist.InsertPendingForVehicles(ctx, item.ID, tmpl.ID, tmpl.Type, scope); err != nil {
		return nil, err
	}
	return item, nil
}

// UpdateTemplateItem edits a catalogue item. Deactivate removes PENDING
// progress; reactivate backfills by PropagationScope (default: not_started).
// Text/phase edits do not move progress rows.
func (r *ChecklistResultRecorder) UpdateTemplateItem(ctx context.Context, in UpdateTemplateItemInput) (*domain.ChecklistTemplateItem, error) {
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
		if _, err := r.checklist.InsertPendingForVehicles(ctx, item.ID, tmpl.ID, tmpl.Type, scope); err != nil {
			return nil, err
		}
	}
	return item, nil
}

// DeleteTemplateItem hard-deletes only when nothing was evaluated and no
// issue is linked. PENDING-only materialization is cleared first.
func (r *ChecklistResultRecorder) DeleteTemplateItem(ctx context.Context, templateID, itemID int) error {
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
