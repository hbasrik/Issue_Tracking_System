package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLDocumentApprover performs stage 3 of the EOL workflow (Karar 2): the
// final document sign-off that completes the workflow and ships the vehicle.
type EOLDocumentApprover struct {
	vehicles repository.VehicleRepository
	workflow repository.EOLWorkflowRepository
	uow      repository.TransactionManager
}

// NewEOLDocumentApprover wires the usecase with its repositories.
func NewEOLDocumentApprover(
	vehicles repository.VehicleRepository,
	workflow repository.EOLWorkflowRepository,
	uow repository.TransactionManager,
) *EOLDocumentApprover {
	return &EOLDocumentApprover{vehicles: vehicles, workflow: workflow, uow: uow}
}

// DocumentApproveOutput reports a completed EOL workflow.
type DocumentApproveOutput struct {
	VIN           string                  `json:"vin"`
	CurrentStage  domain.EOLWorkflowStage `json:"current_stage"`
	VehicleStatus domain.VehicleStatus    `json:"vehicle_status"`
}

// Approve records the document sign-off and moves the vehicle to SHIPPED.
// The depot-release hard block already guaranteed there are no open issues, so
// this stage has no gate of its own.
func (s *EOLDocumentApprover) Approve(ctx context.Context, vin string, actorID int) (*DocumentApproveOutput, error) {
	if _, err := s.vehicles.GetByVIN(ctx, vin); err != nil {
		return nil, err
	}

	workflow, err := s.workflow.Get(ctx, vin)
	if err != nil {
		return nil, err
	}
	if workflow.DepotReleasedAt == nil || workflow.DocumentApprovedAt != nil {
		return nil, domain.ErrInvalidStatusTransition
	}

	err = s.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.workflow.MarkDocumentApproved(txCtx, vin, actorID); err != nil {
			return err
		}
		return s.vehicles.UpdateStatus(txCtx, vin, domain.VehicleStatusShipped)
	})
	if err != nil {
		return nil, err
	}

	return &DocumentApproveOutput{
		VIN:           vin,
		CurrentStage:  domain.EOLStageCompleted,
		VehicleStatus: domain.VehicleStatusShipped,
	}, nil
}

// EOLWorkflowReader serves the Vehicle Detail EoL tab.
type EOLWorkflowReader struct {
	workflow repository.EOLWorkflowRepository
}

// NewEOLWorkflowReader wires the usecase with its repository.
func NewEOLWorkflowReader(workflow repository.EOLWorkflowRepository) *EOLWorkflowReader {
	return &EOLWorkflowReader{workflow: workflow}
}

// Get returns the current stage plus each stage's timestamp and actor.
func (r *EOLWorkflowReader) Get(ctx context.Context, vin string) (*domain.EOLWorkflowView, error) {
	return r.workflow.GetView(ctx, vin)
}
