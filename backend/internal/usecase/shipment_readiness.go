package usecase

import (
	"context"
	"fmt"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/applog"
	"github.com/karea/backend/internal/repository"
)

const shipmentWarningListCap = 8

// ShipmentReadinessReader builds the soft pre-shipment warning list. It does
// not change depot-release hard-block rules.
type ShipmentReadinessReader struct {
	vehicles     repository.VehicleRepository
	checklists   *ChecklistResultRecorder
	issues       repository.IssueRepository
	stationSteps repository.StationStepProgressRepository
}

// NewShipmentReadinessReader wires the reader. stationSteps may be nil (no
// station-step warning).
func NewShipmentReadinessReader(
	vehicles repository.VehicleRepository,
	checklists *ChecklistResultRecorder,
	issues repository.IssueRepository,
	stationSteps repository.StationStepProgressRepository,
) *ShipmentReadinessReader {
	return &ShipmentReadinessReader{vehicles: vehicles, checklists: checklists, issues: issues, stationSteps: stationSteps}
}

// ForVIN returns warnings that should be shown before shipping the vehicle.
// Items come from the applicable set (stage rule), the same set the vehicle
// progress percentage counts: items of a stage the vehicle already passed
// and never evaluated are not listed. A delivered (or legacy SHIPPED)
// vehicle is past every stage: ready, no warnings.
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
	if vehicle.CurrentGlobalStatus == domain.VehicleStatusShipped ||
		vehicle.CurrentGlobalStatus == domain.VehicleStatusDelivered {
		out.Ready = true
		return out, nil
	}

	if r.stationSteps != nil {
		open, err := r.stationSteps.CountApplicableOpen(ctx, vin)
		if err != nil {
			return nil, err
		}
		if open > 0 {
			out.Warnings = append(out.Warnings, domain.ShipmentWarning{
				Code:           domain.ShipmentWarningStationSteps,
				Message:        fmt.Sprintf("%d istasyon adımı tamamlanmadı", open),
				RemainingCount: open,
			})
		}
	}
	out.Warnings = append(out.Warnings, r.checklistWarnings(ctx, vin, domain.ChecklistTypeTest)...)
	out.Warnings = append(out.Warnings, r.checklistWarnings(ctx, vin, domain.ChecklistTypeEOL)...)

	open, err := r.issues.ListOpenByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	for _, issue := range open {
		out.Warnings = append(out.Warnings, domain.ShipmentWarning{
			Code:             domain.ShipmentWarningOpenIssue,
			Message:          fmt.Sprintf("Açık hata #%d (%s): %s", issue.ID, issue.Status, issue.Description),
			IssueID:          issue.ID,
			IssueStatus:      issue.Status,
			IssueDescription: issue.Description,
		})
	}

	out.Ready = len(out.Warnings) == 0
	return out, nil
}

func (r *ShipmentReadinessReader) checklistWarnings(ctx context.Context, vin string, typ domain.ChecklistType) []domain.ShipmentWarning {
	items, err := r.checklists.ListApplicableForVehicle(ctx, vin, typ)
	if err != nil {
		// Internal error text stays in the log; clients get a typed flag.
		applog.Warn("shipment readiness checklist read failed",
			"vin", vin,
			"checklist_type", string(typ),
			"error", err.Error(),
		)
		return []domain.ShipmentWarning{{
			Code:          codeForChecklist(typ),
			Message:       fmt.Sprintf("%s okunamadı", checklistLabel(typ)),
			ChecklistType: typ,
			ReadFailed:    true,
		}}
	}
	var incomplete []domain.ChecklistItemView
	for _, it := range items {
		if !it.IsActive {
			continue
		}
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
			ItemNo:        int(it.ItemNo),
			ItemText:      it.ItemText,
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
	if typ == domain.ChecklistTypeTest {
		return domain.ShipmentWarningTestIncomplete
	}
	return domain.ShipmentWarningEOLIncomplete
}

func checklistLabel(typ domain.ChecklistType) string {
	if typ == domain.ChecklistTypeTest {
		return "Test checklist"
	}
	return "EOL checklist"
}
