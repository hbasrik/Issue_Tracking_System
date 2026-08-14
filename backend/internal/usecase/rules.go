package usecase

import (
	"math"

	"github.com/karea/backend/internal/domain"
)

// ComputeProgress recomputes a vehicle's completion percentage and current
// station from its station step progress rows.
//
// This is the application-layer mirror of the fn_recalculate_vehicle_progress
// database trigger (defense in depth). Soft-warning rule (FR-2.5, unchanged by
// Karar 1): only OK steps count toward completion; a NOT_OK (or PENDING) step
// is simply excluded from the percentage and never blocks progress elsewhere.
//
// The current station is the earliest station that is not yet fully OK; when
// every step is OK it is the last station the vehicle has rows for, matching
// the DDL's COALESCE(MIN(...), MAX(...)) behaviour. Callers pass the rows in
// station order, which the repository guarantees.
func ComputeProgress(items []domain.VehicleStationStepProgress) (percentage float64, currentStationID *int) {
	total := len(items)
	done := 0

	for i, it := range items {
		if it.Status == domain.StationStepStatusOK {
			done++
			continue
		}
		if currentStationID == nil {
			stationID := items[i].StationID
			currentStationID = &stationID
		}
	}

	if total == 0 {
		return 0, nil
	}
	if currentStationID == nil {
		lastStationID := items[total-1].StationID
		currentStationID = &lastStationID
	}
	percentage = round2(float64(done) / float64(total) * 100)
	return percentage, currentStationID
}

// EvaluateChecklistGate reports whether a hard-block quality gate is open,
// i.e. every item is OK or CONDITIONAL_OK (FR-3.5/FR-4.3). When closed it
// also returns the IDs of the items that block the gate (FR-3.7).
func EvaluateChecklistGate(items []domain.ChecklistProgress) (open bool, blockingItemIDs []int) {
	for _, it := range items {
		if !it.CheckStatus.IsPassing() {
			blockingItemIDs = append(blockingItemIDs, it.CheckItemID)
		}
	}
	return len(blockingItemIDs) == 0, blockingItemIDs
}

// ValidateChecklistDescription enforces the mandatory-description rule
// (FR-3.3): NOT_OK requires a rejected description, REWORK a rework
// description, and CONDITIONAL_OK a conditional description. OK and PENDING
// require none.
func ValidateChecklistDescription(status domain.CheckStatus, reworkDesc, conditionalDesc, rejectedDesc string) error {
	switch status {
	case domain.CheckStatusNotOK:
		if rejectedDesc == "" {
			return domain.ErrDescriptionRequired
		}
	case domain.CheckStatusRework:
		if reworkDesc == "" {
			return domain.ErrDescriptionRequired
		}
	case domain.CheckStatusConditionalOK:
		if conditionalDesc == "" {
			return domain.ErrDescriptionRequired
		}
	}
	return nil
}

// GateTargetStatus returns the vehicle status a passing checklist gate unlocks:
// EoL opens the move to IN_WAREHOUSE, Shipment opens the move to WITH_CUSTOMER.
func GateTargetStatus(checklistType domain.ChecklistType) domain.VehicleStatus {
	if checklistType == domain.ChecklistTypeShipment {
		return domain.VehicleStatusWithCustomer
	}
	return domain.VehicleStatusInWarehouse
}

// AuthorizeStatusTransition enforces, in the application layer, the same
// hard-block guard as the fn_enforce_manual_status_change trigger: a vehicle
// may only move to WITH_CUSTOMER or SHIPPED when its shipment gate is open.
// This runs even for manual/admin transitions so the UI can never be trusted
// to bypass it (FR-3.6/FR-4.3).
func AuthorizeStatusTransition(target domain.VehicleStatus, shipmentGateOpen bool) error {
	if !target.Valid() {
		return domain.ErrInvalidEnumValue
	}
	if target == domain.VehicleStatusWithCustomer || target == domain.VehicleStatusShipped {
		if !shipmentGateOpen {
			return domain.ErrInvalidStatusTransition
		}
	}
	return nil
}

// round2 rounds to two decimal places, mirroring PostgreSQL round(x, 2).
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
