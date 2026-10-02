package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLWorkflowResetter is the development-only reverse of the three-stage EoL
// workflow: it puts a vehicle back at BRANCH / IN_PRODUCTION so the stage
// actions can be re-tested without reseeding. The HTTP layer 404s this
// outside APP_ENV=development; this type does not re-check the env.
type EOLWorkflowResetter struct {
	vehicles repository.VehicleRepository
	workflow repository.EOLWorkflowRepository
	audit    repository.AuditRepository
	uow      repository.TransactionManager
}

// NewEOLWorkflowResetter wires the usecase with its repositories.
func NewEOLWorkflowResetter(
	vehicles repository.VehicleRepository,
	workflow repository.EOLWorkflowRepository,
	audit repository.AuditRepository,
	uow repository.TransactionManager,
) *EOLWorkflowResetter {
	return &EOLWorkflowResetter{
		vehicles: vehicles,
		workflow: workflow,
		audit:    audit,
		uow:      uow,
	}
}

// EOLResetOutput reports the workflow after a development reset.
type EOLResetOutput struct {
	VIN           string                  `json:"vin"`
	CurrentStage  domain.EOLWorkflowStage `json:"current_stage"`
	VehicleStatus domain.VehicleStatus    `json:"vehicle_status"`
}

// Reset returns the vehicle's EoL workflow to BRANCH and its global status
// to IN_PRODUCTION, and appends an EOL_WORKFLOW_STAGE_CHANGE audit row (plus
// a STATUS_CHANGE row when the status really moves back) so the rewind is
// not silent. Both rows carry dev_reset=true for the vehicle timeline.
func (s *EOLWorkflowResetter) Reset(ctx context.Context, vin string, actorID int) (*EOLResetOutput, error) {
	vehicle, err := s.vehicles.GetByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	previousStatus := vehicle.CurrentGlobalStatus

	workflow, err := s.workflow.Get(ctx, vin)
	if err != nil {
		return nil, err
	}

	performedBy := actorID
	err = s.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.workflow.ResetToBranch(txCtx, vin); err != nil {
			return err
		}
		if err := s.vehicles.UpdateStatusAllowingRewind(txCtx, vin, domain.VehicleStatusInProduction); err != nil {
			return err
		}
		if err := s.audit.Append(txCtx, domain.AuditLog{
			VIN:         vin,
			EventType:   domain.AuditEventEOLWorkflowStage,
			OldValue:    string(workflow.CurrentStage),
			NewValue:    string(domain.EOLStageBranch),
			PerformedBy: &performedBy,
			Metadata: map[string]any{
				"dev_reset": true,
				"reason":    "development eol workflow reset",
			},
		}); err != nil {
			return err
		}
		if previousStatus == domain.VehicleStatusInProduction {
			return nil
		}
		return s.audit.Append(txCtx, domain.AuditLog{
			VIN:         vin,
			EventType:   domain.AuditEventStatusChange,
			OldValue:    string(previousStatus),
			NewValue:    string(domain.VehicleStatusInProduction),
			PerformedBy: &performedBy,
			Metadata: map[string]any{
				"dev_reset": true,
				"action":    "dev_reset",
			},
		})
	})
	if err != nil {
		return nil, err
	}

	return &EOLResetOutput{
		VIN:           vin,
		CurrentStage:  domain.EOLStageBranch,
		VehicleStatus: domain.VehicleStatusInProduction,
	}, nil
}
