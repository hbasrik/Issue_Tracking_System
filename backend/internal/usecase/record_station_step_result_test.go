package usecase_test

import (
	"context"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestRecordStationStepResult_NotOKDoesNotBlockNextStation proves the
// soft-warning rule (FR-2.5) survives the Karar 1 rename: a NOT_OK step at an
// earlier station does not prevent a step at a later station from being
// recorded.
func TestRecordStationStepResult_NotOKDoesNotBlockNextStation(t *testing.T) {
	const vin = "1HGCM82633A004352"

	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin}

	steps := newFakeStationStepRepo()
	steps.rows[vin] = []domain.VehicleStationStepProgress{
		{VIN: vin, StationID: 1, StationStepID: 101, Status: domain.StationStepStatusPending},
		{VIN: vin, StationID: 2, StationStepID: 201, Status: domain.StationStepStatusPending},
	}

	rec := usecase.NewStationStepResultRecorder(vehicles, steps)
	ctx := context.Background()

	// Fail a step at station 1.
	if _, err := rec.Record(ctx, usecase.RecordStationStepInput{
		VIN: vin, StationStepID: 101, Status: domain.StationStepStatusNotOK, CheckedBy: 1,
	}); err != nil {
		t.Fatalf("recording NOT_OK station-1 step failed: %v", err)
	}

	// Record a station-2 step despite the earlier NOT_OK. This must succeed.
	out, err := rec.Record(ctx, usecase.RecordStationStepInput{
		VIN: vin, StationStepID: 201, Status: domain.StationStepStatusOK, CheckedBy: 1,
	})
	if err != nil {
		t.Fatalf("station-2 step was blocked by earlier NOT_OK: %v", err)
	}

	// The NOT_OK item is excluded from completion (1 of 2 OK => 50%), and the
	// current station remains the earliest incomplete one (station 1).
	if out.TotalProgressPercentage != 50 {
		t.Errorf("expected 50%% completion, got %.2f", out.TotalProgressPercentage)
	}
	if out.CurrentStationID == nil {
		t.Fatal("expected a current station, got nil")
	}
	if *out.CurrentStationID != 1 {
		t.Errorf("expected current station 1 (still incomplete), got %d", *out.CurrentStationID)
	}
}
