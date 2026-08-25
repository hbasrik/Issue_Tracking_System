package usecase

import (
	"context"
	"fmt"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

const shipmentWarningListCap = 8

// ShipmentReadinessReader builds the soft pre-shipment warning list. It does
// not change depot-release hard-block rules.
type ShipmentReadinessReader struct {
	vehicles   repository.VehicleRepository
	checklists *ChecklistResultRecorder
	issues     repository.IssueRepository
}

// NewShipmentReadinessReader wires the reader.
func NewShipmentReadinessReader(
	vehicles repository.VehicleRepository,
	checklists *ChecklistResultRecorder,
	issues repository.IssueRepository,
) *ShipmentReadinessReader {
	return &ShipmentReadinessReader{vehicles: vehicles, checklists: checklists, issues: issues}
}

// ForVIN returns warnings that should be shown before shipping the vehicle.
// A SHIPPED vehicle is treated as already past this check (ready, no warnings).
func (r *ShipmentReadinessReader) ForVIN(ctx context.Context, vin string) (*domain.ShipmentReadiness, error) {
	vehicle, err := r.vehicles.GetByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}

	out := &domain.ShipmentReadiness{
		VIN:      vin,
		Status:   vehicle.CurrentGlobalStatus,
		Warnings: []domain.ShipmentWarning{},
	}
	if vehicle.CurrentGlobalStatus == domain.VehicleStatusShipped {
		out.Ready = true
		return out, nil
	}

	out.Warnings = append(out.Warnings, r.checklistWarnings(ctx, vin, domain.ChecklistTypeShipment)...)
	out.Warnings = append(out.Warnings, r.checklistWarnings(ctx, vin, domain.ChecklistTypeTest)...)
	out.Warnings = append(out.Warnings, r.checklistWarnings(ctx, vin, domain.ChecklistTypeEOL)...)

	open, err := r.issues.ListOpenByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	for _, issue := range open {
		out.Warnings = append(out.Warnings, domain.ShipmentWarning{
			Code:        domain.ShipmentWarningOpenIssue,
			Message:     fmt.Sprintf("Açık hata #%d (%s): %s", issue.ID, issue.Status, issue.Description),
			IssueID:     issue.ID,
			IssueStatus: issue.Status,
		})
	}

	out.Ready = len(out.Warnings) == 0
	return out, nil
}

func (r *ShipmentReadinessReader) checklistWarnings(ctx context.Context, vin string, typ domain.ChecklistType) []domain.ShipmentWarning {
	items, err := r.checklists.ListForVehicle(ctx, vin, typ)
	if err != nil {
		return []domain.ShipmentWarning{{
			Code:    codeForChecklist(typ),
			Message: fmt.Sprintf("%s checklist okunamadı: %s", typ, err.Error()),
		}}
	}
	var incomplete []domain.ChecklistItemView
	for _, it := range items {
		if !it.Status.IsPassing() {
			incomplete = append(incomplete, it)
		}
	}
	if len(incomplete) == 0 {
		return nil
	}

	label := checklistLabel(typ)
	var out []domain.ShipmentWarning
	limit := shipmentWarningListCap
	if len(incomplete) < limit {
		limit = len(incomplete)
	}
	remaining := len(incomplete) - limit
	for i := 0; i < limit; i++ {
		it := incomplete[i]
		out = append(out, domain.ShipmentWarning{
			Code:          codeForChecklist(typ),
			Message:       fmt.Sprintf("%s maddesi %d “%s” %s", label, it.ItemNo, it.ItemText, it.Status),
			ChecklistType: typ,
			ItemID:        it.ItemID,
			ItemStatus:    it.Status,
		})
	}
	if remaining > 0 && len(out) > 0 {
		out[len(out)-1].RemainingCount = remaining
		out[len(out)-1].Message += fmt.Sprintf(" — ve %d madde daha", remaining)
	}
	return out
}

func codeForChecklist(typ domain.ChecklistType) domain.ShipmentWarningCode {
	switch typ {
	case domain.ChecklistTypeTest:
		return domain.ShipmentWarningTestIncomplete
	case domain.ChecklistTypeEOL:
		return domain.ShipmentWarningEOLIncomplete
	default:
		return domain.ShipmentWarningShipmentIncomplete
	}
}

func checklistLabel(typ domain.ChecklistType) string {
	switch typ {
	case domain.ChecklistTypeTest:
		return "Test checklist"
	case domain.ChecklistTypeEOL:
		return "EOL checklist"
	default:
		return "Shipment checklist"
	}
}
