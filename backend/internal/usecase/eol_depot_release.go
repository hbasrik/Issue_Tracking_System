package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLDepotReleaser performs stage 2 of the EOL workflow: releasing a vehicle
// from the depot and completing the workflow. The vehicle stays IN_WAREHOUSE
// until the separate deliver action marks it DELIVERED.
//
// This is a hard-block gate on open issues and depot-phase EoL items.
type EOLDepotReleaser struct {
	vehicles   repository.VehicleRepository
	issues     repository.IssueRepository
	workflow   repository.EOLWorkflowRepository
	checklists *ChecklistResultRecorder
	uow        repository.TransactionManager
}

// NewEOLDepotReleaser wires the usecase with its repositories.
func NewEOLDepotReleaser(
	vehicles repository.VehicleRepository,
	issues repository.IssueRepository,
	workflow repository.EOLWorkflowRepository,
	checklists *ChecklistResultRecorder,
	uow repository.TransactionManager,
) *EOLDepotReleaser {
	return &EOLDepotReleaser{
		vehicles:   vehicles,
		issues:     issues,
		workflow:   workflow,
		checklists: checklists,
		uow:        uow,
	}
}

// DepotReleaseOutput reports a successful depot release.
type DepotReleaseOutput struct {
	VIN           string                  `json:"vin"`
	CurrentStage  domain.EOLWorkflowStage `json:"current_stage"`
	VehicleStatus domain.VehicleStatus    `json:"vehicle_status"`
}

// Release marks the depot release, rejecting it with a
// *domain.DepotReleaseBlockedError when any issue is still open or depot EoL
// items are incomplete, or ErrInvalidStatusTransition when the branch has not
// shipped yet.
func (s *EOLDepotReleaser) Release(ctx context.Context, vin string, actorID int) (*DepotReleaseOutput, error) {
	if _, err := s.vehicles.GetByVIN(ctx, vin); err != nil {
		return nil, err
	}

	workflow, err := s.workflow.Get(ctx, vin)
	if err != nil {
		return nil, err
	}
	if workflow.BranchShippedAt == nil || workflow.DepotReleasedAt != nil {
		return nil, domain.ErrInvalidStatusTransition
	}

	depotRemaining, err := DepotEOLItemsRemaining(ctx, vin, s.checklists)
	if err != nil {
		return nil, err
	}

	openIssues, err := s.issues.ListOpenByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	if depotRemaining > 0 || len(openIssues) > 0 {
		return nil, &domain.DepotReleaseBlockedError{
			VIN:                 vin,
			BlockingIssues:      toBlockingIssues(openIssues),
			DepotItemsRemaining: depotRemaining,
		}
	}

	if err := s.workflow.MarkDepotReleased(ctx, vin, actorID); err != nil {
		return nil, err
	}

	return &DepotReleaseOutput{
		VIN:           vin,
		CurrentStage:  domain.EOLStageCompleted,
		VehicleStatus: domain.VehicleStatusInWarehouse,
	}, nil
}

// toBlockingIssues reduces open issues to the identifying fields the UI needs
// to list what is blocking the gate.
func toBlockingIssues(issues []domain.Issue) []domain.BlockingIssue {
	out := make([]domain.BlockingIssue, 0, len(issues))
	for _, issue := range issues {
		out = append(out, domain.BlockingIssue{
			ID:       issue.ID,
			Status:   issue.Status,
			Severity: issue.Severity,
		})
	}
	return out
}
