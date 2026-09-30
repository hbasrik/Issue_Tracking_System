package usecase

import (
	"github.com/karea/backend/internal/domain"
)

// ComputeCurrentStation returns the vehicle's current station from its
// station step progress rows: the earliest station that is not yet fully OK;
// when every step is OK, the last station the vehicle has rows for (the
// DDL's COALESCE(MIN(...), MAX(...))). A NOT_OK step never blocks later
// stations (FR-2.5). Callers pass the rows in station order, which the
// repository guarantees.
//
// The completion percentage is not computed here: it is read from the
// applicable set (repository stage_applicability.go, docs/11 Karar 16).
func ComputeCurrentStation(items []domain.VehicleStationStepProgress) *int {
	for _, it := range items {
		if it.Status != domain.StationStepStatusOK {
			stationID := it.StationID
			return &stationID
		}
	}
	if len(items) == 0 {
		return nil
	}
	lastStationID := items[len(items)-1].StationID
	return &lastStationID
}

// EvaluateChecklistGate reports whether a hard-block quality gate is open.
// Only active catalogue items count: a missing progress row blocks the gate
// (it is not treated as passed). Inactive items with leftover progress and
// items whose stage is closed are ignored. Returns separate ID lists for "not
// yet on vehicle" vs "not OK".
func EvaluateChecklistGate(items []domain.ChecklistItemView) (open bool, blockingItemIDs, missingItemIDs []int) {
	for _, it := range items {
		if !it.IsActive || it.StageClosed {
			continue
		}
		if it.ProgressID == nil {
			missingItemIDs = append(missingItemIDs, it.ItemID)
			continue
		}
		if !it.Status.IsPassing() {
			blockingItemIDs = append(blockingItemIDs, it.ItemID)
		}
	}
	return len(blockingItemIDs) == 0 && len(missingItemIDs) == 0, blockingItemIDs, missingItemIDs
}

// CountGateRemainders returns non-passing active items and how many of those
// have no progress row yet.
func CountGateRemainders(items []domain.ChecklistItemView) (remaining, missing int) {
	_, blocking, miss := EvaluateChecklistGate(items)
	return len(blocking) + len(miss), len(miss)
}

// CountGateRemaindersEOLPhase limits CountGateRemainders to one EoL phase.
func CountGateRemaindersEOLPhase(items []domain.ChecklistItemView, phase domain.EOLItemPhase) (remaining, missing int) {
	var scoped []domain.ChecklistItemView
	for _, it := range items {
		if it.EolPhase != nil && *it.EolPhase == phase {
			scoped = append(scoped, it)
		}
	}
	return CountGateRemainders(scoped)
}

// ValidateChecklistDescription enforces the mandatory-description rule
// (FR-3.3) for EoL items only: NOT_OK requires a rejected description,
// REWORK a rework description, and CONDITIONAL_OK a conditional description.
// Test and Shipment items are plain Yes/No and never require a note.
func ValidateChecklistDescription(checklistType domain.ChecklistType, status domain.CheckStatus, reworkDesc, conditionalDesc, rejectedDesc string) error {
	if checklistType != domain.ChecklistTypeEOL {
		return nil
	}
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

// EnforceEOLDepotSequencing rejects a Depot-phase EoL update while any
// Branch-phase item for the same vehicle is not yet OK or CONDITIONAL_OK.
// Branch items whose stage is closed never block (they can no longer be
// completed). Unknown / non-Depot items are ignored so callers can fail open
// to the database trigger when the view list is empty.
func EnforceEOLDepotSequencing(items []domain.ChecklistItemView, itemID int) error {
	var target *domain.ChecklistItemView
	for i := range items {
		if items[i].ItemID == itemID {
			target = &items[i]
			break
		}
	}
	if target == nil || target.EolPhase == nil || *target.EolPhase != domain.EOLItemPhaseDepot {
		return nil
	}
	for _, it := range items {
		if it.EolPhase != nil && *it.EolPhase == domain.EOLItemPhaseBranch && !it.StageClosed && !it.Status.IsPassing() {
			return domain.ErrDepotChecklistLocked
		}
	}
	return nil
}

// GateTargetStatus returns the vehicle status a passing checklist gate used to
// unlock. Explicit EoL workflow actions now own every transition, so no
// checklist type may derive a status change from RequestGateExit.
func GateTargetStatus(checklistType domain.ChecklistType) (target domain.VehicleStatus, ok bool) {
	_ = checklistType
	return "", false
}

// AuthorizeStatusTransition enforces, in the application layer, the same
// hard-block guard as the fn_enforce_manual_status_change trigger: a vehicle
// may only move to DELIVERED when the workflow deliver stamp exists. SHIPPED
// remains a legacy enum value and is not produced by the live flow.
func AuthorizeStatusTransition(target domain.VehicleStatus, shipmentGateOpen bool) error {
	_ = shipmentGateOpen
	if !target.Valid() {
		return domain.ErrInvalidEnumValue
	}
	if target == domain.VehicleStatusDelivered {
		return domain.ErrInvalidStatusTransition
	}
	if target == domain.VehicleStatusShipped {
		return domain.ErrInvalidStatusTransition
	}
	return nil
}
