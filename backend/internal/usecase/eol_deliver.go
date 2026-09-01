package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLDeliverer marks a vehicle as delivered after depot release (one-time).
type EOLDeliverer struct {
	vehicles repository.VehicleRepository
	workflow repository.EOLWorkflowRepository
	uow      repository.TransactionManager
}

// NewEOLDeliverer wires the usecase with its repositories.
func NewEOLDeliverer(
	vehicles repository.VehicleRepository,
	workflow repository.EOLWorkflowRepository,
	uow repository.TransactionManager,
) *EOLDeliverer {
	return &EOLDeliverer{vehicles: vehicles, workflow: workflow, uow: uow}
}

// DeliverOutput reports a successful deliver action.
type DeliverOutput struct {
	VIN           string                  `json:"vin"`
	CurrentStage  domain.EOLWorkflowStage `json:"current_stage"`
	VehicleStatus domain.VehicleStatus    `json:"vehicle_status"`
}

// Deliver records delivery and moves the vehicle to DELIVERED.
func (s *EOLDeliverer) Deliver(ctx context.Context, vin string, actorID int) (*DeliverOutput, error) {
	if _, err := s.vehicles.GetByVIN(ctx, vin); err != nil {
		return nil, err
	}

	workflow, err := s.workflow.Get(ctx, vin)
	if err != nil {
		return nil, err
	}
	if workflow.DepotReleasedAt == nil || workflow.DeliveredAt != nil {
		return nil, domain.ErrInvalidStatusTransition
	}

	if err := s.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.workflow.MarkDelivered(txCtx, vin, actorID); err != nil {
			return err
		}
		return s.vehicles.UpdateStatus(txCtx, vin, domain.VehicleStatusDelivered)
	}); err != nil {
		return nil, err
	}

	return &DeliverOutput{
		VIN:           vin,
		CurrentStage:  domain.EOLStageCompleted,
		VehicleStatus: domain.VehicleStatusDelivered,
	}, nil
}
