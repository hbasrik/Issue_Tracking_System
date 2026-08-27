package usecase_test

import (
	"context"
	"testing"
	"time"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestVehicleStatusChangeRecordsPerformedBy proves that a successful manual
// vehicle status change writes an audit_logs entry whose performed_by is
// populated with the acting user's id (FR-1.2).
func TestVehicleStatusChangeRecordsPerformedBy(t *testing.T) {
	const actorID = 7
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles["VIN0000000000001"] = &domain.Vehicle{
		VIN:                 "VIN0000000000001",
		CurrentGlobalStatus: domain.VehicleStatusInProduction,
	}
	audit := newFakeAuditRepo()
	svc := usecase.NewVehicleService(vehicles, newFakeChecklistRepo(), audit, &passthroughFakeUoW{})

	_, err := svc.ChangeStatus(context.Background(), "VIN0000000000001", domain.VehicleStatusOnHold, actorID)
	if err != nil {
		t.Fatalf("ChangeStatus returned error: %v", err)
	}

	if len(audit.entries) != 1 {
		t.Fatalf("expected exactly 1 audit entry, got %d", len(audit.entries))
	}
	entry := audit.entries[0]
	if entry.EventType != domain.AuditEventStatusChange {
		t.Errorf("expected STATUS_CHANGE event, got %q", entry.EventType)
	}
	if entry.PerformedBy == nil {
		t.Fatal("performed_by must not be nil after a status change")
	}
	if *entry.PerformedBy != actorID {
		t.Errorf("performed_by = %d, want %d", *entry.PerformedBy, actorID)
	}
	if entry.OldValue != string(domain.VehicleStatusInProduction) || entry.NewValue != string(domain.VehicleStatusOnHold) {
		t.Errorf("unexpected old/new value: %q -> %q", entry.OldValue, entry.NewValue)
	}
}

// TestIssueStatusChangeRecordsPerformedBy proves that a successful issue status
// transition writes an audit_logs entry whose performed_by is populated with
// the acting user's id (FR-1.2).
func TestIssueStatusChangeRecordsPerformedBy(t *testing.T) {
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
	mgr := usecase.NewIssueManager(issues, audit, &passthroughFakeUoW{})

	err = mgr.TransitionStatus(context.Background(), id, domain.IssueStatusInProgress, actorID, operatorPermissions(), "")
	if err != nil {
		t.Fatalf("TransitionStatus returned error: %v", err)
	}

	if len(audit.entries) != 1 {
		t.Fatalf("expected exactly 1 audit entry, got %d", len(audit.entries))
	}
	entry := audit.entries[0]
	if entry.EventType != domain.AuditEventIssueStatusChange {
		t.Errorf("expected ISSUE_STATUS_CHANGE event, got %q", entry.EventType)
	}
	if entry.PerformedBy == nil {
		t.Fatal("performed_by must not be nil after an issue status change")
	}
	if *entry.PerformedBy != actorID {
		t.Errorf("performed_by = %d, want %d", *entry.PerformedBy, actorID)
	}
}

// TestVehicleListStatusHistory_ReturnsNamedRows proves GET-side history
// surfaces the last STATUS_CHANGE with an actor name already joined.
func TestVehicleListStatusHistory_ReturnsNamedRows(t *testing.T) {
	const vin = "VIN0000000000001"
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{
		VIN:                 vin,
		CurrentGlobalStatus: domain.VehicleStatusOnHold,
	}
	audit := newFakeAuditRepo()
	at := time.Now()
	audit.entries = []domain.AuditLog{{
		ID: 3, VIN: vin, EventType: domain.AuditEventStatusChange,
		OldValue: "IN_PRODUCTION", NewValue: "ON_HOLD", EventAt: at,
	}}
	svc := usecase.NewVehicleService(vehicles, newFakeChecklistRepo(), audit, &passthroughFakeUoW{})

	items, err := svc.ListStatusHistory(context.Background(), vin)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if items[0].FromStatus != "IN_PRODUCTION" || items[0].ToStatus != "ON_HOLD" {
		t.Errorf("unexpected %q -> %q", items[0].FromStatus, items[0].ToStatus)
	}
}
