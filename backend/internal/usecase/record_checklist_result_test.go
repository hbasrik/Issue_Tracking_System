package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestRecordChecklistResult_ShipmentGateBlocksTransition proves the hard-block
// rule (FR-3.5/FR-4.3): if any SHIPMENT item is not OK/CONDITIONAL_OK, a
// requested gate exit returns a *domain.GateBlockedError and no vehicle status
// transition is attempted.
func TestRecordChecklistResult_ShipmentGateBlocksTransition(t *testing.T) {
	const vin = "1HGCM82633A004352"

	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin, CurrentGlobalStatus: domain.VehicleStatusInWarehouse}

	checklist := newFakeChecklistRepo()
	checklist.rows[vin] = []domain.ChecklistProgress{
		{VIN: vin, ChecklistType: domain.ChecklistTypeShipment, CheckItemID: 1, CheckStatus: domain.CheckStatusOK},
		{VIN: vin, ChecklistType: domain.ChecklistTypeShipment, CheckItemID: 2, CheckStatus: domain.CheckStatusConditionalOK, ConditionalDesc: "minor scuff, accepted"},
		// One item remains NOT_OK -> the gate must stay closed.
		{VIN: vin, ChecklistType: domain.ChecklistTypeShipment, CheckItemID: 3, CheckStatus: domain.CheckStatusNotOK, RejectedDesc: "seal failed"},
	}

	rec := usecase.NewChecklistResultRecorder(vehicles, checklist)
	ctx := context.Background()

	// Operator re-confirms item 1 as OK and requests the gate exit. Because
	// item 3 is still NOT_OK, the transition must be rejected.
	_, err := rec.Record(ctx, usecase.RecordChecklistInput{
		VIN:             vin,
		ChecklistType:   domain.ChecklistTypeShipment,
		ItemID:          1,
		Status:          domain.CheckStatusOK,
		CheckerID:       7,
		RequestGateExit: true,
	})

	var gateErr *domain.GateBlockedError
	if !errors.As(err, &gateErr) {
		t.Fatalf("expected *domain.GateBlockedError, got %v", err)
	}
	if gateErr.ChecklistType != domain.ChecklistTypeShipment {
		t.Errorf("expected SHIPMENT gate error, got %s", gateErr.ChecklistType)
	}
	if len(gateErr.BlockingItemIDs) != 1 || gateErr.BlockingItemIDs[0] != 3 {
		t.Errorf("expected blocking item [3], got %v", gateErr.BlockingItemIDs)
	}

	// Critically: no status transition may have been attempted.
	if len(vehicles.statusUpdates) != 0 {
		t.Errorf("status transition was attempted despite closed gate: %+v", vehicles.statusUpdates)
	}
}

// TestRecordChecklistResult_ShipmentGateOpensTransition confirms the positive
// path: once every item passes, the requested gate exit transitions the
// vehicle to WITH_CUSTOMER.
func TestRecordChecklistResult_ShipmentGateOpensTransition(t *testing.T) {
	const vin = "1HGCM82633A004352"

	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin, CurrentGlobalStatus: domain.VehicleStatusInWarehouse}

	checklist := newFakeChecklistRepo()
	checklist.rows[vin] = []domain.ChecklistProgress{
		{VIN: vin, ChecklistType: domain.ChecklistTypeShipment, CheckItemID: 1, CheckStatus: domain.CheckStatusOK},
		{VIN: vin, ChecklistType: domain.ChecklistTypeShipment, CheckItemID: 2, CheckStatus: domain.CheckStatusPending},
	}

	rec := usecase.NewChecklistResultRecorder(vehicles, checklist)
	ctx := context.Background()

	out, err := rec.Record(ctx, usecase.RecordChecklistInput{
		VIN:             vin,
		ChecklistType:   domain.ChecklistTypeShipment,
		ItemID:          2,
		Status:          domain.CheckStatusOK,
		CheckerID:       7,
		RequestGateExit: true,
	})
	if err != nil {
		t.Fatalf("gate should be open, got error: %v", err)
	}
	if !out.GateOpen {
		t.Fatal("expected gate to be open")
	}
	if out.ProposedStatus != domain.VehicleStatusWithCustomer {
		t.Errorf("expected proposed status WITH_CUSTOMER, got %s", out.ProposedStatus)
	}
	if len(vehicles.statusUpdates) != 1 || vehicles.statusUpdates[0].status != domain.VehicleStatusWithCustomer {
		t.Errorf("expected one WITH_CUSTOMER transition, got %+v", vehicles.statusUpdates)
	}
}

// TestRecordChecklistResult_MissingDescriptionRejected proves the
// mandatory-description rule (FR-3.3) is enforced before persistence.
func TestRecordChecklistResult_MissingDescriptionRejected(t *testing.T) {
	const vin = "1HGCM82633A004352"

	vehicles := newFakeVehicleRepo()
	checklist := newFakeChecklistRepo()
	checklist.rows[vin] = []domain.ChecklistProgress{
		{VIN: vin, ChecklistType: domain.ChecklistTypeEOL, CheckItemID: 1, CheckStatus: domain.CheckStatusPending},
	}

	rec := usecase.NewChecklistResultRecorder(vehicles, checklist)

	_, err := rec.Record(context.Background(), usecase.RecordChecklistInput{
		VIN:           vin,
		ChecklistType: domain.ChecklistTypeEOL,
		ItemID:        1,
		Status:        domain.CheckStatusNotOK, // requires rejected_desc
		CheckerID:     7,
	})
	if !errors.Is(err, domain.ErrDescriptionRequired) {
		t.Fatalf("expected ErrDescriptionRequired, got %v", err)
	}
}
