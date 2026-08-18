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
	// ErrDepotChecklistLocked indicates a Depot-phase EoL item was updated
	// while any Branch-phase item for the same VIN is not yet OK or
	// CONDITIONAL_OK. The message matches the database trigger so API and
	// SQL bypasses surface the same text.
	ErrDepotChecklistLocked = errors.New("cannot update depot-phase EoL items until every branch-phase item is OK or CONDITIONAL_OK")
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

// DepotReleaseBlockedError is returned when depot release is attempted while
// open issues remain (Karar 2, EOL stage 2 hard-block gate). It carries the
// offending issues so the UI can list exactly what blocks the release, the
// same way GateBlockedError does for checklist items.
type DepotReleaseBlockedError struct {
	VIN            string
	BlockingIssues []BlockingIssue
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
