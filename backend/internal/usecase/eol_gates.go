package usecase

import (
	"context"
	"errors"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// BranchShipBlockers returns every checklist that still blocks branch shipment.
// Station-step incompleteness is counted separately via IncompleteStationSteps.
// Active template items without a progress row count as remaining (and Missing).
func BranchShipBlockers(
	ctx context.Context,
	vin string,
	checklists *ChecklistResultRecorder,
	_ repository.ChecklistProgressRepository,
) ([]domain.EOLChecklistBlocker, error) {
	var blockers []domain.EOLChecklistBlocker

	eolViews, err := checklists.ListForVehicle(ctx, vin, domain.ChecklistTypeEOL)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	if remaining, missing := CountGateRemaindersEOLPhase(eolViews, domain.EOLItemPhaseBranch); remaining > 0 {
		phase := domain.EOLItemPhaseBranch
		blockers = append(blockers, domain.EOLChecklistBlocker{
			ChecklistType: domain.ChecklistTypeEOL,
			EolPhase:      &phase,
			Remaining:     remaining,
			Missing:       missing,
		})
	}

	for _, typ := range []domain.ChecklistType{domain.ChecklistTypeTest, domain.ChecklistTypeShipment} {
		items, err := checklists.ListForVehicle(ctx, vin, typ)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
		if remaining, missing := CountGateRemainders(items); remaining > 0 {
			blockers = append(blockers, domain.EOLChecklistBlocker{
				ChecklistType: typ,
				Remaining:     remaining,
				Missing:       missing,
			})
		}
	}

	return blockers, nil
}

// IncompleteStationSteps counts station steps that are not OK for a VIN.
func IncompleteStationSteps(
	ctx context.Context,
	vin string,
	steps repository.StationStepProgressRepository,
) (int, error) {
	if steps == nil {
		return 0, nil
	}
	rows, err := steps.ListByVIN(ctx, vin)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, row := range rows {
		if row.Status != domain.StationStepStatusOK {
			n++
		}
	}
	return n, nil
}

// DepotEOLItemsRemaining counts depot-phase EoL items that are not passing,
// including active catalogue items with no progress row yet.
func DepotEOLItemsRemaining(
	ctx context.Context,
	vin string,
	checklists *ChecklistResultRecorder,
) (int, error) {
	views, err := checklists.ListForVehicle(ctx, vin, domain.ChecklistTypeEOL)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return 0, err
	}
	remaining, _ := CountGateRemaindersEOLPhase(views, domain.EOLItemPhaseDepot)
	return remaining, nil
}
