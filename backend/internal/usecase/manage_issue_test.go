package usecase_test

import (
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestAuthorizeIssueTransition_OperatorCannotApprove proves the key RBAC rule:
// an OPERATOR may not give quality sign-off (DONE -> APPROVED) because the
// seeded matrix withholds issue.transition.approve from that role.
func TestAuthorizeIssueTransition_OperatorCannotApprove(t *testing.T) {
	err := usecase.AuthorizeIssueTransition(
		domain.IssueStatusDone, domain.IssueStatusApproved, operatorPermissions())
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for operator DONE->APPROVED, got %v", err)
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
		{"reversal", domain.IssueStatusDone, domain.IssueStatusInProgress, managerPermissions()},
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
