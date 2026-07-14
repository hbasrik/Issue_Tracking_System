package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// ChecklistResultRecorder records EoL/Shipment checklist item results and
// enforces the hard-block gate when a gate exit is requested.
type ChecklistResultRecorder struct {
	vehicles  repository.VehicleRepository
	checklist repository.ChecklistProgressRepository
}

// NewChecklistResultRecorder wires the usecase with its repositories.
func NewChecklistResultRecorder(
	vehicles repository.VehicleRepository,
	checklist repository.ChecklistProgressRepository,
) *ChecklistResultRecorder {
	return &ChecklistResultRecorder{vehicles: vehicles, checklist: checklist}
}

// RecordChecklistInput is the request to record one checklist item result.
type RecordChecklistInput struct {
	VIN             string
	ChecklistType   domain.ChecklistType
	ItemID          int
	Status          domain.CheckStatus
	CheckerID       int
	ReworkDesc      string
	ConditionalDesc string
	RejectedDesc    string
	// RequestGateExit signals that this update is intended to exit the gate
	// (i.e. advance the vehicle's global status). When true, the transition is
	// only performed if ALL items are OK/CONDITIONAL_OK; otherwise a
	// *domain.GateBlockedError is returned and no transition is attempted.
	RequestGateExit bool
}

// RecordChecklistOutput reports the resulting gate state.
type RecordChecklistOutput struct {
	GateOpen       bool
	ProposedStatus domain.VehicleStatus
}

// Record validates and persists a checklist item result, then evaluates the
// hard-block gate.
//
// Hard-block semantics (FR-3.5/FR-4.3): recording an individual item is always
// allowed (including the mandatory-description rule of FR-3.3), but a requested
// gate exit is rejected with a *domain.GateBlockedError unless every item of
// the checklist is OK or CONDITIONAL_OK. The status transition is enforced
// here in the application layer, independent of the database trigger, so a
// direct API call can never bypass the gate.
func (r *ChecklistResultRecorder) Record(ctx context.Context, in RecordChecklistInput) (*RecordChecklistOutput, error) {
	if !in.ChecklistType.Valid() || !in.Status.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	if err := ValidateChecklistDescription(in.Status, in.ReworkDesc, in.ConditionalDesc, in.RejectedDesc); err != nil {
		return nil, err
	}

	result := domain.ChecklistProgress{
		VIN:             in.VIN,
		ChecklistType:   in.ChecklistType,
		CheckItemID:     in.ItemID,
		CheckStatus:     in.Status,
		CheckerID:       &in.CheckerID,
		ReworkDesc:      in.ReworkDesc,
		ConditionalDesc: in.ConditionalDesc,
		RejectedDesc:    in.RejectedDesc,
	}
	if err := r.checklist.SaveResult(ctx, result); err != nil {
		return nil, err
	}

	items, err := r.checklist.ListByVINAndType(ctx, in.VIN, in.ChecklistType)
	if err != nil {
		return nil, err
	}

	open, blocking := EvaluateChecklistGate(items)
	out := &RecordChecklistOutput{GateOpen: open}

	if in.RequestGateExit {
		if !open {
			return nil, &domain.GateBlockedError{
				ChecklistType:   in.ChecklistType,
				BlockingItemIDs: blocking,
			}
		}
		target := GateTargetStatus(in.ChecklistType)
		if err := r.vehicles.UpdateStatus(ctx, in.VIN, target); err != nil {
			return nil, err
		}
		out.ProposedStatus = target
	}

	return out, nil
}
