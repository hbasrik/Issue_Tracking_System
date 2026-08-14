package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// StationStepResultRecorder records the result of a single station step and
// recomputes the vehicle's completion percentage.
type StationStepResultRecorder struct {
	vehicles repository.VehicleRepository
	progress repository.StationStepProgressRepository
}

// NewStationStepResultRecorder wires the usecase with its repositories.
func NewStationStepResultRecorder(
	vehicles repository.VehicleRepository,
	progress repository.StationStepProgressRepository,
) *StationStepResultRecorder {
	return &StationStepResultRecorder{vehicles: vehicles, progress: progress}
}

// RecordStationStepInput is the request to record one station step result.
type RecordStationStepInput struct {
	VIN           string
	StationStepID int
	Status        domain.StationStepStatus
	CheckedBy     int
}

// RecordStationStepOutput reports the recomputed vehicle progress.
type RecordStationStepOutput struct {
	TotalProgressPercentage float64
	CurrentStationID        *int
}

// Record persists a station step result and recomputes progress.
//
// Soft-warning semantics (FR-2.5, unchanged by Karar 1): recording a NOT_OK
// result is always allowed and never blocks recording steps at later stations.
// A NOT_OK (or still-PENDING) step is merely excluded from the completion
// percentage until it is resolved and re-ticked as OK.
func (r *StationStepResultRecorder) Record(ctx context.Context, in RecordStationStepInput) (*RecordStationStepOutput, error) {
	if !in.Status.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}

	if err := r.progress.SaveResult(ctx, in.VIN, in.StationStepID, in.Status, in.CheckedBy); err != nil {
		return nil, err
	}

	items, err := r.progress.ListByVIN(ctx, in.VIN)
	if err != nil {
		return nil, err
	}

	percentage, currentStationID := ComputeProgress(items)
	if err := r.vehicles.UpdateProgress(ctx, in.VIN, percentage, currentStationID); err != nil {
		return nil, err
	}

	return &RecordStationStepOutput{
		TotalProgressPercentage: percentage,
		CurrentStationID:        currentStationID,
	}, nil
}

// ListForVehicle returns the station step catalogue joined with progress and
// open issue counts per station for the given VIN.
func (r *StationStepResultRecorder) ListForVehicle(ctx context.Context, vin string) (*domain.VehicleStationStepsResult, error) {
	if _, err := r.vehicles.GetByVIN(ctx, vin); err != nil {
		return nil, err
	}

	items, err := r.progress.ListCatalogueWithProgress(ctx, vin)
	if err != nil {
		return nil, err
	}
	counts, err := r.progress.CountOpenIssuesByStation(ctx, vin)
	if err != nil {
		return nil, err
	}

	// Every station present in the catalogue gets a key, so the UI can render
	// a zero without special-casing a missing entry.
	byStation := make(map[string]int, len(counts))
	for _, item := range items {
		byStation[formatStationKey(item.StationID)] = counts[item.StationID]
	}

	return &domain.VehicleStationStepsResult{
		Items:               items,
		OpenIssuesByStation: byStation,
	}, nil
}
