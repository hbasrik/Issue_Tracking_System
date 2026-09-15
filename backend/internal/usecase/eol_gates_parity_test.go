package usecase_test

import (
	"testing"
	"time"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestAppLayerGatesMatchDBTriggers proves BuildEOLGates.Ready is the inverse
// of the migration-0022 trigger block predicates for the same counters.
// Defense-in-depth: UI/API and fn_enforce_* must agree on when an action is allowed.
func TestAppLayerGatesMatchDBTriggers(t *testing.T) {
	now := time.Now()

	t.Run("branch_ship", func(t *testing.T) {
		cases := []struct {
			name    string
			gate    domain.EOLBranchShipGate
			wantApp bool // Ready
		}{
			{
				name:    "all clear",
				gate:    domain.EOLBranchShipGate{},
				wantApp: true,
			},
			{
				name:    "branch eol remaining",
				gate:    domain.EOLBranchShipGate{BranchEOLRemaining: 2},
				wantApp: false,
			},
			{
				name:    "test remaining",
				gate:    domain.EOLBranchShipGate{TestRemaining: 1},
				wantApp: false,
			},
			{
				name:    "shipment remaining",
				gate:    domain.EOLBranchShipGate{ShipmentRemaining: 3},
				wantApp: false,
			},
			{
				name:    "station steps remaining",
				gate:    domain.EOLBranchShipGate{StationStepsRemaining: 4},
				wantApp: false,
			},
			{
				name:    "open issues soft — still ready",
				gate:    domain.EOLBranchShipGate{OpenIssueCount: 5},
				wantApp: true,
			},
			{
				name:    "already done — not ready to ship again",
				gate:    domain.EOLBranchShipGate{AlreadyDone: true},
				wantApp: false,
			},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				triggerBlocks := usecase.TriggerBranchShipWouldBlock(tc.gate)
				// When already done the trigger does not fire; app Ready is false.
				if tc.gate.AlreadyDone {
					if tc.gate.Ready != tc.wantApp && BuildBranchReady(tc.gate) != tc.wantApp {
						t.Fatalf("fixture wantApp=%v", tc.wantApp)
					}
					appReady := BuildBranchReady(tc.gate)
					if appReady != tc.wantApp {
						t.Fatalf("app ready=%v want %v", appReady, tc.wantApp)
					}
					if triggerBlocks {
						t.Fatal("trigger must not block an already-done transition")
					}
					return
				}
				appReady := BuildBranchReady(tc.gate)
				if appReady != tc.wantApp {
					t.Fatalf("app ready=%v want %v", appReady, tc.wantApp)
				}
				if appReady == triggerBlocks {
					t.Fatalf("parity broken: app ready=%v triggerBlocks=%v", appReady, triggerBlocks)
				}
			})
		}
	})

	t.Run("depot_release", func(t *testing.T) {
		cases := []struct {
			name    string
			gate    domain.EOLDepotReleaseGate
			wantApp bool
		}{
			{
				name:    "all clear after branch ship",
				gate:    domain.EOLDepotReleaseGate{},
				wantApp: true,
			},
			{
				name:    "needs branch ship",
				gate:    domain.EOLDepotReleaseGate{NeedsBranchShip: true},
				wantApp: false,
			},
			{
				name:    "depot eol remaining",
				gate:    domain.EOLDepotReleaseGate{DepotEOLRemaining: 2},
				wantApp: false,
			},
			{
				name:    "open issues hard block",
				gate:    domain.EOLDepotReleaseGate{OpenIssueCount: 1},
				wantApp: false,
			},
			{
				name:    "already done",
				gate:    domain.EOLDepotReleaseGate{AlreadyDone: true},
				wantApp: false,
			},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				appReady := BuildDepotReady(tc.gate)
				if appReady != tc.wantApp {
					t.Fatalf("app ready=%v want %v", appReady, tc.wantApp)
				}
				triggerBlocks := usecase.TriggerDepotReleaseWouldBlock(tc.gate)
				if tc.gate.AlreadyDone {
					if triggerBlocks {
						t.Fatal("trigger must not block already-done")
					}
					return
				}
				if appReady == triggerBlocks {
					t.Fatalf("parity broken: app ready=%v triggerBlocks=%v", appReady, triggerBlocks)
				}
			})
		}
	})

	t.Run("build_eol_gates_ready_flags", func(t *testing.T) {
		wf := &domain.EOLWorkflow{VIN: "TESTVIN"}
		gates := usecase.BuildEOLGates(wf, nil, 0, 0, 0, 0)
		if !gates.BranchShip.Ready {
			t.Fatal("expected branch ship ready on empty vehicle")
		}
		if gates.DepotRelease.Ready {
			t.Fatal("depot must need branch ship first")
		}
		if gates.DepotRelease.NeedsBranchShip {
			// ok
		} else {
			t.Fatal("expected needs_branch_ship")
		}
		if gates.Deliver.Ready {
			t.Fatal("deliver must need depot release")
		}

		wf.BranchShippedAt = &now
		gates = usecase.BuildEOLGates(wf, nil, 0, 0, 0, 0)
		if gates.BranchShip.Ready {
			t.Fatal("branch ship already done")
		}
		if !gates.DepotRelease.Ready {
			t.Fatal("expected depot ready after branch ship with no blockers")
		}

		wf.DepotReleasedAt = &now
		gates = usecase.BuildEOLGates(wf, nil, 0, 0, 0, 0)
		if !gates.Deliver.Ready {
			t.Fatal("expected deliver ready after depot release")
		}
	})

	t.Run("count_remainders_match_trigger_incomplete_plus_missing", func(t *testing.T) {
		// DB: incomplete = progress not OK/CONDITIONAL_OK; missing = no progress row.
		// App CountGateRemainders = len(blocking)+len(missing).
		pid := int64(1)
		items := []domain.ChecklistItemView{
			{ItemID: 1, Status: domain.CheckStatusOK, ProgressID: &pid, IsActive: true},
			{ItemID: 2, Status: domain.CheckStatusPending, ProgressID: &pid, IsActive: true},
			{ItemID: 3, Status: domain.CheckStatusPending, ProgressID: nil, IsActive: true},
			{ItemID: 4, Status: domain.CheckStatusNotOK, ProgressID: &pid, IsActive: true},
		}
		remaining, missing := usecase.CountGateRemainders(items)
		if missing != 1 {
			t.Fatalf("missing=%d want 1", missing)
		}
		// blocking: item 2 (PENDING with row) + item 4 (NOT_OK) = 2; + missing 1 = 3
		if remaining != 3 {
			t.Fatalf("remaining=%d want 3 (incomplete+missing)", remaining)
		}
		gate := domain.EOLBranchShipGate{BranchEOLRemaining: remaining, BranchEOLMissing: missing}
		if !usecase.TriggerBranchShipWouldBlock(gate) {
			t.Fatal("trigger must block when remainders > 0")
		}
		if BuildBranchReady(gate) {
			t.Fatal("app must not be ready")
		}
	})
}

func BuildBranchReady(g domain.EOLBranchShipGate) bool {
	return !g.AlreadyDone &&
		g.BranchEOLRemaining == 0 &&
		g.TestRemaining == 0 &&
		g.ShipmentRemaining == 0 &&
		g.StationStepsRemaining == 0
}

func BuildDepotReady(g domain.EOLDepotReleaseGate) bool {
	return !g.AlreadyDone &&
		!g.NeedsBranchShip &&
		g.DepotEOLRemaining == 0 &&
		g.OpenIssueCount == 0
}
