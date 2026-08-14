package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// seedDoneIssue creates an issue already sitting at DONE, i.e. repaired and
// waiting for a quality decision, together with the manager wired to act on it.
func seedDoneIssue(t *testing.T) (*usecase.IssueManager, *fakeIssueRepo, int64) {
	t.Helper()

	issues := newFakeIssueRepo()
	id, err := issues.Create(context.Background(), &domain.Issue{
		VIN:      "VIN0000000000003",
		Status:   domain.IssueStatusDone,
		Severity: domain.IssueSeverityMedium,
	})
	if err != nil {
		t.Fatalf("seed issue: %v", err)
	}
	mgr := usecase.NewIssueManager(issues, newFakeAuditRepo(), &passthroughFakeUoW{})
	return mgr, issues, id
}

// TestTransitionStatus_ManagerCanConditionallyApprove proves Karar 6's second
// terminal branch works end to end and stamps the conditional columns rather
// than the full-approval ones.
func TestTransitionStatus_ManagerCanConditionallyApprove(t *testing.T) {
	const actorID = 4
	mgr, issues, id := seedDoneIssue(t)

	err := mgr.TransitionStatus(context.Background(), id,
		domain.IssueStatusConditionalApproved, actorID, managerPermissions())
	if err != nil {
		t.Fatalf("manager DONE->CONDITIONAL_APPROVED must succeed, got %v", err)
	}

	issue, err := issues.GetByID(context.Background(), id)
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != domain.IssueStatusConditionalApproved {
		t.Errorf("status = %q, want %q", issue.Status, domain.IssueStatusConditionalApproved)
	}
	if issue.ConditionalApproveReporterID == nil || *issue.ConditionalApproveReporterID != actorID {
		t.Errorf("conditional_approve_reporter_id = %v, want %d", issue.ConditionalApproveReporterID, actorID)
	}
	if issue.ConditionalApproveDate == nil {
		t.Error("conditional_approve_date was not stamped")
	}
	// The full-approval columns belong to the other branch and must stay clear.
	if issue.ApproveReporterID != nil || issue.ApproveDate != nil {
		t.Error("a conditional sign-off must not write the approve_* columns")
	}
}

// TestTransitionStatus_OperatorCannotConditionallyApprove proves the quality
// decision stays with Manager/Admin: the operator's seeded permission set
// omits issue.transition.conditional_approve, so the attempt 403s and the
// issue is left untouched.
func TestTransitionStatus_OperatorCannotConditionallyApprove(t *testing.T) {
	mgr, issues, id := seedDoneIssue(t)

	err := mgr.TransitionStatus(context.Background(), id,
		domain.IssueStatusConditionalApproved, 2, operatorPermissions())
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}

	issue, err := issues.GetByID(context.Background(), id)
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != domain.IssueStatusDone {
		t.Errorf("status = %q, want it to stay %q", issue.Status, domain.IssueStatusDone)
	}
	if issue.ConditionalApproveReporterID != nil {
		t.Error("a forbidden transition must not stamp conditional_approve_reporter_id")
	}
}

// TestTransitionStatus_ConditionalApprovedIsTerminal proves that once an issue
// has been conditionally approved no further transition is accepted, not even
// a conversion to the full APPROVED branch by a fully-privileged manager.
func TestTransitionStatus_ConditionalApprovedIsTerminal(t *testing.T) {
	ctx := context.Background()
	mgr, issues, id := seedDoneIssue(t)
	if err := mgr.TransitionStatus(ctx, id,
		domain.IssueStatusConditionalApproved, 4, managerPermissions()); err != nil {
		t.Fatalf("seed conditional approval: %v", err)
	}

	targets := []domain.IssueStatus{
		domain.IssueStatusApproved,
		domain.IssueStatusConditionalApproved,
		domain.IssueStatusInProgress,
		domain.IssueStatusOpen,
		domain.IssueStatusDone,
	}
	for _, target := range targets {
		t.Run(string(target), func(t *testing.T) {
			err := mgr.TransitionStatus(ctx, id, target, 4, managerPermissions())
			if !errors.Is(err, domain.ErrInvalidStatusTransition) {
				t.Errorf("expected ErrInvalidStatusTransition, got %v", err)
			}
		})
	}

	issue, err := issues.GetByID(ctx, id)
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if issue.Status != domain.IssueStatusConditionalApproved {
		t.Errorf("status = %q, want it to stay %q", issue.Status, domain.IssueStatusConditionalApproved)
	}
}
