package usecase

import (
	"context"
	"errors"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

func countNonPassingProgress(items []domain.ChecklistProgress) int {
	n := 0
	for _, it := range items {
		if !it.CheckStatus.IsPassing() {
			n++
		}
	}
	return n
}

func countNonPassingEOLPhase(items []domain.ChecklistItemView, phase domain.EOLItemPhase) int {
	n := 0
	for _, it := range items {
		if it.EolPhase == nil || *it.EolPhase != phase {
			continue
		}
		if !it.Status.IsPassing() {
			n++
		}
	}
	return n
}

// BranchShipBlockers returns every checklist that still blocks branch shipment.
func BranchShipBlockers(
	ctx context.Context,
	vin string,
	checklists *ChecklistResultRecorder,
	progress repository.ChecklistProgressRepository,
) ([]domain.EOLChecklistBlocker, error) {
	var blockers []domain.EOLChecklistBlocker

	eolViews, err := checklists.ListForVehicle(ctx, vin, domain.ChecklistTypeEOL)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	if branch := countNonPassingEOLPhase(eolViews, domain.EOLItemPhaseBranch); branch > 0 {
		phase := domain.EOLItemPhaseBranch
		blockers = append(blockers, domain.EOLChecklistBlocker{
			ChecklistType: domain.ChecklistTypeEOL,
			EolPhase:      &phase,
			Remaining:     branch,
		})
	}

	for _, typ := range []domain.ChecklistType{domain.ChecklistTypeTest, domain.ChecklistTypeShipment} {
		items, err := progress.ListByVINAndType(ctx, vin, typ)
		if err != nil {
			return nil, err
		}
		if remaining := countNonPassingProgress(items); remaining > 0 {
			blockers = append(blockers, domain.EOLChecklistBlocker{
				ChecklistType: typ,
				Remaining:     remaining,
			})
		}
	}

	return blockers, nil
}

// DepotEOLItemsRemaining counts depot-phase EoL items that are not passing.
func DepotEOLItemsRemaining(
	ctx context.Context,
	vin string,
	checklists *ChecklistResultRecorder,
) (int, error) {
	views, err := checklists.ListForVehicle(ctx, vin, domain.ChecklistTypeEOL)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return 0, err
	}
	return countNonPassingEOLPhase(views, domain.EOLItemPhaseDepot), nil
}
