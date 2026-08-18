package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func TestTransitionStatus_DoneRequiresSolutionDescription(t *testing.T) {
	issues := newFakeIssueRepo()
	id, err := issues.Create(context.Background(), &domain.Issue{
		VIN:      "VIN0000000000099",
		Status:   domain.IssueStatusInProgress,
		Severity: domain.IssueSeverityMedium,
	})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	mgr := usecase.NewIssueManager(issues, newFakeAuditRepo(), &passthroughFakeUoW{})

	err = mgr.TransitionStatus(context.Background(), id, domain.IssueStatusDone, 2, operatorPermissions(), "  ")
	if !errors.Is(err, domain.ErrSolutionDescriptionRequired) {
		t.Fatalf("got %v, want ErrSolutionDescriptionRequired", err)
	}

	err = mgr.TransitionStatus(context.Background(), id, domain.IssueStatusDone, 2, operatorPermissions(), "reseated connector")
	if err != nil {
		t.Fatalf("done with solution: %v", err)
	}
	got, err := issues.GetByID(context.Background(), id)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != domain.IssueStatusDone {
		t.Fatalf("status = %s", got.Status)
	}
	if got.SolutionDescription != "reseated connector" {
		t.Fatalf("solution = %q", got.SolutionDescription)
	}
}
