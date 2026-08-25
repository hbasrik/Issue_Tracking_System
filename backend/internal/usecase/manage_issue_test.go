package usecase_test

import (
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestAuthorizeIssueTransition_OperatorCannotApprove proves a role without
// the quality sign-off permissions cannot approve on either branch.
func TestAuthorizeIssueTransition_OperatorCannotApprove(t *testing.T) {
	for _, target := range []domain.IssueStatus{
		domain.IssueStatusApproved,
		domain.IssueStatusConditionalApproved,
	} {
		t.Run(string(target), func(t *testing.T) {
			err := usecase.AuthorizeIssueTransition(
				domain.IssueStatusDone, target, operatorPermissions())
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("expected ErrForbidden for operator DONE->%s, got %v", target, err)
			}
		})
	}
}

// TestAuthorizeIssueTransition_AllowedPaths covers the permitted transitions
// for each seeded permission set, including the operator's full repair chain
// and the manager's quality sign-off.
func TestAuthorizeIssueTransition_AllowedPaths(t *testing.T) {
	cases := []struct {
		name        string
		current     domain.IssueStatus
		target      domain.IssueStatus
		permissions domain.PermissionSet
	}{
		{"operator opens", domain.IssueStatusOpen, domain.IssueStatusInProgress, operatorPermissions()},
		{"operator finishes", domain.IssueStatusInProgress, domain.IssueStatusDone, operatorPermissions()},
		{"manager approves", domain.IssueStatusDone, domain.IssueStatusApproved, managerPermissions()},
		{"manager conditionally approves", domain.IssueStatusDone, domain.IssueStatusConditionalApproved, managerPermissions()},
		{"quality approves", domain.IssueStatusDone, domain.IssueStatusApproved, qualityPermissions()},
		{"quality conditionally approves", domain.IssueStatusDone, domain.IssueStatusConditionalApproved, qualityPermissions()},
		{"assembly opens", domain.IssueStatusOpen, domain.IssueStatusInProgress, assemblyPermissions()},
		{"assembly finishes", domain.IssueStatusInProgress, domain.IssueStatusDone, assemblyPermissions()},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := usecase.AuthorizeIssueTransition(c.current, c.target, c.permissions); err != nil {
				t.Errorf("expected transition to be allowed, got %v", err)
			}
		})
	}
}

// TestAuthorizeIssueTransition_IllegalPathsRejected covers skips and reversals.
// They are rejected by the state machine before permissions are consulted, so
// even a fully-privileged manager cannot perform them.
func TestAuthorizeIssueTransition_IllegalPathsRejected(t *testing.T) {
	cases := []struct {
		name        string
		current     domain.IssueStatus
		target      domain.IssueStatus
		permissions domain.PermissionSet
	}{
		{"skip to done", domain.IssueStatusOpen, domain.IssueStatusDone, managerPermissions()},
		{"skip to approved", domain.IssueStatusInProgress, domain.IssueStatusApproved, managerPermissions()},
		{"skip to conditional approved", domain.IssueStatusInProgress, domain.IssueStatusConditionalApproved, managerPermissions()},
		{"reversal", domain.IssueStatusDone, domain.IssueStatusInProgress, managerPermissions()},

		// Karar 6 gives the lifecycle two terminal states. Neither may be
		// left, and neither may be converted into the other.
		{"approved is terminal", domain.IssueStatusApproved, domain.IssueStatusConditionalApproved, managerPermissions()},
		{"conditional approved is terminal", domain.IssueStatusConditionalApproved, domain.IssueStatusApproved, managerPermissions()},
		{"conditional approved cannot reopen", domain.IssueStatusConditionalApproved, domain.IssueStatusInProgress, managerPermissions()},
		{"conditional approved cannot repeat", domain.IssueStatusConditionalApproved, domain.IssueStatusConditionalApproved, managerPermissions()},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := usecase.AuthorizeIssueTransition(c.current, c.target, c.permissions); !errors.Is(err, domain.ErrInvalidStatusTransition) {
				t.Errorf("expected ErrInvalidStatusTransition, got %v", err)
			}
		})
	}
}

// TestAuthorizeIssueTransition_NoPermissionsForbidden proves the table-driven
// mechanism fails closed: a user whose role grants nothing cannot drive any
// legal transition.
func TestAuthorizeIssueTransition_NoPermissionsForbidden(t *testing.T) {
	cases := []struct {
		name    string
		current domain.IssueStatus
		target  domain.IssueStatus
	}{
		{"open to in progress", domain.IssueStatusOpen, domain.IssueStatusInProgress},
		{"in progress to done", domain.IssueStatusInProgress, domain.IssueStatusDone},
		{"done to approved", domain.IssueStatusDone, domain.IssueStatusApproved},
		{"done to conditional approved", domain.IssueStatusDone, domain.IssueStatusConditionalApproved},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := usecase.AuthorizeIssueTransition(c.current, c.target, domain.PermissionSet{})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Errorf("expected ErrForbidden, got %v", err)
			}
		})
	}
}

func TestAuthorizeIssueTransition_QualityCannotProgress(t *testing.T) {
	err := usecase.AuthorizeIssueTransition(
		domain.IssueStatusOpen, domain.IssueStatusInProgress, qualityPermissions())
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("quality OPEN->IN_PROGRESS: %v", err)
	}
}

func TestAuthorizeIssueTransition_AssemblyCannotApprove(t *testing.T) {
	for _, target := range []domain.IssueStatus{
		domain.IssueStatusApproved,
		domain.IssueStatusConditionalApproved,
	} {
		err := usecase.AuthorizeIssueTransition(
			domain.IssueStatusDone, target, assemblyPermissions())
		if !errors.Is(err, domain.ErrForbidden) {
			t.Fatalf("assembly DONE->%s: %v", target, err)
		}
	}
}
