package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLDocumentApprover is the unused leftover of the old document stage.
// The live flow completes and ships at depot release. This usecase still
// writes document_approved_* (columns retained for a possible re-enable)
// but it does not move the vehicle to SHIPPED.
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

// Approve records the unused document columns if the depot has already
// released. It does not change vehicle status; SHIPPED is written by depot
// release.
func (s *EOLDocumentApprover) Approve(ctx context.Context, vin string, actorID int) (*DocumentApproveOutput, error) {
	vehicle, err := s.vehicles.GetByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}

	workflow, err := s.workflow.Get(ctx, vin)
	if err != nil {
		return nil, err
	}
	if workflow.DepotReleasedAt == nil || workflow.DocumentApprovedAt != nil {
		return nil, domain.ErrInvalidStatusTransition
	}

	if err := s.workflow.MarkDocumentApproved(ctx, vin, actorID); err != nil {
		return nil, err
	}

	return &DocumentApproveOutput{
		VIN:           vin,
		CurrentStage:  domain.EOLStageCompleted,
		VehicleStatus: vehicle.CurrentGlobalStatus,
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
