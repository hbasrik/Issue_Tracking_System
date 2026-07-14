package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestVehicleStatusChangeRollsBackOnAuditFailure proves atomicity: when the
// audit insert fails inside WithinTx, the vehicle status must remain unchanged.
func TestVehicleStatusChangeRollsBackOnAuditFailure(t *testing.T) {
	const actorID = 7
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles["VIN0000000000001"] = &domain.Vehicle{
		VIN:                 "VIN0000000000001",
		CurrentGlobalStatus: domain.VehicleStatusInProduction,
	}
	audit := newFakeAuditRepo()
	audit.appendErr = errAuditInsertFailed
	uow := &snapshotFakeUoW{vehicles: vehicles, audit: audit}
	svc := usecase.NewVehicleService(vehicles, newFakeChecklistRepo(), audit, uow)

	_, err := svc.ChangeStatus(context.Background(), "VIN0000000000001", domain.VehicleStatusOnHold, actorID)
	if !errors.Is(err, errAuditInsertFailed) {
		t.Fatalf("expected audit insert error, got %v", err)
	}

	v, err := vehicles.GetByVIN(context.Background(), "VIN0000000000001")
	if err != nil {
		t.Fatalf("GetByVIN: %v", err)
	}
	if v.CurrentGlobalStatus != domain.VehicleStatusInProduction {
		t.Errorf("status = %q, want %q (update must be rolled back)", v.CurrentGlobalStatus, domain.VehicleStatusInProduction)
	}
	if len(audit.entries) != 0 {
		t.Errorf("expected no audit entries after rollback, got %d", len(audit.entries))
	}
}

// TestIssueStatusChangeRollsBackOnAuditFailure proves atomicity: when the
// audit insert fails inside WithinTx, the issue status must remain unchanged.
func TestIssueStatusChangeRollsBackOnAuditFailure(t *testing.T) {
	const actorID = 9
	issues := newFakeIssueRepo()
	id, err := issues.Create(context.Background(), &domain.Issue{
		VIN:    "VIN0000000000002",
		Status: domain.IssueStatusOpen,
	})
	if err != nil {
		t.Fatalf("seed issue: %v", err)
	}
	audit := newFakeAuditRepo()
	audit.appendErr = errAuditInsertFailed
	uow := &snapshotFakeUoW{issues: issues, audit: audit}
	mgr := usecase.NewIssueManager(issues, audit, uow)

	err = mgr.TransitionStatus(context.Background(), id, domain.IssueStatusInProgress, actorID, domain.UserRoleOperator)
	if !errors.Is(err, errAuditInsertFailed) {
		t.Fatalf("expected audit insert error, got %v", err)
	}

	issue, err := issues.GetByID(context.Background(), id)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if issue.Status != domain.IssueStatusOpen {
		t.Errorf("status = %q, want %q (update must be rolled back)", issue.Status, domain.IssueStatusOpen)
	}
	if len(audit.entries) != 0 {
		t.Errorf("expected no audit entries after rollback, got %d", len(audit.entries))
	}
}
