package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

const testChecklistVIN = "VIN0000000000004"

// newTestChecklistFixture wires the recorder over a vehicle in production with
// a two-item Test checklist.
func newTestChecklistFixture(t *testing.T) (*usecase.ChecklistResultRecorder, *fakeVehicleRepo) {
	t.Helper()

	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[testChecklistVIN] = &domain.Vehicle{
		VIN:                 testChecklistVIN,
		CurrentGlobalStatus: domain.VehicleStatusInProduction,
	}
	checklist := newFakeChecklistRepo()
	checklist.rows[testChecklistVIN] = []domain.ChecklistProgress{
		{VIN: testChecklistVIN, ChecklistType: domain.ChecklistTypeTest, CheckItemID: 1, CheckStatus: domain.CheckStatusPending},
		{VIN: testChecklistVIN, ChecklistType: domain.ChecklistTypeTest, CheckItemID: 2, CheckStatus: domain.CheckStatusPending},
	}
	return usecase.NewChecklistResultRecorder(vehicles, checklist), vehicles
}

// TestRecordChecklistResult_TestItemDoesNotChangeVehicleStatus proves the Karar
// 4 assumption: the Test checklist is quality tracking, not a shipping gate, so
// ticking its items — even every last one — leaves the vehicle's global status
// exactly where it was.
func TestRecordChecklistResult_TestItemDoesNotChangeVehicleStatus(t *testing.T) {
	rec, vehicles := newTestChecklistFixture(t)
	ctx := context.Background()
	before := vehicles.vehicles[testChecklistVIN].CurrentGlobalStatus

	for _, itemID := range []int{1, 2} {
		out, err := rec.Record(ctx, usecase.RecordChecklistInput{
			VIN:           testChecklistVIN,
			ChecklistType: domain.ChecklistTypeTest,
			ItemID:        itemID,
			Status:        domain.CheckStatusOK,
			CheckerID:     3,
		})
		if err != nil {
			t.Fatalf("recording test item %d failed: %v", itemID, err)
		}
		if out.ProposedStatus != "" {
			t.Errorf("test checklist proposed a status transition to %q", out.ProposedStatus)
		}
	}

	// Every item passes, which for EoL or Shipment would open a gate. The Test
	// checklist has none, so nothing moved.
	if got := vehicles.vehicles[testChecklistVIN].CurrentGlobalStatus; got != before {
		t.Errorf("vehicle status changed from %q to %q", before, got)
	}
	if len(vehicles.statusUpdates) != 0 {
		t.Errorf("expected no status writes, got %d", len(vehicles.statusUpdates))
	}
}

// TestRecordChecklistResult_TestGateExitRejected proves a caller cannot ship a
// vehicle off the back of the Test checklist: asking for a gate exit is
// refused outright rather than silently ignored, and still writes no status.
func TestRecordChecklistResult_TestGateExitRejected(t *testing.T) {
	rec, vehicles := newTestChecklistFixture(t)
	before := vehicles.vehicles[testChecklistVIN].CurrentGlobalStatus

	_, err := rec.Record(context.Background(), usecase.RecordChecklistInput{
		VIN:             testChecklistVIN,
		ChecklistType:   domain.ChecklistTypeTest,
		ItemID:          1,
		Status:          domain.CheckStatusOK,
		CheckerID:       3,
		RequestGateExit: true,
	})
	if !errors.Is(err, domain.ErrInvalidStatusTransition) {
		t.Fatalf("expected ErrInvalidStatusTransition, got %v", err)
	}

	if got := vehicles.vehicles[testChecklistVIN].CurrentGlobalStatus; got != before {
		t.Errorf("vehicle status changed from %q to %q", before, got)
	}
	if len(vehicles.statusUpdates) != 0 {
		t.Errorf("expected no status writes, got %d", len(vehicles.statusUpdates))
	}
}

// TestRecordChecklistResult_TestItemDoesNotRequireDescription proves Test
// items are plain Yes/No: a NOT_OK tick with no rejection reason is accepted.
func TestRecordChecklistResult_TestItemDoesNotRequireDescription(t *testing.T) {
	rec, _ := newTestChecklistFixture(t)

	_, err := rec.Record(context.Background(), usecase.RecordChecklistInput{
		VIN:           testChecklistVIN,
		ChecklistType: domain.ChecklistTypeTest,
		ItemID:        1,
		Status:        domain.CheckStatusNotOK,
		CheckerID:     3,
	})
	if err != nil {
		t.Fatalf("test NOT_OK without description should succeed, got %v", err)
	}
}
