package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// branchShipCase is a vehicle whose EOL BRANCH, TEST and station steps are
// all done and whose SHIPMENT list is entirely open (missing and NOT_OK
// rows); break() then takes away exactly one remaining condition.
type branchShipCase struct {
	name        string
	breakIt     func(views map[string][]domain.ChecklistItemView, steps *[]domain.VehicleStationStepProgress)
	wantBlocked domain.ChecklistType // "" = ship succeeds
	wantSteps   int
}

func passingItem(id int, phase *domain.EOLItemPhase) domain.ChecklistItemView {
	pid := int64(id)
	return domain.ChecklistItemView{ItemID: id, Status: domain.CheckStatusOK, ProgressID: &pid, IsActive: true, EolPhase: phase}
}

// TestEOLBranchShip_ShipmentNoLongerGates: open SHIPMENT items never block
// branch ship (Karar 33); a missing or NOT_OK TEST item, a missing or NOT_OK
// EOL BRANCH item and an incomplete station step still do, and nothing is
// written when blocked.
func TestEOLBranchShip_ShipmentNoLongerGates(t *testing.T) {
	branch, depot := domain.EOLItemPhaseBranch, domain.EOLItemPhaseDepot
	notOK := func(it domain.ChecklistItemView) domain.ChecklistItemView {
		it.Status = domain.CheckStatusNotOK
		return it
	}
	missing := func(it domain.ChecklistItemView) domain.ChecklistItemView {
		it.Status = domain.CheckStatusPending
		it.ProgressID = nil
		return it
	}
	eolKey, testKey := eolTestVIN+"|EOL", eolTestVIN+"|TEST"

	cases := []branchShipCase{
		{name: "shipment open, everything else done", breakIt: func(map[string][]domain.ChecklistItemView, *[]domain.VehicleStationStepProgress) {}},
		{name: "test item missing", wantBlocked: domain.ChecklistTypeTest,
			breakIt: func(v map[string][]domain.ChecklistItemView, _ *[]domain.VehicleStationStepProgress) {
				v[testKey][0] = missing(v[testKey][0])
			}},
		{name: "test item NOT_OK", wantBlocked: domain.ChecklistTypeTest,
			breakIt: func(v map[string][]domain.ChecklistItemView, _ *[]domain.VehicleStationStepProgress) {
				v[testKey][1] = notOK(v[testKey][1])
			}},
		{name: "branch eol item missing", wantBlocked: domain.ChecklistTypeEOL,
			breakIt: func(v map[string][]domain.ChecklistItemView, _ *[]domain.VehicleStationStepProgress) {
				v[eolKey][0] = missing(v[eolKey][0])
			}},
		{name: "branch eol item NOT_OK", wantBlocked: domain.ChecklistTypeEOL,
			breakIt: func(v map[string][]domain.ChecklistItemView, _ *[]domain.VehicleStationStepProgress) {
				v[eolKey][1] = notOK(v[eolKey][1])
			}},
		{name: "station step pending", wantSteps: 1,
			breakIt: func(_ map[string][]domain.ChecklistItemView, s *[]domain.VehicleStationStepProgress) {
				(*s)[0].Status = domain.StationStepStatusPending
			}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			vehicles := newFakeVehicleRepo()
			vehicles.vehicles[eolTestVIN] = &domain.Vehicle{VIN: eolTestVIN, CurrentGlobalStatus: domain.VehicleStatusInProduction}
			workflow := newFakeEOLWorkflowRepo()
			workflow.seed(eolTestVIN)
			audit := newFakeAuditRepo()
			checklist := newFakeChecklistRepo()
			checklist.views = map[string][]domain.ChecklistItemView{
				eolKey:  {passingItem(1, &branch), passingItem(2, &branch), missing(passingItem(3, &depot))},
				testKey: {passingItem(11, nil), passingItem(12, nil)},
				eolTestVIN + "|SHIPMENT": {
					missing(passingItem(21, nil)),
					notOK(passingItem(22, nil)),
					missing(passingItem(23, nil)),
				},
			}
			steps := newFakeStationStepRepo()
			rows := []domain.VehicleStationStepProgress{
				{VIN: eolTestVIN, StationStepID: 1, Status: domain.StationStepStatusOK},
				{VIN: eolTestVIN, StationStepID: 2, Status: domain.StationStepStatusOK},
			}
			tc.breakIt(checklist.views, &rows)
			steps.rows[eolTestVIN] = rows
			uow := &passthroughFakeUoW{}
			checklists := usecase.NewChecklistResultRecorder(vehicles, checklist, audit, uow)
			shipper := usecase.NewEOLBranchShipper(vehicles, newFakeIssueRepo(), workflow, checklists, checklist, steps, uow)

			out, err := shipper.Ship(context.Background(), eolTestVIN, 7)
			wf, _ := workflow.Get(context.Background(), eolTestVIN)

			if tc.wantBlocked == "" && tc.wantSteps == 0 {
				if err != nil {
					t.Fatalf("ship with only SHIPMENT open must succeed, got %v", err)
				}
				if out.CurrentStage != domain.EOLStageDepot || wf.BranchShippedAt == nil {
					t.Fatalf("not shipped: stage=%q shipped_at=%v", out.CurrentStage, wf.BranchShippedAt)
				}
				t.Logf("shipped with 3 open SHIPMENT items → stage %s, status %s", out.CurrentStage, out.VehicleStatus)
				return
			}

			var blocked *domain.EOLBranchShipBlockedError
			if !errors.As(err, &blocked) {
				t.Fatalf("expected EOLBranchShipBlockedError, got %v", err)
			}
			if wf.BranchShippedAt != nil {
				t.Error("branch_shipped_at written although blocked")
			}
			if blocked.StationStepsRemaining != tc.wantSteps {
				t.Errorf("StationStepsRemaining = %d, want %d", blocked.StationStepsRemaining, tc.wantSteps)
			}
			var types []domain.ChecklistType
			for _, b := range blocked.Blockers {
				types = append(types, b.ChecklistType)
				if b.ChecklistType == domain.ChecklistTypeShipment {
					t.Errorf("SHIPMENT listed as a blocker: %+v", b)
				}
			}
			if tc.wantBlocked != "" && (len(types) != 1 || types[0] != tc.wantBlocked) {
				t.Errorf("blockers = %v, want only %s", types, tc.wantBlocked)
			}
			if tc.wantBlocked == "" && len(types) != 0 {
				t.Errorf("blockers = %v, want none (station steps only)", types)
			}
			t.Logf("blocked: checklists=%v station_steps=%d", types, blocked.StationStepsRemaining)
		})
	}
}
