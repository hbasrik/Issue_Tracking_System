package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// IssueManager handles the issue lifecycle: OPEN -> IN_PROGRESS -> DONE ->
// APPROVED.
type IssueManager struct {
	issues repository.IssueRepository
	audit  repository.AuditRepository
	uow    repository.TransactionManager
}

// NewIssueManager wires the usecase with its repositories.
func NewIssueManager(issues repository.IssueRepository, audit repository.AuditRepository, uow repository.TransactionManager) *IssueManager {
	return &IssueManager{issues: issues, audit: audit, uow: uow}
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
// state machine and role-based authorization (Decision Log #4). It records an
// ISSUE_STATUS_CHANGE audit entry attributed to actorID so every state change
// is traceable to the user who performed it (FR-1.2).
func (m *IssueManager) TransitionStatus(ctx context.Context, id int64, target domain.IssueStatus, actorID int, actorRole domain.UserRole) error {
	issue, err := m.issues.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if err := AuthorizeIssueTransition(issue.Status, target, actorRole); err != nil {
		return err
	}

	performedBy := actorID
	return m.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := m.issues.UpdateStatus(txCtx, id, target, actorID); err != nil {
			return err
		}
		return m.audit.Append(txCtx, domain.AuditLog{
			VIN:         issue.VIN,
			EventType:   domain.AuditEventIssueStatusChange,
			OldValue:    string(issue.Status),
			NewValue:    string(target),
			StationID:   issue.StationID,
			PerformedBy: &performedBy,
			Metadata:    map[string]any{"issue_id": id},
		})
	})
}

// AuthorizeIssueTransition validates an issue status transition for a role.
//
// State machine: OPEN -> IN_PROGRESS -> DONE -> APPROVED (no skips, no
// reversals). RBAC (enforced here in the usecase layer, not just the handler):
// an OPERATOR may drive the repair chain OPEN -> IN_PROGRESS -> DONE; only a
// MANAGER_ADMIN may give final quality sign-off DONE -> APPROVED. Any other
// attempted transition, by either role, is rejected.
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
		// Both roles: the technician (operator) finishes the repair.
		return nil
	case current == domain.IssueStatusDone && target == domain.IssueStatusApproved:
		// Quality sign-off is manager-only.
		if role != domain.UserRoleManagerAdmin {
			return domain.ErrForbidden
		}
		return nil
	default:
		return domain.ErrInvalidStatusTransition
	}
}
