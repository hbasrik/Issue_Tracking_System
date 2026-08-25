package usecase

import (
	"context"
	"strings"

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
//
// MANUAL sources are standalone operator reports: vin, station_id,
// issue_type_id, severity, and description are all required, and both
// source_station_step_id and source_check_item_id must be unset.
func (m *IssueManager) Create(ctx context.Context, in CreateIssueInput) (*domain.Issue, error) {
	if !in.SourceType.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	if in.SourceType == domain.IssueSourceManual {
		if strings.TrimSpace(in.VIN) == "" {
			return nil, domain.ErrVINRequired
		}
		if in.StationID == nil {
			return nil, domain.ErrStationRequired
		}
		if in.IssueTypeID == nil {
			return nil, domain.ErrIssueTypeRequired
		}
		if in.Severity == "" {
			return nil, domain.ErrSeverityRequired
		}
		if !in.Severity.Valid() {
			return nil, domain.ErrInvalidEnumValue
		}
		if strings.TrimSpace(in.Description) == "" {
			return nil, domain.ErrIssueDescriptionRequired
		}
		if in.SourceStationStepID != nil || in.SourceCheckItemID != nil {
			return nil, domain.ErrInvalidManualSource
		}
	} else {
		if in.Severity == "" {
			return nil, domain.ErrSeverityRequired
		}
		if !in.Severity.Valid() {
			return nil, domain.ErrInvalidEnumValue
		}
		if strings.TrimSpace(in.Description) == "" {
			return nil, domain.ErrIssueDescriptionRequired
		}
	}

	issue := &domain.Issue{
		VIN:                 strings.TrimSpace(in.VIN),
		SourceType:          in.SourceType,
		SourceStationStepID: in.SourceStationStepID,
		SourceCheckItemID:   in.SourceCheckItemID,
		StationID:           in.StationID,
		IssueTypeID:         in.IssueTypeID,
		Severity:            in.Severity,
		Description:         strings.TrimSpace(in.Description),
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

// ListIssueTypes returns the issue_types catalogue for the Hata Bildir picker.
func (m *IssueManager) ListIssueTypes(ctx context.Context) ([]domain.IssueType, error) {
	return m.issues.ListIssueTypes(ctx)
}

// ListForUser returns issues where the user is a reporter at any lifecycle stage.
func (m *IssueManager) ListForUser(ctx context.Context, userID int, status *domain.IssueStatus) ([]domain.Issue, error) {
	if status != nil && !status.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	return m.issues.ListForUser(ctx, userID, status)
}

// ListAll returns every issue for the web Issues queue and mobile Hatalar list.
func (m *IssueManager) ListAll(ctx context.Context, status *domain.IssueStatus) ([]domain.Issue, error) {
	if status != nil && !status.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	return m.issues.ListAll(ctx, status)
}

// ListByVIN returns every issue for a vehicle (Vehicle Detail Issues tab).
func (m *IssueManager) ListByVIN(ctx context.Context, vin string, status *domain.IssueStatus) ([]domain.Issue, error) {
	if vin == "" {
		return nil, domain.ErrNotFound
	}
	if status != nil && !status.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}
	return m.issues.ListByVIN(ctx, vin, status)
}

// GetByID returns a single issue by id (any authenticated caller).
func (m *IssueManager) GetByID(ctx context.Context, id int64) (*domain.Issue, error) {
	return m.issues.GetByID(ctx, id)
}

// ListStatusHistory returns chronological ISSUE_STATUS_CHANGE events for the
// issue (Karar 7). Missing issues 404 so callers do not see an empty trail
// for a bogus id.
func (m *IssueManager) ListStatusHistory(ctx context.Context, id int64) ([]domain.IssueStatusHistoryEntry, error) {
	if _, err := m.issues.GetByID(ctx, id); err != nil {
		return nil, err
	}
	items, err := m.audit.ListIssueStatusHistory(ctx, id)
	if err != nil {
		return nil, err
	}
	if items == nil {
		return []domain.IssueStatusHistoryEntry{}, nil
	}
	return items, nil
}

// TransitionStatus moves an issue to a new status, enforcing both the valid
// state machine and permission-based authorization. It records an
// ISSUE_STATUS_CHANGE audit entry attributed to actorID so every state change
// is traceable to the user who performed it (FR-1.2).
//
// When target is DONE, solutionDescription is required (non-empty after trim)
// and persisted on issue_list.solution_description. Other transitions ignore it.
func (m *IssueManager) TransitionStatus(ctx context.Context, id int64, target domain.IssueStatus, actorID int, actorPermissions domain.PermissionSet, solutionDescription string) error {
	issue, err := m.issues.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if err := AuthorizeIssueTransition(issue.Status, target, actorPermissions); err != nil {
		return err
	}
	solution := strings.TrimSpace(solutionDescription)
	if target == domain.IssueStatusDone && solution == "" {
		return domain.ErrSolutionDescriptionRequired
	}

	performedBy := actorID
	return m.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := m.issues.UpdateStatus(txCtx, id, target, actorID, solution); err != nil {
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
// permission depends on the target status. OPEN→IN_PROGRESS and
// IN_PROGRESS→DONE share issue.transition.progress; quality sign-off uses
// issue.transition.approve / issue.transition.conditional_approve. Which
// roles hold those codes lives in role_permissions, not in this function.
func AuthorizeIssueTransition(current, target domain.IssueStatus, permissions domain.PermissionSet) error {
	if !target.Valid() {
		return domain.ErrInvalidEnumValue
	}
	if current.IsTerminal() {
		return domain.ErrInvalidStatusTransition
	}

	var required string
	switch {
	case current == domain.IssueStatusOpen && target == domain.IssueStatusInProgress,
		current == domain.IssueStatusInProgress && target == domain.IssueStatusDone:
		required = domain.PermissionIssueTransitionProgress
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
