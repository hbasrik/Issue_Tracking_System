package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLDepotReleaser performs stage 2 of the EOL workflow (Karar 2): releasing a
// vehicle from the depot.
//
// This is the hard-block gate. Unlike branch shipment, any issue that is not
// yet closed rejects the release. fn_enforce_depot_release enforces the same
// rule in the database; the check below runs first so the caller gets a
// structured 409 listing the offending issues rather than an opaque trigger
// exception (defense in depth, PRD FR-3.6).
type EOLDepotReleaser struct {
	vehicles repository.VehicleRepository
	issues   repository.IssueRepository
	workflow repository.EOLWorkflowRepository
	uow      repository.TransactionManager
}

// NewEOLDepotReleaser wires the usecase with its repositories.
func NewEOLDepotReleaser(
	vehicles repository.VehicleRepository,
	issues repository.IssueRepository,
	workflow repository.EOLWorkflowRepository,
	uow repository.TransactionManager,
) *EOLDepotReleaser {
	return &EOLDepotReleaser{vehicles: vehicles, issues: issues, workflow: workflow, uow: uow}
}

// DepotReleaseOutput reports a successful depot release.
type DepotReleaseOutput struct {
	VIN          string                  `json:"vin"`
	CurrentStage domain.EOLWorkflowStage `json:"current_stage"`
}

// Release marks the depot release, rejecting it with a
// *domain.DepotReleaseBlockedError when any issue is still open.
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

	openIssues, err := s.issues.ListOpenByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	if len(openIssues) > 0 {
		return nil, &domain.DepotReleaseBlockedError{
			VIN:            vin,
			BlockingIssues: toBlockingIssues(openIssues),
		}
	}

	if err := s.uow.WithinTx(ctx, func(txCtx context.Context) error {
		return s.workflow.MarkDepotReleased(txCtx, vin, actorID)
	}); err != nil {
		return nil, err
	}

	return &DepotReleaseOutput{VIN: vin, CurrentStage: domain.EOLStageDocument}, nil
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
