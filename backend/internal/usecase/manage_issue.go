package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// IssueManager handles the issue lifecycle: OPEN -> IN_PROGRESS -> DONE ->
// APPROVED or CONDITIONAL_APPROVED.
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
	VIN                 string
	SourceType          domain.IssueSource
	SourceStationStepID *int
	SourceCheckItemID   *int
	StationID           *int
	IssueTypeID         *int
	Severity            domain.IssueSeverity
	Description         string
	PictureURL          string
	ReporterID          int
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
		VIN:                 in.VIN,
		SourceType:          in.SourceType,
		SourceStationStepID: in.SourceStationStepID,
		SourceCheckItemID:   in.SourceCheckItemID,
		StationID:           in.StationID,
		IssueTypeID:         in.IssueTypeID,
		Severity:            in.Severity,
		Description:         in.Description,
		PictureURL:          in.PictureURL,
		Status:              domain.IssueStatusOpen,
		IssueReporterID:     in.ReporterID,
	}

	id, err := m.issues.Create(ctx, issue)
	if err != nil {
		return nil, err
	}
	issue.ID = id
	return issue, nil
}

// ListForUser returns issues where the user is a reporter at any lifecycle stage.
func (m *IssueManager) ListForUser(ctx context.Context, userID int, status *domain.IssueStatus) ([]domain.Issue, error) {
	if status != nil && !status.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	return m.issues.ListForUser(ctx, userID, status)
}

// GetByID returns a single issue by id (any authenticated caller).
func (m *IssueManager) GetByID(ctx context.Context, id int64) (*domain.Issue, error) {
	return m.issues.GetByID(ctx, id)
}

// TransitionStatus moves an issue to a new status, enforcing both the valid
// state machine and permission-based authorization. It records an
// ISSUE_STATUS_CHANGE audit entry attributed to actorID so every state change
// is traceable to the user who performed it (FR-1.2).
func (m *IssueManager) TransitionStatus(ctx context.Context, id int64, target domain.IssueStatus, actorID int, actorPermissions domain.PermissionSet) error {
	issue, err := m.issues.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if err := AuthorizeIssueTransition(issue.Status, target, actorPermissions); err != nil {
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

// AuthorizeIssueTransition validates an issue status transition against the
// caller's permissions.
//
// State machine: OPEN -> IN_PROGRESS -> DONE, then a quality decision that
// branches to either APPROVED or, per Karar 6, CONDITIONAL_APPROVED. No skips
// and no reversals, and both branches are terminal — an issue that already
// carries a quality decision cannot be moved again.
//
// Authorization is enforced here in the usecase layer rather than in routing
// because a single endpoint serves every transition, so the required
// permission depends on the target status. The seeded matrix grants the repair
// chain (issue.transition.in_progress, issue.transition.done) to OPERATOR and
// both sign-off branches (issue.transition.approve,
// issue.transition.conditional_approve) to MANAGER_ADMIN only.
func AuthorizeIssueTransition(current, target domain.IssueStatus, permissions domain.PermissionSet) error {
	if !target.Valid() {
		return domain.ErrInvalidEnumValue
	}
	if current.IsTerminal() {
		return domain.ErrInvalidStatusTransition
	}

	var required string
	switch {
	case current == domain.IssueStatusOpen && target == domain.IssueStatusInProgress:
		required = domain.PermissionIssueTransitionInProgress
	case current == domain.IssueStatusInProgress && target == domain.IssueStatusDone:
		required = domain.PermissionIssueTransitionDone
	case current == domain.IssueStatusDone && target == domain.IssueStatusApproved:
		required = domain.PermissionIssueTransitionApprove
	case current == domain.IssueStatusDone && target == domain.IssueStatusConditionalApproved:
		required = domain.PermissionIssueTransitionConditionalApprove
	default:
		return domain.ErrInvalidStatusTransition
	}

	if !permissions.Has(required) {
		return domain.ErrForbidden
	}
	return nil
}
