package usecase_test

import (
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestAuthorizeIssueTransition_OperatorCannotApprove proves the key RBAC rule:
// an OPERATOR may not give quality sign-off (DONE -> APPROVED); only a
// MANAGER_ADMIN can.
func TestAuthorizeIssueTransition_OperatorCannotApprove(t *testing.T) {
	err := usecase.AuthorizeIssueTransition(
		domain.IssueStatusDone, domain.IssueStatusApproved, domain.UserRoleOperator)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for operator DONE->APPROVED, got %v", err)
	}
}

// TestAuthorizeIssueTransition_AllowedPaths covers the permitted transitions
// for each role, including the operator's full repair chain and the manager's
// quality sign-off.
func TestAuthorizeIssueTransition_AllowedPaths(t *testing.T) {
	cases := []struct {
		name    string
		current domain.IssueStatus
		target  domain.IssueStatus
		role    domain.UserRole
	}{
		{"operator opens", domain.IssueStatusOpen, domain.IssueStatusInProgress, domain.UserRoleOperator},
		{"operator finishes", domain.IssueStatusInProgress, domain.IssueStatusDone, domain.UserRoleOperator},
		{"manager approves", domain.IssueStatusDone, domain.IssueStatusApproved, domain.UserRoleManagerAdmin},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := usecase.AuthorizeIssueTransition(c.current, c.target, c.role); err != nil {
				t.Errorf("expected transition to be allowed, got %v", err)
			}
		})
	}
}

// TestAuthorizeIssueTransition_IllegalPathsRejected covers skips and reversals.
func TestAuthorizeIssueTransition_IllegalPathsRejected(t *testing.T) {
	cases := []struct {
		name    string
		current domain.IssueStatus
		target  domain.IssueStatus
		role    domain.UserRole
	}{
		{"skip to done", domain.IssueStatusOpen, domain.IssueStatusDone, domain.UserRoleManagerAdmin},
		{"skip to approved", domain.IssueStatusInProgress, domain.IssueStatusApproved, domain.UserRoleManagerAdmin},
		{"reversal", domain.IssueStatusDone, domain.IssueStatusInProgress, domain.UserRoleManagerAdmin},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := usecase.AuthorizeIssueTransition(c.current, c.target, c.role); !errors.Is(err, domain.ErrInvalidStatusTransition) {
				t.Errorf("expected ErrInvalidStatusTransition, got %v", err)
			}
		})
	}
}
