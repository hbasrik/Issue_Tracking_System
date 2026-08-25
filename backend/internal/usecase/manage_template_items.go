package usecase

import (
	"context"
	"strings"

	"github.com/karea/backend/internal/domain"
)

// CreateTemplateItemInput is a new catalogue row on an existing template.
type CreateTemplateItemInput struct {
	TemplateID int
	ItemText   string
	EolPhase   *domain.EOLItemPhase
}

// UpdateTemplateItemInput patches text, phase and/or active flag.
type UpdateTemplateItemInput struct {
	TemplateID int
	ItemID     int
	ItemText   *string
	EolPhase   *domain.EOLItemPhase
	ClearPhase bool
	IsActive   *bool
}

// CreateTemplateItem appends an active item. It is not backfilled onto
// vehicles that already exist — only INSERT-time materialization copies
// is_active catalogue rows onto a VIN.
func (r *ChecklistResultRecorder) CreateTemplateItem(ctx context.Context, in CreateTemplateItemInput) (*domain.ChecklistTemplateItem, error) {
	tmpl, err := r.checklist.GetTemplate(ctx, in.TemplateID)
	if err != nil {
		return nil, err
	}
	text := strings.TrimSpace(in.ItemText)
	if err := domain.ValidateTemplateItemFields(tmpl.Type, text, in.EolPhase); err != nil {
		return nil, err
	}
	return r.checklist.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{
		TemplateID: in.TemplateID,
		ItemText:   text,
		EolPhase:   in.EolPhase,
		IsActive:   true,
	})
}

// UpdateTemplateItem edits a catalogue item. Deactivate (is_active=false) is
// the default way to retire an item that already has progress.
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
	return item, nil
}

// DeleteTemplateItem hard-deletes only when no vehicle has progress for it.
func (r *ChecklistResultRecorder) DeleteTemplateItem(ctx context.Context, templateID, itemID int) error {
	item, err := r.checklist.GetTemplateItem(ctx, itemID)
	if err != nil {
		return err
	}
	if item.TemplateID != templateID {
		return domain.ErrNotFound
	}
	n, err := r.checklist.CountProgressVINs(ctx, itemID)
	if err != nil {
		return err
	}
	if n > 0 {
		return &domain.TemplateItemInUseError{VehicleCount: n}
	}
	return r.checklist.DeleteTemplateItem(ctx, itemID)
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
