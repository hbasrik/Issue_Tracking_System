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
	remaining, _, err := DepotEOLRemainders(ctx, vin, checklists)
	return remaining, err
}

// DepotEOLRemainders returns depot-phase remaining and missing counts.
func DepotEOLRemainders(
	ctx context.Context,
	vin string,
	checklists *ChecklistResultRecorder,
) (remaining, missing int, err error) {
	views, err := checklists.ListForVehicle(ctx, vin, domain.ChecklistTypeEOL)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return 0, 0, err
	}
	remaining, missing = CountGateRemaindersEOLPhase(views, domain.EOLItemPhaseDepot)
	return remaining, missing, nil
}

// BuildEOLGates assembles the API gate payload from workflow stamps and the
// same remainder counts the ship/release usecases (and DB triggers) use.
func BuildEOLGates(
	workflow *domain.EOLWorkflow,
	blockers []domain.EOLChecklistBlocker,
	stationStepsRemaining int,
	depotRemaining, depotMissing int,
	openIssueCount int,
) domain.EOLGates {
	branch := domain.EOLBranchShipGate{
		AlreadyDone:           workflow.BranchShippedAt != nil,
		StationStepsRemaining: stationStepsRemaining,
		OpenIssueCount:        openIssueCount,
	}
	for _, b := range blockers {
		switch b.ChecklistType {
		case domain.ChecklistTypeEOL:
			if b.EolPhase != nil && *b.EolPhase == domain.EOLItemPhaseBranch {
				branch.BranchEOLRemaining = b.Remaining
				branch.BranchEOLMissing = b.Missing
			}
		case domain.ChecklistTypeTest:
			branch.TestRemaining = b.Remaining
			branch.TestMissing = b.Missing
		case domain.ChecklistTypeShipment:
			branch.ShipmentRemaining = b.Remaining
			branch.ShipmentMissing = b.Missing
		}
	}
	branch.Ready = !branch.AlreadyDone &&
		branch.BranchEOLRemaining == 0 &&
		branch.TestRemaining == 0 &&
		branch.ShipmentRemaining == 0 &&
		branch.StationStepsRemaining == 0

	depot := domain.EOLDepotReleaseGate{
		AlreadyDone:       workflow.DepotReleasedAt != nil,
		NeedsBranchShip:   workflow.BranchShippedAt == nil,
		DepotEOLRemaining: depotRemaining,
		DepotEOLMissing:   depotMissing,
		OpenIssueCount:    openIssueCount,
	}
	depot.Ready = !depot.AlreadyDone &&
		!depot.NeedsBranchShip &&
		depot.DepotEOLRemaining == 0 &&
		depot.OpenIssueCount == 0

	deliver := domain.EOLDeliverGate{
		AlreadyDone:       workflow.DeliveredAt != nil,
		NeedsDepotRelease: workflow.DepotReleasedAt == nil,
	}
	deliver.Ready = !deliver.AlreadyDone && !deliver.NeedsDepotRelease

	return domain.EOLGates{
		BranchShip:   branch,
		DepotRelease: depot,
		Deliver:      deliver,
	}
}

// TriggerBranchShipWouldBlock encodes fn_enforce_branch_shipment (migration
// 0022) as a pure decision over the same counters the application layer uses.
// Returns true when the trigger would RAISE EXCEPTION.
func TriggerBranchShipWouldBlock(g domain.EOLBranchShipGate) bool {
	if g.AlreadyDone {
		return false // trigger only fires on NULL → NOT NULL transition
	}
	return g.BranchEOLRemaining > 0 ||
		g.TestRemaining > 0 ||
		g.ShipmentRemaining > 0 ||
		g.StationStepsRemaining > 0
}

// TriggerDepotReleaseWouldBlock encodes fn_enforce_depot_release (migration
// 0022). Open issues hard-block; open_issue_count on branch ship does not.
func TriggerDepotReleaseWouldBlock(g domain.EOLDepotReleaseGate) bool {
	if g.AlreadyDone {
		return false
	}
	if g.NeedsBranchShip {
		return true
	}
	return g.DepotEOLRemaining > 0 || g.OpenIssueCount > 0
}
