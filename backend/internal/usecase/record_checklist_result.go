package usecase

import (
	"context"
	"errors"
	"strings"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// ChecklistResultRecorder records checklist item results for every checklist
// type (EoL, Shipment and Karar 4's Test) and enforces the hard-block gate
// when a gate exit is requested on one of the two gated types.
type ChecklistResultRecorder struct {
	vehicles  repository.VehicleRepository
	checklist repository.ChecklistProgressRepository
	audit     repository.AuditRepository
	uow       repository.TransactionManager
}

// NewChecklistResultRecorder wires the usecase with its repositories.
// audit and uow may be nil (template-admin tests); production wires both
// so every item result is appended as CHECKLIST_ITEM_UPDATE.
func NewChecklistResultRecorder(
	vehicles repository.VehicleRepository,
	checklist repository.ChecklistProgressRepository,
	audit repository.AuditRepository,
	uow repository.TransactionManager,
) *ChecklistResultRecorder {
	return &ChecklistResultRecorder{
		vehicles:  vehicles,
		checklist: checklist,
		audit:     audit,
		uow:       uow,
	}
}

// RecordChecklistInput is the request to record one checklist item result.
type RecordChecklistInput struct {
	VIN           string
	ChecklistType domain.ChecklistType
	ItemID        int
	Status        domain.CheckStatus
	CheckerID     int
	// Note is the single description for any answer, OK included. When it is
	// empty the legacy per-answer fields below are used as sent (older
	// mobile builds still send them).
	Note            string
	ReworkDesc      string
	ConditionalDesc string
	RejectedDesc    string
	// RequestGateExit signals that this update is intended to exit the gate
	// (i.e. advance the vehicle's global status). When true, the transition is
	// only performed if ALL items are OK/CONDITIONAL_OK; otherwise a
	// *domain.GateBlockedError is returned and no transition is attempted.
	RequestGateExit bool
}

func (in RecordChecklistInput) notes() domain.ChecklistNotes {
	if note := strings.TrimSpace(in.Note); note != "" {
		return domain.NotesForStatus(in.Status, note)
	}
	return domain.ChecklistNotes{
		Rework:      in.ReworkDesc,
		Conditional: in.ConditionalDesc,
		Rejected:    in.RejectedDesc,
	}
}

// RecordChecklistOutput reports the resulting gate state.
type RecordChecklistOutput struct {
	GateOpen       bool                 `json:"gate_open"`
	ProposedStatus domain.VehicleStatus `json:"proposed_status"`
}

// Record validates and persists a checklist item result, then evaluates the
// hard-block gate.
//
// Hard-block semantics (FR-3.5/FR-4.3): recording an individual item is always
// allowed (EoL still requires a description for non-OK statuses; Test and
// Shipment do not), but a requested gate exit is rejected with a
// *domain.GateBlockedError unless every item of the checklist is OK or
// CONDITIONAL_OK. Depot-phase EoL items are additionally refused until every
// Branch-phase item is passing — application layer plus the database trigger.
func (r *ChecklistResultRecorder) Record(ctx context.Context, in RecordChecklistInput) (*RecordChecklistOutput, error) {
	if !in.ChecklistType.Valid() || !in.Status.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	notes := in.notes()
	if err := ValidateChecklistDescription(in.ChecklistType, in.Status, notes.Rework, notes.Conditional, notes.Rejected); err != nil {
		return nil, err
	}
	if in.ChecklistType == domain.ChecklistTypeEOL && in.Status != domain.CheckStatusPending {
		views, err := r.ListForVehicle(ctx, in.VIN, in.ChecklistType)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
		if err := EnforceEOLDepotSequencing(views, in.ItemID); err != nil {
			return nil, err
		}
	}

	result := domain.ChecklistProgress{
		VIN:             in.VIN,
		ChecklistType:   in.ChecklistType,
		CheckItemID:     in.ItemID,
		CheckStatus:     in.Status,
		CheckerID:       &in.CheckerID,
		ReworkDesc:      notes.Rework,
		ConditionalDesc: notes.Conditional,
		RejectedDesc:    notes.Rejected,
		ApprovedDesc:    notes.Approved,
	}

	change := checklistChange{oldStatus: domain.CheckStatusPending, newNote: notes.NoteFor(in.Status)}
	existing, err := r.checklist.ListByVINAndType(ctx, in.VIN, in.ChecklistType)
	if err != nil {
		return nil, err
	}
	for _, row := range existing {
		if row.CheckItemID == in.ItemID {
			change.oldStatus = row.CheckStatus
			change.oldNote = domain.ChecklistNotes{
				Rework:      row.ReworkDesc,
				Conditional: row.ConditionalDesc,
				Rejected:    row.RejectedDesc,
				Approved:    row.ApprovedDesc,
			}.NoteFor(row.CheckStatus)
			break
		}
	}

	save := func(ctx context.Context) error {
		if err := r.checklist.SaveResult(ctx, result); err != nil {
			return err
		}
		return r.appendChecklistAudit(ctx, in, change)
	}
	if r.uow != nil {
		if err := r.uow.WithinTx(ctx, save); err != nil {
			return nil, err
		}
	} else if err := save(ctx); err != nil {
		return nil, err
	}

	items, err := r.ListForVehicle(ctx, in.VIN, in.ChecklistType)
	if err != nil {
		return nil, err
	}

	open, blocking, missing := EvaluateChecklistGate(items)
	out := &RecordChecklistOutput{GateOpen: open}

	if in.RequestGateExit {
		target, gated := GateTargetStatus(in.ChecklistType)
		if !gated {
			// The Test checklist tracks quality, it does not ship vehicles.
			// Refusing here (rather than silently ignoring the flag) keeps a
			// caller from believing it moved the vehicle.
			return nil, domain.ErrInvalidStatusTransition
		}
		if !open {
			return nil, &domain.GateBlockedError{
				ChecklistType:   in.ChecklistType,
				BlockingItemIDs: blocking,
				MissingItemIDs:  missing,
			}
		}
		if err := r.vehicles.UpdateStatus(ctx, in.VIN, target); err != nil {
			return nil, err
		}
		out.ProposedStatus = target
	}

	return out, nil
}

// ListForVehicle returns checklist template items joined with per-vehicle
// progress, resolving the template from the vehicle or the active default.
func (r *ChecklistResultRecorder) ListForVehicle(ctx context.Context, vin string, checklistType domain.ChecklistType) ([]domain.ChecklistItemView, error) {
	if !checklistType.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}

	vehicle, err := r.vehicles.GetByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}

	var templateID *int
	switch checklistType {
	case domain.ChecklistTypeEOL:
		templateID = vehicle.EOLTemplateID
	case domain.ChecklistTypeShipment:
		templateID = vehicle.ShipmentTemplateID
	case domain.ChecklistTypeTest:
		templateID = vehicle.TestTemplateID
	}

	resolved := 0
	if templateID != nil {
		resolved = *templateID
	} else {
		resolved, err = r.checklist.ResolveDefaultTemplateID(ctx, checklistType, vehicle.VehicleModelID)
		if err != nil {
			return nil, err
		}
	}

	return r.checklist.ListItemsWithProgress(ctx, vin, checklistType, resolved)
}

