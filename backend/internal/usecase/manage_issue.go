package usecase

import (
	"context"
	"fmt"
	"strings"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// vehicleByVIN looks up a vehicle for station/classification rules on create.
type vehicleByVIN interface {
	GetByVIN(ctx context.Context, vin string) (*domain.Vehicle, error)
}

// defectByID loads catalogue rows used when classifying a new issue.
type defectByID interface {
	GetPart(ctx context.Context, id int) (*domain.DefectPart, error)
	GetType(ctx context.Context, id int) (*domain.DefectType, error)
	GetProcess(ctx context.Context, id int) (*domain.DefectProcess, error)
}

// IssueManager handles the issue lifecycle: OPEN -> IN_PROGRESS -> DONE ->
// APPROVED or CONDITIONAL_APPROVED.
type IssueManager struct {
	issues   repository.IssueRepository
	audit    repository.AuditRepository
	uow      repository.TransactionManager
	vehicles vehicleByVIN
	catalog  defectByID
}

// NewIssueManager wires the usecase with its repositories.
func NewIssueManager(
	issues repository.IssueRepository,
	audit repository.AuditRepository,
	uow repository.TransactionManager,
	vehicles vehicleByVIN,
	catalog defectByID,
) *IssueManager {
	return &IssueManager{issues: issues, audit: audit, uow: uow, vehicles: vehicles, catalog: catalog}
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
	DefectPartID        *int
	DefectTypeID        *int
	CustomPartName      string
	CustomDefectName    string
}

// Create validates and inserts a new issue. Severity is mandatory
// (Decision Log #7) and new issues always start in the OPEN state.
//
// MANUAL sources are standalone operator reports: vin, issue_type_id,
// severity, description, and defect classification are required.
// Station is required only when the vehicle is IN_PRODUCTION.
//
// Checklist / station-step linked sources also require classification —
// NOT_OK does not auto-create issues; the operator already fills a form.
func (m *IssueManager) Create(ctx context.Context, in CreateIssueInput) (*domain.Issue, error) {
	if !in.SourceType.Valid() {
		return nil, domain.ErrInvalidEnumValue
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

	vin := strings.TrimSpace(in.VIN)
	if vin == "" {
		return nil, domain.ErrVINRequired
	}

	if in.SourceType == domain.IssueSourceManual {
		if in.IssueTypeID == nil {
			return nil, domain.ErrIssueTypeRequired
		}
		if in.SourceStationStepID != nil || in.SourceCheckItemID != nil {
			return nil, domain.ErrInvalidManualSource
		}
	}

	vehicle, err := m.vehicles.GetByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	stationID := in.StationID
	if domain.VehicleRequiresIssueStation(vehicle.CurrentGlobalStatus) {
		if stationID == nil {
			return nil, domain.ErrStationRequired
		}
	} else {
		// Off-line vehicles: station is not asked; ignore any client value.
		stationID = nil
	}

	if in.DefectPartID == nil {
		return nil, domain.ErrDefectPartRequired
	}
	if in.DefectTypeID == nil {
		return nil, domain.ErrDefectTypeRequired
	}

	part, err := m.catalog.GetPart(ctx, *in.DefectPartID)
	if err != nil {
		return nil, err
	}
	if !part.IsActive {
		return nil, domain.ErrDefectCatalogueInactive
	}
	typ, err := m.catalog.GetType(ctx, *in.DefectTypeID)
	if err != nil {
		return nil, err
	}
	if !typ.IsActive {
		return nil, domain.ErrDefectCatalogueInactive
	}

	customPart := strings.TrimSpace(in.CustomPartName)
	customDefect := strings.TrimSpace(in.CustomDefectName)
	if domain.IsOtherPart(part.Code) {
		if customPart == "" {
			return nil, domain.ErrCustomPartNameRequired
		}
	} else {
		customPart = ""
	}
	if domain.IsOtherType(typ.Code) {
		if customDefect == "" {
			return nil, domain.ErrCustomDefectNameRequired
		}
	} else {
		customDefect = ""
	}

	code := domain.FormatDefectCode(part.Code, typ.Code)
	partID := part.ID
	typeID := typ.ID

	issue := &domain.Issue{
		VIN:                  vin,
		SourceType:           in.SourceType,
		SourceStationStepID:  in.SourceStationStepID,
		SourceCheckItemID:    in.SourceCheckItemID,
		StationID:            stationID,
		IssueTypeID:          in.IssueTypeID,
		Severity:             in.Severity,
		Description:          strings.TrimSpace(in.Description),
		PictureURL:           in.PictureURL,
		Status:               domain.IssueStatusOpen,
		IssueReporterID:      in.ReporterID,
		DefectPartID:         &partID,
		DefectTypeID:         &typeID,
		ResponsibleProcessID: typ.DefaultProcessID,
		CustomPartName:       customPart,
		CustomDefectName:     customDefect,
		DefectCode:           code,
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
		items = []domain.IssueStatusHistoryEntry{}
	}
	return items, nil
}

// UpdateClassificationInput corrects or backfills defect classification on an
// existing issue (including legacy unclassified rows).
type UpdateClassificationInput struct {
	IssueID              int64
	ActorID              int
	ActorPermissions     domain.PermissionSet
	DefectPartID         *int
	DefectTypeID         *int
	ResponsibleProcessID *int
	CustomPartName       string
	CustomDefectName     string
}

// UpdateClassification validates catalogue picks, recomputes defect_code, and
// writes an ISSUE_CLASSIFICATION_CHANGE audit row with field-level before/after.
// Closed issues remain editable (labelling, not a quality decision).
func (m *IssueManager) UpdateClassification(ctx context.Context, in UpdateClassificationInput) (*domain.Issue, error) {
	issue, err := m.issues.GetByID(ctx, in.IssueID)
	if err != nil {
		return nil, err
	}
	if !domain.CanEditIssueClassification(issue, in.ActorID, in.ActorPermissions) {
		return nil, domain.ErrForbidden
	}
	if in.DefectPartID == nil {
		return nil, domain.ErrDefectPartRequired
	}
	if in.DefectTypeID == nil {
		return nil, domain.ErrDefectTypeRequired
	}
	if in.ResponsibleProcessID == nil {
		return nil, domain.ErrDefectProcessRequired
	}

	part, err := m.catalog.GetPart(ctx, *in.DefectPartID)
	if err != nil {
		return nil, err
	}
	if !part.IsActive {
		return nil, domain.ErrDefectCatalogueInactive
	}
	typ, err := m.catalog.GetType(ctx, *in.DefectTypeID)
	if err != nil {
		return nil, err
	}
	if !typ.IsActive {
		return nil, domain.ErrDefectCatalogueInactive
	}
	proc, err := m.catalog.GetProcess(ctx, *in.ResponsibleProcessID)
	if err != nil {
		return nil, err
	}
	if !proc.IsActive {
		return nil, domain.ErrDefectProcessInactive
	}

	customPart := strings.TrimSpace(in.CustomPartName)
	customDefect := strings.TrimSpace(in.CustomDefectName)
	if domain.IsOtherPart(part.Code) {
		if customPart == "" {
			return nil, domain.ErrCustomPartNameRequired
		}
	} else {
		customPart = ""
	}
	if domain.IsOtherType(typ.Code) {
		if customDefect == "" {
			return nil, domain.ErrCustomDefectNameRequired
		}
	} else {
		customDefect = ""
	}

	code := domain.FormatDefectCode(part.Code, typ.Code)
	partID := part.ID
	typeID := typ.ID
	processID := proc.ID

	oldSummary := classificationAuditSummary(issue)
	fields := classificationFieldDiffs(issue, &partID, &typeID, &processID, customPart, customDefect, code)

	performedBy := in.ActorID
	err = m.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := m.issues.UpdateClassification(
			txCtx, in.IssueID, &partID, &typeID, &processID, customPart, customDefect, code,
		); err != nil {
			return err
		}
		return m.audit.Append(txCtx, domain.AuditLog{
			VIN:         issue.VIN,
			EventType:   domain.AuditEventIssueClassification,
			OldValue:    oldSummary,
			NewValue:    classificationAuditSummaryFrom(&partID, &typeID, &processID, customPart, customDefect, code),
			StationID:   issue.StationID,
			PerformedBy: &performedBy,
			Metadata: map[string]any{
				"issue_id": in.IssueID,
				"fields":   fields,
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return m.issues.GetByID(ctx, in.IssueID)
}

func classificationAuditSummary(issue *domain.Issue) string {
	return classificationAuditSummaryFrom(
		issue.DefectPartID,
		issue.DefectTypeID,
		issue.ResponsibleProcessID,
		issue.CustomPartName,
		issue.CustomDefectName,
		issue.DefectCode,
	)
}

func classificationAuditSummaryFrom(partID, typeID, processID *int, customPart, customDefect, code string) string {
	pid, tid, prid := "null", "null", "null"
	if partID != nil {
		pid = fmt.Sprintf("%d", *partID)
	}
	if typeID != nil {
		tid = fmt.Sprintf("%d", *typeID)
	}
	if processID != nil {
		prid = fmt.Sprintf("%d", *processID)
	}
	return fmt.Sprintf(
		"code=%s|part=%s|type=%s|process=%s|custom_part=%s|custom_defect=%s",
		strings.TrimSpace(code), pid, tid, prid, strings.TrimSpace(customPart), strings.TrimSpace(customDefect),
	)
}

func classificationFieldDiffs(
	issue *domain.Issue,
	partID, typeID, processID *int,
	customPart, customDefect, code string,
) map[string]any {
	out := map[string]any{}
	add := func(key string, from, to any) {
		if fmt.Sprint(from) != fmt.Sprint(to) {
			out[key] = map[string]any{"from": from, "to": to}
		}
	}
	add("defect_part_id", ptrOrNil(issue.DefectPartID), ptrOrNil(partID))
	add("defect_type_id", ptrOrNil(issue.DefectTypeID), ptrOrNil(typeID))
	add("responsible_process_id", ptrOrNil(issue.ResponsibleProcessID), ptrOrNil(processID))
	add("custom_part_name", strings.TrimSpace(issue.CustomPartName), strings.TrimSpace(customPart))
	add("custom_defect_name", strings.TrimSpace(issue.CustomDefectName), strings.TrimSpace(customDefect))
	add("defect_code", strings.TrimSpace(issue.DefectCode), strings.TrimSpace(code))
	return out
}

func ptrOrNil(p *int) any {
	if p == nil {
		return nil
	}
	return *p
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

// UndoApproval reverts APPROVED or CONDITIONAL_APPROVED back to DONE via a
// dedicated path (not AuthorizeIssueTransition). It clears the matching
// approval stamps so the issue again awaits quality sign-off, and writes an
// ISSUE_STATUS_CHANGE audit row with metadata action=approval_undone.
//
// Allowed actors: the user who recorded the approval, or anyone holding the
// same issue.transition.approve / issue.transition.conditional_approve
// permission that would have been required to grant it.
func (m *IssueManager) UndoApproval(ctx context.Context, id int64, actorID int, actorPermissions domain.PermissionSet) error {
	issue, err := m.issues.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if err := AuthorizeApprovalUndo(issue, actorID, actorPermissions); err != nil {
		return err
	}

	from := issue.Status
	performedBy := actorID
	return m.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := m.issues.RevertApproval(txCtx, id); err != nil {
			return err
		}
		return m.audit.Append(txCtx, domain.AuditLog{
			VIN:         issue.VIN,
			EventType:   domain.AuditEventIssueStatusChange,
			OldValue:    string(from),
			NewValue:    string(domain.IssueStatusDone),
			StationID:   issue.StationID,
			PerformedBy: &performedBy,
			Metadata: map[string]any{
				"issue_id": id,
				"action":   "approval_undone",
				"undo":     true,
			},
		})
	})
}

// AuthorizeApprovalUndo validates who may reverse a quality decision.
func AuthorizeApprovalUndo(issue *domain.Issue, actorID int, permissions domain.PermissionSet) error {
	if issue == nil {
		return domain.ErrNotFound
	}
	switch issue.Status {
	case domain.IssueStatusApproved:
		if issue.ApproveReporterID != nil && *issue.ApproveReporterID == actorID {
			return nil
		}
		if permissions.Has(domain.PermissionIssueTransitionApprove) {
			return nil
		}
		return domain.ErrForbidden
	case domain.IssueStatusConditionalApproved:
		if issue.ConditionalApproveReporterID != nil && *issue.ConditionalApproveReporterID == actorID {
			return nil
		}
		if permissions.Has(domain.PermissionIssueTransitionConditionalApprove) {
			return nil
		}
		return domain.ErrForbidden
	default:
		return domain.ErrInvalidStatusTransition
	}
}
