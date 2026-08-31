package usecase_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func TestChangeStatus_RejectsPlanned(t *testing.T) {
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles["VIN0000000000001"] = &domain.Vehicle{
		VIN:                 "VIN0000000000001",
		CurrentGlobalStatus: domain.VehicleStatusPlanned,
	}
	svc := usecase.NewVehicleService(vehicles, newFakeChecklistRepo(), newFakeAuditRepo(), &passthroughFakeUoW{})

	_, err := svc.ChangeStatus(context.Background(), "VIN0000000000001", domain.VehicleStatusInProduction, 1)
	if !errors.Is(err, domain.ErrInvalidStatusTransition) {
		t.Fatalf("from PLANNED: %v", err)
	}

	vehicles.vehicles["VIN0000000000001"].CurrentGlobalStatus = domain.VehicleStatusInProduction
	_, err = svc.ChangeStatus(context.Background(), "VIN0000000000001", domain.VehicleStatusPlanned, 1)
	if !errors.Is(err, domain.ErrInvalidStatusTransition) {
		t.Fatalf("to PLANNED: %v", err)
	}
}

func TestShipmentReadiness_ListsIncompleteChecklistsAndOpenIssues(t *testing.T) {
	vin := "N7V1K1SA9SK000001"
	vehicles := newFakeVehicleRepo()
	eolID, shipID, testID := 3, 4, 5
	vehicles.vehicles[vin] = &domain.Vehicle{
		VIN:                 vin,
		CurrentGlobalStatus: domain.VehicleStatusInProduction,
		EOLTemplateID:       &eolID,
		ShipmentTemplateID:  &shipID,
		TestTemplateID:      &testID,
	}
	checklists := newFakeChecklistRepo()
	checklists.views[vin+"|SHIPMENT"] = []domain.ChecklistItemView{
		{ItemID: 10, ItemNo: 1, ItemText: "Battery disconnect", Status: domain.CheckStatusPending},
		{ItemID: 11, ItemNo: 2, ItemText: "Keys handed over", Status: domain.CheckStatusOK},
	}
	checklists.views[vin+"|TEST"] = []domain.ChecklistItemView{
		{ItemID: 20, ItemNo: 1, ItemText: "Road test", Status: domain.CheckStatusOK},
	}
	checklists.views[vin+"|EOL"] = []domain.ChecklistItemView{
		{ItemID: 1, ItemNo: 1, ItemText: "Paint finish", Status: domain.CheckStatusPending},
	}
	issues := newFakeIssueRepo()
	_, _ = issues.Create(context.Background(), &domain.Issue{
		VIN: vin, Status: domain.IssueStatusOpen, Description: "scratch on door",
	})

	reader := usecase.NewShipmentReadinessReader(
		vehicles,
		usecase.NewChecklistResultRecorder(vehicles, checklists, nil, nil),
		issues,
	)
	got, err := reader.ForVIN(context.Background(), vin)
	if err != nil {
		t.Fatal(err)
	}
	if got.Ready {
		t.Fatal("expected not ready")
	}
	joined := ""
	for _, w := range got.Warnings {
		joined += w.Message + "\n"
	}
	if !strings.Contains(joined, "Shipment checklist maddesi 1") || !strings.Contains(joined, "Battery disconnect") {
		t.Errorf("missing shipment item: %s", joined)
	}
	if !strings.Contains(joined, "EOL checklist maddesi 1") {
		t.Errorf("missing EOL item: %s", joined)
	}
	if strings.Contains(joined, "Road test") {
		t.Errorf("passing test item should not warn: %s", joined)
	}
	if !strings.Contains(joined, "Açık hata") || !strings.Contains(joined, "scratch on door") {
		t.Errorf("missing open issue: %s", joined)
	}
}

func TestShipmentReadiness_ShippedIsReady(t *testing.T) {
	vin := "N7V1K1SA9SK000099"
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{
		VIN:                 vin,
		CurrentGlobalStatus: domain.VehicleStatusShipped,
	}
	reader := usecase.NewShipmentReadinessReader(
		vehicles,
		usecase.NewChecklistResultRecorder(vehicles, newFakeChecklistRepo(), nil, nil),
		newFakeIssueRepo(),
	)
	got, err := reader.ForVIN(context.Background(), vin)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Ready || len(got.Warnings) != 0 {
		t.Fatalf("shipped vehicle should skip warnings: %+v", got)
	}
}