// ListApplicableForVehicle returns the vehicle's applicable items of one type
// (stage rule): the set behind both the pre-shipment warning and progress %.
func (r *ChecklistResultRecorder) ListApplicableForVehicle(ctx context.Context, vin string, checklistType domain.ChecklistType) ([]domain.ChecklistItemView, error) {
	if !checklistType.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	return r.checklist.ListApplicableItems(ctx, vin, checklistType)
}

// checklistChange is the before/after of one item for its audit row. The
// notes are the ones shown for each status (domain.ChecklistNotes.NoteFor).
type checklistChange struct {
	oldStatus domain.CheckStatus
	oldNote   string
	newNote   string
}

// appendChecklistAudit writes CHECKLIST_ITEM_UPDATE. On EoL the replaced and
// the new note go into metadata as old_note / new_note so an overwritten note
// is not lost; a key is left out entirely when its note is empty.
func (r *ChecklistResultRecorder) appendChecklistAudit(ctx context.Context, in RecordChecklistInput, change checklistChange) error {
	if r == nil || r.audit == nil {
		return nil
	}
	metadata := map[string]any{
		"item_id":        in.ItemID,
		"checklist_type": string(in.ChecklistType),
	}
	if in.ChecklistType == domain.ChecklistTypeEOL {
		if strings.TrimSpace(change.oldNote) != "" {
			metadata["old_note"] = change.oldNote
		}
		if strings.TrimSpace(change.newNote) != "" {
			metadata["new_note"] = change.newNote
		}
	}
	actor := in.CheckerID
	return r.audit.Append(ctx, domain.AuditLog{
		VIN:         in.VIN,
		EventType:   domain.AuditEventChecklistItemUpdate,
		OldValue:    string(change.oldStatus),
		NewValue:    string(in.Status),
		PerformedBy: &actor,
		Metadata:    metadata,
	})
}

// ListTemplates returns every checklist template with a live item count for
// the /templates admin page.
func (r *ChecklistResultRecorder) ListTemplates(ctx context.Context) ([]domain.ChecklistTemplateSummary, error) {
	items, err := r.checklist.ListTemplates(ctx)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.ChecklistTemplateSummary{}
	}
	return items, nil
}

// ListTemplateItems returns every item of one template (including inactive)
// for the editor pane.
func (r *ChecklistResultRecorder) ListTemplateItems(ctx context.Context, templateID int) ([]domain.ChecklistTemplateItem, error) {
	items, err := r.checklist.ListTemplateItems(ctx, templateID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.ChecklistTemplateItem{}
	}
	return items, nil
}
