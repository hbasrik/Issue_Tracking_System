package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// IssueManager handles the issue lifecycle: OPEN -> IN_PROGRESS -> DONE.
type IssueManager struct {
	issues repository.IssueRepository
}

// NewIssueManager wires the usecase with its repository.
func NewIssueManager(issues repository.IssueRepository) *IssueManager {
	return &IssueManager{issues: issues}
}

// CreateIssueInput is the request to create a new issue.
type CreateIssueInput struct {
	VIN                string
	SourceType         domain.IssueSource
	SourceCheckpointID *int
	SourceCheckItemID  *int
	StationID          *int
	IssueTypeID        *int
	Severity           domain.IssueSeverity
	Description        string
	PictureURL         string
	ReporterID         int
}

// Create validates and inserts a new issue. Severity is mandatory
// (Decision Log #7) and new issues always start in the OPEN state.
func (m *IssueManager) Create(ctx context.Context, in CreateIssueInput) (*domain.Issue, error) {
	if in.Severity == "" {
		return nil, domain.ErrSeverityRequired
	}
	if !in.Severity.Valid() || !in.SourceType.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	if in.Description == "" {
		return nil, domain.ErrDescriptionRequired
	}

	issue := &domain.Issue{
		VIN:                in.VIN,
		SourceType:         in.SourceType,
		SourceCheckpointID: in.SourceCheckpointID,
		SourceCheckItemID:  in.SourceCheckItemID,
		StationID:          in.StationID,
		IssueTypeID:        in.IssueTypeID,
		Severity:           in.Severity,
		Description:        in.Description,
		PictureURL:         in.PictureURL,
		Status:             domain.IssueStatusOpen,
		IssueReporterID:    in.ReporterID,
	}

	id, err := m.issues.Create(ctx, issue)
	if err != nil {
		return nil, err
	}
	issue.ID = id
	return issue, nil
}

// TransitionStatus moves an issue to a new status, enforcing both the valid
// state machine and role-based authorization (Decision Log #4).
func (m *IssueManager) TransitionStatus(ctx context.Context, id int64, target domain.IssueStatus, actorID int, actorRole domain.UserRole) error {
	issue, err := m.issues.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if err := AuthorizeIssueTransition(issue.Status, target, actorRole); err != nil {
		return err
	}
	return m.issues.UpdateStatus(ctx, id, target, actorID)
}

// AuthorizeIssueTransition validates an issue status transition for a role.
//
// State machine: OPEN -> IN_PROGRESS -> DONE (no skips, no reversals).
// RBAC: an OPERATOR may only move OPEN -> IN_PROGRESS; only a MANAGER_ADMIN
// may finish/approve an issue (IN_PROGRESS -> DONE).
func AuthorizeIssueTransition(current, target domain.IssueStatus, role domain.UserRole) error {
	if !target.Valid() {
		return domain.ErrInvalidEnumValue
	}
	if !role.Valid() {
		return domain.ErrForbidden
	}

	switch {
	case current == domain.IssueStatusOpen && target == domain.IssueStatusInProgress:
		// Both roles may pick up an open issue.
		return nil
	case current == domain.IssueStatusInProgress && target == domain.IssueStatusDone:
		if role != domain.UserRoleManagerAdmin {
			return domain.ErrForbidden
		}
		return nil
	default:
		return domain.ErrInvalidStatusTransition
	}
}
