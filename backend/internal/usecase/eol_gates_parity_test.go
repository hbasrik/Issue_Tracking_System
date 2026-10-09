package usecase_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestAppLayerGatesMatchDBTriggers proves BuildEOLGates.Ready is the inverse
// of the trigger block predicates (branch ship: migration 0044; depot
// release: 0022) for the same counters.
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

	// Every combination of the branch-ship counters, with and without a
	// SHIPMENT blocker handed in: BuildEOLGates.Ready is exactly "not done and
	// nothing left in EOL BRANCH, TEST or station steps", the trigger mirror
	// blocks exactly when a not-yet-shipped vehicle is not ready, and the
	// SHIPMENT blocker changes neither (Karar 33).
	t.Run("branch_ship_every_combination", func(t *testing.T) {
		branch := domain.EOLItemPhaseBranch
		combos := 0
		for _, done := range []bool{false, true} {
			for _, eol := range []int{0, 1} {
				for _, test := range []int{0, 1} {
					for _, steps := range []int{0, 1} {
						for _, issues := range []int{0, 1} {
							for _, ship := range []int{0, 5} {
								wf := &domain.EOLWorkflow{VIN: "TESTVIN"}
								if done {
									wf.BranchShippedAt = &now
								}
								var blockers []domain.EOLChecklistBlocker
								if eol > 0 {
									blockers = append(blockers, domain.EOLChecklistBlocker{ChecklistType: domain.ChecklistTypeEOL, EolPhase: &branch, Remaining: eol, Missing: eol})
								}
								if test > 0 {
									blockers = append(blockers, domain.EOLChecklistBlocker{ChecklistType: domain.ChecklistTypeTest, Remaining: test})
								}
								if ship > 0 {
									blockers = append(blockers, domain.EOLChecklistBlocker{ChecklistType: domain.ChecklistTypeShipment, Remaining: ship, Missing: ship})
								}
								g := usecase.BuildEOLGates(wf, blockers, steps, 0, 0, issues).BranchShip
								want := !done && eol == 0 && test == 0 && steps == 0
								label := fmt.Sprintf("done=%v eol=%d test=%d steps=%d issues=%d shipment=%d", done, eol, test, steps, issues, ship)
								if g.Ready != want {
									t.Errorf("%s: Ready=%v want %v", label, g.Ready, want)
								}
								if g.Ready != BuildBranchReady(g) {
									t.Errorf("%s: BuildEOLGates.Ready=%v but counters say %v", label, g.Ready, BuildBranchReady(g))
								}
								blocks := usecase.TriggerBranchShipWouldBlock(g)
								if done && blocks {
									t.Errorf("%s: trigger must not fire on an already shipped vehicle", label)
								}
								if !done && blocks == g.Ready {
									t.Errorf("%s: parity broken: Ready=%v triggerBlocks=%v", label, g.Ready, blocks)
								}
								combos++
							}
						}
					}
				}
			}
		}
		t.Logf("%d combinations: app and trigger agree, SHIPMENT never decides", combos)
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
		g.StationStepsRemaining == 0
}

func BuildDepotReady(g domain.EOLDepotReleaseGate) bool {
	return !g.AlreadyDone &&
		!g.NeedsBranchShip &&
		g.DepotEOLRemaining == 0 &&
		g.OpenIssueCount == 0
}
