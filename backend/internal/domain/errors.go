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
	// ErrSeverityRequired indicates an issue was created without a severity
	// (Decision Log #7).
	ErrSeverityRequired = errors.New("issue severity is required")
	// ErrInvalidEnumValue indicates an enum field carried an unknown value.
	ErrInvalidEnumValue = errors.New("invalid enum value")
	// ErrInvalidStatusTransition indicates a requested status change is not
	// permitted from the current state or for the acting role.
	ErrInvalidStatusTransition = errors.New("invalid status transition")
	// ErrForbidden indicates the acting role may not perform the operation.
	ErrForbidden = errors.New("operation not permitted for role")
)

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
