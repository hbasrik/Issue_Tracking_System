package domain

import (
	"errors"
	"fmt"
	"strings"
)

// Sentinel domain errors. These are transport-agnostic; the delivery layer
// maps them to HTTP status codes.
var (
	// ErrNotFound indicates a requested entity does not exist.
	ErrNotFound = errors.New("entity not found")
	// ErrDescriptionRequired indicates a checklist status change is missing a
	// mandatory description (FR-3.3).
	ErrDescriptionRequired = errors.New("description is required for this status")
	// ErrIssueDescriptionRequired indicates an issue create omitted description.
	ErrIssueDescriptionRequired = errors.New("description is required")
	// ErrSolutionDescriptionRequired indicates IN_PROGRESS->DONE omitted the
	// resolution note operators must record when finishing a repair.
	ErrSolutionDescriptionRequired = errors.New("solution_description is required when marking an issue done")
	// ErrSeverityRequired indicates an issue was created without a severity
	// (Decision Log #7).
	ErrSeverityRequired = errors.New("issue severity is required")
	// ErrVINRequired indicates a MANUAL (or other) issue create omitted vin.
	ErrVINRequired = errors.New("vin is required")
	// ErrStationRequired indicates a MANUAL issue create omitted station_id.
	ErrStationRequired = errors.New("station_id is required")
	// ErrIssueTypeRequired indicates a MANUAL issue create omitted issue_type_id.
	ErrIssueTypeRequired = errors.New("issue_type_id is required")
	// ErrInvalidManualSource indicates MANUAL was sent with a station-step or
	// checklist source id (both must be null).
	ErrInvalidManualSource = errors.New("manual issues must not set source_station_step_id or source_check_item_id")
	// ErrUnsupportedImageFormat indicates the upload is HEIC/HEIF (or another
	// container browsers will not render). Rejected rather than stored as a
	// silently broken gallery image.
	ErrUnsupportedImageFormat = errors.New("image format is not displayable in the browser; upload JPEG or PNG")
	// ErrInvalidEnumValue indicates an enum field carried an unknown value.
	ErrInvalidEnumValue = errors.New("invalid enum value")
	// ErrInvalidStatusTransition indicates a requested status change is not
	// permitted from the current state or for the acting role.
	ErrInvalidStatusTransition = errors.New("invalid status transition")
	// ErrForbidden indicates the acting role may not perform the operation.
	ErrForbidden = errors.New("operation not permitted for role")
	// ErrInvalidCredentials indicates a failed authentication attempt. It is
	// deliberately generic so callers cannot distinguish "unknown email" from
	// "wrong password".
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrAccountInactive indicates the credentials were valid but the user
	// account or its assigned role is deactivated. It is distinct from
	// ErrInvalidCredentials so a deactivated login is not mistaken for a
	// password error.
	ErrAccountInactive = errors.New("account or role is inactive")
	// ErrCannotChangeOwnRole indicates a user tried to reassign their own
	// role. Self-lockout is enforced in the usecase so the Users UI cannot
	// be bypassed with a raw PATCH.
	ErrCannotChangeOwnRole = errors.New("you cannot change your own role")
	// ErrCannotDeactivateSelf indicates a user tried to set their own
	// is_active flag to false.
	ErrCannotDeactivateSelf = errors.New("you cannot deactivate your own account")
	// ErrLastActiveManager indicates a role, is_active, or matrix change
	// would leave the system with no active user (or no remaining role)
	// holding admin.manage_users, which would lock everyone out of Users
	// & Roles.
	ErrLastActiveManager = errors.New("cannot remove the last user who can manage users")
	// ErrDepotChecklistLocked indicates a Depot-phase EoL item was updated
	// while any Branch-phase item for the same VIN is not yet OK or
	// CONDITIONAL_OK. The message matches the database trigger so API and
	// SQL bypasses surface the same text.
	ErrDepotChecklistLocked = errors.New("cannot update depot-phase EoL items until every branch-phase item is OK or CONDITIONAL_OK")
	// ErrTemplateItemTextRequired indicates a template item create/update
	// omitted item_text.
	ErrTemplateItemTextRequired = errors.New("item_text is required")
	// ErrTemplateItemTextTooLong indicates item_text exceeds VARCHAR(250).
	ErrTemplateItemTextTooLong = errors.New("item_text must be at most 250 characters")
	// ErrEOLPhaseRequired indicates an EOL template item omitted BRANCH/DEPOT.
	ErrEOLPhaseRequired = errors.New("eol_phase is required for EOL template items")
	// ErrEOLPhaseNotAllowed indicates eol_phase was set on a SHIPMENT/TEST item.
	ErrEOLPhaseNotAllowed = errors.New("eol_phase is only valid on EOL template items")
	// ErrTemplateItemReorderInvalid indicates the reorder payload did not
	// list every item on the template exactly once.
	ErrTemplateItemReorderInvalid = errors.New("item_ids must list every item on the template exactly once")
	// ErrEmailTaken indicates create-user hit the unique email constraint.
	ErrEmailTaken = errors.New("email is already in use")
	// ErrFullNameRequired indicates create-user omitted a non-empty name.
	ErrFullNameRequired = errors.New("full_name is required")
	// ErrEmailRequired indicates create-user omitted a non-empty email.
	ErrEmailRequired = errors.New("email is required")
	// ErrEmailInvalid indicates the address is not a complete email
	// (missing TLD, missing local part, etc.).
	ErrEmailInvalid = errors.New("email address is not valid")
	// ErrPasswordTooShort indicates a new password is under MinPasswordLength.
	ErrPasswordTooShort = errors.New("password must be at least 8 characters")
	// ErrPasswordTooWeak indicates a new password lacks a letter or a digit.
	ErrPasswordTooWeak = errors.New("password must contain at least one letter and one digit")
	// ErrPasswordMismatch indicates new_password and confirmation differ.
	ErrPasswordMismatch = errors.New("new password and confirmation do not match")
	// ErrMustChangePassword indicates the JWT is valid but the user must
	// rotate their password before any other authenticated action.
	ErrMustChangePassword = errors.New("password must be changed before continuing")
	// ErrCannotResetOwnPassword indicates an admin tried the reset-password
	// action on their own account; they must use the change-password flow.
	ErrCannotResetOwnPassword = errors.New("you cannot reset your own password this way")
	// ErrCannotDeleteSelf indicates an admin tried to DELETE their own row.
	ErrCannotDeleteSelf = errors.New("you cannot delete your own account")
)

