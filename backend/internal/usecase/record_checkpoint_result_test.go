package usecase_test

import (
	"context"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestRecordCheckpointResult_NotOKDoesNotBlockNextPhase proves the
// soft-warning rule (FR-2.5): a NOT_OK checkpoint in an earlier phase does not
// prevent a checkpoint in a later phase from being recorded.
func TestRecordCheckpointResult_NotOKDoesNotBlockNextPhase(t *testing.T) {
	const vin = "1HGCM82633A004352"

	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin}

	checkpoints := newFakeCheckpointRepo()
	checkpoints.rows[vin] = []domain.PhaseCheckpointProgress{
		{VIN: vin, PhaseNumber: 1, CheckpointID: 101, Status: domain.CheckpointStatusPending},
		{VIN: vin, PhaseNumber: 2, CheckpointID: 201, Status: domain.CheckpointStatusPending},
	}

	rec := usecase.NewCheckpointResultRecorder(vehicles, checkpoints)
	ctx := context.Background()

	// Fail a phase-1 checkpoint.
	if _, err := rec.Record(ctx, usecase.RecordCheckpointInput{
		VIN: vin, CheckpointID: 101, Status: domain.CheckpointStatusNotOK, CheckedBy: 1,
	}); err != nil {
		t.Fatalf("recording NOT_OK phase-1 checkpoint failed: %v", err)
	}

	// Record a phase-2 checkpoint despite the earlier NOT_OK. This must succeed.
	out, err := rec.Record(ctx, usecase.RecordCheckpointInput{
		VIN: vin, CheckpointID: 201, Status: domain.CheckpointStatusOK, CheckedBy: 1,
	})
	if err != nil {
		t.Fatalf("phase-2 checkpoint was blocked by earlier NOT_OK: %v", err)
	}

	// The NOT_OK item is excluded from completion (1 of 2 OK => 50%), and the
	// current phase remains the lowest incomplete phase (phase 1).
	if out.TotalProgressPercentage != 50 {
		t.Errorf("expected 50%% completion, got %.2f", out.TotalProgressPercentage)
	}
	if out.CurrentPhase != 1 {
		t.Errorf("expected current phase 1 (still incomplete), got %d", out.CurrentPhase)
	}
}
