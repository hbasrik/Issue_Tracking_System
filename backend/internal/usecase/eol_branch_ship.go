package usecase

import (
	"context"
	"fmt"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLBranchShipper performs stage 1 of the EOL workflow (Karar 2): shipping a
// vehicle from the branch to the depot.
//
// This is the soft-warning gate. Open issues are counted and reported back so
// the UI can raise a banner, but they never block the transition — the same
// rule fn_enforce_branch_shipment implements, which records the count and
// lets the update through.
type EOLBranchShipper struct {
	vehicles repository.VehicleRepository
	issues   repository.IssueRepository
	workflow repository.EOLWorkflowRepository
	uow      repository.TransactionManager
}

// NewEOLBranchShipper wires the usecase with its repositories.
func NewEOLBranchShipper(
	vehicles repository.VehicleRepository,
	issues repository.IssueRepository,
	workflow repository.EOLWorkflowRepository,
	uow repository.TransactionManager,
) *EOLBranchShipper {
	return &EOLBranchShipper{vehicles: vehicles, issues: issues, workflow: workflow, uow: uow}
}

// BranchShipOutput reports the result of a branch shipment. OpenIssueCount is
// the soft warning: a non-zero value accompanies a successful shipment.
type BranchShipOutput struct {
	VIN            string                  `json:"vin"`
	CurrentStage   domain.EOLWorkflowStage `json:"current_stage"`
	VehicleStatus  domain.VehicleStatus    `json:"vehicle_status"`
	OpenIssueCount int                     `json:"open_issue_count"`
	Warning        string                  `json:"warning,omitempty"`
}

// Ship marks the branch shipment, snapshots how many issues were still open,
// and moves the vehicle into the warehouse.
func (s *EOLBranchShipper) Ship(ctx context.Context, vin string, actorID int) (*BranchShipOutput, error) {
	if _, err := s.vehicles.GetByVIN(ctx, vin); err != nil {
		return nil, err
	}

	workflow, err := s.workflow.Get(ctx, vin)
	if err != nil {
		return nil, err
	}
	if workflow.BranchShippedAt != nil {
		return nil, domain.ErrInvalidStatusTransition
	}

	openIssues, err := s.issues.ListOpenByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	openIssueCount := len(openIssues)

	err = s.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.workflow.MarkBranchShipped(txCtx, vin, actorID, openIssueCount); err != nil {
			return err
		}
		return s.vehicles.UpdateStatus(txCtx, vin, domain.VehicleStatusInWarehouse)
	})
	if err != nil {
		return nil, err
	}

	out := &BranchShipOutput{
		VIN:            vin,
		CurrentStage:   domain.EOLStageDepot,
		VehicleStatus:  domain.VehicleStatusInWarehouse,
		OpenIssueCount: openIssueCount,
	}
	if openIssueCount > 0 {
		out.Warning = branchShipWarning(openIssueCount)
	}
	return out, nil
}

// branchShipWarning phrases the non-blocking warning shown after a shipment
// that went out with unresolved issues.
func branchShipWarning(openIssueCount int) string {
	if openIssueCount == 1 {
		return "shipped with 1 open issue still unresolved"
	}
	return fmt.Sprintf("shipped with %d open issues still unresolved", openIssueCount)
}
