package domain

import "time"

// ChecklistType mirrors the checklist_type_enum type.
type ChecklistType string

const (
	ChecklistTypeEOL      ChecklistType = "EOL"
	ChecklistTypeShipment ChecklistType = "SHIPMENT"
)

// Valid reports whether the checklist type is a known enum value.
func (t ChecklistType) Valid() bool {
	return t == ChecklistTypeEOL || t == ChecklistTypeShipment
}

// CheckStatus mirrors the check_status_enum type.
type CheckStatus string

const (
	CheckStatusPending       CheckStatus = "PENDING"
	CheckStatusOK            CheckStatus = "OK"
	CheckStatusNotOK         CheckStatus = "NOT_OK"
	CheckStatusRework        CheckStatus = "REWORK"
	CheckStatusConditionalOK CheckStatus = "CONDITIONAL_OK"
)

// Valid reports whether the check status is a known enum value.
func (s CheckStatus) Valid() bool {
	switch s {
	case CheckStatusPending, CheckStatusOK, CheckStatusNotOK,
		CheckStatusRework, CheckStatusConditionalOK:
		return true
	default:
		return false
	}
}

// IsPassing reports whether the status satisfies a quality gate. Per the
// EoL/Shipment hard-block rule (FR-3.5/FR-4.3), only OK and CONDITIONAL_OK
// count as passing.
func (s CheckStatus) IsPassing() bool {
	return s == CheckStatusOK || s == CheckStatusConditionalOK
}

// ChecklistTemplate mirrors the checklist_templates table (multi-template
// architecture, resolved per vehicle_model_id).
type ChecklistTemplate struct {
	ID             int
	VehicleModelID *int
	Type           ChecklistType
	Name           string
	IsActive       bool
}

// ChecklistTemplateItem mirrors the checklist_template_items table.
type ChecklistTemplateItem struct {
	ID         int
	TemplateID int
	ItemNo     int16
	ItemText   string
	StationID  *int
	IsActive   bool
}

// ChecklistProgress mirrors the eol_and_shipment_checklist_progress table: a
// vehicle-scoped evaluation of a single checklist item.
type ChecklistProgress struct {
	ID              int64
	VIN             string
	ChecklistType   ChecklistType
	CheckItemID     int
	CheckStatus     CheckStatus
	CheckerID       *int
	CheckDate       *time.Time
	ReworkDesc      string
	ConditionalDesc string
	RejectedDesc    string
	RelatedIssueID  *int64
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ChecklistItemView is the operator-facing join of template items with
// per-vehicle checklist progress.
type ChecklistItemView struct {
	ItemID          int
	ItemNo          int16
	ItemText        string
	Status          CheckStatus
	ReworkDesc      string
	ConditionalDesc string
	RejectedDesc    string
}
