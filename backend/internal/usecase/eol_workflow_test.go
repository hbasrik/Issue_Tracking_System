package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

const eolTestVIN = "1HGCM82633A004352"

// eolFixture wires the three EOL usecases over shared in-memory repositories.
type eolFixture struct {
	vehicles *fakeVehicleRepo
	issues   *fakeIssueRepo
	workflow *fakeEOLWorkflowRepo

	branchShip      *usecase.EOLBranchShipper
	depotRelease    *usecase.EOLDepotReleaser
	documentApprove *usecase.EOLDocumentApprover
}

func newEOLFixture(t *testing.T) *eolFixture {
	t.Helper()

	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[eolTestVIN] = &domain.Vehicle{
		VIN:                 eolTestVIN,
		CurrentGlobalStatus: domain.VehicleStatusInProduction,
	}
	issues := newFakeIssueRepo()
	workflow := newFakeEOLWorkflowRepo()
	workflow.seed(eolTestVIN)
	uow := &passthroughFakeUoW{}

	return &eolFixture{
		vehicles:        vehicles,
		issues:          issues,
		workflow:        workflow,
		branchShip:      usecase.NewEOLBranchShipper(vehicles, issues, workflow, uow),
		depotRelease:    usecase.NewEOLDepotReleaser(vehicles, issues, workflow, uow),
		documentApprove: usecase.NewEOLDocumentApprover(vehicles, workflow, uow),
	}
}

// openIssue seeds one not-yet-closed issue against the fixture's vehicle.
func (f *eolFixture) openIssue(t *testing.T, status domain.IssueStatus, severity domain.IssueSeverity) int64 {
	t.Helper()
	id, err := f.issues.Create(context.Background(), &domain.Issue{
		VIN:      eolTestVIN,
		Status:   status,
		Severity: severity,
	})
	if err != nil {
		t.Fatalf("seed issue: %v", err)
	}
	return id
}

// TestEOLBranchShip_SucceedsWithOpenIssuesAndWarns proves stage 1 is a
// soft-warning gate: open issues are reported but never block the shipment.
func TestEOLBranchShip_SucceedsWithOpenIssuesAndWarns(t *testing.T) {
	f := newEOLFixture(t)
	f.openIssue(t, domain.IssueStatusOpen, domain.IssueSeverityCritical)
	f.openIssue(t, domain.IssueStatusDone, domain.IssueSeverityLow)

	out, err := f.branchShip.Ship(context.Background(), eolTestVIN, 7)
	if err != nil {
		t.Fatalf("branch ship must not be blocked by open issues, got %v", err)
	}

	if out.OpenIssueCount != 2 {
		t.Errorf("open issue count = %d, want 2", out.OpenIssueCount)
	}
	if out.Warning == "" {
		t.Error("expected a non-blocking warning when shipping with open issues")
	}
	if out.CurrentStage != domain.EOLStageDepot {
		t.Errorf("stage = %q, want %q", out.CurrentStage, domain.EOLStageDepot)
	}

	// The shipment is recorded, the warning count is snapshotted, and the
	// vehicle moved into the warehouse.
	workflow, err := f.workflow.Get(context.Background(), eolTestVIN)
	if err != nil {
		t.Fatalf("get workflow: %v", err)
	}
	if workflow.BranchShippedAt == nil {
		t.Error("branch_shipped_at was not written")
	}
	if workflow.BranchOpenIssueCountAtShipment == nil || *workflow.BranchOpenIssueCountAtShipment != 2 {
		t.Errorf("open issue snapshot = %v, want 2", workflow.BranchOpenIssueCountAtShipment)
	}
	if got := f.vehicles.vehicles[eolTestVIN].CurrentGlobalStatus; got != domain.VehicleStatusInWarehouse {
		t.Errorf("vehicle status = %q, want %q", got, domain.VehicleStatusInWarehouse)
	}
}

// TestEOLDepotRelease_BlockedByOpenIssues proves stage 2 is a hard-block gate:
// it returns a structured error listing the blocking issues and writes nothing.
func TestEOLDepotRelease_BlockedByOpenIssues(t *testing.T) {
	f := newEOLFixture(t)
	blockingID := f.openIssue(t, domain.IssueStatusInProgress, domain.IssueSeverityCritical)
	if _, err := f.branchShip.Ship(context.Background(), eolTestVIN, 7); err != nil {
		t.Fatalf("branch ship: %v", err)
	}

	_, err := f.depotRelease.Release(context.Background(), eolTestVIN, 7)

	var blocked *domain.DepotReleaseBlockedError
	if !errors.As(err, &blocked) {
		t.Fatalf("expected *domain.DepotReleaseBlockedError, got %v", err)
	}
	if len(blocked.BlockingIssues) != 1 {
		t.Fatalf("blocking issues = %d, want 1", len(blocked.BlockingIssues))
	}
	if blocked.BlockingIssues[0].ID != blockingID {
		t.Errorf("blocking issue id = %d, want %d", blocked.BlockingIssues[0].ID, blockingID)
	}
	if blocked.BlockingIssues[0].Status != domain.IssueStatusInProgress {
		t.Errorf("blocking issue status = %q, want %q",
			blocked.BlockingIssues[0].Status, domain.IssueStatusInProgress)
	}

	// Nothing was written: the gate is checked before the update.
	workflow, err := f.workflow.Get(context.Background(), eolTestVIN)
	if err != nil {
		t.Fatalf("get workflow: %v", err)
	}
	if workflow.DepotReleasedAt != nil {
		t.Error("depot_released_at must not be written when the gate is closed")
	}
	if workflow.CurrentStage != domain.EOLStageDepot {
		t.Errorf("stage = %q, want it to stay at %q", workflow.CurrentStage, domain.EOLStageDepot)
	}
}

