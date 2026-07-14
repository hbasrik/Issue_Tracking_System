package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// CheckpointResultRecorder records the result of a single production-phase
// checkpoint and recomputes the vehicle's completion percentage.
type CheckpointResultRecorder struct {
	vehicles repository.VehicleRepository
	progress repository.CheckpointProgressRepository
}

// NewCheckpointResultRecorder wires the usecase with its repositories.
func NewCheckpointResultRecorder(
	vehicles repository.VehicleRepository,
	progress repository.CheckpointProgressRepository,
) *CheckpointResultRecorder {
	return &CheckpointResultRecorder{vehicles: vehicles, progress: progress}
}

// RecordCheckpointInput is the request to record one checkpoint result.
type RecordCheckpointInput struct {
	VIN          string
	CheckpointID int
	Status       domain.CheckpointStatus
	CheckedBy    int
}

// RecordCheckpointOutput reports the recomputed vehicle progress.
type RecordCheckpointOutput struct {
	TotalProgressPercentage float64
	CurrentPhase            int16
}

// Record persists a checkpoint result and recomputes progress.
//
// Soft-warning semantics (FR-2.5): recording a NOT_OK result is always
// allowed and never blocks recording checkpoints in later phases. A NOT_OK
// (or still-PENDING) checkpoint is merely excluded from the completion
// percentage until it is resolved and re-ticked as OK.
func (r *CheckpointResultRecorder) Record(ctx context.Context, in RecordCheckpointInput) (*RecordCheckpointOutput, error) {
	if !in.Status.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}

	if err := r.progress.SaveResult(ctx, in.VIN, in.CheckpointID, in.Status, in.CheckedBy); err != nil {
		return nil, err
	}

	items, err := r.progress.ListByVIN(ctx, in.VIN)
	if err != nil {
		return nil, err
	}

	percentage, currentPhase := ComputeProgress(items)
	if err := r.vehicles.UpdateProgress(ctx, in.VIN, percentage, currentPhase); err != nil {
		return nil, err
	}

	return &RecordCheckpointOutput{
		TotalProgressPercentage: percentage,
		CurrentPhase:            currentPhase,
	}, nil
}

// ListForVehicle returns catalogue checkpoints joined with progress and open
// issue counts per phase for the given VIN.
func (r *CheckpointResultRecorder) ListForVehicle(ctx context.Context, vin string) (*domain.VehicleCheckpointsResult, error) {
	if _, err := r.vehicles.GetByVIN(ctx, vin); err != nil {
		return nil, err
	}

	items, err := r.progress.ListCatalogueWithProgress(ctx, vin)
	if err != nil {
		return nil, err
	}
	counts, err := r.progress.CountOpenIssuesByPhase(ctx, vin)
	if err != nil {
		return nil, err
	}

	byPhase := make(map[string]int, domain.TotalPhases)
	for phase := int16(1); phase <= domain.TotalPhases; phase++ {
		byPhase[formatPhaseKey(phase)] = counts[phase]
	}

	return &domain.VehicleCheckpointsResult{
		Items:             items,
		OpenIssuesByPhase: byPhase,
	}, nil
}
