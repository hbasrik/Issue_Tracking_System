package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func TestUndoApproval_RevertsApprovedToDone(t *testing.T) {
	const actorID = 4
	mgr, issues, id := seedDoneIssue(t)
	ctx := context.Background()

	if err := mgr.TransitionStatus(ctx, id, domain.IssueStatusApproved, actorID, managerPermissions(), ""); err != nil {
		t.Fatalf("approve: %v", err)
	}

	if err := mgr.UndoApproval(ctx, id, actorID, managerPermissions()); err != nil {
		t.Fatalf("undo: %v", err)
	}

	issue, err := issues.GetByID(ctx, id)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if issue.Status != domain.IssueStatusDone {
		t.Errorf("status = %q, want DONE", issue.Status)
	}
	if issue.ApproveReporterID != nil || issue.ApproveDate != nil {
		t.Error("approve_* columns must be cleared after undo")
	}
	if issue.ConditionalApproveReporterID != nil || issue.ConditionalApproveDate != nil {
		t.Error("conditional_approve_* columns must stay clear")
	}
}

func TestUndoApproval_RevertsConditionalToDone(t *testing.T) {
	const actorID = 4
	mgr, issues, id := seedDoneIssue(t)
	ctx := context.Background()

	if err := mgr.TransitionStatus(ctx, id, domain.IssueStatusConditionalApproved, actorID, managerPermissions(), ""); err != nil {
		t.Fatalf("conditional approve: %v", err)
	}
	if err := mgr.UndoApproval(ctx, id, actorID, managerPermissions()); err != nil {
		t.Fatalf("undo: %v", err)
	}

	issue, err := issues.GetByID(ctx, id)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if issue.Status != domain.IssueStatusDone {
		t.Errorf("status = %q, want DONE", issue.Status)
	}
	if issue.ConditionalApproveReporterID != nil || issue.ConditionalApproveDate != nil {
		t.Error("conditional_approve_* columns must be cleared after undo")
	}
}

func TestUndoApproval_WritesAuditWithUndoAction(t *testing.T) {
	const actorID = 4
	issues := newFakeIssueRepo()
	audit := newFakeAuditRepo()
	id, err := issues.Create(context.Background(), &domain.Issue{
		VIN:      "VINUNDO000000001",
		Status:   domain.IssueStatusDone,
		Severity: domain.IssueSeverityMedium,
	})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	mgr := usecase.NewIssueManager(issues, audit, &passthroughFakeUoW{}, createIssueStubVehicles{}, createIssueStubCatalog{})
	ctx := context.Background()

	if err := mgr.TransitionStatus(ctx, id, domain.IssueStatusApproved, actorID, managerPermissions(), ""); err != nil {
		t.Fatalf("approve: %v", err)
	}
	if err := mgr.UndoApproval(ctx, id, actorID, managerPermissions()); err != nil {
		t.Fatalf("undo: %v", err)
	}

	var found bool
	for _, e := range audit.Entries() {
		if e.EventType != domain.AuditEventIssueStatusChange {
			continue
		}
		if e.OldValue != string(domain.IssueStatusApproved) || e.NewValue != string(domain.IssueStatusDone) {
			continue
		}
		if e.Metadata["action"] != "approval_undone" {
			t.Errorf("metadata action = %v, want approval_undone", e.Metadata["action"])
		}
		if e.PerformedBy == nil || *e.PerformedBy != actorID {
			t.Errorf("performed_by = %v, want %d", e.PerformedBy, actorID)
		}
		found = true
	}
	if !found {
		t.Fatal("expected ISSUE_STATUS_CHANGE audit with approval_undone")
	}
}

func TestUndoApproval_OriginalApproverAllowedWithoutPerm(t *testing.T) {
	const actorID = 9
	mgr, _, id := seedDoneIssue(t)
	ctx := context.Background()

	// Seed approval as actor 9 via TransitionStatus using manager perms, then
	// attempt undo as the same actor with an empty permission set.
	if err := mgr.TransitionStatus(ctx, id, domain.IssueStatusApproved, actorID, managerPermissions(), ""); err != nil {
		t.Fatalf("approve: %v", err)
	}
	if err := mgr.UndoApproval(ctx, id, actorID, domain.PermissionSet{}); err != nil {
		t.Fatalf("original approver must undo without perm, got %v", err)
	}
}

func TestUndoApproval_PeerWithSamePermAllowed(t *testing.T) {
	const approverID = 4
	const peerID = 8
	mgr, _, id := seedDoneIssue(t)
	ctx := context.Background()

	if err := mgr.TransitionStatus(ctx, id, domain.IssueStatusApproved, approverID, managerPermissions(), ""); err != nil {
		t.Fatalf("approve: %v", err)
	}
	if err := mgr.UndoApproval(ctx, id, peerID, managerPermissions()); err != nil {
		t.Fatalf("peer with approve perm must undo, got %v", err)
	}
}

func TestUndoApproval_ForbiddenWithoutPermOrOwnership(t *testing.T) {
	const approverID = 4
	const strangerID = 99
	mgr, issues, id := seedDoneIssue(t)
	ctx := context.Background()

	if err := mgr.TransitionStatus(ctx, id, domain.IssueStatusApproved, approverID, managerPermissions(), ""); err != nil {
		t.Fatalf("approve: %v", err)
	}
	err := mgr.UndoApproval(ctx, id, strangerID, operatorPermissions())
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}
	issue, _ := issues.GetByID(ctx, id)
	if issue.Status != domain.IssueStatusApproved {
		t.Errorf("status = %q, want APPROVED (unchanged)", issue.Status)
	}
}

func TestUndoApproval_RejectsNonTerminal(t *testing.T) {
	mgr, _, id := seedDoneIssue(t)
	err := mgr.UndoApproval(context.Background(), id, 4, managerPermissions())
	if !errors.Is(err, domain.ErrInvalidStatusTransition) {
		t.Fatalf("expected ErrInvalidStatusTransition on DONE, got %v", err)
	}
}

func TestUndoApproval_NotViaTransitionStatus(t *testing.T) {
	mgr, _, id := seedDoneIssue(t)
	ctx := context.Background()
	if err := mgr.TransitionStatus(ctx, id, domain.IssueStatusApproved, 4, managerPermissions(), ""); err != nil {
		t.Fatalf("approve: %v", err)
	}
	err := mgr.TransitionStatus(ctx, id, domain.IssueStatusDone, 4, managerPermissions(), "")
	if !errors.Is(err, domain.ErrInvalidStatusTransition) {
		t.Fatalf("PATCH-style reversal must stay blocked, got %v", err)
	}
}