// DatabaseRejectedError wraps a PostgreSQL RAISE EXCEPTION (SQLSTATE P0001)
// so hard-block gates enforced only in the database still reach the client
// as 409 with the trigger's own message.
type DatabaseRejectedError struct {
	Message string
}

// Error implements the error interface.
func (e *DatabaseRejectedError) Error() string {
	if e == nil || e.Message == "" {
		return "database rejected the change"
	}
	return e.Message
}

// GateBlockedError is returned when a hard-block quality gate (EoL or
// Shipment) is not fully passing and a gate exit / status transition is
// attempted. It carries the offending item IDs so the UI can list exactly
// which items block the transition (FR-3.7).
type GateBlockedError struct {
	ChecklistType   ChecklistType
	BlockingItemIDs []int
}

// Error implements the error interface.
func (e *GateBlockedError) Error() string {
	ids := make([]string, len(e.BlockingItemIDs))
	for i, id := range e.BlockingItemIDs {
		ids[i] = fmt.Sprintf("%d", id)
	}
	return fmt.Sprintf(
		"%s gate blocked: %d item(s) not OK/CONDITIONAL_OK (item ids: %s)",
		e.ChecklistType, len(e.BlockingItemIDs), strings.Join(ids, ", "),
	)
}

// BlockingIssue identifies one issue that holds a hard-block gate shut.
type BlockingIssue struct {
	ID       int64         `json:"id"`
	Status   IssueStatus   `json:"status"`
	Severity IssueSeverity `json:"severity"`
}

// EOLChecklistBlocker names one checklist that still has incomplete items
// before branch shipment or depot release.
type EOLChecklistBlocker struct {
	ChecklistType ChecklistType   `json:"checklist_type"`
	EolPhase      *EOLItemPhase   `json:"eol_phase,omitempty"`
	Remaining     int             `json:"remaining"`
}

// EOLBranchShipBlockedError is returned when branch shipment is attempted
// while any of the three required checklists still has non-passing items.
type EOLBranchShipBlockedError struct {
	VIN      string
	Blockers []EOLChecklistBlocker
}

// Error implements the error interface.
func (e *EOLBranchShipBlockedError) Error() string {
	return fmt.Sprintf(
		"branch ship blocked for %s: %d checklist(s) incomplete",
		e.VIN, len(e.Blockers),
	)
}

// DepotReleaseBlockedError is returned when depot release is attempted while
// open issues remain or depot-phase EoL items are incomplete (Karar 2, EOL
// stage 2 hard-block gate). It carries the offending issues so the UI can list
// exactly what blocks the release, the same way GateBlockedError does for
// checklist items.
type DepotReleaseBlockedError struct {
	VIN                 string
	BlockingIssues      []BlockingIssue
	DepotItemsRemaining int `json:"depot_items_remaining,omitempty"`
}

// Error implements the error interface.
func (e *DepotReleaseBlockedError) Error() string {
	ids := make([]string, len(e.BlockingIssues))
	for i, issue := range e.BlockingIssues {
		ids[i] = fmt.Sprintf("%d", issue.ID)
	}
	return fmt.Sprintf(
		"depot release blocked for %s: %d open issue(s) remain (issue ids: %s)",
		e.VIN, len(e.BlockingIssues), strings.Join(ids, ", "),
	)
}

// TemplateItemInUseError is returned when DELETE is attempted on a catalogue
// item that already has checklist_item_progress rows. Soft-deactivate instead.
type TemplateItemInUseError struct {
	VehicleCount int
}

// Error implements the error interface.
func (e *TemplateItemInUseError) Error() string {
	n := 0
	if e != nil {
		n = e.VehicleCount
	}
	return fmt.Sprintf("bu madde %d araçta kullanılmış, silinemez — pasife çekebilirsiniz", n)
}

// UserInUseError is returned when DELETE is attempted on a user who still
// appears on shop-floor, workflow, work-event audit, or media rows.
// Deactivate instead.
type UserInUseError struct {
	ReferenceCount int
}

func (e *UserInUseError) Error() string {
	n := 0
	if e != nil {
		n = e.ReferenceCount
	}
	if n <= 0 {
		return "bu kullanıcı kayıtlarda kullanılmış, silinemez — pasife çekebilirsiniz"
	}
	return fmt.Sprintf("bu kullanıcı %d kayıtta kullanılmış, silinemez — pasife çekebilirsiniz", n)
}