// TestEOLDepotRelease_SucceedsWhenNoOpenIssues proves the gate opens once every
// issue is closed, advancing the workflow to the document stage.
func TestEOLDepotRelease_SucceedsWhenNoOpenIssues(t *testing.T) {
	f := newEOLFixture(t)
	// An APPROVED issue is closed, so it does not hold the gate shut.
	f.openIssue(t, domain.IssueStatusApproved, domain.IssueSeverityMedium)
	if _, err := f.branchShip.Ship(context.Background(), eolTestVIN, 7); err != nil {
		t.Fatalf("branch ship: %v", err)
	}

	out, err := f.depotRelease.Release(context.Background(), eolTestVIN, 7)
	if err != nil {
		t.Fatalf("depot release with no open issues must succeed, got %v", err)
	}
	if out.CurrentStage != domain.EOLStageDocument {
		t.Errorf("stage = %q, want %q", out.CurrentStage, domain.EOLStageDocument)
	}

	workflow, err := f.workflow.Get(context.Background(), eolTestVIN)
	if err != nil {
		t.Fatalf("get workflow: %v", err)
	}
	if workflow.DepotReleasedAt == nil {
		t.Error("depot_released_at was not written")
	}
	if workflow.CurrentStage != domain.EOLStageDocument {
		t.Errorf("stored stage = %q, want %q", workflow.CurrentStage, domain.EOLStageDocument)
	}
}

// TestEOLDocumentApprove_SetsVehicleShipped proves stage 3 completes the
// workflow and moves the vehicle to SHIPPED.
func TestEOLDocumentApprove_SetsVehicleShipped(t *testing.T) {
	f := newEOLFixture(t)
	ctx := context.Background()
	if _, err := f.branchShip.Ship(ctx, eolTestVIN, 7); err != nil {
		t.Fatalf("branch ship: %v", err)
	}
	if _, err := f.depotRelease.Release(ctx, eolTestVIN, 7); err != nil {
		t.Fatalf("depot release: %v", err)
	}

	out, err := f.documentApprove.Approve(ctx, eolTestVIN, 9)
	if err != nil {
		t.Fatalf("document approve: %v", err)
	}
	if out.CurrentStage != domain.EOLStageCompleted {
		t.Errorf("stage = %q, want %q", out.CurrentStage, domain.EOLStageCompleted)
	}
	if out.VehicleStatus != domain.VehicleStatusShipped {
		t.Errorf("reported status = %q, want %q", out.VehicleStatus, domain.VehicleStatusShipped)
	}
	if got := f.vehicles.vehicles[eolTestVIN].CurrentGlobalStatus; got != domain.VehicleStatusShipped {
		t.Errorf("vehicle status = %q, want %q", got, domain.VehicleStatusShipped)
	}

	workflow, err := f.workflow.Get(ctx, eolTestVIN)
	if err != nil {
		t.Fatalf("get workflow: %v", err)
	}
	if workflow.DocumentApprovedAt == nil {
		t.Error("document_approved_at was not written")
	}
	if workflow.DocumentApprovedBy == nil || *workflow.DocumentApprovedBy != 9 {
		t.Errorf("document_approved_by = %v, want 9", workflow.DocumentApprovedBy)
	}
}

// TestEOLStagesMustRunInOrder proves a stage cannot be skipped: the workflow is
// sequential, so releasing from the depot before the branch shipped, or
// approving documents before the depot release, is rejected.
func TestEOLStagesMustRunInOrder(t *testing.T) {
	ctx := context.Background()

	t.Run("depot release before branch ship", func(t *testing.T) {
		f := newEOLFixture(t)
		_, err := f.depotRelease.Release(ctx, eolTestVIN, 7)
		if !errors.Is(err, domain.ErrInvalidStatusTransition) {
			t.Errorf("expected ErrInvalidStatusTransition, got %v", err)
		}
	})

	t.Run("document approve before depot release", func(t *testing.T) {
		f := newEOLFixture(t)
		if _, err := f.branchShip.Ship(ctx, eolTestVIN, 7); err != nil {
			t.Fatalf("branch ship: %v", err)
		}
		_, err := f.documentApprove.Approve(ctx, eolTestVIN, 7)
		if !errors.Is(err, domain.ErrInvalidStatusTransition) {
			t.Errorf("expected ErrInvalidStatusTransition, got %v", err)
		}
	})

	t.Run("branch ship is not repeatable", func(t *testing.T) {
		f := newEOLFixture(t)
		if _, err := f.branchShip.Ship(ctx, eolTestVIN, 7); err != nil {
			t.Fatalf("branch ship: %v", err)
		}
		_, err := f.branchShip.Ship(ctx, eolTestVIN, 7)
		if !errors.Is(err, domain.ErrInvalidStatusTransition) {
			t.Errorf("expected ErrInvalidStatusTransition, got %v", err)
		}
	})
}
